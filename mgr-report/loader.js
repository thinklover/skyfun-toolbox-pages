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
    st: ['st', '狀態', 'displayStatus', 'applyStatus'],
    ct: ['ct', '委託類型', 'contratType', 'contractType'],
    ft: ['ft', '案件來源', 'contratFromType'],
    sl: ['sl', '業務', 'sales'],
    so: ['so', '營業處', 'salesOffice'],
    eu: ['eu', '業績歸屬業務', '業績歸屬', 'performanceUser'],
    eo: ['eo', '業績歸屬處', 'performanceOffice'],
    ls: ['ls', '起租日', 'leaseStart'],
    le: ['le', '迄租日', '租約迄日', 'leaseEnd'],
    i: ['i', '身分別', 'idClass', 'identityTypeName'],
    h: ['h', '房屋類型', 'houseType'],
    src: ['src', '媒合來源', 'matchSource', '來源'],
    nl: ['nl', '新件類別', 'hasExistingLease'],
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
    window.DASH_LOOKUP = {
      owners: lookup.owners || {},
      settlement: lookup.settlement || {},
      targets: lookup.targets || [],
      pending: '待設定'
    };
    window.DASH_FORECAST = lookup.forecast && lookup.forecast.rows ? lookup.forecast : { rows: [], pending: '待設定' };

    if (contracts.building) notices.push('合約資料更新中，目前顯示上一版');
    if (!extra.imported) notices.push('媒合來源、房屋類型：資料建置中，請先匯入 Excel');
    notices.push('目標、預估、結績日、處長對照：待設定');

    var bits = [
      '合約 ' + tw(contracts.fetchedAt),
      '人員 ' + tw(staff.fetchedAt),
      '欠款 ' + tw(arrears.fetchedAt),
      '續約 ' + tw(renewals.fetchedAt)
    ];
    if (extra.importedAt || extra.fetchedAt) bits.push('媒合補充 ' + tw(extra.importedAt || extra.fetchedAt));
    window.MGR_REPORT_STAMP = bits.join(' · ');
    window.MGR_REPORT_NOTICES = notices.filter(Boolean).join('。');
  }

  function startApp() {
    var s = document.createElement('script');
    s.src = 'app.js?v=189';
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

  function summarize(parsed) {
    var seen = Object.create(null);
    var dup = 0;
    var usable = 0;
    parsed.rows.forEach(function (row) {
      var id = String(row.id == null ? '' : row.id).trim();
      if (!id) return;
      usable += 1;
      if (seen[id]) dup += 1;
      seen[id] = true;
    });
    return { usable: usable, dup: dup, unique: Object.keys(seen).length };
  }

  function showPreview(parsed) {
    var sum = summarize(parsed);
    var byId = Object.create(null);
    var order = [];
    parsed.rows.forEach(function (row) {
      var id = String(row.id == null ? '' : row.id).trim();
      if (!id) return;
      if (!byId[id]) order.push(id);
      byId[id] = row;
    });
    pendingRows = order.map(function (id) { return byId[id]; });
    var lines = [
      '讀到 ' + parsed.rows.length + ' 列，有合約編號 ' + sum.usable + ' 列，不重複 ' + sum.unique + ' 筆。',
      sum.dup ? ('重複編號 ' + sum.dup + ' 筆，同一編號保留最後一列。') : '沒有重複編號。',
      parsed.unknown.length ? ('對不到的欄位：' + parsed.unknown.join('、')) : '表頭都對得到。'
    ];
    if (!sum.unique) lines.push('沒有合約編號，不能匯入。請確認表頭有「合約編號」或 id。');
    $('matchPreviewBody').textContent = lines.join('\n');
    $('matchPreviewOk').disabled = !sum.unique;
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
      $('matchPreviewBody').textContent = (err && err.message) || '匯入失敗';
      btn.disabled = false;
      btn.textContent = '確認匯入';
    }
  }

  function bindImport(user) {
    var team = String((user && (user.team || user.teamName)) || '').trim();
    var name = String((user && user.name) || '').trim();
    var gm = team === '總經理室' || name === '簡為倢' || name === '邱奕棋' || name === '黃怡婷';
    var btn = $('btnMatchImport');
    if (!gm || !btn) return;
    btn.hidden = false;
    btn.addEventListener('click', function () { $('matchFile').click(); });
    $('matchFile').addEventListener('change', function () {
      var file = $('matchFile').files && $('matchFile').files[0];
      $('matchFile').value = '';
      if (!file) return;
      readFile(file).catch(function (err) {
        window.alert((err && err.message) || '檔案讀不到');
      });
    });
    $('matchPreviewCancel').addEventListener('click', function () {
      pendingRows = null;
      $('matchPreview').hidden = true;
    });
    $('matchPreviewOk').addEventListener('click', confirmImport);
  }

  async function main() {
    if (window.parent !== window) {
      var back = $('mgrBack');
      if (back) back.hidden = true;
    }
    await waitAuth();
    var user = window.skyfunAuth && window.skyfunAuth.getUser && window.skyfunAuth.getUser();
    var allowed = window.skyfunAuth && window.skyfunAuth.canEnterBizSupervisor && window.skyfunAuth.canEnterBizSupervisor();
    if (!token() || !allowed) {
      showBlocked('業務主管專區僅限儲備處經理以上使用。');
      return;
    }
    bindImport(user);
    var notices = [];
    if ($('updateAt')) $('updateAt').textContent = '資料讀取中…';
    try {
      var pack = {};
      pack.contracts = await loadSafe('/api/mgr-report/contracts', emptyContracts(), '合約', notices);
      pack.staff = await loadSafe('/api/mgr-report/staff', { fetchedAt: null, hr: { staff: [] }, meta: { staff: [] } }, '人員', notices);
      pack.arrears = await loadSafe('/api/mgr-report/arrears', { fetchedAt: null, source: 'ArrearsManagement/Search', srcRecords: 0, rows: [] }, '應收帳款', notices);
      pack.renewals = await loadSafe('/api/mgr-report/renewals', { fetchedAt: null, n: 0, st: {}, rows: [] }, '續約', notices);
      pack.extra = await loadSafe('/api/mgr-report/match-extra', { fetchedAt: null, n: 0, rows: [], imported: false }, '媒合補充', notices);
      pack.lookup = await loadSafe('/api/mgr-report/lookup', { owners: {}, settlement: {}, targets: [], forecast: { rows: [] }, pending: '待設定' }, '目標', notices);
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
