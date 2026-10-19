# 热量账本 · 开发说明（给 AI Agent）

## 项目是什么

纯前端 PWA，**无构建、无后端、无依赖**。原生 JS + localStorage。

- 线上：<https://karenwang0013.github.io/calorie-ledger/>
- 仓库：`karenwang0013/calorie-ledger`，main 分支根目录，GitHub Pages 部署
- 本地：`~/Documents/calorie-ledger`

## 文件职责

| 文件 | 作用 |
|---|---|
| `index.html` | 全部界面结构（今日 / 趋势 / 设置 + 弹层） |
| `app.js` | 状态与渲染：全局 `S`、`renderToday`、`renderMeals`、弹层、手势、手写滚动、主题 |
| `api.js` | 本地「假后端」：`Store`、`daySummary`、AI 请求、导入导出、云端同步 |
| `style.css` | 全部样式；主题靠 `:root` 的 `--lime` / `--glow-rgb` 等变量 |
| `foods.js` | 118 条食物库 |
| `sw.js` | Service Worker：网络优先 + 缓存兜底 |
| `health.json` | 快捷指令写入的手表数据（格式 `日期\|数值,数值…`），**不要手改** |
| `data.json` | 云端同步文件，由 App 自动读写，**不要手改** |
| `version.txt` | 线上版本号，App 启动时比对，不一致就自动刷新 |

## 改动约定（每次都要做）

改了 `index.html` / `style.css` / `app.js` / `api.js` / `foods.js` 之后：

1. `sw.js`：`CACHE = 'ledger-vNNN'` 版本号 +1
2. `index.html`：所有 `?v=NNN` 同步 +1
3. `app.js`：`APP_VERSION` 改成同一版本号（顶栏和关于页都读它）
4. `version.txt`：写同一个版本号
5. 提交身份：`KarenWang <karenwang0013@users.noreply.github.com>`
6. 推送后等 30–60 秒，用 `curl https://karenwang0013.github.io/calorie-ledger/version.txt` 确认线上已更新

不要引入构建工具、框架或 npm 依赖 —— 保持「静态文件直接能跑」。

## 数据结构

`localStorage['calorie-ledger-v1']`：

```
profile   { sex, birth_year, height_cm, weight_kg, activity, goal_rate, protein_per_kg }
logs[]    { id, date, ts, meal, name, grams, kcal, p, c, f, source, batch?, batchName? }
weights{} { 'YYYY-MM-DD': kg }
daily{}   { 'YYYY-MM-DD': { active, resting, total, steps, source, cloudAt } }
shots{}   { batchId: 'data:image/jpeg;base64,…' }   // 320px 缩略图，最多 60 张
settings  { theme, target_override, dashscope_key, gh_token, ai_model, updatedAt, … }
```

云端同步：`data.json = { v, updatedAt, data }`；上传前**必须剔除** `settings.gh_token` 和 `settings.dashscope_key`，否则会被 GitHub secret scanning 拒绝（409）。

## 已知坑（踩过的）

- **iOS PWA 与 Safari 存储完全隔离**：删掉主屏图标 = 删掉数据。任何"重装"操作前必须备份
- **顶部系统模糊带**：iOS 会盖住屏幕顶部约 80px，顶栏文字要留在安全区下方 20px 之外
- **不能用原生滚动**：iOS 橡皮筋会把 fixed 元素一起拖走。现在顶栏 `fixed` + 内容用手写滚动（`app.js` 里的 `SC`），改布局时别破坏它
- **GitHub secret scanning**：任何含密钥的提交会被拒绝
- 数字口径：基础代谢用 Mifflin-St Jeor；消耗 = 基础代谢 + 手表活动能量；缺口封顶为消耗的 22%
- 测试：`python3 -m http.server` 起本地静态服务，或直接对线上验证

## 沟通方式

用户不是工程师。改动时：

- 一次只动一处，改完告诉他**去哪儿看、看到什么算成功**
- 不要长篇讲原理；结果优先
- 涉及手机端操作（快捷指令、iCloud、token）要给出可照做的分步清单
