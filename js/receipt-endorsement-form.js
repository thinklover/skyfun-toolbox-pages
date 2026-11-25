/**
 * 領款收據照會 — 送件五欄／照會完畢四欄
 */
(function () {
  'use strict';

  const SUBMIT_FIELD_IDS = [
    'receipt-endorse-rm',
    'receipt-endorse-addr-submit',
    'receipt-endorse-landlord',
    'receipt-endorse-phone',
    'receipt-endorse-deposit'
  ];

  const RECEIPT_SCHEMA_VERSION = 3;
  // v3：送件 1 對 1 通知照會人（盧冠云），照會完畢通知原送件人（與舊版群組推播分開的函式）
  const RECEIPT_FN = 'receipt-endorsement-v3';
  // 測試站（非 toolbox.skyfunsystem.com）一律測試模式：不發 LINE、不存檔
  const TEST_SITE = !/^toolbox\.skyfunsystem\.com$/i.test(location.hostname);

  async function callFn(body) {
    const c = window.SKYFUN_SUPABASE || {};
    const url = String(c.url || '').trim().replace(/\/$/, '');
    const key = String(c.anonKey || c.anon_key || '').trim();
    if (!url || !key) throw new Error('尚未設定 Supabase 連線');
    const r = await fetch(url + '/functions/v1/' + RECEIPT_FN, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_SITE ? { ...body, dryRun: true } : body)
    });
    try {
      return await r.json();
    } catch {
      throw new Error('伺服器回應異常（' + r.status + '）');
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError) {
    const el = $('receipt-endorse-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-sm mt-3 ' + (isError ? 'text-rose-700 font-semibold' : 'text-slate-600');
  }

  function setRepushVisible(show) {
    const btn = $('receipt-endorse-repush-btn');
    if (btn) btn.classList.toggle('hidden', !show);
  }

  function submitLabel(type) {
    return type === 'done' ? '照會完畢並通知送件人' : '送出並通知盧冠云';
  }
  function repushLabel(type) {
    return (type === 'done' ? '重新通知送件人' : '重新通知盧冠云') + '（不重複存檔）';
  }

  function syncPanels() {
    const type = $('receipt-endorse-type')?.value || 'submit';
    const sb = $('receipt-endorse-submit-btn');
    const rb = $('receipt-endorse-repush-btn');
    if (sb && !sb.disabled) sb.textContent = submitLabel(type);
    if (rb && !rb.disabled) rb.textContent = repushLabel(type);
    document.querySelectorAll('[data-receipt-panel]').forEach((el) => {
      const panel = el.getAttribute('data-receipt-panel');
      el.classList.toggle('hidden', panel !== type);
    });
  }

  function collectPayload() {
    const formType = $('receipt-endorse-type')?.value || 'submit';
    if (formType === 'done') {
      return {
        formType: 'done',
        propertyAddress: ($('receipt-endorse-addr-done')?.value || '').trim(),
        supervisor: ($('receipt-endorse-supervisor')?.value || '').trim(),
        result: ($('receipt-endorse-result')?.value || '').trim(),
        submitRentManagerName: ($('receipt-endorse-rm-submit')?.value || '').trim()
      };
    }
    return {
      formType: 'submit',
      rentManagerName: ($('receipt-endorse-rm')?.value || '').trim(),
      propertyAddress: ($('receipt-endorse-addr-submit')?.value || '').trim(),
      landlordName: ($('receipt-endorse-landlord')?.value || '').trim(),
      landlordPhone: ($('receipt-endorse-phone')?.value || '').trim(),
      deposit: ($('receipt-endorse-deposit')?.value || '').trim()
    };
  }

  function validateLocal(payload) {
    if (payload.formType === 'done') {
      const labels = {
        propertyAddress: '物件地址',
        supervisor: '照會主管',
        result: '照會結果',
        submitRentManagerName: '送件租管師姓名'
      };
      const missing = [];
      Object.keys(labels).forEach((k) => {
        if (!payload[k]) missing.push(labels[k]);
      });
      return missing;
    }
    const labels = {
      rentManagerName: '租管師姓名',
      propertyAddress: '物件地址',
      landlordName: '房東姓名',
      landlordPhone: '房東電話',
      deposit: '押金'
    };
    const missing = [];
    Object.keys(labels).forEach((k) => {
      if (!payload[k]) missing.push(labels[k]);
    });
    return missing;
  }

  function clearSubmitFields() {
    SUBMIT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
  }

  async function refreshLineStatus() {
    const badge = $('receipt-endorse-line-badge');
    try {
      const j = await callFn({ action: 'status' });
      if (!j?.ok || j.schemaVersion !== RECEIPT_SCHEMA_VERSION) {
        throw new Error(j?.message || '照會服務版本不符');
      }
      const who = j.reviewerName || '照會人';
      if (badge) {
        if (j.ready) {
          badge.textContent = (j.dryRun ? '測試模式（不發 LINE）· ' : '') + 'LINE 通知 ' + who + ' 已就緒';
          badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900';
        } else if (j.lineConfigured) {
          badge.textContent = (j.dryRun ? '測試模式 · ' : '') + who + ' 尚未綁定 LINE';
          badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900';
        } else {
          badge.textContent = '未設定 LINE';
          badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900';
        }
      }
      setStatus(j.ready ? '' : (j.reviewerError || 'LINE 尚未設定') + '，請聯絡管理員。', !j.ready);
    } catch (e) {
      if (badge) {
        badge.textContent = '連線失敗';
        badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900';
      }
      setStatus('無法連線照會服務：' + (e?.message || e), true);
    }
  }

  async function postReceiptEndorsement(payload) {
    const token = window.skyfunAuth?.getToken?.() || '';
    if (!token) {
      setStatus('請先登入工具箱', true);
      return null;
    }
    return callFn({ action: 'submit', token, ...payload });
  }

  async function submitForm(repushOnly) {
    const payload = collectPayload();
    const missing = validateLocal(payload);
    if (missing.length) {
      setStatus('請填寫：' + missing.join('、'), true);
      return;
    }

    const btn = repushOnly ? $('receipt-endorse-repush-btn') : $('receipt-endorse-submit-btn');
    const otherBtn = repushOnly ? $('receipt-endorse-submit-btn') : $('receipt-endorse-repush-btn');
    const btnLabel = repushOnly ? repushLabel(payload.formType) : submitLabel(payload.formType);
    if (btn) {
      btn.disabled = true;
      btn.textContent = repushOnly ? '推播中…' : '送出中…';
    }
    if (otherBtn) otherBtn.disabled = true;
    if (!repushOnly) setStatus('');

    try {
      const body = repushOnly ? { ...payload, repushOnly: true } : payload;
      const j = await postReceiptEndorsement(body);
      if (!j) return;
      if (!j.ok) {
        const msg = j.message || j.error || '送出失敗';
        setStatus(msg, true);
        setRepushVisible(!!(j.canRepush || j.saved || repushOnly || String(msg).includes('推播失敗')));
        return;
      }
      setStatus('✓ ' + (j.message || '已送出'), false);
      setRepushVisible(false);
      if (!repushOnly && payload.formType === 'submit') {
        clearSubmitFields();
      }
    } catch (e) {
      setStatus('連線失敗：' + String(e?.message || e), true);
      if (repushOnly) setRepushVisible(true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
      if (otherBtn) otherBtn.disabled = false;
    }
  }

  function initReceiptEndorsementForm() {
    const root = $('receipt-endorse-form-root');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    $('receipt-endorse-type')?.addEventListener('change', syncPanels);
    $('receipt-endorse-submit-btn')?.addEventListener('click', () => submitForm(false));
    $('receipt-endorse-repush-btn')?.addEventListener('click', () => submitForm(true));
    syncPanels();
    refreshLineStatus();
  }

  window.initReceiptEndorsementForm = initReceiptEndorsementForm;
  window.refreshReceiptEndorseLineStatus = refreshLineStatus;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReceiptEndorsementForm);
  } else {
    initReceiptEndorsementForm();
  }
})();
