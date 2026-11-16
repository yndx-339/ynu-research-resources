#!/usr/bin/env node
// 只读抓取云大图书馆数据库导航五个分类的清单，解码 /redirect 里的真实目标地址。
// 复用一个 lib.ynu.edu.cn 标签，结束后停在该标签的「全部数据库」页。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9333';
const VP = '1-d14c-1e30-databaseguide-b833-ec4e';
const ROOT = 'https://lib.ynu.edu.cn/databaseguide/web_dataBaseHome1';
const PAGES = [
  { key: 'all', label: '全部数据库', url: `${ROOT}?languageid=&vp=${VP}&sorttype=3&keywords=` },
  { key: 'cn', label: '中文数据库', url: `${ROOT}?languageid=1&vp=${VP}&sorttype=1&purchasetype=&keywords=` },
  { key: 'en', label: '外文数据库', url: `${ROOT}?languageid=2&vp=${VP}&sorttype=1&purchasetype=&keywords=` },
  { key: 'trial', label: '试用数据库', url: `${ROOT}?languageid=&vp=${VP}&sorttype=1&purchasetype=2&keywords=` },
  { key: 'oa', label: '开放获取资源', url: `${ROOT}?languageid=&vp=${VP}&sorttype=1&purchasetype=4&keywords=` },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', () => rej(new Error('ws error')));
    });
    this.ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.rej(new Error(JSON.stringify(m.error)));
        else p.res(m.result);
      }
    });
  }
  send(method, params = {}, timeout = 25000) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout: ' + method)); }
      }, timeout);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

const EXPR = `JSON.stringify((() => {
  let txt = document.body ? document.body.innerText : '';
  for (const f of document.querySelectorAll('iframe')) {
    try {
      if (f.contentDocument && f.contentDocument.body) {
        const t = f.contentDocument.body.innerText;
        if (t && t.trim()) txt += '\\n[IFRAME] ' + t.slice(0, 8000);
      }
    } catch (e) {}
  }
  const seen = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a')) {
    const t = (a.innerText || a.textContent || '').trim().replace(/\\s+/g, ' ');
    if (!t || t.length > 80 || seen.has(t + '|' + a.href)) continue;
    seen.add(t + '|' + a.href);
    links.push({ text: t, href: a.href });
  }
  const uniq = (arr) => [...new Set(arr)].filter((x) => x && x.length < 100).slice(0, 200);
  return {
    title: document.title, url: location.href,
    textLen: txt.length, text: txt.slice(0, 16000),
    linkCount: links.length, links: links.slice(0, 400),
    titles: uniq([...document.querySelectorAll('[title]')].map((e) => (e.getAttribute('title') || '').trim())),
    alts: uniq([...document.querySelectorAll('img[alt]')].map((e) => (e.getAttribute('alt') || '').trim()))
  };
})())`;

function decodeRedirect(href) {
  const m = href.match(/[?&]url=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8'));
  } catch { return null; }
}

const list = (await (await fetch(`${BASE}/json/list`)).json()).filter((t) => t.type === 'page');
let tab = list.find((t) => t.url.includes('lib.ynu.edu.cn'));
if (!tab) {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(PAGES[0].url)}`, { method: 'PUT' });
  tab = await r.json();
}
const c = new CDP(tab.webSocketDebuggerUrl);
await c.ready;
await c.send('Page.enable');

const results = [];
for (const p of PAGES) {
  await c.send('Page.navigate', { url: p.url });
  await sleep(6000);
  try {
    const { result, exceptionDetails } = await c.send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 200));
    const d = JSON.parse(result.value);
    const resources = d.links
      .filter((l) => l.href.includes('/redirect?'))
      .map((l) => ({ name: l.text, target: decodeRedirect(l.href) }))
      .filter((x) => x.target);
    results.push({
      key: p.key, label: p.label, title: d.title, url: d.url,
      textLen: d.textLen, text: d.text, linkCount: d.linkCount,
      titles: d.titles, alts: d.alts,
      resourceCount: resources.length, resources,
    });
    console.error(`[done] ${p.key} textLen=${d.textLen} resources=${resources.length}`);
  } catch (e) {
    results.push({ key: p.key, label: p.label, error: String(e.message || e).slice(0, 200) });
    console.error(`[fail] ${p.key} ${e.message}`);
  }
}
await c.send('Page.navigate', { url: PAGES[0].url });
c.close();
console.log(JSON.stringify(results, null, 2));
