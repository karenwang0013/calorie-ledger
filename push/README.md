# 锁屏推送（Cloudflare Worker）· 一次性设置

> **当前状态（已部署完成，2026-10-21）**
>
> - 服务地址：`https://ledger-push.karenwang228.workers.dev`
> - 账号：Cloudflare「Karenwang228@icloud.com's Account」（account id `fcbd9fa5…`）
> - KV：`SUBS` → `3cb937691f9d4d148c7ce1d147c49c52`
> - 定时：`30 13 * * *`（= 北京时间 21:30）
> - 部署方式：`cd push && npx wrangler deploy`（配置见 `wrangler.toml`；已登录过，token 存在 `~/Library/Preferences/.wrangler`）
> - 验证：浏览器打开 `/config`（看 devices 数）、`/test`（立刻给所有设备发一条）
> - App 端内置了这个地址，用户只需在「设置 → 通知 → 锁屏通知」打开开关并允许通知



做完以后：**手机 / iPad 锁屏、App 没打开，也能收到「热量账本」的通知。**
不需要服务器运维、不需要信用卡，免费额度足够个人用。

---

## 你需要做的事（约 10 分钟）

### ① 注册 Cloudflare（免费）
打开 <https://dash.cloudflare.com/sign-up>，用邮箱注册，**不需要绑卡**。

### ② 建一个 KV（存设备订阅）
左侧 **Storage & Databases → KV → Create namespace**，名字填 `ledger`，创建。

### ③ 建 Worker 并粘贴代码
左侧 **Compute (Workers) → Create → Worker**，名字填 `ledger-push`，创建后点 **Edit code**，
把仓库里 [`push/worker.js`](worker.js) 的**全部内容**粘贴进去覆盖，然后 **Deploy**。

### ④ 给 Worker 绑定 KV
Worker → **Settings → Variables and Secrets → KV Namespace Bindings → Add**：
- Variable name：`SUBS`
- KV namespace：选第 ② 步建的 `ledger`
保存。

### ⑤ 设一个“每天几点提醒我”的定时
Worker → **Settings → Triggers → Cron Triggers → Add**，填：

```
30 13 * * *
```

⚠️ Cron 用的是 **UTC**。上面这行 = **北京时间 21:30**。
想改成 22:00 就写 `0 14 * * *`（北京时间 = UTC+8）。

### ⑥ 记下地址，验证
打开 `https://<你的子域>.workers.dev/config`，应该看到类似：

```json
{"publicKey":"B...","devices":0}
```

能看到这段就说明服务活了。**把这个 Worker 地址复制下来**（到 `.workers.dev` 为止，不要带 `/config`）。

### ⑦ 在 App 里开启（每台设备各做一次）
1. 更新到最新版，**从主屏幕图标**打开 App（Safari 标签页里不行）
2. 设置 → 通知 → 「锁屏通知」那一行点 **开启** → 粘贴第 ⑥ 步的地址
3. 弹出系统提示时点 **允许**
4. 回到那一行，应该显示 **已开启**

iPhone 和 iPad 各做一次第 ⑦ 步，两台就都能收到。

---

## 验证与排查

- **立刻测试**：浏览器访问 `https://<你的子域>.workers.dev/test` → 手机会马上收到一条通知（就算 App 关着）。
- 收不到？依次检查：
  1. App 是不是**从主屏幕图标**打开的（Safari 里不行，这是苹果限制）
  2. 系统设置 → 通知 → 热量账本 → 允许通知 是否打开
  3. `/config` 里 `devices` 是不是 ≥ 1（0 表示这台设备没订阅上）
  4. 定时没触发：Cron 是 UTC，记得 −8 小时
- **关掉某台设备**：App 里把「锁屏通知」关掉即可（会从服务端删掉这台设备的订阅）。

## 通知里会显示什么

通知正文由 App 的 Service Worker 现场读 `data.json` 算出来，例如：

> **热量账本**
> 今天已记 1283 千卡 · 活动消耗 174 千卡
> 或者：今天还没记录，点一下记一笔

点通知会直接打开 App。

## 边界（实话）

- 只能**定时**（Cron）触发，触发时 App 关着也能收到。
- 这不是“有人给你发消息”那种实时推送；要“某个指标一到就提醒”，还得靠快捷指令（脚本跑完那一下）。
- Cloudflare 免费额度：每天 10 万次请求，个人用完全用不完。
