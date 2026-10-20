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
  ['卡片高度比例可微调并持久化', /kb_ratio/.test(app) && /KB_RATIO/.test(app)],
  ['键盘态底部预留 120vh', /padding-bottom: 120vh/.test(css)],
  ['缺口/盈余是硬指标', /hasDefOv/.test(fs.readFileSync('api.js','utf8'))],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
