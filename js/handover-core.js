/**
 * 離職交接共用核心（行政／業務）
 * 可信結案控管在 Supabase RPC；前端僅輔助。未套用 handover-v2.sql 時會顯示後端不可用。
 * 流程節點狀態一律由 case／items／matters 重算，不用 localStorage 當正式進度。
 */
(function (global) {
  'use strict';

  const STATUS_LABEL = {
    draft: '草稿／退回修改',
    transferor_done: '移交人已送出',
    receiver_review: '接手人確認中',
    manager_review: '主管複核中',
    returned: '已退回',
    closed: '已結案'
  };

  const STAGE_STATUS_LABEL = {
    todo: '未開始',
    doing: '處理中',
    review: '待覆核',
    done: '已完成',
    returned: '退回補正',
    overdue: '逾期',
    locked: '尚未開放'
  };

  const SECTION_LABEL = {
    '01': '01 印鑑與設備',
    '02': '02 文件與檔案',
    '03': '03 帳號與通訊',
    '04': '04 公會例行作業',
    '05': '05 案件進度',
    '06': '06 待辦與簽核'
  };

  const BIZ_CHECK_DEFS = [
    { key: 'repairApply', label: '有申請修繕／保險／公證' },
    { key: 'repairDocs', label: '已提供單據證明（否則與行政確認進度）' },
    { key: 'repairPaid', label: '已領取修繕／保險／公證補助款' },
    { key: 'subsidyPaid', label: '300億租金補貼已領取' },
    { key: 'subsidyPending', label: '尚有補件未完成（須填業務補件進度）' },
    { key: 'specialTerms', label: '房東／房客另有附約或約定' },
    { key: 'complete', label: '本案交接檢核完成（不可只靠接手人／期限代替）' }
  ];

  const REGIONS = [
    '台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '南投', '彰化', '嘉義', '台南', '高雄'
  ];

  /** 行政：資料準備可並行；簽核節點依狀態機順序 */
  const ADMIN_STAGES = [
    {
      id: 'basics',
      n: 1,
      title: '基本資料與接手人',
      blurb: '離職人員、單位、接手人、主管、離職日',
      icon: '1',
      owner: '移交人',
      sections: [],
      kind: 'basics'
    },
    {
      id: 'seals',
      n: 2,
      title: '印鑑設備／公司物品',
      blurb: '印鑑、電腦、門禁、公司財產移交',
      icon: '2',
      owner: '移交人',
      sections: ['01'],
      kind: 'items'
    },
    {
      id: 'files',
      n: 3,
      title: '文件檔案',
      blurb: '紙本／雲端檔案路徑與交接說明',
      icon: '3',
      owner: '移交人',
      sections: ['02'],
      kind: 'items'
    },
    {
      id: 'guild',
      n: 4,
      title: '公會例行作業',
      blurb: '公會報表、例行作業移交',
      icon: '4',
      owner: '移交人',
      sections: ['04'],
      kind: 'items'
    },
    {
      id: 'matters',
      n: 5,
      title: '逐案進度與補助檢核',
      blurb: '經手案件、補助／修繕進度',
      icon: '5',
      owner: '移交人',
      sections: ['05'],
      kind: 'matters'
    },
    {
      id: 'transferor_sign',
      n: 6,
      title: '移交人確認',
      blurb: '確認細項與逐案後送出（停權前必須完成）',
      icon: '6',
      owner: '移交人',
      kind: 'sign_transferor'
    },
    {
      id: 'receiver_review',
      n: 7,
      title: '接手人覆核',
      blurb: '逐項／逐案確認接手',
      icon: '7',
      owner: '接手人',
      kind: 'sign_receiver'
    },
    {
      id: 'accounts',
      n: 8,
      title: '帳號通訊停用驗證',
      blurb: '可提前列停用清單；移交人確認後才可標完成',
      icon: '8',
      owner: '移交人／資訊',
      sections: ['03'],
      kind: 'accounts'
    },
    {
      id: 'manager_close',
      n: 9,
      title: '主管複核與結案',
      blurb: '主管確認後結案；缺漏不可結',
      icon: '9',
      owner: '主管',
      kind: 'sign_manager'
    }
  ];

  const BIZ_STAGES = [
    {
      id: 'basics',
      n: 1,
      title: '基本資料與案件清冊',
      blurb: '接手人、主管、匯入／手增待移交案件',
      icon: '1',
      owner: '移交人',
      kind: 'basics'
    },
    {
      id: 'repair',
      n: 2,
      title: '修繕／保險／公證',
      blurb: '逐案勾選修繕保險公證與單據',
      icon: '2',
      owner: '移交人',
      kind: 'matters_repair'
    },
    {
      id: 'subsidy',
      n: 3,
      title: '租金補助與補件',
      blurb: '300 億補貼與補件進度',
      icon: '3',
      owner: '移交人',
      kind: 'matters_subsidy'
    },
    {
      id: 'special',
      n: 4,
      title: '契約特別約定',
      blurb: '房東／房客附約與說明',
      icon: '4',
      owner: '移交人',
      kind: 'matters_special'
    },
    {
      id: 'transferor_sign',
      n: 5,
      title: '移交人確認',
      blurb: '確認逐案後送出（停權前必須完成）',
      icon: '5',
      owner: '移交人',
      kind: 'sign_transferor'
    },
    {
      id: 'receiver_review',
      n: 6,
      title: '接手人逐案覆核',
      blurb: '接手人確認每案',
      icon: '6',
      owner: '接手人',
      kind: 'sign_receiver'
    },
    {
      id: 'manager_call',
      n: 7,
      title: '主管逐案電話照會',
      blurb: '主管電話照會紀錄',
      icon: '7',
      owner: '主管',
      kind: 'manager_call'
    },
    {
      id: 'accounts',
      n: 8,
      title: '適用權限停用驗證',
      blurb: '可提前準備；移交人確認後才可標完成',
      icon: '8',
      owner: '移交人／資訊',
      kind: 'accounts'
    },
    {
      id: 'manager_close',
      n: 9,
      title: '主管簽核與結案',
      blurb: '主管簽核後結案',
      icon: '9',
      owner: '主管',
      kind: 'sign_manager'
    }
  ];

  function token() {
    try {
      return (global.skyfunAuth && global.skyfunAuth.getToken && global.skyfunAuth.getToken()) || '';
    } catch (_) {
      return '';
    }
  }

  function meName() {
    try {
      const u = global.skyfunAuth && global.skyfunAuth.getUser && global.skyfunAuth.getUser();
      return String((u && (u.name || u.username)) || '').trim();
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

  async function rpc(name, args) {
    if (!(global.skyfunAuth && typeof global.skyfunAuth.rpc === 'function')) {
      throw new Error('登入模組未就緒');
    }
    const tok = token();
    if (!tok) throw new Error('請先登入工具箱');
    const payload = Object.assign({ p_token: tok }, args || {});
    const res = await global.skyfunAuth.rpc(name, payload);
    if (!res || res.ok === false) {
      const err = new Error((res && res.error) || '操作失敗');
      err.blockers = (res && res.blockers) || null;
      err.raw = res;
      throw err;
    }
    return res;
  }

  function statusLabel(s) {
    return STATUS_LABEL[s] || s || '—';
  }

  function stageStatusLabel(s) {
    return STAGE_STATUS_LABEL[s] || s || '—';
  }

  function blockersHtml(blockers) {
    const list = Array.isArray(blockers) ? blockers : [];
    if (!list.length) return '<p class="bh-ok">目前後端檢核無阻擋項目（仍須完成三方簽核流程）。</p>';
    return (
      '<div class="bh-blockers" role="alert"><strong>結案阻擋原因</strong><ul>' +
      list.map((b) => '<li data-bh-blocker="' + esc(blockerToStage(b)) + '">' + esc(b) + '</li>').join('') +
      '</ul><p class="bh-blockers-note">未完成檢核，系統不得送出離職結案（後端強制）。點缺漏可進對應節點。</p></div>'
    );
  }

  function blockerToStage(text) {
    const t = String(text || '');
    if (/印鑑|設備|物品/.test(t)) return 'seals';
    if (/文件|檔案/.test(t)) return 'files';
    if (/公會/.test(t)) return 'guild';
    if (/帳號|通訊|停用|權限/.test(t)) return 'accounts';
    if (/修繕|保險|公證/.test(t)) return 'repair';
    if (/補助|補件/.test(t)) return 'subsidy';
    if (/特別約定|附約/.test(t)) return 'special';
    if (/接手|覆核/.test(t)) return 'receiver_review';
    if (/電話|照會/.test(t)) return 'manager_call';
    if (/主管|結案/.test(t)) return 'manager_close';
    if (/移交|送出/.test(t)) return 'transferor_sign';
    if (/基本|接手人|離職日/.test(t)) return 'basics';
    return 'matters';
  }

  function matterChecksComplete(checks) {
    const c = checks && typeof checks === 'object' ? checks : {};
    if (c.complete !== true && c.complete !== 'true') return false;
    if (c.incomplete === true || c.incomplete === 'true') return false;
    return true;
  }

  function buildBizChecks(form) {
    const checks = {};
    let incomplete = false;
    BIZ_CHECK_DEFS.forEach((d) => {
      if (d.key === 'complete') return;
      const v = form[d.key];
      checks[d.key] = !!v;
    });
    if (checks.repairApply && !checks.repairDocs) incomplete = true;
    if (checks.subsidyPending && !String(form.subsidyProgress || form.docsNote || '').trim()) incomplete = true;
    if (checks.specialTerms && !String(form.specialNote || '').trim()) incomplete = true;
    checks.complete = !!form.complete && !incomplete;
    checks.incomplete = incomplete || !form.complete ? 'true' : 'false';
    checks.subsidyProgress = String(form.subsidyProgress || '');
    checks.specialNote = String(form.specialNote || '');
    checks.docsNote = String(form.docsNote || '');
    return checks;
  }

  function itemFilled(i) {
    const r = String(i && i.result != null ? i.result : 'unset').trim();
    return r && r !== 'unset';
  }

  function itemDone(i) {
    const r = String(i && i.result != null ? i.result : 'unset').trim();
    if (!r || r === 'unset' || r === 'pending') return false;
    if (i.needDisable) {
      return !!(i.disabledVerified && i.disabledBy && i.disabledAt && i.disabledEvidence);
    }
    return true;
  }

  function matterOverdue(m) {
    if (!m || m.handoverDone) return false;
    const due = String(m.dueDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
    const today = new Date();
    const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return due < iso;
  }

  function transferorSigned(status) {
    return ['transferor_done', 'receiver_review', 'manager_review', 'closed'].indexOf(status) >= 0;
  }

  function receiverSigned(c) {
    return !!(c && (c.receiverConfirmedAt || ['manager_review', 'closed'].indexOf(c.status) >= 0));
  }

  function managerSigned(c) {
    return !!(c && (c.managerConfirmedAt || c.status === 'closed'));
  }

  function basicsProgress(c) {
    const fields = [c.transferorName, c.receiverName, c.managerName, c.leaveDate || c.lastWorkDate];
    const done = fields.filter((v) => String(v || '').trim()).length;
    return { done: done, total: fields.length };
  }

  function itemsProgress(items, sections) {
    const list = (items || []).filter((i) => !sections || !sections.length || sections.indexOf(i.section) >= 0);
    const total = list.length;
    const done = list.filter(itemDone).length;
    const filled = list.filter(itemFilled).length;
    return { done: done, total: total, filled: filled };
  }

  function mattersProgress(matters) {
    const list = matters || [];
    const total = list.length;
    const done = list.filter((m) => m.handoverDone && matterChecksComplete(m.checks)).length;
    return { done: done, total: total };
  }

  function accountsCaseDone(c) {
    if (!c) return false;
    if (!c.accountNeedDisable) return true;
    return !!(c.accountDisabledBy && c.accountDisabledAt && c.accountDisableEvidence);
  }

  function stageProgressOf(kind, stage, bag) {
    const c = (bag && bag.case) || {};
    const items = (bag && bag.items) || [];
    const matters = (bag && bag.matters) || [];
    if (!stage) return { done: 0, total: 0 };
    if (stage.kind === 'basics') return basicsProgress(c);
    if (stage.kind === 'items' || (stage.kind === 'accounts' && kind === 'admin')) {
      const p = itemsProgress(items, stage.sections);
      if (stage.kind === 'accounts') {
        const extra = accountsCaseDone(c) ? 1 : 0;
        return { done: p.done + extra, total: p.total + 1, filled: p.filled + (c.accountNeedDisable ? extra : 1) };
      }
      return p;
    }
    if (stage.kind === 'matters') return mattersProgress(matters);
    if (stage.kind === 'matters_repair') {
      const keys = ['repairApply', 'repairDocs', 'repairPaid'];
      return bizKeysProgress(matters, keys);
    }
    if (stage.kind === 'matters_subsidy') {
      return bizKeysProgress(matters, ['subsidyPaid', 'subsidyPending']);
    }
    if (stage.kind === 'matters_special') {
      return bizKeysProgress(matters, ['specialTerms']);
    }
    if (stage.kind === 'sign_transferor') {
      return { done: transferorSigned(c.status) ? 1 : 0, total: 1 };
    }
    if (stage.kind === 'sign_receiver') {
      const need = Math.max(1, (items.length || 0) + (matters.length || 0));
      let ok = 0;
      items.forEach((i) => {
        if (i.receiverOk) ok += 1;
      });
      matters.forEach((m) => {
        if (m.receiverOk) ok += 1;
      });
      if (receiverSigned(c)) return { done: need, total: need };
      return { done: ok, total: need };
    }
    if (stage.kind === 'manager_call') {
      const list = matters;
      const total = Math.max(1, list.length);
      const done = list.filter((m) => m.phoneCheckOk).length;
      return { done: done, total: total };
    }
    if (stage.kind === 'accounts' && kind === 'biz') {
      return { done: accountsCaseDone(c) ? 1 : 0, total: 1 };
    }
    if (stage.kind === 'sign_manager') {
      return { done: c.status === 'closed' || managerSigned(c) ? 1 : 0, total: 1 };
    }
    return { done: 0, total: 0 };
  }

  function bizKeysProgress(matters, keys) {
    const list = matters || [];
    if (!list.length) return { done: 0, total: 0 };
    let done = 0;
    list.forEach((m) => {
      if (m.handoverDone || repairGroupOk(m.checks || {}, keys)) done += 1;
    });
    return { done: done, total: list.length };
  }

  function repairGroupOk(checks, keys) {
    return keys.every((k) => {
      if (k === 'repairDocs') {
        if (!(checks.repairApply === true || checks.repairApply === 'true')) return true;
        return checks.repairDocs === true || checks.repairDocs === 'true';
      }
      if (k === 'repairApply' || k === 'repairPaid' || k === 'subsidyPaid') {
        return Object.prototype.hasOwnProperty.call(checks, k);
      }
      if (k === 'subsidyPending') {
        if (!(checks.subsidyPending === true || checks.subsidyPending === 'true')) {
          return Object.prototype.hasOwnProperty.call(checks, 'subsidyPending') || Object.prototype.hasOwnProperty.call(checks, 'subsidyPaid');
        }
        return !!(String(checks.subsidyProgress || checks.docsNote || '').trim());
      }
      if (k === 'specialTerms') {
        if (!(checks.specialTerms === true || checks.specialTerms === 'true')) {
          return Object.prototype.hasOwnProperty.call(checks, 'specialTerms');
        }
        return !!(String(checks.specialNote || '').trim());
      }
      return Object.prototype.hasOwnProperty.call(checks, k);
    });
  }

  function stageOpenGate(stage, bag) {
    const c = (bag && bag.case) || {};
    const st = c.status || 'draft';
    if (c.status === 'closed') return { open: true, reason: '' };
    if (stage.kind === 'sign_transferor') {
      return { open: st === 'draft' || st === 'returned' || transferorSigned(st), reason: '請先完成基本資料與必要檢核後再送出' };
    }
    if (stage.kind === 'sign_receiver') {
      const ok = transferorSigned(st) || st === 'receiver_review' || st === 'manager_review';
      return { open: ok, reason: '須等移交人確認送出後才能覆核' };
    }
    if (stage.kind === 'manager_call') {
      const ok = transferorSigned(st);
      return { open: ok, reason: '須等移交人送出後主管才能電話照會' };
    }
    if (stage.kind === 'sign_manager') {
      const ok = receiverSigned(c) || st === 'manager_review' || st === 'closed';
      return { open: ok || st === 'transferor_done', reason: '須接手人覆核後才能主管複核結案' };
    }
    /* 資料節點可預覽；accounts 可提前準備 */
    return { open: true, reason: '' };
  }

  function stageStatusOf(kind, stage, bag) {
    const c = (bag && bag.case) || {};
    const st = c.status || 'draft';
    const gate = stageOpenGate(stage, bag);
    const prog = stageProgressOf(kind, stage, bag);
    const matters = (bag && bag.matters) || [];

    if (st === 'returned' && (stage.kind === 'sign_transferor' || stage.kind === 'basics' || stage.kind === 'items' || String(stage.kind || '').indexOf('matters') === 0)) {
      if (!transferorSigned(st) || st === 'returned') {
        /* 退回後資料節點標退回補正，直到再次送出 */
        if (st === 'returned' && stage.id !== 'manager_close') {
          if (prog.total > 0 && prog.done >= prog.total && stage.kind !== 'sign_transferor') {
            /* keep */
          } else if (stage.kind === 'sign_transferor' || prog.filled > 0 || prog.done > 0 || stage.kind === 'basics') {
            return 'returned';
          }
        }
      }
    }

    if (stage.kind === 'sign_transferor') {
      if (transferorSigned(st)) return 'done';
      if (st === 'returned') return 'returned';
      if (prog.done || (bag.items || []).some(itemFilled) || matters.length) return 'doing';
      return 'todo';
    }
    if (stage.kind === 'sign_receiver') {
      if (!gate.open) return 'locked';
      if (receiverSigned(c) || st === 'manager_review' || st === 'closed') return 'done';
      if (st === 'transferor_done' || st === 'receiver_review') return prog.done > 0 ? 'doing' : 'review';
      return 'todo';
    }
    if (stage.kind === 'manager_call') {
      if (!gate.open) return 'locked';
      if (prog.total > 0 && prog.done >= prog.total) return 'done';
      if (prog.done > 0) return 'doing';
      if (matters.some(matterOverdue)) return 'overdue';
      return transferorSigned(st) ? 'review' : 'todo';
    }
    if (stage.kind === 'sign_manager') {
      if (st === 'closed') return 'done';
      if (!gate.open) return 'locked';
      if (managerSigned(c)) return 'review';
      if (st === 'manager_review') return 'review';
      return 'todo';
    }
    if (stage.kind === 'accounts') {
      const ready = prog.total > 0 ? prog.done >= prog.total : accountsCaseDone(c);
      if (ready && transferorSigned(st)) return 'done';
      if (prog.filled > 0 || prog.done > 0 || c.accountNeedDisable) return 'doing';
      return 'todo';
    }
    if (prog.total === 0) {
      if (stage.kind === 'matters' || String(stage.kind || '').indexOf('matters_') === 0) return 'todo';
      if (stage.kind === 'basics') {
        const b = basicsProgress(c);
        if (b.done >= b.total) return 'done';
        if (b.done > 0) return 'doing';
        return 'todo';
      }
      return 'todo';
    }
    if (prog.done >= prog.total && prog.total > 0) return 'done';
    if (matters.some(matterOverdue) && (stage.kind === 'matters' || String(stage.kind).indexOf('matters') === 0)) return 'overdue';
    if (prog.done > 0 || prog.filled > 0) return 'doing';
    return 'todo';
  }

  function stagesOf(kind) {
    return kind === 'biz' ? BIZ_STAGES : ADMIN_STAGES;
  }

  function overallProgress(kind, bag) {
    const stages = stagesOf(kind);
    let done = 0;
    stages.forEach((s) => {
      if (stageStatusOf(kind, s, bag) === 'done') done += 1;
    });
    return { done: done, total: stages.length };
  }

  function canEditStage(kind, stage, bag, role) {
    const c = (bag && bag.case) || {};
    if (c.locked || c.status === 'closed') return false;
    const gate = stageOpenGate(stage, bag);
    if (!gate.open && stage.kind !== 'accounts') return false;
    if (stage.kind === 'sign_manager' || stage.kind === 'manager_call') return role === 'manager' || role === 'admin';
    if (stage.kind === 'sign_receiver') return role === 'receiver' || role === 'admin';
    if (stage.kind === 'sign_transferor') return role === 'transferor' || role === 'admin';
    /* 資料準備 */
    if (role === 'transferor' || role === 'admin') {
      return ['draft', 'returned', 'transferor_done'].indexOf(c.status) >= 0 || stage.kind === 'accounts';
    }
    if (role === 'receiver' && stage.kind === 'sign_receiver') return true;
    if (role === 'manager') return stage.kind === 'sign_manager' || stage.kind === 'manager_call';
    return false;
  }

  function filterMatters(matters, filter) {
    const list = matters || [];
    if (!filter || filter === 'all') return list;
    return list.filter((m) => {
      if (filter === 'undone') return !m.handoverDone;
      if (filter === 'pending') return !!(m.pendingVerify || (m.checks && (m.checks.incomplete === true || m.checks.incomplete === 'true')));
      if (filter === 'overdue') return matterOverdue(m);
      if (filter === 'review') return !m.receiverOk || (m.handoverDone && !m.receiverOk);
      return true;
    });
  }

  function printWindow(title, bodyHtml) {
    const w = global.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      alert('瀏覽器擋住列印視窗，請允許彈出。');
      return;
    }
    w.document.write(
      '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/><title>' +
        esc(title) +
        '</title><style>' +
        'body{font-family:"Microsoft JhengHei",sans-serif;color:#0f172a;padding:1.2rem;line-height:1.5}' +
        'h1{font-size:1.25rem;margin:0 0 .5rem}h2{font-size:1rem;margin:1rem 0 .4rem;border-bottom:1px solid #cbd5e1;padding-bottom:.2rem}' +
        'table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{border:1px solid #94a3b8;padding:.35rem .45rem;vertical-align:top}' +
        '.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:2rem}' +
        '.sign div{border-top:1px solid #0f172a;padding-top:.35rem;min-height:4rem}' +
        '.warn{background:#fef2f2;border:1px solid #fecaca;padding:.5rem .75rem;margin:.75rem 0}' +
        '@media print{.no-print{display:none}}' +
        '</style></head><body>' +
        bodyHtml +
        '<p class="no-print"><button onclick="print()">列印</button></p></body></html>'
    );
    w.document.close();
  }

  function buildPrintHtml(kind, bag) {
    const c = bag.case || {};
    const items = bag.items || [];
    const matters = bag.matters || [];
    let html = '<h1>' + (kind === 'admin' ? '行政' : '業務') + '離職移交檢核表</h1>';
    html +=
      '<p>移交人：' +
      esc(c.transferorName) +
      '　接手人：' +
      esc(c.receiverName) +
      '　主管：' +
      esc(c.managerName) +
      '<br/>單位／地區：' +
      esc(c.unit) +
      '／' +
      esc(c.region) +
      '　狀態：' +
      esc(statusLabel(c.status)) +
      '</p>';
    html +=
      '<div class="warn">未完成檢核，系統不得送出離職結案。履約中案件與交接完成狀態分開。</div>';

    if (items.length) {
      html += '<h2>細項檢核</h2><table><thead><tr><th>區</th><th>項目</th><th>結果</th><th>現況／備註</th><th>交接人</th></tr></thead><tbody>';
      items.forEach((i) => {
        html +=
          '<tr><td>' +
          esc(SECTION_LABEL[i.section] || i.section) +
          '</td><td>' +
          esc(i.label) +
          '</td><td>' +
          esc(i.result) +
          '</td><td>' +
          esc([i.progressNote, i.pathNote, i.remark, i.qty].filter(Boolean).join('／')) +
          '</td><td>' +
          esc(i.handoverPerson) +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }

    if (matters.length) {
      html +=
        '<h2>逐案交接</h2><table><thead><tr><th>媒合／地址</th><th>履約中</th><th>交接完成</th><th>接手人</th><th>期限</th><th>現況</th></tr></thead><tbody>';
      matters.forEach((m) => {
        html +=
          '<tr><td>' +
          esc(m.matchNo || '—') +
          '<br/>' +
          esc(m.address) +
          '</td><td>' +
          (m.contractActive ? '是' : '否') +
          '</td><td>' +
          (m.handoverDone ? '是' : '否') +
          '</td><td>' +
          esc(m.receiverName) +
          '</td><td>' +
          esc(m.dueDate || '') +
          '</td><td>' +
          esc(m.currentStatus) +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }

    if (kind === 'biz') {
      html +=
        '<p style="font-size:.85rem;margin-top:1rem">告知（來源公司流程圖，非系統認定責任）：業務須於離職前完成本人移交確認；如發生勾選未確實而導致賠償，將由承接人員及單位主管共同承擔賠償責任。</p>';
    }

    html +=
      '<div class="sign"><div>移交人簽章／日期<br/>' +
      esc(c.transferorName) +
      '</div><div>接手人簽章／日期<br/>' +
      esc(c.receiverName) +
      '</div><div>單位主管簽章／日期<br/>' +
      esc(c.managerName) +
      '</div></div>';
    return html;
  }

  function flowBar(status) {
    const steps = [
      ['draft', '1 移交人填報'],
      ['transferor_done', '2 接手確認'],
      ['manager_review', '3 主管複核'],
      ['closed', '4 結案']
    ];
    const order = { draft: 0, returned: 0, transferor_done: 1, receiver_review: 1, manager_review: 2, closed: 3 };
    const cur = order[status] == null ? 0 : order[status];
    return (
      '<ol class="bh-flow">' +
      steps
        .map((s, i) => {
          const on = i <= cur;
          return '<li class="' + (on ? 'is-on' : '') + '">' + esc(s[1]) + '</li>';
        })
        .join('') +
      '</ol>'
    );
  }

  /** 流程圖卡片 HTML（視覺對齊催收 term-sop，class 用 bh-sop） */
  function sopBoardHtml(kind, bag, openId) {
    const stages = stagesOf(kind);
    return (
      '<div class="bh-sop-board" role="list">' +
      stages
        .map((s) => {
          const st = stageStatusOf(kind, s, bag);
          const prog = stageProgressOf(kind, s, bag);
          const gate = stageOpenGate(s, bag);
          const on = openId === s.id;
          const pct =
            prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : st === 'done' ? 100 : 0;
          const countTxt =
            prog.total > 0 ? prog.done + '／' + prog.total + (String(s.kind).indexOf('matters') >= 0 ? ' 案' : ' 項') : stageStatusLabel(st);
          return (
            '<button type="button" class="bh-sop-card is-' +
            esc(st) +
            (on ? ' is-on' : '') +
            '" data-bh-stage="' +
            esc(s.id) +
            '" aria-expanded="' +
            (on ? 'true' : 'false') +
            '" role="listitem">' +
            '<span class="bh-sop-num">' +
            s.n +
            '</span>' +
            '<span class="bh-sop-owner">' +
            esc(s.owner) +
            '</span>' +
            '<strong class="bh-sop-act">' +
            esc(s.title) +
            '</strong>' +
            '<span class="bh-sop-blurb">' +
            esc(s.blurb) +
            '</span>' +
            '<span class="bh-sop-status" data-st="' +
            esc(st) +
            '">' +
            esc(stageStatusLabel(st)) +
            '</span>' +
            '<span class="bh-sop-count">' +
            esc(countTxt) +
            (prog.total > 0 ? ' · ' + pct + '%' : '') +
            '</span>' +
            (!gate.open ? '<span class="bh-sop-lock">' + esc(gate.reason || '尚未開放') + '</span>' : '') +
            '<span class="bh-sop-cta">點開此階段工作</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function caseHeaderHtml(kind, bag, role) {
    const c = (bag && bag.case) || {};
    const ov = overallProgress(kind, bag);
    const pct = ov.total ? Math.round((ov.done / ov.total) * 100) : 0;
    return (
      '<div class="bh-case-head">' +
      '<div class="bh-case-head-main">' +
      '<p class="bh-kicker">' +
      (kind === 'admin' ? '行政離職交接' : '業務離職交接') +
      '</p>' +
      '<h3>' +
      esc(c.transferorName || '—') +
      '</h3>' +
      '<p class="bh-case-meta">' +
      esc(c.unit || (kind === 'admin' ? '行政管理部' : '業務')) +
      ' · ' +
      esc(c.region || '未填地區') +
      ' · ' +
      (c.leaveType === 'leave_without_pay' ? '留職停薪' : '離職') +
      ' · 離職日 ' +
      esc(c.leaveDate || '—') +
      '</p>' +
      '<p class="bh-case-meta">接手人 ' +
      esc(c.receiverName || '—') +
      ' · 主管 ' +
      esc(c.managerName || '—') +
      ' · 你的角色 <b>' +
      esc(role || '—') +
      '</b></p>' +
      flowBar(c.status) +
      (c.returnReason ? '<p class="bh-warn">退回理由：' + esc(c.returnReason) + '</p>' : '') +
      '</div>' +
      '<div class="bh-case-head-prog" aria-label="整體完成進度">' +
      '<strong>' +
      pct +
      '%</strong>' +
      '<span>' +
      ov.done +
      '／' +
      ov.total +
      ' 階段</span>' +
      '<small>' +
      esc(statusLabel(c.status)) +
      '</small></div></div>'
    );
  }

  global.HandoverCore = {
    STATUS_LABEL,
    STAGE_STATUS_LABEL,
    SECTION_LABEL,
    BIZ_CHECK_DEFS,
    REGIONS,
    ADMIN_STAGES,
    BIZ_STAGES,
    token,
    meName,
    esc,
    rpc,
    statusLabel,
    stageStatusLabel,
    blockersHtml,
    blockerToStage,
    matterChecksComplete,
    buildBizChecks,
    printWindow,
    buildPrintHtml,
    flowBar,
    stagesOf,
    stageProgressOf,
    stageStatusOf,
    stageOpenGate,
    overallProgress,
    canEditStage,
    filterMatters,
    matterOverdue,
    sopBoardHtml,
    caseHeaderHtml,
    itemDone,
    itemFilled
  };
})(typeof window !== 'undefined' ? window : globalThis);
