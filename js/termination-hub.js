/**
 * 催收解約專區入口：地址查詢 → 顯示房東／房客 → 開包租／轉租／暫存／現場點交
 */
(function () {
  'use strict';

  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(
    /\/$/,
    ''
  );

  let lastLandlords = [];
  let lastTenants = [];
  let lastAddress = '';
  let lastCaseCtx = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = window.skyfunAuth?.getToken?.();
    if (token) {
      h.Authorization = 'Bearer ' + token;
      h['X-Skyfun-Session'] = token;
    }
    return h;
  }

  function setStatus(msg, isErr) {
    const el = $('term-hub-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className =
      'text-sm leading-relaxed ' + (isErr ? 'text-rose-700 font-semibold' : 'text-slate-600');
  }

  function syncLookupBtn() {
    const btn = $('term-hub-lookup-btn');
    if (!btn) return;
    btn.disabled = !String($('term-hub-address')?.value || '').trim();
  }

  function selectedLandlord() {
    const checked = document.querySelector('input[name="term-hub-landlord"]:checked');
    if (!checked) return lastLandlords.length === 1 ? lastLandlords[0] : null;
    const i = Number(checked.value);
    return lastLandlords[i] || null;
  }

  function selectedTenant() {
    const checked = document.querySelector('input[name="term-hub-tenant"]:checked');
    if (!checked) return lastTenants.length === 1 ? lastTenants[0] : null;
    const i = Number(checked.value);
    return lastTenants[i] || null;
  }

  function syncActionButtons() {
    const hasL = !!selectedLandlord();
    const hasT = !!selectedTenant();
    const bao = $('term-hub-open-bao');
    const zhuan = $('term-hub-open-zhuan');
    const draft = $('term-hub-save-draft');
    if (bao) bao.disabled = !hasL;
    if (zhuan) zhuan.disabled = !hasT;
    if (draft) draft.disabled = !hasL && !hasT;
  }

  function renderPersonList(containerId, emptyId, nameAttr, list) {
    const box = $(containerId);
    const empty = $(emptyId);
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    const autoCheck = list.length === 1;
    box.innerHTML = list
      .map((c, i) => {
        const sub = [c.leaseStart ? '起租 ' + c.leaseStart : '', c.matchNo || ''].filter(Boolean).join(' · ');
        return (
          '<label class="flex items-start gap-3 w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50/80 hover:border-emerald-400 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">' +
          '<input type="radio" class="mt-1" name="' +
          nameAttr +
          '" value="' +
          i +
          '"' +
          (autoCheck ? ' checked' : '') +
          ' />' +
          '<span class="min-w-0">' +
          '<span class="block font-bold text-slate-900">' +
          esc(c.name) +
          '</span>' +
          (sub ? '<span class="block text-xs text-slate-500 mt-0.5">' + esc(sub) + '</span>' : '') +
          '</span></label>'
        );
      })
      .join('');
    box.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.addEventListener('change', syncActionButtons);
    });
  }

  async function fetchBoth(address) {
    const q = new URLSearchParams({ address: address || '', kind: 'both' });
    const r = await fetch(RPA_BASE + '/termination/candidates?' + q.toString(), {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.message || data.error || '地址查詢失敗');
    }
    return data;
  }

  function normAddrKey(s) {
    return String(s || '')
      .trim()
      .replace(/\s+/g, '');
  }

  function partiesFromCase(row, hubKind) {
    const erp = row?.erpSnapshot || {};
    let landlord = String(
      row?.landlordName || erp.landlordName || erp.landlord || ''
    ).trim();
    let tenant = String(
      row?.endTenantName ||
        (hubKind === 'zhuan' ? row?.tenantName : '') ||
        erp.endTenantName ||
        erp.tenantName ||
        erp.tenant ||
        ''
    ).trim();

    if (hubKind === 'bao') {
      if (!landlord) landlord = String(row?.landlordName || row?.tenantName || '').trim();
      // 包租 erp.tenantName 是星鴻，房客在 endTenantName
      tenant = String(
        row?.endTenantName || erp.endTenantName || ''
      ).trim();
    }
    if (hubKind === 'zhuan') {
      if (!tenant) tenant = String(row?.tenantName || '').trim();
      if (landlord && tenant && landlord === tenant) {
        landlord = String(row?.landlordName || erp.landlordName || '').trim();
        if (landlord === tenant) landlord = '';
      }
    }

    const addr = normAddrKey(row?.address);
    if (addr && (!landlord || !tenant)) {
      const zhuan = window.TerminationCase?.readCases?.() || [];
      const bao = window.TerminationBaoCase?.readCases?.() || [];
      for (const other of zhuan.concat(bao)) {
        if (!other || other.id === row?.id) continue;
        if (normAddrKey(other.address) !== addr) continue;
        const oErp = other.erpSnapshot || {};
        const oKind = other.kind === 'bao' || String(other.id || '').startsWith('bao') ? 'bao' : 'zhuan';
        if (!landlord) {
          landlord = String(
            other.landlordName ||
              oErp.landlordName ||
              (oKind === 'bao' ? other.tenantName : '') ||
              ''
          ).trim();
        }
        if (!tenant) {
          tenant = String(
            other.endTenantName ||
              (oKind === 'zhuan' ? other.tenantName : '') ||
              oErp.tenantName ||
              ''
          ).trim();
          if (tenant && landlord && tenant === landlord) {
            tenant = String(other.endTenantName || oErp.tenantName || '').trim();
            if (tenant === landlord) tenant = '';
          }
        }
        if (landlord && tenant) break;
      }
    }
    return {
      landlord,
      tenant,
      address: String(row?.address || '').trim()
    };
  }

  async function enrichPartiesFromApi(address, parties) {
    if (!address || (parties.landlord && parties.tenant)) return parties;
    try {
      const data = await fetchBoth(address);
      const landlords = Array.isArray(data.landlords) ? data.landlords : [];
      const tenants = Array.isArray(data.tenants) ? data.tenants : [];
      if (!parties.landlord && landlords.length === 1) parties.landlord = landlords[0].name || '';
      if (!parties.tenant && tenants.length === 1) parties.tenant = tenants[0].name || '';
      if (!parties.landlord && landlords.length) {
        parties.landlord = landlords.map((x) => x.name).filter(Boolean).join('／');
      }
      if (!parties.tenant && tenants.length) {
        // 若多房客且暫存已有租客名，保留；否則列出
        parties.tenant = tenants.map((x) => x.name).filter(Boolean).join('／');
      }
    } catch (_) {
      /* ignore */
    }
    return parties;
  }

  async function showCaseParties(row, hubKind) {
    const wrap = $('term-hub-case-parties');
    if (!wrap) return;
    if (!row) {
      wrap.classList.add('hidden');
      lastCaseCtx = null;
      syncCaseOpenButtons();
      return;
    }
    let p = partiesFromCase(row, hubKind);
    if ((!p.landlord || !p.tenant) && p.address) {
      setStatus('載入房東／房客姓名…', false);
      p = await enrichPartiesFromApi(p.address, p);
    }
    const ll = $('term-hub-case-landlord');
    const tt = $('term-hub-case-tenant');
    const addr = $('term-hub-case-addr');
    if (ll) ll.textContent = p.landlord || '（未帶入）';
    if (tt) tt.textContent = p.tenant || '（未帶入）';
    if (addr) addr.textContent = p.address ? '地址：' + p.address : '';
    wrap.classList.remove('hidden');
    if (p.address && $('term-hub-address')) {
      $('term-hub-address').value = p.address;
      syncLookupBtn();
    }
    lastAddress = p.address || lastAddress;
    lastCaseCtx = {
      hubKind,
      row,
      landlord: p.landlord,
      tenant: p.tenant,
      address: p.address,
      matchNo: row.matchNo || '',
      leaseStart: row.depref?.leaseStart || row.erpSnapshot?.leaseStart || ''
    };
    syncCaseOpenButtons();
    setStatus(
      '已選暫存：' +
        (p.landlord ? '房東 ' + p.landlord : '') +
        (p.landlord && p.tenant ? '、' : '') +
        (p.tenant ? '房客 ' + p.tenant : '') +
        '。可開包租／轉租解約帶入資料。',
      false
    );
  }

  function syncCaseOpenButtons() {
    const bao = $('term-hub-case-open-bao');
    const zhuan = $('term-hub-case-open-zhuan');
    if (bao) bao.disabled = !(lastCaseCtx && (lastCaseCtx.landlord || lastCaseCtx.address));
    if (zhuan) zhuan.disabled = !(lastCaseCtx && (lastCaseCtx.tenant || lastCaseCtx.address));
  }

  function findCaseByAddress(kind, address, preferName) {
    const addr = normAddrKey(address);
    if (!addr) return null;
    const list =
      kind === 'bao'
        ? window.TerminationBaoCase?.readCases?.() || []
        : window.TerminationCase?.readCases?.() || [];
    const name = String(preferName || '').trim();
    const sameAddr = list.filter((c) => normAddrKey(c.address) === addr);
    if (!sameAddr.length) return null;
    if (name) {
      const hit = sameAddr.find((c) => {
        if (kind === 'bao') {
          return [c.landlordName, c.tenantName].some((n) => String(n || '').trim() === name);
        }
        return String(c.tenantName || '').trim() === name;
      });
      if (hit) return hit;
    }
    return sameAddr.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  }

  async function openBaoFromCase() {
    const ctx = lastCaseCtx;
    if (!ctx) {
      setStatus('請先選擇暫存案件。', true);
      return;
    }
    if (!ctx.landlord && !ctx.address) {
      setStatus('此暫存缺少房東／地址，無法帶入包租。', true);
      return;
    }
    const draft =
      (ctx.hubKind === 'bao' ? ctx.row : null) ||
      findCaseByAddress('bao', ctx.address, ctx.landlord);
    // 優先用包租媒合編號，勿把轉租編號拿去查包租
    let baoMatch =
      (ctx.hubKind === 'bao' ? ctx.matchNo : '') ||
      draft?.matchNo ||
      '';
    if (!baoMatch && ctx.landlord && lastLandlords.length) {
      const hit = lastLandlords.find((c) => String(c.name || '').trim() === ctx.landlord);
      if (hit?.matchNo) baoMatch = hit.matchNo;
    }
    if (typeof window.showPage === 'function') window.showPage('business-bao-deposit-refund');
    setStatus('帶入包租契約與虛擬帳號…', false);
    try {
      await window.TerminationBaoCase?.startFromHub?.(ctx.address, {
        name: ctx.landlord,
        leaseStart: ctx.leaseStart || draft?.depref?.leaseStart || '',
        matchNo: baoMatch
      });
      if (draft?.id && window.TerminationBaoCase?.restoreDraftExtras) {
        window.TerminationBaoCase.restoreDraftExtras(draft);
      }
      setStatus('已開啟包租解約並帶入資料。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  async function openZhuanFromCase() {
    const ctx = lastCaseCtx;
    if (!ctx) {
      setStatus('請先選擇暫存案件。', true);
      return;
    }
    if (!ctx.tenant && !ctx.address) {
      setStatus('此暫存缺少房客／地址，無法帶入轉租。', true);
      return;
    }
    const draft =
      (ctx.hubKind === 'zhuan' ? ctx.row : null) ||
      findCaseByAddress('zhuan', ctx.address, ctx.tenant);
    if (typeof window.showPage === 'function') window.showPage('business-deposit-refund');
    setStatus('帶入轉租催收與帳戶…', false);
    try {
      await window.TerminationCase?.startFromHub?.(ctx.address, {
        name: ctx.tenant,
        leaseStart: ctx.leaseStart || draft?.depref?.leaseStart || '',
        matchNo: (ctx.hubKind === 'zhuan' ? ctx.matchNo : '') || draft?.matchNo || ''
      });
      if (draft?.id && window.TerminationCase?.restoreDraftExtras) {
        window.TerminationCase.restoreDraftExtras(draft);
      }
      setStatus('已開啟轉租解約並帶入資料。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  function findHubCase(raw) {
    const s = String(raw || '').trim();
    if (!s || !s.includes(':')) return null;
    const idx = s.indexOf(':');
    const kind = s.slice(0, idx);
    const id = s.slice(idx + 1);
    const list =
      kind === 'bao'
        ? window.TerminationBaoCase?.readCases?.() || []
        : window.TerminationCase?.readCases?.() || [];
    const row = list.find((c) => c.id === id) || null;
    return row ? { kind, row } : null;
  }

  function onCaseListChange() {
    const hit = findHubCase($('term-hub-case-list')?.value);
    if (!hit) {
      void showCaseParties(null);
      return;
    }
    void showCaseParties(hit.row, hit.kind);
  }

  function formatCaseLabel(c) {
    const p = partiesFromCase(c, c._hubKind === 'bao' ? 'bao' : 'zhuan');
    const people = [];
    if (p.landlord) people.push('房東 ' + p.landlord);
    if (p.tenant) people.push('房客 ' + p.tenant);
    if (!people.length) {
      people.push(c.landlordName || c.tenantName || c.endTenantName || '');
    }
    // 暫存清單統一顯示「轉租」，不另列包租
    return ['轉租', people.join('／'), c.address].filter(Boolean).join('｜');
  }

  function renderHubCaseList() {
    const sel = $('term-hub-case-list');
    if (!sel) return;
    const zhuan = (window.TerminationCase?.readCases?.() || [])
      .filter((c) => c.status !== 'done')
      .map((c) => ({
        ...c,
        _hubKind: 'zhuan'
      }));
    const bao = (window.TerminationBaoCase?.readCases?.() || [])
      .filter((c) => c.status !== 'done')
      .map((c) => ({
        ...c,
        _hubKind: 'bao'
      }));
    // 同址只留一筆：優先轉租；沒有轉租才用包租（仍標成轉租）
    const byAddr = new Map();
    const prefer = (a, b) => {
      if (a._hubKind === 'zhuan' && b._hubKind !== 'zhuan') return a;
      if (b._hubKind === 'zhuan' && a._hubKind !== 'zhuan') return b;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) >= 0 ? b : a;
    };
    for (const c of zhuan.concat(bao)) {
      const key = normAddrKey(c.address) || c.id;
      const prev = byAddr.get(key);
      byAddr.set(key, prev ? prefer(prev, c) : c);
    }
    const all = [...byAddr.values()].sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    );
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— 選擇暫存 —</option>' +
      all
        .map((c) => {
          const st = c.status === 'handover' ? '（待點交）' : '';
          return `<option value="${esc(c._hubKind + ':' + c.id)}">${esc(formatCaseLabel(c))}${st}</option>`;
        })
        .join('');
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    onCaseListChange();
  }

  async function onLookup() {
    const address = String($('term-hub-address')?.value || '').trim();
    if (!address) {
      setStatus('請先填租賃地址。', true);
      syncLookupBtn();
      return;
    }
    const btn = $('term-hub-lookup-btn');
    if (btn) btn.disabled = true;
    setStatus('依地址查詢房東與房客…', false);
    $('term-hub-result')?.classList.add('hidden');
    try {
      const data = await fetchBoth(address);
      lastAddress = data.address || address;
      lastLandlords = Array.isArray(data.landlords) ? data.landlords : [];
      lastTenants = Array.isArray(data.tenants) ? data.tenants : [];
      renderPersonList('term-hub-landlord-list', 'term-hub-landlord-empty', 'term-hub-landlord', lastLandlords);
      renderPersonList('term-hub-tenant-list', 'term-hub-tenant-empty', 'term-hub-tenant', lastTenants);
      $('term-hub-result')?.classList.remove('hidden');
      $('term-hub-draft-hint')?.classList.add('hidden');
      syncActionButtons();
      setStatus(data.message || '查詢完成，請選擇房東／房客後再操作。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    } finally {
      syncLookupBtn();
    }
  }

  async function openBao() {
    const c = selectedLandlord();
    if (!c) {
      setStatus('請先選擇房東。', true);
      return;
    }
    const tenant = selectedTenant();
    if (typeof window.showPage === 'function') window.showPage('business-bao-deposit-refund');
    setStatus(
      '已開啟包租解約，帶入中…' + (tenant?.name ? '（本約房客：' + tenant.name + '）' : ''),
      false
    );
    try {
      await window.TerminationBaoCase?.startFromHub?.(lastAddress, c, tenant || null);
      renderHubCaseList();
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  async function openZhuan() {
    const c = selectedTenant();
    if (!c) {
      setStatus('請先選擇房客。', true);
      return;
    }
    if (typeof window.showPage === 'function') window.showPage('business-deposit-refund');
    setStatus('已開啟轉租解約，帶入中…', false);
    try {
      await window.TerminationCase?.startFromHub?.(lastAddress, c);
      renderHubCaseList();
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  async function saveDraft() {
    const landlord = selectedLandlord();
    const tenant = selectedTenant();
    if (!landlord && !tenant) {
      setStatus('請先選擇房東或房客再暫存。', true);
      return;
    }
    try {
      const saved = [];
      const both = {
        landlordName: landlord?.name || '',
        tenantName: tenant?.name || '',
        endTenantName: tenant?.name || ''
      };
      if (landlord && window.TerminationBaoCase?.saveDraftLite) {
        const row = await window.TerminationBaoCase.saveDraftLite({
          address: lastAddress,
          name: landlord.name,
          leaseStart: landlord.leaseStart,
          matchNo: landlord.matchNo,
          ...both
        });
        if (row) saved.push('包租 ' + (landlord.name || ''));
      }
      if (tenant && window.TerminationCase?.saveDraftLite) {
        const row = await window.TerminationCase.saveDraftLite({
          address: lastAddress,
          name: tenant.name,
          leaseStart: tenant.leaseStart,
          matchNo: tenant.matchNo,
          ...both
        });
        if (row) saved.push('轉租 ' + (tenant.name || ''));
      }
      renderHubCaseList();
      $('term-hub-draft-hint')?.classList.remove('hidden');
      setStatus('已暫存：' + (saved.join('、') || '案件') + '。可點「現場點交」或再開試算頁。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  async function openHandover() {
    const raw = String($('term-hub-case-list')?.value || '').trim();
    if (!raw || !raw.includes(':')) {
      setStatus('請先從「暫存案件」選一筆，再點現場點交。', true);
      return;
    }
    const idx = raw.indexOf(':');
    const kind = raw.slice(0, idx);
    const id = raw.slice(idx + 1);
    try {
      if (kind === 'bao') {
        if (typeof window.showPage === 'function') window.showPage('business-bao-deposit-refund');
        window.TerminationBaoCase?.loadCase?.(id);
        const row = (window.TerminationBaoCase?.readCases?.() || []).find((c) => c.id === id);
        window.__termHandoverKind = 'bao';
        window.TerminationBaoCase?.openHandoverModal?.(row || { id }, true);
      } else {
        if (typeof window.showPage === 'function') window.showPage('business-deposit-refund');
        window.TerminationCase?.loadCase?.(id);
        const row = (window.TerminationCase?.readCases?.() || []).find((c) => c.id === id);
        window.__termHandoverKind = 'zhuan';
        window.TerminationCase?.openHandoverModal?.(row || { id }, true);
      }
      setStatus('已開啟現場點交。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  async function deleteSelectedCase() {
    const hit = findHubCase($('term-hub-case-list')?.value);
    if (!hit) {
      setStatus('請先從「暫存案件」選一筆再刪除。', true);
      return;
    }
    try {
      const addr = normAddrKey(hit.row.address);
      const ok =
        hit.kind === 'bao'
          ? await window.TerminationBaoCase?.deleteCurrentCase?.(hit.row.id)
          : await window.TerminationCase?.deleteCurrentCase?.(hit.row.id);
      if (!ok) return;
      // 同址另一種暫存一併刪，避免清單又冒出包租／轉租兩筆
      if (addr) {
        if (hit.kind === 'zhuan') {
          const bao = (window.TerminationBaoCase?.readCases?.() || []).find(
            (c) => normAddrKey(c.address) === addr
          );
          if (bao?.id) await window.TerminationBaoCase?.deleteCurrentCase?.(bao.id, { silent: true });
        } else {
          const zhuan = (window.TerminationCase?.readCases?.() || []).find(
            (c) => normAddrKey(c.address) === addr
          );
          if (zhuan?.id) await window.TerminationCase?.deleteCurrentCase?.(zhuan.id, { silent: true });
        }
      }
      lastCaseCtx = null;
      showCaseParties(null);
      renderHubCaseList();
      if ($('term-hub-case-list')) $('term-hub-case-list').value = '';
      setStatus('已刪除暫存案件。', false);
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  function wireUi() {
    $('term-hub-lookup-btn')?.addEventListener('click', () => void onLookup());
    $('term-hub-address')?.addEventListener('input', syncLookupBtn);
    $('term-hub-address')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        void onLookup();
      }
    });
    $('term-hub-open-bao')?.addEventListener('click', () => void openBao());
    $('term-hub-open-zhuan')?.addEventListener('click', () => void openZhuan());
    $('term-hub-save-draft')?.addEventListener('click', () => void saveDraft());
    $('term-hub-case-open-bao')?.addEventListener('click', () => void openBaoFromCase());
    $('term-hub-case-open-zhuan')?.addEventListener('click', () => void openZhuanFromCase());
    $('term-hub-handover-btn')?.addEventListener('click', () => void openHandover());
    $('term-hub-delete-btn')?.addEventListener('click', () => void deleteSelectedCase());
    $('term-hub-case-list')?.addEventListener('focus', renderHubCaseList);
    $('term-hub-case-list')?.addEventListener('change', onCaseListChange);
    syncLookupBtn();
    syncCaseOpenButtons();
    renderHubCaseList();
  }

  function boot() {
    wireUi();
    const refresh = () => {
      void Promise.all([
        window.TerminationCase?.purgeDoneCases?.(),
        window.TerminationBaoCase?.purgeDoneCases?.()
      ]).finally(() => renderHubCaseList());
    };
    if (window.skyfunAuth?.isReady?.()) refresh();
    else document.addEventListener('skyfun-auth-ready', refresh, { once: true });
    document.addEventListener('skyfun-auth-changed', refresh);
  }

  window.TerminationHub = {
    refreshCaseList: renderHubCaseList,
    lookup: onLookup
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
