/**
 * 热量账本 · 体重兜底同步（Cloudflare Worker Cron）
 *
 * 为什么要有它：
 *   Mac 上的 launchd 脚本（~/bin/ledger-ntfy-sync.sh）每 60 秒把 ntfy 里的体重写进云端。
 *   但 Mac 关机/睡眠超过 12 小时，ntfy 免费版的消息就过期了，数据真丢。
 *   GitHub Actions 的定时任务在这个仓库实测 5-6 小时才跑一次，兜不住。
 *   这个 Worker 由 Cloudflare 每 5 分钟触发一次，跟本机开不开机无关。
 *
 * 做一件事：ntfy 里最新一条有效读数 → 比 Gitee 现有 t → 更新才写。
 * 不写 GitHub：App v10.63 起按 t 取最新，Gitee 新就够了，GitHub 那份由 mirror workflow 跟上。
 */

const TOPIC = 'ledger-kw-9c6f2d';
const GITEE_API = 'https://gitee.com/api/v5/repos/karen228/calorie-ledger-data/contents/body.json';
const GH_RAW = 'https://raw.githubusercontent.com/karenwang0013/calorie-ledger/main/body.json';

function b64decodeUtf8(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function cstDate(sec) {
  const d = new Date((Number(sec) || 0) * 1000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
const tMs = v => {
  const n = Number(v) || 0;
  return n > 0 && n < 1e12 ? n * 1000 : n;   // 秒 → 毫秒
};

async function newestFromNtfy() {
  const r = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=12h`, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
  const txt = await r.text();
  let best = null;
  for (const line of txt.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch (e) { continue; }
    if (o.event !== 'message' || !o.message) continue;
    let d;
    try { d = JSON.parse(b64decodeUtf8(o.message)); } catch (e) { continue; }
    if (!d || !String(d.w == null ? '' : d.w).trim()) continue;   // 跳过空包（健康样本没读到那种）
    if (Number.isNaN(Number(d.w))) continue;
    if (!best || (o.time || 0) > (best.time || 0)) best = { time: o.time || 0, d };
  }
  return best;
}

async function sync(env, trigger) {
  const out = { at: new Date().toISOString(), trigger, steps: [] };
  const nt = await newestFromNtfy();
  if (!nt) { out.result = 'ntfy 无有效读数'; return out; }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(nt.d.d || '')) ? String(nt.d.d) : cstDate(nt.time);
  const want = {
    d: day,
    w: String(nt.d.w),
    bf: String(nt.d.bf == null ? '' : nt.d.bf),
    bmi: String(nt.d.bmi == null ? '' : nt.d.bmi),
    ffm: String(nt.d.ffm == null ? '' : nt.d.ffm),
    t: tMs(nt.time),
  };
  out.want = want;

  // 只认最近两天，防止把很久以前的旧消息写成新数据
  const nowCst = cstDate(Math.floor(Date.now() / 1000));
  const yCst = cstDate(Math.floor(Date.now() / 1000) - 86400);
  if (day !== nowCst && day !== yCst) { out.result = `读数日期 ${day} 太旧，不写`; return out; }

  // ---- Gitee ----
  const g = await fetch(`${GITEE_API}?access_token=${env.GITEE_TOKEN}&t=${Date.now()}`, { cf: { cacheTtl: 0 } });
  if (!g.ok) { out.result = `Gitee 读取失败 HTTP ${g.status}`; return out; }
  const gj = await g.json();
  let cur = {};
  try { cur = JSON.parse(b64decodeUtf8(gj.content)); } catch (e) { cur = {}; }
  out.giteeBefore = cur;
  if (tMs(cur.t) >= want.t && String(cur.w || '') !== '') {
    out.result = `Gitee 已是最新（云端 t=${tMs(cur.t)} ≥ ${want.t}）`;
    return out;
  }
  const body = {
    access_token: env.GITEE_TOKEN,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(want)))),
    message: `body sync ${new Date().toISOString().slice(0, 19).replace('T', ' ')} (worker)`,
    sha: gj.sha,
    branch: 'master',
  };
  let put = await fetch(GITEE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cf: { cacheTtl: 0 },
  });
  if (put.status === 409 || put.status === 422) {        // sha 过期：重取一次再写
    const g2 = await fetch(`${GITEE_API}?access_token=${env.GITEE_TOKEN}&t=${Date.now()}`, { cf: { cacheTtl: 0 } });
    const gj2 = await g2.json();
    body.sha = gj2.sha;
    put = await fetch(GITEE_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cf: { cacheTtl: 0 },
    });
  }
  out.giteeStatus = put.status;
  out.result = put.ok ? 'Gitee 已写入' : `Gitee 写入失败 HTTP ${put.status}`;
  if (put.ok) out.gitee = want;
  return out;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      let r;
      try {
        r = await sync(env, 'cron');
        console.log('cron', event.cron, JSON.stringify(r));
      } catch (e) {
        r = { at: new Date().toISOString(), trigger: 'cron', result: 'error: ' + String(e && e.message || e) };
        console.log('cron error', event.cron, String(e && e.message || e));
      }
      // 心跳：证明 cron 真的在跑（tail 连不上时靠它看）
      try {
        await env.STATE.put('lastRun', JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 7 });
        if (r && r.result && !/已是最新/.test(r.result)) {
          await env.STATE.put('lastAction', JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 7 });
        }
      } catch (e) {}
    })());
  },
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/status') {
      const get = async k => { try { const v = await env.STATE.get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
      return new Response(JSON.stringify({ lastRun: await get('lastRun'), lastAction: await get('lastAction') }, null, 2),
        { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (u.pathname === '/run') {
      try {
        const r = await sync(env, 'manual');
        return new Response(JSON.stringify(r, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e && e.message || e) }, null, 2), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (u.pathname === '/gh') {   // 顺手看一眼 GitHub 那份现在是什么（排查用）
      const r = await fetch(GH_RAW + '?t=' + Date.now(), { cf: { cacheTtl: 0 } });
      return new Response(await r.text(), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    return new Response('ledger-body-sync\nGET /run 手动跑一次\nGET /gh  看 GitHub 那份\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
