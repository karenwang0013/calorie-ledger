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
  const exp = d.date === S.today ? Math.round(expFull * dayFrac) : expFull;
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

  let color = '#d6ff4b';
  if (pct > 1.08) color = '#ff5d5d';
  else if (pct > 0.95) color = '#ffb04b';
  ring.style.stroke = color;

  const hero = $('#hero');
  hero.classList.remove('surplus', 'over');

  let sub;
  if (bal < 0) {
    hero.classList.add('surplus');
    $('#heroLbl').textContent = '热量盈余';
    $('#heroNum').textContent = Math.abs(bal);
    sub = t.deficit > 0 ? `目标缺口 ${t.deficit} · 已超出 ${Math.abs(bal)}` : '今天吃超了';
  } else {
    $('#heroLbl').textContent = '热量缺口';
    $('#heroNum').textContent = bal;
    if (t.deficit <= 0) {
      sub = intake === 0 ? '还没记录 · 未设目标' : `已吃 ${intake}`;
    } else if (intake === 0) {
      sub = `目标缺口 ${t.deficit} · 还没记录`;
    } else if (bal >= t.deficit) {
      sub = `目标 ${t.deficit} · 已达标`;
    } else {
      sub = `目标 ${t.deficit} · 还差 ${t.deficit - bal}`;
    }
  }
  $('#heroSub').textContent = sub;

  $('#stIntake').innerHTML = intake + ' <small>kcal</small>';
  $('#stExp').innerHTML = exp + ' <small>kcal</small>';
  const leftEl = $('#stLeft');
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
  box.innerHTML = MEALS.map(m => {
    const items = d.logs.filter(l => (l.meal || 'other') === m.k);
    const kcal = items.reduce((a, b) => a + (b.kcal || 0), 0);
    const rows = items.map(l => `
      <div class="mitem" data-id="${l.id}">
        <div class="n">${esc(l.name)}
          <span class="sub">${l.grams ? Math.round(l.grams) + 'g' : ''}${
            l.p ? ' · 蛋' + Math.round(l.p) + '/碳' + Math.round(l.c) + '/脂' + Math.round(l.f) : ''}</span>
        </div>
        <div class="k">${Math.round(l.kcal)}${l.source === 'photo' || l.source === 'ai' ? ' <span class="ai">AI</span>' : ''}</div>
        <button class="del" data-del="${l.id}">×</button>
      </div>`).join('');
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
  S.photoData = null;
  S.meal = meal || defaultMeal();
  $('#photoPreview').hidden = true;
  $('#photoDrop').hidden = false;
  $('#photoActions').hidden = true;
  $('#photoHint').value = '';
  $('#resultArea').hidden = true;
  $('#addFoot').hidden = true;
  $('#searchInput').value = '';
  $('#textInput').value = '';
  $('#searchList').innerHTML = '';
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
    $('#photoDrop').hidden = true;
    $('#photoPreview').hidden = false;
    $('#photoPreview').src = URL.createObjectURL(file);
    S.photoData = await compress(file);
    $('#photoActions').hidden = false;
  } catch (e) {
    toast('图片读取失败');
  }
}

async function runPhoto() {
  if (!S.photoData) return;
  const btn = $('#photoGo');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 识别中…';
  try {
    const r = await api('/api/ai/food', {
      image: S.photoData,
      hint: $('#photoHint').value.trim(),
    });
    S.items = r.items.map(x => ({ ...x, _src: 'photo' }));
    $('#photoDrop').hidden = true;
    $('#photoPreview').hidden = true;
    $('#photoActions').hidden = true;
    showResult(r.dish ? '识别：' + r.dish : '识别结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
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
    showResult(r.dish ? '估算：' + r.dish : '估算结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* ---- 搜索 ---- */
function runSearch(q) {
  const box = $('#searchList');
  const key = q.trim().toLowerCase();
  if (!key) { box.innerHTML = ''; return; }
  const hits = S.foods.filter(f => {
    if (f.name.toLowerCase().includes(key)) return true;
    return (f.alias || []).some(a => a.toLowerCase().includes(key));
  }).slice(0, 20);
  if (!hits.length) {
    box.innerHTML = `<div class="empty-state">库里没有「${esc(q)}」<br>试试换个说法，或用「描述」让 AI 估</div>`;
    return;
  }
  box.innerHTML = hits.map((f, i) => `
    <div class="sitem" data-i="${i}">
      <div>
        <div>${esc(f.name)}</div>
        <div class="cat">${esc(f.cat)} · 蛋白 ${f.p}g / 碳水 ${f.c}g / 脂肪 ${f.f}g</div>
      </div>
      <div class="kc">${f.kcal}<br><span style="font-size:9px">/100g</span></div>
    </div>`).join('');
  $$('.sitem', box).forEach(el => el.onclick = () => {
    pushFood(hits[Number(el.dataset.i)]);
    $('#searchInput').value = '';
    box.innerHTML = '';
    $('#searchInput').blur();
  });
}

function pushFood(f) {
  const def = f.units && f.units[0] ? f.units[0].g : 100;
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
  const btn = $('#saveItems');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    await api('/api/logs', {
      date: S.date,
      meal: S.meal,
      items,
      source: items[0]._src || 'manual',
    });
    closeAdd();
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

/* ---------------- 我的 ---------------- */
function renderMe() {
  const d = S.day;
  if (!d) return;
  const p = d.profile || {};
  const acts = d.activity_labels || {};
  const sugGoal = Math.round(-(Number(p.weight_kg || 60) * 0.005) * 20) / 20 || -0.3;
  const sugKcal = Math.round(Math.abs(sugGoal) * 7700 / 7);
  const opt = Object.entries(acts).map(([k, v]) =>
    `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${esc(v)}</option>`).join('');

  $('#meBody').innerHTML = `
    <div class="card">
      <h3>身体数据</h3>
      <div class="split">
        <div class="field">
          <label>性别</label>
          <select id="fSex">
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
        <input id="fGoalRate" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="0.5" value="${Math.abs(p.goal_rate ?? -0.25)}">
        <div class="hint">填 <b>0.5</b> = 每周减 0.5 公斤；<b>0</b> = 维持；负数 = 增肌。<br>按你 ${p.weight_kg || 60}kg 算，<b style="color:var(--lime)">建议 ${Math.abs(sugGoal)}</b>（≈ 每天 ${sugKcal} 千卡缺口）。</div>
      </div>
      <div class="field">
        <label>蛋白质目标（g / kg 体重）</label>
        <input id="fProt" type="number" inputmode="decimal" step="0.1" value="${p.protein_per_kg || 1.6}">
        <div class="hint">减脂期建议 1.6–2.2。肌肉量越大、练得越狠，取越高。</div>
      </div>
      <button class="btn primary" id="saveProfile">保存</button>
    </div>

    <div class="card">
      <h3>手表 / 消耗数据</h3>
      <div class="hint" style="margin:0 0 14px">
        当前消耗来源：<b style="color:var(--lime)">${esc(d.expenditure_source)}</b><br>
        <span style="color:var(--muted2);font-size:11px">每天同步一次，缺口才算得准。</span>
      </div>
      <div class="btnrow">
        <button class="btn sm" id="openWatch">📷 截图读取</button>
        <button class="btn sm" id="openWatch3">⌨️ 手动填写</button>
        <button class="btn sm" id="openWeight2">⚖️ 记体重</button>
      </div>
    </div>

    <div class="card">
      <h3>AI 识别 <span class="tag" style="color:${d.has_key ? 'var(--lime)' : 'var(--orange)'};background:rgba(255,255,255,.06)">${d.has_key ? '已配置' : '未配置'}</span></h3>
      <div class="field">
        <label>DashScope API Key</label>
        <input id="fKey" type="password" placeholder="${d.has_key ? '已保存，如需更换请重新填写' : 'sk-...'}" autocomplete="off">
        <div class="hint">存在这台电脑的本地数据库里，不会上传到任何第三方。获取地址：bailian.console.aliyun.com</div>
      </div>
      <div class="btnrow">
        <button class="btn sm" id="saveKey">保存</button>
        <button class="btn sm" id="testKey">测试连接</button>
      </div>
      ${d.ai_model ? `<div style="font-size:11px;color:var(--muted2);margin-top:10px">当前模型：${esc(d.ai_model)}</div>` : ''}
    </div>

    <div class="card">
      <h3>自动同步手表 <span class="tag" style="color:var(--muted);background:rgba(255,255,255,.06)">免截图</span></h3>
      <div class="hint" style="margin:0 0 12px">
        用 iOS「快捷指令」每天定时读健康数据，自动写进来。配一次，之后不用管。
      </div>
      <button class="btn sm" id="showShortcut">查看配置步骤</button>
    </div>

    <div class="card">
      <h3>数据</h3>
      <div class="btnrow">
        <button class="btn sm" id="exportCsv">导出 CSV</button>
        <button class="btn sm" id="exportJson">备份</button>
        <button class="btn sm" id="importJson">恢复</button>
        <button class="btn sm" id="hardReload">强制更新</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <div class="hint" style="margin-top:12px;color:var(--muted2)">
        所有数据都在这台设备的浏览器里，不上传任何服务器。<br>
        换手机或清理浏览器前，先点「备份」存一份 JSON。
      </div>
    </div>

    <div class="card">
      <h3>这套算法在算什么</h3>
      <div class="hint" style="margin:0;line-height:1.85">
        <b style="color:var(--text)">消耗</b>：优先用 Apple Watch 的「总卡路里」；没有就用基础代谢 + 活动消耗；都没有才用公式估。<br>
        <b style="color:var(--text)">基础代谢</b>：Mifflin-St Jeor 公式。<br>
        <b style="color:var(--text)">缺口</b>：消耗 − 摄入。正数是缺口，负数是盈余。<br>
        <b style="color:var(--text)">实测消耗</b>：体重回归斜率 × 7700，再和平均摄入对上。<br>
        <span style="color:var(--muted2);font-size:11px">单日数字有 ±20% 误差，别为一天的偏差焦虑；看 7 天平均。</span>
      </div>
    </div>
    <div style="height:30px"></div>`;

  $('#saveProfile').onclick = async () => {
    try {
      await api('/api/profile', {
        sex: $('#fSex').value,
        birth_year: Number($('#fYear').value),
        height_cm: Number($('#fHeight').value),
        weight_kg: Number($('#fWeight').value),
        activity: $('#fAct').value,
        goal_rate: (() => {
          const raw = ($('#fGoalRate') || {}).value ? $('#fGoalRate').value.trim() : '';
          if (raw === '') return -0.25;
          const v = Number(raw);
          return isFinite(v) ? -v : -0.25;
        })(),
        protein_per_kg: Number($('#fProt').value),
      });
      toast('已保存');
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  $('#openWatch').onclick = openWatch;
  const ow3 = $('#openWatch3');
  if (ow3) ow3.onclick = openWatch;
  $('#openWeight2').onclick = openWeight;
  const hr = $('#hardReload');
  if (hr) hr.onclick = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    toast('正在更新…', 1200);
    setTimeout(() => location.reload(), 400);
  };
  $('#exportCsv').onclick = () => { downloadCsv(); toast('已导出 CSV'); };
  $('#exportJson').onclick = () => { exportJson(); toast('已备份'); };
  $('#showShortcut').onclick = showShortcutHelp;
  $('#importJson').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importJson(await f.text());
      toast('已恢复备份');
      await loadDay();
      renderMe();
    } catch (err) {
      toast('恢复失败：' + err.message, 4000);
    }
    e.target.value = '';
  };

  $('#saveKey').onclick = async () => {
    const v = $('#fKey').value.trim();
    if (!v) return toast('先填入 Key');
    try {
      await api('/api/settings', { dashscope_key: v });
      toast('已保存');
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  $('#testKey').onclick = async () => {
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
  $('#watchNote').textContent = w.source === 'photo' ? '上次是从截图读的。' : '';
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
  S.view = v;
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + v));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.body.classList.toggle('view-me', v === 'me');
  document.body.classList.toggle('view-trends', v === 'trends');
  window.scrollTo({ top: 0 });
  if (v === 'trends') { renderTrends(); loadTrends(); }
  if (v === 'me') renderMe();
}

/* ---------------- 自动同步帮助 ---------------- */

function watchUrlTemplate() {
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return `${base}?watch=1&a=[活动能量]&r=[静息能量]`;
}

function showShortcutHelp() {
  const url = watchUrlTemplate();
  $('#helpBody').innerHTML = `
    <p style="font-size:12.5px;color:var(--muted);line-height:1.7;margin:0 0 14px">
      网页读不到 Apple 健康数据（苹果只开放给原生 App）。但「快捷指令」能读，
      再通过一个链接交给这个网页。<b style="color:var(--text)">配一次，之后全自动。</b>
    </p>
    <div class="hint" style="margin:0 0 18px;padding:10px 12px;background:rgba(255,138,76,.08);border-radius:10px;color:var(--orange)">
      先建「快捷指令」并手动跑通，<b>最后</b>才挂到「自动化」上。别一上来就建自动化。
    </div>

    <div class="sechead">第一步 · 新建快捷指令</div>
    <div class="step"><b>1</b><div>打开「快捷指令」App → 底部 <b>「快捷指令」</b> → 右上角 <span class="kbd">+</span></div></div>
    <div class="step"><b>2</b><div>点最上面的名字，改成「热量账本同步」</div></div>

    <div class="sechead">第二步 · 加 4 个动作（最简版）</div>
    <div class="step"><b>3</b><div>搜索添加 <b>「查找健康样本」</b><br>
      <span class="muted">样本类型 → 活动能量；时间范围 → 今天</span></div></div>
    <div class="step"><b>4</b><div>搜索添加 <b>「统计」</b><br>
      <span class="muted">计算 → 总和；输入 → 点开选「健康样本」</span></div></div>
    <div class="step"><b>5</b><div>搜索添加 <b>「文本」</b>，粘贴下面这条<br>
      <code class="urlbox" id="urlBox">${esc(url)}</code>
      <span class="muted" style="display:block;margin-top:7px">
        把 <b style="color:var(--text)">[活动能量]</b> 这四个字连同方括号整个删掉，光标停在 <b style="color:var(--text)">a=</b> 后面，
        点键盘上方的「变量」按钮（像个魔术棒），选「统计结果」。
      </span></div></div>
    <div class="step"><b>6</b><div>搜索添加 <b>「打开 URL」</b><br>
      <span class="muted">点 URL 那一格 → 选上一步的「文本」</span></div></div>

    <div class="sechead">第三步 · 先手动跑一次</div>
    <div class="step"><b>7</b><div>点右下角 <span class="kbd">▶</span> 运行<br>
      <span class="muted">第一次会弹健康权限，全部允许。Safari 会打开一下，然后回 App 看数字变没变。</span></div></div>

    <div class="sechead">第四步 · 挂到自动化</div>
    <div class="step"><b>8</b><div>「快捷指令」App → 底部 <b>「自动化」</b> → 右上角 <span class="kbd">+</span></div></div>
    <div class="step"><b>9</b><div>选 <b>「时间」</b> → 23:00 → 每天 → <b>「立即运行」</b></div></div>
    <div class="step"><b>10</b><div>下一步 → 选刚建好的「热量账本同步」→ 完成</div></div>

    <div class="sechead">想更准？再加 3 个动作</div>
    <div class="hint" style="margin:0 0 10px">
      上面只读了「活动能量」，App 会用公式补基础代谢，消耗会<b>低估约 150 千卡</b>。
      加下面 3 个动作就准了：
    </div>
    <div class="step"><b>A</b><div>把第 4 步的「统计」后面接一个 <b>「设定变量」</b>，名字填 <b>活动能量</b></div></div>
    <div class="step"><b>B</b><div>再加一组 <b>「查找健康样本」→「统计」→「设定变量」</b>，样本类型选「静息能量」，变量名填 <b>静息能量</b></div></div>
    <div class="step"><b>C</b><div>回到「文本」，把 <b>[静息能量]</b> 也换成对应的变量</div></div>

    <div class="hint" style="margin-top:14px">
      跑的时候会短暂打开一次 Safari —— 这是 iOS 的限制，后台的快捷指令写不进网页。
      失败的晚上，手动点「同步手表」截个图也一样。<br>
      步数不影响计算，可以不读。
    </div>`;

  $('#helpCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('链接已复制，切换回快捷指令粘贴');
    } catch (e) {
      const r = document.createRange();
      r.selectNodeContents($('#urlBox'));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      toast('已选中，长按复制');
    }
  };
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
    const d = Store.load();
    const cur = d.daily[date] || {};
    if (cur.active === active && cur.source === 'cloud') return null;
    d.daily[date] = Object.assign({}, cur, { active, source: 'cloud' });
    Store.save();
    return date;
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

  $('#photoDrop').onclick = () => $('#photoInput').click();
  $('#photoRetake').onclick = () => $('#photoInput').click();
  $('#photoInput').onchange = e => handlePhoto(e.target.files[0]);
  $('#photoGo').onclick = runPhoto;
  $('#textGo').onclick = runText;
  $('#saveItems').onclick = saveItems;
  $('#resultReset').onclick = () => {
    S.items = [];
    S.photoData = null;
    $('#photoPreview').hidden = true;
    $('#photoDrop').hidden = false;
    $('#photoActions').hidden = true;
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
  if (refreshBtn) refreshBtn.onclick = async () => {
    refreshBtn.classList.add('spin');
    let date = null;
    try { date = await pullCloudData(); } catch (e) {}
    refreshBtn.classList.remove('spin');
    loadDay();
    const dd = Store.load().daily[S.today] || {};
    if (date) toast('⌚ 已同步 ' + date.slice(5) + ' 的手表数据', 2600);
    else if (dd.active) toast('已是最新：活动消耗 ' + dd.active + ' 千卡', 2400);
    else toast('暂时没有新数据（每天 23:00 更新）', 2600);
  };  $('#watchClose').onclick = closeWatch;
  $('#watchMask').onclick = closeWatch;
  $('#watchSave').onclick = saveWatch;
  $('#watchPick').onclick = () => $('#watchInput').click();
  $('#watchInput').onchange = e => readWatchShot(e.target.files[0]);

  $('#weightClose').onclick = closeWeight;
  $('#weightMask').onclick = closeWeight;
  $('#weightSave').onclick = saveWeight;

  $('#helpClose').onclick = closeHelp;
  $('#helpMask').onclick = closeHelp;

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

  loadDay();
  if (synced) {
    setTimeout(() => toast('⌚ 已自动同步 ' + synced.slice(5) + ' 的手表数据', 3200), 700);
  }

  // 打开时拉一次云端数据（不阻塞界面）
  pullCloudData().then(date => {
    if (!date) return;
    loadDay();
    toast('⌚ 已同步 ' + date.slice(5) + ' 的手表数据', 2600);
  });

  // 从后台切回来时再拉一次
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastPull < 60000) return;
    lastPull = Date.now();
    pullCloudData().then(date => { if (date) loadDay(); });
  });
}

document.addEventListener('DOMContentLoaded', init);
