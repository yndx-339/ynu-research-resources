#!/usr/bin/env node
// 从 lib-db-result.json 的「全部数据库」正文里抽出分分类的库名清单，导出 UTF-8 BOM CSV。
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('lib-db-result.json', 'utf8'));
const page = data.find((x) => x.key === 'all');
const lines = page.text.split('\n').map((s) => s.trim()).filter(Boolean);
const start = lines.findIndex((l) => l === '最新数据库');
const end = lines.findIndex((l) => l.startsWith('说明：数据库'));
const skip = new Set([
  '详情', '访问地址', '远程访问', '镜像访问', '期刊列表',
  'ISI检索链接', 'OCLC检索链接', '最近热门',
]);
const sections = new Set(['中文数据库', '外文数据库', '试用数据库']);

let section = '';
const rows = [];
for (let i = start + 1; i < end; i++) {
  const line = lines[i];
  if (sections.has(line)) { section = line; continue; }
  if (!section || skip.has(line) || line.length < 3) continue;
  rows.push([section, line]);
}

const seen = new Set();
const out = [['分类', '数据库/平台名称']];
for (const [s, n] of rows) {
  const key = s + '|' + n;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push([s, n]);
}
const csv = out
  .map((r) => r.map((c) => '"' + c.replace(/"/g, '""') + '"').join(','))
  .join('\r\n');
fs.writeFileSync('ynu-db-list.csv', '\uFEFF' + csv, 'utf8');
const bySection = {};
for (const [s] of out.slice(1)) bySection[s] = (bySection[s] || 0) + 1;
console.log('total=' + (out.length - 1) + ' ' + JSON.stringify(bySection));
