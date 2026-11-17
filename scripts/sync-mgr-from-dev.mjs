/**
 * Sync 開發/match-dashboard → mgr-report (+ Worker lookup) for toolbox preview.
 * node scripts/sync-mgr-from-dev.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.resolve(root, '..', '開發', 'match-dashboard');
const dst = path.join(root, 'mgr-report');
const workerLookup = path.join(root, 'workers', 'skyfun-mgr-report', 'src', 'lookup-data.js');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);

function mustExist(p) {
  if (!fs.existsSync(p)) throw new Error('找不到 ' + p);
}

function loadWindowJson(file, name) {
  const s = fs.readFileSync(path.join(src, file), 'utf8');
  const re = new RegExp('window\\.' + name + '\\s*=\\s*');
  const m = s.match(re);
  if (!m) throw new Error('parse fail ' + file + ' ' + name);
  let json = s.slice(m.index + m[0].length).trim();
  if (json.endsWith(';')) json = json.slice(0, -1);
  return JSON.parse(json);
}

mustExist(src);
console.log('>> copy app.js / styles.css / counties');
fs.copyFileSync(path.join(src, 'app.js'), path.join(dst, 'app.js'));
fs.copyFileSync(path.join(src, 'styles.css'), path.join(dst, 'styles.css'));
const counties = path.join(src, 'counties-10t.json');
if (fs.existsSync(counties)) fs.copyFileSync(counties, path.join(dst, 'counties-10t.json'));

console.log('>> rebuild index.html');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace(/href="styles\.css\?v=\d+"/, `href="styles.css?v=${stamp}"`);
if (!html.includes('id="mgrBack"')) {
  html = html.replace(
    /(<div class="top-actions">\s*)/,
    `$1<a id="mgrBack" href="#" class="update-btn" style="text-decoration:none">← 返回業務主管專區</a>\n        `
  );
}
const loaderBlock = `  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../js/supabase-config.js"></script>
  <script src="../js/toolbox-auth.js"></script>
  <script src="loader.js?v=${stamp}"></script>`;
html = html.replace(
  /<script src="contracts-meta\.js"><\/script>[\s\S]*?<script src="app\.js[^"]*"><\/script>/,
  loaderBlock
);
fs.writeFileSync(path.join(dst, 'index.html'), html, 'utf8');

console.log('>> rebuild lookup-data');
const lookup = loadWindowJson('lookup.js', 'DASH_LOOKUP');
const forecast = loadWindowJson('forecast.js', 'DASH_FORECAST');
const out = {
  ok: true,
  owners: lookup.owners || {},
  settlement: lookup.settlement || {},
  targets: lookup.targets || [],
  forecast
};
const json = JSON.stringify(out);
fs.writeFileSync(path.join(dst, 'lookup-data.json'), json);
fs.writeFileSync(workerLookup, `export const LOOKUP_DATA = ${json};\n`);
console.log('lookup targets=%d forecastRows=%d', (out.targets || []).length, (forecast.rows || []).length);

console.log('>> patch loader.js cache + update button');
let loader = fs.readFileSync(path.join(dst, 'loader.js'), 'utf8');
loader = loader.replace(/s\.src = 'app\.js\?v=[^']+'/, `s.src = 'app.js?v=${stamp}'`);
loader = loader.replace(/lookup-data\.json\?v=[^'"]+/, `lookup-data.json?v=${stamp}`);

if (!loader.includes('function mgrReportBindUpdate')) {
  loader = loader.replace(
    /function startApp\(\) \{\s*var s = document\.createElement\('script'\);\s*s\.src = 'app\.js\?v=[^']+';\s*document\.body\.appendChild\(s\);\s*\}/,
    `function startApp() {
    var s = document.createElement('script');
    s.src = 'app.js?v=${stamp}';
    s.onload = function () { mgrReportBindUpdate(); };
    document.body.appendChild(s);
  }

  function mgrReportBindUpdate() {
    var btn = $('btnUpdate');
    if (!btn) return;
    btn.title = '向公司系統重建快照';
    btn.onclick = async function () {
      if (btn.disabled) return;
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = '更新中…';
      try {
        await window.mgrReportRefresh();
        location.reload();
      } catch (err) {
        alert((err && err.message) || '更新失敗');
        btn.disabled = false;
        btn.textContent = old || '更新';
      }
    };
  }`
  );
}
fs.writeFileSync(path.join(dst, 'loader.js'), loader, 'utf8');
console.log('done stamp=%s', stamp);
