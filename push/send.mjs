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
const budget = Number(ov.kcal) || 0;
const left = budget ? budget - intake : null;

// 距上次称体重多少天
const ws = Object.keys(store.weights || {}).sort();
const lastW = ws[ws.length - 1];
const daysW = lastW ? Math.floor((Date.now() - new Date(lastW + 'T00:00:00').getTime()) / 86400000) : 999;

const event = process.env.EVENT || '';       // '' = 定时；watch/goal/fail = 事件
let body = '';

if (event === 'watch') {
  if (flags.watch) body = `⌚ 数据已更新：活动 ${active} 千卡` + (left != null ? ` · 还可以吃 ${left} 千卡` : '');
} else if (event === 'goal') {
  if (flags.goal && left != null && left < 0) body = `⚠️ 今天已超出目标 ${Math.abs(left)} 千卡`;
} else if (event === 'fail') {
  if (flags.fail) body = '☁️ 同步失败：读不到云端数据';
} else {
  // 定时：按优先级只发一条，条件不成立就不发
  if (flags.weight && lastW && daysW >= 3) body = `该称体重了：上次记是 ${daysW} 天前`;
  else if (flags.day && !logs.length) body = '今天还没记录，点一下记一笔';
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
