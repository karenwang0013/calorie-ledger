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
  // v10.05 用户定的硬规矩（2026-10-27）：
  //   Dock 的 left / right / bottom 三个边距永远相等；圆角 = 屏幕圆角 − 边距（同心）；
  //   高度必须装得下这个圆角（否则 CSS 会把圆角砍到高度一半，弧线变小、就不呼应了）。
  // 改任何一个参数都要按这三条一起重算，不许单独调一个。
  ['Dock 与屏幕的等距/同心规则 + 卡牌层级（Dock=弹层=底部，主页卡更窄）', (() => {
    const num = k => { const m = css.match(new RegExp('--' + k + ':\\s*([\\d.]+)px')); return m ? parseFloat(m[1]) : null; };
    const inset = num('dock-inset');     // 弹层卡（记录/设置/提醒）左右
    const bottom = num('dock-bottom');   // Dock 底部（贴 home 横条顶边 13）
    const dockW = num('dock-w');         // Dock 左右
    const pagePad = num('page-pad');     // 主页卡牌左右
    const h = num('dock-h');
    if ([inset, bottom, dockW, pagePad, h].some(v => v == null)) return false;
    if (bottom !== 13) return false;                            // ① 底边必须贴住白杠顶边（8+5=13）
    if (Math.abs(dockW - bottom) > 0.01) return false;           // ② Dock 左右=底部，圆角缝=底缝
    if (Math.abs(inset - dockW) > 0.01) return false;            // ③ 点出来的卡必须和 Dock 同宽
    if (pagePad <= inset + 0.01) return false;                   // ④ 主页卡必须比 Dock 窄（Dock 比主页卡宽）
    const wantR = 62 - dockW;                                    // ⑤ 圆角按 Dock 左右同心
    return h >= 2 * wantR - 0.01;                                // ⑥ 高度至少 2×圆角
  })()],
  ['Dock 圆角跟着这台设备的屏幕圆角走（脚本按屏宽算，不写死）', /syncDockR/.test(app) && /border-radius: var\(--dock-r\)/.test(css)],
  ['Dock 边距按设备分开（手机 / iPad 各一套）', /@media \(min-width: 700px\) \{\n  \/\* iPad[\s\S]*?--dock-inset: \d+px;/.test(css)],
  ['组详情标题边上的铅笔（改名字）还在', /id="grpRename"/.test(html) && /\$\('#grpNameTxt'\)\.textContent/.test(app)],
  ['底部提示条永远在 Dock 上方（不许压住）', /\.toast \{[\s\S]*?bottom: calc\(var\(--dock-bottom\) \+ var\(--dock-h\) \+ \d+px/.test(css)],
  ['玻璃材质只有一套母版（Dock / 卡牌 / 按钮共用同一组变量）', /--glass-fill-top:/.test(css) && /--btn-solid:/.test(css) && (css.match(/linear-gradient\(180deg, var\(--glass-fill-top\)/g) || []).length >= 3 && /\.card, \.stats[^{]*\{[\s\S]{0,600}var\(--glass-blur-2\)/.test(css)],
  ['提醒记录 / 记录卡片共用同一张磨砂玻璃卡（跟 Dock 同一套母版）', /#nlogSheet[^{}]*\{[\s\S]*?var\(--glass-blur-2\)/.test(css) && /#nlogSheet,\s*#addSheet \{/.test(css)],
  ['名字和铅笔在同一行（放不下时省略名字，不把铅笔挤到下一行）', /\.nameline \{[^}]*display: flex/.test(css) && /\.nameline \.nmtxt \{[^}]*text-overflow: ellipsis/.test(css)],
  ['Dock 液态滑块存在且不挡点击', /class="dock-lens"/.test(html) && /\.dock-lens \{[\s\S]*?pointer-events: none;/.test(css) && /initDockLens/.test(app)],
  ['图标/加号必须在液态滑块上面（z-index 1）', /\.tab \{\n  position: relative; z-index: 1;/.test(css) && /\.fab \{\n  position: relative; z-index: 1;/.test(css)],
  ['按下的水光跟着手指（--hx / --hy）', /--hx/.test(app) && /--hy/.test(app)],
  ['和 Dock 重叠的卡牌宽度取自 --dock-max（不许写死）', /max-width: var\(--dock-max\)/.test(css) && !/max-width: 470px/.test(css)],
  ['记录卡片选项框的圆角由 --dock-r 推算（与卡片同心）', /\.tabs3 \{[\s\S]*?border-radius: calc\(var\(--dock-r/.test(css)],
  // v9.49 用户口径：下面那个大框（照片大框 / 识别热量那张卡）不许再压到卡片底边上 ——
  //   卡片高度是「大框底 + .sh-body 的下内边距」量出来的，下内边距必须是 --blk-gap（12），
  //   这样大框离卡片边 左13 / 右13 / 下13 等距（以前这里是 0 → 框底正好被卡片的圆角切掉）。
  ['记录卡片底部：从相册选 / 补充说明 到卡片外沿必须是 21（= 底部留白 20 + 1px 边框；v9.57 照抄设置卡的底边距）',
    /#addSheet\.no-items #pane-photo \{ padding-bottom: 20px; \}/.test(css)
      && /_addS\.classList\.toggle\('no-items', !\(S\.items \|\| \[\]\)\.length\)/.test(app)
      && /const panePadB = \(parseFloat\(getComputedStyle\(pane\)\.paddingBottom\) \|\| 0\) \* z;/.test(app)],
  ['两个照片格宽度必须等于格子（不许被 1:1.3 比例反推撑宽，否则中间缝被挤没）',
    /#pane-photo \.pslot-empty \{ width: 100%; height: 100%; min-height: 0; aspect-ratio: auto; border-radius: 14px; \}/.test(css)],
  ['照片两小格圆角与外面大框同心（27 − 13 = 14），且照片与空框同一个圆角',
    /#pane-photo \.pslot-body \.preview \{ height: 100%; object-fit: cover; border-radius: 14px; \}/.test(css)],
  ['记录卡片底栏（餐次 + 记入）左右与上面的卡牌对齐（内边距 = --card-gap 16），底距 20',
    /#addSheet \.sh-foot \{[\s\S]*?padding: 7px var\(--card-gap\) 20px;/.test(css)],
  // v9.57 用户口径（效果图确认）：记录卡里的框和按钮统一成设置卡那套 —— 圆角 18。
  ['记录卡里的框和按钮统一圆角 18（照片格 / 预览 / 三个输入框 / 拍照 / 从相册选 / 识别热量 / 记入 / 餐次 / 条目 / 结果照片卡）',
    /#addSheet \.pslot-empty,[\s\S]{0,140}?#addSheet #photoActions input,[\s\S]{0,320}?#addSheet \.shotrow \{ border-radius: 18px; \}/.test(css)],
  ['两个照片格的材质与顶部「拍照 / 搜索」那条一致（黑 26%→38% + edge-gloss 描边 + 顶部 5% 高光，不再是全透明）',
    /#pane-photo \.pslot-empty \{\s*\n\s*background-color: transparent;\s*\n\s*background-image: linear-gradient\(180deg, rgba\(13, 15, 14, \.26\) 0%, rgba\(13, 15, 14, \.38\) 100%\), var\(--edge-gloss\);/.test(css)],
  // v9.52 用户口径（效果图确认）：包着两个照片格 + 两个按钮的大框去掉；拍两格的宽度改由「盒宽 − 12」算
  ['照片大框（.drop.photobox）已去掉：无底色/无描边/无内边距',
    /\.drop\.photobox \{[\s\S]*?background-image: none;[\s\S]*?border-width: 0;[\s\S]*?padding: 0;/.test(css)
      && /const inner = w - 12;/.test(app)],
  ['「识别热量 / 食材 / 克数 / 补充说明」那张卡已去掉框（无底色/无描边/无内边距）',
    /#photoActions \{\s*\n\s*background-color: transparent;\s*\n\s*background-image: none;\s*\n\s*border-width: 0;[\s\S]*?padding: 0;/.test(css)
      && !/id="photoActions" style=/.test(html)],
  ['识别结果里那张「照片卡」右上角的 × 是「整组删掉」：照片 + 下面所有项一起清（不能只收起卡）',
    /\.ritem \.del,\s*\n\.shotrow \.del \{[\s\S]*?width: 28px; height: 28px;/.test(css)
      && /class="del" id="shotClose"/.test(app)
      && /shotClose\.onclick = ev => \{\s*\n\s*ev\.stopPropagation\(\);[\s\S]{0,160}?S\.items = \[\];[\s\S]{0,160}?resetPhotoUI\(\);/.test(app)
      && !/S\.shotHidden/.test(app)],
  ['拍照按钮不许带荧光外发光（会和「从相册选」上方那 8px 的缝糊成一层荧光渐变）',
    !/\.pickbtn\.on \{[\s\S]{0,200}?box-shadow: 0 8px 22px rgba\(214,255,75/.test(css)],
  ['「识别热量」是实色按钮，用的就是首页「脂肪」那条的橙（var(--orange)）+ edge-gloss 描边 + 深色字，和「拍照」同一种做法',
    /#addSheet #photoGo \{[\s\S]*?linear-gradient\(var\(--orange\), var\(--orange\)\), var\(--edge-gloss\)[\s\S]*?color: #0a0b0c;/.test(css)
      && !/class="btn primary" id="photoGo"/.test(html)],
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
  ['云端拉取不许删掉本机已有的照片（shots 只合并，不许整份覆盖）',
    (api.match(/shots = Object\.assign\(\{\}, rd0?\.shots \|\| \{\}, local0?\.shots \|\| \{\}\)/g) || []).length >= 2
      && /const rd = remote\.data \|\| \{\};[\s\S]{0,900}?local\.shots = Object\.assign/.test(api)
      && /const rd0 = remote0\.data \|\| \{\};[\s\S]{0,900}?local0\.shots = Object\.assign/.test(api)],
  ['云端容量上限不许再退回 400KB（默认 ≥1MB），且传不动要自动折半重试',
    /const CLOUD_LIMIT_MAX_KB = 2048/.test(api) && /function cloudLimitKB\(/.test(api) && /function setCloudLimitKB\(/.test(api)
      && /const limit = cloudLimitKB\(\) \* 1024;/.test(api)
      && /res\.status === 413/.test(api) && /setCloudLimitKB\(kb \/ 2\)/.test(api) && !/const limit = 400 \* 1024/.test(api)],
  ['本机存储写满时必须报错（不许静默丢数据）；照片已不在 localStorage，不再有 3.2MB 裁剪',
    /err-quota/.test(api) && !/3\.2 \* 1024 \* 1024/.test(api)],
  /* ---- A 方案（v7.80）：照片搬进 IndexedDB + 云端每张一个文件 ---- */
  ['照片必须存 IndexedDB（不许再写回 localStorage.shots）',
    /indexedDB\.open\(PHOTO_DB/.test(api) && /photoIdbPut\(/.test(api) && /function shotUrl\(/.test(api)
      && !/d\.shots\[body\.batch\] = /.test(api) && !/d\.shots\[k\] = /.test(api)],
  ['老照片搬迁必须"全部成功才清空"（禁止先删后搬）',
    /if \(ok !== keys\.length\) return 0;/.test(api) && /async function absorbLegacyShots\(/.test(api)],
  ['云端照片必须每张单独一个文件（photos/<batch>.jpg）',
    /const PHOTO_DIR = 'photos'/.test(api) && /\$\{PHOTO_DIR\}\/\$\{batch\}\.jpg/.test(api) && /cloudPutPhoto\(/.test(api) && /cloudDeletePhoto\(/.test(api)],
  ['换设备后照片要能按需拉回来（ensurePhoto + 详情页自动补图）',
    /async function ensurePhoto\(/.test(api) && /ensurePhoto\(batchKey\)/.test(app) && /cloudGetPhoto\(/.test(api)],
  ['照片只存 160×160 小图（不许存大图，一张约 5KB）',
    /async function makeThumb\(dataUrl, side = 160, q = 0\.5\)/.test(app)
      && /const s = Math\.min\(img\.width, img\.height\)/.test(app)
      && /drawImage\(img, sx, sy, s, s, 0, 0, side, side\)/.test(app)
      && /c\.toDataURL\('image\/jpeg', q\)/.test(app)
      && !/makeThumb\(dataUrl, max = 320/.test(app)],
  ['静态资源缓存兜底：找不到带 ?v= 的就忽略版本号再找（不许 respondWith(undefined) 白屏）',
    /ignoreSearch: true/.test(sw) && /caches\.match\(req\)\)\s*\n?\s*\|\| \(await caches\.match\(req, \{ ignoreSearch: true \}\)\)/.test(sw)
      && /new Response\('', \{ status: 504/.test(sw)],
  ['启动兜底：提示条出现后，页面起来了必须自己消失（不许一直挂着）',
    /if \(repairing\) \{ setTimeout\(show, 1500\); return; \}/.test(html) && /el\.remove\(\);[\s\S]{0,80}700/.test(html)],
  ['目标只有一个入口：设置页不许再出现「目标速度 / 蛋白系数」输入框（会和饮食目标页打架）',
    !/id="fGoalRate"/.test(app) && !/id="fProt"/.test(app)
      && /goal_rate: Store\.load\(\)\.profile\.goal_rate/.test(app)
      && /protein_per_kg: Store\.load\(\)\.profile\.protein_per_kg/.test(app)],
  ['营养卡说明文字上下等距（上 10 / 下 10，文字在间隙正中）',
    /#nutSheet \.hint \{ line-height: 1\.5; margin: 10px 0 0; \}/.test(css)
      && /#nutSheet \.sh-body \{ padding: 24px 26px 2px; \}/.test(css)],
  ['按钮里的中文要视觉居中（.setpill 内容下补 1.3px；底部「共 N 条」补 0.65px）',
    /padding-top: var\(--pill-nudge, 1\.3px\);/.test(css)
      && /#nlogFoot \.setrow\.ver \.ttl \{ transform: translateY\(var\(--pill-nudge-half, \.65px\)\); \}/.test(css)],
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅ ' : '❌ ') + name);
  if (!ok) bad++;
}
if (bad) { console.error(`\n${bad} 项被改坏，禁止发版`); process.exit(1); }
console.log('\n全部通过');
