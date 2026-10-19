/* 热量账本 —— 前端 */
'use strict';

/* ---------------- 工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const MEALS = [
  { k: 'breakfast', n: '早餐' },
  { k: 'lunch', n: '午餐' },
  { k: 'dinner', n: '晚餐' },
  { k: 'snack', n: '加餐' },
];
const MEAL_NAME = Object.fromEntries(MEALS.map(m => [m.k, m.n]));

const RELEASES = [
  { d: '10-19', groups: [
    ['同步', [
      '改为「快捷指令 → GitHub health.json → App」，不再打开 Safari',
      'App 打开时自动拉取；顶栏「数据同步」可手动刷新，没新数据会提示是哪一份',
      '服务脚本改为网络优先 + 绕过 HTTP 缓存，避免新旧版本混用导致白屏',
      '消耗下方显示「同步时间」，一眼看出用的是几点的手表数据',
    ]],
    ['记录', [
      '拍照分「1 食物照片 / 2 营养成分表」两个位，两张一起送 AI：标签读每 100 克，食物图估克数',
      '按克数精确换算；无糖饮料这类 0 千卡条目不再被丢弃',
      '搜索页可复用「以前记过」的食物',
      '一次识别多项自动归成一条（沙县小吃 · 3 项），点开看明细',
      '识别结果里可直接填「这一餐叫什么」，不用事后改',
      '记入时存 320px 缩略图，列表左侧显示 40px 小图；存储层保留所有字段，更新不再丢照片',
    ]],
    ['界面', [
      '记录食物改成悬浮圆角卡片，圆角与屏幕同心，离底 16px',
      '识别成功后自动收起大图，结果区（左小图 + 右数值）直接露出',
      '点开一餐 → 居中卡片：菜名、改名、照片、配料、合计',
      '顶部标题贴近状态栏；弹层打开时锁住背后滚动；左边缘右滑返回',
      '拍照图标线条化；底部加号改成长方形；两个照片位并排且为正方形',
      '营养目标页把算法写出来：基础代谢 + 手表活动 = 全天消耗',
    ]],
    ['修复', [
      '性别默认成「女」，导致基础代谢差 166 千卡',
      '目标速度输入框与「脂肪目标」共用 id，目标缺口一直是 0',
      '没选图时拍照框下面多出一条细线',
      '卸载重装会清空本地数据：改为「备份到 iCloud / 从 iCloud 恢复」',
    ]],
  ]},
  { d: '10-18', groups: [
    ['', [
      '从本地 Python 服务改为纯前端 PWA（GitHub Pages），数据存 localStorage',
      '118 条食物库、拍照/文字识别、手动手表录入、趋势页、CSV/JSON 备份',
    ]],
  ]},
];

// 版本号只在这里写一次，设置页和关于页都读它
const APP_VERSION = 'v1.63';
let groupMap = new Map();
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() { return isoOf(new Date()); }
function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function round(n) { return Math.round(Number(n) || 0); }

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------------- 状态 ---------------- */
const SYNC_SHORTCUT = '热量采集';
let pendingSync = false;

const S = {
  date: todayISO(),
  today: todayISO(),
  day: null,
  foods: [],
  view: 'today',
  trendDays: 30,
  trend: null,
  addMode: 'photo',
  photoData: null,
  photoAt: null,
  photoURL: null,
  batchName: null,
  photo2Data: null,
  photo2URL: null,
  openGroups: new Set(),
  items: [],
  meal: 'lunch',
};

function defaultMeal() {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/* ---------------- 加载 ---------------- */
async function loadDay() {
  try {
    const d = await api('/api/bootstrap?date=' + S.date);
    S.day = d;
    S.foods = d.foods || [];
    renderToday();
  } catch (e) {
    toast('加载失败：' + e.message, 4000);
  }
}

/* ---------------- 渲染：今日 ---------------- */
function renderToday() {
  const d = S.day;
  if (!d) return;

  const dt = parseISO(d.date);
  $('#dateLabel').textContent = `${dt.getMonth() + 1}月${dt.getDate()}日`;
  const isToday = d.date === S.today;
  $('#dateSub').textContent = isToday ? '今天 · 实时' : WEEK[dt.getDay()];
  $('#nextDay').disabled = isToday;
  $('#nextDay').style.opacity = isToday ? 0.28 : 1;

  const t = d.targets;
  const intake = d.intake;
  const expFull = d.expenditure;          // 全天预估/实际
  const balFull = d.balance;

  // 今天只算“到现在为止”的消耗，历史日期用全天值
  let dayFrac = 1;
  if (d.date === S.today) {
    const start = new Date(d.date + 'T00:00:00').getTime();
    dayFrac = Math.min(1, Math.max(0, (Date.now() - start) / 86400000));
  }
  // 今天：基础代谢按时间折算，手表的活动能量是“到现在为止”的，全额计入
  const det = d.expenditure_detail || {};
  let exp;
  if (d.date === S.today) {
    if (det.active && det.resting) exp = Math.round(det.resting * dayFrac) + det.active;
    else if (det.total) exp = Math.round(det.total * dayFrac);
    else exp = Math.round(expFull * dayFrac);
  } else {
    exp = expFull;
  }
  const bal = d.date === S.today ? exp - intake : balFull;
  const left = t.kcal_budget - intake;

  // 首次使用提示
  const sb = $('#setupBanner');
  if (d.needs_setup) {
    sb.innerHTML = `<button class="setup-tip" id="goSetup">
      <span>先填身高体重，消耗才算得准</span><b>去填 →</b></button>`;
    $('#goSetup').onclick = () => switchView('me');
  } else {
    sb.innerHTML = '';
  }

  // 主环
  const pct = t.kcal_budget > 0 ? intake / t.kcal_budget : 0;
  const ring = $('#ring');
  const C = 527.8;
  ring.style.strokeDashoffset = String(C * (1 - Math.min(pct, 1)));

  // 颜色语言：绿=还有余量、橙=接近上限、红=已经吃超（盈余）
  let color = 'url(#ringGradLime)';
  if (pct > 1.0) color = 'url(#ringGradRed)';
  else if (pct > 0.9) color = 'url(#ringGradOrange)';
  ring.style.stroke = color;

  const hero = $('#hero');
  hero.classList.remove('surplus', 'over');

  let sub = `目标缺口 ${t.deficit}`;
  if (bal < 0) {
    hero.classList.add('surplus');
    $('#heroLbl').textContent = '热量盈余';
    $('#heroNum').textContent = Math.abs(bal);
  } else {
    $('#heroLbl').textContent = '热量缺口';
    $('#heroNum').textContent = bal;
  }
  $('#heroSub').textContent = sub;

  $('#stIntake').innerHTML = intake + ' <small>kcal</small>';
  $('#stExp').innerHTML = exp + ' <small>kcal</small>';
  const leftEl = $('#stLeft');
  const at = (d.watch && d.watch.source === 'cloud' && d.watch.cloudAt) ? String(d.watch.cloudAt).slice(11) : '';
  $('#stExpAt').textContent = at ? '同步时间 ' + at : '';
  leftEl.innerHTML = (left >= 0 ? left : left) + ' <small>kcal</small>';
  leftEl.style.color = left < 0 ? 'var(--orange)' : '';

  // 营养素
  const pr = d.protein, cb = d.carb, ft = d.fat;
  $('#pNow').textContent = Math.round(pr);
  $('#pGoal').textContent = t.protein_g;
  $('#cNow').textContent = Math.round(cb);
  $('#cGoal').textContent = t.carb_g;
  $('#fNow').textContent = Math.round(ft);
  $('#fGoal').textContent = t.fat_g;
  const w = (v, g) => Math.min(100, g > 0 ? (v / g) * 100 : 0) + '%';
  $('#pBar').style.width = w(pr, t.protein_g);
  $('#cBar').style.width = w(cb, t.carb_g);
  $('#fBar').style.width = w(ft, t.fat_g);

  renderMeals();
}

function renderMeals() {
  const d = S.day;
  const box = $('#meals');
  const shots = d.shots || {};
  const thumbOf = l => (l.batch && shots[l.batch]) ? `<img class="mthumb" src="${shots[l.batch]}" alt="">` : '';
  const itemRow = l => `
      <div class="mitem" data-item="${l.id}">
        ${thumbOf(l)}
        <div class="n">${esc(l.name)}
          <span class="sub">${l.grams ? Math.round(l.grams) + 'g' : ''}${
            l.p ? ' · 蛋' + Math.round(l.p) + '/碳' + Math.round(l.c) + '/脂' + Math.round(l.f) : ''}</span>
        </div>
        <div class="k">${Math.round(l.kcal)}${l.source === 'photo' || l.source === 'ai' ? ' <span class="ai">AI</span>' : ''}</div>
        <span class="chev">›</span>
        <button class="del" data-del="${l.id}">×</button>
      </div>`;

  // 同一次识别出来的多条，收成一行（例如「沙县小吃」→ 展开是青菜/鸡腿/米饭）
  // 老数据没有 batch 标记，就按「同一餐 + 同一秒」归堆
  const groupsById = new Map();
  const groupRows = items => {
    const groups = [];
    const seen = new Map();
    items.forEach(l => {
      const key = l.batch || ('L' + (l.meal || '') + '|' + (l.ts || ''));
      if (!seen.has(key)) {
        const g = { key, name: l.batchName || '', logs: [] };
        seen.set(key, g);
        groups.push(g);
        groupsById.set(key, g);
      }
      seen.get(key).logs.push(l);
    });
    return groups.map(g => {
      if (g.logs.length < 2) return itemRow(g.logs[0]);
      const open = S.openGroups.has(g.key);
      const kcal = Math.round(g.logs.reduce((a, b) => a + (b.kcal || 0), 0));
      const p = g.logs.reduce((a, b) => a + (b.p || 0), 0);
      const c = g.logs.reduce((a, b) => a + (b.c || 0), 0);
      const f = g.logs.reduce((a, b) => a + (b.f || 0), 0);
      return `
      <div class="mitem ghead" data-group="${esc(g.key)}">
        ${thumbOf(g.logs[0])}
        <div class="n">${esc(g.name || '未命名')}
          <span class="sub">${g.logs.length} 项 · 蛋${Math.round(p)}/碳${Math.round(c)}/脂${Math.round(f)}</span>
        </div>
        <div class="k">${kcal}</div>
        <span class="chev">›</span>
      </div>`;
    }).join('');
  };

  box.innerHTML = MEALS.map(m => {
    const items = d.logs.filter(l => (l.meal || 'other') === m.k);
    const kcal = items.reduce((a, b) => a + (b.kcal || 0), 0);
    const rows = groupRows(items);
    return `
      <div class="meal ${items.length ? 'has' : ''}">
        <div class="hd">
          <span class="dot"></span>
          <span class="nm">${m.n}</span>
          <span class="kc">${items.length ? Math.round(kcal) + ' 千卡' : ''}</span>
          <button class="add" data-add="${m.k}">＋</button>
        </div>
        ${items.length ? `<div class="items">${rows}</div>`
                       : `<div class="empty">还没记录</div>`}
      </div>`;
  }).join('');

  groupMap = groupsById;
  $$('[data-group]', box).forEach(b => b.onclick = () => openGroup(b.dataset.group));
  $$('[data-item]', box).forEach(b => b.onclick = ev => {
    if (ev.target.closest('[data-del]')) return;
    openDetail([d.logs.find(l => String(l.id) === b.dataset.item)].filter(Boolean), false);
  });

  $$('[data-del]', box).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      await api('/api/logs/' + b.dataset.del, null, 'DELETE');
      await loadDay();
      if (S.view === 'trends') loadTrends();
    } catch (e) { toast(e.message); }
  });

  $$('[data-add]', box).forEach(b => b.onclick = () => {
    openAdd(b.dataset.add);
  });
}

/* ---------------- 记录弹层 ---------------- */
function openAdd(meal) {
  S.items = [];
  S.meal = meal || defaultMeal();
  S.batchName = null;
  $('#batchName').value = '';
  resetPhotoUI();
  $('#photoHint').value = '';
  $('#resultArea').hidden = true;
  $('#addFoot').hidden = true;
  $('#searchInput').value = '';
  $('#textInput').value = '';
  $('#searchList').innerHTML = '';
  $('#addTabs').hidden = false;
  $('#searchInput').value = '';
  setAddMode('photo');
  renderMealPick();
  renderRecent();

  $('#addMask').classList.add('on');
  $('#addSheet').classList.add('on');
}
function closeAdd() {
  $('#addMask').classList.remove('on');
  $('#addSheet').classList.remove('on');
}

function setAddMode(m) {
  S.addMode = m;
  $$('#addTabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  ['photo', 'search', 'text'].forEach(k => {
    $('#pane-' + k).hidden = k !== m;
  });
  if (m === 'search') runSearch($('#searchInput').value || '');
}

function renderMealPick() {
  $$('#mealPick .chip').forEach(c => c.classList.toggle('on', c.dataset.meal === S.meal));
}

function renderRecent() {
  const box = $('#recentChips');
  const seen = [];
  (S.day?.logs || []).forEach(l => {
    if (!seen.includes(l.name)) seen.push(l.name);
  });
  const picks = seen.slice(0, 6);
  if (picks.length < 4) {
    ['鸡蛋', '米饭', '牛奶(全脂)', '鸡胸肉(生)', '香蕉'].forEach(n => {
      if (!picks.includes(n)) picks.push(n);
    });
  }
  box.innerHTML = picks.slice(0, 7).map(n =>
    `<button class="chip" data-quick="${esc(n)}">${esc(n)}</button>`).join('');
  $$('[data-quick]', box).forEach(b => b.onclick = () => {
    const f = S.foods.find(x => x.name === b.dataset.quick);
    if (f) pushFood(f);
  });
}

/* ---- 拍照 ---- */
async function compress(file, max = 1280, q = 0.82) {
  const bmp = await new Promise((res, rej) => {
    if (window.createImageBitmap) {
      createImageBitmap(file).then(res).catch(rej);
    } else {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    }
  });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function handlePhoto(file) {
  if (!file) return;
  try {
    if (S.photoURL) URL.revokeObjectURL(S.photoURL);
    S.photoURL = URL.createObjectURL(file);
    $('#photoPreview').src = S.photoURL;
    $('#photoPreview').hidden = false;
    $('#photoDel').hidden = false;
    $('#emptyA').hidden = true;
    S.photoData = await compress(file);
    S.photoAt = Date.now();
    $('#photoActions').hidden = false;
  } catch (e) {
    toast('图片读取失败');
  }
}

/* 一组按钮：先填 ① 食物照片，再填 ② 营养成分表 */
async function handlePick(file) {
  if (!file) return;
  if (!S.photoData) return handlePhoto(file);
  if (!S.photo2Data) return handlePhoto2(file);
  toast('两张都拍好了。点照片上的 × 可以换一张', 3000);
}

async function handlePhoto2(file) {
  if (!file) return;
  try {
    if (S.photo2URL) URL.revokeObjectURL(S.photo2URL);
    S.photo2URL = URL.createObjectURL(file);
    $('#pv2').src = S.photo2URL;
    $('#pv2').hidden = false;
    $('#del2').hidden = false;
    $('#emptyB').hidden = true;
    S.photo2Data = await compress(file, 1024, 0.8);
  } catch (e) {
    toast('图片读取失败');
  }
}

/* 把拍照区恢复成「还没选图」的样子 */
function resetPhotoUI() {
  if (S.photoURL) { URL.revokeObjectURL(S.photoURL); S.photoURL = null; }
  const pv = $('#photoPreview');
  pv.removeAttribute('src');
  pv.hidden = true;
  $('#photoDel').hidden = true;
  $('#emptyA').hidden = false;
  S.photoData = null;
  S.photoAt = null;
  $('#photoDrop').hidden = false;
  $('#pane-photo').classList.remove('done');
  $('#photoActions').hidden = true;
  if (S.photo2URL) { URL.revokeObjectURL(S.photo2URL); S.photo2URL = null; }
  S.photo2Data = null;
  $('#pv2').removeAttribute('src');
  $('#pv2').hidden = true;
  $('#del2').hidden = true;
  $('#emptyB').hidden = false;
}

async function runPhoto() {
  const main = S.photoData || S.photo2Data;
  if (!main) return toast('先拍一张照片');
  const btn = $('#photoGo');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 识别中…';
  try {
    const grams = Number(($('#photoGrams') || {}).value) || 0;
    let hint = $('#photoHint').value.trim();
    let modeHint;
    if (S.photoData && S.photo2Data) {
      modeHint = '第一张图是实际吃的食物本体，第二张图是包装上的营养成分表。'
        + '请按第二张的标签读每 100 克的能量/蛋白质/碳水/脂肪（不要用外观估算这几项），'
        + '再按第一张估算实际吃掉了多少克；两两相乘得到总量。';
    } else if (S.photoData) {
      modeHint = '这张图是食物本体：按外观和常见餐具尺寸估算实际吃掉的重量。';
    } else {
      modeHint = '这张图是包装上的营养成分表：每 100 克数值只按标签读数；name 用产品名。';
    }
    hint = hint ? modeHint + '；' + hint : modeHint;
    if (grams > 0) hint = hint + `；我实际吃了 ${grams} 克`;
    // 有食物图就用它当主图；只拍了成分表就反过来
    const hasFood = !!S.photoData;
    const r = await api('/api/ai/food', {
      image: hasFood ? S.photoData : S.photo2Data,
      image2: hasFood ? (S.photo2Data || null) : null,
      hint,
    });
    S.items = r.items.map(x => ({ ...x, _src: 'photo' }));
    // 填了克数就以它为准（包装营养表通常只有一条）
    if (grams > 0 && S.items.length === 1) S.items[0].grams = grams;
    // 识别完就把大图收起，结果区（左小图 + 右数值）直接露出来
    $('#photoDrop').hidden = true;
    $('#photoActions').hidden = true;
    $('#pane-photo').classList.add('done');
    S.batchName = r.dish || '';
    $('#batchName').value = S.batchName;
    showResult(r.dish ? '识别：' + r.dish : '识别结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* 存一张小图（约 10~20KB），之后点开这一组还能看到当时拍的 */
async function makeThumb(dataUrl, max = 320, q = 0.55) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/* ---- 文字 ---- */
async function runText() {
  const text = $('#textInput').value.trim();
  if (!text) return toast('先描述一下吃了什么');
  const btn = $('#textGo');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 估算中…';
  try {
    const r = await api('/api/ai/text', { text });
    S.items = r.items.map(x => ({ ...x, _src: 'ai' }));
    S.batchName = r.dish || '';
    $('#batchName').value = S.batchName;
    showResult(r.dish ? '估算：' + r.dish : '估算结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* ---- 搜索 ---- */

/* 从历史记录里整理出「以前记过」的食物（按最近一次记录换算每100g） */
function historyFoods() {
  const logs = Store.load().logs || [];
  const map = new Map();
  logs.forEach(l => {
    const g = Number(l.grams) || 0;
    if (!g || !l.name) return;
    map.set(l.name, {
      name: l.name,
      kcal: Math.round((Number(l.kcal) || 0) * 100 / g),
      p: +(((Number(l.p) || 0) * 100) / g).toFixed(1),
      c: +(((Number(l.c) || 0) * 100) / g).toFixed(1),
      f: +(((Number(l.f) || 0) * 100) / g).toFixed(1),
      grams: g,
      cat: '以前记过',
    });
  });
  return [...map.values()];
}

function runSearch(q) {
  const box = $('#searchList');
  const key = q.trim().toLowerCase();
  const hist = historyFoods();

  let list;
  if (!key) {
    list = hist.slice().reverse().slice(0, 12).map(f => ({ f, h: true }));
  } else {
    const h = hist.filter(f => f.name.toLowerCase().includes(key)).map(f => ({ f, h: true }));
    const db = S.foods
      .filter(f => f.name.toLowerCase().includes(key) ||
        (f.alias || []).some(a => a.toLowerCase().includes(key)))
      .filter(f => !h.some(x => x.f.name === f.name))
      .slice(0, 20)
      .map(f => ({ f, h: false }));
    list = h.concat(db);
  }

  if (!list.length) {
    box.innerHTML = key
      ? `<div class="empty-state">库里没有「${esc(q)}」<br>试试换个说法，或用「描述」让 AI 估</div>`
      : '';
    return;
  }

  box.innerHTML = list.map((x, i) => `
    <div class="sitem" data-i="${i}">
      <div>
        <div>${esc(x.f.name)}${x.h ? ' <span style="font-size:9px;color:var(--lime)">记过</span>' : ''}</div>
        <div class="cat">${esc(x.f.cat || '')} · 蛋白 ${x.f.p}g / 碳水 ${x.f.c}g / 脂肪 ${x.f.f}g</div>
      </div>
      <div class="kc">${x.f.kcal}<br><span style="font-size:9px">/100g</span></div>
    </div>`).join('');

  $$('.sitem', box).forEach(el => el.onclick = () => {
    pushFood(list[Number(el.dataset.i)].f);
    $('#searchInput').value = '';
    box.innerHTML = '';
    $('#searchInput').blur();
  });
}

function pushFood(f) {
  const def = Number(f.grams) || (f.units && f.units[0] ? f.units[0].g : 100);
  S.items.push({
    name: f.name,
    grams: def,
    kcal_per_100g: f.kcal,
    protein_per_100g: f.p,
    carb_per_100g: f.c,
    fat_per_100g: f.f,
    confidence: 1,
    _src: 'db',
    _units: f.units || [],
  });
  showResult('已添加', '');
}

/* ---- 结果编辑 ---- */
function showResult(title, note) {
  $('#resultArea').hidden = S.items.length === 0;
  $('#resultTitle').textContent = title || '识别结果';
  $('#resultNote').textContent = note || '';
  $('#addFoot').hidden = S.items.length === 0;
  renderResult();
  requestAnimationFrame(() => {
    const ra = $('#resultArea');
    if (!ra.hidden) ra.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function renderResult() {
  const box = $('#resultItems');
  let shot = '';
  if (S.photoData) {
    const t = new Date(S.photoAt || Date.now());
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    shot = `<div class="shotrow">
      <img src="${S.photoData}" alt="">
      <div class="sinfo">
        <b>${hh}:${mm} 拍摄</b>
        <span>识别出 ${S.items.length} 项 · 克数可改</span>
      </div>
    </div>`;
  }
  $('#shotBox').innerHTML = shot;
  // 多项才需要给这一餐起名（识别到的菜名会自动填进来）
  $('#nameWrap').hidden = S.items.length < 2;
  box.innerHTML = S.items.map((it, i) => {
    const kcal = it.kcal_per_100g * it.grams / 100;
    const units = (it._units || []).filter(u => u.g !== 100).slice(0, 3);
    const chips = units.map(u =>
      `<button data-u="${i}" data-g="${u.g}">${u.unit}</button>`).join('');
    const low = it.confidence != null && it.confidence < 0.55;
    return `
      <div class="ritem" data-low="${low ? 1 : 0}">
        <div class="top">
          <span class="nm">${esc(it.name)}</span>
          <span class="kc">${Math.round(kcal)}</span>
          <button class="del" data-rm="${i}" style="color:var(--muted2);font-size:16px;padding:0 0 0 6px">×</button>
        </div>
        <div class="meta">每 100g ${Math.round(it.kcal_per_100g)} 千卡 · 蛋 ${it.protein_per_100g}/碳 ${it.carb_per_100g}/脂 ${it.fat_per_100g}${low ? ' · 不太确定' : ''}</div>
        <div class="gr">
          <input type="number" inputmode="decimal" value="${it.grams}" data-g="${i}">
          <span class="u">克</span>
          <div class="chips">${chips}</div>
        </div>
      </div>`;
  }).join('');

  const total = S.items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0);
  $('#resultTotal').textContent = Math.round(total);
  $('#addFoot').hidden = S.items.length === 0;
  $('#resultArea').hidden = S.items.length === 0;

  $$('[data-rm]', box).forEach(b => b.onclick = () => {
    S.items.splice(Number(b.dataset.rm), 1);
    renderResult();
  });
  $$('[data-u]', box).forEach(b => b.onclick = () => {
    S.items[Number(b.dataset.u)].grams = Number(b.dataset.g);
    renderResult();
  });
  $$('input[data-g]', box).forEach(inp => {
    inp.oninput = () => {
      S.items[Number(inp.dataset.g)].grams = Number(inp.value) || 0;
      const kc = S.items[Number(inp.dataset.g)];
      const el = inp.closest('.ritem').querySelector('.kc');
      el.textContent = Math.round(kc.kcal_per_100g * kc.grams / 100);
      const total = S.items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0);
      $('#resultTotal').textContent = Math.round(total);
    };
  });
}

async function saveItems() {
  const items = S.items.filter(i => i.grams > 0);
  if (!items.length) return toast('没有可保存的条目');
  const dishName = ($('#batchName').value || '').trim().slice(0, 20);
  if (items.length > 1 && !dishName) {
    $('#batchName').focus();
    return toast('先给这一餐起个名字，比如「沙县小吃」', 3000);
  }
  const btn = $('#saveItems');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    const batch = 'b' + Date.now();
    let shot = '';
    if (batch && S.photoData) {
      try { shot = await makeThumb(S.photoData); } catch (e) { /* 图存不下就算了 */ }
    }
    await api('/api/logs', {
      date: S.date,
      meal: S.meal,
      items,
      source: items[0]._src || 'manual',
      // 一次识别出来的多项合成一组，列表里只占一行
      batch,
      batchName: items.length > 1 ? dishName : '',
      shot,
    });
    closeAdd();
    S.batchName = null;
    toast(`已记入${MEAL_NAME[S.meal]} · ${Math.round(items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0))} 千卡`);
    await loadDay();
    if (S.view === 'trends') loadTrends();
  } catch (e) {
    toast(e.message, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = '记入';
  }
}


/* ---------------- 一组记录的详情卡片 ---------------- */
function openGroup(key) {
  const g = groupMap.get(key);
  if (!g) return;
  openDetail(g.logs, true, g.name || '未命名');
}

/* logs：这一组（或这一条）记录；isGroup：多条才显示「N 项」和小计 */
function openDetail(logs, isGroup, title) {
  if (!logs || !logs.length) return;
  const sum = k => Math.round(logs.reduce((a, b) => a + (b[k] || 0), 0));
  const kcal = Math.round(logs.reduce((a, b) => a + (b.kcal || 0), 0));
  const batchKey = logs[0].batch || '';
  const shot = (S.day && S.day.shots && S.day.shots[batchKey]) || '';
  $('#grpName').textContent = title || logs[0].name;
  $('#grpMeta').textContent = isGroup
    ? `${logs.length} 项 · 蛋${sum('p')} / 碳${sum('c')} / 脂${sum('f')}`
    : `${Math.round(logs[0].grams)}g`;
  const img = $('#grpShot');
  if (shot) { img.src = shot; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
  // 拍照记的却没有图 → 说明是旧版本记的，说清楚免得以为丢了
  const noShot = !shot && logs.some(l => l.source === 'photo');
  const tip = $('#grpNoShot');
  if (tip) tip.hidden = !noShot;
  $('#grpItems').innerHTML = logs.map(l => `
    <div class="gitem">
      <div class="n">${esc(l.name)}<span class="sub">${Math.round(l.grams)}g · 蛋${Math.round(l.p)}/碳${Math.round(l.c)}/脂${Math.round(l.f)}</span></div>
      <div class="k">${Math.round(l.kcal)}</div>
      <button class="del" data-gdel="${l.id}">×</button>
    </div>`).join('');
  $('#grpTotal').textContent = kcal;
  S.detailIds = logs.map(l => l.id);
  S.detailIsGroup = !!isGroup;
  S.detailName = title || logs[0].name;
  $$('[data-gdel]', $('#grpItems')).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      await api('/api/logs/' + b.dataset.gdel, null, 'DELETE');
      closeGroup();
      await loadDay();
    } catch (e) { toast(e.message); }
  });
  $('#grpMask').classList.add('on');
  $('#grpSheet').classList.add('on');
}
function closeGroup() {
  $('#grpMask').classList.remove('on');
  $('#grpSheet').classList.remove('on');
}
async function renameGroup() {
  if (!S.detailIds) return;
  const name = prompt(S.detailIsGroup ? '这份叫什么？（比如：沙县小吃）' : '这个食物叫什么？', S.detailName || '');
  if (name === null) return;
  const v = name.trim().slice(0, 20);
  if (!v) return;
  try {
    await api('/api/logs/rename', { ids: S.detailIds, name: v, item: !S.detailIsGroup });
    closeGroup();
    await loadDay();
  } catch (e) { toast(e.message); }
}

/* ---------------- 趋势 ---------------- */
async function loadTrends() {
  try {
    const t = await api('/api/trends?days=' + S.trendDays);
    S.trend = t;
    renderTrends();
  } catch (e) {
    toast(e.message);
  }
}

function renderTrends() {
  const t = S.trend;
  const box = $('#trendBody');
  if (!t) { box.innerHTML = '<div class="empty-state">加载中…</div>'; return; }

  const real = t.real_tdee;
  let realCard = '';
  if (real) {
    const conf = real.confidence;
    const confColor = conf === '较高' ? 'var(--lime)' : conf === '中等' ? 'var(--orange)' : 'var(--muted)';
    realCard = `
      <div class="card">
        <h3>实测每日消耗 <span class="tag" style="color:${confColor};background:rgba(255,255,255,.06)">置信度 ${conf}</span></h3>
        <div class="kpi"><b>${real.tdee}</b><span>千卡 / 天</span></div>
        <div class="hint">
          用你 ${real.span_days} 天的体重变化反推出来的真实消耗。<br>
          体重 ${real.slope_kg_per_week > 0 ? '增加' : '减少'} ${Math.abs(real.slope_kg_per_week)} kg/周，
          期间平均摄入 ${real.avg_intake} 千卡（覆盖 ${real.coverage}% 的天数）。
        </div>
        <div class="grid2" style="margin-top:14px">
          <div class="mini"><div class="k">目标缺口</div><div class="v">${S.day?.targets.deficit ?? '—'}<small>千卡</small></div></div>
          <div class="mini"><div class="k">相对误差</div><div class="v">${
            S.day ? Math.round(Math.abs(real.tdee - S.day.expenditure) / real.tdee * 100) : '—'}<small>%</small></div></div>
        </div>
        <div style="font-size:11px;color:var(--muted2);margin-top:10px;line-height:1.6">
          这个数字才是不说谎的那个。它把所有估算误差（拍照、克重、手表）全吃掉了。
        </div>
      </div>`;
  } else {
    const need = Math.max(0, 14 - (t.weights?.length || 0));
    realCard = `
      <div class="card">
        <h3>实测每日消耗</h3>
        <div class="hint" style="margin-top:0">
          再记录约 <b style="color:var(--text)">${need}</b> 天体重和饮食，我就能反推出你的真实消耗。<br>
          <span style="color:var(--muted2);font-size:11px">原理：7700 千卡 ≈ 1kg 脂肪。体重掉的速率，就是你的真实缺口。</span>
        </div>
        <button class="btn sm" id="goWeight" style="margin-top:14px">记录今天的体重</button>
      </div>`;
  }

  // 体重图
  const weights = t.weights || [];
  let wChart = '';
  if (weights.length >= 2) {
    wChart = `<div class="card">
      <h3>体重趋势</h3>
      ${lineChart(weights, t.start, t.end)}
      <div class="legend">
        <span><i style="background:var(--blue)"></i>体重 kg</span>
        <span style="margin-left:auto">${weights.length} 次记录</span>
      </div>
    </div>`;
  } else {
    wChart = `<div class="card">
      <h3>体重趋势</h3>
      <div class="empty-state" style="padding:16px 0">至少记录 2 次体重才能画图<br>
      <button class="btn sm" id="goWeight2" style="max-width:180px;margin:14px auto 0">记录体重</button></div>
    </div>`;
  }

  // 平衡柱状图
  const bars = t.series.map(s => ({
    date: s.date,
    v: s.balance,
    intake: s.intake,
  }));
  const hasSurplus = bars.some(b => b.v != null && b.v < 0);
  const maxAbs = Math.max(300, ...bars.map(b => Math.abs(b.v || 0)));
  const barHtml = bars.map(b => {
    if (b.v == null) return `<div class="barcol"></div>`;
    if (!hasSurplus) {
      // 全是缺口时，从底部往上长，不浪费一半空间
      const h = b.v / maxAbs * 100;
      return `<div class="barcol" title="${b.date} 缺口 ${b.v}">
        <i style="height:${Math.max(1.5, h)}%;bottom:0;background:var(--lime);opacity:.85"></i>
      </div>`;
    }
    const h = Math.abs(b.v) / maxAbs * 50;
    const up = b.v > 0;
    return `<div class="barcol" title="${b.date} ${b.v}">
      <i style="height:${Math.max(1.5, h)}%;${up ? 'bottom:50%' : 'top:50%'};background:${up ? 'var(--lime)' : 'var(--orange)'};opacity:.85"></i>
    </div>`;
  }).join('');

  box.innerHTML = `
    ${realCard}
    ${t.logged_days === 0 ? `
    <div class="card">
      <h3>每日热量平衡</h3>
      <div class="empty-state" style="padding:26px 0">
        还没有数据<br>
        <span style="font-size:11.5px">去「今日」记第一笔，这里就会说话</span>
      </div>
    </div>` : `
    <div class="card">
      <h3>每日热量平衡 <span class="tag" id="avgTag">${t.avg_balance != null ? (t.avg_balance >= 0 ? '平均缺口 ' + t.avg_balance : '平均盈余 ' + Math.abs(t.avg_balance)) : '暂无数据'}</span></h3>
      <div class="barchart ${hasSurplus ? '' : 'bottom'}">${barHtml}</div>
      <div class="legend">
        <span><i style="background:var(--lime)"></i>缺口</span>
        <span><i style="background:var(--orange)"></i>盈余</span>
        <span style="margin-left:auto">${t.logged_days} / ${t.days} 天有记录</span>
      </div>
    </div>`}
    ${wChart}
    <div class="card">
      <h3>区间统计</h3>
      <div class="grid2">
        <div class="mini"><div class="k">平均摄入</div><div class="v">${t.avg_intake || '—'}<small>千卡</small></div></div>
        <div class="mini"><div class="k">平均消耗</div><div class="v">${t.avg_expenditure || '—'}<small>千卡</small></div></div>
        <div class="mini"><div class="k">记录天数</div><div class="v">${t.logged_days}<small>/ ${t.days}</small></div></div>
        <div class="mini"><div class="k">体重变化</div><div class="v">${
          weights.length >= 2
            ? ((weights[weights.length - 1].kg - weights[0].kg) >= 0 ? '+' : '') +
              (weights[weights.length - 1].kg - weights[0].kg).toFixed(1) + '<small>kg</small>'
            : '—'}</div></div>
      </div>
    </div>`;

  const gw = $('#goWeight') || $('#goWeight2');
  if (gw) gw.onclick = openWeight;
}

function lineChart(points, start, end) {
  const W = 320, H = 130, pl = 4, pr = 4, pt = 12, pb = 22;
  const xs = points.map(p => +parseISO(p.date));
  const ys = points.map(p => p.kg);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1.2) { const m = (max + min) / 2; min = m - 0.6; max = m + 0.6; }
  const padY = (max - min) * 0.18;
  min -= padY; max += padY;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = v => pl + (W - pl - pr) * (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0));
  const Y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min));

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');
  const area = `${path} L${X(xs[xs.length - 1]).toFixed(1)},${H - pb} L${X(xs[0]).toFixed(1)},${H - pb} Z`;
  const dots = points.map((p, i) => {
    const last = i === points.length - 1;
    return `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="${last ? 3.5 : 2}" fill="${last ? '#d6ff4b' : '#6ea8ff'}" stroke="#15181b" stroke-width="1.5"/>`;
  }).join('');

  const first = points[0], last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ea8ff" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#6ea8ff" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#wg)"/>
    <path d="${path}" fill="none" stroke="#6ea8ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}" style="font-size:9px">${first.date.slice(5)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" style="font-size:9px">${last.date.slice(5)}</text>
    <text x="${pl}" y="${Y(max) + 10}" style="font-size:9px">${max.toFixed(1)}</text>
    <text x="${pl}" y="${Y(min) - 2}" style="font-size:9px">${min.toFixed(1)}</text>
  </svg>`;
}

/* ---------------- 主题 ---------------- */
const THEMES = { lime: '#d6ff4b', blue: '#6ea8ff', orange: '#ff9f45' };
const THEME_NAMES = { lime: '荧光绿', blue: '海水蓝', orange: '活力橙' };
function applyTheme(name) {
  const c = THEMES[name] || THEMES.lime;
  document.documentElement.style.setProperty('--lime', c);
}


/* 左边缘往右滑 = 返回（关卡片 / 关弹层 / 退出我的子页） */
function goBack() {
  const on = id => { const el = $(id); return el && el.classList.contains('on'); };
  if (on('#grpSheet')) return closeGroup();
  if (on('#addSheet')) return closeAdd();
  if (on('#helpSheet')) return closeHelp();
  if (on('#watchSheet')) return closeWatch();
  if (on('#weightSheet')) return closeWeight();
  if (mePage) {
    const v = $('#view-me');
    if (v) v.classList.add('slideout');
    setTimeout(() => {
      mePage = null;
      if (v) v.classList.remove('slideout');
      renderMe();
    }, 170);
  }
}

/* ---------------- 我的 / 设置 ---------------- */
let mePage = null;

function meBackBar(title) {
  return `<div class="mehead">
    <button class="mehead-back" id="meBack" aria-label="返回">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>
    </button>
    <h2>${title}</h2>
  </div>`;
}

function renderMe() {
  const d = S.day;
  if (!d) return;
  const p = d.profile || {};
  const acts = d.activity_labels || {};
  const sugGoal = Math.round(-(Number(p.weight_kg || 60) * 0.005) * 20) / 20 || -0.3;
  const sugKcal = Math.round(Math.abs(sugGoal) * 7700 / 7);
  const opt = Object.entries(acts).map(([k, v]) =>
    `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const g = Math.abs(p.goal_rate ?? -0.25);

  let h = '';

  if (!mePage) {
    h = `
      <h1 class="pagetitle">设置</h1>
      <div class="setgroup">
        <button class="srow" data-page="body">
          <span>身体与目标</span>
          <em>${p.height_cm || 165}cm · ${p.weight_kg || 60}kg</em><i>›</i>
        </button>
        <button class="srow" data-page="nutri">
          <span>营养目标</span>
          <em>${d.targets.kcal_budget} 千卡 / 天</em><i>›</i>
        </button>
      </div>
      <div class="seclabel">功能</div>
      <div class="setgroup">
        <button class="srow" data-page="ai">
          <span>AI 识别</span>
          <em>${d.has_key ? '已配置' : '未配置'}</em><i>›</i>
        </button>
        <button class="srow" data-page="theme">
          <span>个性化</span>
          <em>${THEME_NAMES[d.theme] || '荧光绿'}</em><i>›</i>
        </button>
        <button class="srow" data-page="notify">
          <span>通知</span>
          <em>${d.sync_toast ? '开' : '关'}</em><i>›</i>
        </button>
      </div>
      <div class="seclabel">其他</div>
      <div class="setgroup">
        <button class="srow" data-page="data">
          <span>数据备份</span><em></em><i>›</i>
        </button>
        <button class="srow" data-page="about">
          <span>关于与更新</span><em>${APP_VERSION}</em><i>›</i>
        </button>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>版本更新 <span class="tag" style="color:var(--muted);background:rgba(255,255,255,.06)">${APP_VERSION}</span></h3>
        <div class="hint" style="margin:0 0 14px">iPhone 会缓存网页。看到旧界面就点下面的按钮强制刷新，不动数据。</div>
        <button class="btn primary" id="hardReload">强制更新</button>
      </div>
      <div style="height:26px"></div>`;
  } else if (mePage === 'body') {
    h = meBackBar('身体与目标') + `
      <div class="card">
        <div class="split">
          <div class="field">
            <label>性别</label>
            <select id="fSex">
              <option value="" ${!p.sex ? 'selected' : ''} disabled>请选择</option>
              <option value="female" ${p.sex === 'female' ? 'selected' : ''}>女</option>
              <option value="male" ${p.sex === 'male' ? 'selected' : ''}>男</option>
            </select>
          </div>
          <div class="field">
            <label>出生年份</label>
            <input id="fYear" type="number" inputmode="numeric" value="${p.birth_year || 1995}">
          </div>
          <div class="field">
            <label>身高（cm）</label>
            <input id="fHeight" type="number" inputmode="decimal" value="${p.height_cm || 165}">
          </div>
          <div class="field">
            <label>体重（kg）</label>
            <input id="fWeight" type="number" inputmode="decimal" step="0.1" value="${p.weight_kg || 60}">
          </div>
        </div>
        <div class="field">
          <label>日常活动量</label>
          <select id="fAct">${opt}</select>
          <div class="hint">没有手表数据时用来估算日常消耗。有手表的话会被覆盖。</div>
        </div>
        <div class="field">
          <label>目标速度（kg / 周）</label>
          <input id="fGoalRate" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="0.5" value="${g}">
          <div class="hint">填 <b>0.5</b> = 每周减 0.5 公斤；<b>0</b> = 维持；负数 = 增肌。<br>按你 ${p.weight_kg || 60}kg 算，<b style="color:var(--lime)">建议 ${Math.abs(sugGoal)}</b>（≈ 每天 ${sugKcal} 千卡缺口）。</div>
        </div>
        <div class="field">
          <label>蛋白质目标（g / kg 体重）</label>
          <input id="fProt" type="number" inputmode="decimal" step="0.1" value="${p.protein_per_kg || 1.6}">
          <div class="hint">减脂期建议 1.6–2.2。肌肉量越大、练得越狠，取越高。</div>
        </div>
        <button class="btn primary" id="saveProfile">保存</button>
        <button class="btn ghost sm" id="openWeight2" style="margin-top:10px">记录今天的体重</button>
      </div>`;
  } else if (mePage === 'ai') {
    h = meBackBar('AI 识别') + `
      <div class="card">
        <div class="hint" style="margin:0 0 14px">用于拍照识别食物、读营养成分表。Key 只存在这台设备，不上传。</div>
        <div class="field">
          <label>DashScope API Key</label>
          <input id="fKey" type="password" placeholder="${d.has_key ? '已保存，如需更换请重新填写' : 'sk-...'}" autocomplete="off">
          <div class="hint">获取地址：bailian.console.aliyun.com</div>
        </div>
        <div class="btnrow">
          <button class="btn sm" id="saveKey">保存</button>
          <button class="btn sm" id="testKey">测试连接</button>
        </div>
        ${d.ai_model ? `<div style="font-size:11px;color:var(--muted2);margin-top:10px">当前模型：${esc(d.ai_model)}</div>` : ''}
      </div>`;
  } else if (mePage === 'data') {
    h = meBackBar('数据备份') + `
      <div class="card">
        <div class="hint" style="margin:0 0 14px">
          卸载 / 重新添加主屏幕 App 会清空数据。<b>卸载前先点下面的备份</b>，装回来再「从 iCloud 恢复」。
        </div>
        <button class="btn primary" id="exportJson">备份到 iCloud</button>
        <button class="btn sm" id="importJson" style="margin-top:10px">从 iCloud 恢复</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <div class="hint" style="margin-top:12px" id="backupAt"></div>
        <div class="btnrow" style="margin-top:14px">
          <button class="btn ghost sm" id="exportCsv">导出 CSV</button>
        </div>
      </div>
`;
  } else if (mePage === 'nutri') {
    const a = (d.targets.auto) || {};
    h = meBackBar('营养目标') + `
      <div class="card">
        <div class="hint" style="margin:0 0 16px">全留空 = 用建议值（会随体重和消耗自动变）。填了就以你填的为准。</div>
        <div class="field">
          <label>目标缺口（千卡 / 天）</label>
          <input id="nDef" type="number" inputmode="numeric" value="${d.targets.deficit}">
          <div class="hint">= 目标速度 ${Math.abs(Number(p.goal_rate ?? 0))} kg/周 × 7700 ÷ 7${d.targets.deficit !== (a.deficit ?? d.targets.deficit) ? '（已封顶）' : ''}</div>
        </div>
        <div class="field">
          <label>每日可吃（千卡）</label>
          <input id="nKcal" type="number" inputmode="numeric" value="${d.targets.kcal_budget}">
          <div class="hint">= 全天消耗 ${d.expenditure} − 目标缺口 ${d.targets.deficit}<br><span style="color:var(--muted2)">全天消耗 = 基础代谢 ${(d.expenditure_detail && d.expenditure_detail.resting) ? Math.round(d.expenditure_detail.resting) : '—'} + 手表活动 ${(d.expenditure_detail && d.expenditure_detail.active) ? Math.round(d.expenditure_detail.active) : '—'}</span></div>
        </div>
        <div class="field">
          <label>蛋白质（g）</label>
          <input id="nProt" type="number" inputmode="numeric" value="${d.targets.protein_g}">
          <div class="hint">建议 ${a.protein_g ?? d.targets.protein_g}（体重 × 系数）</div>
        </div>
        <div class="field">
          <label>碳水（g）</label>
          <input id="nCarb" type="number" inputmode="numeric" value="${d.targets.carb_g}">
          <div class="hint">建议 ${a.carb_g ?? d.targets.carb_g}</div>
        </div>
        <div class="field">
          <label>脂肪（g）</label>
          <input id="nFat" type="number" inputmode="numeric" value="${d.targets.fat_g}">
          <div class="hint">建议 ${a.fat_g ?? d.targets.fat_g}</div>
        </div>
        <div class="btnrow">
          <button class="btn primary" id="saveNutri" style="flex:2">保存</button>
          <button class="btn sm" id="resetNutri">恢复建议</button>
        </div>
      </div>`;
  } else if (mePage === 'theme') {
    const cur = d.theme || 'lime';
    h = meBackBar('个性化') + `
      <div class="card">
        <h3>主题色</h3>
        <div class="hint" style="margin:0 0 14px">只影响高亮色（圆环、按钮、数字强调），不影响数据。</div>
        <div class="themepick">
          ${Object.entries(THEMES).map(([k, v]) => `
            <button class="swatch" data-theme="${k}" style="--c:${v}">
              <span class="dot" style="background:${v}"></span>
              <span>${THEME_NAMES[k]}</span>
              ${cur === k ? '<b>✓</b>' : ''}
            </button>`).join('')}
        </div>
      </div>`;
  } else if (mePage === 'notify') {
    h = meBackBar('通知') + `
      <div class="card">
        <div class="switchrow">
          <div>
            <div class="stitle">同步完成后弹提示</div>
            <div class="hint" style="margin:4px 0 0">拉到新的手表数据时，顶部弹一条提示；关掉就安静同步。</div>
          </div>
          <label class="sw"><input type="checkbox" id="swToast" ${d.sync_toast ? 'checked' : ''}><i></i></label>
        </div>
      </div>
      <div class="card">
        <h3>关于推送</h3>
        <div class="hint" style="margin:0">
          网页 App 不能像原生 App 那样在后台推送通知，这是 iOS 的限制。<br>
          需要「到点提醒」的话，可以在快捷指令的自动化里加一个「显示通知」动作。
        </div>
      </div>`;
  } else if (mePage === 'about') {
    h = meBackBar('关于与更新') + `
      <div class="about-fill">
      <div class="card">
        <h3>最近更新 <span class="tag" style="color:var(--muted);background:rgba(255,255,255,.06)">${APP_VERSION}</span></h3>
        ${RELEASES.map(r => `
          <div class="rel-date">${r.d}</div>
          ${r.groups.map(([g, items]) => `
            ${g ? `<div class="rel-group">${g}</div>` : ''}
            <ul class="rel-list">${items.map(t => `<li>${t}</li>`).join('')}</ul>
          `).join('')}
        `).join('')}
      </div>
      <div class="card tight" style="margin-bottom:0">
        <div class="hint" style="margin:0;font-size:10.5px;color:var(--muted2)" id="dbgLine">—</div>
      </div>
      <div class="card tight">
        <h3>这套算法在算什么</h3>
        <div class="hint" style="margin:0;line-height:1.6;font-size:11px">
          <b style="color:var(--text)">基础代谢</b>：Mifflin-St Jeor 公式（体重、身高、年龄、性别）。<br>
          <b style="color:var(--text)">全天消耗</b>：手表给了活动能量 → 基础代谢 + 活动能量；给的是总消耗 → 直接用；都没 → 基础代谢 × 活动系数。<br>
          <b style="color:var(--text)">目标缺口</b>：目标速度 × 7700 ÷ 7，封顶在当天消耗的 22%。<br>
          <b style="color:var(--text)">还能吃</b>：全天消耗 − 目标缺口 − 已吃。<br>
          <b style="color:var(--text)">实际缺口</b>：全天消耗 − 已吃。正数缺口，负数盈余。<br>
          <b style="color:var(--text)">实测消耗</b>（趋势页）：体重回归斜率 × 7700。<br>
          <span style="color:var(--muted2);font-size:11px">单日有 ±20% 误差，看 7 天平均。</span>
        </div>
      </div>
      </div>`;
  }

  $('#meBody').innerHTML = h;
  fitAboutFill();
  wireMe();
}

/* 关于页：让两张卡正好铺满，页面本身不滚，只有上面那张卡内部滚 */
function fitAboutFill() {
  const doc = document.documentElement;
  const fill = document.querySelector('.about-fill');
  if (!fill) { doc.classList.remove('noscroll'); return; }
  const tab = document.querySelector('.tabbar');
  const tabTop = tab ? tab.getBoundingClientRect().top : window.innerHeight - 60;
  const top = fill.getBoundingClientRect().top;
  fill.style.height = Math.max(240, Math.round(tabTop - top - 12)) + 'px';
  // 这一页整页不滚，滚动只发生在上面那张卡里
  doc.classList.add('noscroll');
}

function wireMe() {
  const dbg = $('#dbgLine');
  if (dbg) {
    const tb = document.querySelector('.topbar');
    const tbH = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
    const tbPad = tb ? getComputedStyle(tb).paddingTop : '';
    dbg.textContent = `视口 ${Math.round(window.innerWidth)}×${Math.round(window.innerHeight)} · 顶栏 ${tbH}px（上边距 ${tbPad}）· ${APP_VERSION}`;
  }
  const back = $('#meBack');
  if (back) back.onclick = () => { mePage = null; renderMe(); };
  $$('.srow').forEach(b => b.onclick = () => { mePage = b.dataset.page; renderMe(); });

  $$('.swatch').forEach(b => b.onclick = async () => {
    const t = b.dataset.theme;
    applyTheme(t);
    if (S.day) S.day.theme = t;   // 先让勾选立刻跟上
    renderMe();
    await api('/api/settings', { theme: t });
    await loadDay();
    toast('已切换主题');
  });

  const nd = $('#nDef'), nk = $('#nKcal');
  if (nd && nk) {
    const exp = (S.day && S.day.expenditure) || 0;
    nd.oninput = () => { nk.value = Math.max(600, Math.round(exp - (Number(nd.value) || 0))); };
    nk.oninput = () => { nd.value = Math.round(exp - (Number(nk.value) || 0)); };
  }
  const sn = $('#saveNutri');
  if (sn) sn.onclick = async () => {
    try {
      const a = (S.day && S.day.targets && S.day.targets.auto) || {};
      // 只有和“建议值”不同的才存成手动值；全都一样就等于恢复自动
      const pick = (sel, autoVal) => {
        const v = Number(($(sel) || {}).value);
        if (!isFinite(v) || v <= 0) return undefined;
        if (autoVal && Math.abs(v - autoVal) < 1) return undefined;
        return v;
      };
      const ov = {
        kcal: pick('#nKcal', a.kcal_budget),
        protein: pick('#nProt', a.protein_g),
        carb: pick('#nCarb', a.carb_g),
        fat: pick('#nFat', a.fat_g),
      };
      Object.keys(ov).forEach(k => ov[k] === undefined && delete ov[k]);
      await api('/api/settings', { target_override: ov });
      toast(Object.keys(ov).length ? '已保存营养目标' : '已恢复为建议值');
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  const rn = $('#resetNutri');
  if (rn) rn.onclick = async () => {
    await api('/api/settings', { target_override: {} });
    toast('已恢复建议值');
    await loadDay();
    renderMe();
  };

  const sw = $('#swToast');
  if (sw) sw.onchange = async () => {
    await api('/api/settings', { sync_toast: sw.checked });
    toast(sw.checked ? '同步提示已打开' : '同步提示已关闭');
  };

  const sp = $('#saveProfile');
  if (sp) sp.onclick = async () => {
    const sex = $('#fSex').value;
    if (sex !== 'male' && sex !== 'female') { toast('先选一下性别（基础代谢差 166 千卡）', 3000); return; }
    try {
      await api('/api/profile', {
        sex: $('#fSex').value,
        birth_year: Number($('#fYear').value),
        height_cm: Number($('#fHeight').value),
        weight_kg: Number($('#fWeight').value),
        activity: $('#fAct').value,
        goal_rate: (() => {
          const raw = $('#fGoalRate').value.trim();
          if (raw === '') return -0.25;
          const v = Number(raw);
          return isFinite(v) ? -v : -0.25;
        })(),
        protein_per_kg: Number($('#fProt').value),
      });
      const sv = Store.load().profile;
      toast(`已保存：${sv.sex === 'male' ? '男' : '女'} · ${sv.height_cm}cm · ${sv.weight_kg}kg`, 2800);
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };

  const w2 = $('#openWeight2'); if (w2) w2.onclick = openWeight;

  const hr = $('#hardReload');
  if (hr) hr.onclick = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    toast('正在更新…', 1200);
    // 带一个随机参数重开，绕开 GitHub Pages 的 10 分钟 CDN 缓存
    setTimeout(() => {
      const u = location.pathname + '?r=' + Date.now();
      location.replace(u);
    }, 400);
  };

  const ec = $('#exportCsv'); if (ec) ec.onclick = () => { downloadCsv(); toast('已导出 CSV'); };
  const ba = $('#backupAt');
  if (ba) {
    const t = Store.load().settings.lastBackupAt;
    ba.textContent = t ? '上次备份：' + t : '还没有备份过';
  }
  const ej = $('#exportJson');
  if (ej) ej.onclick = async () => {
    try {
      const r = await exportJson();
      if (r === 'cancel') return;
      const t = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      setSetting('lastBackupAt', t);
      if (ba) ba.textContent = '上次备份：' + t;
      toast(r === 'shared' ? '已存到「文件」/ iCloud Drive' : '已下载备份文件', 3000);
    } catch (e) { toast('备份失败：' + e.message, 4000); }
  };
  const ij = $('#importJson');
  if (ij) ij.onclick = () => {
    if (!confirm('恢复会用备份覆盖手机上现在的全部数据，确定吗？')) return;
    $('#importFile').click();
  };
  const iff = $('#importFile');
  if (iff) iff.onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importJson(await f.text());
      toast('已恢复备份');
      applyTheme(Store.load().settings.theme || 'lime');
      await loadDay();
      renderMe();
    } catch (err) {
      toast('恢复失败：' + err.message, 4000);
    }
    e.target.value = '';
  };

  const sk = $('#saveKey');
  if (sk) sk.onclick = async () => {
    const v = $('#fKey').value.trim();
    if (!v) return toast('先填入 Key');
    try {
      await api('/api/settings', { dashscope_key: v });
      const sv = Store.load().profile;
      toast(`已保存：${sv.sex === 'male' ? '男' : '女'} · ${sv.height_cm}cm · ${sv.weight_kg}kg`, 2800);
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  const tk = $('#testKey');
  if (tk) tk.onclick = async () => {
    const v = $('#fKey').value.trim();
    if (v) await api('/api/settings', { dashscope_key: v });
    try {
      const r = await api('/api/settings/test', {});
      toast('连接正常：' + r.message);
    } catch (e) { toast(e.message, 5000); }
  };
}

/* ---------------- 手表 ---------------- */
function openWatch() {
  const w = (S.day && S.day.watch) || {};
  $('#wActive').value = w.active ?? '';
  $('#wResting').value = w.resting ?? '';
  $('#wTotal').value = w.total ?? '';
  $('#wSteps').value = w.steps ?? '';
  $('#watchDate').textContent = S.date === S.today ? '今天' : S.date.slice(5);
  let note = w.source === 'photo' ? '上次是从截图读的。' : '';
  if (w.source === 'cloud' && w.cloudAt) {
    note = `云端最近一次：${String(w.cloudAt).slice(5)} · 活动 ${w.active} 千卡。快捷指令只在它运行时写新数据，数字不变就是还没写新的。`;
  }
  $('#watchNote').textContent = note;
  $('#watchMask').classList.add('on');
  $('#watchSheet').classList.add('on');
}
function closeWatch() {
  $('#watchMask').classList.remove('on');
  $('#watchSheet').classList.remove('on');
}

async function saveWatch() {
  const num = id => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const body = {
    date: S.date,
    active: num('#wActive'),
    resting: num('#wResting'),
    total: num('#wTotal'),
    steps: num('#wSteps'),
    source: 'manual',
  };
  if (body.active == null && body.total == null && body.resting == null) {
    return toast('至少填一项');
  }
  try {
    await api('/api/daily', body);
    closeWatch();
    toast('已保存');
    await loadDay();
    if (S.view === 'trends') loadTrends();
    if (S.view === 'me') renderMe();
  } catch (e) { toast(e.message); }
}

async function readWatchShot(file) {
  if (!file) return;
  try {
    const img = await compress(file, 1400, 0.85);
    toast('正在读取截图…');
    const r = await api('/api/ai/watch', { image: img });
    if (r.active_kcal != null) $('#wActive').value = Math.round(r.active_kcal);
    if (r.resting_kcal != null) $('#wResting').value = Math.round(r.resting_kcal);
    if (r.total_kcal != null) $('#wTotal').value = Math.round(r.total_kcal);
    if (r.steps != null) $('#wSteps').value = Math.round(r.steps);
    $('#watchNote').textContent = r.note || '读出来了，核对一下再保存。';
    toast('读取完成');
  } catch (e) {
    toast(e.message, 5000);
  }
}

/* ---------------- 体重 ---------------- */
function openWeight() {
  $('#weightInput').value = S.day?.profile?.weight_kg || '';
  $('#weightMask').classList.add('on');
  $('#weightSheet').classList.add('on');
  setTimeout(() => $('#weightInput').focus(), 300);
}
function closeWeight() {
  $('#weightMask').classList.remove('on');
  $('#weightSheet').classList.remove('on');
}

async function saveWeight() {
  const v = Number($('#weightInput').value);
  if (!v || v < 20 || v > 300) return toast('填个体重数字');
  try {
    await api('/api/weight', { date: S.date, kg: v });
    closeWeight();
    toast('已记录');
    await loadDay();
    if (S.view === 'trends') loadTrends();
  } catch (e) { toast(e.message); }
}

/* ---------------- 导航 ---------------- */
function switchView(v) {
  if (v !== 'me') document.documentElement.classList.remove('noscroll');
  if (window.scTop) window.scTop();
  S.view = v;
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + v));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.body.classList.toggle('view-me', v === 'me');
  document.body.classList.toggle('view-trends', v === 'trends');
  window.scrollTo({ top: 0 });
  if (v === 'trends') { renderTrends(); loadTrends(); }
  if (v === 'me') { mePage = null; renderMe(); }
}

/* ---------------- 自动同步帮助 ---------------- */

function watchUrlTemplate() {
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return `${base}?watch=1&a=[活动能量]&r=[静息能量]`;
}

function showShortcutHelp() {
  $('#helpBody').innerHTML = `
    <div class="sechead">现在的同步流程</div>
    <div class="step"><b>1</b><div>每天 23:00，快捷指令「<b>热量采集</b>」读一次当天的「活动能量」</div></div>
    <div class="step"><b>2</b><div>它把结果写进你 GitHub 仓库里的 <code>health.json</code></div></div>
    <div class="step"><b>3</b><div>打开这个 App 时自动去取，<b>不经过 Safari，也不弹浏览器</b></div></div>

    <div class="sechead">要确认的一步：自动化指向它</div>
    <div class="step"><b>4</b><div>「快捷指令」App → 底部 <b>自动化</b> → 点「23:00」那条</div></div>
    <div class="step"><b>5</b><div>点动作里的蓝色「<b>快捷指令</b>」字样 → 选「<b>热量采集</b>」→ 完成</div></div>
    <div class="step"><b>6</b><div>确认那条自动化的总开关是<b>打开</b>状态</div></div>

    <div class="sechead">怎么知道它在工作</div>
    <div class="step"><b>7</b><div>23:00 之后打开 App，「消耗」会显示 <b>基础代谢 + 活动消耗</b></div></div>
    <div class="step"><b>8</b><div>数字没变，点右上角 <b>⟳</b> 刷新一次</div></div>

    <div class="sechead">一直没数据时，按顺序查</div>
    <div class="step"><b>A</b><div>权限：设置 → 隐私与安全性 → 健康 → 快捷指令 → <b>活动能量「完全访问」</b></div></div>
    <div class="step"><b>B</b><div>健康 App 里当天确实有「活动能量」数据</div></div>
    <div class="step"><b>C</b><div>手动点一次「热量采集」运行，看会不会报「未找到样本」</div></div>

    <div class="hint" style="margin-top:14px">
      不想等自动同步时，也可以手动填：<b>我的 → 手表/消耗数据 → ⌨️ 手动填写</b>，10 秒搞定。
    </div>`;

  $('#helpCopy').onclick = closeHelp;
  $('#helpMask').classList.add('on');
  $('#helpSheet').classList.add('on');
}

function closeHelp() {
  $('#helpMask').classList.remove('on');
  $('#helpSheet').classList.remove('on');
}

/* ---------------- 快捷指令自动同步 ---------------- */

/**
 * iOS 快捷指令可以每天自动读取健康数据，然后打开形如
 *   ?watch=1&a=480&r=1580&s=9200
 * 的链接。这里把它接住，写进当天记录，再把参数从地址栏抹掉。
 */
function consumeHealthLink() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('watch')) return null;
    const g = k => {
      const v = u.searchParams.get(k);
      return (v === null || v === '') ? null : Number(v);
    };
    const active = g('a'), resting = g('r'), total = g('t'), steps = g('s');
    if (active === null && resting === null && total === null) return null;
    const date = u.searchParams.get('d') || todayISO();
    const d = Store.load();
    d.daily[date] = { active, resting, total, steps, source: 'shortcut' };
    Store.save();
    history.replaceState(null, '', u.pathname + u.hash);
    return date;
  } catch (e) {
    return null;
  }
}

/* ---------------- 云端同步（GitHub 上的 health.json） ---------------- */

/**
 * 快捷指令每天把「日期|活动能量」写进仓库根目录的 health.json。
 * 这里在打开 App 时拉一次，写进当天记录。
 * 日期可能是「2026-10-18」「2026/10/18」「2026年10月18日 22:09」等，
 * 统一宽松解析；实在解析不出来就当作今天。
 */
function parseLooseDate(s) {
  const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return isoOf(d);
  return null;
}

/* 最近一次从 health.json 读到的内容，给刷新提示用 */
let lastCloud = null;

async function pullCloudData() {
  try {
    const res = await fetch('health.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    if (!txt) return null;
    const sep = txt.includes('|') ? '|' : ',';
    const i = txt.lastIndexOf(sep);
    if (i < 0) return null;
    const head = txt.slice(0, i).trim();
    // 值可能是单个数字，也可能是多行/多列的数值列表，全部加起来
    const tail = String(txt.slice(i + 1)).replace(/(\d),(\d)/g, '$1$2');
    const nums = tail.match(/\d+(?:\.\d+)?/g) || [];
    const active = Math.round(nums.reduce((s, n) => s + Number(n), 0));
    if (!active || active <= 0) return null;
    const date = parseLooseDate(head) || todayISO();
    // 快捷指令写进去的时刻，用来告诉用户「这份数据是什么时候的」
    const tm = head.match(/(\d{1,2}):(\d{2})/);
    const at = tm ? `${date} ${String(tm[1]).padStart(2, '0')}:${tm[2]}` : date;
    const d = Store.load();
    const cur = d.daily[date] || {};
    const unchanged = cur.active === active && cur.source === 'cloud';
    d.daily[date] = Object.assign({}, cur, { active, source: 'cloud', cloudAt: at });
    if (!unchanged || cur.cloudAt !== at) Store.save();
    lastCloud = { date, active, at, changed: !unchanged };
    return unchanged ? null : date;
  } catch (e) {
    return null;
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  const synced = consumeHealthLink();
  $$('.tab').forEach(b => b.onclick = () => switchView(b.dataset.view));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 新版本接管后自动刷新一次，避免要关掉重开两遍才更新
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }
  $('#prevDay').onclick = () => { S.date = addDays(S.date, -1); loadDay(); };
  $('#nextDay').onclick = () => {
    if (S.date >= S.today) return;
    S.date = addDays(S.date, 1);
    loadDay();
  };
  $('#fab').onclick = () => openAdd();
  $('#addTop').onclick = () => openAdd();
  $('#addClose').onclick = closeAdd;
  $('#addMask').onclick = closeAdd;

  $$('#addTabs button').forEach(b => b.onclick = () => setAddMode(b.dataset.m));
  $('#photo2Cam').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#photo2Alb').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#del2').onclick = ev => {
    ev.stopPropagation();
    if (S.photo2URL) { URL.revokeObjectURL(S.photo2URL); S.photo2URL = null; }
    S.photo2Data = null;
    $('#pv2').removeAttribute('src');
    $('#pv2').hidden = true;
    $('#del2').hidden = true;
    $('#emptyB').hidden = false;
  };

  const pickCam = () => $('#photoInput').click();
  const pickAlb = () => $('#photoAlbum').click();
  $('#pickCamera').onclick = ev => { ev.stopPropagation(); pickCam(); };
  $('#pickAlbum').onclick = ev => { ev.stopPropagation(); pickAlb(); };
  $('#photoDel').onclick = ev => { ev.stopPropagation(); resetPhotoUI(); };
  $('#photoAlbum').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#photoInput').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#photoGo').onclick = runPhoto;
  $('#textGo').onclick = runText;
  $('#saveItems').onclick = saveItems;
  $('#resultReset').onclick = () => {
    S.items = [];
    resetPhotoUI();
    $('#resultArea').hidden = true;
    $('#addFoot').hidden = true;
  };

  let searchTimer = null;
  $('#searchInput').oninput = e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => runSearch(v), 120);
  };

  $$('#mealPick .chip').forEach(c => c.onclick = () => {
    S.meal = c.dataset.meal;
    renderMealPick();
  });

  const qw = $('#quickWatch');
  if (qw) qw.onclick = openWatch;
  const gm = $('#goMe');
  if (gm) gm.onclick = () => switchView(S.view === 'me' ? 'today' : 'me');
  const refreshBtn = $('#cloudRefresh');
  // 手动刷新时，如果还是旧数据，后台再自动补拉几次（GitHub Pages 发布要几十秒）
  let retryLeft = 0, retryBusy = false;
  async function retryPullCloud() {
    if (retryBusy || retryLeft <= 0) return;
    retryBusy = true;
    retryLeft--;
    setTimeout(async () => {
      const d = await pullCloudData();
      if (d) {
        retryLeft = 0; retryBusy = false;
        loadDay();
        toast(`✅ 已拿到新数据：${lastCloud.at.slice(5)} · 活动 ${lastCloud.active} 千卡`, 3000);
      } else if (retryLeft <= 0) {
        retryBusy = false;
      } else {
        retryPullCloud();
      }
    }, 20000);
  }

  async function pullNow() {
    if (!refreshBtn) return;
    refreshBtn.classList.add('spin');
    let date = null;
    try { date = await pullCloudData(); } catch (e) {}
    refreshBtn.classList.remove('spin');
    loadDay();
    const dd = Store.load().daily[S.today] || {};
    const c = lastCloud;
    if (date) { retryLeft = 0; toast(`✅ 已更新：${c.at.slice(5)} 云端数据 · 活动 ${c.active} 千卡`, 2800); }
    else if (c && c.at) {
      retryLeft = 3;
      retryPullCloud();
      toast(`✅ 现在是 ${c.at.slice(5)} 那份（活动 ${c.active} 千卡），后台帮你再等新数据`, 3200);
    }
    else if (dd.active) toast('已读取：活动消耗 ' + dd.active + ' 千卡', 2400);
    else toast('云端还没有今天的数据，先跑一次「热量采集」', 3000);
  }
  if (refreshBtn) refreshBtn.onclick = () => pullNow();  $('#watchClose').onclick = closeWatch;
  $('#watchMask').onclick = closeWatch;
  $('#watchSave').onclick = saveWatch;
  $('#watchPick').onclick = () => $('#watchInput').click();
  $('#watchInput').onchange = e => readWatchShot(e.target.files[0]);

  $('#weightClose').onclick = closeWeight;
  $('#weightMask').onclick = closeWeight;
  $('#weightSave').onclick = saveWeight;

  $('#helpClose').onclick = closeHelp;
  $('#helpMask').onclick = closeHelp;
  $('#grpClose').onclick = closeGroup;
  $('#grpMask').onclick = closeGroup;
  $('#grpRename').onclick = renameGroup;

  $$('#trendSeg button').forEach(b => b.onclick = () => {
    $$('#trendSeg button').forEach(x => x.classList.toggle('on', x === b));
    S.trendDays = Number(b.dataset.d);
    loadTrends();
  });

  // Safari 里打开的是独立副本，提醒一下，避免和主屏幕 App 的数字混淆
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) {
    const b = document.createElement('div');
    b.className = 'safariwarn';
    b.textContent = '你正在 Safari 里打开，这份数据是独立的副本，和主屏幕「热量账本」App 不互通。日常请在主屏幕打开。';
    document.querySelector('.app').prepend(b);
  }

  // 有弹层/卡片打开时锁住背后的页面滚动
  const syncLock = () => {
    const on = !!document.querySelector('.sheet.on, .modal.on');
    document.documentElement.classList.toggle('lock', on);
  };
  new MutationObserver(syncLock).observe(document.body, {
    attributes: true, subtree: true, attributeFilter: ['class'],
  });
  syncLock();

  // 保底：如果系统仍把整个 webview 拖走，用 visualViewport 的反向补偿把顶栏钉回去
  const tbEl = document.querySelector('.topbar');
  const vv = window.visualViewport;
  if (tbEl && vv) {
    const pinTop = () => {
      const off = Math.round((vv.offsetTop || 0) + (window.scrollY || 0));
      tbEl.style.transform = off ? 'translateY(' + off + 'px)' : '';
    };
    vv.addEventListener('scroll', pinTop, { passive: true });
    vv.addEventListener('resize', pinTop, { passive: true });
    window.addEventListener('scroll', pinTop, { passive: true });
  }

  // 手写滚动：不交给系统，顶栏绝对不会跟着动
  const SC = { el: null, body: null, y: 0, max: 0, drag: false, sy: 0, st: 0, ly: 0, lt: 0, vy: 0, raf: 0 };
  const scSet = y => { SC.y = y; SC.body.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)'; };
  const scStop = () => { if (SC.raf) { cancelAnimationFrame(SC.raf); SC.raf = 0; } };
  const scClamp = y => Math.min(0, Math.max(-SC.max, y));
  const scMeasure = () => {
    if (!SC.el || !SC.body) return;
    SC.max = Math.max(0, SC.body.offsetHeight - SC.el.clientHeight);
    scSet(scClamp(SC.y));
  };
  const scSpark = () => {
    scStop();
    const step = () => {
      SC.vy *= 0.94;
      let next = SC.y + SC.vy * 16;
      if (next > 0 || next < -SC.max) {
        const target = next > 0 ? 0 : -SC.max;
        next += (target - next) * 0.18;
        SC.vy *= 0.6;
        scSet(next);
        if (Math.abs(target - next) < 0.6) { scSet(target); SC.vy = 0; SC.raf = 0; return; }
      } else {
        if (Math.abs(SC.vy) < 0.015) { SC.raf = 0; return; }
        scSet(next);
      }
      SC.raf = requestAnimationFrame(step);
    };
    SC.raf = requestAnimationFrame(step);
  };
  window.scTop = () => { scStop(); scSet(0); };

  const initScroll = () => {
    SC.el = document.getElementById('scroller');
    SC.body = document.getElementById('scBody');
    if (!SC.el || !SC.body) return;

    SC.el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      scStop();
      SC.drag = true;
      SC.sy = e.touches[0].clientY; SC.st = SC.y;
      SC.ly = SC.sy; SC.lt = performance.now(); SC.vy = 0;
    }, { passive: true });

    SC.el.addEventListener('touchmove', e => {
      if (!SC.drag) return;
      const y = e.touches[0].clientY;
      let next = SC.st + (y - SC.sy);
      if (next > 0) next *= 0.35;
      else if (next < -SC.max) next = -SC.max + (next + SC.max) * 0.35;
      const now = performance.now();
      const dt = Math.max(8, now - SC.lt);
      SC.vy = (y - SC.ly) / dt;
      SC.ly = y; SC.lt = now;
      scSet(next);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    SC.el.addEventListener('touchend', () => {
      if (!SC.drag) return;
      SC.drag = false;
      if (Math.abs(SC.vy) > 0.05 || SC.y > 0 || SC.y < -SC.max) scSpark();
    });
    SC.el.addEventListener('touchcancel', () => { SC.drag = false; });

    SC.el.addEventListener('wheel', e => {
      scStop();
      scSet(scClamp(SC.y - e.deltaY));
      e.preventDefault();
    }, { passive: false });

    scMeasure();
    window.addEventListener('resize', scMeasure);
    window.addEventListener('orientationchange', () => setTimeout(scMeasure, 300));
    if (window.ResizeObserver) new ResizeObserver(scMeasure).observe(SC.body);
  };
  window.scMeasure = scMeasure;

  // 左边缘拖动返回：卡片跟手滑动，松手决定回退还是弹回
  let sw = null;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t.clientX > 30) { sw = null; return; }
    const el = document.querySelector('.sheet.on') || document.querySelector('.modal.on');
    sw = el
      ? { el, x0: t.clientX, y0: t.clientY, dx: 0, active: false }
      : { el: null, x0: t.clientX, y0: t.clientY, dx: 0, active: false };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0;
    const dy = Math.abs(t.clientY - sw.y0);
    if (!sw.active) {
      if (dx < 8) return;
      if (dy > Math.abs(dx)) { sw = null; return; }   // 竖着滑，交给页面滚动
      sw.active = true;
      if (sw.el) sw.el.classList.add('dragging');
    }
    sw.dx = Math.max(0, dx);
    if (sw.el) {
      sw.el.style.transform = 'translateX(' + sw.dx + 'px)';
      sw.el.style.opacity = String(Math.max(0.55, 1 - sw.dx / 700));
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!sw) return;
    const { el, dx, active } = sw;
    sw = null;
    if (!active) return;
    if (el) el.classList.remove('dragging');
    if (dx > 100) {
      if (el) {
        el.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1), opacity .3s ease-out';
        el.style.transform = 'translateX(102%)';
        el.style.opacity = '0';
      }
      setTimeout(() => {
        if (el) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; }
        goBack();
      }, 270);
    } else if (el) {
      el.style.transition = 'transform .38s cubic-bezier(.32,.72,0,1), opacity .32s ease-out';
      el.style.transform = '';
      el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 400);
    } else {
      goBack();
    }
  }, { passive: true });

  // 顶栏改成 fixed：量出实际高度，给内容让出空间
  const syncTopH = () => {
    const tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', Math.round(tb.getBoundingClientRect().height) + 'px');
  };
  const bt = $('#brandTag');
  if (bt) bt.textContent = APP_VERSION;
  syncTopH();
  initScroll();
  window.addEventListener('resize', syncTopH);
  window.addEventListener('orientationchange', syncTopH);

  // 版本自检：线上版本变了就带随机参数重开，绕开缓存
  const checkVersion = async () => {
    try {
      const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.text()).trim();
      if (v && v !== APP_VERSION && !sessionStorage.getItem('ver-jump')) {
        sessionStorage.setItem('ver-jump', '1');
        location.replace(location.pathname + '?r=' + Date.now());
      }
    } catch (e) { /* 没网就算了 */ }
  };
  checkVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion();
  });

  applyTheme(Store.load().settings.theme || 'lime');
  loadDay();
  if (synced) {
    setTimeout(() => toast('⌚ 已自动同步 ' + synced.slice(5) + ' 的手表数据', 3200), 700);
  }

  // 打开时拉一次云端数据（不阻塞界面）
  pullCloudData().then(date => {
    if (!date) return;
    loadDay();
    if (Store.load().settings.sync_toast !== false) {
      toast('⌚ 已同步 ' + date.slice(5) + ' 的手表数据', 2600);
    }
  });

  // 从后台切回来时再拉一次
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pendingSync) {
      pendingSync = false;
      lastPull = Date.now();
      pullCloudData().then(() => { loadDay(); toast('⌚ 已读取手表数据', 2200); });
      return;
    }
    if (Date.now() - lastPull < 15000) return;
    lastPull = Date.now();
    pullCloudData().then(date => { if (date) loadDay(); });
  });
}

document.addEventListener('DOMContentLoaded', init);
