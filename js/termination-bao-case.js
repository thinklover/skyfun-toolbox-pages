/**
 * 包租解約試算 · 案件暫存、現場點交、解約單
 * 甲方＝房東、乙方＝星鴻；虛擬帳號匯出金流對照（欠繳／溢繳仍手動）；退還帳戶＝房客虛擬帳號；不附存摺。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'skyfun-termination-bao-cases-v1';
  const PREFIX = 'baoref-';
  const KIND = 'bao';

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

  function uid() {
    return 'bao_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getField(id) {
    return String($(id)?.value || '').trim();
  }

  function setField(id, v) {
    const el = $(id);
    if (!el) return;
    el.value = v == null ? '' : String(v);
  }

  function setCheckbox(id, on) {
    const el = $(id);
    if (el) el.checked = !!on;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function markSaveNeeded(on) {
    $('bao-term-save-btn')?.classList.toggle('need-save', !!on);
    const hint = $('bao-term-save-hint');
    if (hint) hint.classList.toggle('hidden', !on);
  }

  function readCases() {
    try {
      const raw = localStorage.getItem(storageKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((c) => !c.kind || c.kind === KIND) : [];
    } catch {
      return [];
    }
  }

  function writeCases(list) {
    localStorage.setItem(storageKey(), JSON.stringify(list));
  }

  async function rpcTerm(name, extra) {
    const auth = window.skyfunAuth;
    if (!auth?.rpc) throw new Error('請先登入工具箱');
    const token = auth.getToken?.();
    if (!token) throw new Error('請先登入，暫存才會綁到帳號');
    return auth.rpc(name, Object.assign({ p_token: token }, extra || {}));
  }

  function setOverpayEnabled(on) {
    const yes = $(PREFIX + 'overpay-yes');
    const no = $(PREFIX + 'overpay-no');
    if (!yes || !no) return;
    yes.checked = !!on;
    no.checked = !on;
    (on ? yes : no).dispatchEvent(new Event('change', { bubbles: true }));
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
      overpayEnabled:
        !!document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked')?.value &&
        document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked').value === '1',
      overpayManual: getField(PREFIX + 'overpay-manual'),
      reason: getField('bao-term-reason'),
      reasonNote: getField('bao-term-reason-note'),
      baoToMgmt: getField('bao-term-bao-to-mgmt'),
      signDate: getField('bao-term-sign-date'),
      landlordId: getField('bao-term-landlord-id'),
      landlordPhone: getField('bao-term-landlord-phone'),
      landlordAddress: getField('bao-term-landlord-address'),
      leaseEnd: getField('bao-term-lease-end'),
      bankName: getField('bao-term-bank-name'),
      bankBranch: getField('bao-term-bank-branch'),
      bankAccountName: getField('bao-term-bank-account-name'),
      bankAccountNo: getField('bao-term-bank-account-no'),
      officeId: getField('bao-term-office-id') || 'hq'
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
    const sel = $('bao-term-office-id');
    if (!sel) return;
    const html = window.TerminationAgreementPdf?.officeOptionsHtml?.(selected || 'hq');
    if (html) sel.innerHTML = html;
    else if (selected) sel.value = selected;
    syncOfficeHint();
  }

  function syncOfficeHint() {
    const id = getField('bao-term-office-id') || 'hq';
    const o = window.TerminationAgreementPdf?.getCompanyOffice?.(id) || {
      name: '企業總部',
      addr: '台北市萬華區中華路一段106號',
      phone: '(02) 7755-2669'
    };
    const hint = $('bao-term-office-hint');
    if (hint) hint.textContent = o.name + '　' + o.addr + '　' + o.phone;
    const line = $('bao-term-company-party-line');
    if (line) {
      line.textContent =
        '乙方：星鴻股份有限公司　統編 85103034　' + o.addr + '　' + o.phone + '（' + o.name + '）';
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
    else setField(PREFIX + 'mgmt-fee', '');
    if (typeof window.deprefSyncMgmtFeeInput === 'function') window.deprefSyncMgmtFeeInput(PREFIX);
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
    setField('bao-term-reason', snap.reason);
    setField('bao-term-reason-note', snap.reasonNote);
    setField('bao-term-bao-to-mgmt', snap.baoToMgmt);
    $('bao-term-reason-note-wrap')?.classList.toggle('hidden', snap.reason !== '其他');
    setField('bao-term-sign-date', snap.signDate);
    setField('bao-term-landlord-id', snap.landlordId);
    setField('bao-term-landlord-phone', snap.landlordPhone);
    setField('bao-term-landlord-address', snap.landlordAddress);
    setField('bao-term-lease-end', snap.leaseEnd);
    setField('bao-term-bank-name', snap.bankName);
    setField('bao-term-bank-branch', snap.bankBranch);
    setField('bao-term-bank-account-name', snap.bankAccountName);
    setField('bao-term-bank-account-no', snap.bankAccountNo);
    fillOfficeSelect(snap.officeId || 'hq');
    if (typeof window.updateDepositRefundCalcFor === 'function') {
      window.updateDepositRefundCalcFor(PREFIX, 'landlord');
    } else if (typeof window.updateDepositRefundCalc === 'function') {
      window.updateDepositRefundCalc();
    }
  }

  function parseRocYmd(text) {
    const s = String(text || '').trim();
    const m = s.match(/^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) return null;
    let y = +m[1];
    if (y < 1911) y += 1911;
    return { y, m: +m[2], d: +m[3] };
  }

  function ymdCmp(a, b) {
    if (!a || !b) return 0;
    return a.y * 10000 + a.m * 100 + a.d - (b.y * 10000 + b.m * 100 + b.d);
  }

  /** 押金溢繳／解約日後匯出 → 自動勾「有溢繳」；押金溢繳併入④合計（不走手動欄） */
  function syncBaoOverpayFromRemittances(erp) {
    const exitStr = getField(PREFIX + 'exit-full-date') || erp?.leaseEnd || '';
    const exitYmd = parseRocYmd(exitStr);
    let hasExitRemit = Math.round(Number(erp?.rentOverpay) || 0) > 50;
    let rentNote = erp?.rentOverpayNote || '';
    if (exitYmd && Array.isArray(erp?.remittances)) {
      const bits = [];
      for (const r of erp.remittances) {
        const note = String(r.note || '');
        if (/兩押|押金|跨行/.test(note)) continue;
        const d = parseRocYmd(r.date);
        if (!d || ymdCmp(d, exitYmd) < 0) continue;
        const amt = Math.round(Number(r.amount) || 0);
        if (amt <= 50) continue;
        hasExitRemit = true;
        bits.push(`${r.date} ${amt.toLocaleString('zh-TW')}`);
      }
      if (bits.length) {
        rentNote = `解約日 ${exitStr} 當天或之後仍有匯出 ${bits.slice(0, 3).join('、')} → 日租金溢繳由④試算`;
      }
    }
    const depOver = Math.round(Number(erp?.depositOverpay) || 0);
    const depNote = String(erp?.depositOverpayNote || '').trim();
    setField(PREFIX + 'deposit-overpay-amt', depOver > 50 ? String(depOver) : '0');
    setField(PREFIX + 'deposit-overpay-note', depOver > 50 ? depNote : '');

    const hint = $('baoref-deposit-overpay-hint');
    const notes = [];
    if (erp?.rentSource === 'zhuan') notes.push('月租／管理費依同址轉租約');
    if (erp?.mgmtInCompany && erp?.mgmtFee > 0) {
      notes.push(`管理費 ${Math.round(Number(erp.mgmtFee)).toLocaleString('zh-TW')} 元`);
    }
    if (erp?.totalDeposit > 0) {
      notes.push(`押金 ${Math.round(Number(erp.totalDeposit)).toLocaleString('zh-TW')} 元（月租×押金月數）`);
    }
    if (depOver > 50) notes.push(depNote || `押金溢繳 ${depOver.toLocaleString('zh-TW')} 元（已併入④）`);
    if (hasExitRemit && rentNote) notes.push(rentNote);
    if (hint) {
      hint.textContent = notes.join('；');
      hint.classList.toggle('hidden', !hint.textContent);
    }

    setField(PREFIX + 'overpay-manual', '');
    if (depOver > 50 || hasExitRemit) setOverpayEnabled(true);
    syncBaoManualOverpayVisibility();
    return depOver > 50 || hasExitRemit;
  }

  function syncBaoManualOverpayVisibility() {
    const wrap = $('baoref-overpay-manual-wrap');
    const yes = !!document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked')?.value &&
      document.querySelector('input[name="' + PREFIX + 'overpay-enabled"]:checked').value === '1';
    if (wrap) wrap.classList.toggle('hidden', yes);
    if (yes) setField(PREFIX + 'overpay-manual', '');
    const manualEl = $(PREFIX + 'overpay-manual');
    if (manualEl) {
      manualEl.disabled = true;
      if (yes) manualEl.value = '';
    }
  }

  function applyErpToBaoref(erp) {
    if (!erp) return;
    if (erp.leaseStart) {
      setField('bao-term-lease-start', erp.leaseStart);
    }
    // ④溢繳繳租週期：優先轉租起租日（月租來源），與轉租解約一致
    const cycleStart = erp.billingLeaseStart || erp.zhuanLeaseStart || erp.leaseStart || '';
    if (cycleStart) setField(PREFIX + 'lease-start-date', cycleStart);
    if (erp.rent > 0) setField(PREFIX + 'rent', String(erp.rent));
    if (erp.mgmtInCompany && Number(erp.mgmtFee) > 0) {
      setCheckbox(PREFIX + 'mgmt-in-company', true);
      if (typeof window.deprefSyncMgmtFeeInput === 'function') window.deprefSyncMgmtFeeInput(PREFIX);
      setField(PREFIX + 'mgmt-fee', String(Math.round(Number(erp.mgmtFee))));
    } else {
      setCheckbox(PREFIX + 'mgmt-in-company', false);
      setField(PREFIX + 'mgmt-fee', '');
      if (typeof window.deprefSyncMgmtFeeInput === 'function') window.deprefSyncMgmtFeeInput(PREFIX);
    }
    if (erp.depositMonths > 0) setField(PREFIX + 'deposit-months', String(erp.depositMonths));
    // 押金＝月租金 × 押金月數（強制覆寫，避免舊暫存 21500）
    const rentN = Math.round(Number(erp.rent) || Number(getField(PREFIX + 'rent')) || 0);
    const depM = Math.max(0, parseFloat(String(erp.depositMonths || getField(PREFIX + 'deposit-months') || '2')) || 2);
    const dep = rentN > 0 ? Math.round(rentN * depM) : Math.round(Number(erp.totalDeposit) || 0);
    if (dep > 0) setField(PREFIX + 'deposit-override', String(dep));
    syncBaoOverpayFromRemittances(erp);
    if (erp.signDate) setField('bao-term-sign-date', erp.signDate);
    if (erp.landlordIdNo) setField('bao-term-landlord-id', erp.landlordIdNo);
    if (erp.landlordPhone) setField('bao-term-landlord-phone', erp.landlordPhone);
    if (erp.landlordAddress) setField('bao-term-landlord-address', erp.landlordAddress);
    if (erp.leaseEnd) setField('bao-term-lease-end', erp.leaseEnd);
    if (erp.landlordName) setField('bao-term-landlord-name', erp.landlordName);
    if (erp.address) setField('bao-term-address', erp.address);
    applyVirtualBank(erp.refundBank || erp);
    if (typeof window.updateDepositRefundCalcFor === 'function') {
      window.updateDepositRefundCalcFor(PREFIX, 'landlord');
    }
  }

  function applyVirtualBank(bank) {
    if (!bank) bank = {};
    const no = bank.accountNo || bank.virtualAccount || '';
    // 包租退還帳戶固定國泰西門分行
    setField('bao-term-bank-name', bank.bank || '國泰世華銀行');
    setField('bao-term-bank-branch', bank.branch || '西門分行');
    setField('bao-term-bank-account-name', bank.accountName || '星鴻股份有限公司');
    if (no) setField('bao-term-bank-account-no', no);
    return !!no;
  }

  async function lookupBao(landlordName, address, leaseStart, matchNo, endTenant) {
    const q = new URLSearchParams({
      landlordName: landlordName || '',
      address: address || '',
      leaseStart: leaseStart || '',
      matchNo: matchNo || '',
      endTenantName: endTenant?.name || endTenant?.endTenantName || '',
      zhuanMatchNo: endTenant?.matchNo || endTenant?.zhuanMatchNo || ''
    });
    const r = await fetch(RPA_BASE + '/termination/bao-lookup?' + q.toString(), {
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
    const q = new URLSearchParams({ address: address || '', kind: 'bao' });
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
    const wrap = $('bao-term-pick-wrap');
    if (wrap) wrap.classList.add('hidden');
    const list = $('bao-term-pick-list');
    if (list) list.innerHTML = '';
  }

  function showPick(candidates) {
    const wrap = $('bao-term-pick-wrap');
    const list = $('bao-term-pick-list');
    if (!wrap || !list) return;
    list.innerHTML = candidates
      .map((c, i) => {
        const sub = [c.leaseStart ? '起租 ' + c.leaseStart : '', c.matchNo || '']
          .filter(Boolean)
          .join(' · ');
        return (
          '<button type="button" class="bao-term-pick-btn w-full text-left px-4 py-3 rounded-xl border-2 border-amber-200 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition" data-pick-idx="' +
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
    list.querySelectorAll('.bao-term-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pick-idx'));
        const c = candidates[idx];
        if (c) void runFullLookup(c);
      });
    });
  }

  function setLookupStatus(msg, isErr) {
    const el = $('bao-term-lookup-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className =
      'text-sm leading-relaxed ' + (isErr ? 'text-rose-700 font-semibold' : 'text-slate-600');
  }

  function renderCaseList() {
    const sel = $('bao-term-list');
    if (!sel) return;
    const cases = readCases()
      .filter((c) => c.status !== 'done')
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const cur = sel.value || $('bao-term-active-id')?.value || '';
    sel.innerHTML =
      '<option value="">— 選擇暫存 —</option>' +
      cases
        .map((c) => {
          const label = [c.tenantName || c.landlordName, c.address].filter(Boolean).join('｜') || c.id;
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
    if ($('bao-term-active-id')) $('bao-term-active-id').value = row.id;
    renderCaseList();
    if ($('bao-term-list')) $('bao-term-list').value = row.id;
    try {
      const data = await rpcTerm('termination_case_upsert', { p_case: row });
      if (!data?.ok) throw new Error(data?.error || '雲端暫存失敗');
      if (data.id && data.id !== row.id) {
        const oldId = row.id;
        row.id = data.id;
        if ($('bao-term-active-id')) $('bao-term-active-id').value = row.id;
        writeCases(readCases().filter((c) => c.id !== oldId && c.id !== row.id).concat([row]));
        renderCaseList();
        if ($('bao-term-list')) $('bao-term-list').value = row.id;
      }
      markSaveNeeded(false);
      if (!silent) setLookupStatus('已暫存。同一帳號用手機登入即可看到。', false);
      try {
        window.TerminationCase?.applyBaoDatesToZhuanCases?.(row);
      } catch (_) {}
      return row;
    } catch (e) {
      if (!silent) {
        setLookupStatus('本機已暫存，但尚未同步到帳號：' + String(e.message || e), true);
      }
      return row;
    }
  }

  async function saveCurrentCase(opts) {
    const landlordName = getField('bao-term-landlord-name');
    const address = getField('bao-term-address');
    if (!landlordName && !address) {
      setLookupStatus('請至少填房東姓名或租賃地址', true);
      return null;
    }
    if (!window.skyfunAuth?.getToken?.()) {
      setLookupStatus('請先登入工具箱帳號，暫存才會綁到帳號並在手機看得到。', true);
      return null;
    }
    const id = $('bao-term-active-id')?.value || uid();
    const existing = readCases().find((c) => c.id === id);
    const now = new Date().toISOString();
    const erpRaw = $('bao-term-erp-json')?.value;
    let erpSnapshot = existing?.erpSnapshot || null;
    if (erpRaw) {
      try {
        erpSnapshot = JSON.parse(erpRaw);
      } catch (_) {}
    }
    const user = currentUser();
    const row = {
      id,
      kind: KIND,
      tenantName: landlordName,
      landlordName,
      endTenantName: existing?.endTenantName || erpSnapshot?.endTenantName || '',
      address,
      matchNo: $('bao-term-match-no')?.value || erpSnapshot?.matchNo || '',
      status: existing?.status || 'draft',
      erpSnapshot,
      depref: collectDeprefSnapshot(),
      officeId: getField('bao-term-office-id') || 'hq',
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
    $('bao-term-active-id').value = row.id;
    setField('bao-term-landlord-name', row.landlordName || row.tenantName);
    setField('bao-term-address', row.address);
    setField('bao-term-lease-start', row.depref?.leaseStart || row.erpSnapshot?.leaseStart || '');
    setField(PREFIX + 'lease-start-date', row.depref?.leaseStart || row.erpSnapshot?.leaseStart || '');
    if ($('bao-term-match-no')) $('bao-term-match-no').value = row.matchNo || '';
    if ($('bao-term-erp-json') && row.erpSnapshot) {
      $('bao-term-erp-json').value = JSON.stringify(row.erpSnapshot);
    }
    renderErpSummary(row.erpSnapshot);
    applyDeprefSnapshot(row.depref);
    if (row.officeId || row.depref?.officeId) fillOfficeSelect(row.officeId || row.depref.officeId);
    applyHandoverFields(row.handover);
    markSaveNeeded(false);
    setLookupStatus('已載入暫存：' + (row.address || row.landlordName || row.tenantName), false);
  }

  async function deleteCurrentCase(forceId, opts) {
    const silent = !!(opts && opts.silent);
    const id = String(forceId || $('bao-term-list')?.value || $('bao-term-active-id')?.value || '').trim();
    if (!id) {
      if (!silent) setLookupStatus('請先選一筆暫存再刪除。', true);
      return false;
    }
    const row = readCases().find((c) => c.id === id);
    const label = row ? [row.landlordName || row.tenantName, row.address].filter(Boolean).join('｜') : id;
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
        setLookupStatus('雲端刪除失敗：' + msg + '（本機仍會刪）', true);
      }
    }
    writeCases(readCases().filter((c) => c.id !== id));
    if ($('bao-term-active-id')?.value === id) $('bao-term-active-id').value = '';
    renderCaseList();
    if ($('bao-term-list')) $('bao-term-list').value = '';
    if (!silent) setLookupStatus('已刪除暫存。', false);
    return true;
  }

  async function syncFromCloud() {
    if (!window.skyfunAuth?.getToken?.()) {
      await purgeDoneCases();
      renderCaseList();
      return;
    }
    try {
      const data = await rpcTerm('termination_case_list', {});
      if (!data?.ok) throw new Error(data?.error || '同步失敗');
      const remote = (data.cases || []).filter((c) => c.kind === KIND);
      if (remote.length) {
        const byId = new Map(readCases().map((c) => [c.id, c]));
        for (const c of remote) byId.set(c.id, { ...byId.get(c.id), ...c, kind: KIND });
        writeCases([...byId.values()]);
      }
    } catch (_) {
      /* offline ok */
    }
    await purgeDoneCases();
    renderCaseList();
  }

  function renderErpSummary(erp) {
    const box = $('bao-term-erp-summary');
    if (!box) return;
    if (!erp) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const remits = Array.isArray(erp.remittances) ? erp.remittances : [];
    const remitSum = erp.remittanceSummary || {};
    const lines = [
      `<li>房東：${esc(erp.landlordName || '')}</li>`,
      erp.endTenantName ? `<li>本約房客：${esc(erp.endTenantName)}</li>` : '',
      `<li>地址：${esc(erp.address || '')}</li>`,
      erp.leaseStart ? `<li>起租日：${esc(erp.leaseStart)}</li>` : '',
      erp.rent ? `<li>月租：${esc(String(erp.rent))}${erp.rentSource === 'zhuan' ? '（轉租約）' : ''}</li>` : '',
      erp.mgmtInCompany && erp.mgmtFee
        ? `<li>管理費：${esc(String(erp.mgmtFee))}（入公司，同轉租）</li>`
        : '',
      erp.totalDeposit
        ? `<li>契約總押金：${esc(Math.round(Number(erp.totalDeposit)).toLocaleString('zh-TW'))}（包租約）</li>`
        : '',
      erp.depositOverpay > 50
        ? `<li class="text-amber-900 font-semibold">${esc(erp.depositOverpayNote || `押金溢繳 ${erp.depositOverpay}`)}</li>`
        : '',
      erp.virtualAccount || erp.refundBank?.accountNo
        ? `<li>房客虛擬帳號：${esc(erp.virtualAccount || erp.refundBank.accountNo)}</li>`
        : '<li>虛擬帳號：尚未帶入</li>'
    ].filter(Boolean);

    let remitHtml = '';
    if (remits.length) {
      const rows = remits
        .slice(0, 40)
        .map((r) => {
          const amt = Math.round(Number(r.amount) || 0).toLocaleString('zh-TW');
          return `<tr>
            <td class="py-1 pr-2 whitespace-nowrap tabular-nums">${esc(r.date || '')}</td>
            <td class="py-1 pr-2 text-right tabular-nums font-semibold text-rose-800">${esc(amt)}</td>
            <td class="py-1 pr-2">${esc(r.note || '')}</td>
            <td class="py-1 text-slate-500 whitespace-nowrap">${esc(r.source || '')}</td>
          </tr>`;
        })
        .join('');
      remitHtml = `
        <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <div class="text-sm font-bold text-emerald-950">公司匯給房東（起租日後／本約房客）</div>
          <p class="text-[12px] text-slate-600 leading-relaxed">${esc(remitSum.note || '')}</p>
          <div class="overflow-x-auto max-h-56 overflow-y-auto">
            <table class="w-full text-[12px] text-slate-800">
              <thead><tr class="text-slate-500 text-left">
                <th class="py-1 pr-2 font-semibold">帳務日</th>
                <th class="py-1 pr-2 font-semibold text-right">提出金額</th>
                <th class="py-1 pr-2 font-semibold">備註</th>
                <th class="py-1 font-semibold">帳本</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p class="text-[11px] text-amber-900 font-semibold">欠繳／溢繳仍請人工核對後填入試算（本表僅供金流對照）。</p>
        </div>`;
    } else {
      lines.push(
        `<li class="text-amber-900 font-semibold">${esc(
          remitSum.note || '尚未帶入虛擬帳號匯出金流；欠繳／溢繳請手動輸入'
        )}</li>`
      );
    }

    box.innerHTML =
      '<ul class="text-sm text-slate-700 space-y-1 list-disc pl-5">' + lines.join('') + '</ul>' + remitHtml;
    box.classList.remove('hidden');
  }

  function collectHandoverSnapshot() {
    return {
      exitDate: getField('term-handover-exit-date') || getField('bao-term-handover-date'),
      water: getField('term-handover-water') || getField('bao-term-handover-water'),
      electric: getField('term-handover-electric') || getField('bao-term-handover-electric'),
      gas: getField('term-handover-gas') || getField('bao-term-handover-gas'),
      utilPayer: getField('term-handover-util-payer') || getField('bao-term-handover-util-payer') || '',
      extraItems: collectExtraItems()
    };
  }

  function applyHandoverFields(h) {
    setField('bao-term-handover-date', h?.exitDate || '');
    setField('bao-term-handover-water', h?.water ?? '');
    setField('bao-term-handover-electric', h?.electric ?? '');
    setField('bao-term-handover-gas', h?.gas ?? '');
    setField('bao-term-handover-util-payer', h?.utilPayer ?? '');
    setField('bao-term-handover-water-meter', '');
    setField('bao-term-handover-electric-meter', '');
    setField('bao-term-handover-gas-meter', '');
    if (h && 'extraItems' in h) renderExtraItems(h.extraItems || []);
  }

  function openHandoverModal(row, editable) {
    window.__termHandoverKind = KIND;
    const modal = $('term-case-handover-modal');
    if (!modal) return;
    const promissoryWrap = $('term-handover-promissory-wrap');
    if (promissoryWrap) promissoryWrap.classList.add('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    $('term-case-handover-id').value = row?.id || $('bao-term-active-id')?.value || '';
    const saved = row?.handover || {};
    setField('term-handover-exit-date', saved.exitDate || getField('bao-term-handover-date') || '');
    setField('term-handover-water', saved.water ?? getField('bao-term-handover-water'));
    setField('term-handover-electric', saved.electric ?? getField('bao-term-handover-electric'));
    setField('term-handover-gas', saved.gas ?? getField('bao-term-handover-gas'));
    setField(
      'term-handover-util-payer',
      saved.utilPayer === 'agent'
        ? 'agent-deposit'
        : saved.utilPayer || getField('bao-term-handover-util-payer') || ''
    );
    renderExtraItems(saved.extraItems || row?.depref?.extraItems || []);
    const result = $('term-handover-result');
    if (result) result.classList.add('hidden');
    $('term-handover-pdf-confirm')?.classList.add('hidden');
    const status = $('term-handover-pdf-status');
    if (status) status.textContent = '';
    const draftStatus = $('term-handover-draft-status');
    if (draftStatus) {
      draftStatus.textContent = '若無法現場結算金額請暫存';
      draftStatus.className = 'text-xs leading-relaxed text-right text-amber-800 font-semibold';
    }
    const title = $('term-case-handover-title');
    if (title) title.textContent = editable ? '現場點交（包租）' : '現場點交';
  }

  function lookupRequired() {
    return {
      address: getField('bao-term-address')
    };
  }

  function syncLookupButton() {
    const btn = $('bao-term-lookup-btn');
    if (!btn) return;
    const req = lookupRequired();
    btn.disabled = !req.address;
    if (!req.address && !getField('bao-term-erp-json')) {
      setLookupStatus('請先填租賃地址，再查詢。', false);
    }
  }

  async function runFullLookup(candidate, endTenant) {
    const address = getField('bao-term-address');
    const name = String(candidate?.name || '').trim();
    const leaseStart = String(candidate?.leaseStart || '').trim();
    const matchNo = String(candidate?.matchNo || '').trim();
    const endName = String(endTenant?.name || endTenant?.endTenantName || getField('bao-term-end-tenant') || '').trim();
    const endMatch = String(endTenant?.matchNo || endTenant?.zhuanMatchNo || '').trim();
    hidePick();
    if (name) setField('bao-term-landlord-name', name);
    if (leaseStart) {
      setField('bao-term-lease-start', leaseStart);
    }
    if (endName && $('bao-term-end-tenant')) setField('bao-term-end-tenant', endName);
    if (matchNo) setField('bao-term-match-no', matchNo);
    setLookupStatus('已選定 ' + (name || '房東') + (endName ? '／房客 ' + endName : '') + '，查詢包租契約＋虛擬帳號…', false);
    const lookupBtn = $('bao-term-lookup-btn');
    if (lookupBtn) lookupBtn.disabled = true;
    try {
      if (!address) throw new Error('缺少租賃地址，請回專區重選');
      if (!name && !matchNo) throw new Error('缺少房東姓名，請回專區重選');
      const data = await lookupBao(name, address, leaseStart, matchNo, {
        name: endName,
        matchNo: endMatch
      });
      const erp = data.record || data;
      if (!erp || (!erp.landlordName && !erp.landlordIdNo && !erp.address)) {
        throw new Error(data.message || '查詢成功但沒有可帶入的包租資料');
      }
      if ($('bao-term-erp-json')) $('bao-term-erp-json').value = JSON.stringify(erp);
      if ($('bao-term-match-no')) $('bao-term-match-no').value = erp.matchNo || matchNo || '';
      if (erp.landlordName) setField('bao-term-landlord-name', erp.landlordName);
      if (erp.leaseStart) setField('bao-term-lease-start', erp.leaseStart);
      if (erp.endTenantName && $('bao-term-end-tenant')) setField('bao-term-end-tenant', erp.endTenantName);
      renderErpSummary(erp);
      applyErpToBaoref(erp);
      // 再強制寫一次甲方／帳戶，避免被其他流程蓋掉
      if (erp.landlordIdNo) setField('bao-term-landlord-id', erp.landlordIdNo);
      if (erp.landlordPhone) setField('bao-term-landlord-phone', erp.landlordPhone);
      if (erp.landlordAddress) setField('bao-term-landlord-address', erp.landlordAddress);
      if (erp.signDate) setField('bao-term-sign-date', erp.signDate);
      applyVirtualBank(erp.refundBank || { virtualAccount: erp.virtualAccount, accountNo: erp.virtualAccount });
      markSaveNeeded(true);
      setLookupStatus((data.message || '已帶入包租資料。') + ' 請點「暫存」。欠繳／溢繳請手動輸入。', false);
    } catch (e) {
      setLookupStatus(String(e.message || e), true);
    } finally {
      syncLookupButton();
    }
  }

  async function onLookupClick() {
    const req = lookupRequired();
    if (!req.address) {
      setLookupStatus('請先填租賃地址。', true);
      syncLookupButton();
      return;
    }
    hidePick();
    setLookupStatus('依地址查詢中…', false);
    const lookupBtn = $('bao-term-lookup-btn');
    if (lookupBtn) lookupBtn.disabled = true;
    try {
      const data = await fetchCandidates(req.address);
      const list = Array.isArray(data.candidates) ? data.candidates : [];
      if (!list.length) {
        setLookupStatus(data.message || '此地址查無資料', true);
        return;
      }
      if (list.length === 1) {
        setLookupStatus(data.message || '找到 1 筆，帶入中…', false);
        await runFullLookup(list[0]);
        return;
      }
      showPick(list);
      setLookupStatus(
        '此地址有 ' + list.length + ' 筆包租契約，請先選一位房東再繼續抓資料。',
        false
      );
    } catch (e) {
      setLookupStatus(String(e.message || e), true);
    } finally {
      syncLookupButton();
    }
  }

  function wireUi() {
    $('bao-term-lookup-btn')?.addEventListener('click', onLookupClick);
    document.querySelectorAll('.bao-term-lookup-req').forEach((el) => {
      el.addEventListener('input', syncLookupButton);
      el.addEventListener('change', syncLookupButton);
    });
    const onExitOverpay = () => {
      try {
        const raw = $('bao-term-erp-json')?.value;
        if (!raw) return;
        const erp = JSON.parse(raw);
        syncBaoOverpayFromRemittances(erp);
        if (typeof window.updateDepositRefundCalcFor === 'function') {
          window.updateDepositRefundCalcFor(PREFIX, 'landlord');
        }
      } catch (_) {
        /* ignore */
      }
    };
    $(PREFIX + 'exit-full-date')?.addEventListener('change', onExitOverpay);
    $(PREFIX + 'exit-full-date')?.addEventListener('input', onExitOverpay);
    document.querySelectorAll('input[name="' + PREFIX + 'overpay-enabled"]').forEach((el) => {
      el.addEventListener('change', () => {
        syncBaoManualOverpayVisibility();
        if (typeof window.updateDepositRefundCalcFor === 'function') {
          window.updateDepositRefundCalcFor(PREFIX, 'landlord');
        }
      });
    });
    syncBaoManualOverpayVisibility();
    syncLookupButton();
    fillOfficeSelect(getField('bao-term-office-id') || 'hq');
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
    $('bao-term-office-id')?.addEventListener('change', () => {
      syncOfficeHint();
      markSaveNeeded(true);
    });
    $('bao-term-save-btn')?.addEventListener('click', () => {
      void saveCurrentCase();
    });
    $('bao-term-delete-btn')?.addEventListener('click', () => {
      void deleteCurrentCase();
    });
    $('bao-term-handover-open-btn')?.addEventListener('click', () => {
      void (async () => {
        const id = $('bao-term-active-id')?.value;
        let row = id ? readCases().find((c) => c.id === id) : null;
        if (!row) row = await saveCurrentCase({ silent: true });
        if (row) {
          row.status = 'handover';
          row.updatedAt = new Date().toISOString();
          await persistCase(row, { silent: true });
        }
        openHandoverModal(row || { id: $('bao-term-active-id')?.value, depref: collectDeprefSnapshot() }, true);
      })();
    });
    $('bao-term-list')?.addEventListener('change', (ev) => {
      const id = ev.target.value;
      if (id) loadCase(id);
    });
    $('bao-term-reason')?.addEventListener('change', () => {
      $('bao-term-reason-note-wrap')?.classList.toggle('hidden', getField('bao-term-reason') !== '其他');
    });
    const page = $('page-business-bao-deposit-refund');
    page?.addEventListener('input', () => markSaveNeeded(true));
    page?.addEventListener('change', () => markSaveNeeded(true));
  }

  function boot() {
    wireUi();
    const start = () => {
      void syncFromCloud().then(() => {
        const hash = location.hash.match(/bao-term-case=([^&]+)/);
        if (hash?.[1]) loadCase(decodeURIComponent(hash[1]));
      });
    };
    if (window.skyfunAuth?.isReady?.()) start();
    else document.addEventListener('skyfun-auth-ready', start, { once: true });
  }

  async function saveHandoverDraft() {
    const id = $('term-case-handover-id')?.value || $('bao-term-active-id')?.value;
    if (!id) {
      const el = $('term-handover-draft-status');
      if (el) {
        el.textContent = '請先選暫存案件再開現場點交。';
        el.className = 'text-xs leading-relaxed text-right text-rose-700 font-semibold';
      }
      setLookupStatus('請先選暫存案件再開現場點交。', true);
      return;
    }
    const handover = collectHandoverSnapshot();
    applyHandoverFields(handover);
    const list = readCases();
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) {
      setLookupStatus('找不到案件，請回專區重新開啟。', true);
      return;
    }
    list[idx].handover = handover;
    list[idx].status = 'handover';
    list[idx].updatedAt = new Date().toISOString();
    await persistCase(list[idx], { silent: true });
    window.TerminationHub?.refreshCaseList?.();
    const el = $('term-handover-draft-status');
    if (el) {
      el.textContent = '已暫存點交資料（待點交）。可稍後再回來完成試算。';
      el.className = 'text-xs leading-relaxed text-right text-emerald-800 font-semibold';
    }
    setLookupStatus('點交已暫存，案件仍在「暫存案件」列表。', false);
  }

  document.addEventListener(
    'click',
    (ev) => {
      if (ev.target?.id !== 'term-case-handover-submit') return;
      if (window.__termHandoverKind !== KIND) return;
      const h = collectHandoverSnapshot();
      applyHandoverFields(h);
      const deductDeposit =
        h.utilPayer === 'agent-deposit' ||
        h.utilPayer === 'landlord-deposit' ||
        h.utilPayer === 'agent';
      if (deductDeposit) {
        setField(PREFIX + 'water', h.water || getField(PREFIX + 'water'));
        setField(PREFIX + 'electric', h.electric || getField(PREFIX + 'electric'));
        setField(PREFIX + 'gas', h.gas || getField(PREFIX + 'gas'));
      } else {
        setField(PREFIX + 'water', '');
        setField(PREFIX + 'electric', '');
        setField(PREFIX + 'gas', '');
      }
      const extraSum = (h.extraItems || []).reduce((s, r) => s + Math.round(Number(r.amt) || 0), 0);
      setField(PREFIX + 'cleaning', '');
      setField(PREFIX + 'repair', '');
      setField(PREFIX + 'other-deduct', extraSum > 0 ? String(extraSum) : '');
      if (typeof window.updateDepositRefundCalcFor === 'function') {
        window.updateDepositRefundCalcFor(PREFIX, 'landlord');
      }
      const id = $('term-case-handover-id')?.value || $('bao-term-active-id')?.value;
      if (id) {
        void deleteCurrentCase(id, { silent: true }).then(() => {
          window.TerminationHub?.refreshCaseList?.();
        });
      }
      if (typeof window.TerminationCase?.showHandoverWorksheetPrompt === 'function') {
        window.TerminationCase.showHandoverWorksheetPrompt();
      } else {
        const box = $('term-handover-pdf-confirm');
        if (box) {
          box.classList.remove('hidden');
          box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      setLookupStatus('點交完成，暫存已清除。請確認後下載第 3、4 頁對照用解約單，手填紙本。', false);
    },
    true
  );

  window.TerminationBaoCase = {
    lookupBao,
    saveCurrentCase,
    loadCase,
    deleteCurrentCase,
    openHandoverModal,
    saveHandoverDraft,
    readCases,
    purgeDoneCases,
    KIND,
    PREFIX,
    startFromHub,
    saveDraftLite,
    restoreDraftExtras
  };

  async function startFromHub(address, candidate, endTenant) {
    const addr = String(address || '').trim();
    if (addr) setField('bao-term-address', addr);
    const end = endTenant || null;
    if (end?.name && $('bao-term-end-tenant')) setField('bao-term-end-tenant', end.name);
    syncLookupButton();
    await runFullLookup(candidate || { name: '', leaseStart: '', matchNo: '' }, end);
  }

  /** 公司資料帶入後，還原業務已填的告知／解約日等 */
  function restoreDraftExtras(draft) {
    if (!draft) return;
    if (draft.id && $('bao-term-active-id')) $('bao-term-active-id').value = draft.id;
    const snap = draft.depref || {};
    if (snap.noticeDate) setField(PREFIX + 'notice-date', snap.noticeDate);
    if (snap.exitDate) setField(PREFIX + 'exit-full-date', snap.exitDate);
    if (snap.reason) {
      setField('bao-term-reason', snap.reason);
      $('bao-term-reason-note-wrap')?.classList.toggle('hidden', snap.reason !== '其他');
    }
    if (snap.reasonNote) setField('bao-term-reason-note', snap.reasonNote);
    if (snap.baoToMgmt) setField('bao-term-bao-to-mgmt', snap.baoToMgmt);
    if (typeof window.updateDepositRefundCalcFor === 'function') {
      window.updateDepositRefundCalcFor(PREFIX, 'landlord');
    }
  }

  async function saveDraftLite({ address, name, leaseStart, matchNo, landlordName, tenantName, endTenantName }) {
    const addr = String(address || '').trim();
    const ll = String(landlordName || name || '').trim();
    if (!addr && !ll) return null;
    if (!window.skyfunAuth?.getToken?.()) {
      throw new Error('請先登入工具箱帳號');
    }
    setField('bao-term-address', addr);
    if (ll) setField('bao-term-landlord-name', ll);
    if (leaseStart) {
      setField('bao-term-lease-start', leaseStart);
    }
    if (matchNo) setField('bao-term-match-no', matchNo);
    const row = await saveCurrentCase({ silent: true });
    if (row) {
      if (ll) row.landlordName = ll;
      const end = String(endTenantName || tenantName || '').trim();
      if (end) row.endTenantName = end;
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
