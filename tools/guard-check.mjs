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
  ['自动同步不含 Token / AI Key', /delete data\.settings\.gh_token/.test(api) && /delete data\.settings\.gitee_token/.test(api) && /delete data\.settings\.dashscope_key/.test(api)],
  ['开启同步先读云端（新设备不许覆盖云端）', /cloudPull\(first\)/.test(app) && /async function cloudPull\(force\)/.test(api) && /function setCloudTokenSilently/.test(api)],
  ['安装到主屏幕后允许横竖屏（manifest orientation: any）', /"orientation": "any"/.test(manifest)],
  ['底部 Dock 是悬浮条（留边距，不再整条贴屏幕边）', /\.tabbar \{[\s\S]*?left: var\(--dock-inset\)/.test(css)],
  ['Dock 三格等宽居中（加号永远在正中那格，左右各一格）', /grid-template-columns: 1fr 1fr 1fr/.test(css)],
  ['Dock 圆角跟着这台设备的屏幕圆角走（脚本按屏宽算，不写死）', /syncDockR/.test(app) && /border-radius: var\(--dock-r\)/.test(css)],
  ['Dock 边距按设备分开（手机 / iPad 各一套）', /@media \(min-width: 700px\) \{\n  \/\* iPad[\s\S]*?--dock-inset: \d+px;/.test(css)],
  ['组详情标题边上的铅笔（改名字）还在', /id="grpRename"/.test(html) && /\$\('#grpNameTxt'\)\.textContent/.test(app)],
  ['底部提示条永远在 Dock 上方（不许压住）', /\.toast \{[\s\S]*?bottom: calc\(var\(--dock-bottom\) \+ var\(--dock-h\) \+ \d+px/.test(css)],
  ['卡片玻璃质感只有一处定义（--glass-card + --edge-gloss + --glass-blur）', (css.match(/linear-gradient\(var\(--glass-card\)/g) || []).length === 1],
  ['提醒记录 / 记录卡片共用同一张磨砂玻璃卡（blur 20 + 半透底）', /#nlogSheet[^{}]*\{[\s\S]*?backdrop-filter: blur\(20px\) saturate\(150%\)/.test(css) && /#nlogSheet,\s*#addSheet \{/.test(css)],
  ['名字和铅笔在同一行（放不下时省略名字，不把铅笔挤到下一行）', /\.nameline \{[^}]*display: flex/.test(css) && /\.nameline \.nmtxt \{[^}]*text-overflow: ellipsis/.test(css)],
  ['Dock 液态滑块存在且不挡点击', /class="dock-lens"/.test(html) && /\.dock-lens \{[\s\S]*?pointer-events: none;/.test(css) && /initDockLens/.test(app)],
  ['图标/加号必须在液态滑块上面（z-index 1）', /\.tab \{\n  position: relative; z-index: 1;/.test(css) && /\.fab \{\n  position: relative; z-index: 1;/.test(css)],
  ['按下的水光跟着手指（--hx / --hy）', /--hx/.test(app) && /--hy/.test(app)],
  ['和 Dock 重叠的卡牌宽度取自 --dock-max（不许写死）', /max-width: var\(--dock-max\)/.test(css) && !/max-width: 470px/.test(css)],
  ['记录卡片选项框的圆角由 --dock-r 推算（与卡片同心）', /\.tabs3 \{[\s\S]*?border-radius: calc\(var\(--dock-r/.test(css)],
  ['记录卡片大虚线框贴住卡片底边（底部对齐）', /#pane-photo:not\(\[hidden\]\) \.drop\.photobox \{[\s\S]*?flex: 1 1 auto/.test(css)],
  ['分段滑块的过渡里不许出现 width / height（会逐帧排版 → 抖）', /#?\.?seg-lens|seg-lens \{/.test(css) && (() => {
    const i = css.indexOf('.seg-lens {');
    if (i < 0) return false;
    const blk = css.slice(i, css.indexOf('}', i));
    const tr = (blk.match(/transition:[^;]*/) || [''])[0];
    return tr.includes('transform') && !/\bwidth\b|\bheight\b/.test(tr);
  })()],
  ['Dock 液态滑块不许带 backdrop-filter（iOS 每帧重算模糊 → 卡）', (() => {
    const i = css.indexOf('.dock-lens {');
    if (i < 0) return false;
    const blk = css.slice(i, css.indexOf('\n}', i));
    return !/^[ \t]*(-webkit-)?backdrop-filter\s*:/m.test(blk);   // 只看真声明，不看注释里提到的
  })()],
  ['分段滑块首次定位不播入场动画（不许从顶部落下）', /primed/.test(app) && /transition = 'none'/.test(app)],
  ['记录卡片所有间距由 --blk-gap 派生（改一处全跟着动）', /#addSheet \{ --blk-gap:/.test(css) && /#addSheet \.sh-body \{[\s\S]*?var\(--blk-gap\)/.test(css) && /#addSheet \.tabs3 \{[\s\S]*?var\(--blk-gap\)/.test(css)],
  ['切目标模式只做局部刷新，不许整页重绘（否则滑块会跳）', (() => {
    const i = app.indexOf("$$('#dietModes button').forEach(b => b.onclick");
    if (i < 0) return false;
    const seg = app.slice(i, i + 1200);
    return seg.includes('paintNutriValues()') && !seg.includes('renderMe()');
  })()],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
