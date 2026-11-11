/**
 * 業務主管管報載入器。
 * 登入沿用工具箱 skyfunAuth。資料只向 skyfun-mgr-report Worker 要。
 * 部署後若帳號不同，可在這支檔之前設定 window.MGR_REPORT_API。
 */
(function () {
  'use strict';

  window.MGR_REPORT_API = window.MGR_REPORT_API || 'https://skyfun-mgr-report.dahwork123.workers.dev';

  /** 與 Worker MATCH_EXTRA_COLUMNS 保持一致。表頭對不到時，改這一張。 */
  var MATCH_EXTRA_COLUMNS = {
    id: ['id', '合約編號', '合約ID', '合約id', 'contractId', 'ContractId'],
    n: ['n', '媒合編號', 'matchNo', 'MatchNo'],
    st: ['st', '狀態', '資料狀態', 'displayStatus', 'applyStatus'],
    ct: ['ct', '委託類型', '委託型式', 'contratType', 'contractType'],
    ft: ['ft', '案件來源', '案件類型', 'contratFromType'],
    sl: ['sl', '業務', 'sales'],
    so: ['so', '營業處', 'salesOffice'],
    eu: ['eu', '業績歸屬業務', '業績歸屬', 'performanceUser'],
    eo: ['eo', '業績歸屬處', 'performanceOffice'],
    ls: ['ls', '起租日', '租約起日', 'leaseStart'],
    le: ['le', '迄租日', '租約迄日', 'leaseEnd'],
    i: ['i', '身分別', 'idClass', 'identityTypeName'],
    h: ['h', '房屋類型', 'houseType'],
    src: ['src', '媒合來源', 'matchSource', '來源'],
    nl: ['nl', '新件類別', '是否帶租約', 'hasExistingLease'],
    fam: ['fam', '家庭', 'family'],
    cd: ['cd'],
    cls: ['cls'],
    cle: ['cle']
  };

  var pendingRows = null;

  function $(id) { return document.getElementById(id); }

  function apiBase() {
    return String(window.MGR_REPORT_API || '').replace(/\/$/, '');
  }

  function tw(iso) {
    if (!iso) return '無';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '無';
    return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  }

  function rocYM(ls) {
    var m = String(ls || '').match(/^(\d{2,3})\/(\d{1,2})/);
    if (!m) return { y: 0, m: 0 };
    return { y: +m[1], m: +m[2] };
  }

  function perfOf(r) {
    var ym = rocYM(r.ls);
    return { id: r.id, st: r.st, ct: r.ct, ft: r.ft, so: r.so, sl: r.sl, y: ym.y, m: ym.m, ls: r.ls, n: r.n };
  }

  function waitAuth() {
    return new Promise(function (resolve) {
      if (window.skyfunAuth && window.skyfunAuth.isReady && window.skyfunAuth.isReady()) {
        resolve();
        return;
      }
      var timer = setTimeout(resolve, 8000);
      document.addEventListener('skyfun-auth-ready', function () {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  function showBlocked(text) {
    document.body.innerHTML = '<main style="max-width:36rem;margin:4rem auto;padding:1.5rem;font-family:sans-serif;line-height:1.6"><p>' + text + '</p><p><a href="../index.html">返回工具箱</a></p></main>';
  }

  function token() {
    return (window.skyfunAuth && window.skyfunAuth.getToken && window.skyfunAuth.getToken()) || '';
  }

  function authHeaders() {
    return { 'X-Skyfun-Session': token() };
  }

  async function getJson(path) {
    var base = apiBase();
    if (!base) throw new Error('管報服務網址尚未設定');
    var res = await fetch(base + path, { headers: authHeaders(), cache: 'no-store' });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401 || res.status === 403) {
      var err = new Error((data && data.error) || '業務主管專區僅限儲備處經理以上使用。');
      err.status = res.status;
      throw err;
    }
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || ('讀取失敗 ' + res.status));
    }
    return data;
  }

  function emptyContracts() {
    return { fetchedAt: null, n: 0, rows: [], building: false };
  }

  async function loadSafe(path, fallback, label, notices) {
    try {
      return await getJson(path);
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) throw err;
      notices.push(label + '資料暫時讀不到');
      return fallback;
    }
  }

  async function loadLocalLookup() {
    try {
      var res = await fetch('./lookup-data.json?v=20261111');
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function loadLookup(notices) {
    var empty = { owners: {}, settlement: {}, targets: [], forecast: { rows: [] }, pending: '待設定' };
    var fromApi = await loadSafe('/api/mgr-report/lookup', null, '目標', notices);
    var hasApi = !!(fromApi && Array.isArray(fromApi.targets) && fromApi.targets.length);
    if (hasApi) return fromApi;
    var local = await loadLocalLookup();
    if (local && Array.isArray(local.targets) && local.targets.length) {
      return {
        ok: true,
        owners: local.owners || {},
        settlement: local.settlement || {},
        targets: local.targets || [],
        forecast: local.forecast || { rows: [] }
      };
    }
    return fromApi || empty;
  }

  function applyData(pack, notices) {
    var contracts = pack.contracts || emptyContracts();
    var rows = Array.isArray(contracts.rows) ? contracts.rows : [];
    var perfRows = rows.map(perfOf);
    var idClass = {};
    var nlClass = {};
    rows.forEach(function (r) {
      if (!r || r.id == null) return;
      if (r.i) idClass[r.id] = r.i;
      if (r.nl != null && r.nl !== '') nlClass[r.id] = r.nl;
    });
    var staff = pack.staff || {};
    var arrears = pack.arrears || { fetchedAt: null, source: 'ArrearsManagement/Search', srcRecords: 0, rows: [] };
    var renewals = pack.renewals || { fetchedAt: null, n: 0, st: {}, rows: [] };
    var extra = pack.extra || { fetchedAt: null, n: 0, rows: [], imported: false };
    var lookup = pack.lookup || { owners: {}, settlement: {}, targets: [], forecast: { rows: [] }, pending: '待設定' };

    window.CONTRACTS = rows;
    window.CONTRACTS_META = {
      fetchedAt: contracts.fetchedAt || null,
      refreshedAt: contracts.fetchedAt || null,
      n: rows.length,
      source: 'skyfunsystem.com/Contrat/SearchContracts'
    };
    window.SKYFUN_PERF = {
      fetchedAt: contracts.fetchedAt || null,
      source: 'skyfunsystem.com/Contrat/SearchContracts',
      by: 'leaseStartDate',
      n: perfRows.length,
      rows: perfRows
    };
    window.STAFF_HR = staff.hr || { fetchedAt: staff.fetchedAt || null, staff: [] };
    window.STAFF_META = staff.meta || { fetchedAt: staff.fetchedAt || null, staff: [] };
    window.ARREARS = {
      fetchedAt: arrears.fetchedAt || null,
      source: arrears.source || 'ArrearsManagement/Search',
      srcRecords: arrears.srcRecords || (arrears.rows || []).length,
      rows: arrears.rows || []
    };
    window.RENEWALS = {
      fetchedAt: renewals.fetchedAt || null,
      n: renewals.n || (renewals.rows || []).length,
      st: renewals.st || {},
      rows: renewals.rows || []
    };
    window.MATCH_EXTRA = {
      fetchedAt: extra.fetchedAt || extra.importedAt || null,
      n: extra.n || (extra.rows || []).length,
      rows: extra.rows || []
    };
    window.MATCH_ROWS = [];
    window.ID_CLASS = idClass;
    window.NL_CLASS = nlClass;
    var hasTargets = !!(lookup.targets && lookup.targets.length);
    var hasOwners = !!(lookup.owners && Object.keys(lookup.owners).length);
    var hasSettlement = !!(lookup.settlement && Object.keys(lookup.settlement).length);
    var hasForecast = !!(lookup.forecast && lookup.forecast.rows && lookup.forecast.rows.length);
    window.DASH_LOOKUP = {
      owners: lookup.owners || {},
      settlement: lookup.settlement || {},
      targets: lookup.targets || [],
      pending: hasTargets || hasOwners || hasSettlement ? '' : '待設定'
    };
    window.DASH_FORECAST = hasForecast
      ? lookup.forecast
      : { rows: [], pending: '待設定' };

    if (contracts.building) notices.push('合約資料更新中，目前顯示上一版');
    if (!extra.imported) notices.push('媒合來源、房屋類型：資料建置中');
    if (!hasTargets || !hasOwners || !hasSettlement) notices.push('目標、預估、結績日、處長對照：待設定');

    window.MGR_REPORT_STAMP = '';
    window.MGR_REPORT_NOTICES = notices.filter(Boolean).join('。');
  }

  function startApp() {
    var s = document.createElement('script');
    s.src = 'app.js?v=190';
    document.body.appendChild(s);
  }

  window.mgrReportRefresh = async function () {
    var data = await getJson('/api/mgr-report/refresh');
    return data;
  };

  function headerField(name) {
    var want = String(name || '').replace(/^\uFEFF/, '').trim().toLowerCase();
    var keys = Object.keys(MATCH_EXTRA_COLUMNS);
    for (var i = 0; i < keys.length; i++) {
      var field = keys[i];
      var aliases = MATCH_EXTRA_COLUMNS[field];
      for (var j = 0; j < aliases.length; j++) {
        if (String(aliases[j]).toLowerCase() === want) return field;
      }
    }
    return '';
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var s = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function rowsFromMatrix(matrix) {
    if (!matrix.length) return { headers: [], rows: [], unknown: [] };
    var headers = matrix[0].map(function (h) { return String(h == null ? '' : h).replace(/^\uFEFF/, '').trim(); });
    var unknown = [];
    headers.forEach(function (h) {
      if (h && !headerField(h) && unknown.indexOf(h) < 0) unknown.push(h);
    });
    var rows = [];
    for (var r = 1; r < matrix.length; r++) {
      var line = matrix[r] || [];
      if (!line.some(function (v) { return String(v == null ? '' : v).trim() !== ''; })) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var field = headerField(headers[c]);
        if (!field) continue;
        obj[field] = line[c] == null ? '' : line[c];
      }
      rows.push(obj);
    }
    return { headers: headers, rows: rows, unknown: unknown };
  }

  function showPreview(parsed) {
    var seen = Object.create(null);
    var stored = Object.create(null);
    var order = [];
    var dup = 0;
    var skipped = 0;
    var usedId = false;
    var usedMatchNo = false;
    parsed.rows.forEach(function (row) {
      var id = String(row.id == null ? '' : row.id).trim();
      var matchNo = String(row.n == null ? '' : row.n).trim();
      var key = id || matchNo;
      if (!key) { skipped += 1; return; }
      if (id) usedId = true;
      else usedMatchNo = true;
      if (seen[key]) dup += 1;
      else order.push(key);
      seen[key] = true;
      var copy = Object.assign({}, row);
      if (!id) copy.id = matchNo;
      stored[key] = copy;
    });
    pendingRows = order.map(function (key) { return stored[key]; });
    var lines = ['讀到 ' + parsed.rows.length + ' 列，可匯入 ' + order.length + ' 筆。'];
    if (!usedId && usedMatchNo) lines.push('這份沒有合約編號，改用媒合編號對應。');
    else if (usedId && usedMatchNo) lines.push('有合約編號的用合約編號，沒有的改用媒合編號。');
    if (dup) lines.push('重複 ' + dup + ' 筆，同一編號保留最後一列。');
    if (skipped) lines.push(skipped + ' 列沒有合約編號也沒有媒合編號，已略過。');
    if (parsed.unknown.length) {
      var hasPrivate = parsed.unknown.some(function (name) { return /電話|地址|房東|房客/.test(name); });
      lines.push('其餘 ' + parsed.unknown.length + ' 個欄位不會匯入。' + (hasPrivate ? '地址、電話和姓名不會寫進系統。' : ''));
    }
    if (!order.length) lines.push('不能匯入。表頭需要「合約編號」或「媒合編號」。');
    else lines.push('代管營業處、業務營業處、簽約營業處先不當成業績歸屬。');
    $('matchPreviewBody').textContent = lines.join('\n');
    var ok = $('matchPreviewOk');
    ok.disabled = !order.length;
    ok.textContent = '確認匯入';
    $('matchPreview').hidden = false;
  }

  async function readFile(file) {
    var name = String(file.name || '').toLowerCase();
    if (name.endsWith('.csv') || file.type === 'text/csv') {
      var text = await file.text();
      showPreview(rowsFromMatrix(parseCsv(text)));
      return;
    }
    await new Promise(function (resolve, reject) {
      if (window.XLSX) { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Excel 讀取程式載入失敗')); };
      document.head.appendChild(s);
    });
    var buf = await file.arrayBuffer();
    var book = window.XLSX.read(buf, { type: 'array' });
    var sheet = book.Sheets[book.SheetNames[0]];
    var matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    showPreview(rowsFromMatrix(matrix));
  }

  async function confirmImport() {
    var rows = pendingRows || [];
    if (!rows.length) return;
    var btn = $('matchPreviewOk');
    btn.disabled = true;
    var base = apiBase();
    var sent = 0;
    try {
      for (var i = 0; i < rows.length; i += 500) {
        var batch = rows.slice(i, i + 500);
        var res = await fetch(base + '/api/mgr-report/match-extra/import', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            rows: batch,
            mode: i === 0 ? 'replace' : 'append',
            done: i + 500 >= rows.length
          })
        });
        var data = await res.json().catch(function () { return null; });
        if (res.status === 404) {
          throw new Error('報表服務還沒上線，這份檔案還在你的電腦，沒有寫進系統。');
        }
        if (!res.ok || !data || data.ok === false) {
          throw new Error((data && data.error) || ('匯入失敗 ' + res.status));
        }
        sent += batch.length;
        btn.textContent = '匯入中 ' + sent + '/' + rows.length;
      }
      $('matchPreview').hidden = true;
      pendingRows = null;
      location.reload();
    } catch (err) {
      var msg = (err && err.message) || '匯入失敗';
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        msg = '報表服務還沒上線，連不上。這份檔案還在你的電腦，沒有寫進系統。';
      }
      $('matchPreviewBody').textContent = msg;
      btn.disabled = false;
      btn.textContent = '確認匯入';
    }
  }

  async function main() {
    if (window.parent !== window) {
      var back = $('mgrBack');
      if (back) back.hidden = true;
    }
    await waitAuth();
    var allowed = window.skyfunAuth && window.skyfunAuth.canEnterBizSupervisor && window.skyfunAuth.canEnterBizSupervisor();
    if (!token() || !allowed) {
      showBlocked('業務主管專區僅限儲備處經理以上使用。');
      return;
    }
    var notices = [];
    try {
      var pack = {};
      pack.contracts = await loadSafe('/api/mgr-report/contracts', emptyContracts(), '合約', notices);
      pack.staff = await loadSafe('/api/mgr-report/staff', { fetchedAt: null, hr: { staff: [] }, meta: { staff: [] } }, '人員', notices);
      pack.arrears = await loadSafe('/api/mgr-report/arrears', { fetchedAt: null, source: 'ArrearsManagement/Search', srcRecords: 0, rows: [] }, '應收帳款', notices);
      pack.renewals = await loadSafe('/api/mgr-report/renewals', { fetchedAt: null, n: 0, st: {}, rows: [] }, '續約', notices);
      pack.extra = await loadSafe('/api/mgr-report/match-extra', { fetchedAt: null, n: 0, rows: [], imported: false }, '媒合補充', notices);
      pack.lookup = await loadLookup(notices);
      applyData(pack, notices);
      startApp();
    } catch (err) {
      showBlocked((err && err.message) || '業務主管專區僅限儲備處經理以上使用。');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { main(); });
  } else {
    main();
  }
})();
