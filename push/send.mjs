/**
 * 推送（GitHub Actions 调用）
 *  - 定时（22:00 北京）：按 push-config.json 里的开关，决定发哪一条
 *  - 事件（repository_dispatch）：watch / goal / fail，立刻发
 */
import fs from 'node:fs';
import webpush from 'web-push';

webpush.setVapidDetails('mailto:ledger@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const readJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; } };

const subsRaw = readJson('push-subs.json', []);
const subs = Array.isArray(subsRaw) ? subsRaw : (subsRaw.subs || []);
if (!subs.length) { console.log('没有订阅，跳过'); process.exit(0); }

const cfg = readJson('push-config.json', {});
const flags = Object.assign({ watch: true, goal: true, day: true, weight: true, fail: true, daily: true }, cfg.flags || {});
const store = readJson('data.json', {}).data || {};

const bj = new Date(Date.now() + 8 * 3600 * 1000);
const today = bj.toISOString().slice(0, 10);
const logs = (store.logs || []).filter(l => l.date === today);
const intake = Math.round(logs.reduce((a, b) => a + (b.kcal || 0), 0));
const day = (store.daily || {})[today] || {};
const active = Math.round(day.active || 0);
const ov = (store.settings || {}).target_override || {};
// v9.63：这里的「还可以吃」以前用 Number(ov.kcal)，而用户只设了「缺口」没设可吃，
// 结果 left 永远是 null，推送里那一段就从来没有过。现在按和 App 一样的口径算一遍。
const prof = store.profile || {};
const ACT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const age = prof.birth_year ? (new Date().getFullYear() - Number(prof.birth_year)) : 30;
const bw = Number(prof.weight_kg) || 60;
const bmr = 10 * bw + 6.25 * (Number(prof.height_cm) || 170) - 5 * age + (prof.sex === 'male' ? 5 : -161);
const dayTotal = Number(day.total), dayActive = Number(day.active);
let exp;
if (dayTotal > 500) exp = Math.round(dayTotal);
else if (dayActive > 0) exp = Math.round(bmr + dayActive);
else {
  // 当天还没手表数据 → 沿用最近一天的手表数据（和 App 的 v9.63 一致），没有才退回公式
  const prev = Object.keys(store.daily || {})
    .filter(k => String(k) < today && (Number(store.daily[k].active) > 0 || Number(store.daily[k].total) > 500))
    .sort().pop();
  if (prev) {
    const w0 = store.daily[prev];
    exp = Math.round(Number(w0.total) > 500 ? Number(w0.total) : bmr + Number(w0.active));
  } else {
    exp = Math.round(bmr * (ACT[prof.activity] || 1.375));
  }
}
const hasDefOv = ov.deficit !== undefined && ov.deficit !== null && ov.deficit !== '' && isFinite(Number(ov.deficit));
const goalWant = Math.min(700, Math.max(-600, -Number(prof.goal_rate || 0) * 7700 / 7));   // 正=缺口
const budget = hasDefOv
  ? Math.max(0, Math.round(exp - Number(ov.deficit)))
  : (Number(ov.kcal) || Math.round(exp - goalWant));
const left = budget ? budget - intake : null;

// 距上次称体重多少天
const ws = Object.keys(store.weights || {}).sort();
const lastW = ws[ws.length - 1];
const daysW = lastW ? Math.floor((Date.now() - new Date(lastW + 'T00:00:00').getTime()) / 86400000) : 999;

const bjHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();

/* 定时那几次（北京时间 08:00–09:59 / 21:00–22:59 每 10 分钟一个窗口）：
   不再靠 cron 字符串认事件，直接看北京几点；再用 push-sent.json 保证一天只发一次。
   GitHub 的 schedule 会延迟，所以同一个事件有 12 次机会，谁先跑成功就算谁的。 */
let event = process.env.EVENT || '';         // morning/evening/watch/goal/fail；'' = 按时间自动判断
if (!event) {
  // v9.63：GitHub 的 schedule 经常整体漂移（实测有 12:26、00:57 这种点），
  // 原来按「两小时窗口」判断，漂出去就一条都不发（10-25 早晚全漏）。
  // 现在把窗口放宽到 4 段小时，晚发总比不发强；重复发送由后面的 push-sent.json 挡。
  if (bjHour >= 8 && bjHour < 12) event = 'morning';
  else if (bjHour >= 20 && bjHour < 24) event = 'evening';
}
const SENT_FILE = 'push-sent.json';
let sentMap = {};
try { sentMap = JSON.parse(fs.readFileSync(SENT_FILE, 'utf8')) || {}; } catch (e) { sentMap = {}; }
if ((event === 'morning' || event === 'evening') && sentMap[event] === today) {
  console.log(`今天 ${event} 已经发过了（${sentMap[event]}），这次跳过`);
  process.exit(0);
}
if (!event) { console.log('不在推送窗口内（北京时间 ' + bjHour + ' 点），跳过'); process.exit(0); }
// 定时那次发什么，看 workflow 传进来的"是哪个 cron"（EVENT=morning/evening）。
// 以前是按"北京时间几点"猜，GitHub 一延迟就猜错：22:00 那次延迟到 02:12，
// 结果凌晨发了"上秤提醒"、22:00 的补记反而没发（v7.62 修）
const isMorning = event === 'morning' || (event === '' && bjHour < 10);
let body = '';

if (isMorning) {
  // 早上这一次只干一件事：提醒上秤。已经称过今天就不打扰。
  const weighedToday = (store.weights || {})[today];
  let nW = 0;
  const d0 = new Date(today + 'T00:00:00Z');
  for (let i = 0; i < 10; i++) {
    const d = new Date(d0.getTime() - i * 86400000).toISOString().slice(0, 10);
    if ((store.weights || {})[d]) nW++;
  }
  const need = Math.max(0, 4 - nW);
  if (flags.weight && !weighedToday) {
    body = need > 0
      ? `⚖️ 上秤时间 · 再连续称 ${need} 天就能算出真实消耗`
      : `⚖️ 上秤时间 · 每周称一次，曲线才准`;
  } else if (weighedToday) {
    // 今天已经称过：不发，但也记下来，窗口里后面那几次别再白跑
    sentMap[event] = today;
    try { fs.writeFileSync(SENT_FILE, JSON.stringify(sentMap, null, 2)); } catch (e) {}
  }
} else if (event === 'watch') {
  if (flags.watch) body = `⌚ 数据已更新：活动 ${active} 千卡` + (left != null ? ` · 还可以吃 ${left} 千卡` : '');
} else if (event === 'goal') {
  if (flags.goal && left != null && left < 0) body = `⚠️ 今天已超出目标 ${Math.abs(left)} 千卡`;
} else if (event === 'fail') {
  if (flags.fail) body = '☁️ 同步失败：读不到云端数据';
} else {
  // 晚上这一次只管"补记 / 小结"：称重提醒已经挪到早上 08:30 那一条，
  // 这样一天里称重最多提醒一次，不会早晚各来一遍。
  if (flags.day && !logs.length) body = '今天还没记录，点一下记一笔';
  else if (flags.daily) body = intake
    ? `今天已记 ${intake} 千卡` + (left != null ? ` · ${left >= 0 ? '还差' : '超出'} ${Math.abs(left)} 千卡` : '')
    : '今天还没记录，点一下记一笔';
}

if (!body) { console.log('按当前开关，这次不需要发（' + (event || '定时') + '）'); process.exit(0); }

const payload = JSON.stringify({ title: '热量账本', body });
let ok = 0, dead = 0;
for (const sub of subs) {
  try { await webpush.sendNotification(sub, payload, { TTL: 43200 }); ok++; }
  catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead++; console.log('失败', e.statusCode, e.body || e.message); }
}
console.log(`发送完成（${event || '定时'}）：成功 ${ok}，失效 ${dead}，共 ${subs.length} → ${body}`);

/* 发成功就把「今天这个事件已经发过」记下来，窗口里后面那几次就不再重复打扰 */
if (ok > 0 && (event === 'morning' || event === 'evening')) {
  sentMap[event] = today;
  try { fs.writeFileSync(SENT_FILE, JSON.stringify(sentMap, null, 2)); } catch (e) {}
}
