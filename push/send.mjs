/**
 * 每天到点发一条锁屏推送（由 GitHub Actions 调用，不依赖 Cloudflare）
 * 需要的环境变量：VAPID_PUBLIC / VAPID_PRIVATE（仓库 Secrets 里已配好）
 */
import fs from 'node:fs';
import webpush from 'web-push';

webpush.setVapidDetails('mailto:ledger@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const readJson = (p, def) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; }
};

const subs = readJson('push-subs.json', []);
if (!Array.isArray(subs) || !subs.length) {
  console.log('没有订阅，跳过');
  process.exit(0);
}

const store = readJson('data.json', {}).data || {};
const now = new Date(Date.now() + 8 * 3600 * 1000);          // 北京时间
const today = now.toISOString().slice(0, 10);
const logs = (store.logs || []).filter(l => l.date === today);
const intake = Math.round(logs.reduce((a, b) => a + (b.kcal || 0), 0));
const day = (store.daily || {})[today] || {};
const payload = JSON.stringify({
  title: '热量账本',
  body: intake
    ? `今天已记 ${intake} 千卡` + (day.active ? ` · 活动 ${Math.round(day.active)} 千卡` : '')
    : '今天还没记录，点一下记一笔',
});

let ok = 0, dead = 0;
for (const sub of subs) {
  try {
    await webpush.sendNotification(sub, payload, { TTL: 43200 });
    ok++;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) dead++;
    console.log('发送失败', e.statusCode, e.body || e.message);
  }
}
console.log(`发送完成：成功 ${ok}，失效 ${dead}，共 ${subs.length}`);
