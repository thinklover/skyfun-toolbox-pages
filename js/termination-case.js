/**
 * 轉租解約試算 · 公司查詢、案件暫存、現場點交、解約單欄位對照
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'skyfun-termination-cases-v1';
  const PREFIX = 'depref-';

  function $(id) {
    return document.getElementById(id);
  }

  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(
    /\/$/,
    ''
  );

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = window.skyfunAuth?.getToken?.();
    if (token) {
      h.Authorization = 'Bearer ' + token;
      h['X-Skyfun-Session'] = token;
    }
    return h;
  }

  function currentUser() {
    return window.skyfunAuth?.getUser?.() || null;
  }

  function accountKey() {
    const u = currentUser();
    return String(u?.id || u?.username || '').trim();
  }

  function storageKey() {
    const k = accountKey();
    return k ? STORAGE_KEY + ':' + k : STORAGE_KEY + ':anon';
  }

  async function rpcTerm(name, extra) {
    const auth = window.skyfunAuth;
    if (!auth?.rpc) throw new Error('請先登入工具箱');
    const token = auth.getToken?.();
    if (!token) throw new Error('請先登入，暫存才會綁到帳號');
    return auth.rpc(name, Object.assign({ p_token: token }, extra || {}));
  }

  function markSaveNeeded(on) {
    $('term-case-save-btn')?.classList.toggle('need-save', !!on);
    const hint = $('term-case-save-hint');
    if (!hint) return;
    hint.classList.toggle('hidden', !on);
  }

  function mergeCases(a, b) {
    const map = new Map();
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach((c) => {
      if (!c || !c.id) return;
      const prev = map.get(c.id);
      if (!prev || String(c.updatedAt || '') > String(prev.updatedAt || '')) map.set(c.id, c);
    });
    return Array.from(map.values());
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return '—';
    return 'NT$ ' + x.toLocaleString('zh-TW');
  }

  function dateKey(text) {
    const m = String(text || '').match(/(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) return '';
    let y = +m[1];
    if (y < 1911) y += 1911;
    return y + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
  }

  function readCases() {
    try {
      const raw = localStorage.getItem(storageKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((c) => !c.kind || c.kind === 'zhuan') : [];
    } catch {
      return [];
    }
  }

  function writeCases(list) {
    localStorage.setItem(storageKey(), JSON.stringify(list));
  }

  function migrateLegacyCases() {
    const user = currentUser();
    if (!user) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || !list.length) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const mine = list.filter((c) => {
        const by = String(c?.createdBy || '').trim();
        return !by || by === user.name || by === user.username;
      });
      if (mine.length) writeCases(mergeCases(readCases(), mine));
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function uid() {
    const u = accountKey().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return 'tc_' + (u || 'u') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normAddr(s) {
    return String(s || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/台北市/g, '臺北市')
      .replace(/台中市/g, '臺中市')
      .replace(/台南市/g, '臺南市')
      .replace(/台東縣/g, '臺東縣');
  }

  function normName(s) {
    return String(s || '').trim().replace(/\s+/g, '');
  }

  function getField(id) {
    const el = $(id);
    return el ? String(el.value ?? '').trim() : '';
  }

  function setField(id, val, allowEmpty) {
    const el = $(id);
    if (!el) return;
    if (!allowEmpty && (val == null || val === '')) return;
    el.value = val == null ? '' : val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setCheckbox(id, on) {
    const el = $(id);
    if (!el) return;
    el.checked = !!on;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function collectDeprefSnapshot() {
    return {
      noticeDate: getField(PREFIX + 'notice-date'),
      exitDate: getField(PREFIX + 'exit-full-date'),
      leaseStart: getField(PREFIX + 'lease-start-date'),
      rent: getField(PREFIX + 'rent'),
      mgmtInCompany: !!$(PREFIX + 'mgmt-in-company')?.checked,
      mgmtFee: getField(PREFIX + 'mgmt-fee'),
      depositMonths: getField(PREFIX + 'deposit-months'),
      depositOverride: getField(PREFIX + 'deposit-override'),
      water: getField(PREFIX + 'water'),
      electric: getField(PREFIX + 'electric'),
      gas: getField(PREFIX + 'gas'),
      cleaning: getField(PREFIX + 'cleaning'),
      repair: getField(PREFIX + 'repair'),
      otherDeduct: getField(PREFIX + 'other-deduct'),
      firstMissedDue: getField(PREFIX + 'first-missed-due-date'),
      overpayEnabled: !!document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked')?.value &&
        document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked').value === '1',
      overpayManual: getField(PREFIX + 'overpay-manual'),
      reason: getField('term-case-reason'),
      reasonNote: getField('term-case-reason-note'),
      baoToMgmt: getField('term-case-bao-to-mgmt'),
      signDate: getField('term-case-sign-date'),
      tenantId: getField('term-case-tenant-id'),
      tenantPhone: getField('term-case-tenant-phone'),
      leaseEnd: getField('term-case-lease-end'),
      bankName: getField('term-case-bank-name'),
      bankBranch: getField('term-case-bank-branch'),
      bankAccountName: getField('term-case-bank-account-name'),
      bankAccountNo: getField('term-case-bank-account-no'),
      promissory: getField('term-case-promissory'),
      officeId: getField('term-case-office-id') || 'hq'
    };
  }

  function collectExtraItems() {
    const list = [];
    document.querySelectorAll('#term-handover-extra-items [data-extra-row]').forEach((row) => {
      const name = String(row.querySelector('[data-extra-name]')?.value || '').trim();
      const amt = Math.round(Number(String(row.querySelector('[data-extra-amt]')?.value || '').replace(/,/g, '')) || 0);
      if (name || amt) list.push({ name, amt });
    });
    return list.slice(0, 4);
  }

  function extraRowHtml(item) {
    const name = esc(item?.name || '');
    const amt = item?.amt != null && item.amt !== '' ? esc(String(item.amt)) : '';
    return `<div data-extra-row class="grid grid-cols-1 sm:grid-cols-[1fr_7rem_auto] gap-2 items-end">
      <div class="space-y-1">
        <label class="block text-[11px] font-semibold text-slate-600">扣項名稱</label>
        <input data-extra-name type="text" maxlength="40" value="${name}" placeholder="例：清潔費／修繕費／鑰匙遺失×1"
               class="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm" />
      </div>
      <div class="space-y-1">
        <label class="block text-[11px] font-semibold text-slate-600">金額</label>
        <input data-extra-amt type="number" inputmode="numeric" min="0" step="1" value="${amt}" placeholder="0"
               class="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm tabular-nums" />
      </div>
      <button type="button" data-extra-remove class="btn btn-sm tone-slate-mid font-bold mb-0.5">刪</button>
    </div>`;
  }

  function renderExtraItems(items) {
    const box = $('term-handover-extra-items');
    if (!box) return;
    const rows = Array.isArray(items) && items.length ? items.slice(0, 4) : [{ name: '', amt: '' }];
    box.innerHTML = rows.map((it) => extraRowHtml(it)).join('');
  }

  function fillOfficeSelect(selected) {
    const sel = $('term-case-office-id');
    if (!sel) return;
    const html = window.TerminationAgreementPdf?.officeOptionsHtml?.(selected || 'hq');
    if (html) sel.innerHTML = html;
    else if (selected) sel.value = selected;
    syncOfficeHint();
  }

  function syncOfficeHint() {
    const id = getField('term-case-office-id') || 'hq';
    const o = window.TerminationAgreementPdf?.getCompanyOffice?.(id) || {
      name: '企業總部',
      addr: '台北市萬華區中華路一段106號',
      phone: '(02) 7755-2669'
    };
    const hint = $('term-case-office-hint');
    if (hint) hint.textContent = o.name + '　' + o.addr + '　' + o.phone;
    const line = $('term-case-company-party-line');
    if (line) {
      line.textContent =
        '甲方：星鴻股份有限公司　統編 85103034　' + o.addr + '　' + o.phone + '（' + o.name + '）';
    }
  }

  function applyDeprefSnapshot(snap) {
    if (!snap) return;
    setField(PREFIX + 'notice-date', snap.noticeDate, true);
    setField(PREFIX + 'exit-full-date', snap.exitDate, true);
    setField(PREFIX + 'lease-start-date', snap.leaseStart, true);
    setField(PREFIX + 'rent', snap.rent);
    setCheckbox(PREFIX + 'mgmt-in-company', snap.mgmtInCompany);
    if (snap.mgmtInCompany) setField(PREFIX + 'mgmt-fee', snap.mgmtFee);
    setField(PREFIX + 'deposit-months', snap.depositMonths || '2');
    setField(PREFIX + 'deposit-override', snap.depositOverride);
    setField(PREFIX + 'water', snap.water);
    setField(PREFIX + 'electric', snap.electric);
    setField(PREFIX + 'gas', snap.gas);
    setField(PREFIX + 'cleaning', snap.cleaning);
    setField(PREFIX + 'repair', snap.repair);
    setField(PREFIX + 'other-deduct', snap.otherDeduct);
    setField(PREFIX + 'first-missed-due-date', snap.firstMissedDue);
    setOverpayEnabled(!!snap.overpayEnabled);
    setField(PREFIX + 'overpay-manual', snap.overpayManual);
    setField('term-case-reason', snap.reason);
    setField('term-case-reason-note', snap.reasonNote);
    setField('term-case-bao-to-mgmt', snap.baoToMgmt);
    $('term-case-reason-note-wrap')?.classList.toggle('hidden', snap.reason !== '其他');
    setField('term-case-sign-date', snap.signDate);
    setField('term-case-tenant-id', snap.tenantId);
    setField('term-case-tenant-phone', snap.tenantPhone);
    setField('term-case-lease-end', snap.leaseEnd);
    setField('term-case-bank-name', snap.bankName);
    setField('term-case-bank-branch', snap.bankBranch);
    setField('term-case-bank-account-name', snap.bankAccountName);
    setField('term-case-bank-account-no', snap.bankAccountNo);
    setField('term-case-promissory', snap.promissory);
    fillOfficeSelect(snap.officeId || 'hq');
    if (typeof window.updateDepositRefundCalc === 'function') window.updateDepositRefundCalc();
  }

  function setOverpayEnabled(on) {
    const yes = $('depref-overpay-yes');
    const no = $('depref-overpay-no');
    if (!yes || !no) return;
    yes.checked = !!on;
    no.checked = !on;
    (on ? yes : no).dispatchEvent(new Event('change', { bubbles: true }));
  }

  function inferPaymentHint(erp, exitStr) {
    if (!erp) return { status: 'unknown', label: '尚無公司資料', detail: '' };
    const view = computeLedgerView(erp, exitStr || getField(PREFIX + 'exit-full-date'));
    if (view.arrears > 50) {
      return {
        status: 'underpay',
        label: '欠繳',
        detail: `總明細欠 ${fmtMoney(view.arrears)}（${view.unpaid.length} 期）`
      };
    }
    if (view.overpay > 50) {
      return {
        status: 'overpay',
        label: '溢繳',
        detail: view.overpayNote || `當期已匯且匯款日在解約日前，溢繳 ${fmtMoney(view.overpay)}`
      };
    }
    if (erp.isPaid === true || erp.paymentStatus === 'paid') {
      return { status: 'paid', label: '無到期欠款', detail: '總明細目前沒有到期未繳' };
    }
    return { status: 'neutral', label: '待現場確認', detail: '已帶入總明細' };
  }

  function computeLedgerView(erp, exitStr) {
    const lines = Array.isArray(erp?.ledgerAllLines) && erp.ledgerAllLines.length
      ? erp.ledgerAllLines
      : Array.isArray(erp?.ledgerLines)
        ? erp.ledgerLines
        : [];
    const exitK = dateKey(exitStr);
    const today = new Date();
    const todayK =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');
    const cutoff = exitK || todayK;
    const sorted = lines
      .slice()
      .sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)));
    const unpaid = sorted.filter((l) => {
      if (/未到期|已繳/.test(String(l.status || ''))) return false;
      if ((Number(l.arrears) || 0) <= 0) return false;
      const due = dateKey(l.dueDate);
      if (due && cutoff && due > cutoff) return false;
      return true;
    });
    const arrears = Math.round(unpaid.reduce((s, l) => s + (Number(l.arrears) || 0), 0));
    const first = unpaid[0]?.dueDate || '';
    let overpay = 0;
    let overpayNote = '';
    if (exitK) {
      const current = [...sorted].reverse().find((l) => {
        const due = dateKey(l.dueDate);
        return due && due <= exitK;
      });
      if (current && (Number(current.received) || 0) > 0 && (Number(current.arrears) || 0) <= 0) {
        const payK = dateKey(current.receivedDate);
        if (payK && payK < exitK) {
          const next = sorted.find((l) => dateKey(l.dueDate) > dateKey(current.dueDate));
          const periodEndK = next
            ? dateKey(next.dueDate)
            : '';
          const unused = periodEndK && periodEndK > exitK ? daysBetween(exitK, periodEndK) - 1 : 0;
          const span = periodEndK ? daysBetween(dateKey(current.dueDate), periodEndK) : 0;
          const rec = Number(current.receivable) || 0;
          if (unused > 0 && span > 0 && rec > 0) {
            overpay = Math.round((rec * unused) / span);
            overpayNote = `當期 ${current.dueDate} 已於 ${current.receivedDate} 匯款（早於解約日），未住 ${unused} 天溢繳 ${fmtMoney(overpay)}`;
          } else {
            overpayNote = `當期 ${current.dueDate} 已於 ${current.receivedDate} 匯款（早於解約日），請核對是否溢繳`;
            overpay = 1;
          }
        }
      }
    }
    return { unpaid, arrears, first, overpay: overpay === 1 ? 0 : overpay, overpayNote, lines: sorted };
  }

  function daysBetween(a, b) {
    const pa = a.split('-').map(Number);
    const pb = b.split('-').map(Number);
    if (pa.length !== 3 || pb.length !== 3) return 0;
    const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  function applyErpToDepref(erp) {
    if (!erp) return;
    if (erp.rent != null) setField(PREFIX + 'rent', String(Math.round(Number(erp.rent) || 0)));
    if (erp.depositMonths != null) setField(PREFIX + 'deposit-months', String(erp.depositMonths));
    else setField(PREFIX + 'deposit-months', '2');
    if (erp.totalDeposit != null) setField(PREFIX + 'deposit-override', String(Math.round(Number(erp.totalDeposit))));
    if (erp.leaseStart && !getField(PREFIX + 'lease-start-date')) {
      setField(PREFIX + 'lease-start-date', erp.leaseStart);
      setField('term-case-lease-start', erp.leaseStart);
    }
    if (erp.mgmtInCompany) {
      setCheckbox(PREFIX + 'mgmt-in-company', true);
      if (typeof window.deprefSyncMgmtFeeInput === 'function') window.deprefSyncMgmtFeeInput(PREFIX);
      const fee = Math.round(Number(erp.mgmtFee) || 0);
      if (fee > 0) setField(PREFIX + 'mgmt-fee', String(fee));
    } else {
      setCheckbox(PREFIX + 'mgmt-in-company', false);
      if (typeof window.deprefSyncMgmtFeeInput === 'function') window.deprefSyncMgmtFeeInput(PREFIX);
    }
    const view = computeLedgerView(erp, getField(PREFIX + 'exit-full-date'));
    if (view.arrears > 50 && view.first) {
      setField(PREFIX + 'first-missed-due-date', view.first);
      setOverpayEnabled(false);
    } else if (view.overpay > 50) {
      setOverpayEnabled(true);
      setField(PREFIX + 'first-missed-due-date', '', true);
      setField(PREFIX + 'overpay-manual', String(view.overpay));
    } else {
      setField(PREFIX + 'first-missed-due-date', '', true);
    }
    if (erp.signDate) setField('term-case-sign-date', erp.signDate);
    if (erp.tenantIdNo) setField('term-case-tenant-id', erp.tenantIdNo);
    if (erp.tenantPhone) setField('term-case-tenant-phone', erp.tenantPhone);
    if (erp.leaseEnd) setField('term-case-lease-end', erp.leaseEnd);
    applyRefundBank(erp.refundBank);
    if (typeof window.updateDepositRefundCalc === 'function') window.updateDepositRefundCalc();
  }

  function applyRefundBank(bank) {
    if (!bank) return false;
    if (bank.bank) setField('term-case-bank-name', bank.bank);
    if (bank.branch) setField('term-case-bank-branch', bank.branch);
    if (bank.accountName) setField('term-case-bank-account-name', bank.accountName);
    if (bank.accountNo) setField('term-case-bank-account-no', bank.accountNo);
    if (bank.accountNo && !getField('term-case-bank-account-name')) {
      setField('term-case-bank-account-name', bank.accountName || getField('term-case-tenant-name'));
    }
    return !!bank.accountNo;
  }

  function clearPassbookCover() {
    setField('term-case-passbook-json', '');
    const wrap = $('term-case-passbook-wrap');
    const img = $('term-case-passbook-preview');
    const meta = $('term-case-passbook-meta');
    if (wrap) wrap.classList.add('hidden');
    if (img) {
      img.removeAttribute('src');
      img.alt = '存摺封面預覽';
    }
    if (meta) meta.textContent = '';
  }

  function applyPassbookCover(cover) {
    if (!cover || !cover.base64) {
      clearPassbookCover();
      return false;
    }
    const payload = {
      path: cover.path || '',
      fileName: cover.fileName || '',
      contentType: cover.contentType || 'image/jpeg',
      size: cover.size || 0,
      base64: cover.base64
    };
    setField('term-case-passbook-json', JSON.stringify(payload));
    const wrap = $('term-case-passbook-wrap');
    const img = $('term-case-passbook-preview');
    const meta = $('term-case-passbook-meta');
    const mime = payload.contentType || 'image/jpeg';
    if (img) img.src = 'data:' + mime + ';base64,' + payload.base64;
    if (meta) {
      const kb = payload.size ? Math.round(payload.size / 1024) + ' KB' : '';
      meta.textContent = [payload.fileName || '存摺封面', kb].filter(Boolean).join(' · ');
    }
    if (wrap) wrap.classList.remove('hidden');
    return true;
  }

  function getPassbookCover() {
    const raw = getField('term-case-passbook-json');
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      return o && o.base64 ? o : null;
    } catch {
      return null;
    }
  }

  async function lookupTenantBank(tenantName, tenantIdNo, matchNo) {
    const q = new URLSearchParams({
      tenantName: tenantName || '',
      idNo: tenantIdNo || '',
      matchNo: matchNo || ''
    });
    const r = await fetch(RPA_BASE + '/termination/tenant-bank?' + q.toString(), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.message || data.error || '房客帳戶查詢失敗');
    }
    return data;
  }

  async function lookupFromCompany(tenantName, address, leaseStart, matchNo) {
    const q = new URLSearchParams({
      tenantName: tenantName || '',
      address: address || '',
      leaseStart: leaseStart || '',
      matchNo: matchNo || ''
    });
    const r = await fetch(RPA_BASE + '/termination/lookup?' + q.toString(), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.message || data.error || '查詢失敗（HTTP ' + r.status + '）');
    }
    return data;
  }

  async function fetchCandidates(address) {
    const q = new URLSearchParams({ address: address || '', kind: 'zhuan' });
    const r = await fetch(RPA_BASE + '/termination/candidates?' + q.toString(), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.message || data.error || '同址候選人查詢失敗');
    }
    return data;
  }

  function hidePick() {
    const wrap = $('term-case-pick-wrap');
    if (wrap) wrap.classList.add('hidden');
    const list = $('term-case-pick-list');
    if (list) list.innerHTML = '';
  }

  function showPick(candidates) {
    const wrap = $('term-case-pick-wrap');
    const list = $('term-case-pick-list');
    if (!wrap || !list) return;
    list.innerHTML = candidates
      .map((c, i) => {
        const sub = [c.leaseStart ? '起租 ' + c.leaseStart : '', c.matchNo || '']
          .filter(Boolean)
          .join(' · ');
        return (
          '<button type="button" class="term-case-pick-btn w-full text-left px-4 py-3 rounded-xl border-2 border-amber-200 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition" data-pick-idx="' +
          i +
          '">' +
          '<div class="font-bold text-slate-900">' +
          esc(c.name) +
          '</div>' +
          (sub ? '<div class="text-xs text-slate-500 mt-0.5">' + esc(sub) + '</div>' : '') +
          '</button>'
        );
      })
      .join('');
    wrap.classList.remove('hidden');
    list.querySelectorAll('.term-case-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pick-idx'));
        const c = candidates[idx];
        if (c) void runFullLookup(c);
      });
    });
  }

  function setLookupStatus(msg, isErr) {
    const el = $('term-case-lookup-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className =
      'text-sm leading-relaxed ' + (isErr ? 'text-rose-700 font-semibold' : 'text-slate-600');
  }

  function renderCaseList() {
    const sel = $('term-case-list');
    if (!sel) return;
    const cases = readCases()
      .filter((c) => c.status !== 'done')
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const cur = sel.value || $('term-case-active-id')?.value || '';
    sel.innerHTML =
      '<option value="">— 選擇暫存 —</option>' +
      cases
        .map((c) => {
          const label = [c.tenantName, c.address].filter(Boolean).join('｜') || c.id;
          const st = c.status === 'handover' ? '（待點交）' : '';
          return `<option value="${esc(c.id)}">${esc(label)}${st}</option>`;
        })
        .join('');
    if (cur && cases.some((c) => c.id === cur)) sel.value = cur;
  }

  async function purgeDoneCases() {
    const done = readCases().filter((c) => c.status === 'done');
    if (!done.length) return;
    writeCases(readCases().filter((c) => c.status !== 'done'));
    for (const c of done) {
      try {
        await rpcTerm('termination_case_delete', { p_id: c.id });
      } catch (_) {
        /* 本機已清；雲端失敗下次再試 */
      }
    }
    renderCaseList();
    window.TerminationHub?.refreshCaseList?.();
  }

  async function persistCase(row, opts) {
    const silent = !!(opts && opts.silent);
    const list = readCases().filter((c) => c.id !== row.id);
    list.push(row);
    writeCases(list);
    if ($('term-case-active-id')) $('term-case-active-id').value = row.id;
    renderCaseList();
    if ($('term-case-list')) $('term-case-list').value = row.id;
    try {
      const data = await rpcTerm('termination_case_upsert', { p_case: row });
      if (!data?.ok) throw new Error(data?.error || '雲端暫存失敗');
      if (data.id && data.id !== row.id) {
        const oldId = row.id;
        row.id = data.id;
        if ($('term-case-active-id')) $('term-case-active-id').value = row.id;
        writeCases(readCases().filter((c) => c.id !== oldId && c.id !== row.id).concat([row]));
        renderCaseList();
        if ($('term-case-list')) $('term-case-list').value = row.id;
      }
      markSaveNeeded(false);
      if (!silent) setLookupStatus('已暫存。同一帳號用手機登入即可看到。', false);
      return row;
    } catch (e) {
      if (!silent) {
        setLookupStatus('本機已暫存，但尚未同步到帳號：' + String(e.message || e), true);
      }
      return row;
    }
  }

  async function saveCurrentCase(opts) {
    const tenantName = getField('term-case-tenant-name') || $('term-case-tenant-name')?.dataset?.locked || '';
    const address = getField('term-case-address') || $('term-case-address')?.dataset?.locked || '';
    if (!tenantName && !address) {
      setLookupStatus('請至少填房客姓名或租賃地址', true);
      return null;
    }
    if (!window.skyfunAuth?.getToken?.()) {
      setLookupStatus('請先登入工具箱帳號，暫存才會綁到帳號並在手機看得到。', true);
      return null;
    }
    const id = $('term-case-active-id')?.value || uid();
    const existing = readCases().find((c) => c.id === id);
    const now = new Date().toISOString();
    const erpRaw = $('term-case-erp-json')?.value;
    let erpSnapshot = existing?.erpSnapshot || null;
    if (erpRaw) {
      try {
        erpSnapshot = JSON.parse(erpRaw);
      } catch (_) {}
    }
    const user = currentUser();
    const row = {
      id,
      kind: 'zhuan',
      tenantName,
      landlordName:
        getField('term-case-landlord-name') ||
        existing?.landlordName ||
        erpSnapshot?.landlordName ||
        '',
      endTenantName: tenantName,
      address,
      matchNo: $('term-case-match-no')?.value || erpSnapshot?.matchNo || '',
      status: existing?.status || 'draft',
      erpSnapshot,
      paymentHint: inferPaymentHint(erpSnapshot),
      depref: collectDeprefSnapshot(),
      noticeDate: getField(PREFIX + 'notice-date'),
      exitDate: getField(PREFIX + 'exit-full-date'),
      officeId: getField('term-case-office-id') || 'hq',
      handover: collectHandoverSnapshot() || existing?.handover || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: user?.name || user?.username || '',
      ownerUserId: user?.id || ''
    };
    return persistCase(row, opts);
  }

  function loadCase(id) {
    const row = readCases().find((c) => c.id === id);
    if (!row) return;
    $('term-case-active-id').value = row.id;
    setField('term-case-tenant-name', row.tenantName);
    setField('term-case-address', row.address);
    setField('term-case-lease-start', row.depref?.leaseStart || row.erpSnapshot?.leaseStart || '');
    setField(PREFIX + 'lease-start-date', row.depref?.leaseStart || row.erpSnapshot?.leaseStart || '');
    if ($('term-case-match-no')) $('term-case-match-no').value = row.matchNo || '';
    if ($('term-case-erp-json') && row.erpSnapshot) {
      $('term-case-erp-json').value = JSON.stringify(row.erpSnapshot);
    }
    renderErpSummary(row.erpSnapshot, row.paymentHint);
    applyDeprefSnapshot(row.depref);
    // 相容舊暫存：頂層也有可能存告知／實際解約日
    if (!getField(PREFIX + 'notice-date') && row.noticeDate) setField(PREFIX + 'notice-date', row.noticeDate);
    if (!getField(PREFIX + 'exit-full-date') && row.exitDate) setField(PREFIX + 'exit-full-date', row.exitDate);
    if (row.officeId || row.depref?.officeId) fillOfficeSelect(row.officeId || row.depref.officeId);
    applyHandoverFields(row.handover);
    syncNoticeExitFromBao(false);
    markSaveNeeded(false);
    setLookupStatus('已載入暫存：' + (row.address || row.tenantName), false);
  }

  async function deleteCurrentCase(forceId, opts) {
    const silent = !!(opts && opts.silent);
    const id = String(forceId || $('term-case-list')?.value || $('term-case-active-id')?.value || '').trim();
    if (!id) {
      if (!silent) setLookupStatus('請先選一筆暫存再刪除。', true);
      return false;
    }
    const row = readCases().find((c) => c.id === id);
    const label = row ? [row.tenantName, row.address].filter(Boolean).join('｜') : id;
    if (!silent && !window.confirm('確定刪除這筆暫存？\n' + label + '\n刪除後，手機同一帳號也會看不到。')) return false;
    try {
      const data = await rpcTerm('termination_case_delete', { p_id: id });
      if (!data?.ok) {
        const msg = String(data?.error || '刪除失敗');
        if (!/找不到|已刪除/.test(msg)) throw new Error(msg);
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (!/找不到|已刪除/.test(msg)) {
        setLookupStatus('刪除失敗：' + msg, true);
        return false;
      }
    }
    writeCases(readCases().filter((c) => c.id !== id));
    if ($('term-case-active-id')?.value === id) $('term-case-active-id').value = '';
    renderCaseList();
    if ($('term-case-list')) $('term-case-list').value = '';
    markSaveNeeded(false);
    if (!silent) setLookupStatus('已刪除暫存：' + label, false);
    return true;
  }

  async function syncFromCloud() {
    migrateLegacyCases();
    if (!window.skyfunAuth?.getToken?.()) {
      await purgeDoneCases();
      renderCaseList();
      return;
    }
    try {
      const data = await rpcTerm('termination_case_list', {});
      if (!data?.ok) throw new Error(data?.error || '讀取暫存失敗');
      const remote = (Array.isArray(data.cases) ? data.cases : []).filter(
        (c) => !c.kind || c.kind === 'zhuan'
      );
      writeCases(mergeCases(readCases(), remote));
    } catch (_) {
      /* keep local cache */
    }
    await purgeDoneCases();
    renderCaseList();
  }

  function renderErpSummary(erp, hint) {
    const box = $('term-case-erp-summary');
    renderPaymentBrief(erp, hint);
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
  }

  /** 合約起租區：與③帳期試算同一套金額（優先讀試算結果，避免兩邊不一致） */
  function renderPaymentBrief(erp, hint) {
    const box = $('depref-payment-brief');
    if (!box) return;
    if (!erp) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const exitStr = getField(PREFIX + 'exit-full-date');
    const view = computeLedgerView(erp, exitStr);
    const h = hint || inferPaymentHint(erp);
    let statusClass = 'text-slate-800';
    if (h.status === 'underpay') statusClass = 'text-rose-800';
    else if (h.status === 'overpay') statusClass = 'text-emerald-800';
    else if (h.status === 'paid') statusClass = 'text-slate-700';

    const lines = [];
    const fromCalc = readArrearsFromCalcDom();
    if (fromCalc.lines.length) {
      fromCalc.lines.forEach((t) => lines.push(esc(t)));
      lines.push(`合計 ${esc(fmtMoney(fromCalc.total))}（與下方試算結果③欠租相同）`);
      if (view.arrears > 0 && view.arrears !== fromCalc.total) {
        lines.push(`（催收總明細整期對照合計 ${esc(fmtMoney(view.arrears))}）`);
      }
    } else {
      const rent = Math.round(Number(getField(PREFIX + 'rent') || erp.rent) || 0);
      const leaseStart = getField(PREFIX + 'lease-start-date') || erp.leaseStart || '';
      const hybrid = buildArrearsWithDailyRent(view, exitStr, rent, leaseStart);
      if (hybrid.lines.length) {
        hybrid.lines.forEach((l) => {
          if (l.type === 'daily') {
            const credit =
              l.received > 0
                ? `（應計 ${esc(fmtMoney(l.gross || l.amount))} − 已匯 ${esc(fmtMoney(l.received))}）`
                : '';
            lines.push(
              `日租金欠款 ${esc(l.from)}～${esc(l.to)}　${esc(String(l.days))} 天 × ${esc(fmtMoney(Math.round(l.daily)))}/天　＝ ${esc(fmtMoney(l.amount))}${credit}`
            );
          } else {
            lines.push(`${esc(l.dueDate)}　欠 ${esc(fmtMoney(l.amount))}`);
          }
        });
        if (hybrid.total) lines.push(`合計 ${esc(fmtMoney(hybrid.total))}（整期＋日租金；解約日＝租金最後一天）`);
        if (view.arrears && view.arrears !== hybrid.total) {
          lines.push(`（催收總明細整期對照合計 ${esc(fmtMoney(view.arrears))}）`);
        }
      } else if (view.unpaid.length) {
        view.unpaid.forEach((l) => {
          lines.push(`${esc(l.dueDate)}　欠 ${esc(fmtMoney(l.arrears))}`);
        });
        if (view.arrears) lines.push(`合計 ${esc(fmtMoney(view.arrears))}`);
      } else if (view.overpayNote || view.overpay > 0) {
        lines.push(esc(view.overpayNote || `溢繳 ${fmtMoney(view.overpay)}`));
      } else if (h.detail) {
        lines.push(esc(h.detail));
      } else {
        lines.push('目前無到期欠款、也無溢繳試算');
      }
    }

    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="text-sm font-black ${statusClass}">${esc(h.label || '繳租狀態')}</div>
      <ul class="text-[12px] text-slate-700 leading-relaxed space-y-0.5 mt-0.5">
        ${lines.map((t) => `<li>${t}</li>`).join('')}
      </ul>`;
  }

  /** 讀取③帳期試算明細與合計，供欠繳區同步顯示 */
  function readArrearsFromCalcDom() {
    const out = { lines: [], total: 0 };
    const amtEl = $(PREFIX + 'out-arrears-billing');
    const raw = String(amtEl?.textContent || '').replace(/[^\d.-]/g, '');
    const total = Math.round(Number(raw) || 0);
    const detail = $(PREFIX + 'billing-arrears-detail');
    if (detail) {
      detail.querySelectorAll('li').forEach((li) => {
        const t = String(li.textContent || '').trim();
        if (!t || /尚無比例試算/.test(t)) return;
        out.lines.push(t);
      });
    }
    if (total > 0) out.total = total;
    else if (out.lines.length) {
      // 明細有、合計欄尚未寫入時，從明細金額加總
      let sum = 0;
      out.lines.forEach((t) => {
        const m = t.match(/＝\s*([\d,]+)\s*元/);
        if (m) sum += Math.round(Number(String(m[1]).replace(/,/g, '')) || 0);
      });
      out.total = sum;
    }
    return out;
  }

  /** 整期欠繳保留；解約落在當期則改切日租金；總明細最後一期之後至解約日再補日租金 */
  function buildArrearsWithDailyRent(view, exitStr, rent, leaseStart) {
    const unpaid = Array.isArray(view?.unpaid) ? view.unpaid : [];
    const exitK = dateKey(exitStr);
    const out = { lines: [], total: 0 };
    if (!unpaid.length || !exitK || !(rent > 0)) return out;

    const dueDay = (() => {
      const m = String(leaseStart || '').match(/(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
      if (!m) return null;
      const d = +m[3];
      return Number.isFinite(d) && d >= 1 && d <= 31 ? d : null;
    })();

    function addMonthsDue(iso, day) {
      const p = iso.split('-').map(Number);
      let y = p[0];
      let mo = p[1] + 1;
      if (mo > 12) {
        y += 1;
        mo = 1;
      }
      const dim = new Date(y, mo, 0).getDate();
      const d = Math.min(day || p[2], dim);
      return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function periodEndIso(dueIso) {
      if (Number.isFinite(dueDay)) {
        const next = addMonthsDue(dueIso, dueDay);
        const parts = next.split('-').map(Number);
        const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        dt.setUTCDate(dt.getUTCDate() - 1);
        return (
          dt.getUTCFullYear() +
          '-' +
          String(dt.getUTCMonth() + 1).padStart(2, '0') +
          '-' +
          String(dt.getUTCDate()).padStart(2, '0')
        );
      }
      const p = dueIso.split('-').map(Number);
      const last = new Date(p[0], p[1], 0).getDate();
      return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(last).padStart(2, '0');
    }

    function nextDueIso(dueIso) {
      if (Number.isFinite(dueDay)) return addMonthsDue(dueIso, dueDay);
      const p = dueIso.split('-').map(Number);
      let y = p[0];
      let m = p[1] + 1;
      if (m > 12) {
        y += 1;
        m = 1;
      }
      const dim = new Date(y, m, 0).getDate();
      return y + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(p[2], dim)).padStart(2, '0');
    }

    function fmtRoc(iso) {
      const p = String(iso || '').split('-').map(Number);
      if (p.length !== 3) return iso || '';
      return p[0] - 1911 + '/' + String(p[1]).padStart(2, '0') + '/' + String(p[2]).padStart(2, '0');
    }

    function pushDaily(fromK, toK) {
      if (!fromK || !toK || fromK > toK) return;
      const next = nextDueIso(fromK);
      const cycleDays = daysBetween(fromK, next);
      if (cycleDays <= 0) return;
      const pe = periodEndIso(fromK);
      const segEnd = toK < pe ? toK : pe;
      const usedDays = daysBetween(fromK, segEnd) + 1;
      if (usedDays <= 0) return;
      const daily = rent / cycleDays;
      const amt = Math.round(rent * (usedDays / cycleDays));
      if (usedDays >= cycleDays && segEnd === pe) {
        out.lines.push({ type: 'full', dueDate: fmtRoc(fromK), amount: amt });
      } else {
        out.lines.push({
          type: 'daily',
          from: fmtRoc(fromK),
          to: fmtRoc(segEnd),
          days: usedDays,
          daily,
          amount: amt
        });
      }
      out.total += amt;
      if (segEnd < toK) {
        const cont = nextDueIso(fromK);
        // cont is next period start (= pe + 1 day conceptually via next due)
        pushDaily(cont, toK);
      }
    }

    let lastPeriodEnd = '';
    for (let i = 0; i < unpaid.length; i++) {
      const u = unpaid[i];
      const dueK = dateKey(u.dueDate);
      if (!dueK || dueK > exitK) break;
      const pe = periodEndIso(dueK);
      const nextDue = nextDueIso(dueK);
      const cycleDays = daysBetween(dueK, nextDue);
      if (cycleDays <= 0) continue;
      lastPeriodEnd = pe;

      if (exitK <= pe) {
        const usedDays = daysBetween(dueK, exitK) + 1;
        const received = Math.round(Number(u.received != null ? u.received : u.paid) || 0);
        if (usedDays >= cycleDays) {
          const amt = Math.round(Number(u.arrears) || rent);
          out.lines.push({ type: 'full', dueDate: u.dueDate, amount: amt });
          out.total += amt;
        } else {
          const daily = rent / cycleDays;
          const gross = Math.round(rent * (usedDays / cycleDays));
          const credit = Math.min(received, gross);
          const amt = Math.max(0, gross - credit);
          out.lines.push({
            type: 'daily',
            from: u.dueDate || fmtRoc(dueK),
            to: exitStr || fmtRoc(exitK),
            days: usedDays,
            daily,
            amount: amt,
            gross,
            received: credit
          });
          out.total += amt;
        }
        return out;
      }

      const amt = Math.round(Number(u.arrears) || rent);
      out.lines.push({ type: 'full', dueDate: u.dueDate, amount: amt });
      out.total += amt;
    }

    // 催收總明細尚未開下期帳：解約日超過最後一期期末 → 補切日租金至解約日
    if (lastPeriodEnd && exitK > lastPeriodEnd) {
      const contStart = (() => {
        const p = lastPeriodEnd.split('-').map(Number);
        const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
        dt.setUTCDate(dt.getUTCDate() + 1);
        return (
          dt.getUTCFullYear() +
          '-' +
          String(dt.getUTCMonth() + 1).padStart(2, '0') +
          '-' +
          String(dt.getUTCDate()).padStart(2, '0')
        );
      })();
      pushDaily(contStart, exitK);
    }

    return out;
  }

  function normAddrKey(s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .toLowerCase();
  }

  /** 轉租告知／實際解約日：自同址包租案件帶入（畫面隱藏，自動計算） */
  function syncNoticeExitFromBao(force) {
    const addr = getField('term-case-address');
    if (!addr) return false;
    const key = normAddrKey(addr);
    let baoList = [];
    try {
      baoList = window.TerminationBaoCase?.readCases?.() || [];
    } catch (_) {
      baoList = [];
    }
    const bao = baoList.find((c) => normAddrKey(c.address) === key);
    if (!bao) return false;
    const notice = bao.depref?.noticeDate || '';
    const exit = bao.depref?.exitDate || '';
    let changed = false;
    if (notice && (force || !getField(PREFIX + 'notice-date'))) {
      setField(PREFIX + 'notice-date', notice);
      changed = true;
    }
    if (exit && (force || !getField(PREFIX + 'exit-full-date'))) {
      setField(PREFIX + 'exit-full-date', exit);
      changed = true;
    }
    if (changed && typeof window.updateDepositRefundCalc === 'function') {
      window.updateDepositRefundCalc();
    }
    return changed;
  }

  /** 包租暫存後：把告知／實際解約日寫進同址轉租暫存 */
  function applyBaoDatesToZhuanCases(baoRow) {
    const notice = baoRow?.depref?.noticeDate || '';
    const exit = baoRow?.depref?.exitDate || '';
    if (!notice && !exit) return;
    const key = normAddrKey(baoRow?.address);
    if (!key) return;
    const list = readCases();
    let touched = false;
    for (const c of list) {
      if (normAddrKey(c.address) !== key) continue;
      c.depref = c.depref || {};
      // 僅在轉租尚未填寫時帶入，避免覆蓋業務已暫存的告知／實際解約日
      if (notice && !c.depref.noticeDate) c.depref.noticeDate = notice;
      if (exit && !c.depref.exitDate) c.depref.exitDate = exit;
      c.updatedAt = new Date().toISOString();
      touched = true;
    }
    if (touched) writeCases(list);
    if (normAddrKey(getField('term-case-address')) === key) {
      if (notice && !getField(PREFIX + 'notice-date')) setField(PREFIX + 'notice-date', notice);
      if (exit && !getField(PREFIX + 'exit-full-date')) setField(PREFIX + 'exit-full-date', exit);
      if (typeof window.updateDepositRefundCalc === 'function') window.updateDepositRefundCalc();
    }
  }

  function buildFormFieldGuide() {
    const grandEl = $(PREFIX + 'out-grand');
    const grand = Number(grandEl?.dataset?.rawGrand);
    const deposit = $(PREFIX + 'out-deposit')?.textContent || '—';
    const util = $(PREFIX + 'out-util')?.textContent || '—';
    const other = $(PREFIX + 'out-other')?.textContent || '—';
    const penalty = $(PREFIX + 'out-penalty-notice')?.textContent || '—';
    const arrears = $(PREFIX + 'out-arrears-billing')?.textContent || '—';
    const deduct = $(PREFIX + 'out-deduct-total')?.textContent || '—';
    const balance = $(PREFIX + 'out-deposit-balance')?.textContent || '—';
    const overpay = $(PREFIX + 'out-overpay')?.textContent || '—';
    const grandLabel = $(PREFIX + 'out-grand-label')?.textContent || '';
    const grandDisplay = grandEl?.textContent || '—';
    const rent = getField(PREFIX + 'rent');
    const notice = getField(PREFIX + 'notice-date');
    const exit = getField(PREFIX + 'exit-full-date');
    const leaseStart = getField(PREFIX + 'lease-start-date');
    const isRefund = Number.isFinite(grand) && grand > 0;
    const isPay = Number.isFinite(grand) && grand < 0;

    const rows = [
      { field: '房客姓名', value: getField('term-case-tenant-name'), tag: '（解約單抬頭／乙方）' },
      { field: '租賃地址', value: getField('term-case-address'), tag: '（解約單標的）' },
      { field: '甲方', value: '星鴻股份有限公司', tag: '出租人' },
      { field: '簽約日', value: getField('term-case-sign-date') || '—', tag: '合約審核' },
      { field: '今乙方因', value: (window.TerminationAgreementPdf?.reasonText?.() || getField('term-case-reason')) || '—', tag: '解約原因' },
      { field: '包租轉代管', value: '否', tag: '第3頁終止性質（固定）' },
      { field: '{{月租金}}', value: rent ? fmtMoney(rent) : '—', tag: '月租金欄' },
      { field: '{{總押金}}', value: deposit, tag: '押金欄' },
      { field: '{{告知解約日}}', value: notice || '—', tag: '' },
      { field: '{{實際解約日}}', value: exit || '—', tag: '合約解約日' },
      { field: '現場點交日', value: getField('term-case-handover-date') || '—', tag: '第五點結算日' },
      {
        field: '退還帳戶',
        value: [getField('term-case-bank-name'), getField('term-case-bank-branch'), getField('term-case-bank-account-name'), getField('term-case-bank-account-no')].filter(Boolean).join(' ') || '—',
        tag: '一律套印帳戶'
      },
      { field: '簽立本票', value: getField('term-case-promissory') === 'yes' ? '有' : getField('term-case-promissory') === 'no' ? '無' : '—', tag: '第4頁' },
      { field: '{{合約起租日}}', value: leaseStart || '—', tag: '' },
      { field: '{{水費}}／{{電費}}／{{瓦斯費}}', value: util, tag: '水電瓦斯合計' },
      { field: '{{清潔費}}等', value: other, tag: '其他扣項合計' },
      { field: '{{提前解約違約金}}', value: penalty, tag: '⓪' },
      { field: '{{帳期欠租金額}}', value: arrears, tag: '③' },
      { field: '{{應扣合計}}', value: deduct, tag: '' },
      { field: '{{押金沖抵後餘額}}', value: balance, tag: '' },
      { field: '{{溢繳應退}}', value: overpay, tag: '④' },
      {
        field: isRefund ? '{{應退還金額}}' : isPay ? '{{應補付金額}}' : '{{淨額顯示}}',
        value: grandDisplay,
        tag: grandLabel
      }
    ];

    const el = $('term-case-form-guide');
    if (!el) return;
    el.innerHTML = rows
      .map(
        (r) =>
          `<tr class="border-b border-slate-100 last:border-0">
            <td class="py-2 pr-3 text-slate-600 whitespace-nowrap">${esc(r.field)}</td>
            <td class="py-2 pr-3 font-bold text-slate-900 tabular-nums">${esc(r.value)}</td>
            <td class="py-2 text-xs text-slate-500">${esc(r.tag)}</td>
          </tr>`
      )
      .join('');
  }

  function collectHandoverSnapshot() {
    const date = getField('term-handover-exit-date') || getField('term-case-handover-date');
    const water = getField('term-handover-water') || getField('term-case-handover-water');
    const electric = getField('term-handover-electric') || getField('term-case-handover-electric');
    const gas = getField('term-handover-gas') || getField('term-case-handover-gas');
    const utilPayer =
      getField('term-handover-util-payer') || getField('term-case-handover-util-payer') || '';
    const extraItems = collectExtraItems();
    if (![date, water, electric, gas, utilPayer].some(Boolean) && !extraItems.length) {
      return null;
    }
    return {
      exitDate: date,
      water,
      electric,
      gas,
      utilPayer,
      extraItems
    };
  }

  function applyHandoverFields(h) {
    setField('term-case-handover-date', h?.exitDate || '');
    setField('term-case-handover-water', h?.water ?? '');
    setField('term-case-handover-electric', h?.electric ?? '');
    setField('term-case-handover-gas', h?.gas ?? '');
    setField('term-case-handover-util-payer', h?.utilPayer ?? '');
    setField('term-case-handover-water-meter', '');
    setField('term-case-handover-electric-meter', '');
    setField('term-case-handover-gas-meter', '');
    if (h && 'extraItems' in h) renderExtraItems(h.extraItems || []);
  }

  function openHandoverModal(row, autoOpen) {
    const modal = $('term-case-handover-modal');
    if (!modal) return;
    window.__termHandoverKind = 'zhuan';
    const isBao = false;
    const promissoryWrap = $('term-handover-promissory-wrap');
    if (promissoryWrap) promissoryWrap.classList.toggle('hidden', !!isBao);
    if (!isBao) {
      setField('term-case-promissory', row?.depref?.promissory || getField('term-case-promissory') || '');
    }
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    $('term-case-handover-id').value = row?.id || $('term-case-active-id')?.value || '';
    const saved = row?.handover || {};
    setField('term-handover-exit-date', saved.exitDate || getField('term-case-handover-date') || '');
    setField('term-handover-water', saved.water ?? getField('term-case-handover-water'));
    setField('term-handover-electric', saved.electric ?? getField('term-case-handover-electric'));
    setField('term-handover-gas', saved.gas ?? getField('term-case-handover-gas'));
    setField(
      'term-handover-util-payer',
      saved.utilPayer === 'agent'
        ? 'agent-deposit'
        : saved.utilPayer || getField('term-case-handover-util-payer') || ''
    );
    renderExtraItems(saved.extraItems || row?.depref?.extraItems || []);
    const result = $('term-handover-result');
    if (result) result.classList.add('hidden');
    $('term-handover-pdf-confirm')?.classList.add('hidden');
    const status = $('term-handover-pdf-status');
    if (status) status.textContent = '';
    showHandoverDraftStatus('', false);
    modal.classList.add('is-open');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('term-handover-open');
    const title = $('term-case-handover-title');
    if (title) {
      title.textContent =
        '現場點交 — ' + ((autoOpen && row && (row.address || row.tenantName)) || row?.address || row?.tenantName || '解約案件');
    }
    const dialog = modal.querySelector('.term-handover-dialog');
    if (dialog) dialog.scrollTop = 0;
    setTimeout(() => $('term-handover-exit-date')?.focus(), 50);
  }

  function closeHandoverModal() {
    const modal = $('term-case-handover-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('term-handover-open');
  }

  function fillHandoverResultPanel() {
    const grandEl = $(PREFIX + 'out-grand');
    const grandLabel = $(PREFIX + 'out-grand-label')?.textContent || '結算金額';
    const grandDisplay = grandEl?.textContent || '—';
    const note = $(PREFIX + 'out-note')?.textContent || '';
    const amountEl = $('term-handover-result-amount');
    const noteEl = $('term-handover-result-note');
    const guideSrc = $('term-case-form-guide');
    const guideDest = $('term-handover-result-guide');
    const isPay = /應補付/.test(grandLabel);
    if (amountEl) {
      amountEl.textContent = grandLabel + '：' + grandDisplay;
      amountEl.className =
        'text-xl font-black tabular-nums ' + (isPay ? 'text-rose-600' : 'text-indigo-950');
    }
    if (noteEl) {
      noteEl.textContent = note;
      noteEl.classList.toggle('hidden', true);
    }
    if (guideDest) guideDest.innerHTML = guideSrc ? guideSrc.innerHTML : '';
    const panel = $('term-handover-result');
    if (panel) {
      panel.classList.remove('hidden');
      panel.querySelector('details')?.removeAttribute('open');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function showHandoverWorksheetPrompt() {
    const box = $('term-handover-pdf-confirm');
    if (!box) return;
    box.classList.remove('hidden');
    const status = $('term-handover-pdf-status');
    if (status) {
      status.textContent = '';
      status.className = 'text-xs text-slate-600 leading-relaxed';
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showHandoverDraftStatus(msg, isErr) {
    const el = $('term-handover-draft-status');
    if (!el) return;
    el.textContent = msg || '若無法現場結算金額請暫存';
    el.className =
      'text-xs leading-relaxed text-right font-semibold ' +
      (isErr ? 'text-rose-700' : msg ? 'text-emerald-800' : 'text-amber-800');
  }

  async function saveHandoverDraft() {
    if (window.__termHandoverKind === 'bao') {
      return window.TerminationBaoCase?.saveHandoverDraft?.();
    }
    const id = $('term-case-handover-id')?.value;
    if (!id) {
      showHandoverDraftStatus('請先選暫存案件再開現場點交。', true);
      return;
    }
    const handover = collectHandoverSnapshot() || {
      exitDate: getField('term-handover-exit-date'),
      water: getField('term-handover-water'),
      electric: getField('term-handover-electric'),
      gas: getField('term-handover-gas'),
      utilPayer: getField('term-handover-util-payer'),
      extraItems: collectExtraItems()
    };
    applyHandoverFields(handover);
    const promissory = getField('term-case-promissory');
    const list = readCases();
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) {
      showHandoverDraftStatus('找不到案件，請回專區重新開啟。', true);
      return;
    }
    list[idx].handover = handover;
    list[idx].status = 'handover';
    list[idx].updatedAt = new Date().toISOString();
    if (promissory) {
      list[idx].depref = { ...(list[idx].depref || {}), promissory };
    }
    showHandoverDraftStatus('暫存中…', false);
    await persistCase(list[idx], { silent: true });
    window.TerminationHub?.refreshCaseList?.();
    showHandoverDraftStatus('已暫存點交資料（待點交）。可稍後再回來完成試算。', false);
    setLookupStatus('點交已暫存，案件仍在「暫存案件」列表。', false);
  }

  function submitHandover() {
    if (window.__termHandoverKind && window.__termHandoverKind !== 'zhuan') return;
    const id = $('term-case-handover-id')?.value;
    if (!id) {
      closeHandoverModal();
      return;
    }
    const handover = collectHandoverSnapshot() || {
      exitDate: getField('term-handover-exit-date'),
      water: getField('term-handover-water'),
      electric: getField('term-handover-electric'),
      gas: getField('term-handover-gas'),
      utilPayer: getField('term-handover-util-payer'),
      extraItems: collectExtraItems()
    };
    applyHandoverFields(handover);
    const deductDeposit =
      handover.utilPayer === 'agent-deposit' ||
      handover.utilPayer === 'landlord-deposit' ||
      handover.utilPayer === 'agent';
    if (deductDeposit) {
      setField(PREFIX + 'water', handover.water);
      setField(PREFIX + 'electric', handover.electric);
      setField(PREFIX + 'gas', handover.gas);
    } else {
      setField(PREFIX + 'water', '');
      setField(PREFIX + 'electric', '');
      setField(PREFIX + 'gas', '');
    }
    const extraSum = (handover.extraItems || []).reduce(
      (s, r) => s + Math.round(Number(r.amt) || 0),
      0
    );
    setField(PREFIX + 'cleaning', '');
    setField(PREFIX + 'repair', '');
    setField(PREFIX + 'other-deduct', extraSum > 0 ? String(extraSum) : '');
    if (typeof window.updateDepositRefundCalc === 'function') window.updateDepositRefundCalc();

    const list = readCases();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      void deleteCurrentCase(id, { silent: true }).then(() => {
        window.TerminationHub?.refreshCaseList?.();
      });
    }
    buildFormFieldGuide();
    fillHandoverResultPanel();
    showHandoverWorksheetPrompt();
    setLookupStatus('點交完成，暫存已清除。請確認後下載第 3、4 頁對照用解約單，手填紙本。', false);
  }

  function lookupRequired() {
    return {
      address: getField('term-case-address')
    };
  }

  function lookupMissingLabels(req) {
    const miss = [];
    if (!req.address) miss.push('租賃地址');
    return miss;
  }

  function syncLookupButton() {
    const btn = $('term-case-lookup-btn');
    if (!btn) return;
    const miss = lookupMissingLabels(lookupRequired());
    btn.disabled = miss.length > 0;
    if (miss.length && !getField('term-case-erp-json')) {
      setLookupStatus('請先填租賃地址，再查詢。', false);
    }
  }

  async function runFullLookup(candidate) {
    const address = getField('term-case-address');
    const name = String(candidate?.name || '').trim();
    const leaseStart = String(candidate?.leaseStart || '').trim();
    const matchNo = String(candidate?.matchNo || '').trim();
    hidePick();
    if (name) setField('term-case-tenant-name', name);
    if (leaseStart) {
      setField('term-case-lease-start', leaseStart);
      setField(PREFIX + 'lease-start-date', leaseStart);
    }
    if (matchNo) setField('term-case-match-no', matchNo);
    setLookupStatus('已選定 ' + (name || '房客') + '，查詢催收總明細…', false);
    const lookupBtn = $('term-case-lookup-btn');
    if (lookupBtn) lookupBtn.disabled = true;
    try {
      const data = await lookupFromCompany(name, address, leaseStart, matchNo);
      const erp = data.record || data;
      if ($('term-case-erp-json')) $('term-case-erp-json').value = JSON.stringify(erp);
      if ($('term-case-match-no')) $('term-case-match-no').value = erp.matchNo || matchNo || '';
      if (erp.tenantName) setField('term-case-tenant-name', erp.tenantName);
      if (erp.landlordName && $('term-case-landlord-name')) {
        setField('term-case-landlord-name', erp.landlordName);
      }
      if (erp.leaseStart) {
        setField('term-case-lease-start', erp.leaseStart);
        setField(PREFIX + 'lease-start-date', erp.leaseStart);
      }
      renderErpSummary(erp);
      applyErpToDepref(erp);
      syncNoticeExitFromBao(false);
      markSaveNeeded(true);
      setLookupStatus((data.message || '已帶入催收總明細。') + '正在查房客管理帳戶…', false);
      try {
        const bankData = await lookupTenantBank(
          erp.tenantName || name,
          erp.tenantIdNo || getField('term-case-tenant-id'),
          erp.matchNo || getField('term-case-match-no')
        );
        const filled = applyRefundBank(bankData.refundBank);
        const hasCover = applyPassbookCover(bankData.passbookCover);
        if (erp && bankData.refundBank) erp.refundBank = bankData.refundBank;
        if (erp) erp.passbookCoverPath = bankData.passbookCover?.path || '';
        if ($('term-case-erp-json') && erp) $('term-case-erp-json').value = JSON.stringify(erp);
        renderErpSummary(erp);
        setLookupStatus(
          (data.message || '已帶入催收總明細。') +
            (filled ? ' ' + (bankData.message || '已帶入退還帳戶。') : ' ' + (bankData.message || '未取到帳戶，請自行填。')) +
            (hasCover ? '' : filled && !bankData.passbookCover ? '（無存摺封面）' : '') +
            '請點「暫存」。',
          false
        );
      } catch (bankErr) {
        clearPassbookCover();
        setLookupStatus(
          (data.message || '已帶入催收總明細。') +
            ' 帳戶未帶入：' +
            String(bankErr.message || bankErr) +
            '，請自行填。請點「暫存」。',
          false
        );
      }
    } catch (e) {
      setLookupStatus(String(e.message || e), true);
    } finally {
      syncLookupButton();
    }
  }

  async function onLookupClick() {
    const req = lookupRequired();
    const miss = lookupMissingLabels(req);
    if (miss.length) {
      setLookupStatus('請先填：' + miss.join('、'), true);
      syncLookupButton();
      return;
    }
    hidePick();
    setLookupStatus('依地址查詢中…', false);
    const lookupBtn2 = $('term-case-lookup-btn');
    if (lookupBtn2) lookupBtn2.disabled = true;
    try {
      const data = await fetchCandidates(req.address);
      const list = Array.isArray(data.candidates) ? data.candidates : [];
      if (!list.length) {
        setLookupStatus(data.message || '此地址查無資料', true);
        return;
      }
      if (list.length === 1) {
        setLookupStatus(data.message || '找到 1 位房客，帶入中…', false);
        await runFullLookup(list[0]);
        return;
      }
      showPick(list);
      setLookupStatus(
        '此地址有 ' + list.length + ' 位房客，請先選一位再繼續抓資料。',
        false
      );
    } catch (e) {
      setLookupStatus(String(e.message || e), true);
    } finally {
      syncLookupButton();
    }
  }

  function wireUi() {
    $('term-case-lookup-btn')?.addEventListener('click', onLookupClick);
    document.querySelectorAll('.term-lookup-req').forEach((el) => {
      el.addEventListener('input', syncLookupButton);
      el.addEventListener('change', syncLookupButton);
    });
    syncLookupButton();
    fillOfficeSelect(getField('term-case-office-id') || 'hq');
    if (!window.__handoverExtraWired) {
      window.__handoverExtraWired = true;
      if (!$('term-handover-extra-items')?.children?.length) renderExtraItems([]);
      $('term-handover-extra-add-btn')?.addEventListener('click', () => {
        const cur = collectExtraItems();
        if (cur.length >= 4) {
          setLookupStatus('其他扣項最多 4 筆。', true);
          return;
        }
        cur.push({ name: '', amt: '' });
        renderExtraItems(cur);
        markSaveNeeded(true);
      });
      $('term-handover-extra-items')?.addEventListener('click', (ev) => {
        if (!ev.target?.closest?.('[data-extra-remove]')) return;
        const row = ev.target.closest('[data-extra-row]');
        row?.remove();
        if (!$('term-handover-extra-items')?.querySelector('[data-extra-row]')) renderExtraItems([]);
        markSaveNeeded(true);
      });
      $('term-handover-extra-items')?.addEventListener('input', () => markSaveNeeded(true));
    }
    $('term-case-office-id')?.addEventListener('change', () => {
      syncOfficeHint();
      markSaveNeeded(true);
    });
    $('term-case-save-btn')?.addEventListener('click', () => {
      void saveCurrentCase();
    });
    $('term-case-delete-btn')?.addEventListener('click', () => {
      void deleteCurrentCase();
    });
    $('term-case-handover-open-btn')?.addEventListener('click', () => {
      void (async () => {
        const id = $('term-case-active-id')?.value;
        let row = id ? readCases().find((c) => c.id === id) : null;
        if (!row) {
          row = await saveCurrentCase({ silent: true });
        }
        if (row) {
          row.status = 'handover';
          row.updatedAt = new Date().toISOString();
          await persistCase(row, { silent: true });
        }
        openHandoverModal(row || { id: $('term-case-active-id')?.value, depref: collectDeprefSnapshot() }, true);
      })();
    });
    $('term-case-list')?.addEventListener('change', (ev) => {
      const id = ev.target.value;
      if (id) loadCase(id);
    });
    $('term-case-handover-submit')?.addEventListener('click', submitHandover);
    $('term-case-handover-draft')?.addEventListener('click', () => {
      void saveHandoverDraft();
    });
    $('term-case-handover-cancel')?.addEventListener('click', closeHandoverModal);
    $('term-handover-pdf-confirm-ok')?.addEventListener('click', () => {
      void window.TerminationAgreementPdf?.fillAndDownload?.({
        pagesOnly: [3, 4],
        skipPassbook: true,
        worksheet: true,
        kind: window.__termHandoverKind === 'bao' ? 'bao' : 'zhuan'
      });
    });
    $('term-handover-pdf-confirm-cancel')?.addEventListener('click', () => {
      $('term-handover-pdf-confirm')?.classList.add('hidden');
    });
    const onExitChange = () => {
      const raw = $('term-case-erp-json')?.value;
      if (!raw) return;
      try {
        const erp = JSON.parse(raw);
        renderErpSummary(erp);
      } catch (_) {}
    };
    $(PREFIX + 'exit-full-date')?.addEventListener('change', onExitChange);
    $(PREFIX + 'exit-full-date')?.addEventListener('input', onExitChange);
    $('term-case-handover-modal')?.addEventListener('click', (ev) => {
      if (ev.target?.dataset?.dismiss === '1') closeHandoverModal();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && $('term-case-handover-modal')?.classList.contains('is-open')) {
        closeHandoverModal();
      }
    });
    renderCaseList();
  }

  function onCalcUpdated() {
    buildFormFieldGuide();
    try {
      const raw = $('term-case-erp-json')?.value;
      if (raw) {
        const erp = JSON.parse(raw);
        renderPaymentBrief(erp);
      }
    } catch (_) {}
  }

  function boot() {
    wireUi();
    buildFormFieldGuide();
    const start = () => {
      void syncFromCloud().then(() => {
        const hash = location.hash.match(/term-case=([^&]+)/);
        if (hash?.[1]) loadCase(decodeURIComponent(hash[1]));
      });
    };
    if (window.skyfunAuth?.isReady?.()) start();
    else document.addEventListener('skyfun-auth-ready', start, { once: true });
  }

  window.TerminationCase = {
    lookupFromCompany,
    lookupTenantBank,
    applyErpToDepref,
    applyPassbookCover,
    getPassbookCover,
    clearPassbookCover,
    saveCurrentCase,
    loadCase,
    deleteCurrentCase,
    openHandoverModal,
    showHandoverWorksheetPrompt,
    saveHandoverDraft,
    purgeDoneCases,
    buildFormFieldGuide,
    onCalcUpdated,
    syncNoticeExitFromBao,
    applyBaoDatesToZhuanCases,
    readCases,
    computeLedgerView,
    startFromHub,
    saveDraftLite,
    restoreDraftExtras
  };

  async function startFromHub(address, candidate) {
    const addr = String(address || '').trim();
    if (addr) setField('term-case-address', addr);
    syncLookupButton();
    await runFullLookup(candidate || { name: '', leaseStart: '', matchNo: '' });
  }

  function restoreDraftExtras(draft) {
    if (!draft) return;
    if (draft.id && $('term-case-active-id')) $('term-case-active-id').value = draft.id;
    const snap = draft.depref || {};
    if (snap.noticeDate) setField(PREFIX + 'notice-date', snap.noticeDate);
    if (snap.exitDate) setField(PREFIX + 'exit-full-date', snap.exitDate);
    if (snap.reason) {
      setField('term-case-reason', snap.reason);
      $('term-case-reason-note-wrap')?.classList.toggle('hidden', snap.reason !== '其他');
    }
    if (snap.reasonNote) setField('term-case-reason-note', snap.reasonNote);
    if (snap.baoToMgmt) setField('term-case-bao-to-mgmt', snap.baoToMgmt);
    if (typeof window.updateDepositRefundCalc === 'function') window.updateDepositRefundCalc();
  }

  async function saveDraftLite({ address, name, leaseStart, matchNo, landlordName, tenantName, endTenantName }) {
    const addr = String(address || '').trim();
    const tenant = String(tenantName || name || '').trim();
    if (!addr && !tenant) return null;
    if (!window.skyfunAuth?.getToken?.()) {
      throw new Error('請先登入工具箱帳號');
    }
    setField('term-case-address', addr);
    if (tenant) setField('term-case-tenant-name', tenant);
    if (leaseStart) {
      setField('term-case-lease-start', leaseStart);
      setField(PREFIX + 'lease-start-date', leaseStart);
    }
    if (matchNo) setField('term-case-match-no', matchNo);
    const row = await saveCurrentCase({ silent: true });
    if (row) {
      const ll = String(landlordName || '').trim();
      if (ll) row.landlordName = ll;
      if (tenant) {
        row.tenantName = tenant;
        row.endTenantName = String(endTenantName || tenant).trim();
      }
      row.updatedAt = new Date().toISOString();
      await persistCase(row, { silent: true });
    }
    return row;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
