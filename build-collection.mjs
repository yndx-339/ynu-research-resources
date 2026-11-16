#!/usr/bin/env node
// 把 ynu-db-list.csv 的 193 条订购库 + 实测补充资源，整理成科研查询集合。
// 产出：科研资源库集合.html（离线交互检索页）与 科研资源库集合.csv（结构化数据表）。
import fs from 'node:fs';

const LIB_HOME = 'https://lib.ynu.edu.cn/databaseguide/web_dataBaseHome1?languageid=&vp=1-d14c-1e30-databaseguide-b833-ec4e&sorttype=3&keywords=';
const PROXY = 'https://libresource.ynu.yitlink.com:8081/go?url=';

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 && r[1]);
}

const TOPIC_RULES = [
  ['共同体意识·民族理论', /中华民族共同体|铸牢|民族理论|民族政策|民族历史|民族团结|正确民族观|民族艺术|民族教育|民族文化|民族事务|习近平文化思想/],
  ['边疆治理·周边研究', /边疆|一带一路|东南亚|缅甸|方志|边境|周边|台湾联合百科/],
  ['政策·理论话语', /中国共产党|思想理论|马克思|习近平|党政|党建|课程思政|智慧党建|人大复印|国家哲学社会科学|皮书|国研网|网上报告厅|政策|文化产业/],
  ['史料·古籍', /古籍|方志|近代|晚清|民国|报刊|金石|史料|档案|历史|故纸|书同文|中国基本古籍|中国近代/],
  ['法学·制度', /法律|法宝|司法|案例|法学|法规|条例|Westlaw|HeinOnline|威科|法律资源|实证研究平台/],
  ['引文·评价', /CSSCI|CSCD|引文|索引|Web of Science|Scopus|JCR|ESI|InCites|SSCI|A&HCI|SCIE|EI（|分区表|引证|Medline|OCLC|CPCI|CCR\/IC|WOSRA/],
  ['图书·专著', /图书|电子书|读秀|超星|Apabi|书同文|金图|E-books|Books|爱学术|书递|QQ阅读|博看|数字图书馆|De Gruyter|World Scientific/],
  ['期刊·全文', /期刊|全文|电子期刊|Journals|Press|ScienceDirect|Springer|Nature|Wiley|IEEE|Cambridge|SAGE|Taylor|Emerald|EBSCO|Cell|Frontiers|PNAS|J-STAGE|SciOpen|学报/],
  ['学位论文', /学位论文|博硕|PQDT|硕士|博士/],
  ['数据·统计', /大数据|统计数据|经济社会|海关|国研网|微谱|Innography|案例库|数据平台|SciFinder|统计年鉴/],
  ['开放获取', /开放获取|开放存取|DOAJ|OpenDOAR|Open Access|HighWire|J-STAGE|SciOpen|中国科技论文在线|OARL|OpenAccess|Socolar|常用OA|OA仓储/],
  ['工具·学习', /EndNote|NoteExpress|考试|学习|新东方|外语|视频|课程|培训|考研|公考|多媒体|讲座|JoVE|阅读|App|管理平台|发现系统|统一检索|资源发现|智能体|导航|考试网|E线图情/],
  ['理工农医', /物理|化学|数学|生物|医学|工程|光学|农|人体|解剖|专利|标准|冷泉港|拟南芥|可视人体|IOP|AIP|SIAM|APS|RSC|ACS|ACM|IEEE|Innography|数学与统计学院/],
];

function topicsOf(name) {
  const hits = TOPIC_RULES.filter(([, re]) => re.test(name)).map(([t]) => t);
  if (!hits.length) hits.push('期刊·全文');
  return hits.slice(0, 3);
}

function useOf(name, topics) {
  if (/铸牢|中华民族共同体|专题库/.test(name)) return '查专题文献与政策话语';
  if (/学位论文|博硕|PQDT|硕士|博士/.test(name)) return '查学位论文';
  if (/EndNote|NoteExpress/.test(name)) return '文献管理';
  if (/CSSCI|CSCD|引文|索引|Web of Science|Scopus|JCR|ESI|InCites|SSCI|A&HCI|SCIE|EI（|分区表|引证|CPCI/.test(name)) return '查题录与引证';
  if (/古籍|方志|近代|晚清|民国|报刊|金石|史料|故纸|书同文/.test(name)) return '查史料与古籍';
  if (/法律|法宝|司法|法规|Westlaw|HeinOnline|威科/.test(name)) return '查法规与案例';
  if (/海关|经济社会|统计|大数据|国研网|微谱|数据平台/.test(name)) return '查数据与统计';
  if (/考试|学习|新东方|外语|视频|课程|考研|公考|培训|多媒体|JoVE/.test(name)) return '学习与考试';
  if (/图书|电子书|读秀|超星|Apabi|书同文|金图|E-books|Books|爱学术|书递|QQ阅读|博看/.test(name)) return '查专著与图书';
  if (topics.includes('开放获取')) return '开放获取全文';
  return '查期刊全文';
}

function statusOf(name, category) {
  if (category === '试用数据库' || /试用/.test(name)) return '试用';
  if (/开放获取|开放存取|DOAJ|OpenDOAR|Open Access|OA资源|常用OA|中国科技论文在线|J-STAGE|SciOpen|HighWire|OARL/.test(name)) return '免费/开放获取';
  if (/自建|云南大学博硕|新生入馆培训|本地镜像/.test(name)) return '自建/镜像';
  if (/捐赠使用|出资购买|订购|联合购买/.test(name)) return '订购（院系或联合出资）';
  return '订购';
}

const CORE = new Set([
  'CNKI中国知网', '读秀学术搜索', '中文社会科学引文索引（CSSCI）',
  '《铸牢中华民族共同体意识数据库》', '古代边疆研究信息服务平台',
  '一带一路数据库', '东南亚&缅甸研究专题电子图书',
  '中国共产党思想理论资源数据库', '人大复印报刊资料全文数据库',
  '国家哲学社会科学学术期刊数据库', '皮书数据库',
  'CNKI中国引文数据库', '中国科学引文数据库（CSCD）',
  'Web of Science', 'Scopus索引摘要数据库',
  'Elsevier ScienceDirect 电子期刊全文数据库', 'Springer期刊数据库',
  'Nature电子期刊系列', 'Wiley 期刊数据库', 'IEEE Xplore Digital Library',
  '中国数字方志库', '中国基本古籍库-本地镜像', '晚清和民国时期期刊全文数据库',
  '北大法宝数据库（法学院订购）', '中国法律资源库（法学院出资购买）',
  '万方数据知识服务平台', '维普中文期刊数据库', '超星数字图书馆',
]);

function starsOf(name, topics, category) {
  if (CORE.has(name)) return 3;
  if (topics.includes('共同体意识·民族理论') || topics.includes('边疆治理·周边研究')) return 3;
  if (topics.includes('政策·理论话语') || topics.includes('史料·古籍') || topics.includes('引文·评价')) return 2;
  if (topics.includes('理工农医') && topics.length === 1) return 1;
  if (/考试网|考研|公考|新东方|设计|油画|心理|3D解剖|可视人体|中医|医学网|光学期刊|冷泉港|拟南芥|海关|微谱|专利/.test(name)) return 1;
  return 2;
}

const DIRECT = {
  'CNKI中国知网': 'https://www.cnki.net/',
  '读秀学术搜索': 'https://www.duxiu.com/',
  'Elsevier ScienceDirect 电子期刊全文数据库': 'https://www.sciencedirect.com/',
  'IEEE Xplore Digital Library': 'https://ieeexplore.ieee.org/',
  'Wiley 期刊数据库': 'https://onlinelibrary.wiley.com/',
  'Springer期刊数据库': 'https://link.springer.com/',
  'Nature电子期刊系列': 'https://www.nature.com/',
  '《铸牢中华民族共同体意识数据库》': 'http://zlzhmzgttys.cncpress.cn/fg',
  'Web of Science': 'https://www.webofscience.com/',
  'Scopus索引摘要数据库': 'https://www.scopus.com/',
  'EBSCO ASU&BSU 综合学科全文数据库': 'https://search.ebscohost.com/',
  '中国知网': 'https://www.cnki.net/',
};

const NOTES = {
  '《铸牢中华民族共同体意识数据库》': '试用至 2026-12-31；国家民委审批、财政部立项、中国民族文化出版社建，含民族政策/理论/历史专题库。与课题高度对口，尽快用。',
  'CNKI中国知网': '机构 IP 直通，顶部显示「云南大学图书馆」；检索默认近五年 + CSSCI/北大核心 + 学术期刊。',
  '读秀学术搜索': 'IP 直通（?lsu=ip）；图像型阅读器，只能截图识别；可在校内 IP 办「个人认证」供校外使用。',
  '中文社会科学引文索引（CSSCI）': '核来源期刊与收录情况，投稿与综述筛选用。',
  '古代边疆研究信息服务平台': '边疆治理专题，优先试检。',
  '一带一路数据库': '边疆与周边研究专题。',
  '东南亚&缅甸研究专题电子图书': '周边与跨境研究。',
  'Elsevier ScienceDirect 电子期刊全文数据库': '已实测显示「Brought to you by: Yunnan University / LeapSpace」。',
  'IEEE Xplore Digital Library': '已实测显示机构标识；机构信息在首页正文后段。',
  'Wiley 期刊数据库': '已实测首页显示机构标识。',
  'Springer期刊数据库': '图书馆订购清单确认在订；出版社首页机构标识被 cookie 弹窗遮挡，不代表无权限。',
  'Nature电子期刊系列': '图书馆订购清单确认在订；另有《自然》大师课堂在线课程平台。',
};

function accessOf(name, category) {
  if (category === '试用数据库') return '试用入口（校内 IP 或校外代理）';
  if (DIRECT[name]) return 'IP 直通（已实测）';
  if (/远程访问|镜像访问|本地镜像/.test(name)) return '远程或镜像访问';
  return '校园网 IP 或图书馆详情页';
}

const rows = parseCSV(fs.readFileSync('ynu-db-list.csv', 'utf8'));
const items = rows.slice(1).map(([category, name], i) => {
  const n = name.trim();
  const topics = topicsOf(n);
  return {
    id: i + 1, name: n, source: '图书馆订购清单', category,
    lang: category === '外文数据库' ? '外文' : category === '中文数据库' ? '中文' : '中文为主',
    status: statusOf(n, category), topics, use: useOf(n, topics),
    stars: starsOf(n, topics, category), access: accessOf(n, category),
    url: DIRECT[n] || '', note: NOTES[n] || '',
  };
});

const EXTRA = [
  { name: 'CNKI AI 新一代生成式知识服务平台', category: '实测补充', lang: '中文', source: '本机实测',
    topics: ['引文·评价', '共同体意识·民族理论'], use: '语义检索·查全率补漏', stars: 3,
    status: '机构+个人账号已登录', access: 'IP 直通（已实测）', url: 'https://ai.cnki.net/home',
    note: '增强检索（语义）与 kns8s 主题检索实测题录零重合，交叉议题综述必须两路合用。提交知识问答/辅助创作会在账号留记录，须先征得同意。' },
  { name: '汇雅书城（掌阅机构版）', category: '实测补充', lang: '中文', source: '本机实测',
    topics: ['图书·专著'], use: '查专著与图书', stars: 3,
    status: '机构账号已登录', access: 'IP 直通（已实测）',
    url: 'https://se.zhangyue.com/channel/index?appId=8d4491ad',
    note: '页面标题「云南大学图书馆」，正文为文本型 EPUB 可逐章带读；「专属免费」标识即机构授权可读。' },
  { name: '云大图书馆数据库导航（权威订购清单）', category: '实测补充', lang: '中文', source: '本机实测',
    topics: ['工具·学习'], use: '检索发现', stars: 3,
    status: '公开', access: 'IP 直通（已实测）', url: LIB_HOME,
    note: '判断某库订没订以此页为准；可按首字母/资源类型/学科/采购类型/语种浏览，侧栏含「校外访问」说明。' },
  { name: '校外访问代理（yitlink）', category: '实测补充', lang: '中文', source: '图书馆详情页',
    topics: ['工具·学习'], use: '校外访问入口', stars: 3,
    status: '需校内账号', access: '校外网络', url: '',
    note: '代理模板：' + PROXY + '<目标URL>；出校园网后走这条，或读秀办个人认证。' },
];
EXTRA.forEach((e, k) => items.push({ id: items.length + 1, ...e }));

const catOrder = { '中文数据库': 1, '外文数据库': 2, '试用数据库': 3, '实测补充': 0 };
items.sort((a, b) => b.stars - a.stars || (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9) || a.name.localeCompare(b.name, 'zh'));
items.forEach((it, i) => { it.id = i + 1; });

const csvHeader = ['序号', '库名/平台', '来源', '分类', '语种', '状态', '主题标签', '检索用途', '推荐度', '访问方式', '直达链接', '备注'];
const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const csvOut = [csvHeader, ...items.map((it) => [
  it.id, it.name, it.source, it.category, it.lang, it.status,
  it.topics.join('；'), it.use, '★'.repeat(it.stars), it.access, it.url, it.note,
])].map((r) => r.map(esc).join(',')).join('\r\n');
fs.writeFileSync('科研资源库集合.csv', '\uFEFF' + csvOut, 'utf8');

const DATA = JSON.stringify(items);
const topicList = [...new Set(items.flatMap((i) => i.topics))].sort((a, b) => a.localeCompare(b, 'zh'));
const counts = {};
items.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
const coreCount = items.filter((i) => i.stars === 3).length;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>云大科研资源库集合 · 中华民族共同体意识与边疆治理</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#e4e7ec;--ink:#1f2329;--muted:#6b7280;--blue:#185fa5;--blue-bg:#e6f1fb;--teal:#0f6e56;--teal-bg:#e1f5ee;--amber:#854f0b;--amber-bg:#faeeda;--red:#a32d2d;--red-bg:#fcebeb}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:24px;font-weight:600;margin:0 0 6px}
.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:120px}
.stat b{display:block;font-size:20px;font-weight:600;color:var(--blue);line-height:1.2}
.stat span{font-size:12px;color:var(--muted)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}
.panel h2{font-size:16px;font-weight:600;margin:0 0 12px}
.warn{background:var(--amber-bg);border:1px solid #f0d9a8;border-radius:10px;padding:12px 16px;margin-bottom:18px;color:var(--amber);font-size:13px}
.warn b{font-weight:600}
.path{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.step{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fbfcfd}
.step .num{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background:var(--blue-bg);color:var(--blue);font-weight:600;font-size:12px;margin-right:8px}
.step b{font-size:13px;font-weight:600}
.step p{margin:8px 0 0;font-size:12.5px;color:var(--muted);line-height:1.7}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px 20px;margin:0;padding-left:18px;font-size:13px;color:#374151}
.rules li{margin-bottom:4px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}
#q{flex:1;min-width:240px;padding:10px 14px;border:1px solid var(--line);border-radius:9px;font-size:14px;background:#fff;color:var(--ink);outline:none}
#q:focus{border-color:var(--blue)}
select{padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.chip{padding:5px 12px;border:1px solid var(--line);border-radius:20px;background:#fff;color:var(--muted);font-size:12.5px;cursor:pointer;user-select:none}
.chip.on{background:var(--blue);border-color:var(--blue);color:#fff}
.chip.topic.on{background:var(--teal);border-color:var(--teal)}
.count{font-size:12.5px;color:var(--muted);margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.card .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.card h3{margin:0;font-size:14.5px;font-weight:600;line-height:1.45}
.stars{color:#b7791f;font-size:12px;white-space:nowrap;letter-spacing:1px}
.meta{font-size:12px;color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{background:var(--teal-bg);color:var(--teal);border-radius:5px;padding:2px 7px;font-size:11.5px}
.tag.cat{background:var(--blue-bg);color:var(--blue)}
.tag.st{background:#f1efe8;color:#5f5e5a}
.tag.trial{background:var(--red-bg);color:var(--red)}
.note{font-size:12px;color:#4b5563;background:#fafbfc;border-left:3px solid var(--line);padding:7px 10px;border-radius:0 6px 6px 0}
.acts{display:flex;gap:8px;margin-top:auto;padding-top:4px}
.btn{display:inline-block;padding:6px 12px;border-radius:7px;font-size:12px;text-decoration:none;border:1px solid var(--line);color:var(--blue);background:#fff}
.btn:hover{background:var(--blue-bg)}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn.primary:hover{opacity:.9}
.empty{text-align:center;color:var(--muted);padding:40px}
footer{color:var(--muted);font-size:12px;margin-top:26px;text-align:center;line-height:1.8}
code{background:#f1efe8;padding:1px 5px;border-radius:4px;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
<h1>云大科研资源库集合</h1>
<p class="sub">面向「中华民族共同体意识 · 边疆民族地区治理」方向的检索导航　|　数据源：云南大学图书馆订购清单 + 本机实测　|　生成于 2026-11-16</p>
<div class="stats">
<div class="stat"><b>${items.length}</b><span>资源总数</span></div>
<div class="stat"><b>${coreCount}</b><span>核心推荐 ★★★</span></div>
<div class="stat"><b>${counts['中文数据库'] || 0}</b><span>中文数据库</span></div>
<div class="stat"><b>${counts['外文数据库'] || 0}</b><span>外文数据库</span></div>
<div class="stat"><b>${counts['试用数据库'] || 0}</b><span>试用资源</span></div>
<div class="stat"><b>${counts['实测补充'] || 0}</b><span>实测补充</span></div>
</div>
<div class="warn"><b>时效提醒：</b>《铸牢中华民族共同体意识数据库》为试用资源，<b>2026-12-31 到期</b>，与本方向高度对口，建议尽快使用；到期后需复查是否转订购。</div>

<div class="panel">
<h2>如何调用这套资源</h2>
<div class="path">
<div class="step"><span class="num">A</span><b>自己查：三个入口</b><p>① 本地打开 <code>科研资源库集合.html</code>（离线可用）；② 在线打开 <a href="https://yndx-339.github.io/ynu-research-resources/" target="_blank" rel="noopener">GitHub Pages 检索页</a>；③ 用 Excel 打开 <code>科研资源库集合.csv</code> 做透视与筛选。用法：搜索 → 主题／用途／分类筛选 → 点卡片「直达」进数据库。</p></div>
<div class="step"><span class="num">B</span><b>访问前提</b><p>数据库本体不在本页内。点「直达」需<b>云大校园网出口 IP</b>；校外先走代理 <code>${PROXY}&lt;目标URL&gt;</code>；办事大厅与校内业务系统需 CAS 登录；部分库还需机构／个人账号登录态。本页只做导航，不代替数据库本身。</p></div>
<div class="step"><span class="num">C</span><b>让智能体代查</b><p>直接说需求即可，无需提供账号密码。例：「用知网查某主题近五年 CSSCI，导出题录并下前 10 篇 PDF」「在读秀定位某书里某概念的段落」「走 CNKI AI 增强检索补交叉议题题录（只读，别提交问答）」「把清单按我的两个课题筛成专题清单，附检索式」。</p></div>
</div>
<ul class="rules" style="margin-top:14px">
<li><b>论文与题录</b> → 知网（PDF 全文、GB/T 7714 题录导出）；<b>语义查全补漏</b> → CNKI AI 增强检索（提交知识问答／辅助创作须先征得同意）。</li>
<li><b>专著段落定位</b> → 读秀（图像型阅读器，截图识别）；<b>整本电子书</b> → 汇雅书城逐章带读。</li>
<li><b>外文全文</b> → ScienceDirect / IEEE Xplore / Wiley / Springer / Nature；<b>引证核验</b> → Web of Science、Scopus、CSSCI、JCR。</li>
<li><b>专题库</b> →《铸牢中华民族共同体意识数据库》（2026-12-31 试用到期）、古代边疆研究信息服务平台、一带一路数据库。</li>
<li><b>更新清单</b> → 依次跑 <code>node lib-nav-probe.mjs &gt; lib-db-result.json</code>、<code>node make-db-csv.mjs</code>、<code>node build-collection.mjs</code>；同步线上再跑 <code>python publish-github.py</code>。</li>
</ul>
</div>

<div class="panel">
<h2>推荐检索路径</h2>
<div class="path">
<div class="step"><span class="num">1</span><b>定题与查全：两路合用</b><p>知网 kns8s 主题检索（近五年 / CSSCI + 北大核心 / 学术期刊 / 相关性排序）<b>＋</b> CNKI AI 增强检索（语义）。实测两路题录零重合：主题检索兜住专名本体，语义检索打通交叉议题，缺一路即漏检。</p></div>
<div class="step"><span class="num">2</span><b>理论话语与政策口径</b><p>中国共产党思想理论资源数据库、人大复印报刊资料全文数据库、国家哲学社会科学学术期刊数据库、皮书数据库，以及《铸牢中华民族共同体意识数据库》专题库。</p></div>
<div class="step"><span class="num">3</span><b>专著与史料纵深</b><p>读秀做书内段落定位（图像型，截图识别）、汇雅书城读整本电子书；中国数字方志库、中国基本古籍库、晚清民国期刊全文库补史料。</p></div>
<div class="step"><span class="num">4</span><b>边疆与周边专题</b><p>古代边疆研究信息服务平台、一带一路数据库、东南亚 &amp; 缅甸研究专题电子图书、台湾联合百科数据库。</p></div>
<div class="step"><span class="num">5</span><b>外文与引证核验</b><p>Web of Science / Scopus 补外文与引证，ScienceDirect / Springer / Nature / Wiley / IEEE 取全文；CSSCI、中国引文数据库、JCR、ESI 核来源期刊与影响力。</p></div>
<div class="step"><span class="num">6</span><b>题录导出与管理</b><p>知网导出 GB/T 7714 题录，EndNote / NoteExpress 管理；投 CSSCI 前用 CSSCI 来源期刊目录复核。</p></div>
</div>
</div>

<div class="panel">
<h2>使用须知</h2>
<ul class="rules">
<li>全部机构授权绑定<b>云大校园网出口 IP</b>；断网时先恢复校园网连接，否则所有 IP 直通资源立即失效。</li>
<li>校外走代理 <code>${PROXY}&lt;目标URL&gt;</code>；读秀可在校内 IP 办「个人认证」后校外使用。</li>
<li>单轮全文下载 <b>≤10–15 篇</b>，不写批量爬取脚本——知网按 IP 监控，封学校授权 IP 代价极大。</li>
<li>CNKI AI 提交知识问答 / 辅助创作会在账号留新记录，<b>须先征得同意</b>；题录提取为只读。</li>
<li>办事大厅与校内业务系统只做只读查看，不代登录、不代提交、不采集待办与消息明细。</li>
<li>判断某库订没订，<b>以图书馆数据库导航清单为准</b>；出版社首页被 cookie 弹窗遮挡时不显示机构标识，不代表无权限。</li>
<li>清单会变动（尤其试用库），隔段时间重跑 <code>lib-nav-probe.mjs</code> 更新。</li>
</ul>
</div>

<div class="panel">
<h2>检索资源</h2>
<div class="toolbar">
<input id="q" type="search" placeholder="搜库名、主题、用途、备注，如：共同体 / 边疆 / 方志 / 引文 / 全文">
<select id="cat"><option value="">全部分类</option><option>中文数据库</option><option>外文数据库</option><option>试用数据库</option><option>实测补充</option></select>
<select id="use"><option value="">全部用途</option></select>
<select id="sort"><option value="default">按推荐度排序</option><option value="name">按名称排序</option></select>
</div>
<div class="chips" id="chips"></div>
<div class="count" id="count"></div>
<div class="grid" id="grid"></div>
<div class="empty" id="empty" style="display:none">没有匹配的资源，换个关键词试试</div>
</div>

<footer>本地离线文件，数据已内嵌，无需联网即可检索；点击「直达」需校园网 IP 或校外代理。<br>原始清单：ynu-db-list.csv　|　结构化数据：科研资源库集合.csv　|　抓取脚本：lib-nav-probe.mjs / make-db-csv.mjs</footer>
</div>
<script>
const DATA = ${DATA};
const TOPICS = ${JSON.stringify(topicList)};
const LIB_HOME = ${JSON.stringify(LIB_HOME)};
let cat = '', use = '', topic = '', sort = 'default', q = '';
const uses = [...new Set(DATA.map(d => d.use))].sort((a,b)=>a.localeCompare(b,'zh'));
const useSel = document.getElementById('use');
uses.forEach(u => { const o = document.createElement('option'); o.textContent = u; useSel.appendChild(o); });
const chips = document.getElementById('chips');
const quick = [['', '全部'], ['★3', '核心 ★★★'], ['试用', '试用资源'], ['实测', '本机实测']];
quick.forEach(([v, label]) => {
  const b = document.createElement('div');
  b.className = 'chip' + (v === '' ? ' on' : '');
  b.dataset.quick = v; b.textContent = label;
  b.onclick = () => { [...chips.querySelectorAll('[data-quick]')].forEach(x => x.classList.remove('on')); b.classList.add('on'); quickFilter = v; render(); };
  chips.appendChild(b);
});
TOPICS.forEach(t => {
  const b = document.createElement('div');
  b.className = 'chip topic'; b.dataset.topic = t; b.textContent = t;
  b.onclick = () => { topic = (topic === t ? '' : t); [...chips.querySelectorAll('[data-topic]')].forEach(x => x.classList.toggle('on', x.dataset.topic === topic)); render(); };
  chips.appendChild(b);
});
let quickFilter = '';
const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const emptyEl = document.getElementById('empty');
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function render(){
  const kw = q.trim().toLowerCase();
  let list = DATA.filter(d => {
    if (cat && d.category !== cat) return false;
    if (use && d.use !== use) return false;
    if (topic && !d.topics.includes(topic)) return false;
    if (quickFilter === '★3' && d.stars !== 3) return false;
    if (quickFilter === '试用' && d.status !== '试用') return false;
    if (quickFilter === '实测' && d.source !== '本机实测') return false;
    if (kw) {
      const hay = [d.name, d.category, d.use, d.status, d.access, d.note, d.topics.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
  if (sort === 'name') list = list.slice().sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  countEl.textContent = '共 ' + list.length + ' 条资源' + (kw ? '（关键词：' + q.trim() + '）' : '');
  emptyEl.style.display = list.length ? 'none' : 'block';
  grid.innerHTML = list.map(d => {
    const tags = d.topics.map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    const trial = d.status === '试用' ? '<span class="tag trial">试用</span>' : '';
    const link = d.url
      ? '<a class="btn primary" href="' + esc(d.url) + '" target="_blank" rel="noopener">直达</a>'
      : '';
    return '<div class="card"><div class="top"><h3>' + esc(d.name) + '</h3><span class="stars">' + '★'.repeat(d.stars) + '</span></div>' +
      '<div class="tags"><span class="tag cat">' + esc(d.category) + '</span>' + tags + trial +
      '<span class="tag st">' + esc(d.lang) + ' · ' + esc(d.status) + '</span></div>' +
      '<div class="meta">用途：' + esc(d.use) + '　|　' + esc(d.access) + '</div>' +
      (d.note ? '<div class="note">' + esc(d.note) + '</div>' : '') +
      '<div class="acts">' + link + '<a class="btn" href="' + esc(LIB_HOME) + '" target="_blank" rel="noopener">图书馆清单</a></div></div>';
  }).join('');
}
document.getElementById('q').addEventListener('input', e => { q = e.target.value; render(); });
document.getElementById('cat').addEventListener('change', e => { cat = e.target.value; render(); });
useSel.addEventListener('change', e => { use = e.target.value; render(); });
document.getElementById('sort').addEventListener('change', e => { sort = e.target.value; render(); });
render();
</script>
</body>
</html>`;
fs.writeFileSync('科研资源库集合.html', html, 'utf8');
console.log('items=' + items.length + ' core=' + coreCount + ' topics=' + topicList.length + ' html=' + html.length + ' bytes');
