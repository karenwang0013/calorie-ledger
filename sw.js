/* 离线缓存：让 App 在没网的时候也能打开 */
const CACHE = 'ledger-v1226';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './foods.js',
  './api.js',
  './calc.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './version.txt',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // 逐个缓存：某一个下载失败（网络抖动）也不会让整批都白装
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只缓存自己的文件，通义千问的请求一律放行
  if (url.origin !== self.location.origin) return;

  // 同步数据文件永远走网络，不能吃缓存
  if (url.pathname.endsWith('health.json')) return;

  // 打开页面：先走网络拿最新版，断网了再用缓存
  // 注意：网络“卡住”（请求一直不返回，不是报错）时 catch 不会触发，以前就永远停在加载中。
  // 所以跟时间赛跑：1.5 秒没回来先给缓存，网络那边回来了照样在后台更新缓存。
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const net = fetch(req, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      });
      net.catch(() => {});
      const fast = await Promise.race([
        net.catch(() => null),
        new Promise(r => setTimeout(() => r(null), 1500)),
      ]);
      return fast || (await caches.match('./index.html')) || (await caches.match('./')) || net;
    })());
    return;
  }

  // 其他静态资源：先走网络，失败再用缓存（保证 HTML 和 JS 版本一致）
  e.respondWith((async () => {
    const net = fetch(req, { cache: 'no-store' }).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    });
    net.catch(() => {});
    try {
      // 同上：请求卡住不等它，3 秒就按失败处理，用缓存顶上
      return await Promise.race([
        net,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
    } catch (err) {
      // 关键兜底：index.html 里带的是 app.js?v=738，而缓存里可能存的是 app.js?v=737
      // 或不带参数的 app.js —— 精确匹配会 miss，然后 respondWith(undefined) 就变成"脚本没加载"。
      // 所以：① 原样 ② 忽略 ?v= ③ 按文件名 三层兜底。
      const hit = (await caches.match(req))
        || (await caches.match(req, { ignoreSearch: true }))
        || (await caches.match(new URL(req.url).pathname, { ignoreSearch: true }));
      return hit || new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});

/* ---------- 锁屏推送 ---------- */
// 服务端（Cloudflare Worker）只发一条“空推送”，正文在这里现场算：
// 读同源的 data.json，算出今天记了多少、有没有记录。
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    /* 2026-10-29（用户要求）：App 在前台时不许再从屏幕顶上滑一条系统横幅下来 ——
       App 内所有卡片/提示都是统一的，只有系统通知是从上往下，用户觉得不统一。
       所以：有可见的窗口就把内容交给页面（页面用底部提示条显示 + 记进提醒记录），
       只有在 App 不在前台（锁屏 / 切走了）时，才发系统通知。 */
    const show = async (title, body) => {
      try {
        const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of cs) {
          if (c.focused || c.visibilityState === 'visible') {
            c.postMessage({ type: 'inapp-notify', title, body });
            return;
          }
        }
      } catch (err) {}
      await self.registration.showNotification(title, {
        body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'ledger-daily',
        renotify: false,
      });
    };
    let body = '点开看看今天的记录';
    // 服务端（GitHub Actions）会带正文过来，优先用它
    try {
      if (e.data) {
        const p = e.data.json();
        if (p && p.body) {
          await show(p.title || '热量账本', p.body);
          return;
        }
      }
    } catch (err) {}
    try {
      const r = await fetch('./data.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        const d = (j && j.data) || {};
        const now = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        const today = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
        const hour = now.getHours();
        const morning = hour >= 5 && hour < 12;
        if (morning) {
          // 早上这一次只管"上秤"：今天已经称过就干脆不弹
          const ws = d.weights || {};
          if (ws[today]) return;
          let n = 0;
          for (let i = 0; i < 10; i++) {
            const t = new Date(now); t.setDate(t.getDate() - i);
            const k = t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate());
            if (ws[k]) n++;
          }
          const need = Math.max(0, 4 - n);
          body = need > 0
            ? '⚖️ 上秤时间 · 再连续称 ' + need + ' 天就能算出真实消耗'
            : '⚖️ 上秤时间 · 每周称一次，曲线才准';
        } else {
          const logs = (d.logs || []).filter((l) => l.date === today);
          const intake = Math.round(logs.reduce((a, b) => a + (b.kcal || 0), 0));
          const day = (d.daily || {})[today] || {};
          if (intake > 0) {
            body = '今天已记 ' + intake + ' 千卡' + (day.active ? ' · 活动消耗 ' + Math.round(day.active) + ' 千卡' : '');
          } else {
            body = '今天还没记录，点一下记一笔';
          }
        }
      }
    } catch (err) { /* 没网就用默认文案 */ }
    await show('热量账本', body);
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
