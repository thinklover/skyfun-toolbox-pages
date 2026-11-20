# Sync 開發/match-dashboard → mgr-report (+ lookup) for toolbox preview.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\sync-mgr-from-dev.ps1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path (Split-Path -Parent $Root) '開發\match-dashboard'
$Dst = Join-Path $Root 'mgr-report'
$WorkerLookup = Join-Path $Root 'workers\skyfun-mgr-report\src\lookup-data.js'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'

if (-not (Test-Path -LiteralPath $Src)) { Write-Error "找不到 $Src" }

Write-Host ">> copy app.js / styles.css"
Copy-Item -LiteralPath (Join-Path $Src 'app.js') -Destination (Join-Path $Dst 'app.js') -Force
Copy-Item -LiteralPath (Join-Path $Src 'styles.css') -Destination (Join-Path $Dst 'styles.css') -Force
if (Test-Path -LiteralPath (Join-Path $Src 'counties-10t.json')) {
  Copy-Item -LiteralPath (Join-Path $Src 'counties-10t.json') -Destination (Join-Path $Dst 'counties-10t.json') -Force
}

Write-Host ">> rebuild index.html (keep toolbox auth/loader)"
$html = [IO.File]::ReadAllText((Join-Path $Src 'index.html'), [Text.UTF8Encoding]::new($false))
$html = $html -replace 'href="styles\.css\?v=\d+"', "href=`"styles.css?v=$Stamp`""
# top actions: keep updateAt/prog from 開發, add mgrBack
$html = $html -replace '(?s)(<div class="top-actions">\s*)(<div class="update-wrap">)',
  '$1<a id="mgrBack" href="#" class="update-btn" style="text-decoration:none">← 返回業務主管專區</a>`n        $2'
# replace local data scripts with toolbox loader
$loaderBlock = @"
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../js/supabase-config.js"></script>
  <script src="../js/toolbox-auth.js"></script>
  <script src="loader.js?v=$Stamp"></script>
"@
$html = [regex]::Replace($html, '(?s)<script src="contracts-meta\.js">.*?</script>\s*<script src="app\.js[^"]*"></script>', $loaderBlock.TrimEnd())
[IO.File]::WriteAllText((Join-Path $Dst 'index.html'), $html, [Text.UTF8Encoding]::new($false))

Write-Host ">> rebuild lookup-data from lookup.js + forecast.js"
node --input-type=module -e @"
import fs from 'fs';
const src = process.argv[1];
const dst = process.argv[2];
const workerLookup = process.argv[3];
function loadAssign(file, name) {
  const s = fs.readFileSync(src + '/' + file, 'utf8');
  const m = s.match(new RegExp('window\\\\.' + name + '\\\\s*=\\\\s*([\\\\s\\\\S]*);\\\\s*$'));
  if (!m) throw new Error('parse fail ' + file);
  return JSON.parse(m[1]);
}
const lookup = loadAssign('lookup.js', 'DASH_LOOKUP');
const forecast = loadAssign('forecast.js', 'DASH_FORECAST');
const out = {
  ok: true,
  owners: lookup.owners || {},
  settlement: lookup.settlement || {},
  targets: lookup.targets || [],
  forecast: forecast
};
const json = JSON.stringify(out);
fs.writeFileSync(dst + '/lookup-data.json', json);
fs.writeFileSync(workerLookup, 'export const LOOKUP_DATA = ' + json + ';\n');
console.log('lookup ok targets=' + (out.targets||[]).length + ' forecastRows=' + ((forecast.rows||[]).length));
"@ $Src $Dst $WorkerLookup

Write-Host ">> bump loader app.js cache"
$loaderPath = Join-Path $Dst 'loader.js'
$loader = [IO.File]::ReadAllText($loaderPath, [Text.UTF8Encoding]::new($false))
$loader = [regex]::Replace($loader, "s\.src = 'app\.js\?v=[^']+';", "s.src = 'app.js?v=$Stamp';")
$loader = [regex]::Replace($loader, "lookup-data\.json\?v=[^'\"]+", "lookup-data.json?v=$Stamp")
# after app load, rebind 更新 → Worker refresh
if ($loader -notmatch 'mgrReportBindUpdate') {
  $loader = $loader -replace 'function startApp\(\) \{\s*var s = document\.createElement\(''script''\);\s*s\.src = ''app\.js\?v=[^'']+'';\s*document\.body\.appendChild\(s\);\s*\}', @"
function startApp() {
    var s = document.createElement('script');
    s.src = 'app.js?v=$Stamp';
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
  }
"@
}
[IO.File]::WriteAllText($loaderPath, $loader, [Text.UTF8Encoding]::new($false))

Write-Host "done stamp=$Stamp"
