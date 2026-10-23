// 发版前自检：把已经"锁死"的行为用代码卡住，谁改坏了这里就先失败
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const manifest = fs.readFileSync('manifest.webmanifest', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

// 四处版本号必须完全对得上（2026-10-22 踩过：APP_VERSION 一直没跟着改，App 永远显示旧版本）
const vtxt = fs.readFileSync('version.txt', 'utf8').trim();
const vApp = (app.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const vCache = (sw.match(/const CACHE = 'ledger-v(\d+)'/) || [])[1];
const vHtml = (html.match(/app\.js\?v=(\d+)/) || [])[1];

// 取某个选择器那条规则的声明体（第一处匹配）
function ruleBody(sel) {
  const i = css.indexOf(sel + ' {');
  if (i < 0) return '';
  const j = css.indexOf('}', i);
  return css.slice(i, j);
}
// padding 简写：上下是否相等（把这个选择器的**所有**规则都扫一遍）
function padSymmetric(sel) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{', 'g');
  let m;
  while ((m = re.exec(css))) {
    const j = css.indexOf('}', m.index);
    const body = css.slice(m.index, j);
    const pm = body.match(/padding:\s*([^;]+);/);
    if (!pm) continue;
    const parts = pm[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().split(/\s+/);
    if (parts.length < 3) continue;                 // 1~2 值本来就上下相等
    if (parts.some(v => v.includes('var('))) continue;
    if (parts[0] !== parts[2]) return false;        // 上下不等 → 不合格
  }
  return true;
}

// ---- 锁死的颜色 / 尺寸：用户明确说过"没让你改就别改"，这里逐条卡住 ----
import { readFileSync as _rf } from 'node:fs';
let _locked = [];
try { _locked = JSON.parse(_rf(new URL('./locked.json', import.meta.url), 'utf8')); } catch (e) { _locked = []; }
const lockedOk = () => {
  const bad = [];
  for (const L of _locked) {
    const src = L.file === 'style.css' ? css : L.file === 'app.js' ? app : L.file === 'api.js' ? api : html;
    if (!src.includes(L.find)) bad.push(L.why + '（' + L.file + ' 里找不到：' + L.find.slice(0, 40) + '…）');
  }
  return bad;
};
const lockedBad = lockedOk();

const checks = [
  ['顶部状态栏实色带存在且层级为 25', /\.statusbg \{[\s\S]*?z-index: 25;/.test(css)],
  ['顶栏必须是 fixed', /\.topbar \{\n  position: fixed;/.test(css)],
  ['顶栏颜色锁死 #0d0f0e（任何情况下都不许改）', /\.topbar \{[\s\S]{0,400}?background: #0d0f0e;/.test(css) && !/\.topbar \{[\s\S]{0,400}?background: #(?!0d0f0e)/.test(css)],
  ['顶栏必须在虚化层之上（z-index ≥ 70），否则虚化会把它压暗', (() => {
    const i = css.indexOf('.topbar {');
    const seg = css.slice(i, i + 400);
    const m = seg.match(/z-index: (\d+);/);
    return !!m && Number(m[1]) >= 70;
  })()],
  ['虚化遮罩必须整屏一层，不许用 top 裁掉顶栏（裁一刀退出就闪）', (() => {
    const i = css.indexOf('#nutMask.on,');
    if (i < 0) return false;
    const seg = css.slice(i, i + 300);
    return !/top:\s*calc?\(var\(--topbar-h/.test(seg) && !/\n  top: var\(--topbar-h/.test(seg);
  })()],
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
  ['锁死的颜色/尺寸一个都不许改（tools/locked.json）', lockedBad.length === 0],
  ['卡片上下内边距必须相等（.card 不许 12/16 这种不等距）', padSymmetric('.card')],
  ['Dock 滑块四周留白必须同一个值（不然圆角没法同心）', /const PAD = \d+;/.test(app) && /cellW \+ 2 \* \(padL - PAD\)/.test(app) && /visH - PAD \* 2/.test(app)],
  ['Dock 滑块圆角与 Dock 同心：内圆 = Dock 圆角 − 留白 − 边框', /dockR - PAD - bT/.test(app)],
  ['Dock 滑块上下等距：高度按"边框里面"那块算（visH），不许用整框高度', /const visH = ir\.height - bT - bB;/.test(app) && /--lens-y', Math\.round\(\(visH - h\) \/ 2\)/.test(app)],
  ['滑块"没操作过就不许自己淡"：默认 transition: none，只由 fadein/fadeout 驱动', /\n\.seg-lens\.fadein\s+\.lens-body::after/.test(css) && /\.seg-lens \.lens-body::after \{[\s\S]{0,240}?transition: none;/.test(css)],
  ['分段滑块和 Dock 是同一套两层结构：外层只走位置（.62s 过冲），内层 .lens-body 管压扁（.24s）', /\.seg-lens \{[\s\S]{0,700}?transform \.62s cubic-bezier\(\.33, 1\.06, \.32, 1\)/.test(css) && /\.seg-lens \.lens-body \{[\s\S]{0,900}?transform \.24s cubic-bezier\(\.32,\.9,\.28,1\)/.test(css) && /\.seg-lens\.press \.lens-body \{[\s\S]{0,140}?scale\(1\.055, \.925\)/.test(css)],
  ['分段滑块停稳时阴影必须渐变（.5s），否则那一帧硬切 = "颜色突然变成实色的"', /\.seg-lens \.lens-body \{[\s\S]{0,900}?box-shadow \.5s ease/.test(css)],
  ['滑块"摘 fadein"的定时器必须存下来并在下一轮作废（否则连点几次后，上一轮的定时器会在淡入中途摘掉 fadein → 1 帧跳到全实色 = "1 马上变 2"）', (app.match(/clearTimeout\(lens\.__fadeT\)/g) || []).length >= 3 && (app.match(/lens\.__fadeT = setTimeout\(\(\) => lens\.classList\.remove\('fadein'\)/g) || []).length === 2 && (app.match(/clearTimeout\(lens\.__fadeoutT\)/g) || []).length === 2],
  ['分段滑块是两层 DOM（.seg-lens > .lens-body），按压形变走内层', /lens\.className = 'seg-lens';[\s\S]{0,220}?className = 'lens-body'/.test(app)],
  ['分段滑块的位移里不许再带缩放（位置/压扁混在一条 transform 上 → 一按就跳）', (() => {
    const i = app.indexOf('const apply = (g) => {');
    if (i < 0) return false;
    return !/scale/.test(app.slice(i, i + 600));
  })()],
  ['分段滑块按下就认手指那一格，松手不许先弹回旧格再滑过来（和 Dock 一样用 target）', /function initSegLens[\s\S]{0,6000}?target = b;/.test(app) && !/function initSegLens[\s\S]{0,9000}?place\(wrap\.querySelector\('button\.on'\) \|\| el/.test(app)],
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
  ['分段滑块首次定位不播入场动画（不许从顶部落下）', /primed/.test(app) && /classList\.add\('noanim'\)/.test(app) && /\.seg-lens\.noanim \{ transition: none !important; \}/.test(css)],
  ['数据拉取必须三路并发取最新（镜像/GitHub/Gitee），不许退回单路', /GH_RAW/.test(app) && /healthStamp/.test(app) && /giteeFresh\('health\.json'\)/.test(app)],
  ['记录卡片所有间距由 --blk-gap 派生（改一处全跟着动）', /#addSheet \{ --blk-gap:/.test(css) && /#addSheet \.sh-body \{[\s\S]*?var\(--blk-gap\)/.test(css) && /#addSheet \.tabs3 \{[\s\S]*?var\(--blk-gap\)/.test(css)],
  ['四处版本号一致（APP_VERSION / version.txt / CACHE / index ?v）', vApp === vtxt && !!vCache && !!vHtml && vCache.endsWith(vHtml.slice(-3))],
  ['切目标模式只做局部刷新，不许整页重绘（否则滑块会跳）', (() => {
    const i = app.indexOf("$$('#dietModes button').forEach(b => b.onclick");
    if (i < 0) return false;
    const seg = app.slice(i, i + 1200);
    return seg.includes('paintNutriValues()') && !seg.includes('renderMe()');
  })()],
  ['改名后营养必须跟着换：首页单条 / 详情卡 / 识别结果草稿 三处都要触发', (app.match(/renutrifyLogs\(/g) || []).length >= 2 && /renutrifyDraftItem\(it\)/.test(app) && /\/api\/logs\/renutrify/.test(api) && /\/api\/food\/nutrition/.test(api)],
  ['整组改名只是标签，不许触发营养联动（一组可能是 5 种不同食物）', (() => {
    const i = app.indexOf("$$('[data-pen-g]', box).forEach");
    if (i < 0) return false;
    return !/renutrify/.test(app.slice(i, i + 1100));
  })()],
  ['改名联动只许改四项营养，克数一个字都不许动', (() => {
    const i = api.indexOf("pathname === '/api/logs/renutrify'");
    if (i < 0) return false;
    const blk = api.slice(i, i + 1800);
    return !/l\.grams\s*=/.test(blk) && /l\.kcal = [\s\S]{0,400}?l\.p = [\s\S]{0,400}?l\.c = [\s\S]{0,400}?l\.f =/.test(blk);
  })()],
  ['手改营养要记进"这个食物"的记忆（rememberNut：每 100 克 + 改过几次 + 上次 AI 值）', /function rememberNut\(name, per, aiPer\)/.test(app) && /rememberNut\((newName|l\.name)/.test(app) && /cnt: \(\(old && Number\(old\.cnt\)\) \|\| 0\) \+ 1/.test(app)],
  ['营养面板不许加新按钮：本地查不到就后台自动填（data-ainut 不许回来）', !/data-ainut/.test(app + html) && /async function nutAutoFill/.test(app)],
  ['营养面板里改名字 = 连这条的名字一起改（组里单独一条也能改），但点候选只查营养、不改名', /const renamed = !!nameBox && nameBox !== it\.name && nutNameTyped/.test(app) && /if \(renamed\) l\.name = newName/.test(app) && /if \(renamed\) it\.name = newName/.test(app) && /nutNameTyped = false;                  \/\/ 点候选只是/.test(app)],
  /* ---- 营养表识别（用户死命令：给了食物照 + 成分表 + 克数，就必须算对，不许把核对推给用户）---- */
  ['读表必须整表逐行照抄（label_rows：name/value/unit/nrv），不许让模型自己判断哪行是碳水/脂肪',
    /label_rows/.test(api) && /"name":"蛋白质"/.test(api) && /nrv/.test(api) && /不许自己判断哪一行是碳水、哪一行是脂肪/.test(api)],
  ['App 自己按行名取数（pickRows + ROW_RULES 里必须有 蛋白质/脂肪/碳水化合物/能量）',
    /function pickRows\(/.test(api) && /function rowsToPer100\(/.test(api) && /const ROW_RULES = \[/.test(api)
      && /蛋白质/.test(api) && /\^\(脂肪\|总脂肪\|脂肪总量\)/.test(api) && /碳水化合物\|碳水/.test(api) && /能量\|热量/.test(api)],
  ['必须用标签自己的 NRV% 反算核对（nrvConflict + 蛋白/脂肪 60g、碳水 300g、能量 8400kJ）',
    /function nrvConflict\(/.test(api) && /NRV_REF_G = \{ protein: 60, fat: 60, carb: 300 \}/.test(api) && /NRV_REF_KJ = 8400/.test(api)
      && /nrvConflict\(R\.protein/.test(api) && /nrvConflict\(R\.carb/.test(api) && /nrvConflict\(R\.energy/.test(api)],
  ['读表不合格必须自动重读一次（识别完 + 保存前都要兜），且两处规则一致（105 克 / 40% 误差）',
    /async function rereadLabelNutrition\(/.test(app) && /const re = await rereadLabelNutrition\(\);/.test(app)
      && (app.match(/await rereadLabelNutrition\(\)/g) || []).length >= 2
      && /if \(mass > 105\)/.test(app) && /Math\.max\(70, k \* 0\.4\)/.test(app) && /if \(p \+ c \+ f > 105\) return false;/.test(api) && /Math\.max\(70, kcal \* 0\.4\)/.test(api)],
  ['用户手改过的数字绝不许被自动重读覆盖（nutDirty 判断 + 与本次读数逐项比对）',
    /!\(nutDirty\.k \|\| nutDirty\.p \|\| nutDirty\.c \|\| nutDirty\.f\)/.test(app) && /const fromThisRead = /.test(app) && /delete one\._suspect;/.test(app)],
  ['营养成分表那四项必须是「每 100 克」口径（改克数不许再缩放四格）',
    /每100克热量/.test(html) && /if \(refEl\) refEl\.oninput = paintNutPreview;/.test(app) && !/nutBase\.p \* share/.test(app) && !/nutBase\.k \* share/.test(app)],
  ['没包装的菜（拉面/沙县/盖饭）必须拆到食材级 + 自己估克数（食物照那条链路的核心）',
    /混合菜（兰州拉面、米粉、盖浇饭/.test(api) && /必须拆到食材级/.test(api) && /按\*\*煮熟后\*\*的重量估/.test(api)
      && /汤：单独一条/.test(api) && /必须给出一个具体数字/.test(api) && /混合菜（兰州拉面、米粉、盖浇饭、套餐、沙县小吃）\*\*必须拆到食材级\*\*/.test(api)],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
