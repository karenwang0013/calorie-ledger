// 生成 icons.js：Material Symbols Rounded **实心（-fill）** 图标库 + 每个位置的候选
// 用法：node tools/build-icons.mjs
// 说明：候选名单写在下面 CURATED 里；抓不到的（404）自动跳过，不会写空 path。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CACHE = '/tmp/ledger-test/iconcache';
fs.mkdirSync(CACHE, { recursive: true });
const CDN = 'https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@latest/rounded';

// ⚠️ 规矩（2026-10-26 用户定）：**某个功能被移除时，这里和 ICON_SLOTS 里对应的那一栏必须一起删掉**，
//    别让设置里还留着一个「已经不存在的位置」的图标可选（v9.95 删掉的就是「三格·描述」tab.text）。
const REMOVE_SLOTS = ['tab.text'];          // 功能已经没了的槽位（每次删功能都往这里加）
const REMOVE_DEFAULTS = ['tab.text', 'btn.text'];   // 已经没有元素用到的默认值

// 每个位置追加的实心候选（不含默认那个；名字是 Material Symbols 原名，脚本会自动加 -fill）
// btn.go 的说明里原来写着「拍照 / 描述共用」——「描述」已经没了，赶紧一并改掉
const LABEL_FIX = { 'btn.go': '按钮·识别热量（拍照页）' };

const CURATED = {
  'set.body': ['person', 'group', 'directions_walk', 'self_improvement', 'fitness_center', 'monitor_heart', 'sports_gymnastics', 'man', 'woman', 'accessibility_new'],
  'set.goal': ['gps_fixed', 'flag', 'flag_circle', 'local_fire_department', 'donut_small', 'sports_score', 'ads_click', 'my_location', 'bolt', 'track_changes'],
  'set.weight': ['monitor_weight', 'weight', 'scale', 'straighten', 'favorite', 'speed', 'monitor_heart', 'ecg_heart', 'body_fat', 'insights'],
  'set.ai': ['auto_awesome', 'psychology', 'smart_toy', 'neurology', 'auto_fix_high', 'document_scanner', 'photo_camera', 'center_focus_strong', 'cognition', 'lightbulb'],
  'set.theme': ['palette', 'brush', 'color_lens', 'format_paint', 'style', 'gradient', 'colorize', 'design_services', 'layers', 'imagesmode'],
  'set.notify': ['notifications', 'notifications_active', 'notifications_paused', 'notification_add', 'campaign', 'ring_volume', 'alarm', 'mark_chat_unread'],
  'set.backup': ['cloud_upload', 'database', 'cloud_done', 'cloud_sync', 'backup', 'save', 'settings_backup_restore', 'restore_page', 'history', 'cloud_download'],
  'set.about': ['info', 'system_update', 'update', 'verified', 'new_releases', 'article', 'help', 'support_agent', 'badge', 'task_alt'],
  'nlog.weight': ['monitor_weight', 'scale', 'weight', 'speed', 'straighten', 'monitor_heart'],
  'nlog.goal': ['local_fire_department', 'flag', 'warning', 'error', 'bolt', 'crisis_alert', 'speed'],
  'nlog.day': ['sticky_note_2', 'edit_note', 'note_add', 'event_note', 'calendar_month', 'checklist', 'assignment'],
  'nlog.watch': ['watch', 'watch_later', 'timer', 'alarm', 'monitor_heart', 'hourglass_bottom', 'sensors'],
  'nlog.fail': ['dangerous', 'report', 'error', 'warning', 'block', 'gpp_bad', 'sync_problem'],
  'st.sync': ['cached', 'sync', 'cloud_sync', 'refresh', 'update', 'autorenew', 'cloud_download', 'sync_problem'],
  'st.reload': ['refresh', 'restart_alt', 'autorenew', 'sync', 'cached', 'published_with_changes'],
  'st.bell': ['notifications', 'notifications_active', 'notifications_none', 'notifications_paused', 'campaign', 'ring_volume'],
  'st.gear': ['settings', 'settings_applications', 'tune', 'manage_accounts', 'build', 'construction', 'display_settings', 'manufacturing'],
  'dk.today': ['calendar_today', 'today', 'calendar_month', 'event', 'fact_check', 'view_day', 'event_available', 'edit_calendar'],
  'dk.add': ['edit_note', 'note_add', 'add_circle', 'post_add', 'edit', 'create', 'library_add', 'playlist_add'],
  'dk.trend': ['bar_chart', 'show_chart', 'insights', 'monitoring', 'trending_up', 'query_stats', 'stacked_line_chart', 'analytics'],
  'tab.photo': ['photo_camera', 'camera_alt', 'photo', 'add_a_photo', 'camera', 'photo_camera_front', 'party_mode'],
  'tab.search': ['travel_explore', 'search', 'manage_search', 'saved_search', 'public', 'language', 'explore'],
  'btn.cam': ['photo_camera', 'camera_alt', 'add_a_photo', 'camera', 'photo_camera_front', 'photo'],
  'btn.album': ['collections', 'photo_library', 'image', 'perm_media', 'wallpaper', 'burst_mode', 'add_photo_alternate', 'landscape'],
  'btn.save': ['bookmark_added', 'check', 'done', 'save', 'library_add_check', 'playlist_add_check', 'task_alt', 'bookmark_add'],
  'btn.go': ['local_fire_department', 'bolt', 'whatshot', 'calculate', 'auto_awesome', 'speed', 'rocket_launch', 'touch_app'],
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchPath(name) {
  const file = path.join(CACHE, name + '.svg');
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, 'utf8');
    return (txt.match(/<path d="([^"]+)"/) || [])[1] || '';
  }
  for (const variant of [`${name}-fill`, name]) {
    try {
      const r = await fetch(`${CDN}/${variant}.svg`);
      if (!r.ok) continue;
      const txt = await r.text();
      fs.writeFileSync(file, txt);
      const d = (txt.match(/<path d="([^"]+)"/) || [])[1] || '';
      if (d) return d;
    } catch (e) {}
  }
  fs.writeFileSync(file, '');
  return '';
}

// 读现在这份，保留已有路径/顺序/默认值
const src = fs.readFileSync('icons.js', 'utf8');
const box = { window: {} };
vm.createContext(box);
vm.runInContext(src, box);
const LIB = box.window.ICON_LIB;
const SLOTS = box.window.ICON_SLOTS.filter(s => !REMOVE_SLOTS.includes(s.k));
const DEFAULTS = box.window.ICON_DEFAULT;
for (const k of REMOVE_DEFAULTS) delete DEFAULTS[k];

let added = 0, miss = [];
for (const s of SLOTS) {
  if (LABEL_FIX[s.k]) s.label = LABEL_FIX[s.k];
  const extra = CURATED[s.k] || [];
  const out = [];
  for (const n of extra) {
    if (!LIB[n]) {
      const d = await fetchPath(n);
      if (!d) { miss.push(s.k + ':' + n); await sleep(60); continue; }
      LIB[n] = d;
      added++;
      await sleep(60);
    }
    if (n !== s.def && !out.includes(n)) out.push(n);
  }
  // 原来的候选保留在前，追加新的，最多 10 个
  const merged = [];
  for (const n of [...(s.opts || []), ...out]) {
    if (n === s.def || merged.includes(n) || !LIB[n]) continue;
    merged.push(n);
  }
  s.opts = merged.slice(0, 10);
}

const libKeys = Object.keys(LIB).sort();
const out = [];
out.push('/* 图标库 + 每个位置的默认值与候选（由 tools/build-icons.mjs 生成，别手改） */');
out.push('window.ICON_LIB = {');
out.push(libKeys.map(k => `${JSON.stringify(k)}: ${JSON.stringify(LIB[k])}`).join(',\n'));
out.push('};');
out.push('window.ICON_SLOTS = ' + JSON.stringify(SLOTS, null, 1) + ';');
out.push('window.ICON_DEFAULT = ' + JSON.stringify(DEFAULTS) + ';');
fs.writeFileSync('icons.js', out.join('\n') + '\n');

console.log('新图标', added, '个；库总数', libKeys.length);
console.log('抓不到的：', miss.join(', ') || '（无）');
console.log('每个位置候选数：');
console.log(SLOTS.map(s => s.k + '=' + s.opts.length).join('  '));
const empty = SLOTS.filter(s => s.opts.some(n => !LIB[n]));
console.log('候选里缺 path 的：', empty.length ? empty.map(s => s.k).join(',') : '（无）');
