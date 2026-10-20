// 发版前自检：把已经"锁死"的行为用代码卡住，谁改坏了这里就先失败
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

const checks = [
  ['顶部状态栏实色带存在且层级为 25', /\.statusbg \{[\s\S]*?z-index: 25;/.test(css)],
  ['顶栏必须是 fixed', /\.topbar \{\n  position: fixed;/.test(css)],
  ['顶栏不许有任何 transform 位移', !/topbar\.style\.transform|tbEl\.style\.transform/.test(app)],
  ['内容层不许是独立合成层', !/backface-visibility: hidden/.test(css.split('.sc-body')[1] || '')],
  ['键盘态用"有输入框在编辑"判定', /classList\.add\('kb'\)/.test(app)],
  ['键盘高度记忆并持久化（kb_h）', /kb_h/.test(app)],
  ['键盘态底部留白由脚本收紧（--kb-pad）', /padding-bottom: var\(--kb-pad/.test(css) && /--kb-pad/.test(app)],
  ['缺口/盈余是硬指标', /hasDefOv/.test(fs.readFileSync('api.js','utf8'))],
  ['聚焦栏居中（centerFor）', /centerFor/.test(app)],
  ['只在"真点"时预定位（touchend 位移<8px），滑过不触发', /moved < 8/.test(app)],
  ['失焦后不立即判定键盘收起（防瞬时错位）', /700\);/.test(app)],
  ['没有多套键盘定位定时器互相打架', !/\[260, 700\]\.forEach/.test(app)],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
