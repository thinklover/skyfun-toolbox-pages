/**
 * 業務獎金辦法頁（原簽呈公告）：第一版樣式
 * 白卡＋右側逐則「已閱畢知悉」；前五則重點在上；浮水印預覽不可下載
 */
(function () {
  'use strict';

  const state = { loaded: false, loading: false, isSales: false, loggedIn: false, acks: {}, busy: {}, error: '' };

  function data() {
    return window.SKYFUN_NOTICE_ACK || { title: '', items: [] };
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
  }

  function root() {
    return document.getElementById('notice-ack-root');
  }

  function hintText() {
    if (state.error) return state.error;
    if (!state.loaded) return state.loading ? '讀取確認紀錄中…' : '登入工具箱後即可打勾';
    if (!state.isSales) return '本區公告由業務同仁打勾確認；你的處別不需打勾，可直接閱讀。';
    return '以下為其他公司公告（與上方重點辦法不重複）。請逐則預覽後打勾，打勾後無法取消。';
  }

  function render() {
    const el = root();
    if (!el) return false;
    const d = data();
    const items = d.items || [];
    const done = items.filter((it) => state.acks[it.id]).length;
    const canTick = state.loaded && state.isSales;
    el.innerHTML = `
      <div class="nack-head">
        <div class="nack-title">📌 ${esc(d.title)}</div>
        ${canTick ? `<span class="nack-progress${done === items.length ? ' is-done' : ''}">已確認 ${done} / ${items.length}</span>` : ''}
      </div>
      <p class="nack-hint${state.error ? ' is-error' : ''}">${esc(hintText())}</p>
      <div class="bb-docs bb-docs--accordion" aria-label="公司公告">
        ${items.map((it, i) => {
          const at = state.acks[it.id];
          const busy = !!state.busy[it.id];
          const meta = (it.lines || []).filter(Boolean).join(' · ');
          const fileBtn = it.file
            ? (it.freeWm
              ? `<button type="button" class="bb-btn bb-btn--main" data-nack-wm="${esc(it.file)}" data-nack-wm-title="${esc(it.title)}">📄 預覽浮水印檔</button>`
              : `<a class="bb-btn bb-btn--main" href="${esc(it.file)}" target="_blank" rel="noopener noreferrer">📄 開啟公告</a>`)
            : '';
          const ackLine = at
            ? `<p class="bb-doc-ackst">已勾 · ${esc(when(at))}</p>`
            : `<label class="nack-check${canTick ? '' : ' is-off'}">
                <input type="checkbox" data-nack-id="${esc(it.id)}" ${!canTick || busy ? 'disabled' : ''}>
                <span>已閱畢知悉</span>
              </label>`;
          return `
          <article class="bb-doc-card">
            <header class="bb-doc-head">
              <div>
                <h4>${i + 1}. ${esc(it.title)}</h4>
                ${meta ? `<p class="bb-doc-meta">${esc(meta)}</p>` : ''}
                ${ackLine}
              </div>
              ${fileBtn ? `<div class="bb-preview-actions">${fileBtn}</div>` : ''}
            </header>
          </article>`;
        }).join('')}
      </div>`;
    return true;
  }

  async function load() {
    const t = token();
    if (!t || !window.skyfunAuth?.rpc) {
      state.loggedIn = false;
      render();
      return;
    }
    if (state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const res = await window.skyfunAuth.rpc('toolbox_notice_ack_mine', { p_token: t });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.loggedIn = true;
      state.loaded = true;
      state.isSales = !!res.isSales;
      state.acks = {};
      (res.acks || []).forEach((a) => { state.acks[a.id] = a.at; });
    } catch (e) {
      state.error = '確認紀錄讀取失敗：' + (e.message || e);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function ack(id, box) {
    state.busy[id] = true;
    box.disabled = true;
    try {
      const res = await window.skyfunAuth.rpc('toolbox_notice_ack_set', { p_token: token(), p_notice_id: id });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      state.acks[id] = res.at || new Date().toISOString();
      state.error = '';
    } catch (e) {
      state.error = '打勾失敗，請再試一次：' + (e.message || e);
    } finally {
      delete state.busy[id];
      render();
    }
  }

  function bind() {
    const el = root();
    if (!el) {
      setTimeout(bind, 50);
      return;
    }
    render();
    if (el.dataset.nackBound === '1') return;
    el.dataset.nackBound = '1';
    el.addEventListener('change', (e) => {
      const box = e.target.closest('input[data-nack-id]');
      if (!box || !box.checked) return;
      ack(box.getAttribute('data-nack-id'), box);
    });
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nack-wm]');
      if (!btn) return;
      const href = btn.getAttribute('data-nack-wm') || '';
      const title = btn.getAttribute('data-nack-wm-title') || '';
      const Gate = window.SkyfunPolicyDocGate;
      if (Gate?.openFreeWatermark) Gate.openFreeWatermark(href, { title });
      else if (Gate?.open) Gate.open(href, { title });
      else window.open(href, '_blank', 'noopener');
    });
    document.addEventListener('skyfun-auth-ready', load);
    const page = document.getElementById('page-business-bonus');
    if (page) {
      new MutationObserver(() => {
        if (!page.classList.contains('hidden')) load();
      }).observe(page, { attributes: true, attributeFilter: ['class'] });
    }
    if (token()) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
