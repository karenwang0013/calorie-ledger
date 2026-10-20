// 发版前自检：把已经"锁死"的行为用代码卡住，谁改坏了这里就先失败
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const manifest = fs.readFileSync('manifest.webmanifest', 'utf8');

const checks = [
  ['顶部状态栏实色带存在且层级为 25', /\.statusbg \{[\s\S]*?z-index: 25;/.test(css)],
  ['顶栏必须是 fixed', /\.topbar \{\n  position: fixed;/.test(css)],
  ['顶栏不许有任何 transform 位移', !/topbar\.style\.transform|tbEl\.style\.transform/.test(app)],
  ['内容层不许是独立合成层', !/backface-visibility: hidden/.test(css.split('.sc-body')[1] || '')],
  ['键盘态用"有输入框在编辑"判定', /classList\.add\('kb'\)/.test(app)],
  ['键盘高度记忆并持久化（kb_h）', /kb_h/.test(app)],
  ['键盘态底部留白由脚本收紧（--kb-pad）', /padding-bottom: var\(--kb-pad/.test(css) && /--kb-pad/.test(app)],
  ['缺口/盈余是硬指标', /hasDefOv/.test(fs.readFileSync('api.js','utf8'))],
  ['定位：点在哪个输入框，就把那个输入框放到顶栏与键盘中间（kbFill）', /kbFill/.test(app) && !/placeAndTrim/.test(app)],
  ['键盘态底部留白固定成「键盘高 + 小缝」，不再二次收紧（防滑出空白）', /KB_GAP/.test(app) && /--kb-pad/.test(app)],
  ['键盘态定位不许再按「卡片底边」对齐（旧 bug：点上面几栏会把输入框顶出屏幕）', !/card\.getBoundingClientRect\(\)\.bottom/.test(app)],
  ['只在"真点"时预定位（touchend 位移<8px），滑过不触发', /moved < 8/.test(app)],
  ['失焦后不立即判定键盘收起（防瞬时错位）', /700\);/.test(app)],
  ['没有多套键盘定位定时器互相打架', !/\[260, 700\]\.forEach/.test(app)],
  ['iPad 保持手机单列（首页不许左右分栏）', !/today-grid|today-sum|today-log/.test(html + css) && /#view-today, #view-trends, #view-me \{[\s\S]*?max-width: 720px/.test(css)],
  ['数据备份只保留「自动同步 + 文件备份」，不再有重复的云端备份卡', !/id="cloudBackup"|id="cloudRestore"/.test(app)],
  ['自动同步不含 Token / AI Key', /delete data\.settings\.gh_token/.test(api) && /delete data\.settings\.dashscope_key/.test(api)],
  ['开启同步先读云端（新设备不许覆盖云端）', /cloudPull\(first\)/.test(app) && /async function cloudPull\(force\)/.test(api) && /function setCloudTokenSilently/.test(api)],
  ['安装到主屏幕后允许横竖屏（manifest orientation: any）', /"orientation": "any"/.test(manifest)],
  ['底部 Dock 是悬浮条（留边距，不再整条贴屏幕边）', /\.tabbar \{[\s\S]*?left: var\(--dock-inset\)/.test(css)],
  ['Dock 三个按钮居中（加号永远在正中，两侧按钮各自居中）', /grid-template-columns: 1fr auto 1fr/.test(css)],
  ['Dock 左右两端是平的（不画圆弧）', /--dock-r: 0px;/.test(css)],
  ['Dock 边距按设备分开（手机 / iPad 各一套）', /@media \(min-width: 700px\) \{\n  \/\* iPad[\s\S]*?--dock-inset: 10px;/.test(css)],
  ['组详情标题边上的铅笔（改名字）还在', /id="grpRename"/.test(html) && /\$\('#grpNameTxt'\)\.textContent/.test(app)],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
