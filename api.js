/* 本地数据层 + 计算
 *
 * 原来这些都跑在 Python 服务里。现在全部在浏览器里完成，
 * 数据存在 localStorage，所以不需要任何服务器，断网也能用。
 */

const KCAL_PER_KG = 7700;

const ACTIVITY_FACTORS = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const ACTIVITY_LABEL = {
  sedentary: '久坐（几乎不运动）',
  light: '轻度（每周 1-3 次运动）',
  moderate: '中度（每周 3-5 次）',
  active: '高强度（每周 6-7 次）',
  very_active: '极高（体力工作 / 一天两练）',
};

/* ---------------- 存储 ---------------- */

const Store = {
  KEY: 'calorie-ledger-v1',
  data: null,

  defaults() {
    return {
      v: 1,
      profile: {
        sex: 'female', birth_year: 1995, height_cm: 165, weight_kg: 60,
        activity: 'light', goal_rate: -0.25, protein_per_kg: 1.6,
      },
      logs: [],
      weights: {},
      body: {},
      daily: {},
      shots: {},
      settings: {},
    };
  },

  load() {
    if (this.data) return this.data;
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); } catch (e) { /* 隐私模式 */ }
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    const d = this.defaults();
    parsed = parsed || {};
    // 以存下来的对象为底，再补默认值 —— 以后新增字段不会被白名单吃掉
    this.data = Object.assign({}, parsed, {
      v: 1,
      profile: Object.assign({}, d.profile, parsed.profile || {}),
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      weights: parsed.weights || {},
      body: parsed.body || {},
      daily: parsed.daily || {},
      shots: parsed.shots || {},
      settings: parsed.settings || {},
    });
    return this.data;
  },

  /**
   * opts.silent = true：只写本机，不动 updatedAt、不触发上传。
   * 用于「打开 App 自动拉体脂数据」这类不该影响「谁更新」判定的写入，
   * 否则会让本机永远比云端新，两台设备就不再互相拉取（历史 bug）。
   */
  save(opts) {
    const silent = !!(opts && opts.silent);
    try {
      if (!silent && this.data && this.data.settings) this.data.settings.updatedAt = new Date().toISOString();
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      throw new Error('浏览器存储写不进去了（可能空间满了）。先导出备份。');
    }
    if (!silent && typeof scheduleCloudSync === 'function') scheduleCloudSync();
  },
};

function setting(k, def) {
  const v = Store.load().settings[k];
  return v === undefined || v === null ? def : v;
}
function setSetting(k, v) {
  Store.load().settings[k] = v;
  Store.save();
}

/* ---------------- 基础计算 ---------------- */

function ageOf(p) {
  return Math.max(12, new Date().getFullYear() - Number(p.birth_year || 1995));
}

function bmrOf(p) {
  const w = Number(p.weight_kg || 60);
  const h = Number(p.height_cm || 165);
  const base = 10 * w + 6.25 * h - 5 * ageOf(p);
  return base + (p.sex === 'male' ? 5 : -161);
}

function latestWeight() {
  const keys = Object.keys(Store.load().weights).sort();
  return keys.length ? Store.load().weights[keys[keys.length - 1]] : null;
}

/** 返回 [消耗, 来源说明, 明细] */
function tdeeOf(p, day, weight) {
  const pp = Object.assign({}, p);
  if (weight) pp.weight_kg = weight;
  const active = day ? day.active : null;
  const total = day ? day.total : null;
  const resting = day ? day.resting : null;

  if (total && total > 500) {
    return [Math.round(total), '手表总消耗', { active, resting, total }];
  }
  const b = bmrOf(pp);
  if (active && active > 0) {
    const base = (resting && resting > 500) ? resting : b;
    return [Math.round(base + active), '基础代谢 + 活动消耗',
      { active, resting: base, total: base + active }];
  }
  const factor = ACTIVITY_FACTORS[pp.activity] || 1.375;
  return [Math.round(b * factor), '公式估算',
    { bmr: Math.round(b), factor, activity: pp.activity }];
}

function targetsOf(p, exp) {
  const goalRate = Number(p.goal_rate || 0);         // kg/周，负数=减脂
  let want = -goalRate * KCAL_PER_KG / 7;            // 正数=每天想要的缺口
  want = Math.max(-600, Math.min(700, want));
  if (want > 0) want = Math.min(want, exp * 0.22);   // 缺口不超过消耗 22%

  // —— 用户手动指定的缺口 / 盈余（正=缺口，负=盈余） ——
  const ov0 = setting('target_override', {}) || {};
  const hasDefOv = ov0.deficit !== undefined && ov0.deficit !== null && ov0.deficit !== '' && isFinite(Number(ov0.deficit));
  const wantAuto = want;              // 纯自动建议值（不含手动缺口），保存时用它判断「是否等于建议」
  if (hasDefOv) want = Number(ov0.deficit);

  // —— 自动建议值 ——
  const proteinAuto = Math.round(Number(p.weight_kg || 60) * Number(p.protein_per_kg || 1.6));
  const budgetAuto = Math.max(1000, exp - want);
  const fatRatio = Math.min(0.4, Math.max(0.15, Number(setting('fat_ratio', 0.28)) || 0.28));
  const fatAuto = Math.round(Math.max(40, budgetAuto * fatRatio / 9));
  const carbAuto = Math.round(Math.max(50, (budgetAuto - proteinAuto * 4 - fatAuto * 9) / 4));

  // —— 用户手动覆盖（营养目标页） ——
  const ov = setting('target_override', {}) || {};
  const num = (v, d) => {
    if (v === undefined || v === null || v === '') return d;
    const n = Number(v);
    return isFinite(n) && n > 0 ? Math.round(n) : d;
  };
  // 指定了缺口/盈余时，每日可吃必须跟着它走（否则会出现「填 -300 却算出 -378」）
  const kcal_budget = hasDefOv
    ? Math.max(0, Math.round(exp - want))       // 缺口是硬指标：可吃 = 消耗 − 缺口，不做任何下限修正
    : num(ov.kcal, Math.round(budgetAuto));
  const protein_g = num(ov.protein, proteinAuto);
  const fat_g = num(ov.fat, fatAuto);
  const carb_g = num(ov.carb, carbAuto);
  const deficit = hasDefOv ? Math.round(want) : Math.round(exp - kcal_budget);

  return {
    deficit,
    kcal_budget,
    protein_g,
    fat_g,
    carb_g,
    goal_rate: goalRate,
    auto: {
      kcal_budget: Math.round(budgetAuto),
      protein_g: proteinAuto,
      fat_g: fatAuto,
      carb_g: carbAuto,
      deficit: Math.round(wantAuto),
    },
  };
}

function daySummary(date) {
  const d = Store.load();
  const p = d.profile;
  const logs = d.logs
    .filter(l => l.date === date)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)) || a.id - b.id);
  const watch = d.daily[date] || {};
  const intake = logs.reduce((a, b) => a + (Number(b.kcal) || 0), 0);
  const protein = logs.reduce((a, b) => a + (Number(b.p) || 0), 0);
  const carb = logs.reduce((a, b) => a + (Number(b.c) || 0), 0);
  const fat = logs.reduce((a, b) => a + (Number(b.f) || 0), 0);
  const [exp, src, detail] = tdeeOf(p, watch, latestWeight());
  // 只把当天这几条记录的小图带出来，不整库塞给前端
  const shots = {};
  logs.forEach(l => {
    if (l.batch && d.shots && d.shots[l.batch]) shots[l.batch] = d.shots[l.batch];
  });

  return {
    date,
    logs,
    shots,
    intake: Math.round(intake),
    protein: Math.round(protein * 10) / 10,
    carb: Math.round(carb * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    expenditure: exp,
    expenditure_source: src,
    expenditure_detail: detail,
    balance: Math.round(exp - intake),
    watch,
    targets: targetsOf(p, exp),
    profile: p,
    has_key: !!(d.settings.dashscope_key || '').trim(),
    theme: d.settings.theme || 'lime',
    sync_toast: d.settings.sync_toast !== false,
    needs_setup: !d.settings.profile_set,
    activity_labels: ACTIVITY_LABEL,
  };
}

function linreg(points) {
  const n = points.length;
  if (n < 2) return [0, 0, 0];
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  points.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return [0, sy / n, 0];
  const slope = (n * sxy - sx * sy) / den;
  const inter = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssTot = 0, ssRes = 0;
  points.forEach(([x, y]) => {
    ssTot += (y - mean) ** 2;
    ssRes += (y - (slope * x + inter)) ** 2;
  });
  return [slope, inter, ssTot > 1e-9 ? 1 - ssRes / ssTot : 0];
}

function computeTrends(days) {
  const d = Store.load();
  const p = d.profile;
  const today = todayISO();
  const start = addDays(today, -(days - 1));
  const lw = latestWeight();

  const weights = Object.keys(d.weights)
    .filter(k => k >= start)
    .sort()
    .map(k => ({ date: k, kg: d.weights[k] }));

  const series = [];
  for (let i = 0; i < days; i++) {
    const ds = addDays(start, i);
    const logs = d.logs.filter(l => l.date === ds);
    const intake = logs.length ? logs.reduce((a, b) => a + (Number(b.kcal) || 0), 0) : null;
    const [exp] = tdeeOf(p, d.daily[ds] || {}, lw);
    series.push({
      date: ds,
      intake: intake === null ? null : Math.round(intake),
      expenditure: exp,
      balance: intake === null ? null : Math.round(exp - intake),
      weight: d.weights[ds] ?? null,
      watch: d.daily[ds] || {},
    });
  }

  const logged = series.filter(s => s.intake);
  const avgIntake = logged.length
    ? Math.round(logged.reduce((a, b) => a + b.intake, 0) / logged.length) : 0;
  const avgExp = series.length
    ? Math.round(series.reduce((a, b) => a + b.expenditure, 0) / series.length) : 0;

  // 实测 TDEE：体重回归斜率 × 7700
  let real = null;
  if (weights.length >= 8) {
    const x0 = parseISO(weights[0].date).getTime();
    const pts = weights.map(w => [(parseISO(w.date).getTime() - x0) / 86400000, w.kg]);
    const [slope, , r2] = linreg(pts);
    const span = (parseISO(weights[weights.length - 1].date).getTime() - x0) / 86400000 + 1;
    const aligned = logged.filter(s =>
      s.date >= weights[0].date && s.date <= weights[weights.length - 1].date);
    const coverage = aligned.length / Math.max(1, span);
    if (aligned.length && coverage >= 0.5) {
      const meanIntake = aligned.reduce((a, b) => a + b.intake, 0) / aligned.length;
      real = {
        tdee: Math.round(meanIntake - slope * KCAL_PER_KG),
        slope_kg_per_week: Math.round(slope * 7 * 1000) / 1000,
        r2: Math.round(r2 * 100) / 100,
        span_days: span,
        logged_days: aligned.length,
        coverage: Math.round(coverage * 100),
        avg_intake: Math.round(meanIntake),
        confidence: (span >= 21 && coverage >= 0.7 && r2 > 0.3) ? '较高'
          : (span >= 14 && coverage >= 0.5) ? '中等' : '偏低',
      };
    }
  }

  return {
    days, start, end: today, series,
    avg_intake: avgIntake,
    avg_expenditure: avgExp,
    avg_balance: avgIntake ? Math.round(avgExp - avgIntake) : null,
    logged_days: logged.length,
    real_tdee: real,
    weights,
    body: d.body || {},
  };
}

/* ---------------- 写操作 ---------------- */

function nextId() {
  const logs = Store.load().logs;
  return logs.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1;
}

function nowTs() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function addLog(date, meal, it, source, batch, batchName) {
  const d = Store.load();
  const g = Number(it.grams) || 0;
  const k100 = Number(it.kcal_per_100g) || 0;
  const entry = {
    id: nextId(),
    date,
    ts: nowTs(),
    meal: meal || 'other',
    name: it.name,
    grams: Math.round(g),
    kcal: Math.round(k100 * g / 100 * 10) / 10,
    p: Math.round((Number(it.protein_per_100g) || 0) * g / 100 * 10) / 10,
    c: Math.round((Number(it.carb_per_100g) || 0) * g / 100 * 10) / 10,
    f: Math.round((Number(it.fat_per_100g) || 0) * g / 100 * 10) / 10,
    source: source || 'manual',
    confidence: Number(it.confidence ?? 1),
  };
  if (batch) { entry.batch = batch; entry.batchName = batchName || ''; }
  d.logs.push(entry);
  Store.save();
  return entry.id;
}

/* ---------------- AI ---------------- */

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const FOOD_PROMPT = `你是专业营养师，任务是估算一张食物照片的热量。

请仔细辨认图中所有可食用内容，然后：

1. 拆分成独立条目。不要把一整盘菜算成一条——米饭、主菜、配菜、酱汁、饮料分别列。
2. 估算「实际吃掉的重量」（克）。用碗/盘/勺的常见尺寸和食物堆叠高度作为参照。
3. 给出每 100 克的热量和蛋白质/碳水/脂肪。优先使用中国食物成分表的数值。
4. 如果图里有包装食品的营养成分表，按标签精确读数：
   - 把标签上「每 100 克」的能量/蛋白质/碳水/脂肪原样填进 *_per_100g（能量若是千焦，除以 4.184 换成千卡）
   - grams 用用户在补充说明里说的克数；没说就填 100
   - 如果用户说「整包 / 一包 / 全吃完」，就找包装上的「净含量 / 规格 / 内容量」，把 grams 设成那个数；找不到净含量再按 100
   - name 用包装上的产品名，不要自己编
5. 拿不准时，宁可估高不要估低，并在 note 里说明不确定的地方。
6. 饮料、零食、包装食品也必须认，不要因为没有成分表就说认不出：
   - 按包装上的品牌和品名命名（例：可口可乐 无糖、东方树叶 乌龙茶、农夫山泉 天然水）
   - 按常见规格估重量（一罐可乐 330ml ≈ 330g），用户说了「整罐/一整瓶」就按整罐算
   - 0 糖 0 卡的饮料也要返回一条，kcal_per_100g 填 0，不要省略
7. 只要图里有能吃能喝的东西，items 就不能是空数组。

只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字：

{"items":[{"name":"食物中文名","grams":180,"kcal_per_100g":116,"protein_per_100g":2.6,"carb_per_100g":25.9,"fat_per_100g":0.3,"confidence":0.8}],"dish":"这一餐的一句话描述","note":"不确定之处，20字以内，没有就填空字符串"}`;

const TEXT_PROMPT = `你是专业营养师。用户会用日常口语描述吃了什么，请估算热量。

对每一项分别估算实际重量（克），给出每 100 克的热量、蛋白质、碳水、脂肪。
「一碗」「一个」这类模糊量按中国人常见份量换算（一碗米饭约 150g，一个鸡蛋约 50g）。

只输出 JSON，不要 markdown 代码块：
{"items":[{"name":"食物中文名","grams":150,"kcal_per_100g":116,"protein_per_100g":2.6,"carb_per_100g":25.9,"fat_per_100g":0.3,"confidence":0.8}],"dish":"一句话描述","note":"不确定之处，没有就填空字符串"}`;


async function callModel(content) {
  const key = (setting('dashscope_key', '') || '').trim();
  if (!key) throw new Error('还没有设置 DashScope API Key，去「我的」页面填一下。');

  const pinned = setting('ai_model', '');
  const models = [];
  [pinned, 'qwen3-vl-plus', 'qwen-vl-max-latest', 'qwen-vl-plus', 'qwen-vl-ocr']
    .filter(Boolean).forEach(m => { if (!models.includes(m)) models.push(m); });

  let last = null;
  for (const model of models) {
    let resp;
    try {
      resp = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
          temperature: 0.1,
          max_tokens: 1600,
        }),
      });
    } catch (e) {
      throw new Error('连不上通义千问，检查一下网络');
    }
    let data = {};
    try { data = await resp.json(); } catch (e) { data = {}; }

    if (data.error) {
      const msg = data.error.message || '接口出错';
      last = msg;
      if (/Arrearage|overdue-payment|good standing/i.test(msg)) {
        throw new Error('百炼账户欠费了：去阿里云控制台结清费用，识别就能用');
      }
      if (/invalid_api_key|Incorrect API key/i.test(msg)) {
        throw new Error('API Key 不对，去「我的」重新填一下');
      }
      const modelIssue = /model/i.test(msg) || /不存在/.test(msg);
      if ((resp.status === 400 || resp.status === 404) && modelIssue) continue;
      if (resp.status === 401) throw new Error('API Key 不对，去「我的」重新填一下');
      if (resp.status === 429) throw new Error('调用太频繁或额度用完了，等会儿再试');
      throw new Error(msg);
    }
    if (!data.choices || !data.choices.length) {
      last = '模型没有返回内容'; continue;
    }
    if (setting('ai_model', '') !== model) setSetting('ai_model', model);
    return data.choices[0].message.content;
  }
  throw new Error(last || '没有可用的视觉模型');
}

function extractJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) { /* 继续 */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* 继续 */ } }
  throw new Error('模型返回的不是有效 JSON，再试一次');
}

function num(v, def = 0) {
  if (v === null || v === undefined) return def;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? def : n;
}

function cleanItems(obj) {
  const items = [];
  (obj.items || []).slice(0, 15).forEach(it => {
    const name = String(it.name || '').trim();
    const grams = num(it.grams, 0);
    if (!name || grams <= 0) return;
    // 0 千卡是合法值（无糖饮料、白水），只有「根本没给数字」才去拿总热量倒推
    let k100 = num(it.kcal_per_100g, NaN);
    if (isNaN(k100)) {
      const total = num(it.kcal, NaN);
      k100 = isNaN(total) ? 0 : total / grams * 100;
    }
    if (k100 < 0) k100 = 0;
    items.push({
      name,
      grams: Math.round(grams),
      kcal_per_100g: Math.round(k100 * 10) / 10,
      protein_per_100g: Math.round(num(it.protein_per_100g) * 10) / 10,
      carb_per_100g: Math.round(num(it.carb_per_100g) * 10) / 10,
      fat_per_100g: Math.round(num(it.fat_per_100g) * 10) / 10,
      confidence: Math.min(1, Math.max(0, num(it.confidence, 0.6))),
    });
  });
  if (!items.length) throw new Error('没认出图里的食物，换个角度或拍近一点再试。');
  return { items, dish: obj.dish || '', note: obj.note || '' };
}

async function analyzeFood(image, hint, image2) {
  const content = [{ type: 'image_url', image_url: { url: image } }];
  if (image2) content.push({ type: 'image_url', image_url: { url: image2 } });
  content.push({ type: 'text', text: FOOD_PROMPT + (hint ? `\n\n补充说明：${hint}` : '') });
  return cleanItems(extractJson(await callModel(content)));
}

async function analyzeText(text) {
  const content = [{ type: 'text', text: TEXT_PROMPT + '\n\n用户说：' + text }];
  return cleanItems(extractJson(await callModel(content)));
}


/* ---------------- 路由：保持和原来一样的接口形状 ---------------- */

async function api(path, body, method) {
  const m = method || (body ? 'POST' : 'GET');
  const [pathname, qs] = path.split('?');
  const q = new URLSearchParams(qs || '');
  const today = todayISO();

  // GET
  if (pathname === '/api/bootstrap') {
    return Object.assign({ ok: true, today }, daySummary(q.get('date') || today), {
      foods: FOODS,
      ai_model: setting('ai_model', ''),
    });
  }

  if (pathname === '/api/trends') {
    const days = Math.max(7, Math.min(365, Number(q.get('days') || 30)));
    return Object.assign({ ok: true }, computeTrends(days));
  }

  if (pathname === '/api/foods') {
    const kw = q.get('q') || '';
    return { ok: true, items: kw ? findFood(kw).slice(0, 25) : FOODS.slice(0, 60) };
  }

  // DELETE /api/logs/:id
  if (m === 'DELETE') {
    const mm = pathname.match(/^\/api\/logs\/(\d+)$/);
    if (mm) {
      const d = Store.load();
      const id = Number(mm[1]);
      const gone = d.logs.find(l => l.id === id);
      d.logs = d.logs.filter(l => l.id !== id);
      // 这一组的记录都删光了，顺带删掉它的照片，避免云端残留
      if (gone && gone.batch && d.shots && !d.logs.some(l => l.batch === gone.batch)) {
        delete d.shots[gone.batch];
      }
      Store.save();
      return { ok: true };
    }
  }

  // PATCH /api/logs/:id
  if (m === 'PATCH') {
    const mm = pathname.match(/^\/api\/logs\/(\d+)$/);
    if (mm && body && body.meal) {
      const d = Store.load();
      const l = d.logs.find(x => x.id === Number(mm[1]));
      if (l) { l.meal = body.meal; Store.save(); }
      return { ok: true };
    }
  }

  if (pathname === '/api/logs/rename' && m === 'POST') {
    const d = Store.load();
    const ids = (body.ids || []).map(Number);
    const name = String(body.name || '').trim().slice(0, 20);
    const batch = 'b' + ids[0];
    let date = today;
    d.logs.forEach(l => {
      if (!ids.includes(l.id)) return;
      if (body.item) l.name = name; else l.batchName = name;
      if (!l.batch) l.batch = batch;
      date = l.date || date;
    });
    Store.save();
    return { ok: true, day: daySummary(date) };
  }

  if (pathname === '/api/logs' && m === 'POST') {
    const date = body.date || today;
    const meal = body.meal || 'other';
    if (body.items && body.items.length) {
      const ids = body.items.map(it => addLog(date, meal, it, body.source || 'manual', body.batch, body.batchName));
      // 顺手存一张小图，之后点开这一组还能看到当时拍的照片
      if (body.batch && body.shot) {
        try {
          const d = Store.load();
          d.shots = d.shots || {};
          d.shots[body.batch] = String(body.shot);
          const keys = Object.keys(d.shots);
          if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(k => delete d.shots[k]);
          Store.save();
        } catch (e) { /* 图存不下也不能把记账搞失败 */ }
      }
      return { ok: true, ids, day: daySummary(date) };
    }
    const id = addLog(date, meal, body, body.source || 'manual');
    return { ok: true, id, day: daySummary(date) };
  }

  if (pathname === '/api/weight' && m === 'POST') {
    const d = Store.load();
    const date = body.date || today;
    d.weights[date] = Number(body.kg);
    d.profile.weight_kg = Number(body.kg);
    const bf = Number(body.bf), bmi = Number(body.bmi), ffm = Number(body.ffm);
    if (isFinite(bf) || isFinite(bmi) || isFinite(ffm)) {
      d.body = d.body || {};
      d.body[date] = {
        bf: isFinite(bf) && bf ? bf : null,
        bmi: isFinite(bmi) && bmi ? bmi : null,
        ffm: isFinite(ffm) && ffm ? ffm : null,
      };
    }
    Store.save();
    return { ok: true, day: daySummary(date) };
  }

  if (pathname === '/api/daily' && m === 'POST') {
    const d = Store.load();
    const date = body.date || today;
    const cur = d.daily[date] || {};
    const n = v => (v === null || v === undefined || v === '' ? null : Number(v));
    d.daily[date] = {
      active: n(body.active), resting: n(body.resting),
      total: n(body.total), steps: n(body.steps),
      source: body.source || 'manual',
    };
    if (n(body.active) === null && n(body.total) === null && n(body.resting) === null) {
      d.daily[date] = cur;
      throw new Error('至少填一项消耗数据');
    }
    Store.save();
    return { ok: true, day: daySummary(date) };
  }

  if (pathname === '/api/profile' && m === 'POST') {
    const d = Store.load();
    ['sex', 'birth_year', 'height_cm', 'weight_kg', 'activity', 'goal_rate', 'protein_per_kg']
      .forEach(k => {
        if (body[k] !== undefined && body[k] !== null) d.profile[k] = body[k];
      });
    d.settings.profile_set = true;
    Store.save();
    return { ok: true, profile: d.profile };
  }

  if (pathname === '/api/settings' && m === 'POST') {
    if (body.dashscope_key !== undefined) {
      setSetting('dashscope_key', String(body.dashscope_key || '').trim());
    }
    if (body.ai_model !== undefined) {
      setSetting('ai_model', String(body.ai_model || '').trim());
    }
    if (body.theme !== undefined) {
      setSetting('theme', String(body.theme || 'lime'));
    }
    if (body.sync_toast !== undefined) {
      setSetting('sync_toast', !!body.sync_toast);
    }
    if (body.diet_mode !== undefined) setSetting('diet_mode', String(body.diet_mode || 'maintain'));
    if (body.fat_ratio !== undefined) setSetting('fat_ratio', Number(body.fat_ratio) || 0.28);
    if (body.target_override !== undefined) {
      setSetting('target_override', body.target_override || {});
    }
    return { ok: true, has_key: !!setting('dashscope_key', '') };
  }

  if (pathname === '/api/settings/test' && m === 'POST') {
    const text = await callModel([{ type: 'text', text: '只回复两个字：可用' }]);
    return { ok: true, message: String(text).trim().slice(0, 40) };
  }

  if (pathname === '/api/ai/food' && m === 'POST') {
    return Object.assign({ ok: true }, await analyzeFood(body.image, body.hint || '', body.image2 || null));
  }
  if (pathname === '/api/ai/text' && m === 'POST') {
    return Object.assign({ ok: true }, await analyzeText(body.text || ''));
  }
  throw new Error('未知操作：' + pathname);
}

/* ---------------- 导入导出 ---------------- */

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv() {
  const d = Store.load();
  const rows = [['日期', '餐次', '食物', '克重', '热量', '蛋白', '碳水', '脂肪', '来源']];
  d.logs.slice().sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts))
    .forEach(l => rows.push([l.date, l.meal, l.name, l.grams, l.kcal, l.p, l.c, l.f, l.source]));
  rows.push([]);
  rows.push(['日期', '体重']);
  Object.keys(d.weights).sort().forEach(k => rows.push([k, d.weights[k]]));
  return '\ufeff' + rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

function downloadCsv() {
  const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `热量账本-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- 云端同步（GitHub 仓库里的 data.json） ---------------- */
/* 云端数据放在 Gitee（国内直连稳定）；网页本身仍在 GitHub Pages */
const CLOUD = { owner: 'karen228', repo: 'calorie-ledger-data', path: 'data.json', branch: 'master' };
const CLOUD_RAW = `https://gitee.com/${CLOUD.owner}/${CLOUD.repo}/raw/${CLOUD.branch}`;
let cloudTimer = null, cloudBusy = false, cloudPulling = false, cloudSha = null, cloudLast = '';
let cloudErr = '', cloudFailUntil = 0;
function cloudLastError() { return cloudErr; }

function cloudToken() {
  // 只用 Gitee 令牌；旧的 GitHub token 不再参与同步（避免拿错令牌导致 E03）
  return (setting('gitee_token', '') || '').trim();
}
/* 只把 Token 写进本机，不触发自动上传、不动 updatedAt。
   用于"开启同步"：先比较云端，再决定拉还是推。 */
function setCloudTokenSilently(token) {
  const d = Store.load();
  d.settings.gitee_token = token;
  try { localStorage.setItem(Store.KEY, JSON.stringify(d)); } catch (e) { /* 存储满时忽略 */ }
}
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64) {
  return decodeURIComponent(escape(atob(String(b64 || '').replace(/\s/g, ''))));
}
function fetchT(url, opt, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, Object.assign({}, opt, { signal: ctrl.signal }))
    .finally(() => clearTimeout(t));
}
/* 带重试的 GET：网络抖动时不立刻报错，最多试 3 次 */
async function fetchRetry(url, opt, ms = 12000, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { return await fetchT(url, opt, ms); }
    catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 600 + i * 800));
  }
  throw last || new Error('Load failed');
}
function cloudHeaders() {
  return { 'Content-Type': 'application/json' };
}
function cloudUrl() {
  return `https://gitee.com/api/v5/repos/${CLOUD.owner}/${CLOUD.repo}/contents/${CLOUD.path}?access_token=${encodeURIComponent(cloudToken())}`;
}
/* 公开仓库：读取不需要令牌（少一个出错点） */
function cloudReadUrl() {
  const tk = encodeURIComponent(cloudToken());
  return `https://gitee.com/api/v5/repos/${CLOUD.owner}/${CLOUD.repo}/contents/${CLOUD.path}?t=${Date.now()}` + (tk ? `&access_token=${tk}` : '');
}

/* 体积控制：超过 ~900KB 就丢最旧的缩略图，避免超 GitHub 单文件限制 */
function cloudPayload() {
  const data = JSON.parse(JSON.stringify(Store.load()));
  // 密钥绝不进仓库：GitHub 的 secret scanning 会直接拒绝，而且本来就不该上传
  if (data.settings) {
    delete data.settings.gh_token;
    delete data.settings.gitee_token;
    delete data.settings.dashscope_key;
  }
  const limit = 400 * 1024;
  let json = JSON.stringify({ v: 1, updatedAt: data.settings.updatedAt || new Date().toISOString(), data });
  if (json.length > limit && data.shots) {
    const keys = Object.keys(data.shots);
    while (json.length > limit && keys.length) {
      delete data.shots[keys.shift()];
      json = JSON.stringify({ v: 1, updatedAt: data.settings.updatedAt || new Date().toISOString(), data });
    }
  }
  return json;
}

function scheduleCloudSync() {
  if (!cloudToken() || cloudPulling || cloudBusy) return;
  if (Date.now() < cloudFailUntil) return;      // 失败后 30 秒内不再重试，避免死循环
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => { cloudPush(); }, 4000);
}

async function cloudPush() {
  if (!cloudToken() || cloudBusy) return null;
  cloudBusy = true;
  try {
    const payload = cloudPayload();
    // 内容没变就不用重复上传
    let h = 0;
    for (let i = 0; i < payload.length; i += 1) h = (h * 31 + payload.charCodeAt(i)) | 0;
    if (String(h) === cloudLast && cloudSha) return true;
    const body = { access_token: cloudToken(), message: 'data sync', content: b64encode(payload), branch: CLOUD.branch };
    if (cloudSha) body.sha = cloudSha;
    let method = cloudSha ? 'PUT' : 'POST';
    let res = await fetchT(cloudUrl(), { method, headers: cloudHeaders(), body: JSON.stringify(body) });
    // 400/409/422 都可能是「文件已存在 / sha 过期」：取最新 sha 后改用 PUT 覆盖
    if (res.status === 400 || res.status === 409 || res.status === 422) {
      let ok = false;
      try {
        const cur = await fetchRetry(cloudReadUrl(), { headers: { 'Accept': 'application/json' } }, 10000, 2);
        if (cur.ok) {
          const j = await cur.json();
          if (j && j.sha) { cloudSha = j.sha; body.sha = j.sha; method = 'PUT'; ok = true; }
        }
      } catch (e) {}
      if (!ok) { cloudSha = null; method = 'POST'; delete body.sha; }
      res = await fetchT(cloudUrl(), { method, headers: cloudHeaders(), body: JSON.stringify(body) });
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 120); } catch (e) {}
      if (/Secret detected/i.test(detail)) throw new Error('云端拒绝：数据里检测到密钥（已自动剔除，再点一次试试）');
      if (res.status === 409) throw new Error('云端拒绝：内容触发仓库规则');
      throw new Error('上传失败 ' + res.status + (detail ? '：' + detail.slice(0, 60) : ''));
    }
    const out = await res.json();
    cloudSha = out.content && out.content.sha;
    cloudLast = String(h);
    cloudErr = '';
    try { localStorage.removeItem('pending_push'); } catch (e) {}
    if (typeof clearErr === 'function') clearErr('err-push');
    setSetting('cloud_synced_at', new Date().toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }));
    return true;
  } catch (e) {
    cloudErr = (e && e.name === 'AbortError') ? '连不上 api.github.com（网络超时）' : (e.message || '上传失败');
    cloudFailUntil = Date.now() + 30000;
    try { localStorage.setItem('pending_push', '1'); } catch (e) {}
    try { localStorage.setItem('pending_push_at', String(Date.now())); } catch (e) {}
    if (typeof logError === 'function') logError('err-push', '同步失败（上传）', cloudErr + ' @gitee');
    return false;
  } finally {
    cloudBusy = false;
  }
}

/* 启动时拉一次：云端更新就覆盖本地 */
/* 回读云端 data.json，拿到它真实的 updatedAt（用来校验"真的写进去了"） */
async function cloudVerify() {
  try {
    const r = await fetchRetry(cloudReadUrl(), { headers: { 'Accept': 'application/json' } }, 10000, 2);
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json();
    const txt = b64decode(String(j.content || ''));
    const o = JSON.parse(txt);
    return { ok: true, updatedAt: o.updatedAt || '', sha: j.sha };
  } catch (e) { return { ok: false, err: e.message || String(e) }; }
}

async function cloudPull(force) {
  cloudErr = '';
  if (!cloudToken()) { if (typeof logError === 'function') logError('err-notoken', '还没配置同步令牌', 'E03 去 设置 → 数据同步 填 Gitee 令牌'); return false; }
  cloudPulling = true;
  try {
    let res = null;
    // 先看同源镜像（快，但可能落后几分钟）；只有它确实更新才采用，否则继续问 Gitee
    try {
      const r0 = await fetchT('data.json?t=' + Date.now(), { cache: 'no-store' }, 8000);
      if (r0 && r0.ok) {
        const remote0 = await r0.json();
        if (remote0 && remote0.data) {
          const local0 = Store.load();
          const rAt0 = String(remote0.updatedAt || '');
          const lAt0 = String((local0.settings && local0.settings.updatedAt) || '');
          if (force || (rAt0 && rAt0 > lAt0)) {
            const rd0 = remote0.data || {};
            const lb0 = local0.body || {}, lw0 = local0.weights || {};
            Object.assign(local0, rd0, { settings: Object.assign({}, local0.settings, rd0.settings) });
            local0.body = Object.assign({}, lb0, rd0.body || {});
            local0.weights = Object.assign({}, lw0, rd0.weights || {});
            local0.settings.updatedAt = rAt0;
            localStorage.setItem(Store.KEY, JSON.stringify(local0));
            setSetting('cloud_synced_at', new Date().toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }));
            cloudPulling = false;
            return 'pulled';
          }
          // 镜像不是最新 → 继续走下面的 Gitee 实时读取
        }
      }
    } catch (e) {}
    res = await fetchRetry(cloudReadUrl(), { headers: { 'Accept': 'application/json' } });
    if (res.status === 404) { cloudPulling = false; return cloudPush(); }
    if (!res.ok) throw new Error('读取失败 ' + res.status);
    const j = await res.json();
    cloudSha = j.sha;
    const remote = JSON.parse(b64decode(j.content));
    const local = Store.load();
    const rAt = String(remote.updatedAt || '');
    const lAt = String((local.settings && local.settings.updatedAt) || '');
    if (force || (rAt && rAt > lAt)) {
      const rd = remote.data || {};
      const lBody = local.body || {}, lWts = local.weights || {};
      Object.assign(local, rd, { settings: Object.assign({}, local.settings, rd.settings) });
      // body / weights 按日期合并，别让云端旧数据把本机导入的历史覆盖掉
      local.body = Object.assign({}, lBody, rd.body || {});
      local.weights = Object.assign({}, lWts, rd.weights || {});
      // 记录按 id 合并（两边各自加的都保留，不再互相覆盖）
      const byId = new Map();
      for (const l of (rd.logs || [])) if (l && l.id) byId.set(l.id, l);
      for (const l of (local.logs || [])) if (l && l.id && !byId.has(l.id)) byId.set(l.id, l);
      if (byId.size) local.logs = [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      // 每日活动数据：同一天取「更新时间较晚」的那份
      const daily = Object.assign({}, rd.daily || {});
      for (const [k, v] of Object.entries(local.daily || {})) {
        const rv = daily[k];
        if (!rv || String(v.cloudAt || '') >= String(rv.cloudAt || '')) daily[k] = v;
      }
      if (Object.keys(daily).length) local.daily = daily;
      local.settings.updatedAt = rAt;
      localStorage.setItem(Store.KEY, JSON.stringify(local));
      setSetting('cloud_synced_at', new Date().toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }));
      if (typeof clearErr === 'function') clearErr('err-pull');
      cloudPulling = false;
      return 'pulled';
    }
    // 本机时间更新：仍然合并云端的记录/体重/身体数据（按 id / 日期取并集），避免"明明云端有却看不到"
    try {
      const rd = remote.data || {};
      const local2 = Store.load();
      const byId = new Map();
      for (const l of (local2.logs || [])) if (l && l.id) byId.set(l.id, l);
      let added = 0;
      for (const l of (rd.logs || [])) {
        if (l && l.id && !byId.has(l.id)) { byId.set(l.id, l); added++; }
      }
      if (added) {
        local2.logs = [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        local2.body = Object.assign({}, rd.body || {}, local2.body || {});
        local2.weights = Object.assign({}, rd.weights || {}, local2.weights || {});
        localStorage.setItem(Store.KEY, JSON.stringify(local2));
        if (typeof clearErr === 'function') clearErr('err-pull');
        cloudPulling = false;
        return 'merged';
      }
    } catch (e) {}
    // 能读到云端（哪怕本机更新）就算读取成功，清掉旧的读取错误
    if (typeof clearErr === 'function') clearErr('err-pull');
    cloudPulling = false;
    return 'behind';
  } catch (e) {
    cloudPulling = false;
    cloudErr = (e && e.name === 'AbortError') ? '连不上 Gitee（网络超时）' : (e.message || '读取失败');
    cloudFailUntil = Date.now() + 30000;
    if (typeof logError === 'function') logError('err-pull', '同步失败（读取）', cloudErr + ' @gitee');
    return false;
  }
}

async function exportJson() {
  const text = JSON.stringify(Store.load(), null, 2);
  const name = `热量账本备份-${todayISO()}.json`;
  // 优先走系统分享面板：可以「存储到文件」直接放进 iCloud Drive
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });   // 只传文件，不带 title，否则 iOS 会多存一份纯文本
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancel';
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return 'downloaded';
}

function importJson(text) {
  const obj = JSON.parse(text);
  if (!obj || !obj.profile) throw new Error('这不是有效的备份文件');
  Store.data = Object.assign({}, obj, {
    v: 1,
    profile: obj.profile,
    logs: obj.logs || [],
    weights: obj.weights || {},
    daily: obj.daily || {},
    shots: obj.shots || {},
    settings: obj.settings || {},
  });
  Store.save();
}
