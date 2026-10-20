/* 热量账本 —— 前端 */
'use strict';

/* ---------------- 工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const MEALS = [
  { k: 'breakfast', n: '早餐' },
  { k: 'lunch', n: '午餐' },
  { k: 'dinner', n: '晚餐' },
  { k: 'snack', n: '加餐' },
];
const MEAL_NAME = Object.fromEntries(MEALS.map(m => [m.k, m.n]));

const RELEASES = [
  { v: 'v2.92', d: '10-20', items: [
    '彻底不晃：手指一按下（键盘还没弹起）就先把位置算好、先滚到位，等键盘起来时它已经在正中间，系统不需要再滚一次',
    '后续只在偏差超过 14px 时才微调',
  ]},
  { v: 'v2.91', d: '10-20', items: [
    '修："上下晃一下"：系统先把输入框滚到键盘上方，我又把它滚到正中间，两次位移看起来就是晃一下',
    '改成平滑滚动（一次顺滑移动），并减少定位次数；位移小于 8px 时完全不动',
  ]},
  { v: 'v2.90', d: '10-20', items: [
    '修：点下去页面会上下弹一下 —— 键盘还没完全弹起时，我先按"整屏"算了一次位置，键盘弹起后又按"键盘上方"算了一次，所以会弹两下',
    '现在键盘没弹起之前一律不动，只在键盘真正占位后才定位',
  ]},
  { v: 'v2.89', d: '10-20', items: [
    '换思路：不再算"卡片该放哪"，只做一件事 —— 把正在编辑的那一栏放到可视区域的正中间（顶栏下沿到键盘上沿的中点）',
    '因为每次都算同一个绝对位置，所以点多少次都停在同一个地方，不会跳、不会错位',
  ]},
  { v: 'v2.88', d: '10-20', items: [
    '修：多次点击位置不稳定 —— 每次键盘动画的 timing 不同，导致算出的高度不同',
    '现在缓存第一次成功的键盘高度，后续点击直接复用，保证每次落点完全一致',
  ]},
  { v: 'v2.87', d: '10-20', items: [
    '修：多次点击位置不稳定 —— 之前根据键盘高度变化实时定位，但键盘动画每次 timing 不同，导致落点不一致',
    '现在统一等 500ms（键盘动画一定结束后）再定位，保证每次落点完全一致',
  ]},
  { v: 'v2.86', d: '10-20', items: [
    '修：关掉键盘再点，位置和第一次不一样 —— 之前只在"高度稳定"那一刻定位一次，如果键盘动画结束得晚，第二次就停在了中间值',
    '现在 1.6 秒内键盘高度每变一次就重新贴一次，最后一定停在同一个位置',
  ]},
  { v: 'v2.85', d: '10-20', items: [
    '加一份"定位日志"：每次定位都会记下 滚动前/目标/上限/滚动后/可视高度/键盘态，连点版本号 5 次可以看到最近 6 条',
    '不改任何行为，只加记录，用来一次看清第二次点击到底发生了什么',
  ]},
  { v: 'v2.84', d: '10-20', items: [
    '修：第二次点「脂肪」仍错位 —— 原因是代码里有"两套键盘态开关"互相打架（一套按聚焦、一套按系统高度），第二次点的时候被另一套误关掉',
    '现在只保留"按聚焦判断"这一套，彻底删掉另一套，二次点击也不会再被关',
  ]},
  { v: 'v2.83', d: '10-20', items: [
    '修：第二次点「脂肪」页面跳回顶部 —— 第二次点同一个框不会触发"聚焦"事件，我既没重新定位，底部预留也可能不在，位置就全乱了',
    '现在每次点输入框都会兜底重新定位，并且定位前强制确保键盘态样式已生效',
  ]},
  { v: 'v2.82', d: '10-20', items: [
    '修：第二次点「脂肪」卡片会错位 —— 点同一个框时 iOS 会先失焦再聚焦，我一瞬间把"键盘态"关掉了，页面猛地变短再变长，卡片就错位了',
    '现在失焦后要等 0.7 秒、且确认没有输入框在编辑，才判定键盘收起',
  ]},
  { v: 'v2.81', d: '10-20', items: [
    '修：点「脂肪」后卡片会上下跳两三遍才停 —— 之前是在键盘动画过程中反复重算位置，每算一次就跳一下',
    '现在等键盘高度连续两次采样一致（即动画结束）后，只定位一次，不再来回跳',
  ]},
  { v: 'v2.80', d: '10-20', items: [
    '卡片位置改用系统给的真实可视高度来算（实测这台设备的值是准的：894 里键盘占到 454），误差为 0；量不到时才用比例兜底',
    '去掉界面上的绿色调试读数和小调节条（值已经记住，不再需要）',
  ]},
  { v: 'v2.79', d: '10-20', items: [
    '卡片高度默认改到中间值（50%），并且加了一个小调节条：右上角 ▲▼ 每次 1%，你在键盘弹起的状态下自己调到刚好，调完自动记住',
    '这样以你这台设备为准，不用再靠我猜',
  ]},
  { v: 'v2.78', d: '10-20', items: [
    '只改一个数值：键盘预留从 60% 降到 45%，卡片整体下移，落在键盘正上方',
    '位置固定的逻辑保持不变（反复点同一栏/不同栏都停在同一个高度）',
  ]},
  { v: 'v2.77', d: '10-20', items: [
    '关键修正：这台设备从不告诉网页"键盘压小了可视区"，所以我之前那套键盘态（预留空间、定位）根本没生效，卡片自然一直被压',
    '现在改成"有输入框在编辑就当作键盘弹起"，底部预留空间也跟着生效（120% 屏高，够把卡片推到任意位置）',
  ]},
  { v: 'v2.76', d: '10-20', items: [
    '先把键盘预留量提高到屏幕高度的 60%，确保卡片绝不压到键盘；如果位置显得太靠上，再按步长往下调',
    '聚焦输入框时，屏幕左上角会显示一行小字（innerH / clientH / vvH），方便一次看出键盘到底占了多高',
  ]},
  { v: 'v2.75', d: '10-20', items: [
    '卡片位置固定：不论点哪一栏，卡片底边都停在"键盘上方固定的那个屏幕位置"，不再时高时低',
    '设备不报键盘高度，改成按屏幕高度的固定比例估算（预留 47%），所以不会再压到键盘',
  ]},
  { v: 'v2.74', d: '10-20', items: [
    '修：卡片反而更压在键盘上了 —— 这台设备上系统没有把"可视区域被键盘压小"这个值报给网页，我按错误的高度算，算出来的位置自然偏低',
    '现在：只有确实测到键盘压小了可视区域，我才自己定位；测不到就不动，交给 iOS 自己把输入框滚到键盘上方',
  ]},
  { v: 'v2.73', d: '10-20', items: [
    '修：点「脂肪」后卡片底部和键盘上方那条工具条重叠（保存按钮被压住）',
    '原因：计算位置时把工具条那块高度也算进了可用区域；现在可用区域的下边额外留出 88px，并且加了一道"卡片底边不许越过工具条"的兜底',
  ]},
  { v: 'v2.72', d: '10-20', items: [
    '点哪一栏，就把哪一栏放到可视区域的正中间（顶栏下沿到键盘上沿之间），不会再压到键盘、也不会跑到屏幕外',
    '键盘弹起时不再锁死：手指往下拨可以回看上面的内容；只有"继续往下滚到空白处"被挡住',
  ]},
  { v: 'v2.71', d: '10-20', items: [
    '全局背景恢复原来的强度（首页、趋势页不再过艳）；只有键盘弹起的那个界面把背景补亮，和你说"刚好的那个状态"一致',
    '反复点「脂肪」不再乱跳：弹出位置改成按"绝对位置"计算，点多少次都停在同一个高度',
  ]},
  { v: 'v2.70', d: '10-20', items: [
    '键盘弹起后背景（渐变和波点）调强：底色更绿、波点更明显、顶部光晕更亮',
    '键盘弹起时锁住手势滚动：卡片位置由程序放好，手指不再能拖动页面 —— 惯性弹跳彻底消失',
  ]},
  { v: 'v2.69', d: '10-20', items: [
    '修：点「脂肪」后背景变黑 —— 背景原本画在最外层，键盘弹起页面变长时那一层没跟上；现在改画在内容块上，整块都会被覆盖',
    '键盘期的底部留白从 60% 屏高降到 40%，惯性滑动不会被拖得太远、也不容易被弹回',
  ]},
  { v: 'v2.68', d: '10-20', items: [
    '修：v2.67 打开后加载不出来（改回弹逻辑时漏删了一行旧监听，导致脚本报错、页面空白）',
    '这一版恢复正常，回弹的处理沿用 v2.67 的做法',
  ]},
  { v: 'v2.67', d: '10-20', items: [
    '滑动到顶部或底部时不再"弹弹弹"：越界会被立刻拉回边界，直接停住，没有果冻回弹',
  ]},
  { v: 'v2.66', d: '10-20', items: [
    '背景恢复：上一版把渐变和波点画到画布层时，被后面一条样式整条覆盖掉了，所以看上去是纯黑。现在已去掉那条覆盖',
    '滑动"像弹簧一样弹弹弹"：键盘关掉后滚动限制没有解除，往下滑会被反复弹回。现在只要没有输入框在编辑，限制立刻解除',
  ]},
  { v: 'v2.65', d: '10-20', items: [
    '滑动卡顿的真正原因：背景（光晕+波点）原本每次都跟着画面重新合成，惯性滑动时每一帧都要重画整块背景',
    '现在背景画在"画布"上（整页只绘制一次），滑动时完全不重绘 —— 惯性滑动应该会明显顺滑',
  ]},
  { v: 'v2.64', d: '10-20', items: [
    '键盘上方那块黑：底部留白恢复到足够长，页面尽头始终在键盘下方；往下能不能滑由脚本卡住',
    '键盘弹起期间：只能往上滑回看内容，继续往下滑会被立刻挡回原处',
    '滑动的流畅度：去掉了滚动过程中反复执行的处理（之前滚动时每帧都在算键盘状态），只在键盘开关的那一刻处理一次',
    '卡片位置再往下，底边贴着键盘上沿',
  ]},
  { v: 'v2.63', d: '10-20', items: [
    '底色恢复成原来的配色（墨绿渐变 + 光晕 + 波点），并改由一层"固定背景"绘制：滑动时不再重绘背景，动画才顺',
    '弹窗位置再往下：卡片底边几乎贴着键盘上沿',
    '键盘弹起后只能往上滑、往下滑不动（底部留白按"刚好不能再往下"实时计算）',
    '去掉页面回弹的果冻感',
  ]},
  { v: 'v2.62', d: '10-20', items: [
    '弹出位置再往下：卡片底边几乎贴着键盘上沿',
    '键盘弹起后只能往上滑、往下滑不动 —— 底部留白由脚本算到"刚好不能再往下"，不会滑出键盘',
  ]},
  { v: 'v2.61', d: '10-20', items: [
    '键盘弹起后页面锁死：手指上下滑动不再有任何位移，卡片就停在弹出时的位置',
    '弹出的位置改成按"整张卡片的底边贴着键盘上方"来对齐，不再按单个输入框的高度算，卡片整体位置更靠下',
  ]},
  { v: 'v2.60', d: '10-20', items: [
    '键盘弹起时的多余留白从 70% 屏高降到 20%，不再能往下拉一大段空区域，滑动也更顺',
    '点「脂肪」等靠下的输入框时，只把这一栏移到键盘上方一点点（不再顶到屏幕中间）',
  ]},
  { v: 'v2.59', d: '10-20', items: [
    '键盘弹起时把页面底部自动加长（相当于往下多垫 70% 屏高），页面的"尽头"被甩到键盘下面，键盘上方看到的永远是内容',
  ]},
  { v: 'v2.58', d: '10-20', items: [
    '试一次结构性改动：整页改回浏览器原生滚动（不再用内层滚动容器），键盘与页面的关系完全交给系统处理',
    '顶栏、底栏仍是固定不动；如果这一版效果不好，可以随时退回 v2.57（已做备份）',
  ]},
  { v: 'v2.57', d: '10-20', items: [
    '真正的原因：背景图案原本画在"正在滚动的那一层"上，iOS 对这种层会漏画，漏掉的地方就是纯黑（滑动几下才补上）',
    '现在背景改由不滚动的外壳层绘制，滚动层完全透明 —— 结构上不会再出现没画到的地方；同时去掉了会触发该问题的旧属性',
  ]},
  { v: 'v2.56', d: '10-20', items: [
    '键盘弹起后主动触发一次重绘：iOS 会有一块区域没画上（纯黑，滑几下才消失），现在弹起后自动把这块补画',
    '滑动时右侧的滚动条彻底隐藏（之前只对部分容器生效，漏了主内容区）',
  ]},
  { v: 'v2.55', d: '10-20', items: [
    '找到最可能的真正原因：内容层被设成了独立合成层（backface-visibility: hidden），iOS 在滚动到最底部时，这一层的末端之外会渲染成纯黑',
    '去掉这个合成层设置，并撤掉上一版多加的那层底纹（就是你说的"两层波点"），红色诊断层也已移除',
  ]},
  { v: 'v2.54', d: '10-20', items: [
    '内容层自己也铺了一份波点底纹（之前只有内容区底层有），滚到最底部时露出的也是底纹',
    '红色诊断层保留，用来确认那块黑到底归谁',
  ]},
  { v: 'v2.53', d: '10-20', items: [
    '【临时诊断版】把网页最底层涂成红色，用来确认键盘上方那块黑到底是谁画的',
    '看完这张图就会改回来，不影响数据',
  ]},
  { v: 'v2.52', d: '10-20', items: [
    '键盘上方那块"黑"其实是内容区底色的最暗一段（越往下越接近黑，波点也淡到看不见），滚到空白处就显成一条黑带',
    '现在底色上下统一，不再往近黑过渡，波点也调明显一点',
  ]},
  { v: 'v2.51', d: '10-20', items: [
    '键盘上方那条纯黑：键盘弹起时页面的最外层（html）被压短，露出的正是它的纯色底；现在连这一层也铺了波点底纹，高度也锁定成不随键盘变化',
  ]},
  { v: 'v2.50', d: '10-20', items: [
    '外壳背景改成透明，直接把最底层的波点底纹透出来 —— 之前外壳是不透明的深色，任何一处露出都会是一条黑块',
  ]},
  { v: 'v2.49', d: '10-20', items: [
    '修：点「脂肪」后，键盘上方那条黑边越来越大 —— 键盘弹起时外壳高度被系统压短，露出一条没有底纹的纯色区',
    '外壳改用 100vh（键盘弹起时不变），并把同样的波点底纹铺到页面底层，即使有空隙也不会是一条黑边',
  ]},
  { v: 'v2.48', d: '10-20', items: [
    '底部导航再矮一点点',
    '点「脂肪」等靠下的输入框时，不再把它顶到最上面，往下留出一段（原来距顶 150px，现在 230px）',
    '去掉左右两侧的黑边：整个 App 铺满屏幕宽度，两侧直接是绿色波点底纹',
  ]},
  { v: 'v2.47', d: '10-20', items: [
    '底部中间的加号按钮再加大一点（76×50 → 84×55，加号字号 30 → 34）',
  ]},
  { v: 'v2.46', d: '10-20', items: [
    '底部导航再往上移一点（底部留白 34→42），整条栏也略高一点（上内边距 8→11）',
  ]},
  { v: 'v2.45', d: '10-20', items: [
    '顶栏三个按钮略微缩小（内边距和图标各收一点），不再显得过大',
    '底部导航整条往上移 10px（按钮大小不变），离屏幕最底更远一点',
  ]},
  { v: 'v2.44', d: '10-20', items: [
    '找到顶部遮挡的真正原因：那条"状态栏实色带"在安全区高度为 0 时仍然强制占 10px，浮在最上层，把顶栏按钮和标题的上沿各切掉一截',
    '现在这条带子的高度严格等于安全区高度（为 0 就不显示），不会再盖住任何东西',
  ]},
  { v: 'v2.43', d: '10-20', items: [
    '顶栏三个按钮加大（内边距和图标都放大），并固定住宽度，标题再长也不会把它们挤出屏幕',
    '底部：中间加号按钮放大，两侧图标放大；整条栏矮一点、往下移',
  ]},
  { v: 'v2.42', d: '10-20', items: [
    '顶栏底边加宽 5px，顶栏按钮与下方内容之间不再贴在一起',
    '底部导航的三个按钮整体上移 10px，离屏幕最底（home 指示条）更远、更好按',
  ]},
  { v: 'v2.41', d: '10-20', items: [
    '顶栏内容整体往上提了一点，离状态栏更近',
    '底部导航加高：去掉 viewport-fit 后系统不再给底部安全区高度，导致底栏被压得很矮、贴着屏幕最底，现在手动补回去',
  ]},
  { v: 'v2.40', d: '10-20', items: [
    '修：点最下面的「脂肪」时，键盘上方会露出一条黑边（键盘工具条占掉的高度没有被内容盖住）',
    '把页面底色改成内容区最底端的颜色，空出来的那一条与内容自然接上',
  ]},
  { v: 'v2.39', d: '10-20', items: [
    '把顶部/底部的结构完整退回"没有磨砂、上下栏不动"的那一版（顶栏固定 + 顶部实色带 + 内容区留白 + 底栏固定）',
    '只保留后来真正需要的修复：去掉了会累积的位移补偿、输入框滚动定位、键盘弹起收起底栏',
  ]},
  { v: 'v2.38', d: '10-20', items: [
    '排查用：连点标题旁边的版本号 5 次，会显示一行环境信息（版本、独立模式、可视高度、安全区、顶栏底色、滚动位置），再点一下关闭',
  ]},
  { v: 'v2.37', d: '10-20', items: [
    '顶部那条"雾带"：状态栏是纯黑、顶栏是深灰绿，两种颜色贴在一起看成了一条模糊带；现在顶栏改成和状态栏一样的纯黑',
    '点最下面的「脂肪」：改为连续校正 7 次（0~1.2 秒），键盘动画结束后也会把这一栏推到顶栏下方可见位置',
    '去掉了键盘弹起时强制把页面拉回顶部的那一行代码',
  ]},
  { v: 'v2.36', d: '10-20', items: [
    '顶部磨砂：页面不再延伸到状态栏下面（去掉 viewport-fit=cover），状态栏整块交给系统用不透明黑绘制，系统没有内容可模糊',
    '修：点最下面的「脂肪」时键盘把它挡住 —— 键盘每次改变可见高度，都会重新把当前输入框滚到可见位置',
  ]},
  { v: 'v2.35', d: '10-20', items: [
    '修：点最下面的「脂肪」时，页面会跳回最上面、脂肪这一栏被键盘挡住 —— 原因是键盘弹起时我按系统偏移把整页往下推了一次，这个偏移并不可靠',
    '现在只按「这一栏是否被键盘挡住」来滚动，挡到才往上推，绝不回滚',
    '顶部状态栏声明为不透明黑（系统不再在其上叠磨砂层）',
  ]},
  { v: 'v2.34', d: '10-20', items: [
    '恢复顶部实色带（之前就是靠它压掉 iOS 主屏幕 App 状态栏的磨砂/模糊），这次层级放在顶栏下面，只填状态栏那一条，不会遮按钮',
    '撤销上一版对状态栏声明和配色的改动，回到"没有模糊"时的样子',
  ]},
  { v: 'v2.33', d: '10-20', items: [
    '顶部模糊：状态栏声明改为不透明黑色，页面配色（theme-color / manifest / 顶栏）统一成同一个色值',
    '打开 App 时主动重绘一次顶栏，把系统启动时临时压上去的半透明底立刻清掉，不用再等它自己消失',
  ]},
  { v: 'v2.32', d: '10-20', items: [
    '去掉顶部那条独立的实色带：它浮在最上层，把顶栏按钮的上沿切掉了一块（这就是"遮挡"和那层模糊感的来源）',
    '状态栏区域改由顶栏自身背景铺满，从屏幕最顶一直到标题下沿是一整块实色',
  ]},
  { v: 'v2.31', d: '10-20', items: [
    '修：键盘上方那条黑色空带（外壳不再缩高度，而是整屏铺满、让键盘盖住下沿）',
    '点输入框时立刻把该栏拉到上方，iOS 不需要再自己推移整页，标题栏就不会被顶走',
    '顶部安全区实色带加高并提到最上层，尽量压掉系统状态的模糊',
  ]},
  { v: 'v2.30', d: '10-20', items: [
    '修：点「目标缺口」时标题栏整个消失 —— 键盘占掉下半屏后 iOS 把整页往上推，现在外壳高度实时跟随可见区域，不再被推',
    '顶部状态栏恢复纯色，不再出现模糊与内容透出',
  ]},
  { v: 'v2.29', d: '10-20', items: [
    '修：顶部状态栏出现模糊、左右两侧显示不整 —— iOS 聚焦输入框时会把整页放大（那个克数框字号只有 13.5px）',
    '现在所有输入框都不小于 16px，并禁用了页面缩放；顶栏、页面底色也补齐了全宽',
  ]},
  { v: 'v2.28', d: '10-20', items: [
    '上下两条栏改成 App 布局的一部分（不再是固定/吸顶定位），中间内容区独立滚动 —— 无论是滑动还是弹键盘，顶栏和底栏都不可能被带走',
    '键盘弹起时底栏自动收起，内容区自动扩展，不再被顶到键盘上方',
    '点输入框后标题栏消失的问题一并解决',
  ]},
  { v: 'v2.27', d: '10-20', items: [
    '键盘弹起时把底部导航和加号收起来：它们之前会被 iOS 顶到键盘上方浮起来',
    '顶栏继续吸顶钉住，键盘弹起、切换输入框都不移动',
  ]},
  { v: 'v2.26', d: '10-20', items: [
    '彻底改掉滚动方式：内容改回「整页原生滚动」，标题栏改成吸顶（sticky）',
    '之前是"内层容器滚动 + 固定顶栏"，iOS 一弹键盘就会把这套结构错位；现在是浏览器最标准的做法，键盘、光标、顶栏都由系统按常规处理',
  ]},
  { v: 'v2.24', d: '10-20', items: [
    '修：键盘弹起后顶栏仍会掉到屏幕中间（上半截内容露出来）',
    '原因是 iOS 会把 position:fixed 的 body 一起推走；现在 body 不再固定，并在键盘弹起时实时补偿顶栏位置',
  ]},
  { v: 'v2.25', d: '10-20', items: [
    '修：每点一个更靠下的输入框，顶栏就往下掉一点、与内容之间的缺口越来越大',
    '原因是我上一版加的位移补偿会叠在 iOS 自己的位移上，点得越深叠得越多；现在去掉补偿，只保留 body 不再固定这一项',
  ]},
  { v: 'v2.23', d: '10-20', items: [
    '修：点输入框时光标乱跳、滑动时整页乱跳、顶栏「热量账本」跑到屏幕中间',
    '内容区改成容器内原生滚动（页面本身仍然不能滚），iOS 能准确知道输入框在哪，键盘弹起只滚内容、不拖顶栏',
    '键盘弹起时自动把正在输入的框滚到上方可见处',
  ]},
  { v: 'v2.22', d: '10-20', items: [
    '缺口/盈余不合理时会给提示：填的时候实时显示，保存时也会弹一句，但绝不改你填的数',
    '判断标准：缺口不超过消耗的 25%（且 ≤500）、每日可吃不低于基础代谢；盈余建议 200–300',
  ]},
  { v: 'v2.21', d: '10-20', items: [
    '修：手动填的缺口（如 -300）在再点一次「保存」后会变回建议值 -275 —— 原因是拿「已生效的值」去和「建议值」比较，两者相等就当成没填',
    '现在拿「纯建议值」比较：填多少存多少，反复点保存都不会变',
  ]},
  { v: 'v2.20', d: '10-20', items: [
    '切模式不再弹窗确认，直接按建议值填好',
    '「营养目标」改名为「饮食目标」（现在包含减脂/维持/增肌三档，不只是营养）',
  ]},
  { v: 'v2.19', d: '10-20', items: [
    '切模式前会先确认：如果你已经手动定过缺口/盈余，弹窗告诉你「会被建议值覆盖」，可以取消',
    '确认之后才改，取消则什么都不动',
  ]},
  { v: 'v2.18', d: '10-20', items: [
    '切模式会同时给出建议的缺口/盈余：减脂 -300、维持 0、增肌 +250',
    '应用后你仍然可以自己改，之后只有你改它才变',
    '每日可吃的说明按缺口/盈余分别写成「− 缺口」「+ 盈余」，不再出现负数绕人',
  ]},
  { v: 'v2.17', d: '10-20', items: [
    '新增三档目标模式：减脂（蛋白 2.0 g/kg，脂肪 25%）/ 维持（1.6，28%）/ 增肌（1.8，25%）',
    '选好模式后，蛋白质、脂肪、碳水按你的体重和当天消耗自动配比，不用自己算',
    '模式只改配比，你设的缺口或盈余一分不动',
  ]},
  { v: 'v2.16', d: '10-20', items: [
    '「恢复建议」加了二次确认：避免误点把手动设置的目标缺口/营养值清掉',
  ]},
  { v: 'v2.15', d: '10-20', items: [
    '目标缺口/盈余改成硬指标：你填多少就是多少，消耗再变它也不动',
    '每日可吃始终 = 当天消耗 − 你填的缺口，不再套用任何下限修正',
  ]},
  { v: 'v2.14', d: '10-20', items: [
    '修：填了「目标缺口 -300」，隔一会儿却显示成 -378 —— 原因是同时存了旧的「每日可吃」，消耗一变两者就打架',
    '现在以「目标缺口/盈余」为准，每日可吃自动跟着算；同时保存时不再存多余的每日可吃',
  ]},
  { v: 'v2.13', d: '10-20', items: [
    '去掉「整盘菜、外卖盒」「可选，更准」两行小字，腾出的空间给照片框',
    '照片框改为略高的竖版（1:1.12），看食物更清楚',
  ]},
  { v: 'v2.12', d: '10-20', items: [
    '「识别热量」按钮加粗加高（高度 44 → 56px，字号 14 → 16），更好按',
  ]},
  { v: 'v2.11', d: '10-20', items: [
    '快捷指令采集后不用再手动点「数据同步」：回到 App 会自动拉，且没新数据会静默重试',
    'health.json 改从 raw.githubusercontent 取（提交后几秒可见），不再等 GitHub Pages 那 30–60 秒的发布',
    '取不到时自动回落到 Pages 上的副本，不影响离线可用',
  ]},
  { v: 'v2.10', d: '10-20', items: [
    '「补充说明」的提示语精简成「补充说明（可选）」，去掉后面的举例，和上面两栏统一',
  ]},
  { v: 'v2.09', d: '10-20', items: [
    '「克数（可选）」的字被截断了，加宽右侧输入框并缩小字号，提示完整显示',
  ]},
  { v: 'v2.08', d: '10-20', items: [
    '「食材」和「克数」两栏都标成（可选）：不填就纯靠 AI 看照片识别',
    '填了的话，AI 会结合你写的食材名和克重一起算，更适合分不清品种的情况',
  ]},
  { v: 'v2.07', d: '10-20', items: [
    '拍照新增「这是什么」输入框：识别不准（比如黄心猕猴桃 vs 绿心）可以自己填，AI 按你写的品种估算',
    '克数输入框挪到它右边，一行两个，不多占高度',
    '卡片最大高度放宽到 88%，加字段后「识别热量」按钮仍不用下滑',
  ]},
  { v: 'v2.04', d: '10-20', items: [
    '更新记录改成「日期 · 版本号」且每条与实际发版号对齐',
  ]},
  { v: 'v2.03', d: '10-20', items: [
    '更新记录里每条版本号与实际发版号一一对齐',
  ]},
  { v: 'v2.02', d: '10-20', items: [
    '修：更新记录顶部那条版本号漏了字母 v',
  ]},
  { v: 'v2.01', d: '10-20', items: [
    '更新记录标题改成「日期 · 版本号」：日期在前、版本号在后',
  ]},
  { v: 'v2.00', d: '10-20', items: [
    '更新记录改成「这一版做了什么、修了什么」，不再只写提交摘要',
    '每条都写清楚动作和效果，一眼能看懂',
  ]},
  { v: 'v1.99', d: '10-20', items: [
    '更新记录改成逐版本对应：一个版本一条，不再按日期堆在一起',
  ]},
  { v: 'v1.97', d: '10-20', items: [
    '补全 10-20 当天的更新记录（之前只写到 10-19）',
    '项目约定里加了一条：每次发版必须同步更新这份记录',
  ]},
  { v: 'v1.96', d: '10-20', items: [
    '修：过夜后日期不跳（一直显示前一天）——现在打开、切页、停留都会自动校准',
  ]},
  { v: 'v1.95', d: '10-20', items: [
    '新增跨天自动切换：昨晚没关 App，第二天打开会自动切到今天',
  ]},
  { v: 'v1.94', d: '10-20', items: [
    '修：关于页的更新记录卡片滑不动（手势被外层滚动抢走）',
  ]},
  { v: 'v1.93', d: '10-20', items: [
    '去掉关于页里临时加的调试信息卡片',
    '算法说明里的「目标缺口」改成新口径：优先用你填的值',
  ]},
  { v: 'v1.91', d: '10-20', items: [
    '圆环下方小字按目标正负显示：目标缺口 / 目标盈余 / 维持体重',
  ]},
  { v: 'v1.90', d: '10-20', items: [
    '目标缺口可以自己填并固定：负数=缺口，正数=盈余',
    '不再随当天消耗自动变化，也不会被 22% 封顶改掉',
    '改动它时「每日可吃」会同步联动',
  ]},
  { v: 'v1.89', d: '10-20', items: [
    '照片右上角的删除按钮改用图形叉，尺寸加大并真正居中',
  ]},
  { v: 'v1.88', d: '10-20', items: [
    '删除按钮移到照片右上角 6px，贴住圆角，不再显得突兀',
  ]},
  { v: 'v1.87', d: '10-20', items: [
    '新增拍照草稿：误关卡片或退出 App，照片仍保留 24 小时',
    '只有点 × 或记入成功后才会清空',
  ]},
  { v: 'v1.86', d: '10-20', items: [
    '修：备份到 iCloud 会多出一份纯文本文件，现在只存 json',
  ]},
  { v: 'v1.85', d: '10-20', items: [
    '删除某一餐的全部记录时，连同它的照片一起清理，云端不会留空壳',
  ]},
  { v: 'v1.84', d: '10-20', items: [
    'AI 识别页可查看已保存的 Key，方便换手机前抄下来',
  ]},
  { v: 'v1.83', d: '10-20', items: [
    '修：云端同步报 409 —— 数据里含密钥被 GitHub 拦截，现在上传前剔除',
  ]},
  { v: 'v1.81', d: '10-20', items: [
    '「关闭同步」移入卡片标题栏，不再挤在按钮那一排',
    '同步失败的提示改成显示 GitHub 原文，便于定位',
  ]},
  { v: 'v1.80', d: '10-20', items: [
    '修：营养目标页「保存」按钮点了没反应',
    '数据备份页新增「关闭云端同步」',
  ]},
  { v: 'v1.79', d: '10-20', items: [
    '修：云端同步失败会每 4 秒重试一次，把 App 拖慢；现在失败后等 30 秒',
  ]},
  { v: 'v1.78', d: '10-20', items: [
    '同步按钮加了「上传中」状态和成功/失败提示，不再没反应',
    '失败原因写清楚：401 权限、网络超时、409 冲突等',
  ]},
  { v: 'v1.76', d: '10-20', items: [
    '新增 GitHub 云端自动同步：每次记账后自动传 data.json',
    '换手机或重装后，填一次 token 就能把记录和照片全部恢复',
  ]},
  { v: 'v1.75', d: '10-20', items: [
    '底部导航上沿抬高 6px，三个按钮位置不变',
  ]},
  { v: 'v1.68 – 1.74', d: '10-20', items: [
    '背景光晕改为跟随个性化主题色（绿/蓝/橙），点阵纹理上线',
    '圆环轨道改实心固定色，进度条改渐变并随比例平滑变色（绿→橙→红）',
    '分界线反复调整：实线 → 渐隐 → 半像素发丝线',
  ]},
  { v: 'v1.50 – 1.67', d: '10-20', items: [
    '顶栏改绝对固定：先 fixed、再内部滚动、最后改成手写滚动，彻底不跟着动',
    '顶部与状态栏配色统一，消除色差缝',
  ]},
  { v: 'v1.23 – 1.49', d: '10-20', items: [
    '拍照区重做：合并成一个框、两个位置、左右并排、正方形预览',
    '关于页两张卡铺满屏幕，只有上面那张内部滚动',
    '多轮排查 iOS 下拉回弹把顶栏拖着走的问题',
  ]},
  { v: '10-19', d: '10-19', items: [
    '同步方式改为「快捷指令 → GitHub → App」，手机出门也能用',
    '拍照支持营养成分表，按克数精确换算；零卡饮料不再被丢弃',
    '多项识别自动归组成一条；列表左侧显示照片缩略图',
    '修：性别默认「女」导致基础代谢差 166 千卡',
  ]},
  { v: '10-18', d: '10-18', items: [
    '从本地 Python 服务改为纯前端 PWA（GitHub Pages），数据存本地',
    '118 条食物库、拍照/文字识别、趋势页、CSV/JSON 备份',
  ]},
];


// 版本号只在这里写一次，设置页和关于页都读它
const APP_VERSION = 'v2.92';
let groupMap = new Map();
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() { return isoOf(new Date()); }
function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function round(n) { return Math.round(Number(n) || 0); }

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------------- 状态 ---------------- */
const SYNC_SHORTCUT = '热量采集';
let pendingSync = false;

const S = {
  date: todayISO(),
  today: todayISO(),
  day: null,
  foods: [],
  view: 'today',
  trendDays: 30,
  trend: null,
  addMode: 'photo',
  photoData: null,
  photoAt: null,
  photoURL: null,
  batchName: null,
  photo2Data: null,
  photo2URL: null,
  openGroups: new Set(),
  items: [],
  meal: 'lunch',
};

function defaultMeal() {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/* ---------------- 加载 ---------------- */
async function loadDay() {
  try {
    const d = await api('/api/bootstrap?date=' + S.date);
    S.day = d;
    S.foods = d.foods || [];
    renderToday();
  } catch (e) {
    toast('加载失败：' + e.message, 4000);
  }
}

/* ---------------- 渲染：今日 ---------------- */
function renderToday() {
  const d = S.day;
  if (!d) return;
  // 用实时时钟兜底：如果看的是"今天"但日期已经翻篇，直接切过去
  const nowDay = todayISO();
  if (S.date === S.today && nowDay !== S.today) {
    S.today = nowDay;
    S.date = nowDay;
    loadDay();
    return;
  }

  const dt = parseISO(d.date);
  $('#dateLabel').textContent = `${dt.getMonth() + 1}月${dt.getDate()}日`;
  const isToday = d.date === S.today;
  $('#dateSub').textContent = isToday ? '今天 · 实时' : WEEK[dt.getDay()];
  $('#nextDay').disabled = isToday;
  $('#nextDay').style.opacity = isToday ? 0.45 : 1;

  const t = d.targets;
  const intake = d.intake;
  const expFull = d.expenditure;          // 全天预估/实际
  const balFull = d.balance;

  // 今天只算“到现在为止”的消耗，历史日期用全天值
  let dayFrac = 1;
  if (d.date === S.today) {
    const start = new Date(d.date + 'T00:00:00').getTime();
    dayFrac = Math.min(1, Math.max(0, (Date.now() - start) / 86400000));
  }
  // 今天：基础代谢按时间折算，手表的活动能量是“到现在为止”的，全额计入
  const det = d.expenditure_detail || {};
  let exp;
  if (d.date === S.today) {
    if (det.active && det.resting) exp = Math.round(det.resting * dayFrac) + det.active;
    else if (det.total) exp = Math.round(det.total * dayFrac);
    else exp = Math.round(expFull * dayFrac);
  } else {
    exp = expFull;
  }
  const bal = d.date === S.today ? exp - intake : balFull;
  const left = t.kcal_budget - intake;

  // 首次使用提示
  const sb = $('#setupBanner');
  if (d.needs_setup) {
    sb.innerHTML = `<button class="setup-tip" id="goSetup">
      <span>先填身高体重，消耗才算得准</span><b>去填 →</b></button>`;
    $('#goSetup').onclick = () => switchView('me');
  } else {
    sb.innerHTML = '';
  }

  // 主环
  const pct = t.kcal_budget > 0 ? intake / t.kcal_budget : 0;
  const ring = $('#ring');
  const C = 527.8;
  ring.style.strokeDashoffset = String(C * (1 - Math.min(pct, 1)));

  // 颜色语言：绿=还有余量、橙=接近上限、红=已经吃超（盈余）
  // 颜色随进度平滑过渡：绿 → 橙 → 红
  const mix = (a, b, t) => {
    const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  let c0, c1, c2;
  if (pct <= 0.8) {
    c0 = '#d6ff4b'; c1 = '#57ffc8'; c2 = '#d6ff4b';
  } else if (pct <= 1) {
    const t = (pct - 0.8) / 0.2;
    c0 = mix('#d6ff4b', '#ffc44b', t);
    c1 = mix('#57ffc8', '#ff9a3d', t);
    c2 = mix('#d6ff4b', '#ff7a3d', t);
  } else {
    const t = Math.min(1, (pct - 1) / 0.15);
    c0 = mix('#ffc44b', '#ff6b6b', t);
    c1 = mix('#ff9a3d', '#ff2e88', t);
    c2 = mix('#ff7a3d', '#ff5d5d', t);
  }
  $('#ringS0').setAttribute('stop-color', c0);
  $('#ringS1').setAttribute('stop-color', c1);
  $('#ringS2').setAttribute('stop-color', c2);


  const hero = $('#hero');
  hero.classList.remove('surplus', 'over');

  const goalDef = Math.round(t.deficit);   // 正=缺口，负=盈余
  let sub = goalDef > 0 ? `目标缺口 ${goalDef}` : (goalDef < 0 ? `目标盈余 ${-goalDef}` : '维持体重');
  if (bal < 0) {
    hero.classList.add('surplus');
    $('#heroLbl').textContent = '热量盈余';
    $('#heroNum').textContent = Math.abs(bal);
  } else {
    $('#heroLbl').textContent = '热量缺口';
    $('#heroNum').textContent = bal;
  }
  $('#heroSub').textContent = sub;

  $('#stIntake').innerHTML = intake + ' <small>kcal</small>';
  $('#stExp').innerHTML = exp + ' <small>kcal</small>';
  const leftEl = $('#stLeft');
  const at = (d.watch && d.watch.source === 'cloud' && d.watch.cloudAt) ? String(d.watch.cloudAt).slice(11) : '';
  $('#stExpAt').textContent = at ? '同步时间 ' + at : '';
  leftEl.innerHTML = (left >= 0 ? left : left) + ' <small>kcal</small>';
  leftEl.style.color = left < 0 ? 'var(--orange)' : '';

  // 营养素
  const pr = d.protein, cb = d.carb, ft = d.fat;
  $('#pNow').textContent = Math.round(pr);
  $('#pGoal').textContent = t.protein_g;
  $('#cNow').textContent = Math.round(cb);
  $('#cGoal').textContent = t.carb_g;
  $('#fNow').textContent = Math.round(ft);
  $('#fGoal').textContent = t.fat_g;
  const w = (v, g) => Math.min(100, g > 0 ? (v / g) * 100 : 0) + '%';
  $('#pBar').style.width = w(pr, t.protein_g);
  $('#cBar').style.width = w(cb, t.carb_g);
  $('#fBar').style.width = w(ft, t.fat_g);

  renderMeals();
}

function renderMeals() {
  const d = S.day;
  const box = $('#meals');
  const shots = d.shots || {};
  const thumbOf = l => (l.batch && shots[l.batch]) ? `<img class="mthumb" src="${shots[l.batch]}" alt="">` : '';
  const itemRow = l => `
      <div class="mitem" data-item="${l.id}">
        ${thumbOf(l)}
        <div class="n">${esc(l.name)}
          <span class="sub">${l.grams ? Math.round(l.grams) + 'g' : ''}${
            l.p ? ' · 蛋' + Math.round(l.p) + '/碳' + Math.round(l.c) + '/脂' + Math.round(l.f) : ''}</span>
        </div>
        <div class="k">${Math.round(l.kcal)}${l.source === 'photo' || l.source === 'ai' ? ' <span class="ai">AI</span>' : ''}</div>
        <span class="chev">›</span>
        <button class="del" data-del="${l.id}">×</button>
      </div>`;

  // 同一次识别出来的多条，收成一行（例如「沙县小吃」→ 展开是青菜/鸡腿/米饭）
  // 老数据没有 batch 标记，就按「同一餐 + 同一秒」归堆
  const groupsById = new Map();
  const groupRows = items => {
    const groups = [];
    const seen = new Map();
    items.forEach(l => {
      const key = l.batch || ('L' + (l.meal || '') + '|' + (l.ts || ''));
      if (!seen.has(key)) {
        const g = { key, name: l.batchName || '', logs: [] };
        seen.set(key, g);
        groups.push(g);
        groupsById.set(key, g);
      }
      seen.get(key).logs.push(l);
    });
    return groups.map(g => {
      if (g.logs.length < 2) return itemRow(g.logs[0]);
      const open = S.openGroups.has(g.key);
      const kcal = Math.round(g.logs.reduce((a, b) => a + (b.kcal || 0), 0));
      const p = g.logs.reduce((a, b) => a + (b.p || 0), 0);
      const c = g.logs.reduce((a, b) => a + (b.c || 0), 0);
      const f = g.logs.reduce((a, b) => a + (b.f || 0), 0);
      return `
      <div class="mitem ghead" data-group="${esc(g.key)}">
        ${thumbOf(g.logs[0])}
        <div class="n">${esc(g.name || '未命名')}
          <span class="sub">${g.logs.length} 项 · 蛋${Math.round(p)}/碳${Math.round(c)}/脂${Math.round(f)}</span>
        </div>
        <div class="k">${kcal}</div>
        <span class="chev">›</span>
      </div>`;
    }).join('');
  };

  box.innerHTML = MEALS.map(m => {
    const items = d.logs.filter(l => (l.meal || 'other') === m.k);
    const kcal = items.reduce((a, b) => a + (b.kcal || 0), 0);
    const rows = groupRows(items);
    return `
      <div class="meal ${items.length ? 'has' : ''}">
        <div class="hd">
          <span class="dot"></span>
          <span class="nm">${m.n}</span>
          <span class="kc">${items.length ? Math.round(kcal) + ' 千卡' : ''}</span>
          <button class="add" data-add="${m.k}">＋</button>
        </div>
        ${items.length ? `<div class="items">${rows}</div>`
                       : `<div class="empty">还没记录</div>`}
      </div>`;
  }).join('');

  groupMap = groupsById;
  $$('[data-group]', box).forEach(b => b.onclick = () => openGroup(b.dataset.group));
  $$('[data-item]', box).forEach(b => b.onclick = ev => {
    if (ev.target.closest('[data-del]')) return;
    openDetail([d.logs.find(l => String(l.id) === b.dataset.item)].filter(Boolean), false);
  });

  $$('[data-del]', box).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      await api('/api/logs/' + b.dataset.del, null, 'DELETE');
      await loadDay();
      if (S.view === 'trends') loadTrends();
    } catch (e) { toast(e.message); }
  });

  $$('[data-add]', box).forEach(b => b.onclick = () => {
    openAdd(b.dataset.add);
  });
}

/* ---------------- 记录弹层 ---------------- */
function openAdd(meal) {
  S.items = [];
  S.meal = meal || defaultMeal();
  S.batchName = null;
  $('#batchName').value = '';
  resetPhotoUI();
  restoreDraft();
  $('#photoHint').value = '';
  $('#resultArea').hidden = true;
  $('#addFoot').hidden = true;
  $('#searchInput').value = '';
  $('#textInput').value = '';
  $('#searchList').innerHTML = '';
  $('#addTabs').hidden = false;
  $('#searchInput').value = '';
  setAddMode('photo');
  renderMealPick();
  renderRecent();

  $('#addMask').classList.add('on');
  $('#addSheet').classList.add('on');
}
function closeAdd() {
  $('#addMask').classList.remove('on');
  $('#addSheet').classList.remove('on');
}

function setAddMode(m) {
  S.addMode = m;
  $$('#addTabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  ['photo', 'search', 'text'].forEach(k => {
    $('#pane-' + k).hidden = k !== m;
  });
  if (m === 'search') runSearch($('#searchInput').value || '');
}

function renderMealPick() {
  $$('#mealPick .chip').forEach(c => c.classList.toggle('on', c.dataset.meal === S.meal));
}

function renderRecent() {
  const box = $('#recentChips');
  const seen = [];
  (S.day?.logs || []).forEach(l => {
    if (!seen.includes(l.name)) seen.push(l.name);
  });
  const picks = seen.slice(0, 6);
  if (picks.length < 4) {
    ['鸡蛋', '米饭', '牛奶(全脂)', '鸡胸肉(生)', '香蕉'].forEach(n => {
      if (!picks.includes(n)) picks.push(n);
    });
  }
  box.innerHTML = picks.slice(0, 7).map(n =>
    `<button class="chip" data-quick="${esc(n)}">${esc(n)}</button>`).join('');
  $$('[data-quick]', box).forEach(b => b.onclick = () => {
    const f = S.foods.find(x => x.name === b.dataset.quick);
    if (f) pushFood(f);
  });
}

/* ---- 拍照 ---- */
async function compress(file, max = 1280, q = 0.82) {
  const bmp = await new Promise((res, rej) => {
    if (window.createImageBitmap) {
      createImageBitmap(file).then(res).catch(rej);
    } else {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    }
  });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function handlePhoto(file) {
  if (!file) return;
  try {
    if (S.photoURL) URL.revokeObjectURL(S.photoURL);
    S.photoURL = URL.createObjectURL(file);
    $('#photoPreview').src = S.photoURL;
    $('#photoPreview').hidden = false;
    $('#photoDel').hidden = false;
    $('#emptyA').hidden = true;
    S.photoData = await compress(file);
    S.photoAt = Date.now();
    $('#photoActions').hidden = false;
    saveDraft();
  } catch (e) {
    toast('图片读取失败');
  }
}

/* 一组按钮：先填 ① 食物照片，再填 ② 营养成分表 */
async function handlePick(file) {
  if (!file) return;
  if (!S.photoData) return handlePhoto(file);
  if (!S.photo2Data) return handlePhoto2(file);
  toast('两张都拍好了。点照片上的 × 可以换一张', 3000);
}

async function handlePhoto2(file) {
  if (!file) return;
  try {
    if (S.photo2URL) URL.revokeObjectURL(S.photo2URL);
    S.photo2URL = URL.createObjectURL(file);
    $('#pv2').src = S.photo2URL;
    $('#pv2').hidden = false;
    $('#del2').hidden = false;
    $('#emptyB').hidden = true;
    S.photo2Data = await compress(file, 1024, 0.8);
    saveDraft();
  } catch (e) {
    toast('图片读取失败');
  }
}

/* ---------------- 拍照草稿：关掉卡片 / 退出 App 也不丢 ---------------- */
const DRAFT_KEY = 'calorie-ledger-draft';
function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.at || Date.now() - d.at > 24 * 3600e3) { localStorage.removeItem(DRAFT_KEY); return null; }
    return d;
  } catch (e) { return null; }
}
function saveDraft() {
  const d = { photo: S.photoData || null, photo2: S.photo2Data || null, at: Date.now() };
  try {
    if (!d.photo && !d.photo2) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch (e) { /* 存不下就算了 */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}
/* 把草稿里的照片放回界面 */
function restoreDraft() {
  const d = readDraft();
  if (!d) return;
  if (d.photo) {
    S.photoData = d.photo;
    $('#photoPreview').src = d.photo;
    $('#photoPreview').hidden = false;
    $('#photoDel').hidden = false;
    $('#emptyA').hidden = true;
  }
  if (d.photo2) {
    S.photo2Data = d.photo2;
    $('#pv2').src = d.photo2;
    $('#pv2').hidden = false;
    $('#del2').hidden = false;
    $('#emptyB').hidden = true;
  }
  if (d.photo || d.photo2) $('#photoActions').hidden = false;
}

/* 把拍照区恢复成「还没选图」的样子 */
function resetPhotoUI() {
  if (S.photoURL) { URL.revokeObjectURL(S.photoURL); S.photoURL = null; }
  const pv = $('#photoPreview');
  pv.removeAttribute('src');
  pv.hidden = true;
  $('#photoDel').hidden = true;
  $('#emptyA').hidden = false;
  S.photoData = null;
  S.photoAt = null;
  $('#photoDrop').hidden = false;
  $('#pane-photo').classList.remove('done');
  $('#photoActions').hidden = true;
  if (S.photo2URL) { URL.revokeObjectURL(S.photo2URL); S.photo2URL = null; }
  S.photo2Data = null;
  $('#pv2').removeAttribute('src');
  $('#pv2').hidden = true;
  $('#del2').hidden = true;
  $('#emptyB').hidden = false;
}

async function runPhoto() {
  const main = S.photoData || S.photo2Data;
  if (!main) return toast('先拍一张照片');
  const btn = $('#photoGo');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 识别中…';
  try {
    const grams = Number(($('#photoGrams') || {}).value) || 0;
    const dishName = (($('#photoName') || {}).value || '').trim();
    let hint = $('#photoHint').value.trim();
    if (dishName) hint = '用户说这是：' + dishName + '（请按这个食材估算，不要换品种）' + (hint ? '；' + hint : '');
    let modeHint;
    if (S.photoData && S.photo2Data) {
      modeHint = '第一张图是实际吃的食物本体，第二张图是包装上的营养成分表。'
        + '请按第二张的标签读每 100 克的能量/蛋白质/碳水/脂肪（不要用外观估算这几项），'
        + '再按第一张估算实际吃掉了多少克；两两相乘得到总量。';
    } else if (S.photoData) {
      modeHint = '这张图是食物本体：按外观和常见餐具尺寸估算实际吃掉的重量。';
    } else {
      modeHint = '这张图是包装上的营养成分表：每 100 克数值只按标签读数；name 用产品名。';
    }
    hint = hint ? modeHint + '；' + hint : modeHint;
    if (grams > 0) hint = hint + `；我实际吃了 ${grams} 克`;
    // 有食物图就用它当主图；只拍了成分表就反过来
    const hasFood = !!S.photoData;
    const r = await api('/api/ai/food', {
      image: hasFood ? S.photoData : S.photo2Data,
      image2: hasFood ? (S.photo2Data || null) : null,
      hint,
    });
    S.items = r.items.map(x => ({ ...x, _src: 'photo' }));
    // 填了克数就以它为准（包装营养表通常只有一条）
    if (grams > 0 && S.items.length === 1) S.items[0].grams = grams;
    // 识别完就把大图收起，结果区（左小图 + 右数值）直接露出来
    $('#photoDrop').hidden = true;
    $('#photoActions').hidden = true;
    $('#pane-photo').classList.add('done');
    S.batchName = r.dish || '';
    $('#batchName').value = S.batchName;
    showResult(r.dish ? '识别：' + r.dish : '识别结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* 存一张小图（约 10~20KB），之后点开这一组还能看到当时拍的 */
async function makeThumb(dataUrl, max = 320, q = 0.55) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/* ---- 文字 ---- */
async function runText() {
  const text = $('#textInput').value.trim();
  if (!text) return toast('先描述一下吃了什么');
  const btn = $('#textGo');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 估算中…';
  try {
    const r = await api('/api/ai/text', { text });
    S.items = r.items.map(x => ({ ...x, _src: 'ai' }));
    S.batchName = r.dish || '';
    $('#batchName').value = S.batchName;
    showResult(r.dish ? '估算：' + r.dish : '估算结果', r.note);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* ---- 搜索 ---- */

/* 从历史记录里整理出「以前记过」的食物（按最近一次记录换算每100g） */
function historyFoods() {
  const logs = Store.load().logs || [];
  const map = new Map();
  logs.forEach(l => {
    const g = Number(l.grams) || 0;
    if (!g || !l.name) return;
    map.set(l.name, {
      name: l.name,
      kcal: Math.round((Number(l.kcal) || 0) * 100 / g),
      p: +(((Number(l.p) || 0) * 100) / g).toFixed(1),
      c: +(((Number(l.c) || 0) * 100) / g).toFixed(1),
      f: +(((Number(l.f) || 0) * 100) / g).toFixed(1),
      grams: g,
      cat: '以前记过',
    });
  });
  return [...map.values()];
}

function runSearch(q) {
  const box = $('#searchList');
  const key = q.trim().toLowerCase();
  const hist = historyFoods();

  let list;
  if (!key) {
    list = hist.slice().reverse().slice(0, 12).map(f => ({ f, h: true }));
  } else {
    const h = hist.filter(f => f.name.toLowerCase().includes(key)).map(f => ({ f, h: true }));
    const db = S.foods
      .filter(f => f.name.toLowerCase().includes(key) ||
        (f.alias || []).some(a => a.toLowerCase().includes(key)))
      .filter(f => !h.some(x => x.f.name === f.name))
      .slice(0, 20)
      .map(f => ({ f, h: false }));
    list = h.concat(db);
  }

  if (!list.length) {
    box.innerHTML = key
      ? `<div class="empty-state">库里没有「${esc(q)}」<br>试试换个说法，或用「描述」让 AI 估</div>`
      : '';
    return;
  }

  box.innerHTML = list.map((x, i) => `
    <div class="sitem" data-i="${i}">
      <div>
        <div>${esc(x.f.name)}${x.h ? ' <span style="font-size:9px;color:var(--lime)">记过</span>' : ''}</div>
        <div class="cat">${esc(x.f.cat || '')} · 蛋白 ${x.f.p}g / 碳水 ${x.f.c}g / 脂肪 ${x.f.f}g</div>
      </div>
      <div class="kc">${x.f.kcal}<br><span style="font-size:9px">/100g</span></div>
    </div>`).join('');

  $$('.sitem', box).forEach(el => el.onclick = () => {
    pushFood(list[Number(el.dataset.i)].f);
    $('#searchInput').value = '';
    box.innerHTML = '';
    $('#searchInput').blur();
  });
}

function pushFood(f) {
  const def = Number(f.grams) || (f.units && f.units[0] ? f.units[0].g : 100);
  S.items.push({
    name: f.name,
    grams: def,
    kcal_per_100g: f.kcal,
    protein_per_100g: f.p,
    carb_per_100g: f.c,
    fat_per_100g: f.f,
    confidence: 1,
    _src: 'db',
    _units: f.units || [],
  });
  showResult('已添加', '');
}

/* ---- 结果编辑 ---- */
function showResult(title, note) {
  $('#resultArea').hidden = S.items.length === 0;
  $('#resultTitle').textContent = title || '识别结果';
  $('#resultNote').textContent = note || '';
  $('#addFoot').hidden = S.items.length === 0;
  renderResult();
  requestAnimationFrame(() => {
    const ra = $('#resultArea');
    if (!ra.hidden) ra.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function renderResult() {
  const box = $('#resultItems');
  let shot = '';
  if (S.photoData) {
    const t = new Date(S.photoAt || Date.now());
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    shot = `<div class="shotrow">
      <img src="${S.photoData}" alt="">
      <div class="sinfo">
        <b>${hh}:${mm} 拍摄</b>
        <span>识别出 ${S.items.length} 项 · 克数可改</span>
      </div>
    </div>`;
  }
  $('#shotBox').innerHTML = shot;
  // 多项才需要给这一餐起名（识别到的菜名会自动填进来）
  $('#nameWrap').hidden = S.items.length < 2;
  box.innerHTML = S.items.map((it, i) => {
    const kcal = it.kcal_per_100g * it.grams / 100;
    const units = (it._units || []).filter(u => u.g !== 100).slice(0, 3);
    const chips = units.map(u =>
      `<button data-u="${i}" data-g="${u.g}">${u.unit}</button>`).join('');
    const low = it.confidence != null && it.confidence < 0.55;
    return `
      <div class="ritem" data-low="${low ? 1 : 0}">
        <div class="top">
          <span class="nm">${esc(it.name)}</span>
          <span class="kc">${Math.round(kcal)}</span>
          <button class="del" data-rm="${i}" style="color:var(--muted2);font-size:16px;padding:0 0 0 6px">×</button>
        </div>
        <div class="meta">每 100g ${Math.round(it.kcal_per_100g)} 千卡 · 蛋 ${it.protein_per_100g}/碳 ${it.carb_per_100g}/脂 ${it.fat_per_100g}${low ? ' · 不太确定' : ''}</div>
        <div class="gr">
          <input type="number" inputmode="decimal" value="${it.grams}" data-g="${i}">
          <span class="u">克</span>
          <div class="chips">${chips}</div>
        </div>
      </div>`;
  }).join('');

  const total = S.items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0);
  $('#resultTotal').textContent = Math.round(total);
  $('#addFoot').hidden = S.items.length === 0;
  $('#resultArea').hidden = S.items.length === 0;

  $$('[data-rm]', box).forEach(b => b.onclick = () => {
    S.items.splice(Number(b.dataset.rm), 1);
    renderResult();
  });
  $$('[data-u]', box).forEach(b => b.onclick = () => {
    S.items[Number(b.dataset.u)].grams = Number(b.dataset.g);
    renderResult();
  });
  $$('input[data-g]', box).forEach(inp => {
    inp.oninput = () => {
      S.items[Number(inp.dataset.g)].grams = Number(inp.value) || 0;
      const kc = S.items[Number(inp.dataset.g)];
      const el = inp.closest('.ritem').querySelector('.kc');
      el.textContent = Math.round(kc.kcal_per_100g * kc.grams / 100);
      const total = S.items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0);
      $('#resultTotal').textContent = Math.round(total);
    };
  });
}

async function saveItems() {
  const items = S.items.filter(i => i.grams > 0);
  if (!items.length) return toast('没有可保存的条目');
  const dishName = ($('#batchName').value || '').trim().slice(0, 20);
  if (items.length > 1 && !dishName) {
    $('#batchName').focus();
    return toast('先给这一餐起个名字，比如「沙县小吃」', 3000);
  }
  const btn = $('#saveItems');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    const batch = 'b' + Date.now();
    let shot = '';
    if (batch && S.photoData) {
      try { shot = await makeThumb(S.photoData); } catch (e) { /* 图存不下就算了 */ }
    }
    await api('/api/logs', {
      date: S.date,
      meal: S.meal,
      items,
      source: items[0]._src || 'manual',
      // 一次识别出来的多项合成一组，列表里只占一行
      batch,
      batchName: items.length > 1 ? dishName : '',
      shot,
    });
    closeAdd();
    S.batchName = null;
    clearDraft();
    toast(`已记入${MEAL_NAME[S.meal]} · ${Math.round(items.reduce((a, b) => a + b.kcal_per_100g * b.grams / 100, 0))} 千卡`);
    await loadDay();
    if (S.view === 'trends') loadTrends();
  } catch (e) {
    toast(e.message, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = '记入';
  }
}


/* ---------------- 一组记录的详情卡片 ---------------- */
function openGroup(key) {
  const g = groupMap.get(key);
  if (!g) return;
  openDetail(g.logs, true, g.name || '未命名');
}

/* logs：这一组（或这一条）记录；isGroup：多条才显示「N 项」和小计 */
function openDetail(logs, isGroup, title) {
  if (!logs || !logs.length) return;
  const sum = k => Math.round(logs.reduce((a, b) => a + (b[k] || 0), 0));
  const kcal = Math.round(logs.reduce((a, b) => a + (b.kcal || 0), 0));
  const batchKey = logs[0].batch || '';
  const shot = (S.day && S.day.shots && S.day.shots[batchKey]) || '';
  $('#grpName').textContent = title || logs[0].name;
  $('#grpMeta').textContent = isGroup
    ? `${logs.length} 项 · 蛋${sum('p')} / 碳${sum('c')} / 脂${sum('f')}`
    : `${Math.round(logs[0].grams)}g`;
  const img = $('#grpShot');
  if (shot) { img.src = shot; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
  // 拍照记的却没有图 → 说明是旧版本记的，说清楚免得以为丢了
  const noShot = !shot && logs.some(l => l.source === 'photo');
  const tip = $('#grpNoShot');
  if (tip) tip.hidden = !noShot;
  $('#grpItems').innerHTML = logs.map(l => `
    <div class="gitem">
      <div class="n">${esc(l.name)}<span class="sub">${Math.round(l.grams)}g · 蛋${Math.round(l.p)}/碳${Math.round(l.c)}/脂${Math.round(l.f)}</span></div>
      <div class="k">${Math.round(l.kcal)}</div>
      <button class="del" data-gdel="${l.id}">×</button>
    </div>`).join('');
  $('#grpTotal').textContent = kcal;
  S.detailIds = logs.map(l => l.id);
  S.detailIsGroup = !!isGroup;
  S.detailName = title || logs[0].name;
  $$('[data-gdel]', $('#grpItems')).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    try {
      await api('/api/logs/' + b.dataset.gdel, null, 'DELETE');
      closeGroup();
      await loadDay();
    } catch (e) { toast(e.message); }
  });
  $('#grpMask').classList.add('on');
  $('#grpSheet').classList.add('on');
}
function closeGroup() {
  $('#grpMask').classList.remove('on');
  $('#grpSheet').classList.remove('on');
}
async function renameGroup() {
  if (!S.detailIds) return;
  const name = prompt(S.detailIsGroup ? '这份叫什么？（比如：沙县小吃）' : '这个食物叫什么？', S.detailName || '');
  if (name === null) return;
  const v = name.trim().slice(0, 20);
  if (!v) return;
  try {
    await api('/api/logs/rename', { ids: S.detailIds, name: v, item: !S.detailIsGroup });
    closeGroup();
    await loadDay();
  } catch (e) { toast(e.message); }
}

/* ---------------- 趋势 ---------------- */
async function loadTrends() {
  try {
    const t = await api('/api/trends?days=' + S.trendDays);
    S.trend = t;
    renderTrends();
  } catch (e) {
    toast(e.message);
  }
}

function renderTrends() {
  const t = S.trend;
  const box = $('#trendBody');
  if (!t) { box.innerHTML = '<div class="empty-state">加载中…</div>'; return; }

  const real = t.real_tdee;
  let realCard = '';
  if (real) {
    const conf = real.confidence;
    const confColor = conf === '较高' ? 'var(--lime)' : conf === '中等' ? 'var(--orange)' : 'var(--muted)';
    realCard = `
      <div class="card">
        <h3>实测每日消耗 <span class="tag" style="color:${confColor};background:rgba(255,255,255,.06)">置信度 ${conf}</span></h3>
        <div class="kpi"><b>${real.tdee}</b><span>千卡 / 天</span></div>
        <div class="hint">
          用你 ${real.span_days} 天的体重变化反推出来的真实消耗。<br>
          体重 ${real.slope_kg_per_week > 0 ? '增加' : '减少'} ${Math.abs(real.slope_kg_per_week)} kg/周，
          期间平均摄入 ${real.avg_intake} 千卡（覆盖 ${real.coverage}% 的天数）。
        </div>
        <div class="grid2" style="margin-top:14px">
          <div class="mini"><div class="k">目标缺口</div><div class="v">${S.day?.targets.deficit ?? '—'}<small>千卡</small></div></div>
          <div class="mini"><div class="k">相对误差</div><div class="v">${
            S.day ? Math.round(Math.abs(real.tdee - S.day.expenditure) / real.tdee * 100) : '—'}<small>%</small></div></div>
        </div>
        <div style="font-size:11px;color:var(--muted2);margin-top:10px;line-height:1.6">
          这个数字才是不说谎的那个。它把所有估算误差（拍照、克重、手表）全吃掉了。
        </div>
      </div>`;
  } else {
    const need = Math.max(0, 14 - (t.weights?.length || 0));
    realCard = `
      <div class="card">
        <h3>实测每日消耗</h3>
        <div class="hint" style="margin-top:0">
          再记录约 <b style="color:var(--text)">${need}</b> 天体重和饮食，我就能反推出你的真实消耗。<br>
          <span style="color:var(--muted2);font-size:11px">原理：7700 千卡 ≈ 1kg 脂肪。体重掉的速率，就是你的真实缺口。</span>
        </div>
        <button class="btn sm" id="goWeight" style="margin-top:14px">记录今天的体重</button>
      </div>`;
  }

  // 体重图
  const weights = t.weights || [];
  let wChart = '';
  if (weights.length >= 2) {
    wChart = `<div class="card">
      <h3>体重趋势</h3>
      ${lineChart(weights, t.start, t.end)}
      <div class="legend">
        <span><i style="background:var(--blue)"></i>体重 kg</span>
        <span style="margin-left:auto">${weights.length} 次记录</span>
      </div>
    </div>`;
  } else {
    wChart = `<div class="card">
      <h3>体重趋势</h3>
      <div class="empty-state" style="padding:16px 0">至少记录 2 次体重才能画图<br>
      <button class="btn sm" id="goWeight2" style="max-width:180px;margin:14px auto 0">记录体重</button></div>
    </div>`;
  }

  // 平衡柱状图
  const bars = t.series.map(s => ({
    date: s.date,
    v: s.balance,
    intake: s.intake,
  }));
  const hasSurplus = bars.some(b => b.v != null && b.v < 0);
  const maxAbs = Math.max(300, ...bars.map(b => Math.abs(b.v || 0)));
  const barHtml = bars.map(b => {
    if (b.v == null) return `<div class="barcol"></div>`;
    if (!hasSurplus) {
      // 全是缺口时，从底部往上长，不浪费一半空间
      const h = b.v / maxAbs * 100;
      return `<div class="barcol" title="${b.date} 缺口 ${b.v}">
        <i style="height:${Math.max(1.5, h)}%;bottom:0;background:var(--lime);opacity:.85"></i>
      </div>`;
    }
    const h = Math.abs(b.v) / maxAbs * 50;
    const up = b.v > 0;
    return `<div class="barcol" title="${b.date} ${b.v}">
      <i style="height:${Math.max(1.5, h)}%;${up ? 'bottom:50%' : 'top:50%'};background:${up ? 'var(--lime)' : 'var(--orange)'};opacity:.85"></i>
    </div>`;
  }).join('');

  box.innerHTML = `
    ${realCard}
    ${t.logged_days === 0 ? `
    <div class="card">
      <h3>每日热量平衡</h3>
      <div class="empty-state" style="padding:26px 0">
        还没有数据<br>
        <span style="font-size:11.5px">去「今日」记第一笔，这里就会说话</span>
      </div>
    </div>` : `
    <div class="card">
      <h3>每日热量平衡 <span class="tag" id="avgTag">${t.avg_balance != null ? (t.avg_balance >= 0 ? '平均缺口 ' + t.avg_balance : '平均盈余 ' + Math.abs(t.avg_balance)) : '暂无数据'}</span></h3>
      <div class="barchart ${hasSurplus ? '' : 'bottom'}">${barHtml}</div>
      <div class="legend">
        <span><i style="background:var(--lime)"></i>缺口</span>
        <span><i style="background:var(--orange)"></i>盈余</span>
        <span style="margin-left:auto">${t.logged_days} / ${t.days} 天有记录</span>
      </div>
    </div>`}
    ${wChart}
    <div class="card">
      <h3>区间统计</h3>
      <div class="grid2">
        <div class="mini"><div class="k">平均摄入</div><div class="v">${t.avg_intake || '—'}<small>千卡</small></div></div>
        <div class="mini"><div class="k">平均消耗</div><div class="v">${t.avg_expenditure || '—'}<small>千卡</small></div></div>
        <div class="mini"><div class="k">记录天数</div><div class="v">${t.logged_days}<small>/ ${t.days}</small></div></div>
        <div class="mini"><div class="k">体重变化</div><div class="v">${
          weights.length >= 2
            ? ((weights[weights.length - 1].kg - weights[0].kg) >= 0 ? '+' : '') +
              (weights[weights.length - 1].kg - weights[0].kg).toFixed(1) + '<small>kg</small>'
            : '—'}</div></div>
      </div>
    </div>`;

  const gw = $('#goWeight') || $('#goWeight2');
  if (gw) gw.onclick = openWeight;
}

function lineChart(points, start, end) {
  const W = 320, H = 130, pl = 4, pr = 4, pt = 12, pb = 22;
  const xs = points.map(p => +parseISO(p.date));
  const ys = points.map(p => p.kg);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1.2) { const m = (max + min) / 2; min = m - 0.6; max = m + 0.6; }
  const padY = (max - min) * 0.18;
  min -= padY; max += padY;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = v => pl + (W - pl - pr) * (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0));
  const Y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min));

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');
  const area = `${path} L${X(xs[xs.length - 1]).toFixed(1)},${H - pb} L${X(xs[0]).toFixed(1)},${H - pb} Z`;
  const dots = points.map((p, i) => {
    const last = i === points.length - 1;
    return `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="${last ? 3.5 : 2}" fill="${last ? '#d6ff4b' : '#6ea8ff'}" stroke="#15181b" stroke-width="1.5"/>`;
  }).join('');

  const first = points[0], last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ea8ff" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#6ea8ff" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#wg)"/>
    <path d="${path}" fill="none" stroke="#6ea8ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}" style="font-size:9px">${first.date.slice(5)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" style="font-size:9px">${last.date.slice(5)}</text>
    <text x="${pl}" y="${Y(max) + 10}" style="font-size:9px">${max.toFixed(1)}</text>
    <text x="${pl}" y="${Y(min) - 2}" style="font-size:9px">${min.toFixed(1)}</text>
  </svg>`;
}

/* ---------------- 主题 ---------------- */
// 目标模式：只决定「蛋白质系数 + 脂肪占比」，不动用户设的缺口/盈余
// 目标模式：蛋白质系数 + 脂肪占比 + 建议缺口（正=缺口，负=盈余）
const DIET_MODES = {
  cut:      { n: '减脂', p: 2.0, fat: 0.25, deficit: 300,  tip: '缺口 300 · 蛋白 2.0' },
  maintain: { n: '维持', p: 1.6, fat: 0.28, deficit: 0,    tip: '不缺口 · 蛋白 1.6' },
  bulk:     { n: '增肌', p: 1.8, fat: 0.25, deficit: -250, tip: '盈余 250 · 蛋白 1.8' },
};
const THEMES = { lime: '#d6ff4b', blue: '#6ea8ff', orange: '#ff9f45' };

// 缺口/盈余合理性提示：只提醒，绝不改用户填的数
function deficitAdvice(exp, deficit, bmr) {
  const d = Number(deficit) || 0;
  const e = Number(exp) || 0;
  const abs = Math.abs(d);
  if (!e) return null;
  const pct = Math.round(abs / e * 100);
  const safe = Math.round(Math.min(e * 0.25, 500));
  if (d > 0) {                                    // 缺口
    if (d >= e) return { lv: 'hard', t: `缺口 ${d} 已超过当天消耗 ${e}，每日可吃会变成 0。建议不超过 ${safe}（消耗的 25%）。` };
    if (bmr && e - d < bmr * 0.75) return { lv: 'hard', t: `每日可吃只剩 ${e - d}，已低于基础代谢 ${bmr} 的 75%，长期会掉肌肉、代谢变慢。建议缺口不超过 ${safe}。` };
    if (abs > 500 || pct > 25) return { lv: 'warn', t: `缺口偏大（占消耗 ${pct}%，约 ${(abs * 7 / 7700).toFixed(2)} kg/周）。一般建议不超过 ${safe}（25%），减得稳、不易反弹。` };
    return null;
  }
  if (d < 0) {                                    // 盈余
    if (abs > 700) return { lv: 'hard', t: `盈余 ${abs} 偏大，多出的热量更容易变成脂肪。增肌一般建议 200–300。` };
    if (abs > 400) return { lv: 'warn', t: `盈余 ${abs}（约 ${(abs * 7 / 7700).toFixed(2)} kg/周），多数人 200–300 已经够用。` };
    return null;
  }
  return null;
}
// 每个主题的[主光色, 副光色]，背景光晕和点阵跟着变
const GLOWS = {
  lime: ['#d6ff4b', '#46ffc4'],
  blue: ['#6ea8ff', '#8be3ff'],
  orange: ['#ff9f45', '#ffd08a'],
};
const rgbOf = hex => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)].join(', ');
};
const THEME_NAMES = { lime: '荧光绿', blue: '海水蓝', orange: '活力橙' };
function applyTheme(name) {
  const c = THEMES[name] || THEMES.lime;
  const g = GLOWS[name] || GLOWS.lime;
  const root = document.documentElement.style;
  root.setProperty('--lime', c);
  root.setProperty('--glow-rgb', rgbOf(g[0]));
  root.setProperty('--glow2-rgb', rgbOf(g[1]));
}


/* 左边缘往右滑 = 返回（关卡片 / 关弹层 / 退出我的子页） */
function goBack() {
  const on = id => { const el = $(id); return el && el.classList.contains('on'); };
  if (on('#grpSheet')) return closeGroup();
  if (on('#addSheet')) return closeAdd();
  if (on('#helpSheet')) return closeHelp();
  if (on('#watchSheet')) return closeWatch();
  if (on('#weightSheet')) return closeWeight();
  if (mePage) {
    const v = $('#view-me');
    if (v) v.classList.add('slideout');
    setTimeout(() => {
      mePage = null;
      if (v) v.classList.remove('slideout');
      renderMe();
    }, 170);
  }
}

/* ---------------- 我的 / 设置 ---------------- */
let mePage = null;

function meBackBar(title) {
  return `<div class="mehead">
    <button class="mehead-back" id="meBack" aria-label="返回">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>
    </button>
    <h2>${title}</h2>
  </div>`;
}

function renderMe() {
  const d = S.day;
  if (!d) return;
  const p = d.profile || {};
  const acts = d.activity_labels || {};
  const sugGoal = Math.round(-(Number(p.weight_kg || 60) * 0.005) * 20) / 20 || -0.3;
  const sugKcal = Math.round(Math.abs(sugGoal) * 7700 / 7);
  const opt = Object.entries(acts).map(([k, v]) =>
    `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const g = Math.abs(p.goal_rate ?? -0.25);

  let h = '';

  if (!mePage) {
    h = `
      <h1 class="pagetitle">设置</h1>
      <div class="setgroup">
        <button class="srow" data-page="body">
          <span>身体与目标</span>
          <em>${p.height_cm || 165}cm · ${p.weight_kg || 60}kg</em><i>›</i>
        </button>
        <button class="srow" data-page="nutri">
          <span>饮食目标</span>
          <em>${d.targets.kcal_budget} 千卡 / 天</em><i>›</i>
        </button>
      </div>
      <div class="seclabel">功能</div>
      <div class="setgroup">
        <button class="srow" data-page="ai">
          <span>AI 识别</span>
          <em>${d.has_key ? '已配置' : '未配置'}</em><i>›</i>
        </button>
        <button class="srow" data-page="theme">
          <span>个性化</span>
          <em>${THEME_NAMES[d.theme] || '荧光绿'}</em><i>›</i>
        </button>
        <button class="srow" data-page="notify">
          <span>通知</span>
          <em>${d.sync_toast ? '开' : '关'}</em><i>›</i>
        </button>
      </div>
      <div class="seclabel">其他</div>
      <div class="setgroup">
        <button class="srow" data-page="data">
          <span>数据备份</span><em></em><i>›</i>
        </button>
        <button class="srow" data-page="about">
          <span>关于与更新</span><em>${APP_VERSION}</em><i>›</i>
        </button>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>版本更新 <span class="tag" style="color:var(--muted);background:rgba(255,255,255,.06)">${APP_VERSION}</span></h3>
        <div class="hint" style="margin:0 0 14px">iPhone 会缓存网页。看到旧界面就点下面的按钮强制刷新，不动数据。</div>
        <button class="btn primary" id="hardReload">强制更新</button>
      </div>
      <div style="height:26px"></div>`;
  } else if (mePage === 'body') {
    h = meBackBar('身体与目标') + `
      <div class="card">
        <div class="split">
          <div class="field">
            <label>性别</label>
            <select id="fSex">
              <option value="" ${!p.sex ? 'selected' : ''} disabled>请选择</option>
              <option value="female" ${p.sex === 'female' ? 'selected' : ''}>女</option>
              <option value="male" ${p.sex === 'male' ? 'selected' : ''}>男</option>
            </select>
          </div>
          <div class="field">
            <label>出生年份</label>
            <input id="fYear" type="number" inputmode="numeric" value="${p.birth_year || 1995}">
          </div>
          <div class="field">
            <label>身高（cm）</label>
            <input id="fHeight" type="number" inputmode="decimal" value="${p.height_cm || 165}">
          </div>
          <div class="field">
            <label>体重（kg）</label>
            <input id="fWeight" type="number" inputmode="decimal" step="0.1" value="${p.weight_kg || 60}">
          </div>
        </div>
        <div class="field">
          <label>日常活动量</label>
          <select id="fAct">${opt}</select>
          <div class="hint">没有手表数据时用来估算日常消耗。有手表的话会被覆盖。</div>
        </div>
        <div class="field">
          <label>目标速度（kg / 周）</label>
          <input id="fGoalRate" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="0.5" value="${g}">
          <div class="hint">填 <b>0.5</b> = 每周减 0.5 公斤；<b>0</b> = 维持；负数 = 增肌。<br>按你 ${p.weight_kg || 60}kg 算，<b style="color:var(--lime)">建议 ${Math.abs(sugGoal)}</b>（≈ 每天 ${sugKcal} 千卡缺口）。</div>
        </div>
        <div class="field">
          <label>蛋白质目标（g / kg 体重）</label>
          <input id="fProt" type="number" inputmode="decimal" step="0.1" value="${p.protein_per_kg || 1.6}">
          <div class="hint">减脂期建议 1.6–2.2。肌肉量越大、练得越狠，取越高。</div>
        </div>
        <button class="btn primary" id="saveProfile">保存</button>
        <button class="btn ghost sm" id="openWeight2" style="margin-top:10px">记录今天的体重</button>
      </div>`;
  } else if (mePage === 'ai') {
    h = meBackBar('AI 识别') + `
      <div class="card">
        <div class="hint" style="margin:0 0 14px">用于拍照识别食物、读营养成分表。Key 只存在这台设备，不上传。</div>
        <div class="field">
          <label>DashScope API Key</label>
          <input id="fKey" type="password" placeholder="${d.has_key ? '已保存，如需更换请重新填写' : 'sk-...'}" autocomplete="off">
          <div class="hint">获取地址：bailian.console.aliyun.com</div>
        </div>
        <div class="btnrow">
          <button class="btn sm" id="saveKey">保存</button>
          <button class="btn sm" id="testKey">测试连接</button>
        </div>
        ${d.has_key ? '<button class="linkbtn" id="peekKey" style="margin-top:10px">查看已保存的 Key</button>' : ''}
        ${d.ai_model ? `<div style="font-size:11px;color:var(--muted2);margin-top:10px">当前模型：${esc(d.ai_model)}</div>` : ''}
      </div>`;
  } else if (mePage === 'data') {
    h = meBackBar('数据备份') + `
      <div class="card">
        <div class="cardhd"><h3>云端同步</h3><button class="linkbtn" id="stopGh">关闭同步</button></div>
        <div class="hint" style="margin:0 0 12px">
          填一个 GitHub token，之后每次记账都会自动传到仓库里的 <code>data.json</code>；换手机、重装 App 打开就自动恢复。
        </div>
        <div class="field">
          <label>GitHub Token</label>
          <input id="fGhToken" type="password" placeholder="${setting('gh_token') ? '已填写，需要更换再输入' : 'github_pat_...'}" autocomplete="off">
          <div class="hint">只勾这一个仓库的 Contents: Read and write</div>
        </div>
        <div class="btnrow">
          <button class="btn primary sm" id="saveGhToken">开启同步</button>
          <button class="btn sm" id="syncNow">立即同步</button>
        </div>
        <div class="hint" id="cloudState" style="margin-top:10px"></div>
      </div>
      <div class="card">
        <div class="hint" style="margin:0 0 14px">
          卸载 / 重新添加主屏幕 App 会清空数据。<b>卸载前先点下面的备份</b>，装回来再「从 iCloud 恢复」。
        </div>
        <button class="btn primary" id="exportJson">备份到 iCloud</button>
        <button class="btn sm" id="importJson" style="margin-top:10px">从 iCloud 恢复</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <div class="hint" style="margin-top:12px" id="backupAt"></div>
        <div class="btnrow" style="margin-top:14px">
          <button class="btn ghost sm" id="exportCsv">导出 CSV</button>
        </div>
      </div>
`;
  } else if (mePage === 'nutri') {
    const a = (d.targets.auto) || {};
    h = meBackBar('饮食目标') + `
      <div class="card">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:8px">目标模式</label>
        <div class="modes" id="dietModes">
          ${Object.entries(DIET_MODES).map(([k, m]) => `
            <button data-mode="${k}" class="${(setting('diet_mode', 'maintain') === k) ? 'on' : ''}">
              <b>${m.n}</b><i>${m.tip}</i>
            </button>`).join('')}
        </div>
        <div class="hint" style="margin:10px 0 16px">切模式会带一个<b>建议的缺口/盈余</b>（上面每档都写着），应用后你仍然可以自己改；之后只有你改它才变。</div>
        <div class="field">
          <label>目标缺口 / 盈余（千卡 / 天）</label>
          <input id="nDef" type="number" inputmode="numeric" value="${-d.targets.deficit}">
          <div class="hint"><b>负数 = 缺口</b>（如 -300），<b>正数 = 盈余</b>（如 300）。填 0 就等于维持。</div>
          <div class="warnline" id="nDefWarn" hidden></div>
        </div>
        <div class="field">
          <label>每日可吃（千卡）</label>
          <input id="nKcal" type="number" inputmode="numeric" value="${d.targets.kcal_budget}">
          <div class="hint" id="nKcalHint">= 全天消耗 ${d.expenditure} ${d.targets.deficit >= 0 ? '− 缺口 ' + Math.abs(d.targets.deficit) : '+ 盈余 ' + Math.abs(d.targets.deficit)}<br><span style="color:var(--muted2)">全天消耗 = 基础代谢 ${(d.expenditure_detail && d.expenditure_detail.resting) ? Math.round(d.expenditure_detail.resting) : '—'} + 手表活动 ${(d.expenditure_detail && d.expenditure_detail.active) ? Math.round(d.expenditure_detail.active) : '—'}</span></div>
        </div>
        <div class="field">
          <label>蛋白质（g）</label>
          <input id="nProt" type="number" inputmode="numeric" value="${d.targets.protein_g}">
          <div class="hint">建议 ${a.protein_g ?? d.targets.protein_g}（体重 × 系数）</div>
        </div>
        <div class="field">
          <label>碳水（g）</label>
          <input id="nCarb" type="number" inputmode="numeric" value="${d.targets.carb_g}">
          <div class="hint">建议 ${a.carb_g ?? d.targets.carb_g}</div>
        </div>
        <div class="field">
          <label>脂肪（g）</label>
          <input id="nFat" type="number" inputmode="numeric" value="${d.targets.fat_g}">
          <div class="hint">建议 ${a.fat_g ?? d.targets.fat_g}</div>
        </div>
        <div class="btnrow">
          <button class="btn primary" id="saveNutri" style="flex:2">保存</button>
          <button class="btn sm" id="resetNutri">恢复建议</button>
        </div>
      </div>`;
  } else if (mePage === 'theme') {
    const cur = d.theme || 'lime';
    h = meBackBar('个性化') + `
      <div class="card">
        <h3>主题色</h3>
        <div class="hint" style="margin:0 0 14px">只影响高亮色（圆环、按钮、数字强调），不影响数据。</div>
        <div class="themepick">
          ${Object.entries(THEMES).map(([k, v]) => `
            <button class="swatch" data-theme="${k}" style="--c:${v}">
              <span class="dot" style="background:${v}"></span>
              <span>${THEME_NAMES[k]}</span>
              ${cur === k ? '<b>✓</b>' : ''}
            </button>`).join('')}
        </div>
      </div>`;
  } else if (mePage === 'notify') {
    h = meBackBar('通知') + `
      <div class="card">
        <div class="switchrow">
          <div>
            <div class="stitle">同步完成后弹提示</div>
            <div class="hint" style="margin:4px 0 0">拉到新的手表数据时，顶部弹一条提示；关掉就安静同步。</div>
          </div>
          <label class="sw"><input type="checkbox" id="swToast" ${d.sync_toast ? 'checked' : ''}><i></i></label>
        </div>
      </div>
      <div class="card">
        <h3>关于推送</h3>
        <div class="hint" style="margin:0">
          网页 App 不能像原生 App 那样在后台推送通知，这是 iOS 的限制。<br>
          需要「到点提醒」的话，可以在快捷指令的自动化里加一个「显示通知」动作。
        </div>
      </div>`;
  } else if (mePage === 'about') {
    h = meBackBar('关于与更新') + `
      <div class="about-fill">
      <div class="card">
        <h3>最近更新 <span class="tag" style="color:var(--muted);background:rgba(255,255,255,.06)">${APP_VERSION}</span></h3>
        ${RELEASES.map(r => `
          <div class="rel-date">${r.d}${r.v && r.v !== r.d ? ' · ' + r.v : ''}</div>
          <ul class="rel-list">${r.items.map(t => `<li>${t}</li>`).join('')}</ul>
        `).join('')}
      </div>
      <div class="card tight">
        <h3>这套算法在算什么</h3>
        <div class="hint" style="margin:0;line-height:1.6;font-size:11px">
          <b style="color:var(--text)">基础代谢</b>：Mifflin-St Jeor 公式（体重、身高、年龄、性别）。<br>
          <b style="color:var(--text)">全天消耗</b>：手表给了活动能量 → 基础代谢 + 活动能量；给的是总消耗 → 直接用；都没 → 基础代谢 × 活动系数。<br>
          <b style="color:var(--text)">目标缺口 / 盈余</b>：优先用你在「饮食目标」里填的值（负数=缺口，正数=盈余）；留空则按目标速度 × 7700 ÷ 7 估算，并封顶在当天消耗的 22%。<br>
          <b style="color:var(--text)">还能吃</b>：全天消耗 − 目标缺口 − 已吃。<br>
          <b style="color:var(--text)">实际缺口</b>：全天消耗 − 已吃。正数缺口，负数盈余。<br>
          <b style="color:var(--text)">实测消耗</b>（趋势页）：体重回归斜率 × 7700。<br>
          <span style="color:var(--muted2);font-size:11px">单日有 ±20% 误差，看 7 天平均。</span>
        </div>
      </div>
      </div>`;
  }

  $('#meBody').innerHTML = h;
  fitAboutFill();
  wireMe();
}

/* 关于页：让两张卡正好铺满，页面本身不滚，只有上面那张卡内部滚 */
function fitAboutFill() {
  const doc = document.documentElement;
  const fill = document.querySelector('.about-fill');
  if (!fill) { doc.classList.remove('noscroll'); return; }
  const tab = document.querySelector('.tabbar');
  const tabTop = tab ? tab.getBoundingClientRect().top : window.innerHeight - 60;
  const top = fill.getBoundingClientRect().top;
  fill.style.height = Math.max(240, Math.round(tabTop - top - 12)) + 'px';
  // 这一页整页不滚，滚动只发生在上面那张卡里
  doc.classList.add('noscroll');
}

function wireMe() {
  const dbg = $('#dbgLine');
  if (dbg) {
    const tb = document.querySelector('.topbar');
    const tbH = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
    const tbPad = tb ? getComputedStyle(tb).paddingTop : '';
    dbg.textContent = `视口 ${Math.round(window.innerWidth)}×${Math.round(window.innerHeight)} · 顶栏 ${tbH}px（上边距 ${tbPad}）· ${APP_VERSION}`;
  }
  const back = $('#meBack');
  if (back) back.onclick = () => { mePage = null; renderMe(); };
  $$('.srow').forEach(b => b.onclick = () => { mePage = b.dataset.page; renderMe(); });

  $$('.swatch').forEach(b => b.onclick = async () => {
    const t = b.dataset.theme;
    applyTheme(t);
    if (S.day) S.day.theme = t;   // 先让勾选立刻跟上
    renderMe();
    await api('/api/settings', { theme: t });
    await loadDay();
    toast('已切换主题');
  });

  const nd = $('#nDef'), nk = $('#nKcal');
  if (nd && nk) {
    const exp = (S.day && S.day.expenditure) || 0;
    const bmr = Math.round((S.day && S.day.expenditure_detail && S.day.expenditure_detail.resting) || 0);
    const paintWarn = () => {
      const box = $('#nDefWarn');
      if (!box) return null;
      const adv = deficitAdvice(exp, -Number(nd.value || 0), bmr);
      if (!adv) { box.hidden = true; box.textContent = ''; box.className = 'warnline'; return null; }
      box.hidden = false;
      box.className = 'warnline' + (adv.lv === 'hard' ? ' hard' : '');
      box.textContent = adv.t;
      return adv;
    };
    const paintKcalHint = () => {
      const box = $('#nKcalHint');
      if (!box) return;
      const d = -Number(nd.value || 0);
      const tail = box.querySelector('span') ? box.querySelector('span').outerHTML : '';
      box.innerHTML = `= 全天消耗 ${exp} ${d >= 0 ? '− 缺口 ' + abs0(d) : '+ 盈余 ' + abs0(d)}<br>${tail}`;
    };
    const abs0 = (n) => Math.abs(Math.round(n));
    nd.oninput = () => { nk.value = Math.max(600, Math.round(exp + (Number(nd.value) || 0))); paintWarn(); paintKcalHint(); };
    nk.oninput = () => { nd.value = Math.round((Number(nk.value) || 0) - exp); paintWarn(); };
    paintWarn();
  }
  $$('#dietModes button').forEach(b => b.onclick = async () => {
    const k = b.dataset.mode;
    const m = DIET_MODES[k];
    if (!m) return;
    const cur = setting('diet_mode', 'maintain');
    if (cur === k) return;
    const ov = Object.assign({}, setting('target_override', {}));
    delete ov.protein; delete ov.carb; delete ov.fat;
    ov.deficit = m.deficit;                             // 模式同时给一个建议缺口/盈余
    await api('/api/settings', { diet_mode: k, fat_ratio: m.fat, target_override: ov });
    await api('/api/profile', { protein_per_kg: m.p });
    const dir = m.deficit > 0 ? `缺口 ${m.deficit}` : (m.deficit < 0 ? `盈余 ${-m.deficit}` : '不缺口不盈余');
    toast(`已切到「${m.n}」：${dir}，蛋白质 ${m.p} g/kg`, 3200);
    await loadDay();
    renderMe();
  });

  const sn = $('#saveNutri');
  if (sn) sn.onclick = async () => {
    try {
      const a = (S.day && S.day.targets && S.day.targets.auto) || {};
      // 只有和“建议值”不同的才存成手动值；全都一样就等于恢复自动
      const pick = (sel, autoVal) => {
        const v = Number(($(sel) || {}).value);
        if (!isFinite(v) || v <= 0) return undefined;
        if (autoVal && Math.abs(v - autoVal) < 1) return undefined;
        return v;
      };
      const defRaw = Number(($('#nDef') || {}).value);
      const autoDef = Number(a.deficit || 0);
      const defValue = (isFinite(defRaw) && defRaw !== 0 && Math.abs(-defRaw - autoDef) >= 1) ? -defRaw : undefined;
      const ov = {
        deficit: defValue,
        // 填了缺口/盈余就不用再存「每日可吃」，否则两者会打架
        kcal: defValue !== undefined ? undefined : pick('#nKcal', a.kcal_budget),
        protein: pick('#nProt', a.protein_g),
        carb: pick('#nCarb', a.carb_g),
        fat: pick('#nFat', a.fat_g),
      };
      Object.keys(ov).forEach(k => ov[k] === undefined && delete ov[k]);
      await api('/api/settings', { target_override: ov });
      const adv = (function () {
        const e = (S.day && S.day.expenditure) || 0;
        const b = Math.round((S.day && S.day.expenditure_detail && S.day.expenditure_detail.resting) || 0);
        return deficitAdvice(e, -defRaw, b);
      })();
      if (adv) toast(adv.t, adv.lv === 'hard' ? 5200 : 4200);
      else toast(Object.keys(ov).length ? '已保存饮食目标' : '已恢复为建议值');
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  const rn = $('#resetNutri');
  if (rn) rn.onclick = async () => {
    if (!confirm('恢复建议会把你自己填的目标缺口和营养值清掉，改回自动计算。确定吗？')) return;
    await api('/api/settings', { target_override: {} });
    toast('已恢复建议值');
    await loadDay();
    renderMe();
  };

  const sw = $('#swToast');
  if (sw) sw.onchange = async () => {
    await api('/api/settings', { sync_toast: sw.checked });
    toast(sw.checked ? '同步提示已打开' : '同步提示已关闭');
  };

  const sp = $('#saveProfile');
  if (sp) sp.onclick = async () => {
    const sex = $('#fSex').value;
    if (sex !== 'male' && sex !== 'female') { toast('先选一下性别（基础代谢差 166 千卡）', 3000); return; }
    try {
      await api('/api/profile', {
        sex: $('#fSex').value,
        birth_year: Number($('#fYear').value),
        height_cm: Number($('#fHeight').value),
        weight_kg: Number($('#fWeight').value),
        activity: $('#fAct').value,
        goal_rate: (() => {
          const raw = $('#fGoalRate').value.trim();
          if (raw === '') return -0.25;
          const v = Number(raw);
          return isFinite(v) ? -v : -0.25;
        })(),
        protein_per_kg: Number($('#fProt').value),
      });
      const sv = Store.load().profile;
      toast(`已保存：${sv.sex === 'male' ? '男' : '女'} · ${sv.height_cm}cm · ${sv.weight_kg}kg`, 2800);
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };

  const w2 = $('#openWeight2'); if (w2) w2.onclick = openWeight;

  const hr = $('#hardReload');
  if (hr) hr.onclick = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    toast('正在更新…', 1200);
    // 带一个随机参数重开，绕开 GitHub Pages 的 10 分钟 CDN 缓存
    setTimeout(() => {
      const u = location.pathname + '?r=' + Date.now();
      location.replace(u);
    }, 400);
  };

  const ec = $('#exportCsv'); if (ec) ec.onclick = () => { downloadCsv(); toast('已导出 CSV'); };
  const ghInp = $('#fGhToken'), ghSave = $('#saveGhToken'), ghNow = $('#syncNow'), ghState = $('#cloudState');
  if (ghState) {
    const t = setting('cloud_synced_at', ''), e = (typeof cloudLastError === 'function' ? cloudLastError() : '');
    ghState.textContent = t ? ('上次同步：' + t) : (cloudToken() ? '还没同步过' : '未开启');
    if (e) ghState.textContent += ' · ' + e;
  }
  const setCloudState = txt => { if (ghState) ghState.textContent = txt; };
  const busyBtn = async (btn, label, fn) => {
    if (btn) { btn.disabled = true; btn.dataset.k = btn.textContent; btn.textContent = label; }
    try { return await fn(); } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.k || btn.textContent; }
    }
  };

  if (ghSave) ghSave.onclick = async () => {
    const v = (($('#fGhToken') || {}).value || '').trim();
    if (!v) return toast('先填 token');
    setSetting('gh_token', v);
    cloudSha = null;
    setCloudState('正在上传…');
    const ok = await busyBtn(ghSave, '上传中…', () => cloudPush());
    if (ok) {
      toast('✅ 同步已开启，数据已上传', 3000);
      setCloudState('上次同步：' + (setting('cloud_synced_at', '') || '刚刚'));
    } else {
      const err = (typeof cloudLastError === 'function' ? cloudLastError() : '') || '上传失败';
      toast('❌ ' + err, 4000);
      setCloudState('失败：' + err);
    }
  };

  const ghStop = $('#stopGh');
  if (ghStop) ghStop.onclick = () => {
    setSetting('gh_token', '');
    setSetting('cloud_seen', '');
    cloudSha = null;
    toast('已关闭云端同步，数据仍在本机', 2600);
    renderMe();
  };

  if (ghNow) ghNow.onclick = async () => {
    if (!cloudToken()) return toast('先在下面填 token 并保存');
    setCloudState('正在同步…');
    const r = await busyBtn(ghNow, '同步中…', async () => {
      const pull = await cloudPull();
      if (pull === 'pulled') return 'pulled';
      const ok = await cloudPush();
      return ok ? 'pushed' : false;
    });
    if (r === 'pulled') {
      toast('✅ 已从云端拉取最新数据', 3000);
      await loadDay(); renderMe();
      setCloudState('上次同步：' + (setting('cloud_synced_at', '') || '刚刚'));
    } else if (r === 'pushed') {
      toast('✅ 已上传到云端', 2600);
      setCloudState('上次同步：' + (setting('cloud_synced_at', '') || '刚刚'));
    } else {
      const err = (typeof cloudLastError === 'function' ? cloudLastError() : '') || '同步失败';
      toast('❌ ' + err, 4000);
      setCloudState('失败：' + err);
    }
  };

  const ba = $('#backupAt');
  if (ba) {
    const t = Store.load().settings.lastBackupAt;
    ba.textContent = t ? '上次备份：' + t : '还没有备份过';
  }
  const ej = $('#exportJson');
  if (ej) ej.onclick = async () => {
    try {
      const r = await exportJson();
      if (r === 'cancel') return;
      const t = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      setSetting('lastBackupAt', t);
      if (ba) ba.textContent = '上次备份：' + t;
      toast(r === 'shared' ? '已存到「文件」/ iCloud Drive' : '已下载备份文件', 3000);
    } catch (e) { toast('备份失败：' + e.message, 4000); }
  };
  const ij = $('#importJson');
  if (ij) ij.onclick = () => {
    if (!confirm('恢复会用备份覆盖手机上现在的全部数据，确定吗？')) return;
    $('#importFile').click();
  };
  const iff = $('#importFile');
  if (iff) iff.onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importJson(await f.text());
      toast('已恢复备份');
      applyTheme(Store.load().settings.theme || 'lime');
      await loadDay();
      renderMe();
    } catch (err) {
      toast('恢复失败：' + err.message, 4000);
    }
    e.target.value = '';
  };

  const pk = $('#peekKey');
  if (pk) pk.onclick = () => {
    const inp = $('#fKey');
    const key = String(Store.load().settings.dashscope_key || '');
    if (inp.type === 'text') {
      inp.type = 'password'; inp.value = ''; pk.textContent = '查看已保存的 Key';
    } else {
      inp.type = 'text'; inp.value = key; pk.textContent = '隐藏';
      setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 50);
    }
  };

  const sk = $('#saveKey');
  if (sk) sk.onclick = async () => {
    const v = $('#fKey').value.trim();
    if (!v) return toast('先填入 Key');
    try {
      await api('/api/settings', { dashscope_key: v });
      const sv = Store.load().profile;
      toast(`已保存：${sv.sex === 'male' ? '男' : '女'} · ${sv.height_cm}cm · ${sv.weight_kg}kg`, 2800);
      await loadDay();
      renderMe();
    } catch (e) { toast(e.message); }
  };
  const tk = $('#testKey');
  if (tk) tk.onclick = async () => {
    const v = $('#fKey').value.trim();
    if (v) await api('/api/settings', { dashscope_key: v });
    try {
      const r = await api('/api/settings/test', {});
      toast('连接正常：' + r.message);
    } catch (e) { toast(e.message, 5000); }
  };
}

/* ---------------- 手表 ---------------- */
function openWatch() {
  const w = (S.day && S.day.watch) || {};
  $('#wActive').value = w.active ?? '';
  $('#wResting').value = w.resting ?? '';
  $('#wTotal').value = w.total ?? '';
  $('#wSteps').value = w.steps ?? '';
  $('#watchDate').textContent = S.date === S.today ? '今天' : S.date.slice(5);
  let note = w.source === 'photo' ? '上次是从截图读的。' : '';
  if (w.source === 'cloud' && w.cloudAt) {
    note = `云端最近一次：${String(w.cloudAt).slice(5)} · 活动 ${w.active} 千卡。快捷指令只在它运行时写新数据，数字不变就是还没写新的。`;
  }
  $('#watchNote').textContent = note;
  $('#watchMask').classList.add('on');
  $('#watchSheet').classList.add('on');
}
function closeWatch() {
  $('#watchMask').classList.remove('on');
  $('#watchSheet').classList.remove('on');
}

async function saveWatch() {
  const num = id => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const body = {
    date: S.date,
    active: num('#wActive'),
    resting: num('#wResting'),
    total: num('#wTotal'),
    steps: num('#wSteps'),
    source: 'manual',
  };
  if (body.active == null && body.total == null && body.resting == null) {
    return toast('至少填一项');
  }
  try {
    await api('/api/daily', body);
    closeWatch();
    toast('已保存');
    await loadDay();
    if (S.view === 'trends') loadTrends();
    if (S.view === 'me') renderMe();
  } catch (e) { toast(e.message); }
}

async function readWatchShot(file) {
  if (!file) return;
  try {
    const img = await compress(file, 1400, 0.85);
    toast('正在读取截图…');
    const r = await api('/api/ai/watch', { image: img });
    if (r.active_kcal != null) $('#wActive').value = Math.round(r.active_kcal);
    if (r.resting_kcal != null) $('#wResting').value = Math.round(r.resting_kcal);
    if (r.total_kcal != null) $('#wTotal').value = Math.round(r.total_kcal);
    if (r.steps != null) $('#wSteps').value = Math.round(r.steps);
    $('#watchNote').textContent = r.note || '读出来了，核对一下再保存。';
    toast('读取完成');
  } catch (e) {
    toast(e.message, 5000);
  }
}

/* ---------------- 体重 ---------------- */
function openWeight() {
  $('#weightInput').value = S.day?.profile?.weight_kg || '';
  $('#weightMask').classList.add('on');
  $('#weightSheet').classList.add('on');
  setTimeout(() => $('#weightInput').focus(), 300);
}
function closeWeight() {
  $('#weightMask').classList.remove('on');
  $('#weightSheet').classList.remove('on');
}

async function saveWeight() {
  const v = Number($('#weightInput').value);
  if (!v || v < 20 || v > 300) return toast('填个体重数字');
  try {
    await api('/api/weight', { date: S.date, kg: v });
    closeWeight();
    toast('已记录');
    await loadDay();
    if (S.view === 'trends') loadTrends();
  } catch (e) { toast(e.message); }
}

/* ---------------- 导航 ---------------- */
function refreshTodayIfNeeded() {
  const t = todayISO();
  if (t === S.today) return false;
  S.today = t;
  if (S.date !== t) S.date = t;
  loadDay();
  return true;
}
function switchView(v) {
  refreshTodayIfNeeded();
  if (v !== 'me') document.documentElement.classList.remove('noscroll');
  if (window.scTop) window.scTop();
  S.view = v;
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + v));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.body.classList.toggle('view-me', v === 'me');
  document.body.classList.toggle('view-trends', v === 'trends');
  window.scrollTo({ top: 0 });
  if (v === 'trends') { renderTrends(); loadTrends(); }
  if (v === 'me') { mePage = null; renderMe(); }
}

/* ---------------- 自动同步帮助 ---------------- */

function watchUrlTemplate() {
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return `${base}?watch=1&a=[活动能量]&r=[静息能量]`;
}

function showShortcutHelp() {
  $('#helpBody').innerHTML = `
    <div class="sechead">现在的同步流程</div>
    <div class="step"><b>1</b><div>每天 23:00，快捷指令「<b>热量采集</b>」读一次当天的「活动能量」</div></div>
    <div class="step"><b>2</b><div>它把结果写进你 GitHub 仓库里的 <code>health.json</code></div></div>
    <div class="step"><b>3</b><div>打开这个 App 时自动去取，<b>不经过 Safari，也不弹浏览器</b></div></div>

    <div class="sechead">要确认的一步：自动化指向它</div>
    <div class="step"><b>4</b><div>「快捷指令」App → 底部 <b>自动化</b> → 点「23:00」那条</div></div>
    <div class="step"><b>5</b><div>点动作里的蓝色「<b>快捷指令</b>」字样 → 选「<b>热量采集</b>」→ 完成</div></div>
    <div class="step"><b>6</b><div>确认那条自动化的总开关是<b>打开</b>状态</div></div>

    <div class="sechead">怎么知道它在工作</div>
    <div class="step"><b>7</b><div>23:00 之后打开 App，「消耗」会显示 <b>基础代谢 + 活动消耗</b></div></div>
    <div class="step"><b>8</b><div>数字没变，点右上角 <b>⟳</b> 刷新一次</div></div>

    <div class="sechead">一直没数据时，按顺序查</div>
    <div class="step"><b>A</b><div>权限：设置 → 隐私与安全性 → 健康 → 快捷指令 → <b>活动能量「完全访问」</b></div></div>
    <div class="step"><b>B</b><div>健康 App 里当天确实有「活动能量」数据</div></div>
    <div class="step"><b>C</b><div>手动点一次「热量采集」运行，看会不会报「未找到样本」</div></div>

    <div class="hint" style="margin-top:14px">
      不想等自动同步时，也可以手动填：<b>我的 → 手表/消耗数据 → ⌨️ 手动填写</b>，10 秒搞定。
    </div>`;

  $('#helpCopy').onclick = closeHelp;
  $('#helpMask').classList.add('on');
  $('#helpSheet').classList.add('on');
}

function closeHelp() {
  $('#helpMask').classList.remove('on');
  $('#helpSheet').classList.remove('on');
}

/* ---------------- 快捷指令自动同步 ---------------- */

/**
 * iOS 快捷指令可以每天自动读取健康数据，然后打开形如
 *   ?watch=1&a=480&r=1580&s=9200
 * 的链接。这里把它接住，写进当天记录，再把参数从地址栏抹掉。
 */
function consumeHealthLink() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('watch')) return null;
    const g = k => {
      const v = u.searchParams.get(k);
      return (v === null || v === '') ? null : Number(v);
    };
    const active = g('a'), resting = g('r'), total = g('t'), steps = g('s');
    if (active === null && resting === null && total === null) return null;
    const date = u.searchParams.get('d') || todayISO();
    const d = Store.load();
    d.daily[date] = { active, resting, total, steps, source: 'shortcut' };
    Store.save();
    history.replaceState(null, '', u.pathname + u.hash);
    return date;
  } catch (e) {
    return null;
  }
}

/* ---------------- 云端同步（GitHub 上的 health.json） ---------------- */

/**
 * 快捷指令每天把「日期|活动能量」写进仓库根目录的 health.json。
 * 这里在打开 App 时拉一次，写进当天记录。
 * 日期可能是「2026-10-18」「2026/10/18」「2026年10月18日 22:09」等，
 * 统一宽松解析；实在解析不出来就当作今天。
 */
function parseLooseDate(s) {
  const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return isoOf(d);
  return null;
}

/* 最近一次从 health.json 读到的内容，给刷新提示用 */
let lastCloud = null;

/* 优先从 raw.githubusercontent 取（提交后几秒就有），失败再回落到 Pages 上的副本 */
async function fetchHealthText() {
  const urls = [
    'https://raw.githubusercontent.com/karenwang0013/calorie-ledger/main/health.json',
    'health.json',
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) continue;
      const t = (await res.text()).trim();
      if (t) return t;
    } catch (e) { /* 换下一个源 */ }
  }
  return '';
}

async function pullCloudData() {
  try {
    const txt = await fetchHealthText();
    if (!txt) return null;
    const sep = txt.includes('|') ? '|' : ',';
    const i = txt.lastIndexOf(sep);
    if (i < 0) return null;
    const head = txt.slice(0, i).trim();
    // 值可能是单个数字，也可能是多行/多列的数值列表，全部加起来
    const tail = String(txt.slice(i + 1)).replace(/(\d),(\d)/g, '$1$2');
    const nums = tail.match(/\d+(?:\.\d+)?/g) || [];
    const active = Math.round(nums.reduce((s, n) => s + Number(n), 0));
    if (!active || active <= 0) return null;
    const date = parseLooseDate(head) || todayISO();
    // 快捷指令写进去的时刻，用来告诉用户「这份数据是什么时候的」
    const tm = head.match(/(\d{1,2}):(\d{2})/);
    const at = tm ? `${date} ${String(tm[1]).padStart(2, '0')}:${tm[2]}` : date;
    const d = Store.load();
    const cur = d.daily[date] || {};
    const unchanged = cur.active === active && cur.source === 'cloud';
    d.daily[date] = Object.assign({}, cur, { active, source: 'cloud', cloudAt: at });
    if (!unchanged || cur.cloudAt !== at) Store.save();
    lastCloud = { date, active, at, changed: !unchanged };
    return unchanged ? null : date;
  } catch (e) {
    return null;
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  const synced = consumeHealthLink();
  $$('.tab').forEach(b => b.onclick = () => switchView(b.dataset.view));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 新版本接管后自动刷新一次，避免要关掉重开两遍才更新
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }
  $('#prevDay').onclick = () => { S.date = addDays(S.date, -1); loadDay(); };
  $('#nextDay').onclick = () => {
    if (S.date >= S.today) return;
    S.date = addDays(S.date, 1);
    loadDay();
  };
  $('#fab').onclick = () => openAdd();
  $('#addTop').onclick = () => openAdd();
  $('#addClose').onclick = closeAdd;
  $('#addMask').onclick = closeAdd;

  $$('#addTabs button').forEach(b => b.onclick = () => setAddMode(b.dataset.m));
  $('#photo2Cam').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#photo2Alb').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#del2').onclick = ev => {
    ev.stopPropagation();
    if (S.photo2URL) { URL.revokeObjectURL(S.photo2URL); S.photo2URL = null; }
    S.photo2Data = null;
    $('#pv2').removeAttribute('src');
    $('#pv2').hidden = true;
    $('#del2').hidden = true;
    $('#emptyB').hidden = false;
    saveDraft();
  };

  // 点两个照片框本身也能调起系统相册
  let pickTarget = 0;
  const pickFor = slot => { pickTarget = slot; $('#photoAlbum').click(); };
  $$('.pslot').forEach(el => el.onclick = ev => {
    if (ev.target.closest('[data-del]') || ev.target.closest('.shotdel')) return;
    pickFor(Number(el.dataset.slot) || 0);
  });
  $('#photoAlbum').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (pickTarget === 2) handlePhoto2(f); else handlePhoto(f);
    pickTarget = 0;
  };

  const pickCam = () => $('#photoInput').click();
  const pickAlb = () => $('#photoAlbum').click();
  $('#pickCamera').onclick = ev => { ev.stopPropagation(); pickCam(); };
  $('#pickAlbum').onclick = ev => { ev.stopPropagation(); pickAlb(); };
  $('#photoDel').onclick = ev => { ev.stopPropagation(); resetPhotoUI(); saveDraft(); };
  $('#photoInput').onchange = e => { handlePick(e.target.files[0]); e.target.value = ''; };
  $('#photoGo').onclick = runPhoto;
  $('#textGo').onclick = runText;
  $('#saveItems').onclick = saveItems;
  $('#resultReset').onclick = () => {
    S.items = [];
    resetPhotoUI();
    clearDraft();
    $('#resultArea').hidden = true;
    $('#addFoot').hidden = true;
  };

  let searchTimer = null;
  $('#searchInput').oninput = e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => runSearch(v), 120);
  };

  $$('#mealPick .chip').forEach(c => c.onclick = () => {
    S.meal = c.dataset.meal;
    renderMealPick();
  });

  const qw = $('#quickWatch');
  if (qw) qw.onclick = openWatch;
  const gm = $('#goMe');
  if (gm) gm.onclick = () => switchView(S.view === 'me' ? 'today' : 'me');
  const refreshBtn = $('#cloudRefresh');
  // 手动刷新时，如果还是旧数据，后台再自动补拉几次（GitHub Pages 发布要几十秒）
  let retryLeft = 0, retryBusy = false;
  async function retryPullCloud() {
    if (retryBusy || retryLeft <= 0) return;
    retryBusy = true;
    retryLeft--;
    setTimeout(async () => {
      const d = await pullCloudData();
      if (d) {
        retryLeft = 0; retryBusy = false;
        loadDay();
        toast(`✅ 已拿到新数据：${lastCloud.at.slice(5)} · 活动 ${lastCloud.active} 千卡`, 3000);
      } else if (retryLeft <= 0) {
        retryBusy = false;
      } else {
        retryPullCloud();
      }
    }, 20000);
  }

  async function pullNow() {
    if (!refreshBtn) return;
    refreshBtn.classList.add('spin');
    let date = null;
    try { date = await pullCloudData(); } catch (e) {}
    refreshBtn.classList.remove('spin');
    loadDay();
    const dd = Store.load().daily[S.today] || {};
    const c = lastCloud;
    if (date) { retryLeft = 0; toast(`✅ 已更新：${c.at.slice(5)} 云端数据 · 活动 ${c.active} 千卡`, 2800); }
    else if (c && c.at) {
      retryLeft = 3;
      retryPullCloud();
      toast(`✅ 现在是 ${c.at.slice(5)} 那份（活动 ${c.active} 千卡），后台帮你再等新数据`, 3200);
    }
    else if (dd.active) toast('已读取：活动消耗 ' + dd.active + ' 千卡', 2400);
    else toast('云端还没有今天的数据，先跑一次「热量采集」', 3000);
  }
  if (refreshBtn) refreshBtn.onclick = () => pullNow();  $('#watchClose').onclick = closeWatch;
  $('#watchMask').onclick = closeWatch;
  $('#watchSave').onclick = saveWatch;
  $('#watchPick').onclick = () => $('#watchInput').click();
  $('#watchInput').onchange = e => readWatchShot(e.target.files[0]);

  $('#weightClose').onclick = closeWeight;
  $('#weightMask').onclick = closeWeight;
  $('#weightSave').onclick = saveWeight;

  $('#helpClose').onclick = closeHelp;
  $('#helpMask').onclick = closeHelp;
  $('#grpClose').onclick = closeGroup;
  $('#grpMask').onclick = closeGroup;
  $('#grpRename').onclick = renameGroup;

  $$('#trendSeg button').forEach(b => b.onclick = () => {
    $$('#trendSeg button').forEach(x => x.classList.toggle('on', x === b));
    S.trendDays = Number(b.dataset.d);
    loadTrends();
  });

  // Safari 里打开的是独立副本，提醒一下，避免和主屏幕 App 的数字混淆
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) {
    const b = document.createElement('div');
    b.className = 'safariwarn';
    b.textContent = '你正在 Safari 里打开，这份数据是独立的副本，和主屏幕「热量账本」App 不互通。日常请在主屏幕打开。';
    document.querySelector('.app').prepend(b);
  }

  // 有弹层/卡片打开时锁住背后的页面滚动
  const syncLock = () => {
    const on = !!document.querySelector('.sheet.on, .modal.on');
    document.documentElement.classList.toggle('lock', on);
  };
  new MutationObserver(syncLock).observe(document.body, {
    attributes: true, subtree: true, attributeFilter: ['class'],
  });
  syncLock();

  // 注意：不要给顶栏加 transform 做「补偿」。
  // 之前这里用 offsetTop + scrollY 去位移顶栏，键盘弹起后每点一个更靠下的输入框就多叠一次，
  // 表现就是标题栏越来越往下、和内容之间的缺口越来越大。顶栏现在用 sticky，交给浏览器处理。

  // 手写滚动：不交给系统，顶栏绝对不会跟着动
  // 顶部导航固定 + 内容用「容器原生滚动」：
  // 之前手写 transform 滚动会让 iOS 不知道输入框的真实位置，聚焦时整页乱跳、顶栏跑到中间。
  const SC = { el: null, body: null };
  window.scTop = () => window.scrollTo(0, 0);
  window.scMeasure = () => {};
  const initScroll = () => {
    SC.el = document.getElementById('scroller');
    SC.body = document.getElementById('scBody');
    if (!SC.el || !SC.body) return;
    // 键盘弹起时：底部导航和加号直接收起来（否则 iOS 会把它顶到键盘上方浮动），
    // 顶栏用 sticky 交给浏览器钉住，不做任何 transform 位移。
    const activeInput = () => {
      const el = document.activeElement;
      return el && /^(INPUT|TEXTAREA)$/.test(el.tagName) ? el : null;
    };

    // 键盘弹起期间：允许往上滚（回看上面的内容），但不允许继续往下滚
    let kbOn = false;
    let kbMax = Infinity;
    // 统一处理"越界回弹"：滑到顶部/底部滑不动，而是直接停住（消掉果冻弹性）
    let clamping = false;
    const clamp = () => {
      if (clamping) return;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      let target = null;
      if (y < 0) target = 0;
      else if (y > max) target = max;
      if (kbOn) {
        if (!activeInput()) { kbOn = false; kbMax = Infinity; }   // 键盘已收起 → 解除限制
        else if (target === null && y > kbMax + 1) target = kbMax;
      }
      if (target !== null) {
        clamping = true;
        window.scrollTo(0, target);
        requestAnimationFrame(() => { clamping = false; });
      }
    };
    window.addEventListener('scroll', clamp, { passive: true });

    // 把整张卡片放到底边贴着键盘的位置
    // 这台设备不把"键盘压小了可视区"报给网页，所以按固定比例估算键盘高度：
    // 屏幕高度的 47% 留给键盘（含上方工具条），卡片底边永远停在它上面
    // 键盘预留比例：默认 0.50（正好在"压键盘"和"太靠上"之间）
    // 可在界面上用 ▲▼ 微调，调完自动记住，以你这台设备为准
    let KB_RATIO = (function () {
      const v = parseFloat(localStorage.getItem('kb_ratio'));
      return (isFinite(v) && v >= 0.30 && v <= 0.70) ? v : 0.50;
    })();
    // 记住上次的键盘高度：点下去之前就能算出"键盘弹起后该在哪"，从而一次到位，不产生二次位移
    let kbH = parseFloat(localStorage.getItem('kb_h'));
    if (!isFinite(kbH) || kbH < 200 || kbH > 600) kbH = 440;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const v = window.visualViewport;
        const h = window.innerHeight - v.height;
        if (h > 200) { kbH = Math.round(h); localStorage.setItem('kb_h', String(kbH)); }
      });
    }

    const centerFor = (t, keyboardH) => {
      const top = 96;
      const bottom = window.innerHeight - keyboardH;
      const centerScreen = (top + bottom) / 2;
      const r = t.getBoundingClientRect();
      const inputCenterDoc = r.top + window.scrollY + r.height / 2;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.max(0, Math.min(Math.round(inputCenterDoc - centerScreen), max));
    };

    // 手指一按下就先算好位：键盘起来后它已经在正中间，系统无需再滚 → 不会晃
    SC.el.addEventListener('touchstart', e => {
      const t = e.target;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      document.documentElement.classList.add('kb');
      void document.body.offsetHeight;
      window.scrollTo(0, centerFor(t, kbH));
    }, { passive: true });

    // 只做一件事：把正在编辑的那一栏，放到"顶栏下沿 ↔ 键盘上沿"这段区域的正中间
    const placeCard = (t) => {
      if (!t) return;
      document.documentElement.classList.add('kb');
      kbOn = true;
      void document.body.offsetHeight;          // 让底部预留先落地，滚动才够用

      const vv3 = window.visualViewport;
      // 键盘还没弹起来（可视区没被压小）时先不动，否则会先按全屏算一次、再按键盘算一次 → 上下弹一下
      if (vv3 && (window.innerHeight - vv3.height) < 100) return;

      const top = 96;                            // 顶栏下沿
      const bottom = vv3 ? (vv3.offsetTop + vv3.height) : window.innerHeight;
      const centerScreen = (top + bottom) / 2;   // 可视区域的垂直中心（屏幕坐标）

      const r = t.getBoundingClientRect();
      const inputCenterDoc = r.top + window.scrollY + r.height / 2;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const target = Math.round(inputCenterDoc - centerScreen);

      const want = Math.max(0, Math.min(target, max));
      // 位移超过 8px 才滚，而且用平滑滚动：看起来是一次顺滑的移动，而不是"弹一下"
      if (Math.abs(window.scrollY - want) > 14) {
        window.scrollTo({ top: want, behavior: 'smooth' });
      }
      kbMax = Infinity;
      (window.__placeLog = window.__placeLog || []).push(
        [new Date().toLocaleTimeString('zh-CN', { hour12: false }),
         'center ' + Math.round(centerScreen), 'target ' + target,
         'after ' + window.scrollY, 'vvH ' + Math.round((vv3 || {}).height || 0)].join(' | ')
      );
      if (window.__placeLog.length > 12) window.__placeLog.shift();
    };

    // 键盘还在动的时候会被多次调用，但每次都算同一个绝对目标，所以不会跳
    const placeWhenSettled = (t) => {
      [260, 700].forEach(ms => setTimeout(() => placeCard(t), ms));
      const vv3 = window.visualViewport;
      if (vv3) {
        const onResize = () => placeCard(t);
        vv3.addEventListener('resize', onResize);
        setTimeout(() => vv3.removeEventListener('resize', onResize), 1500);
      }
    };

    // 再点同一个输入框不会触发 focus，这里补一个点击兜底
    SC.el.addEventListener('click', e => {
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) placeWhenSettled(t);
    });

    // 聚焦输入框时：立刻把这一栏放到键盘上方（不等键盘动画结束）
    SC.el.addEventListener('focusin', e => {
      const t = e.target;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      // 用"是否有输入框在编辑"来判定键盘态，比读系统高度可靠
      document.documentElement.classList.add('kb');
      kbOn = true;
      placeWhenSettled(t);
    });
    document.addEventListener('focusout', () => {
      // 点同一个输入框时，iOS 可能先失焦再聚焦；这里等久一点再判断，
      // 否则键盘态被误判成"收起" → 底部预留消失 → 页面瞬时变短 → 卡片错位
      setTimeout(() => {
        const el = document.activeElement;
        if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        kbOn = false; kbMax = Infinity;
        document.documentElement.classList.remove('kb');
        const d = document.getElementById('kbDbg');
        if (d) d.remove();
        const t = document.getElementById('kbTune');
        if (t) t.remove();
      }, 700);
    });
  };

  // 左边缘拖动返回：卡片跟手滑动，松手决定回退还是弹回
  let sw = null;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t.clientX > 30) { sw = null; return; }
    const el = document.querySelector('.sheet.on') || document.querySelector('.modal.on');
    sw = el
      ? { el, x0: t.clientX, y0: t.clientY, dx: 0, active: false }
      : { el: null, x0: t.clientX, y0: t.clientY, dx: 0, active: false };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0;
    const dy = Math.abs(t.clientY - sw.y0);
    if (!sw.active) {
      if (dx < 8) return;
      if (dy > Math.abs(dx)) { sw = null; return; }   // 竖着滑，交给页面滚动
      sw.active = true;
      if (sw.el) sw.el.classList.add('dragging');
    }
    sw.dx = Math.max(0, dx);
    if (sw.el) {
      sw.el.style.transform = 'translateX(' + sw.dx + 'px)';
      sw.el.style.opacity = String(Math.max(0.55, 1 - sw.dx / 700));
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!sw) return;
    const { el, dx, active } = sw;
    sw = null;
    if (!active) return;
    if (el) el.classList.remove('dragging');
    if (dx > 100) {
      if (el) {
        el.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1), opacity .3s ease-out';
        el.style.transform = 'translateX(102%)';
        el.style.opacity = '0';
      }
      setTimeout(() => {
        if (el) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; }
        goBack();
      }, 270);
    } else if (el) {
      el.style.transition = 'transform .38s cubic-bezier(.32,.72,0,1), opacity .32s ease-out';
      el.style.transform = '';
      el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 400);
    } else {
      goBack();
    }
  }, { passive: true });

  // 顶栏改成 fixed：量出实际高度，给内容让出空间
  const syncTopH = () => {
    const tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', Math.round(tb.getBoundingClientRect().height) + 'px');
  };
  // 启动时把顶栏重绘一次：iOS 主屏幕 App 刚打开时会在状态栏区域压一层半透明底，
  // 重新合成这一层可以让它立刻消失，而不是要等一会儿
  const clearScrim = () => {
    const tb = document.querySelector('.topbar');
    if (!tb) return;
    tb.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => { tb.style.transform = ''; }));
  };
  setTimeout(clearScrim, 60);
  setTimeout(clearScrim, 600);
  setTimeout(clearScrim, 1600);
  window.addEventListener('pageshow', () => setTimeout(clearScrim, 80));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(clearScrim, 80); });

  const bt = $('#brandTag');
  if (bt) {
    bt.textContent = APP_VERSION;
    // 排查用：连点版本号 5 次，显示当前环境信息（再点一次关闭）
    let taps = 0, tapT = 0;
    bt.addEventListener('click', () => {
      const now = Date.now();
      taps = (now - tapT < 900) ? taps + 1 : 1;
      tapT = now;
      if (taps < 5) return;
      taps = 0;
      const vv = window.visualViewport;
      const tb = document.querySelector('.topbar');
      const cs = getComputedStyle(tb);
      const el = document.getElementById('scroller');
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:100px;z-index:9999;background:#000;color:#7dff8a;font:12px/1.6 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:10px;white-space:pre-wrap;border:1px solid #2c5';
      box.textContent = [
        ...((window.__placeLog || []).slice(-6)),
        '版本 ' + APP_VERSION,
        '独立模式 ' + (window.navigator.standalone === true),
        'innerH ' + innerHeight + ' / vvH ' + Math.round(vv ? vv.height : 0) + ' / off ' + Math.round(vv ? vv.offsetTop : 0) + ' / scale ' + (vv ? vv.scale : 0),
        'safe-t ' + getComputedStyle(document.documentElement).getPropertyValue('--safe-t'),
        '顶栏底色 ' + cs.backgroundColor,
        'body 底色 ' + getComputedStyle(document.body).backgroundColor,
        '滚动位置 ' + (el ? Math.round(el.scrollTop) : '-'),
        '顶栏高度 ' + Math.round(tb.getBoundingClientRect().height) + ' / top ' + Math.round(tb.getBoundingClientRect().top),
      ].join('\n');
      box.onclick = () => box.remove();
      document.body.appendChild(box);
    });
  }
  syncTopH();
  initScroll();
  window.addEventListener('resize', syncTopH);
  window.addEventListener('orientationchange', syncTopH);

  // 版本自检：线上版本变了就带随机参数重开，绕开缓存
  const checkVersion = async () => {
    try {
      const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.text()).trim();
      if (v && v !== APP_VERSION && !sessionStorage.getItem('ver-jump')) {
        sessionStorage.setItem('ver-jump', '1');
        location.replace(location.pathname + '?r=' + Date.now());
      }
    } catch (e) { /* 没网就算了 */ }
  };
  checkVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion();
  });

  applyTheme(Store.load().settings.theme || 'lime');

  // 有 token 的话，先拉云端：比本地新就覆盖，然后刷新界面
  if (typeof cloudToken === 'function' && cloudToken()) {
    cloudPull().then(r => {
      if (r === 'pulled') {
        applyTheme(Store.load().settings.theme || 'lime');
        loadDay();
        if (S.view === 'me') renderMe();
        toast('☁️ 已从云端恢复最新数据', 3000);
      }
    });
  }

  loadDay();
  if (synced) {
    setTimeout(() => toast('⌚ 已自动同步 ' + synced.slice(5) + ' 的手表数据', 3200), 700);
  }

  // 打开时拉一次云端数据（不阻塞界面）
  pullCloudData().then(date => {
    if (!date) return;
    loadDay();
    if (Store.load().settings.sync_toast !== false) {
      toast('⌚ 已同步 ' + date.slice(5) + ' 的手表数据', 2600);
    }
  });

  // 跨天检测：放在后台过夜，第二天打开要自动切到今天
  const checkDay = () => {
    const t = todayISO();
    if (t === S.today) return;
    S.today = t;
    S.date = t;
    loadDay();
  };
  setTimeout(checkDay, 1500);
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDay();
  });

  // 从后台切回来：立刻拉一次；没新数据就静默补拉几次（快捷指令刚写完时 Pages 还没发布）
  let lastPull = 0, autoN = 0;
  const autoCatchUp = () => {
    if (autoN >= 4) return;
    autoN++;
    setTimeout(async () => {
      const d = await pullCloudData();
      if (d) {
        autoN = 0;
        loadDay();
        toast('⌚ 已自动同步最新手表数据', 2600);
      } else {
        autoCatchUp();
      }
    }, 20000);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    lastPull = Date.now();
    pullCloudData().then(date => {
      if (date) { loadDay(); toast('⌚ 已读取手表数据', 2200); }
      else autoCatchUp();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
