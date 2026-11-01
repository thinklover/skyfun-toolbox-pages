/**
 * 行政專區 › 離職交接
 * 唯讀 Worker：audit-log / contract-reviewers / terminations / expenses；進度 localStorage + Supabase 雲端同步；匯出 CSV。
 */
(function (global) {
  'use strict';

  const RPA_BASE = String(
    global.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev'
  ).replace(/\/$/, '');
  const LS_KEY = 'skyfun-admin-handover-v1';
  const ROOT_ID = 'admin-handover-root';
  const PAGE_ID = 'page-admin-handover';
  const KIND = 'admin';

  const CHECKS = [
    { key: 'pendingAudit', short: '未結審件', label: '未結審件／退件已交代接手人' },
    { key: 'guildRoster', short: '公會清冊', label: '公會意見／清冊未了已說明' },
    { key: 'repairTerm', short: '修繕解約', label: '修繕補助／解約經手已移交' },
    { key: 'complaintPetition', short: '客訴簽呈', label: '客訴／簽呈窗口已告知' },
    { key: 'filesAccounts', short: '資料帳密', label: '相關資料夾／帳密（非本工具）已交辦' }
  ];

  const EXPENSE_TYPE = { 0: '修繕', 1: '公證費', 2: '保險費', 3: '媒合費', 4: '其他補助' };

  let state = {
    leaveName: '',
    batchAssignee: '',
    months: 12,
    rows: [],
    progress: loadProgress(),
    loading: false,
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
      /* ignore */
    }
  }

  function rowKey(row) {
    return [row.caseNo || '', row.kind || '', row.handledAt || '', row.address || ''].join('|');
  }

  function progressOf(key) {
    const p = state.progress.cases[key] || {};
    return {
      assignee: p.assignee || '',
      checks: p.checks && typeof p.checks === 'object' ? p.checks : {},
      note: p.note || ''
    };
  }

  function setAssignee(key, name) {
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
    const cur = progressOf(key);
    const checks = Object.assign({}, cur.checks);
    if (on) checks[checkKey] = true;
    else delete checks[checkKey];
    state.progress.cases[key] = { assignee: cur.assignee, checks: checks, note: cur.note || '' };
    saveProgress();
    scheduleCloudSet(key);
  }

  function paintSyncNotice() {
    const el = document.getElementById('ah-sync');
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

  function checklistHtml(key, prog, pct, tone, status) {
    const checks = CHECKS.map((c, i) => {
      const on = !!prog.checks[c.key];
      return (
        '<label class="bh-check-item' +
        (on ? ' is-on' : '') +
        '">' +
        '<span class="bh-check-num">' +
        (i + 1) +
        '</span>' +
        '<input type="checkbox" data-ah-check="' +
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

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 近 n 個業績月（上月29～本月28） */
  function recentPerfMonths(n) {
    const out = [];
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    for (let i = 0; i < n; i++) {
      const start = new Date(y, m - 2, 29);
      const end = new Date(y, m - 1, 28);
      out.push({ year: y, month: m, start: iso(start), end: iso(end) });
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }

  function rowsFromPayload(payload) {
    const fields = payload && payload.fields ? payload.fields : [];
    return (payload && payload.rows ? payload.rows : []).map((arr) => {
      const r = {};
      fields.forEach((f, i) => {
        r[f] = arr[i];
      });
      if (!r.date) r.date = String(r.time || '').slice(0, 10).replace(/\//g, '-');
      return r;
    });
  }

  async function getJson(path, query) {
    const tok = token();
    if (!tok) throw new Error('請先登入工具箱');
    const q = new URLSearchParams(query || {});
    const res = await fetch(RPA_BASE + path + (q.toString() ? '?' + q : ''), {
      headers: { 'X-Skyfun-Session': tok },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.message || path + ' HTTP ' + res.status);
    }
    return data;
  }

  function auditKind(row) {
    const st = String(row.status || '');
    if (/物審|物件/.test(st) || row.type === 'object' || row.type === 1) return '物審';
    if (/房客/.test(st) || row.type === 'tenant' || row.type === 2) return '房客';
    if (/預審/.test(st)) return '預審';
    if (/複審/.test(st)) return '複審';
    if (/產編|四期|五期/.test(st)) return '產編';
    if (/實價/.test(st)) return '實價登錄';
    if (/解約/.test(st)) return '解約審核';
    return st || String(row.type || '審核');
  }

  function stripSensitive(obj) {
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
      if (/idno|身分證|證照|license|secret|token|password/i.test(k)) return;
      out[k] = obj[k];
    });
    return out;
  }

  async function fetchAll() {
    const want = normName(state.leaveName);
    if (!want) throw new Error('請先填離職行政姓名');
    const months = recentPerfMonths(Math.max(1, Math.min(24, Number(state.months) || 12)));
    const collected = [];
    const errors = [];

    let mi = 0;
    for (const m of months) {
      try {
        const audit = await getJson('/admin-points/audit-log', { start: m.start, end: m.end });
        rowsFromPayload(audit).forEach((r) => {
          if (normName(r.auditor) !== want) return;
          collected.push(
            stripSensitive({
              caseNo: String(r.no || r.id || '').trim(),
              address: String(r.name || r.address || '').trim(),
              kind: auditKind(r),
              handledAt: String(r.date || r.time || '').slice(0, 16),
              source: 'audit-log'
            })
          );
        });
      } catch (e) {
        errors.push('audit ' + m.month + '月: ' + (e.message || e));
      }

      try {
        const exp = await getJson('/admin-points/expenses', { start: m.start, end: m.end });
        rowsFromPayload(exp).forEach((r) => {
          if (normName(r.auditor) !== want) return;
          const t = EXPENSE_TYPE[r.type] || '補助';
          collected.push(
            stripSensitive({
              caseNo: String(r.id || r.no || '').trim(),
              address: String(r.address || r.name || '').trim(),
              kind: t,
              handledAt: String(r.date || r.time || '').slice(0, 16),
              source: 'expenses'
            })
          );
        });
      } catch (e) {
        errors.push('expenses ' + m.month + '月: ' + (e.message || e));
      }

      try {
        const term = await getJson('/admin-points/terminations', { start: m.start, end: m.end });
        rowsFromPayload(term).forEach((r) => {
          if (normName(r.auditor) !== want) return;
          collected.push(
            stripSensitive({
              caseNo: String(r.id || r.no || '').trim(),
              address: String(r.address || r.name || '').trim(),
              kind: r.contractType ? '解約・' + r.contractType : '解約',
              handledAt: String(r.date || r.time || '').slice(0, 16),
              source: 'terminations'
            })
          );
        });
      } catch (e) {
        errors.push('terminations ' + m.month + '月: ' + (e.message || e));
      }

      /* 複審補抓僅近 3 個業績月，避免請求過多 */
      if (mi < 3) {
        try {
          const lease = await getJson('/admin-points/lease-starts', { start: m.start, end: m.end });
          const leaseRows = rowsFromPayload(lease);
          const ids = leaseRows.map((r) => r.id).filter(Boolean).map(String);
          const addrById = new Map(leaseRows.map((r) => [String(r.id), r.address || '']));
          const noById = new Map(leaseRows.map((r) => [String(r.id), r.no || '']));
          for (let i = 0; i < ids.length; i += 40) {
            const chunk = ids.slice(i, i + 40);
            if (!chunk.length) break;
            try {
              const rev = await getJson('/admin-points/contract-reviewers', { ids: chunk.join(',') });
              (rev.rows || []).forEach((tuple) => {
                const id = String(tuple[0] || '');
                const auditor = String(tuple[1] || '');
                const time = String(tuple[2] || '');
                if (normName(auditor) !== want) return;
                collected.push(
                  stripSensitive({
                    caseNo: String(noById.get(id) || id).trim(),
                    address: String(addrById.get(id) || '').trim(),
                    kind: '複審（合約明細）',
                    handledAt: time.slice(0, 16).replace(/-/g, '/'),
                    source: 'contract-reviewers'
                  })
                );
              });
            } catch (_) {
              /* chunk fail */
            }
          }
        } catch (e) {
          errors.push('reviewers ' + m.month + '月: ' + (e.message || e));
        }
      }
      mi += 1;
    }

    const dedup = new Map();
    collected.forEach((r) => {
      const k = rowKey(r);
      if (!dedup.has(k)) dedup.set(k, r);
    });
    const list = [...dedup.values()].sort((a, b) => String(b.handledAt).localeCompare(String(a.handledAt)));
    return { list, errors };
  }

  function filtered() {
    const f = state.filter;
    return state.rows.filter((row) => {
      const k = rowKey(row);
      const p = checkPct(k);
      if (f === 'open') return p.done < p.total;
      if (f === 'done') return p.done >= p.total;
      if (f === 'repair') return /修繕/.test(row.kind || '');
      if (f === 'term') return /解約/.test(row.kind || '');
      return true;
    });
  }

  function setMsg(t, err) {
    state.msg = t || '';
    state.msgErr = !!err;
  }

  async function load() {
    state.loading = true;
    setMsg('讀取近 ' + state.months + ' 個業績月經手紀錄…（可能需數十秒）');
    render();
    try {
      await loadCloudProgress(state.leaveName);
      const { list, errors } = await fetchAll();
      state.rows = list;
      setMsg(
        '共 ' + list.length + ' 筆經手紀錄' + (errors.length ? '；部分來源失敗：' + errors.slice(0, 3).join('；') : ''),
        errors.length > 0 && list.length === 0
      );
    } catch (e) {
      setMsg(String(e.message || e), true);
    }
    state.loading = false;
    render();
  }

  function applyBatch() {
    const name = String(state.batchAssignee || '').trim();
    if (!name) {
      setMsg('請先填批次接手人', true);
      render();
      return;
    }
    filtered().forEach((row) => setAssignee(rowKey(row), name));
    setMsg('已套用接手人「' + name + '」至目前篩選清單', false);
    render();
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    const headers = ['案號', '地址', '經手類型', '經手日', '接手人', 'checklist進度', '資料來源'];
    CHECKS.forEach((c) => headers.push(c.label));
    const lines = [headers.map(csvCell).join(',')];
    state.rows.forEach((row) => {
      const k = rowKey(row);
      const prog = progressOf(k);
      const pct = checkPct(k);
      const cells = [row.caseNo, row.address || '—', row.kind, row.handledAt, prog.assignee, pct.done + '/' + pct.total, row.source];
      CHECKS.forEach((c) => cells.push(prog.checks[c.key] ? 'V' : ''));
      lines.push(cells.map(csvCell).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '行政離職交接_' + (normName(state.leaveName) || 'export') + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function dash(v) {
    const s = String(v == null ? '' : v).trim();
    return s || '—';
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const list = filtered();

    root.innerHTML =
      '<div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-4 md:p-6 space-y-4 shadow-sm">' +
      '<header class="space-y-1">' +
      '<h2 class="text-2xl md:text-3xl font-bold text-slate-900 text-center">🤝 行政離職交接</h2>' +
      '</header>' +
      '<div class="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 leading-relaxed">' +
      '<p class="font-semibold text-slate-800 mb-1">使用方法</p>' +
      '<ol class="list-decimal ml-5 space-y-0.5">' +
      '<li>輸入離職行政姓名，按「載入」</li>' +
      '<li>指定接手人（可批次套用）</li>' +
      '<li>每件交接完成就勾選清單（進度自動儲存，換電腦也看得到）</li>' +
      '<li>全部完成後可匯出 CSV</li>' +
      '</ol>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
      '<label class="block text-sm font-semibold text-slate-700">離職行政姓名' +
      '<input id="ah-leave" type="text" class="mt-1 w-full px-3 py-2 border-2 border-slate-200 rounded-xl" value="' +
      esc(state.leaveName) +
      '" placeholder="與審核人姓名相同" /></label>' +
      '<label class="block text-sm font-semibold text-slate-700">回溯業績月數' +
      '<input id="ah-months" type="number" min="1" max="24" class="mt-1 w-full px-3 py-2 border-2 border-slate-200 rounded-xl" value="' +
      esc(state.months) +
      '" /></label>' +
      '<label class="block text-sm font-semibold text-slate-700">批次接手人' +
      '<div class="mt-1 flex gap-2">' +
      '<input id="ah-batch" type="text" class="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl" value="' +
      esc(state.batchAssignee) +
      '" />' +
      '<button type="button" id="ah-batch-btn" class="btn tone-slate-mid px-3 py-2 font-bold shrink-0">套用</button>' +
      '</div></label>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2 items-center">' +
      '<button type="button" id="ah-load" class="btn tone-indigo px-4 py-2 font-bold"' +
      (state.loading ? ' disabled' : '') +
      '>' +
      (state.loading ? '載入中…' : '載入') +
      '</button>' +
      '<button type="button" id="ah-export" class="btn tone-slate-soft px-4 py-2 font-bold">匯出 CSV</button>' +
      '<span class="text-xs text-slate-500">目前 ' +
      state.rows.length +
      ' 筆</span>' +
      '<span id="ah-sync" class="text-xs ' +
      (state.syncErr ? 'text-amber-800 font-semibold' : 'text-emerald-700 font-semibold') +
      '"' +
      (state.syncNotice ? '' : ' hidden') +
      '>' +
      esc(state.syncNotice) +
      '</span>' +
      '</div>' +
      (state.msg
        ? '<p class="text-sm ' + (state.msgErr ? 'text-rose-700 font-semibold' : 'text-slate-600') + '">' + esc(state.msg) + '</p>'
        : '') +
      '<div class="flex flex-wrap gap-2">' +
      [
        ['all', '全部'],
        ['open', '未完成'],
        ['done', '已完成'],
        ['repair', '修繕'],
        ['term', '解約']
      ]
        .map(
          ([k, lab]) =>
            '<button type="button" class="btn btn-sm ' +
            (state.filter === k ? 'tone-indigo' : 'tone-slate-soft') +
            '" data-ah-filter="' +
            k +
            '">' +
            lab +
            '</button>'
        )
        .join('') +
      '</div>' +
      '<div class="bh-list-toolbar">' +
      '<p class="text-sm font-bold text-slate-800">經手清單 <span class="text-indigo-700">共 ' +
      list.length +
      ' 筆</span></p>' +
      '<div class="bh-list-actions">' +
      '<button type="button" class="btn btn-sm tone-slate-soft" id="ah-expand-all">全部展開</button>' +
      '<button type="button" class="btn btn-sm tone-slate-soft" id="ah-collapse-all">全部收合</button>' +
      '</div>' +
      '<p class="bh-list-toolbar__hint">先掃案件列 → 點開展開卡片 → 勾選交接清單</p>' +
      '</div>' +
      '<div class="bh-list">' +
      (list.length
        ? list
            .map((row) => {
              const k = rowKey(row);
              const prog = progressOf(k);
              const pct = checkPct(k);
              const meta = toneOf(pct);
              const open = !!state.expanded[k];
              const tags = [];
              if (row.kind) tags.push('<span class="bh-chip is-info">' + esc(row.kind) + '</span>');
              if (row.handledAt) tags.push('<span class="bh-chip">' + esc(row.handledAt) + '</span>');
              return (
                '<article class="bh-case ' +
                meta.tone +
                (open ? ' is-open' : '') +
                '" data-ah-case="' +
                esc(k) +
                '">' +
                '<div class="bh-case-scan">' +
                '<button type="button" class="bh-case-toggle" data-ah-toggle="' +
                esc(k) +
                '" aria-expanded="' +
                (open ? 'true' : 'false') +
                '">' +
                '<span class="bh-case-chevron" aria-hidden="true">▾</span>' +
                '<span class="bh-case-main">' +
                '<span class="bh-case-id">' +
                esc(dash(row.caseNo)) +
                '</span>' +
                '<span class="bh-case-addr">' +
                esc(dash(row.address)) +
                '</span>' +
                '<span class="bh-case-sub">' +
                esc(dash(row.kind)) +
                ' · ' +
                esc(dash(row.handledAt)) +
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
                '<input type="text" data-ah-assignee="' +
                esc(k) +
                '" value="' +
                esc(prog.assignee) +
                '" placeholder="填寫接手人" /></div></div>' +
                '<div class="bh-case-panel">' +
                '<div class="bh-case-facts">' +
                '<div class="bh-fact"><span class="bh-fact__k">案號</span><span class="bh-fact__v">' +
                esc(dash(row.caseNo)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">地址</span><span class="bh-fact__v">' +
                esc(dash(row.address)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">經手類型</span><span class="bh-fact__v">' +
                esc(dash(row.kind)) +
                '</span></div>' +
                '<div class="bh-fact"><span class="bh-fact__k">經手日</span><span class="bh-fact__v">' +
                esc(dash(row.handledAt)) +
                '</span></div></div>' +
                checklistHtml(k, prog, pct, meta.tone, meta.status) +
                '</div></article>'
              );
            })
            .join('')
        : '<div class="bh-empty">尚無資料。請輸入姓名後按「載入」。</div>') +
      '</div></div>';

    wire(root);
  }

  function wire(root) {
    const leave = root.querySelector('#ah-leave');
    const months = root.querySelector('#ah-months');
    const batch = root.querySelector('#ah-batch');
    if (leave) {
      leave.addEventListener('change', () => {
        state.leaveName = leave.value;
      });
    }
    if (months) {
      months.addEventListener('change', () => {
        state.months = Number(months.value) || 12;
      });
    }
    if (batch) {
      batch.addEventListener('change', () => {
        state.batchAssignee = batch.value;
      });
    }
    root.querySelector('#ah-batch-btn')?.addEventListener('click', () => {
      state.batchAssignee = batch ? batch.value : state.batchAssignee;
      applyBatch();
    });
    root.querySelector('#ah-load')?.addEventListener('click', () => {
      state.leaveName = leave ? leave.value : state.leaveName;
      state.months = months ? Number(months.value) || 12 : state.months;
      void load();
    });
    root.querySelector('#ah-export')?.addEventListener('click', exportCsv);
    root.querySelectorAll('[data-ah-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.getAttribute('data-ah-filter') || 'all';
        render();
      });
    });
    root.querySelector('#ah-expand-all')?.addEventListener('click', () => {
      filtered().forEach((row) => {
        state.expanded[rowKey(row)] = true;
      });
      render();
    });
    root.querySelector('#ah-collapse-all')?.addEventListener('click', () => {
      state.expanded = Object.create(null);
      render();
    });
    root.querySelectorAll('[data-ah-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-ah-toggle') || '';
        if (!k) return;
        state.expanded[k] = !state.expanded[k];
        render();
      });
    });
    root.querySelectorAll('[data-ah-assignee]').forEach((inp) => {
      inp.addEventListener('change', () => {
        setAssignee(inp.getAttribute('data-ah-assignee'), inp.value);
        paintSyncNotice();
      });
    });
    root.querySelectorAll('[data-ah-check]').forEach((inp) => {
      inp.addEventListener('change', () => {
        setCheck(inp.getAttribute('data-ah-check'), inp.getAttribute('data-ck'), inp.checked);
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

  global.AdminHandover = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
