/**
 * 工具箱首頁：自己的小組長抽查未通過通知（Supabase admin_points_spot_notices）。
 * 未讀的顯示成紅色卡片，按「我知道了」收進「已讀」；改判通過的通知由資料庫收起，不會出現。
 */
(function () {
  const REFRESH_MS = 2 * 60 * 1000;
  let list = [];
  let loadedAt = 0;
  let readOpen = false;

  const $box = () => document.getElementById('home-spot-notice');
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const md = (iso) => String(iso || '').slice(5, 10).replace('-', '/');
  const when = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  async function load(force) {
    const auth = window.skyfunAuth;
    if (!$box() || !auth?.getToken?.()) return;
    if (!force && Date.now() - loadedAt < REFRESH_MS) return;
    loadedAt = Date.now();
    try {
      const res = await auth.rpc('admin_points_spot_notices', { p_token: auth.getToken() });
      if (!res?.ok) return;
      list = res.notices || [];
      render();
    } catch (e) {
      console.warn('抽查通知讀取失敗', e);
    }
  }

  function item(n) {
    return `<li class="sn-item${n.readAt ? ' is-read' : ''}">
        <div class="sn-head"><b>${esc(md(n.date))} 審核的案件抽查未通過</b>${n.node ? `<span class="sn-node">${esc(n.node)}</span>` : ''}</div>
        ${n.case ? `<div class="sn-line">案件：${esc(n.case)}</div>` : ''}
        <div class="sn-line sn-reason">原因：${esc(n.reason)}</div>
        <div class="sn-foot"><small>抽查人 ${esc(n.judgedBy)} · ${esc(when(n.createdAt))}</small>${
          n.readAt ? `<small>已讀 ${esc(when(n.readAt))}</small>` : `<button type="button" class="sn-ok" data-sn-read="${Number(n.id)}">我知道了</button>`
        }</div>
      </li>`;
  }

  function render() {
    const el = $box();
    if (!el) return;
    const unread = list.filter((n) => !n.readAt);
    const read = list.filter((n) => n.readAt);
    if (!list.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `<section class="sn-box${unread.length ? '' : ' is-quiet'}" aria-label="小組長抽查通知">
        <h3 class="sn-title">🔍 小組長抽查通知${unread.length ? `<span class="sn-badge">${unread.length} 件未讀</span>` : ''}</h3>
        ${unread.length ? `<p class="sn-tip">組長抽查你審過的案件，下面這些沒有通過。看完原因按「我知道了」；有疑問請直接找組長確認。</p><ul class="sn-list">${unread.map(item).join('')}</ul>` : ''}
        ${read.length ? `<details class="sn-read"${readOpen ? ' open' : ''}><summary>已讀 ${read.length} 件（近 60 天）</summary><ul class="sn-list">${read.map(item).join('')}</ul></details>` : ''}
      </section>`;
  }

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest?.('[data-sn-read]');
    if (!btn) return;
    const id = Number(btn.dataset.snRead);
    btn.disabled = true;
    try {
      const res = await window.skyfunAuth.rpc('admin_points_spot_notice_read', { p_token: window.skyfunAuth.getToken(), p_id: id });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      const n = list.find((x) => Number(x.id) === id);
      if (n) n.readAt = new Date().toISOString();
      render();
    } catch (e) {
      btn.disabled = false;
      window.alert(`沒有存到：${e.message || e}`);
    }
  });
  document.addEventListener('toggle', (ev) => {
    if (ev.target?.classList?.contains('sn-read')) readOpen = ev.target.open;
  }, true);

  document.addEventListener('skyfun-auth-ready', () => load(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load(false);
  });
  if (window.skyfunAuth?.isReady?.()) load(true);
})();
