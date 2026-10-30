# ledger-body-sync（Cloudflare Worker · 体重兜底）

**作用**：每 5 分钟扫一次 ntfy 里手机推上来的体重，比 Gitee `body.json` 的 `t`，新了才写。
不依赖这台 Mac 开不开机 —— Mac 上的 `~/bin/ledger-ntfy-sync.sh` 是主链路，这是第二条。

**为什么需要它（2026-10-30 实测）**：
- Mac 关机/睡眠超过 12 小时 → ntfy 免费版消息过期，数据真丢
- GitHub Actions 的 `schedule` 在这个仓库实测 **5–6 小时才跑一次**（不是 10 分钟），兜不住

**部署**（改完 worker.js 必须重跑）：

```bash
cd push/body-sync
npx wrangler deploy
```

- 服务地址：`https://ledger-body-sync.karenwang228.workers.dev`
- 定时：`*/5 * * * *`（Cloudflare 侧，UTC 无关，5 分钟一次）
- 秘密：`GITEE_TOKEN`（`npx wrangler secret put GITEE_TOKEN`）
- KV `STATE`：`lastRun` = 每次执行的快照（证明 cron 真的在跑），`lastAction` = 最近一次有动作/有异常

**排查入口**

| 路径 | 用途 |
|---|---|
| `/status` | 看 `lastRun` / `lastAction`（`lastRun.at` 超过 10 分钟没更新 = cron 停了） |
| `/run` | 立刻手动跑一次，看返回的 `want` / `giteeBefore` / `result` |
| `/gh` | 看 GitHub 那份 body.json |

**验证记录（2026-10-30）**

- 写入链路：一次性端点把现有内容原样 PUT 回 Gitee → `readStatus 200 / writeStatus 200`（端点已删）
- cron 真的在跑：`wrangler tail` 抓到 `tailAttributes.cron = "*/5 * * * *"`、`outcome ok`、`scheduledTime` 22:05:57
- 心跳：`/status` 里 `lastRun.trigger = "cron"`，读 ntfy 得到 `64.2 / 2026-10-30`，与 Gitee 一致 → 「已是最新」
