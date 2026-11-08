/**
 * 業務專區 › 離職交接（v2 可點擊流程圖）
 * 對齊催收 term-sop；逐案檢核掛在節點工作區。不改催收。不部署遠端。
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'biz-handover-root';
  const PAGE_ID = 'page-business-handover';
  const KIND = 'biz';
  const RPA_BASE = String(
    global.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev'
  ).replace(/\/$/, '');
  const HANDOVER_RPA_BASE = String(
    global.SKYFUN_HANDOVER_RPA_BASE || 'https://skyfun-arrears-rpa-preview.dahwork123.workers.dev'
  ).replace(/\/$/, '');
  const C = () => global.HandoverCore;

  let state = {
    mounted: false,
    bag: null,
    list: [],
    role: '',
    msg: '',
    msgErr: false,
    backendHint: '',
    openStage: 'basics',
    matterFilter: 'all',
    focusMatterId: ''
  };

  function esc(s) {
    return C() ? C().esc(s) : String(s || '');
  }

  function setMsg(t, err) {
    state.msg = t || '';
    state.msgErr = !!err;
    const el = document.getElementById('bh-msg');
    if (!el) return;
    el.textContent = state.msg;
    el.className = 'bh-msg ' + (state.msgErr ? 'is-err' : 'is-ok');
    el.hidden = !state.msg;
  }

  async function refreshList() {
    const res = await C().rpc('toolbox_handover_case_list', { p_kind: KIND });
    state.list = res.rows || [];
  }

  async function openCase(id) {
    const res = await C().rpc('toolbox_handover_case_get', { p_id: Number(id) });
    state.bag = res;
    state.role = res.role || '';
  }

  function tokenHeader() {
    const t = C().token();
    return t ? { Authorization: 'Bearer ' + t, 'X-Skyfun-Session': t } : {};
  }

  async function fetchAuthorizedCases(sales) {
    const q = encodeURIComponent(sales);
    const url = HANDOVER_RPA_BASE + '/handover/sales-cases?sales=' + q;
    try {
      const res = await fetch(url, { headers: tokenHeader() });
      if (!res.ok) throw new Error('授權清單讀取失敗 HTTP ' + res.status);
      const data = await res.json();
      const rows = Array.isArray(data.cases) ? data.cases : Array.isArray(data.data) ? data.data : [];
      return rows.map((r) => ({
        matchNo: String(r.matchNo || r.MatchNo || '').trim(),
        address: String(r.address || r.rentAddress || '').trim(),
        landlord: String(r.landlord || r.landlordName || '').trim(),
        tenant: String(r.tenant || r.tenantName || '').trim(),
        leaseStart: String(r.leaseStart || '').trim(),
        leaseEnd: String(r.leaseEnd || '').trim(),
        rent: String(r.rent || r.rentAmount || '').trim(),
        caseType: String(r.caseType || r.contratType || '').trim(),
        statusSnapshot: String(r.applyStatus || r.status || '').trim(),
        contractActive: /已生效|履約|出租中|進行/.test(String(r.applyStatus || r.status || '已生效')),
        source: 'authorized_worker',
        pendingVerify: true
      }));
    } catch (e) {
      return { error: e.message || String(e), rows: [] };
    }
  }

  function matterEditor(m, mode) {
    const locked = state.bag.case.locked || state.bag.case.status === 'closed';
    const canEdit =
      !locked &&
      (state.role === 'transferor' || state.role === 'admin') &&
      ['draft', 'returned', 'transferor_done'].indexOf(state.bag.case.status) >= 0;
    const canRecv = !locked && state.role === 'receiver';
    const canMgr = !locked && state.role === 'manager';
    const checks = m.checks || {};
    const focus = String(state.focusMatterId) === String(m.id);
    const showRepair = !mode || mode === 'repair' || mode === 'all';
    const showSubsidy = !mode || mode === 'subsidy' || mode === 'all';
    const showSpecial = !mode || mode === 'special' || mode === 'all';
    const defs = C().BIZ_CHECK_DEFS.filter((d) => {
      if (d.key === 'complete') return mode === 'all' || !mode;
      if (/^repair/.test(d.key)) return showRepair;
      if (/^subsidy/.test(d.key)) return showSubsidy;
      if (d.key === 'specialTerms') return showSpecial;
      return mode === 'all';
    });

    return (
      '<article class="bh-matter is-edit' +
      (focus ? ' is-focus' : '') +
      (C().matterOverdue(m) ? ' is-overdue' : '') +
      (m.handoverDone ? ' is-done' : '') +
      '" data-matter-id="' +
      m.id +
      '" id="bh-matter-' +
      m.id +
      '">' +
      '<header><b>' +
      esc(m.matchNo || '—') +
      '</b> ' +
      esc(m.address) +
      '<br/><small>來源 ' +
      esc(m.source) +
      (m.pendingVerify ? ' · <span class="bh-tag">待核</span>' : '') +
      (C().matterOverdue(m) ? ' · <span class="bh-tag is-late">逾期</span>' : '') +
      ' · 履約中 ' +
      (m.contractActive ? '是' : '否') +
      ' · 交接 ' +
      (m.handoverDone ? '完成' : '未完成') +
      '</small></header>' +
      (canEdit
        ? '<div class="bh-checks">' +
          defs
            .map((d) => {
              const on = checks[d.key] === true || checks[d.key] === 'true';
              return (
                '<label><input type="checkbox" data-ck="' +
                d.key +
                '"' +
                (on ? ' checked' : '') +
                '/> ' +
                esc(d.label) +
                '</label>'
              );
            })
            .join('') +
          '<label>單據／補件進度<textarea data-f="docsNote">' +
          esc(checks.docsNote || checks.subsidyProgress || '') +
          '</textarea></label>' +
          '<label>特別約定說明<textarea data-f="specialNote">' +
          esc(checks.specialNote || '') +
          '</textarea></label>' +
          '<label>案件現況<textarea data-f="currentStatus">' +
          esc(m.currentStatus) +
          '</textarea></label>' +
          '<label>待辦事項<textarea data-f="todos">' +
          esc(m.todos) +
          '</textarea></label>' +
          '<label>接手人<input data-f="receiverName" value="' +
          esc(m.receiverName) +
          '"/></label>' +
          '<label>完成期限<input data-f="dueDate" type="date" value="' +
          esc(m.dueDate || '') +
          '"/></label>' +
          '<button type="button" class="btn btn-sm" data-bh-save-matter="' +
          m.id +
          '">儲存本案檢核（草稿）</button></div>'
        : '<p>' + esc(m.currentStatus || '—') + '</p>') +
      (canRecv
        ? '<label><input type="checkbox" data-bh-recv-matter="' +
          m.id +
          '"' +
          (m.receiverOk ? ' checked' : '') +
          '/> 接手人確認本案</label>'
        : '') +
      (canMgr
        ? '<div class="bh-phone"><label><input type="checkbox" data-bh-phone="' +
          m.id +
          '"' +
          (m.phoneCheckOk ? ' checked' : '') +
          '/> 主管電話照會已確認</label>' +
          '<input data-bh-phone-note="' +
          m.id +
          '" placeholder="照會摘要" value="' +
          esc(m.phoneCheckNote) +
          '"/>' +
          '<button type="button" class="btn btn-sm" data-bh-save-phone="' +
          m.id +
          '">儲存照會</button></div>'
        : '') +
      '</article>'
    );
  }

  function matterToolbar() {
    const filter = state.matterFilter || 'all';
    const chips = [
      ['all', '全部'],
      ['undone', '未完成'],
      ['pending', '待補件／待核'],
      ['overdue', '逾期'],
      ['review', '待覆核']
    ];
    return (
      '<div class="bh-matter-toolbar">' +
      chips
        .map(
          (c) =>
            '<button type="button" class="bh-chip' +
            (filter === c[0] ? ' is-on' : '') +
            '" data-bh-matter-filter="' +
            c[0] +
            '">' +
            c[1] +
            '</button>'
        )
        .join('') +
      '<button type="button" class="btn btn-sm" data-bh-focus-blockers>定位卡住案件</button></div>'
    );
  }

  function mattersList(mode) {
    const list = C().filterMatters(state.bag.matters || [], state.matterFilter);
    return (
      matterToolbar() +
      (list.length
        ? list.map((m) => matterEditor(m, mode)).join('')
        : '<p class="bh-empty">沒有符合篩選的案件。可匯入授權清單或手增。</p>')
    );
  }

  function stageMeta(stage) {
    const st = C().stageStatusOf(KIND, stage, state.bag);
    const prog = C().stageProgressOf(KIND, stage, state.bag);
    const gate = C().stageOpenGate(stage, state.bag);
    return (
      '<div class="bh-sop-detail-head">' +
      '<span class="bh-sop-num">' +
      stage.n +
      '</span>' +
      '<div><p class="bh-sop-owner">' +
      esc(stage.owner) +
      ' · <span class="bh-sop-status" data-st="' +
      esc(st) +
      '">' +
      esc(C().stageStatusLabel(st)) +
      '</span></p><h3>' +
      esc(stage.title) +
      '</h3>' +
      '<p class="bh-sop-blurb">' +
      esc(stage.blurb) +
      (prog.total ? ' · ' + prog.done + '／' + prog.total + ' 案' : '') +
      '</p>' +
      (!gate.open ? '<p class="bh-warn">' + esc(gate.reason) + '</p>' : '') +
      '</div>' +
      '<button type="button" class="bh-sop-close" data-bh-stage-close aria-label="關閉">✕</button></div>'
    );
  }

  function panelBasics() {
    const c = state.bag.case;
    return (
      '<p class="bh-liability-note">告知（流程圖原文精神，非系統認定）：勾選未確實致生賠償時，由承接人員及單位主管共同承擔——是否顯示／效力待公司確認。</p>' +
      '<div class="bh-basic cardish"><div class="bh-grid">' +
      '<label>接手人<input id="bh-receiver" value="' +
      esc(c.receiverName) +
      '"/></label>' +
      '<label>單位主管<input id="bh-manager" value="' +
      esc(c.managerName) +
      '"/></label>' +
      '<label>離職日<input id="bh-leave-date" type="date" value="' +
      esc(c.leaveDate || '') +
      '"/></label>' +
      '<label>最後工作日<input id="bh-last-work" type="date" value="' +
      esc(c.lastWorkDate || '') +
      '"/></label></div>' +
      '<button type="button" class="btn btn-sm" data-bh-save-basic>儲存草稿</button></div>' +
      '<div class="bh-actions">' +
      '<button type="button" class="btn btn-sm" data-bh-import>自授權介面匯入案件（待核）</button>' +
      '<button type="button" class="btn btn-sm" data-bh-add-blank>手增空白案</button></div>' +
      '<p class="bh-hint">履約中 ≠ 交接未完成。匯入授權清單會標「待核」。</p>' +
      mattersList('all')
    );
  }

  function panelAccounts() {
    const c = state.bag.case;
    return (
      '<p class="bh-hint">可提前準備停用清單；移交人確認送出前，本階段不算已完成。</p>' +
      '<fieldset class="bh-disable"><legend>系統權限停用核實</legend>' +
      '<label><input type="checkbox" id="bh-need-disable"' +
      (c.accountNeedDisable ? ' checked' : '') +
      '/> 需停用</label>' +
      '<label>執行人<input id="bh-dis-by" value="' +
      esc(c.accountDisabledBy) +
      '"/></label>' +
      '<label>時間<input id="bh-dis-at" type="datetime-local" value="' +
      esc((c.accountDisabledAt || '').slice(0, 16)) +
      '"/></label>' +
      '<label>證據<input id="bh-dis-ev" value="' +
      esc(c.accountDisableEvidence) +
      '"/></label></fieldset>' +
      '<button type="button" class="btn btn-sm" data-bh-save-basic>儲存停用核實（草稿）</button>'
    );
  }

  function panelSign(kind) {
    if (kind === 'transferor') {
      return (
        '<p class="bh-hint">請確認修繕／補助／特別約定逐案後再送出。儲存草稿不算完成。</p>' +
        C().blockersHtml(state.bag.blockers) +
        '<div class="bh-actions"><button type="button" class="btn" data-bh-submit>移交人送出</button></div>'
      );
    }
    if (kind === 'receiver') {
      return (
        '<p class="bh-hint">逐案勾「接手人確認本案」後按完成。</p>' +
        mattersList('all') +
        '<div class="bh-actions"><button type="button" class="btn" data-bh-recv>接手人確認完成</button></div>'
      );
    }
    if (kind === 'manager_call') {
      return (
        '<p class="bh-hint">主管逐案電話照會並留下摘要。</p>' +
        mattersList('all')
      );
    }
    return (
      C().blockersHtml(state.bag.blockers) +
      '<div class="bh-actions">' +
      '<button type="button" class="btn" data-bh-mgr>主管複核完成</button>' +
      '<button type="button" class="btn tone-rose" data-bh-return>退回</button>' +
      '<button type="button" class="btn tone-emerald" data-bh-close>結案</button>' +
      '<button type="button" class="btn tone-slate-soft" data-bh-print>列印</button></div>'
    );
  }

  function stagePanelHtml() {
    const stage = C().stagesOf(KIND).find((s) => s.id === state.openStage);
    if (!stage) return '';
    let body = '';
    if (stage.kind === 'basics') body = panelBasics();
    else if (stage.kind === 'matters_repair') body = mattersList('repair');
    else if (stage.kind === 'matters_subsidy') body = mattersList('subsidy');
    else if (stage.kind === 'matters_special') body = mattersList('special');
    else if (stage.kind === 'sign_transferor') body = panelSign('transferor');
    else if (stage.kind === 'sign_receiver') body = panelSign('receiver');
    else if (stage.kind === 'manager_call') body = panelSign('manager_call');
    else if (stage.kind === 'accounts') body = panelAccounts();
    else if (stage.kind === 'sign_manager') body = panelSign('manager');
    else body = '<p class="bh-empty">此階段尚無工作區。</p>';

    return (
      '<div class="bh-sop-detail">' +
      '<div class="bh-sop-detail-inner">' +
      stageMeta(stage) +
      body +
      '<details class="bh-audit"><summary>操作歷程</summary><ul>' +
      (state.bag.events || [])
        .map((e) => '<li>' + esc(e.createdAt) + ' · ' + esc(e.actorName) + ' · ' + esc(e.action) + '</li>')
        .join('') +
      '</ul></details></div></div>'
    );
  }

  function renderDetail() {
    const bag = state.bag;
    const c = bag.case;
    return (
      '<section class="bh-detail">' +
      '<button type="button" class="btn btn-sm tone-slate-soft" data-bh-back>← 列表</button>' +
      C().caseHeaderHtml(KIND, bag, state.role) +
      '<h4 class="bh-sop-title">交接流程<small>點節點開啟工作區</small></h4>' +
      C().sopBoardHtml(KIND, bag, state.openStage) +
      stagePanelHtml() +
      '</section>'
    );
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML =
      '<div class="bh-shell">' +
      '<header class="bh-hero"><p class="bh-kicker">業務專區</p><h2>業務離職交接</h2>' +
      '<p class="bh-lead">可點擊流程圖：逐案檢核修繕／補助／特別約定；三方線上簽核。結案由後端驗證。</p>' +
      (state.backendHint ? '<p class="bh-warn">' + esc(state.backendHint) + '</p>' : '') +
      '</header><p id="bh-msg" class="bh-msg" hidden></p>' +
      (state.bag
        ? renderDetail()
        : '<div class="bh-home"><div class="bh-create">' +
          '<h3>新建業務交接</h3>' +
          '<label>離職業務<input id="bh-new-name" placeholder="移交人"/></label>' +
          '<label>接手人<input id="bh-new-recv"/></label>' +
          '<label>單位主管<input id="bh-new-mgr"/></label>' +
          '<button type="button" class="btn" data-bh-create>建立</button>' +
          '<button type="button" class="btn tone-slate-soft" data-bh-migrate>匯入舊勾選</button></div>' +
          '<h3>案件</h3><ul class="bh-case-index">' +
          (state.list.length
            ? state.list
                .map(
                  (c) =>
                    '<li><button type="button" data-bh-open="' +
                    c.id +
                    '"><b>' +
                    esc(c.transferorName) +
                    '</b> · ' +
                    esc(C().statusLabel(c.status)) +
                    '</button></li>'
                )
                .join('')
            : '<li class="bh-empty">尚無案件</li>') +
          '</ul></div>') +
      '</div>';
    if (state.msg) setMsg(state.msg, state.msgErr);
    if (state.focusMatterId) {
      const el = document.getElementById('bh-matter-' + state.focusMatterId);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async function safe(fn) {
    try {
      await fn();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (/function|schema|does not exist|PGRST/i.test(msg)) {
        state.backendHint =
          '後端 handover-v2 尚未套用。未套用前無法強制結案控管；請確認後再 migration。';
      }
      setMsg(msg + (e.blockers ? '｜' + e.blockers.join('；') : ''), true);
    } finally {
      render();
    }
  }

  function collectMatterPayload(art, matterId) {
    const form = { complete: false };
    art.querySelectorAll('[data-ck]').forEach((el) => {
      form[el.getAttribute('data-ck')] = el.checked;
    });
    art.querySelectorAll('[data-f]').forEach((el) => {
      form[el.getAttribute('data-f')] = el.value;
    });
    form.subsidyProgress = form.docsNote || '';
    const checks = C().buildBizChecks(form);
    return {
      id: Number(matterId),
      checks: checks,
      currentStatus: form.currentStatus || '',
      todos: form.todos || '',
      receiverName: form.receiverName || '',
      dueDate: form.dueDate || '',
      handoverDone: !!form.complete && checks.incomplete !== 'true',
      pendingVerify: true
    };
  }

  function wire() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.wired === '1') return;
    root.dataset.wired = '1';
    root.addEventListener('click', (ev) => {
      const stageBtn = ev.target.closest('[data-bh-stage]');
      if (stageBtn && root.contains(stageBtn)) {
        const id = stageBtn.getAttribute('data-bh-stage');
        state.openStage = state.openStage === id ? '' : id;
        render();
        return;
      }
      const blocker = ev.target.closest('[data-bh-blocker]');
      if (blocker) {
        state.openStage = blocker.getAttribute('data-bh-blocker') || state.openStage;
        render();
        return;
      }
      if (ev.target.closest('[data-bh-stage-close]')) {
        state.openStage = '';
        render();
        return;
      }
      const filterBtn = ev.target.closest('[data-bh-matter-filter]');
      if (filterBtn) {
        state.matterFilter = filterBtn.getAttribute('data-bh-matter-filter') || 'all';
        render();
        return;
      }
      if (ev.target.closest('[data-bh-focus-blockers]')) {
        const stuck = (state.bag.matters || []).find(
          (m) => !m.handoverDone || C().matterOverdue(m) || m.pendingVerify
        );
        if (stuck) {
          state.focusMatterId = stuck.id;
          state.matterFilter = C().matterOverdue(stuck) ? 'overdue' : 'undone';
          render();
        } else {
          setMsg('目前沒有卡住的案件', false);
        }
        return;
      }

      const t = ev.target.closest(
        '[data-bh-create],[data-bh-open],[data-bh-back],[data-bh-save-basic],[data-bh-save-matter],[data-bh-import],[data-bh-add-blank],[data-bh-submit],[data-bh-recv],[data-bh-mgr],[data-bh-return],[data-bh-close],[data-bh-print],[data-bh-migrate],[data-bh-recv-matter],[data-bh-save-phone]'
      );
      if (!t) return;
      if (t.hasAttribute('data-bh-back')) {
        state.bag = null;
        state.openStage = 'basics';
        render();
        return;
      }
      if (t.hasAttribute('data-bh-print') && state.bag) {
        C().printWindow('業務離職移交', C().buildPrintHtml('biz', state.bag));
        return;
      }
      if (t.hasAttribute('data-bh-open')) {
        void safe(async () => {
          await openCase(t.getAttribute('data-bh-open'));
          state.openStage = 'basics';
        });
        return;
      }
      if (t.hasAttribute('data-bh-create')) {
        void safe(async () => {
          const res = await C().rpc('toolbox_handover_case_create', {
            p_kind: KIND,
            p_transferor: document.getElementById('bh-new-name').value.trim(),
            p_data: {
              receiverName: document.getElementById('bh-new-recv').value.trim(),
              managerName: document.getElementById('bh-new-mgr').value.trim()
            }
          });
          await openCase(res.case.id);
          state.openStage = 'basics';
          await refreshList();
        });
        return;
      }
      if (t.hasAttribute('data-bh-migrate')) {
        void safe(async () => {
          const name = document.getElementById('bh-new-name').value.trim() || C().meName();
          const res = await C().rpc('toolbox_handover_migrate_v1', { p_kind: KIND, p_person: name });
          await openCase(res.caseId);
          state.openStage = 'basics';
        });
        return;
      }
      if (!state.bag) return;
      const id = state.bag.case.id;
      if (t.hasAttribute('data-bh-save-basic')) {
        void safe(async () => {
          const data = {
            receiverName: (document.getElementById('bh-receiver') || {}).value,
            managerName: (document.getElementById('bh-manager') || {}).value,
            leaveDate: (document.getElementById('bh-leave-date') || {}).value,
            lastWorkDate: (document.getElementById('bh-last-work') || {}).value
          };
          const need = document.getElementById('bh-need-disable');
          if (need) {
            data.accountNeedDisable = need.checked;
            data.accountDisabledBy = (document.getElementById('bh-dis-by') || {}).value;
            data.accountDisabledAt = document.getElementById('bh-dis-at') && document.getElementById('bh-dis-at').value
              ? new Date(document.getElementById('bh-dis-at').value).toISOString()
              : '';
            data.accountDisableEvidence = (document.getElementById('bh-dis-ev') || {}).value;
          }
          await C().rpc('toolbox_handover_case_update', { p_id: id, p_data: data });
          await openCase(id);
          setMsg('已存草稿', false);
        });
      } else if (t.hasAttribute('data-bh-save-matter')) {
        const mid = t.getAttribute('data-bh-save-matter');
        const art = t.closest('.bh-matter');
        void safe(async () => {
          await C().rpc('toolbox_handover_matter_upsert', {
            p_case_id: id,
            p_data: collectMatterPayload(art, mid)
          });
          await openCase(id);
          setMsg('本案檢核已存（草稿）', false);
        });
      } else if (t.hasAttribute('data-bh-recv-matter')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_matter_upsert', {
            p_case_id: id,
            p_data: { id: Number(t.getAttribute('data-bh-recv-matter')), receiverOk: t.checked }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-bh-save-phone')) {
        const mid = t.getAttribute('data-bh-save-phone');
        const note = root.querySelector('[data-bh-phone-note="' + mid + '"]');
        const ck = root.querySelector('[data-bh-phone="' + mid + '"]');
        void safe(async () => {
          await C().rpc('toolbox_handover_matter_upsert', {
            p_case_id: id,
            p_data: {
              id: Number(mid),
              phoneCheckOk: !!(ck && ck.checked),
              phoneCheckNote: note ? note.value : ''
            }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-bh-import')) {
        void safe(async () => {
          const sales = state.bag.case.transferorName;
          const got = await fetchAuthorizedCases(sales);
          if (got.error) throw new Error(got.error + '（可改用手增）');
          const rows = got.rows || got;
          let n = 0;
          for (const r of rows) {
            await C().rpc('toolbox_handover_matter_upsert', {
              p_case_id: id,
              p_data: Object.assign({}, r, {
                checks: { complete: 'false', incomplete: 'true' },
                handoverDone: false,
                currentStatus: '待逐案檢核'
              })
            });
            n += 1;
          }
          await openCase(id);
          setMsg('已匯入 ' + n + ' 筆（待核），請逐案完成檢核', false);
        });
      } else if (t.hasAttribute('data-bh-add-blank')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_matter_upsert', {
            p_case_id: id,
            p_data: {
              matchNo: '手填-' + Date.now(),
              address: '',
              source: 'manual',
              pendingVerify: true,
              checks: { complete: 'false', incomplete: 'true' },
              handoverDone: false
            }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-bh-submit')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_submit_transferor', { p_id: id });
          await openCase(id);
          state.openStage = 'receiver_review';
        });
      } else if (t.hasAttribute('data-bh-recv')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_confirm_receiver', { p_id: id });
          await openCase(id);
          state.openStage = 'manager_call';
        });
      } else if (t.hasAttribute('data-bh-mgr')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_confirm_manager', { p_id: id });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-bh-return')) {
        const reason = prompt('退回理由（必填）');
        if (reason == null) return;
        void safe(async () => {
          await C().rpc('toolbox_handover_return', { p_id: id, p_reason: reason });
          await openCase(id);
          state.openStage = 'transferor_sign';
        });
      } else if (t.hasAttribute('data-bh-close')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_close', { p_id: id });
          await openCase(id);
        });
      }
    });
  }

  async function mount() {
    if (!document.getElementById(ROOT_ID)) return;
    state.mounted = true;
    wire();
    await safe(async () => {
      try {
        await refreshList();
      } catch (e) {
        state.list = [];
        throw e;
      }
    });
  }

  const page = document.getElementById(PAGE_ID);
  if (page) {
    new MutationObserver(() => {
      if (!page.classList.contains('hidden') && !state.mounted) void mount();
      if (page.classList.contains('hidden')) state.mounted = false;
    }).observe(page, { attributes: true, attributeFilter: ['class'] });
  }
  global.BizHandover = { mount };
  void RPA_BASE;
})(typeof window !== 'undefined' ? window : globalThis);
