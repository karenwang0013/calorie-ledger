/**
 * 热量账本 · 推送服务（Cloudflare Worker）
 * ------------------------------------------------------------
 * 作用：让 iPhone / iPad 在锁屏、App 没打开时也能收到提醒。
 * 只需要部署一次，之后完全自动。
 *
 * 部署（不需要 node、不需要 wrangler，网页上就能做完）：
 * 1. 打开 https://dash.cloudflare.com → 注册免费账号（不绑卡）
 * 2. 左侧 Storage & Databases → KV → Create namespace，名字随便（例如 ledger）
 * 3. 左侧 Compute (Workers) → Create → Worker，把本文件全部内容粘贴进去 → Deploy
 * 4. 回到 Worker → Settings → Variables → KV Namespace Bindings：
 *      Variable name 填  SUBS
 *      KV namespace 选 刚建的那个  → Save
 * 5. Settings → Triggers → Cron Triggers → 添加  30 21 * * *  （每天 21:30，UTC 时间见下）
 * 6. 打开 https://<你的子域>.workers.dev/config ，能看到一段 publicKey 就成功了
 *
 * 说明：
 * - VAPID 密钥对在第一次访问 /config 时自动生成并存进 KV，不用你手动生成。
 * - 推送不带正文（免去加密），正文由 App 的 Service Worker 自己读取云端数据后拼出来。
 * - Cron 用的是 UTC 时间：北京时间 21:30 → UTC 13:30 → 写 "30 13 * * *"。
 */

const SUB = (env) => env.SUBS;

function json(obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function b64uFromBuf(buf) {
  const b = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64uFromStr(str) {
  return b64uFromBuf(new TextEncoder().encode(str));
}

/** 取（或第一次生成）VAPID 密钥对 */
async function getKeys(env) {
  const kv = SUB(env);
  let raw = await kv.get('vapid');
  if (raw) return JSON.parse(raw);
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64uFromBuf(await crypto.subtle.exportKey('raw', pair.publicKey));   // 65 字节未压缩
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const rec = { pub, privJwk };
  await kv.put('vapid', JSON.stringify(rec));
  return rec;
}

/** 生成 VAPID 用的 JWT（ES256） */
async function vapidJWT(privJwk, aud) {
  const key = await crypto.subtle.importKey(
    'jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64uFromStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64uFromStr(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:ledger@example.com',
  }));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  return `${header}.${payload}.${b64uFromBuf(sig)}`;
}

/** 发一条“空推送”（正文由前端 SW 生成） */
async function sendOne(sub, keys) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJWT(keys.privJwk, aud);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '43200',
      Urgency: 'normal',
      Authorization: `vapid t=${jwt}, k=${keys.pub}`,
    },
  });
  return res.status;
}

async function pushAll(env) {
  const kv = SUB(env);
  const keys = await getKeys(env);
  const list = await kv.list({ prefix: 's:' });
  let ok = 0, gone = 0;
  for (const k of list.keys) {
    const raw = await kv.get(k.name);
    if (!raw) continue;
    let sub;
    try { sub = JSON.parse(raw); } catch (e) { await kv.delete(k.name); continue; }
    try {
      const code = await sendOne(sub, keys);
      if (code === 404 || code === 410) { await kv.delete(k.name); gone++; } else { ok++; }
    } catch (e) { /* 网络问题就跳过 */ }
  }
  return { ok, gone, total: list.keys.length };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/config') {
      const k = await getKeys(env);
      const list = await SUB(env).list({ prefix: 's:' });
      return json({ publicKey: k.pub, devices: list.keys.length }, CORS);
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const body = await request.json();
      if (!body || !body.endpoint) return json({ ok: 0, error: 'no endpoint' }, CORS);
      const id = 's:' + b64uFromBuf(new TextEncoder().encode(body.endpoint)).slice(0, 48);
      await SUB(env).put(id, JSON.stringify(body));
      return json({ ok: 1, id }, CORS);
    }

    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body && body.endpoint) {
        const id = 's:' + b64uFromBuf(new TextEncoder().encode(body.endpoint)).slice(0, 48);
        await SUB(env).delete(id);
      }
      return json({ ok: 1 }, CORS);
    }

    // 诊断：App 打开时把「权限 / 有没有订阅 / 报错」传上来，方便远程定位
    if (url.pathname === '/diag' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const rec = Object.assign({ t: new Date().toISOString() }, b);
      const id = (b.ua || 'dev') + '|' + (b.ver || '');
      await SUB(env).put('d:' + b64uFromStr(id).slice(0, 40), JSON.stringify(rec));
      return json({ ok: 1 }, CORS);
    }
    if (url.pathname === '/diag') {
      const l = await SUB(env).list({ prefix: 'd:' });
      const items = [];
      for (const k of l.keys.slice(0, 6)) {
        const v = await SUB(env).get(k.name);
        if (v) items.push(JSON.parse(v));
      }
      return json({ ok: 1, items }, CORS);
    }

    if (url.pathname === '/test') {
      const r = await pushAll(env);
      return json({ ok: 1, ...r }, CORS);
    }

    return new Response('热量账本推送服务在运行。访问 /config 查看公钥。', {
      headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
    });
  },

  /** Cron 到点：给所有订阅发一条空推送 */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pushAll(env));
  },
};
