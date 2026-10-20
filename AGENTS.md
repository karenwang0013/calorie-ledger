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
5. **每次发版必须在 `app.js` 的 `RELEASES` 顶部加一条 `{ v: 'vX.YZ', d: 'MM-DD', items: [...] }`**，写清这一版改了什么（关于页直接读它，用户靠这个确认更新内容）
6. 提交身份：`KarenWang <karenwang0013@users.noreply.github.com>`
7. 推送后等 30–60 秒，用 `curl https://karenwang0013.github.io/calorie-ledger/version.txt` 确认线上已更新

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

## 顶部磨砂（踩过很多次的坑，别再改）

主屏幕 App 打开时，状态栏那块会出现一层磨砂/模糊。**唯一有效的做法**（v2.39 验证通过）：

1. `index.html` 最上方保留 `<div class="statusbg">`，CSS 里 `.statusbg` 必须是 `position: fixed; top: 0;` 实色 `#0d0f0e; z-index: 40`
2. `.topbar` 必须 `position: fixed; top: 0`，背景 `#0d0f0e`（和状态栏同色，不能是别的黑）
3. `.scroller` 用 `padding-top: var(--topbar-h, 64px)` 给顶栏让位
4. `index.html` 的 viewport **不要**带 `viewport-fit=cover`
5. `html/body` 背景 `#060907`（内容区最底端的颜色，键盘弹起时下方那条才接得上）

反面教材（都试过、都没用，或引出别的问题）：
- 把顶栏改成 `sticky` / `relative` 让它参与布局 → 磨砂回来
- 给顶栏加 `transform: translateY(offsetTop)` 补偿 → 越点越往下掉
- 删掉 `.statusbg` → 磨砂回来
- 加 `apple-mobile-web-app-status-bar-style` → 没效果

同时：**绝对不能给顶栏加任何 transform 位移补偿**（`visualViewport.offsetTop` 在键盘弹起时不可靠，会导致"标题栏被顶走/越点越往下"）。

## 键盘弹起

- 底栏用 `html.kb` 收起（`.tabbar` 和 `.fab`），避免被 iOS 顶到键盘上方浮动
- 点输入框后，把该栏滚到顶栏下方约 150px（`focusin` 里连续校正 7 次）
- 不要在键盘弹起时调用 `window.scrollTo(0,0)`，也不要用 `visualViewport.offsetTop` 去移动容器

## 沟通方式

用户不是工程师。改动时：

- 一次只动一处，改完告诉他**去哪儿看、看到什么算成功**
- 不要长篇讲原理；结果优先
- 涉及手机端操作（快捷指令、iCloud、token）要给出可照做的分步清单

## 发版后怎么汇报

每次发版，在对话里用这个格式告诉用户（不要长篇讲原理）：

```
已上线 vX.YZ（已确认线上版本）

| 改动 | 说明 |
|---|---|
| 做了什么 | 用户能感知到什么变化 |
| 修了什么 | 原来哪里不对、现在怎么样 |
```

并且同步在「关于与更新」里加一条对应版本的记录，文案要写**动作和效果**，不要只写提交摘要。

## 不可回退清单（每条都对应一个已验证通过的版本）

发版前必须跑 `node tools/guard-check.mjs`，有一项不过就不许发。

| # | 规则 | 锁定版本 | 为什么 |
|---|---|---|---|
| 1 | 顶部必须有 `.statusbg` 实色带，`position: fixed; z-index: 25` | v2.34 / v2.44 | 没有这层，iOS 主屏幕 App 的状态栏会出现磨砂；层级必须低于顶栏（30），否则会切掉按钮上沿 |
| 2 | `.topbar` 必须 `position: fixed`，背景 `#0d0f0e` | v2.39 | 改成 relative/sticky 会把磨砂和位移问题带回来 |
| 3 | **绝不给顶栏加 transform 位移补偿** | v2.25 / v2.46 | `visualViewport.offsetTop` 不可靠，会累积成"越点越往下" |
| 4 | `.sc-body` 不许 `backface-visibility: hidden` | v2.55 | 会变成独立合成层，滚动到底部漏画成纯黑 |
| 5 | 键盘态判定用「有输入框在编辑」（focusin 加类），**不要依赖 `visualViewport.height`** | v2.77 | 这台设备不把键盘高度报给网页，依赖它就等于什么都没做 |
| 6 | 卡片定位：按**绝对位置**算，用 `KB_RATIO`（默认 0.50，可 ▲▼ 微调，存 `localStorage.kb_ratio`） | v2.79 | 相对滚动会累积误差；固定比例加减一能一次调准 |
| 7 | 键盘态 `.sc-body` 底部预留 `120vh` | v2.77 | 预留不够时滚动会被上限卡住，卡片推不上去 |
| 8 | 目标缺口/盈余是硬指标（`hasDefOv`） | v2.15 | 用户设定的值不许被任何公式改动 |
| 9 | 键盘动画期间**不重复定位**，只在高度稳定后定位一次（`placeWhenSettled`） | v2.81 | 动画中反复重算 = 卡片上下跳两三遍 |
| 10 | 定位优先用 `vv.offsetTop + vv.height`（实测这台设备 vv 是准的：894 里键盘占 454），量不到才用 `KB_RATIO` 兜底 | v2.80 | 比例估算必然要么压键盘、要么太高 |
| 11 | 失焦后要等 **0.7s** 且确认无输入框才判定键盘收起 | v2.82 | 点同一个框会先失焦再聚焦，立即判定会让页面瞬短瞬长、卡片错位 |

## 教训（写给以后的自己）

- **不要靠猜。** 数值类问题（高度、间距、比例）先取中间值，再让用户在该界面上直接微调，调好的值持久化 —— 比反复改代码试快十倍。
- **每次只改一处，改完让用户验一次**，验过立刻写进上面的清单并加进自检脚本。
- 改之前先查已装技能：`mobile-web-viewport-pitfalls`（真机视口/键盘）、`systematic-debugging`、`dogfood`。
