/**
 * 業務專區 › 離職交接
 * 公司系統契約自動抓取 + Worker 合併 + 可選匯入；進度 localStorage + Supabase 雲端同步；匯出 CSV。
 */
(function (global) {
  'use strict';

  const RPA_BASE = String(
    global.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev'
  ).replace(/\/$/, '');
  const HANDOVER_RPA_BASE = String(
    global.SKYFUN_HANDOVER_RPA_BASE || 'https://skyfun-arrears-rpa-preview.dahwork123.workers.dev'
  ).replace(/\/$/, '');
  const LS_KEY = 'skyfun-biz-handover-v1';
  const ROOT_ID = 'biz-handover-root';
  const PAGE_ID = 'page-business-handover';
  const KIND = 'biz';
  const COMPANY_SOURCE = '公司系統契約';

  const CHECKS = [
    { key: 'sysTransfer', short: '系統改接手', label: '系統已改／註記接手業務（或公司件）' },
    { key: 'lineHandover', short: 'LINE 交接', label: '房東／房客 LINE 或群組已交接' },
    { key: 'keysDocs', short: '鑰匙文件', label: '鑰匙／合約／重要文件已點交' },
    { key: 'arrearsRenew', short: '欠租續約', label: '欠租／續約意向已說明' },
    { key: 'repairCancel', short: '修繕註銷', label: '未結修繕／註銷狀態已交代' }
  ];

  const SENSITIVE_RE =
    /身分證|居留證|證照號|證號|idno|tenantidno|license|passport|統一編號|密碼|secret|token|apikey/i;

  const COL_ALIASES = {
    matchNo: ['媒合編號', '媒合號', '案號', '合約編號', 'matchno', 'match_no', 'caseno', 'caseid', 'case_id', 'no'],
    city: ['縣市', '物件縣市', '城市', 'city', 'region'],
    address: ['地址', '租賃地址', '物件地址', '住址', 'address'],
    landlord: ['房東', '出租人', 'landlord', 'landlordname'],
    tenant: ['房客', '承租人', 'tenant', 'tenantname'],
    leaseStart: ['租期起', '起租日', '契約起日', '起日', 'leasestart', 'lease_start', 'start'],
    leaseEnd: ['租期迄', '迄日', '到期日', '契約迄日', 'leaseend', 'lease_end', 'end'],
    status: ['狀態', '合約狀態', '續約狀態', 'status'],
    sales: ['業務', '業務姓名', '星鴻業務', '承辦業務', 'sales', 'agent', 'agentname', 'staff']
  };

  let state = {
    leaveName: '',
    batchAssignee: '',
    importRows: [],
    workerRows: [],
    companyRows: [],
    companyTotal: 0,
    companyStatus: '',
    companyErr: false,
    companyLoading: false,
    merged: [],
    progress: loadProgress(),
    loading: false,
    loadStatus: '',
    inlineErr: '',
    workerNote: '',
    msg: '',
    msgErr: false,
    syncNotice: '',
    syncErr: false,
    filter: 'all',
    expanded: Object.create(null),
    mounted: false
  };

  const cloudTimers = Object.create(null);

  function token() {
    try {
      return (global.skyfunAuth && global.skyfunAuth.getToken && global.skyfunAuth.getToken()) || '';
    } catch (_) {
      return '';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normName(s) {
    return String(s || '')
      .trim()
      .replace(/\s+/g, '');
  }

  function normKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]/g, '');
  }

  function caseKey(row) {
    const k = String(row.matchNo || row.caseId || row.no || '').trim();
    return k || '';
  }

  function addrKey(row) {
    const a = normKey(row && row.address);
    return a ? 'addr:' + a : '';
  }

  /** 同地址合併後，進度以地址為主鍵（沒地址才用媒合編號） */
  function progressKey(row) {
    return addrKey(row) || caseKey(row) || '';
  }

  function collectMatchNos(row) {
    const set = new Set();
    (row.matchNos || []).forEach((n) => {
      const s = String(n || '').trim();
      if (s) set.add(s);
    });
    String(row.matchNo || '')
      .split(/[／/|,;、]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => set.add(s));
    const single = caseKey(row);
    if (single && !/[／/]/.test(single)) set.add(single);
    return [...set];
  }

  function preferText(a, b) {
    const x = String(a || '').trim();
    const y = String(b || '').trim();
    if (!x) return y;
    if (!y) return x;
    if (x === y || x.includes(y)) return x;
    if (y.includes(x)) return y;
    return x + '／' + y;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { cases: {} };
      const o = JSON.parse(raw);
      return { cases: o && o.cases && typeof o.cases === 'object' ? o.cases : {} };
    } catch (_) {
      return { cases: {} };
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), cases: state.progress.cases }));
    } catch (_) {
      /* ignore quota */
    }
  }

  function progressOf(key) {
    if (!key) return { assignee: '', checks: {}, note: '' };
    const p = state.progress.cases[key] || {};
    return {
      assignee: p.assignee || '',
      checks: p.checks && typeof p.checks === 'object' ? p.checks : {},
      note: p.note || ''
    };
  }

  function setAssignee(key, name) {
    if (!key) return;
    const cur = progressOf(key);
    state.progress.cases[key] = {
      assignee: String(name || '').trim(),
      checks: cur.checks,
      note: cur.note || ''
    };
    saveProgress();
    scheduleCloudSet(key);
  }

  function setCheck(key, checkKey, on) {
    if (!key) return;
    const cur = progressOf(key);
    const checks = Object.assign({}, cur.checks);
    if (on) checks[checkKey] = true;
    else delete checks[checkKey];
    state.progress.cases[key] = { assignee: cur.assignee, checks: checks, note: cur.note || '' };
    saveProgress();
    scheduleCloudSet(key);
  }

  function paintSyncNotice() {
    const el = document.getElementById('bh-sync');
    if (!el) return;
    el.textContent = state.syncNotice || '';
    el.className =
      'text-xs ' + (state.syncErr ? 'text-amber-800 font-semibold' : 'text-emerald-700 font-semibold');
    el.hidden = !state.syncNotice;
  }

  function scheduleCloudSet(matchNo) {
    if (!matchNo || !String(state.leaveName || '').trim()) return;
    if (cloudTimers[matchNo]) clearTimeout(cloudTimers[matchNo]);
    cloudTimers[matchNo] = setTimeout(function () {
      void pushCloudProgress(matchNo);
    }, 600);
  }

  async function pushCloudProgress(matchNo) {
    const tok = token();
    const person = String(state.leaveName || '').trim();
    if (!tok || !person || !matchNo) return;
    if (!(global.skyfunAuth && typeof global.skyfunAuth.rpc === 'function')) return;
    const prog = progressOf(matchNo);
    try {
      const res = await global.skyfunAuth.rpc('toolbox_handover_progress_set', {
        p_token: tok,
        p_kind: KIND,
        p_person: person,
        p_match_no: matchNo,
        p_receiver: prog.assignee || '',
        p_checks: prog.checks || {},
        p_note: prog.note || ''
      });
      if (!res || res.ok === false) throw new Error((res && res.error) || '雲端儲存失敗');
      state.syncNotice = '進度已同步雲端';
      state.syncErr = false;
      paintSyncNotice();
    } catch (_) {
      state.syncNotice = '雲端儲存失敗，已暫存在本機';
      state.syncErr = true;
      paintSyncNotice();
    }
  }

  async function loadCloudProgress(person) {
    const tok = token();
    const name = String(person || '').trim();
    if (!tok || !name) return;
    if (!(global.skyfunAuth && typeof global.skyfunAuth.rpc === 'function')) return;
    try {
      const res = await global.skyfunAuth.rpc('toolbox_handover_progress_list', {
        p_token: tok,
        p_kind: KIND,
        p_person: name
      });
      if (!res || res.ok === false) return;
      const items = res.items || [];
      items.forEach(function (it) {
        const k = String(it.matchNo || '').trim();
        if (!k) return;
        const checks = it.checks && typeof it.checks === 'object' && !Array.isArray(it.checks) ? it.checks : {};
        state.progress.cases[k] = {
          assignee: String(it.receiver || '').trim(),
          checks: checks,
          note: String(it.note || '').trim()
        };
      });
      saveProgress();
      if (items.length) {
        state.syncNotice = '進度已同步雲端';
        state.syncErr = false;
      }
    } catch (_) {
      /* 雲端讀取失敗時沿用本機 */
    }
  }

  function checkPct(key) {
    const c = progressOf(key).checks;
    const n = CHECKS.filter((x) => c[x.key]).length;
    return { done: n, total: CHECKS.length, pct: Math.round((n / CHECKS.length) * 100) };
  }

  function toneOf(pct) {
    if (pct.pct >= 100) return { tone: 'is-done', status: '已完成' };
    if (pct.pct > 0) return { tone: 'is-mid', status: '進行中' };
    return { tone: 'is-empty', status: '未開始' };
  }

  function dotsHtml(checks) {
    return (
      '<span class="bh-dots" aria-hidden="true">' +
      CHECKS.map((c) => '<i class="' + (checks[c.key] ? 'on' : '') + '"></i>').join('') +
      '</span>'
    );
  }

  function checklistHtml(key, prog, pct, tone, status, checkAttr) {
    const checks = CHECKS.map((c, i) => {
      const on = !!prog.checks[c.key];
      return (
        '<label class="bh-check-item' +
        (on ? ' is-on' : '') +
        '">' +
        '<span class="bh-check-num">' +
        (i + 1) +
        '</span>' +
        '<input type="checkbox" ' +
        checkAttr +
        '="' +
        esc(key) +
        '" data-ck="' +
        c.key +
        '"' +
        (on ? ' checked' : '') +
        ' />' +
        '<span class="bh-check-text"><span class="bh-check-short">' +
        esc(c.short || c.label) +
        '</span><span class="bh-check-full">' +
        esc(c.label) +
        '</span></span></label>'
      );
    }).join('');
    return (
      '<div class="bh-check-card ' +
      tone +
      '">' +
      '<div class="bh-check-head">' +
      '<span class="bh-check-title">交接清單</span>' +
      '<span class="bh-check-status">' +
      esc(status) +
      '</span>' +
      '<span class="bh-check-pct">' +
      pct.done +
      '/' +
      pct.total +
      '</span>' +
      '<span class="bh-check-pct-sub">' +
      pct.pct +
      '%</span>' +
      '<span class="bh-check-bar" aria-hidden="true"><i style="width:' +
      pct.pct +
      '%"></i></span></div>' +
      '<div class="bh-check-list">' +
      checks +
      '</div></div>'
    );
  }

  function isSensitiveHeader(h) {
    return SENSITIVE_RE.test(String(h || ''));
  }

  function mapHeader(headers) {
    const map = {};
    headers.forEach((h, i) => {
      if (isSensitiveHeader(h)) {
        map[i] = null;
        return;
      }
      const n = normKey(h);
      let hit = null;
      Object.keys(COL_ALIASES).some((field) => {
        const ok = COL_ALIASES[field].some((a) => normKey(a) === n || n.includes(normKey(a)));
        if (ok) {
          hit = field;
          return true;
        }
        return false;
      });
      map[i] = hit;
    });
    return map;
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQ = false;
    const src = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inQ) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  function rowsFromMatrix(matrix) {
    if (!matrix || matrix.length < 2) return [];
    const headers = matrix[0].map((h) => String(h == null ? '' : h).trim());
    const colMap = mapHeader(headers);
    const out = [];
    for (let r = 1; r < matrix.length; r++) {
      const line = matrix[r] || [];
      const obj = {
        matchNo: '',
        city: '',
        address: '',
        landlord: '',
        tenant: '',
        leaseStart: '',
        leaseEnd: '',
        status: '',
        sales: '',
        arrears: '',
        renewTag: '',
        source: 'import'
      };
      let any = false;
      line.forEach((val, i) => {
        const field = colMap[i];
        if (!field) return;
        const v = String(val == null ? '' : val).trim();
        if (!v) return;
        obj[field] = v;
        any = true;
      });
      if (!any) continue;
      if (!caseKey(obj) && !obj.address) continue;
      out.push(obj);
    }
    return out;
  }

  function parseImportFile(file) {
    const name = String(file.name || '').toLowerCase();
    const isXlsx = /\.xlsx?$/.test(name);
    if (isXlsx) {
      if (!(global.XLSX && global.XLSX.read)) {
        return Promise.reject(new Error('本頁未載入 SheetJS，請改匯入 CSV'));
      }
      return file.arrayBuffer().then((buf) => {
        const wb = global.XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        return rowsFromMatrix(matrix);
      });
    }
    return file.text().then((t) => rowsFromMatrix(parseCsvText(t)));
  }

  function rocYearNow() {
    return new Date().getFullYear() - 1911;
  }

  function recentMonths(n) {
    const out = [];
    const d = new Date();
    for (let i = 0; i < n; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({ year: x.getFullYear() - 1911, month: x.getMonth() + 1 });
    }
    return out;
  }

  async function getJson(path, query, timeoutMs) {
    const tok = token();
    if (!tok) throw new Error('請先登入工具箱');
    const q = new URLSearchParams(query || {});
    const ms = timeoutMs != null ? timeoutMs : 20000;
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, ms);
    try {
      const res = await fetch(RPA_BASE + path + (q.toString() ? '?' + q : ''), {
        headers: { 'X-Skyfun-Session': tok },
        cache: 'no-store',
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.message || path + ' HTTP ' + res.status);
      }
      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('請求逾時');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCompanySalesCases(salesName, refresh) {
    const tok = token();
    if (!tok) throw new Error('請先登入工具箱');
    const name = String(salesName || '').trim();
    if (!name) throw new Error('請先填離職業務姓名');
    const q = new URLSearchParams({ sales: name });
    if (refresh) q.set('refresh', '1');
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, 90000);
    try {
      const res = await fetch(HANDOVER_RPA_BASE + '/handover/sales-cases?' + q.toString(), {
        headers: { 'X-Skyfun-Session': tok },
        cache: 'no-store',
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.message || '公司系統契約 HTTP ' + res.status);
      }
      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('公司系統回應逾時，請按重新抓取或改用匯入');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function fromCompanyItem(it) {
    const city = String(it.city || '').trim();
    const district = String(it.district || '').trim();
    return {
      matchNo: String(it.matchNo || '').trim(),
      city: city && district && city.indexOf(district) < 0 ? city + district : city || district,
      address: String(it.address || '').trim(),
      landlord: String(it.landlord || '').trim(),
      tenant: String(it.tenant || '').trim(),
      leaseStart: String(it.leaseStart || '').trim(),
      leaseEnd: String(it.leaseEnd || '').trim(),
      status: String(it.displayStatus || it.status || it.contratType || '').trim(),
      sales: String(it.sales || '').trim(),
      arrears: '',
      renewTag: String(it.renewalStatus || '').trim(),
      source: COMPANY_SOURCE
    };
  }

  function pickSales(it) {
    return it.sales || it.agent || it.agentName || it.staff || '';
  }

  function fromWorkerItem(it, source, extra) {
    return Object.assign(
      {
        matchNo: String(it.matchNo || it.caseId || it.no || '').trim(),
        city: String(it.city || '').trim(),
        address: String(it.address || '').trim(),
        landlord: '',
        tenant: String(it.tenant || '').trim(),
        leaseStart: String(it.leaseStart || '').trim(),
        leaseEnd: String(it.leaseEnd || '').trim(),
        status: String(it.status || '').trim(),
        sales: String(pickSales(it) || '').trim(),
        arrears: '',
        renewTag: '',
        source: source
      },
      extra || {}
    );
  }

  async function runInBatches(tasks, size) {
    let failCount = 0;
    for (let i = 0; i < tasks.length; i += size) {
      const chunk = tasks.slice(i, i + size);
      const results = await Promise.allSettled(chunk.map((fn) => fn()));
      results.forEach((r) => {
        if (r.status === 'rejected') failCount += 1;
      });
    }
    return failCount;
  }

  async function fetchWorkerRows(leaveName) {
    const want = normName(leaveName);
    if (!want) return { rows: [], failCount: 0 };
    const byKey = new Map();
    const add = (row) => {
      const k = caseKey(row);
      if (!k && !row.address) return;
      const id = k || 'addr:' + normKey(row.address);
      const prev = byKey.get(id);
      if (!prev) {
        byKey.set(id, row);
        return;
      }
      ['city', 'address', 'landlord', 'tenant', 'leaseStart', 'leaseEnd', 'status', 'sales', 'arrears', 'renewTag'].forEach(
        (f) => {
          if (!prev[f] && row[f]) prev[f] = row[f];
        }
      );
      if (row.source && prev.source && prev.source.indexOf(row.source) < 0) {
        prev.source = prev.source + '+' + row.source;
      }
    };

    const tasks = [];

    tasks.push(async function () {
      const arrears = await getJson('/data/latest.json', {}, 20000);
      (arrears.lines || []).forEach((l) => {
        if (normName(l.staff) !== want) return;
        add(
          fromWorkerItem(l, 'arrears', {
            matchNo: String(l.caseId || '').trim(),
            arrears: l.arrears != null ? String(l.arrears) : '',
            renewTag: Number(l.arrears) > 0 ? '欠租' : ''
          })
        );
      });
    });

    recentMonths(6).forEach((m) => {
      tasks.push(async function () {
        const nr = await getJson(
          '/admin-points/renew-norenew-detail',
          { year: String(m.year), month: String(m.month) },
          20000
        );
        (nr.items || []).forEach((it) => {
          if (normName(pickSales(it)) !== want) return;
          add(
            fromWorkerItem(it, 'norenew', {
              renewTag: '不續約',
              status: it.status || '不續約'
            })
          );
        });
      });
    });

    const metrics = ['due', 'done', 'presign', 'tracking', 'leasing', 'noRenewAll'];
    const tagOf = {
      due: '應續約',
      done: '已續約',
      presign: '預簽中',
      tracking: '追蹤中',
      leasing: '招租中',
      noRenewAll: '不續約'
    };
    recentMonths(3).forEach((m) => {
      metrics.forEach((metric) => {
        tasks.push(async function () {
          const data = await getJson(
            '/admin-points/renew-kpi-detail',
            {
              year: String(m.year || rocYearNow()),
              month: String(m.month),
              region: 'all',
              metric: metric
            },
            20000
          );
          (data.items || []).forEach((it) => {
            if (normName(pickSales(it)) !== want) return;
            add(
              fromWorkerItem(it, 'renew:' + metric, {
                renewTag: tagOf[metric] || metric,
                status: it.status || tagOf[metric] || ''
              })
            );
          });
        });
      });
    });

    const failCount = await runInBatches(tasks, 6);
    return { rows: [...byKey.values()], failCount: failCount };
  }

  function isCompanySource(src) {
    return String(src || '')
      .split('+')
      .some((s) => s === COMPANY_SOURCE);
  }

  function mergeSources(a, b) {
    const srcs = new Set(
      String(a || '')
        .split('+')
        .concat(String(b || '').split('+'))
    );
    return [...srcs].filter(Boolean).join('+');
  }

  function fillEmptyFields(base, other) {
    ['city', 'address', 'landlord', 'tenant', 'leaseStart', 'leaseEnd', 'status', 'sales'].forEach((f) => {
      if (!base[f] && other[f]) base[f] = other[f];
    });
  }

  function mergeAll() {
    const want = normName(state.leaveName);
    const byKey = new Map();
    const rowId = (row) => {
      const a = addrKey(row);
      if (a) return a;
      const k = caseKey(row);
      return k || '';
    };

    function absorb(r, preferIncoming) {
      const id = rowId(r);
      if (!id) return;
      const incoming = Object.assign({}, r, { matchNos: collectMatchNos(r) });
      const prev = byKey.get(id);
      if (!prev) {
        if (incoming.matchNos.length) incoming.matchNo = incoming.matchNos.join('／');
        byKey.set(id, incoming);
        return;
      }

      const base = preferIncoming && !isCompanySource(prev.source) ? Object.assign({}, incoming) : prev;
      const other = base === prev ? incoming : prev;
      if (preferIncoming && !isCompanySource(prev.source)) {
        fillEmptyFields(base, other);
      } else {
        fillEmptyFields(base, other);
      }
      base.matchNos = [...new Set([].concat(collectMatchNos(prev), collectMatchNos(incoming)))];
      if (base.matchNos.length) base.matchNo = base.matchNos.join('／');
      base.tenant = preferText(base.tenant, other.tenant);
      base.landlord = preferText(base.landlord, other.landlord);
      base.status = preferText(base.status, other.status);
      if (other.arrears && (!base.arrears || Number(other.arrears) > Number(base.arrears || 0))) {
        base.arrears = other.arrears;
      }
      if (other.renewTag && !base.renewTag) base.renewTag = other.renewTag;
      if (other.leaseStart && !base.leaseStart) base.leaseStart = other.leaseStart;
      if (other.leaseEnd && !base.leaseEnd) base.leaseEnd = other.leaseEnd;
      if (other.city && !base.city) base.city = other.city;
      base.source = mergeSources(prev.source, incoming.source);
      byKey.set(id, base);
    }

    state.companyRows.forEach((r) => absorb(r, false));
    state.workerRows.forEach((r) => absorb(r, false));
    state.importRows.forEach((r) => {
      if (want && r.sales && normName(r.sales) !== want) return;
      absorb(r, true);
    });

    state.merged = [...byKey.values()].sort((a, b) =>
      String(a.address || '').localeCompare(String(b.address || ''), 'zh-Hant')
    );
    consolidateProgressKeys();
  }

  function consolidateProgressKeys() {
    let changed = false;
    state.merged.forEach((row) => {
      const pk = progressKey(row);
      if (!pk) return;
      const target = progressOf(pk);
      const checks = Object.assign({}, target.checks);
      let assignee = target.assignee;
      let note = target.note || '';
      collectMatchNos(row).forEach((no) => {
        if (!no || no === pk) return;
        const src = state.progress.cases[no];
        if (!src) return;
        if (src.assignee && !assignee) assignee = src.assignee;
        if (src.note && !note) note = src.note;
        if (src.checks && typeof src.checks === 'object') {
          Object.keys(src.checks).forEach((ck) => {
            if (src.checks[ck]) checks[ck] = true;
          });
        }
        changed = true;
      });
      state.progress.cases[pk] = { assignee: assignee || '', checks: checks, note: note || '' };
    });
    if (changed) saveProgress();
  }

  async function loadCompanyCases(opts) {
    const refresh = !!(opts && opts.refresh);
    if (!normName(state.leaveName)) {
      state.companyStatus = '請先填離職業務姓名';
      state.companyErr = true;
      throw new Error('請先填離職業務姓名');
    }
    state.companyLoading = true;
    state.companyStatus = refresh ? '重新抓取中…' : '正在抓取公司系統案件…';
    state.companyErr = false;
    try {
      const data = await fetchCompanySalesCases(state.leaveName, refresh);
      const items = data.items || [];
      state.companyRows = items.map(fromCompanyItem).filter((r) => caseKey(r) || r.address);
      state.companyTotal = Number(data.total != null ? data.total : state.companyRows.length) || state.companyRows.length;
      state.companyStatus = '已抓到 ' + state.companyTotal + ' 件';
      state.companyErr = false;
      mergeAll();
    } catch (e) {
      console.error(e);
      state.companyStatus = String(e.message || e);
      state.companyErr = true;
      mergeAll();
      throw e;
    } finally {
      state.companyLoading = false;
    }
  }

  function filteredMerged() {
    const f = state.filter;
    return state.merged.filter((row) => {
      const k = progressKey(row);
      const p = checkPct(k);
      if (f === 'open') return p.done < p.total;
      if (f === 'done') return p.done >= p.total;
      if (f === 'arrears') return Number(row.arrears) > 0 || /欠租/.test(row.renewTag || '');
      if (f === 'renew') return !!(row.renewTag || /續約|招租|預簽|追蹤|到期/.test(row.status || ''));
      return true;
    });
  }

  function setMsg(t, err) {
    state.msg = t || '';
    state.msgErr = !!err;
  }

  function setInlineErr(t) {
    state.inlineErr = t || '';
  }

  function readLeaveName() {
    const el = document.getElementById('bh-leave');
    return String(el ? el.value : state.leaveName || '').trim();
  }

  async function loadWorker() {
    const name = readLeaveName();
    state.leaveName = name;
    setInlineErr('');
    state.workerNote = '';
    state.msg = '';
    state.msgErr = false;

    if (!name) {
      setInlineErr('請先填離職業務姓名');
      state.loadStatus = '';
      render();
      return;
    }
    if (!token()) {
      setInlineErr('請先登入工具箱');
      state.loadStatus = '';
      render();
      return;
    }

    state.loading = true;
    state.loadStatus = '正在從公司系統抓取 ' + name + ' 的案件…（約 10–40 秒）';
    render();

    try {
      const companyP = loadCompanyCases({ refresh: false });
      const cloudP = loadCloudProgress(name);
      const settled = await Promise.allSettled([companyP, cloudP]);
      const companyRes = settled[0];

      if (companyRes.status === 'rejected') {
        const err = companyRes.reason;
        console.error(err);
        setInlineErr(String((err && err.message) || err || '載入失敗'));
        state.loadStatus = '';
        state.loading = false;
        mergeAll();
        render();
        return;
      }

      state.loadStatus = '已抓到 ' + state.companyTotal + ' 件';
      state.loading = false;
      mergeAll();
      render();

      state.loadStatus = '已抓到 ' + state.companyTotal + ' 件；正在載入欠租／續約補充…';
      paintLoadStatus();

      try {
        const result = await fetchWorkerRows(name);
        if (normName(state.leaveName) !== normName(name)) return;
        state.workerRows = result.rows || [];
        mergeAll();
        if (result.failCount > 0) {
          state.workerNote = '部分補充資料未載入';
          state.loadStatus = '已抓到 ' + state.companyTotal + ' 件（部分補充資料未載入）';
        } else {
          state.workerNote = '';
          state.loadStatus = '已抓到 ' + state.companyTotal + ' 件';
        }
        render();
      } catch (e) {
        console.error(e);
        if (normName(state.leaveName) !== normName(name)) return;
        state.workerNote = '補充資料略過';
        state.loadStatus = '已抓到 ' + state.companyTotal + ' 件（補充資料略過）';
        paintLoadStatus();
      }
    } catch (e) {
      console.error(e);
      setInlineErr(String(e.message || e));
      state.loadStatus = '';
      state.loading = false;
      render();
    }
  }

  function paintLoadStatus() {
    const el = document.getElementById('bh-load-status');
    if (!el) return;
    const show = !!(state.loadStatus || state.loading);
    el.hidden = !show;
    if (!show) return;
    const spinning = state.loading || /正在/.test(state.loadStatus || '');
    el.innerHTML =
      (spinning
        ? '<span class="inline-block w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true"></span>'
        : '') +
      '<span>' +
      esc(state.loadStatus || '') +
      '</span>';
  }

  async function refreshCompanyOnly() {
    const name = readLeaveName();
    state.leaveName = name;
    setInlineErr('');
    if (!name) {
      setInlineErr('請先填離職業務姓名');
      state.companyStatus = '請先填離職業務姓名';
      state.companyErr = true;
      render();
      return;
    }
    if (!token()) {
      setInlineErr('請先登入工具箱');
      render();
      return;
    }
    state.companyLoading = true;
    state.loadStatus = '正在重新抓取 ' + name + ' 的案件…（約 10–40 秒）';
    render();
    try {
      await loadCompanyCases({ refresh: true });
      state.loadStatus = '已抓到 ' + state.companyTotal + ' 件';
      setInlineErr('');
    } catch (e) {
      console.error(e);
      setInlineErr(String(e.message || e));
      state.loadStatus = '';
    }
    render();
  }

  function applyBatchAssignee() {
    const name = String(state.batchAssignee || '').trim();
    if (!name) {
      setMsg('請先填批次接手人', true);
      render();
      return;
    }
    filteredMerged().forEach((row) => {
      setAssignee(progressKey(row), name);
    });
    setMsg('已套用接手人「' + name + '」至目前篩選清單', false);
    render();
  }

  function exportCsv() {
    const headers = [
      '媒合編號',
      '縣市',
      '地址',
      '房東',
      '房客',
      '租期起',
      '租期迄',
      '狀態',
      '欠租',
      '續約標記',
      '接手人',
      'checklist進度',
      '資料來源'
    ];
    CHECKS.forEach((c) => headers.push(c.label));
    const lines = [headers.map(csvCell).join(',')];
    state.merged.forEach((row) => {
      const k = progressKey(row);
      const prog = progressOf(k);
      const pct = checkPct(k);
      const cells = [
        row.matchNo,
        row.city,
        row.address,
        row.landlord || '—',
        row.tenant || '—',
        row.leaseStart,
        row.leaseEnd,
        row.status,
        row.arrears,
        row.renewTag,
        prog.assignee,
        pct.done + '/' + pct.total,
        row.source
      ];
      CHECKS.forEach((c) => cells.push(prog.checks[c.key] ? 'V' : ''));
      lines.push(cells.map(csvCell).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '業務離職交接_' + (normName(state.leaveName) || 'export') + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function dash(v) {
    const s = String(v == null ? '' : v).trim();
    return s || '—';
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const xlsxOk = !!(global.XLSX && global.XLSX.read);
    const list = filteredMerged();
    const accept = xlsxOk ? '.csv,.xlsx,.xls,text/csv' : '.csv,text/csv';
    const statusSpin = state.loading || /正在/.test(state.loadStatus || '');

    root.innerHTML =
      '<div class="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-slate-50 p-4 md:p-6 space-y-4 shadow-sm">' +
      '<header class="space-y-1">' +
      '<h2 class="text-2xl md:text-3xl font-bold text-slate-900 text-center">🤝 業務離職交接</h2>' +
      '</header>' +
      '<div class="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 leading-relaxed">' +
      '<p class="font-semibold text-slate-800 mb-1">使用方法</p>' +
      '<ol class="list-decimal ml-5 space-y-0.5">' +
      '<li>輸入離職業務姓名，按「載入」</li>' +
      '<li>指定接手人（可批次套用）</li>' +
      '<li>每件交接完成就勾選清單（進度自動儲存，換電腦也看得到）</li>' +
      '<li>全部完成後可匯出 CSV</li>' +
      '</ol>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      '<label class="block text-sm font-semibold text-slate-700">離職業務姓名' +
      '<input id="bh-leave" type="text" class="mt-1 w-full px-3 py-2 border-2 border-slate-200 rounded-xl" value="' +
      esc(state.leaveName) +
      '" placeholder="與公司系統業務姓名相同" /></label>' +
      '<label class="block text-sm font-semibold text-slate-700">批次接手人' +
      '<div class="mt-1 flex gap-2">' +
      '<input id="bh-batch" type="text" class="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl" value="' +
      esc(state.batchAssignee) +
      '" placeholder="套用到目前清單" />' +
      '<button type="button" id="bh-batch-btn" class="btn tone-slate-mid px-3 py-2 font-bold shrink-0">套用</button>' +
      '</div></label>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2 items-center">' +
      '<button type="button" id="bh-load" class="btn tone-indigo px-4 py-2 font-bold"' +
      (state.loading ? ' disabled' : '') +
      '>' +
      (state.loading ? '載入中…' : '載入') +
      '</button>' +
      '<span id="bh-inline-err" class="text-sm text-rose-700 font-semibold"' +
      (state.inlineErr ? '' : ' hidden') +
      '>' +
      esc(state.inlineErr) +
      '</span>' +
      '<label class="btn tone-slate-mid px-4 py-2 font-bold cursor-pointer">' +
      '抓不到時：匯入契約查詢檔' +
      '<input id="bh-file" type="file" accept="' +
      accept +
      '" class="hidden" />' +
      '</label>' +
      '<button type="button" id="bh-export" class="btn tone-slate-soft px-4 py-2 font-bold">匯出 CSV</button>' +
      '<button type="button" id="bh-company-refresh" class="btn btn-sm tone-slate-mid px-3 py-1 font-bold"' +
      (state.companyLoading || state.loading || !normName(state.leaveName) ? ' disabled' : '') +
      '>' +
      (state.companyLoading ? '抓取中…' : '重新抓取') +
      '</button>' +
      '<span id="bh-sync" class="text-xs ' +
      (state.syncErr ? 'text-amber-800 font-semibold' : 'text-emerald-700 font-semibold') +
      '"' +
      (state.syncNotice ? '' : ' hidden') +
      '>' +
      esc(state.syncNotice) +
      '</span>' +
      '</div>' +
      '<div id="bh-load-status" class="flex items-center gap-2 text-sm text-slate-700 min-h-[1.25rem]"' +
      (state.loadStatus || state.loading ? '' : ' hidden') +
      '>' +
      (statusSpin
        ? '<span class="inline-block w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true"></span>'
        : '') +
      '<span>' +
      esc(state.loadStatus || '') +
      '</span>' +
      '</div>' +
      (state.msg
        ? '<p class="text-sm ' + (state.msgErr ? 'text-rose-700 font-semibold' : 'text-slate-600') + '">' + esc(state.msg) + '</p>'
        : '') +
      '<div class="flex flex-wrap gap-2" role="tablist" aria-label="篩選">' +
      [
        ['all', '全部'],
        ['open', '未完成'],
        ['done', '已完成'],
        ['arrears', '欠租'],
        ['renew', '續約相關']
      ]
        .map(
          ([k, lab]) =>
            '<button type="button" class="btn btn-sm ' +
            (state.filter === k ? 'tone-indigo' : 'tone-slate-soft') +
            '" data-bh-filter="' +
            k +
            '">' +
            lab +
            '</button>'
        )
        .join('') +
      '</div>' +
      '<div class="bh-list-toolbar">' +
      '<p class="text-sm font-bold text-slate-800">案件清單 <span class="text-indigo-700">共 ' +
      list.length +
      ' 筆</span></p>' +
      '<div class="bh-list-actions">' +
      '<button type="button" class="btn btn-sm tone-slate-soft" id="bh-expand-all">全部展開</button>' +
      '<button type="button" class="btn btn-sm tone-slate-soft" id="bh-collapse-all">全部收合</button>' +
      '</div>' +
      '<p class="bh-list-toolbar__hint">先掃案件列 → 點開展開卡片 → 勾選交接清單</p>' +
      '</div>' +
      '<div class="bh-list">' +
      (list.length
        ? list
            .map((row) => {
              const k = progressKey(row);
              const prog = progressOf(k);
              const pct = checkPct(k);
              const meta = toneOf(pct);
              const open = !!state.expanded[k];
              const tags = [];
              if (row.status) tags.push('<span class="bh-chip is-info">' + esc(row.status) + '</span>');
              if (row.arrears && row.arrears !== '—') tags.push('<span class="bh-chip is-warn">欠租 ' + esc(row.arrears) + '</span>');
              if (row.renewTag && row.renewTag !== '—') tags.push('<span class="bh-chip">' + esc(row.renewTag) + '</span>');
              return (
                '<article class="bh-case ' +
                meta.tone +
                (open ? ' is-open' : '') +
                '" data-bh-case="' +
                esc(k) +
                '">' +
                '<div class="bh-case-scan">' +
                '<button type="button" class="bh-case-toggle" data-bh-toggle="' +
                esc(k) +
                '" aria-expanded="' +
                (open ? 'true' : 'false') +
                '">' +
                '<span class="bh-case-chevron" aria-hidden="true">▾</span>' +
                '<span class="bh-case-main">' +
                '<span class="bh-case-id">' +
                esc(dash(row.matchNo)) +
                '</span>' +
                '<span class="bh-case-addr">' +
                esc(dash(row.address)) +
                '</span>' +
                '<span class="bh-case-sub">' +
                esc(dash(row.city)) +
                ' · 房東 ' +
                esc(dash(row.landlord)) +
                ' · 房客 ' +
                esc(dash(row.tenant)) +
                '</span>' +
                (tags.length ? '<span class="bh-case-tags">' + tags.join('') + '</span>' : '') +
                '</span>' +
                '<span class="bh-case-side">' +
                '<span class="bh-case-badge"><span class="bh-case-badge__status">' +
                esc(meta.status) +
                '</span><span class="bh-case-badge__frac">' +
                pct.done +
                '/' +
                pct.total +
                '</span></span>' +
                dotsHtml(prog.checks) +
                '</span></button>' +
                '<div class="bh-case-assignee"><label>接手人</label>' +
                '<input type="text" data-bh-assignee="' +
                esc(k) +
                '" value="' +
                esc(prog.assignee) +
                '" placeholder="填寫接手人" /></div></div>' +
                '<div class="bh-case-panel">' +
                '<div class="bh-case-facts">' +
                '<div class="bh-fact"><span class="bh-fact__k">媒合編號</span><span class="bh-fact__v">' +
                esc(dash(row.matchNo)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">縣市</span><span class="bh-fact__v">' +
                esc(dash(row.city)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">地址</span><span class="bh-fact__v">' +
                esc(dash(row.address)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">房東／房客</span><span class="bh-fact__v">' +
                esc(dash(row.landlord)) +
                '／' +
                esc(dash(row.tenant)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">租期起迄</span><span class="bh-fact__v">' +
                esc(dash(row.leaseStart)) +
                ' ～ ' +
                esc(dash(row.leaseEnd)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">狀態／欠租／續約</span><span class="bh-fact__v">' +
                esc(dash(row.status)) +
                '／' +
                esc(dash(row.arrears)) +
                '／' +
                esc(dash(row.renewTag)) +
                '</span></div></div>' +
                checklistHtml(k, prog, pct, meta.tone, meta.status, 'data-bh-check') +
                '</div></article>'
              );
            })
            .join('')
        : '<div class="bh-empty">尚無案件。請輸入姓名後按「載入」。</div>') +
      '</div></div>';

    wire(root);
  }

  function safeLoad(fn) {
    return function () {
      const args = arguments;
      const self = this;
      Promise.resolve()
        .then(function () {
          return fn.apply(self, args);
        })
        .catch(function (e) {
          console.error(e);
          state.loading = false;
          state.companyLoading = false;
          setInlineErr(String((e && e.message) || e || '發生錯誤'));
          state.loadStatus = '';
          render();
        });
    };
  }

  function wire(root) {
    const leave = root.querySelector('#bh-leave');
    const batch = root.querySelector('#bh-batch');
    if (leave) {
      leave.addEventListener('change', () => {
        state.leaveName = leave.value;
      });
      leave.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        safeLoad(loadWorker)();
      });
    }
    if (batch) {
      batch.addEventListener('change', () => {
        state.batchAssignee = batch.value;
      });
    }
    root.querySelector('#bh-batch-btn')?.addEventListener('click', () => {
      state.batchAssignee = batch ? batch.value : state.batchAssignee;
      applyBatchAssignee();
    });
    root.querySelector('#bh-load')?.addEventListener('click', safeLoad(loadWorker));
    root.querySelector('#bh-company-refresh')?.addEventListener('click', safeLoad(refreshCompanyOnly));
    root.querySelector('#bh-export')?.addEventListener('click', exportCsv);
    root.querySelector('#bh-file')?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      state.leaveName = readLeaveName();
      parseImportFile(f)
        .then((rows) => {
          const want = normName(state.leaveName);
          state.importRows = want ? rows.filter((r) => !r.sales || normName(r.sales) === want) : rows;
          mergeAll();
          setMsg('已匯入 ' + state.importRows.length + ' 件，合併後 ' + state.merged.length + ' 案', false);
          setInlineErr('');
          render();
        })
        .catch((err) => {
          console.error(err);
          setInlineErr(String(err.message || err));
          render();
        });
    });
    root.querySelectorAll('[data-bh-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.getAttribute('data-bh-filter') || 'all';
        render();
      });
    });
    root.querySelector('#bh-expand-all')?.addEventListener('click', () => {
      filteredMerged().forEach((row) => {
        const k = progressKey(row);
        state.expanded[k] = true;
      });
      render();
    });
    root.querySelector('#bh-collapse-all')?.addEventListener('click', () => {
      state.expanded = Object.create(null);
      render();
    });
    root.querySelectorAll('[data-bh-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-bh-toggle') || '';
        if (!k) return;
        state.expanded[k] = !state.expanded[k];
        render();
      });
    });
    root.querySelectorAll('[data-bh-assignee]').forEach((inp) => {
      inp.addEventListener('change', () => {
        setAssignee(inp.getAttribute('data-bh-assignee'), inp.value);
        paintSyncNotice();
      });
    });
    root.querySelectorAll('[data-bh-check]').forEach((inp) => {
      inp.addEventListener('change', () => {
        setCheck(inp.getAttribute('data-bh-check'), inp.getAttribute('data-ck'), inp.checked);
        render();
      });
    });
  }

  function mount() {
    state.mounted = true;
    render();
  }

  function watchPage() {
    const page = document.getElementById(PAGE_ID);
    if (!page || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => {
      if (!page.classList.contains('hidden')) mount();
    });
    obs.observe(page, { attributes: true, attributeFilter: ['class'] });
  }

  function boot() {
    watchPage();
    const page = document.getElementById(PAGE_ID);
    if (page && !page.classList.contains('hidden')) mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.BizHandover = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
