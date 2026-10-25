// 一次改齐四处版本号：APP_VERSION / version.txt / sw.js 的 CACHE / index.html 的 ?v=
// 用法：node tools/bump.mjs 6.60     （会写成 v6.60，缓存号自动 +1）
import fs from 'node:fs';

const arg = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+$/.test(arg)) { console.error('用法: node tools/bump.mjs 6.60'); process.exit(1); }

const ver = 'v' + arg;
let app = fs.readFileSync('app.js', 'utf8');
let sw = fs.readFileSync('sw.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const oldApp = (app.match(/const APP_VERSION = 'v[\d.]+'/) || [])[0];
if (!oldApp) { console.error('app.js 里找不到 APP_VERSION'); process.exit(1); }
app = app.replace(oldApp, `const APP_VERSION = '${ver}'`);

const oldCache = (sw.match(/const CACHE = 'ledger-v(\d+)'/) || []);
if (!oldCache[1]) { console.error('sw.js 里找不到 CACHE'); process.exit(1); }
const cache = 'ledger-v' + (Number(oldCache[1]) + 1);
sw = sw.replace(/const CACHE = 'ledger-v\d+'/, `const CACHE = '${cache}'`);

const num = cache.replace('ledger-v', '');
html = html.replace(/style\.css\?v=\d+/g, 'style.css?v=' + num)
           .replace(/foods\.js\?v=\d+/g, 'foods.js?v=' + num)
           .replace(/icons\.js\?v=\d+/g, 'icons.js?v=' + num)
           .replace(/api\.js\?v=\d+/g, 'api.js?v=' + num)
           .replace(/app\.js\?v=\d+/g, 'app.js?v=' + num);

fs.writeFileSync('app.js', app);
fs.writeFileSync('sw.js', sw);
fs.writeFileSync('index.html', html);
fs.writeFileSync('version.txt', ver);
console.log(`已改齐：APP_VERSION=${ver} / version.txt=${ver} / CACHE=${cache} / index.html?v=${num}`);
