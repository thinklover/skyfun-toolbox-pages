/**
 * 行政專區 › 離職交接（v2 可點擊流程圖）
 * 對齊催收 term-sop：節點板 → 同頁工作區。不改催收邏輯。不部署遠端。
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'admin-handover-root';
  const PAGE_ID = 'page-admin-handover';
  const KIND = 'admin';
  const C = () => global.HandoverCore;

  let state = {
    mounted: false,
    loading: false,
    msg: '',
    msgErr: false,
    list: [],
    bag: null,
    role: '',
    backendOk: true,
    backendHint: '',
    openStage: 'basics',
    matterFilter: 'all'
  };

  function esc(s) {
    return C() ? C().esc(s) : String(s || '');
  }

  function setMsg(t, err) {
    state.msg = t || '';
    state.msgErr = !!err;
    const el = document.getElementById('ah-msg');
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
    state.backendOk = true;
    if (!state.openStage) state.openStage = 'basics';
  }

  function renderList() {
    if (!state.list.length) {
      return '<p class="bh-empty">尚無行政離職交接案件。請新建（可標記離職或留職停薪）。</p>';
    }
    return (
      '<ul class="bh-case-index">' +
      state.list
        .map((c) => {
          return (
            '<li><button type="button" data-ah-open="' +
            c.id +
            '"><b>' +
            esc(c.transferorName) +
            '</b> · ' +
            esc(C().statusLabel(c.status)) +
            ' · ' +
            esc(c.region || '未填地區') +
            '</button></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function itemEditor(i) {
    const locked = state.bag.case.locked || state.bag.case.status === 'closed';
    const canEdit =
      !locked &&
      (state.role === 'transferor' || state.role === 'admin') &&
      ['draft', 'returned', 'transferor_done'].indexOf(state.bag.case.status) >= 0;
    const canRecv = !locked && state.role === 'receiver';
    const canMgr = !locked && state.role === 'manager';
    return (
      '<article class="bh-item" data-item-id="' +
      i.id +
      '">' +
      '<header><b>' +
      esc(i.label) +
      '</b><small>' +
      esc(C().SECTION_LABEL[i.section] || i.section) +
      '</small></header>' +
      (canEdit
        ? '<div class="bh-item-fields">' +
          '<label>結果<select data-f="result">' +
          ['unset', 'yes', 'no', 'na', 'done', 'pending']
            .map((v) => '<option value="' + v + '"' + (i.result === v ? ' selected' : '') + '>' + v + '</option>')
            .join('') +
          '</select></label>' +
          '<label>數量<input data-f="qty" value="' +
          esc(i.qty) +
          '"/></label>' +
          '<label>路徑／說明<input data-f="pathNote" value="' +
          esc(i.pathNote) +
          '"/></label>' +
          '<label>現況／進度<textarea data-f="progressNote">' +
          esc(i.progressNote) +
          '</textarea></label>' +
          '<label>交接人<input data-f="handoverPerson" value="' +
          esc(i.handoverPerson) +
          '"/></label>' +
          '<label>備註／不適用理由<input data-f="remark" value="' +
          esc(i.remark) +
          '"/></label>' +
          (i.needDisable
            ? '<fieldset class="bh-disable"><legend>停用核實（勾選≠撤權）</legend>' +
              '<label><input type="checkbox" data-f="disabledVerified"' +
              (i.disabledVerified ? ' checked' : '') +
              '/> 已實際停用</label>' +
              '<label>執行人<input data-f="disabledBy" value="' +
              esc(i.disabledBy) +
              '"/></label>' +
              '<label>時間<input data-f="disabledAt" type="datetime-local" value="' +
              esc((i.disabledAt || '').slice(0, 16)) +
              '"/></label>' +
              '<label>證據／單號<input data-f="disabledEvidence" value="' +
              esc(i.disabledEvidence) +
              '"/></label></fieldset>'
            : '') +
          '<button type="button" class="btn btn-sm" data-ah-save-item="' +
          i.id +
          '">儲存細項（草稿）</button></div>'
        : '<p class="bh-ro">結果：' +
          esc(i.result) +
          ' · 現況：' +
          esc(i.progressNote || '—') +
          '</p>') +
      (canRecv
        ? '<label class="bh-confirm"><input type="checkbox" data-ah-recv-item="' +
          i.id +
          '"' +
          (i.receiverOk ? ' checked' : '') +
          '/> 接手人確認本項</label>'
        : '') +
      (canMgr
        ? '<label class="bh-confirm"><input type="checkbox" data-ah-mgr-item="' +
          i.id +
          '"' +
          (i.managerOk ? ' checked' : '') +
          '/> 主管確認本項</label>'
        : '') +
      '</article>'
    );
  }

  function matterCard(m) {
    const overdue = C().matterOverdue(m);
    return (
      '<article class="bh-matter' +
      (overdue ? ' is-overdue' : '') +
      (m.handoverDone ? ' is-done' : '') +
      '" data-matter-id="' +
      m.id +
      '">' +
      '<div><b>' +
      esc(m.matchNo || '（無媒合號）') +
      '</b> · ' +
      esc(m.expenseType || m.caseType || '') +
      '<br/><small>' +
      esc(m.address) +
      ' · 來源 ' +
      esc(m.source) +
      (m.pendingVerify ? ' · <span class="bh-tag">待核</span>' : '') +
      (overdue ? ' · <span class="bh-tag is-late">逾期</span>' : '') +
      (m.migratedFrom ? ' · 舊進度遷移' : '') +
      '</small></div>' +
      '<div class="bh-matter-meta">履約中：' +
      (m.contractActive ? '是' : '否') +
      '　交接完成：' +
      (m.handoverDone ? '是' : '否') +
      '　接手：' +
      esc(m.receiverName || '—') +
      '　期限：' +
      esc(m.dueDate || '—') +
      '</div>' +
      '<p>' +
      esc(m.currentStatus || m.todos || '') +
      '</p></article>'
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
      (prog.total ? ' · 進度 ' + prog.done + '／' + prog.total : '') +
      '</p>' +
      (!gate.open ? '<p class="bh-warn">' + esc(gate.reason) + '</p>' : '') +
      '</div>' +
      '<button type="button" class="bh-sop-close" data-ah-stage-close aria-label="關閉">✕</button></div>'
    );
  }

  function panelBasics() {
    const c = state.bag.case;
    return (
      '<div class="bh-basic cardish">' +
      '<div class="bh-grid">' +
      '<label>地區<select id="ah-region">' +
      C().REGIONS.map((r) => '<option' + (c.region === r ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></label>' +
      '<label>類型<select id="ah-leave-type"><option value="resign"' +
      (c.leaveType === 'resign' ? ' selected' : '') +
      '>離職</option><option value="leave_without_pay"' +
      (c.leaveType === 'leave_without_pay' ? ' selected' : '') +
      '>留職停薪</option></select></label>' +
      '<label>通訊電話<input id="ah-phone" value="' +
      esc(c.transferorPhone) +
      '"/></label>' +
      '<label>接手人<input id="ah-receiver" value="' +
      esc(c.receiverName) +
      '"/></label>' +
      '<label>單位主管<input id="ah-manager" value="' +
      esc(c.managerName) +
      '"/></label>' +
      '<label>離職日<input id="ah-leave-date" type="date" value="' +
      esc(c.leaveDate || '') +
      '"/></label>' +
      '<label>最後工作日<input id="ah-last-work" type="date" value="' +
      esc(c.lastWorkDate || '') +
      '"/></label>' +
      '<label class="bh-span2">通訊地址<input id="ah-address" value="' +
      esc(c.transferorAddress) +
      '"/></label></div>' +
      '<button type="button" class="btn btn-sm" data-ah-save-basic>儲存草稿</button></div>'
    );
  }

  function panelItems(sections) {
    const items = (state.bag.items || []).filter((i) => sections.indexOf(i.section) >= 0);
    if (!items.length) return '<p class="bh-empty">此階段尚無細項（請確認已套用 handover-v2 種子）。</p>';
    return items.map(itemEditor).join('');
  }

  function panelAccounts() {
    const c = state.bag.case;
    return (
      '<p class="bh-hint">可提前準備停用清單與證據；「移交人確認」完成前，本階段不會算已完成。移交人本人確認必須在登入權限停用前完成。</p>' +
      panelItems(['03']) +
      '<fieldset class="bh-disable"><legend>帳號停用核實（全案）</legend>' +
      '<label><input type="checkbox" id="ah-need-disable"' +
      (c.accountNeedDisable ? ' checked' : '') +
      '/> 需停用</label>' +
      '<label>執行人<input id="ah-dis-by" value="' +
      esc(c.accountDisabledBy) +
      '"/></label>' +
      '<label>時間<input id="ah-dis-at" type="datetime-local" value="' +
      esc((c.accountDisabledAt || '').slice(0, 16)) +
      '"/></label>' +
      '<label>證據<input id="ah-dis-ev" value="' +
      esc(c.accountDisableEvidence) +
      '"/></label></fieldset>' +
      '<button type="button" class="btn btn-sm" data-ah-save-basic>儲存停用核實（草稿）</button>'
    );
  }

  function panelMatters() {
    const filter = state.matterFilter || 'all';
    const list = C().filterMatters(state.bag.matters || [], filter);
    const chips = [
      ['all', '全部'],
      ['undone', '未完成'],
      ['pending', '待核／待補'],
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
            '" data-ah-matter-filter="' +
            c[0] +
            '">' +
            c[1] +
            '</button>'
        )
        .join('') +
      '</div>' +
      panelItems(['05']) +
      '<div class="bh-add-matter">' +
      '<input id="ah-m-match" placeholder="媒合編號"/><input id="ah-m-addr" placeholder="地址"/>' +
      '<input id="ah-m-exp" placeholder="費用類別（修繕／保險費…）"/>' +
      '<input id="ah-m-recv" placeholder="接手人"/><input id="ah-m-due" type="date"/>' +
      '<textarea id="ah-m-status" placeholder="現況／待辦"></textarea>' +
      '<label><input type="checkbox" id="ah-m-done"/> 交接檢核完成</label>' +
      '<button type="button" class="btn btn-sm" data-ah-add-matter>新增逐案</button></div>' +
      (list.length ? list.map(matterCard).join('') : '<p class="bh-empty">沒有符合篩選的逐案。</p>')
    );
  }

  function panelSign(kind) {
    const bag = state.bag;
    if (kind === 'transferor') {
      return (
        '<p class="bh-hint">確認細項與逐案後送出。儲存草稿不算完成此階段。</p>' +
        C().blockersHtml(bag.blockers) +
        '<div class="bh-actions"><button type="button" class="btn" data-ah-submit>移交人送出填報</button></div>'
      );
    }
    if (kind === 'receiver') {
      return (
        '<p class="bh-hint">請到各細項勾「接手人確認」，完成後按下方按鈕。</p>' +
        panelItems(['01', '02', '03', '04', '05', '06']) +
        '<div class="bh-actions"><button type="button" class="btn" data-ah-recv-all>接手人完成確認</button></div>'
      );
    }
    return (
      C().blockersHtml(bag.blockers) +
      '<section class="bh-section"><h4>疏失責任同意書（可選）</h4>' +
      '<p class="bh-hint">非結案必要。僅關聯註記。</p>' +
      '<button type="button" class="btn btn-sm" data-ah-liability>記錄已關聯同意書範本</button>' +
      ((bag.liabilityDocs || []).length
        ? '<ul>' + bag.liabilityDocs.map((d) => '<li>' + esc(d.title) + ' · ' + esc(d.note) + '</li>').join('') + '</ul>'
        : '') +
      '</section>' +
      '<div class="bh-actions">' +
      '<button type="button" class="btn" data-ah-mgr>主管複核完成</button>' +
      '<button type="button" class="btn tone-rose" data-ah-return>退回（必填理由）</button>' +
      '<button type="button" class="btn tone-emerald" data-ah-close>結案（後端驗證）</button>' +
      '<button type="button" class="btn tone-slate-soft" data-ah-print>列印版</button></div>'
    );
  }

  function stagePanelHtml() {
    const stage = C().stagesOf(KIND).find((s) => s.id === state.openStage);
    if (!stage) return '';
    let body = '';
    if (stage.kind === 'basics') body = panelBasics();
    else if (stage.kind === 'items') body = panelItems(stage.sections || []);
    else if (stage.kind === 'accounts') body = panelAccounts();
    else if (stage.kind === 'matters') body = panelMatters();
    else if (stage.kind === 'sign_transferor') body = panelSign('transferor');
    else if (stage.kind === 'sign_receiver') body = panelSign('receiver');
    else if (stage.kind === 'sign_manager') body = panelSign('manager');
    else body = '<p class="bh-empty">此階段尚無工作區內容。</p>';

    return (
      '<div class="bh-sop-detail" id="ah-sop-detail">' +
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
    if (!bag) return '';
    return (
      '<section class="bh-detail">' +
      '<button type="button" class="btn btn-sm tone-slate-soft" data-ah-back>← 案件列表</button>' +
      C().caseHeaderHtml(KIND, bag, state.role) +
      '<h4 class="bh-sop-title">交接流程<small>點節點開啟工作區 · 完成比例依實際資料計算</small></h4>' +
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
      '<header class="bh-hero">' +
      '<p class="bh-kicker">行政專區</p>' +
      '<h2>行政離職交接</h2>' +
      '<p class="bh-lead">可點擊流程圖：點節點即可檢核、存草稿、送出或覆核。未完成檢核不得結案（後端強制）。</p>' +
      (state.backendHint ? '<p class="bh-warn">' + esc(state.backendHint) + '</p>' : '') +
      '</header>' +
      '<p id="ah-msg" class="bh-msg" hidden></p>' +
      (state.bag
        ? renderDetail()
        : '<div class="bh-home">' +
          '<div class="bh-create">' +
          '<h3>新建交接</h3>' +
          '<label>移交人姓名<input id="ah-new-name" placeholder="離職／留職停薪人員"/></label>' +
          '<label>接手人<input id="ah-new-recv"/></label>' +
          '<label>單位主管<input id="ah-new-mgr"/></label>' +
          '<button type="button" class="btn" data-ah-create>建立行政案</button>' +
          '<button type="button" class="btn tone-slate-soft" data-ah-migrate>匯入此人舊勾選進度</button></div>' +
          '<h3>我的／相關案件</h3>' +
          renderList() +
          '</div>') +
      '</div>';
    if (state.msg) setMsg(state.msg, state.msgErr);
  }

  async function safe(fn) {
    try {
      state.loading = true;
      await fn();
      setMsg(state.msg && !state.msgErr ? state.msg : '');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (/function|schema|does not exist|404|PGRST/i.test(msg)) {
        state.backendOk = false;
        state.backendHint =
          '後端 handover-v2 尚未套用至 Supabase。結案控管無法生效；請於確認後再 apply migration。本頁可先看 UI。';
      }
      setMsg(msg + (e.blockers && e.blockers.length ? '｜' + e.blockers.join('；') : ''), true);
    } finally {
      state.loading = false;
      render();
    }
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
        const sid = blocker.getAttribute('data-bh-blocker');
        if (sid) {
          state.openStage = sid;
          render();
        }
        return;
      }
      const filterBtn = ev.target.closest('[data-ah-matter-filter]');
      if (filterBtn) {
        state.matterFilter = filterBtn.getAttribute('data-ah-matter-filter') || 'all';
        render();
        return;
      }
      if (ev.target.closest('[data-ah-stage-close]')) {
        state.openStage = '';
        render();
        return;
      }

      const t = ev.target.closest(
        '[data-ah-create],[data-ah-open],[data-ah-back],[data-ah-save-basic],[data-ah-save-item],[data-ah-add-matter],[data-ah-submit],[data-ah-recv-all],[data-ah-mgr],[data-ah-return],[data-ah-close],[data-ah-print],[data-ah-migrate],[data-ah-liability],[data-ah-recv-item],[data-ah-mgr-item]'
      );
      if (!t) return;
      if (t.hasAttribute('data-ah-back')) {
        state.bag = null;
        state.openStage = 'basics';
        render();
        return;
      }
      if (t.hasAttribute('data-ah-print') && state.bag) {
        C().printWindow('行政離職移交', C().buildPrintHtml('admin', state.bag));
        return;
      }
      if (t.hasAttribute('data-ah-open')) {
        void safe(async () => {
          await openCase(t.getAttribute('data-ah-open'));
          state.openStage = 'basics';
        });
        return;
      }
      if (t.hasAttribute('data-ah-create')) {
        void safe(async () => {
          const name = document.getElementById('ah-new-name').value.trim();
          const res = await C().rpc('toolbox_handover_case_create', {
            p_kind: KIND,
            p_transferor: name,
            p_data: {
              receiverName: document.getElementById('ah-new-recv').value.trim(),
              managerName: document.getElementById('ah-new-mgr').value.trim(),
              unit: '行政管理部'
            }
          });
          await openCase(res.case.id);
          state.openStage = 'basics';
          await refreshList();
        });
        return;
      }
      if (t.hasAttribute('data-ah-migrate')) {
        void safe(async () => {
          const name = document.getElementById('ah-new-name').value.trim() || C().meName();
          const res = await C().rpc('toolbox_handover_migrate_v1', { p_kind: KIND, p_person: name });
          await openCase(res.caseId);
          state.openStage = 'basics';
          setMsg('已匯入舊進度 ' + (res.migratedRows || 0) + ' 筆（待補細項）', false);
        });
        return;
      }
      if (!state.bag) return;
      const id = state.bag.case.id;
      if (t.hasAttribute('data-ah-save-basic')) {
        void safe(async () => {
          const needEl = document.getElementById('ah-need-disable');
          const data = {
            region: (document.getElementById('ah-region') || {}).value,
            leaveType: (document.getElementById('ah-leave-type') || {}).value,
            transferorPhone: (document.getElementById('ah-phone') || {}).value,
            transferorAddress: (document.getElementById('ah-address') || {}).value,
            receiverName: (document.getElementById('ah-receiver') || {}).value,
            managerName: (document.getElementById('ah-manager') || {}).value,
            leaveDate: (document.getElementById('ah-leave-date') || {}).value,
            lastWorkDate: (document.getElementById('ah-last-work') || {}).value
          };
          if (needEl) {
            data.accountNeedDisable = needEl.checked;
            data.accountDisabledBy = (document.getElementById('ah-dis-by') || {}).value;
            data.accountDisabledAt = document.getElementById('ah-dis-at') && document.getElementById('ah-dis-at').value
              ? new Date(document.getElementById('ah-dis-at').value).toISOString()
              : '';
            data.accountDisableEvidence = (document.getElementById('ah-dis-ev') || {}).value;
          }
          await C().rpc('toolbox_handover_case_update', { p_id: id, p_data: data });
          await openCase(id);
          setMsg('基本資料已存（草稿）', false);
        });
      } else if (t.hasAttribute('data-ah-save-item')) {
        const itemId = t.getAttribute('data-ah-save-item');
        const art = t.closest('.bh-item');
        const data = {};
        art.querySelectorAll('[data-f]').forEach((el) => {
          const k = el.getAttribute('data-f');
          data[k] = el.type === 'checkbox' ? el.checked : el.value;
        });
        if (data.disabledAt) data.disabledAt = new Date(data.disabledAt).toISOString();
        void safe(async () => {
          await C().rpc('toolbox_handover_item_save', { p_item_id: Number(itemId), p_data: data });
          await openCase(id);
          setMsg('細項已存（草稿）', false);
        });
      } else if (t.hasAttribute('data-ah-recv-item')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_item_save', {
            p_item_id: Number(t.getAttribute('data-ah-recv-item')),
            p_data: { receiverOk: t.checked }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-ah-mgr-item')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_item_save', {
            p_item_id: Number(t.getAttribute('data-ah-mgr-item')),
            p_data: { managerOk: t.checked }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-ah-add-matter')) {
        const complete = document.getElementById('ah-m-done').checked;
        void safe(async () => {
          await C().rpc('toolbox_handover_matter_upsert', {
            p_case_id: id,
            p_data: {
              matchNo: document.getElementById('ah-m-match').value.trim(),
              address: document.getElementById('ah-m-addr').value.trim(),
              expenseType: document.getElementById('ah-m-exp').value.trim(),
              receiverName: document.getElementById('ah-m-recv').value.trim(),
              dueDate: document.getElementById('ah-m-due').value,
              currentStatus: document.getElementById('ah-m-status').value.trim(),
              source: 'manual',
              pendingVerify: true,
              contractActive: true,
              handoverDone: complete,
              checks: { complete: complete ? 'true' : 'false', incomplete: complete ? 'false' : 'true' }
            }
          });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-ah-submit')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_submit_transferor', { p_id: id });
          await openCase(id);
          state.openStage = 'receiver_review';
          setMsg('已送出，進入接手人覆核', false);
        });
      } else if (t.hasAttribute('data-ah-recv-all')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_confirm_receiver', { p_id: id });
          await openCase(id);
          state.openStage = 'manager_close';
        });
      } else if (t.hasAttribute('data-ah-mgr')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_confirm_manager', { p_id: id });
          await openCase(id);
        });
      } else if (t.hasAttribute('data-ah-return')) {
        const reason = prompt('退回理由（必填）');
        if (reason == null) return;
        void safe(async () => {
          await C().rpc('toolbox_handover_return', { p_id: id, p_reason: reason });
          await openCase(id);
          state.openStage = 'transferor_sign';
        });
      } else if (t.hasAttribute('data-ah-close')) {
        void safe(async () => {
          try {
            await C().rpc('toolbox_handover_close', { p_id: id });
            await openCase(id);
            setMsg('已結案', false);
          } catch (e) {
            if (e.blockers) state.bag.blockers = e.blockers;
            throw e;
          }
        });
      } else if (t.hasAttribute('data-ah-liability')) {
        void safe(async () => {
          await C().rpc('toolbox_handover_liability_link', {
            p_case_id: id,
            p_note: '已關聯範本（非結案必要條件）'
          });
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

  const obs = new MutationObserver(() => {
    const page = document.getElementById(PAGE_ID);
    if (page && !page.classList.contains('hidden') && !state.mounted) void mount();
    if (page && page.classList.contains('hidden')) state.mounted = false;
  });
  if (document.getElementById(PAGE_ID)) {
    obs.observe(document.getElementById(PAGE_ID), { attributes: true, attributeFilter: ['class'] });
  }
  global.AdminHandover = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
