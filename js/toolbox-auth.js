/**
 * GitHub Pages 靜態版：Supabase 帳密登入（與 Render 相同 UI／共用帳號，不橋接 Express API）
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'skyfun-toolbox-auth-supabase-v1';
  const ID_PLACEHOLDER = '請與公司系統相同（身分證字號）';
  const ID_LETTER_CODES = [10, 11, 12, 13, 14, 15, 16, 17, 34, 18, 19, 20, 21, 22, 35, 23, 24, 25, 26, 27, 28, 29, 32, 30, 31, 33];

  function normId(v) {
    return String(v || '').replace(/\s/g, '').toUpperCase();
  }

  /** 身分證字號／新式居留證號（第二碼 1、2、8、9）含檢查碼 */
  function twIdOk(v) {
    const s = normId(v);
    if (!/^[A-Z][1289]\d{8}$/.test(s)) return false;
    const n = ID_LETTER_CODES[s.charCodeAt(0) - 65];
    let sum = Math.floor(n / 10) + (n % 10) * 9;
    for (let i = 1; i < 9; i++) sum += Number(s[i]) * (9 - i);
    return (sum + Number(s[9])) % 10 === 0;
  }

  /** 中文本名 2–4 字；原住民等姓名可用「·」分段（與資料庫 toolbox_real_name_ok 相同） */
  function realNameOk(v) {
    const s = String(v || '').replace(/\s/g, '');
    return /^[\u4e00-\u9fff]{2,4}$/.test(s) || /^[\u4e00-\u9fff]{1,10}([·‧・．][\u4e00-\u9fff]{1,10})+$/.test(s);
  }

  function maskId(v) {
    const s = String(v || '');
    return twIdOk(s) ? `${s.slice(0, 3)}****${s.slice(-3)}` : s;
  }

  let client = null;
  let session = null;
  let ready = false;
  let mode = 'login';

  function $(id) {
    return document.getElementById(id);
  }

  function loadStored() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveStored(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearStored() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function setGateMessage(msg, isError) {
    const el = $('toolbox-auth-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('hidden', !msg);
  }

  function submitLabel() {
    if (mode === 'register') return '送出註冊申請';
    if (mode === 'forgot') return '重設密碼並登入';
    return '進入工具箱';
  }

  function setGateLoading(on) {
    const btn = $('toolbox-auth-submit');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? '連線中…' : submitLabel();
    }
  }

  function getConfig() {
    const c = window.SKYFUN_SUPABASE || {};
    return {
      url: String(c.url || '').trim().replace(/\/$/, ''),
      anonKey: String(c.anonKey || c.anon_key || '').trim()
    };
  }

  function ensureClient() {
    if (client) return client;
    const { url, anonKey } = getConfig();
    if (!url || !anonKey || /xxxx\.supabase/.test(url)) {
      throw new Error('請先設定 js/supabase-config.js');
    }
    if (!window.supabase?.createClient) throw new Error('Supabase SDK 未載入');
    client = window.supabase.createClient(url, anonKey);
    return client;
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || '連線'}逾時，請稍後再試`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function rpc(name, args) {
    const sb = ensureClient();
    const { data, error } = await withTimeout(sb.rpc(name, args), 12000, 'Supabase 連線');
    if (error) {
      const err = new Error(error.message || 'Supabase 錯誤');
      err.code = error.code;
      throw err;
    }
    return data;
  }

  function persistSession() {
    if (!session) return;
    saveStored({
      supabaseToken: session.supabaseToken,
      user: session.user,
      supabaseUser: session.supabaseUser
    });
  }

  const DAILY_QUOTES = [
    '業績是走出來的，不是等出來的',
    '拒絕，是成交的開始',
    '成功的秘訣，在於把平凡的開發做到不平凡的次數',
    '我們不是在賣產品，是在幫客戶解決難題',
    '你的收入，取決於你解決問題的大小與取代性',
    '只要還有明天，今天永遠是起跑點',
    '強者在汗水中成長，弱者在淚水中退縮',
    '沒人能擊敗你，除非你自己先放棄成交的念頭',
    '今天多流汗，明天看存款'
  ];

  function pickDailyQuote() {
    if (!DAILY_QUOTES.length) return '';
    return DAILY_QUOTES[Math.floor(Math.random() * DAILY_QUOTES.length)];
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function populateDepartmentSelect(el, selected) {
    if (!el) return;
    if (typeof window.buildSkyfunDepartmentSelectHtml === 'function') {
      el.innerHTML = window.buildSkyfunDepartmentSelectHtml(selected);
      return;
    }
    const fallback = ['北一處', '北二處', '北三處', '基一處', '桃一處', '竹一處', '宜一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '彰一處', '嘉一處', '南一處', '南二處', '高一處', '高二處', '行政管理部', '總經理室', '租賃管理部', '電銷部', '客服部', '客滿部', '財務部'];
    const sel = String(selected || '').trim();
    el.innerHTML = '<option value="">請選擇處別</option>' +
      fallback.map((o) => `<option value="${escHtml(o)}"${o === sel ? ' selected' : ''}>${escHtml(o)}</option>`).join('');
  }

  function rebuildGateForm() {
    const card = document.querySelector('#toolbox-auth-gate .toolbox-auth-card');
    if (!card) return;
    card.classList.add('toolbox-auth-card--lite');
    const quoteEl = $('quote-text-gate');
    const quote = quoteEl?.textContent?.trim() && quoteEl.textContent !== '讀取中…'
      ? quoteEl.textContent.trim()
      : pickDailyQuote();
    card.innerHTML = `
      <div class="lite-auth-brand">
        <span class="lite-auth-mark" aria-hidden="true">星</span>
        <div>
          <h2 id="toolbox-auth-title">星鴻工具箱</h2>
          <p class="lite-auth-tag">帳號登入</p>
        </div>
      </div>
      <blockquote class="lite-auth-quote" id="auth-gate-quote">
        <span class="lite-auth-quote-label">今日金句</span>
        <p id="quote-text-gate">${quote}</p>
      </blockquote>
      <p id="toolbox-auth-mode-hint" class="lite-auth-hint">輸入帳號與密碼即可進入。第一次登入請先註冊。</p>
      <label for="toolbox-auth-username">帳號</label>
      <input id="toolbox-auth-username" type="text" maxlength="40" autocomplete="username" placeholder="${ID_PLACEHOLDER}" />
      <label for="toolbox-auth-password">密碼</label>
      <input id="toolbox-auth-password" type="password" maxlength="72" autocomplete="current-password" placeholder="${ID_PLACEHOLDER}" />
      <div id="toolbox-auth-register-extra" class="hidden">
        <label for="toolbox-auth-password2">確認密碼</label>
        <input id="toolbox-auth-password2" type="password" maxlength="72" autocomplete="new-password" placeholder="再輸入一次身分證字號" />
        <label for="toolbox-auth-displayname">姓名</label>
        <input id="toolbox-auth-displayname" type="text" maxlength="30" autocomplete="name" placeholder="請輸入本名（與身分證相同）" required />
        <label for="toolbox-auth-team">處別</label>
        <select id="toolbox-auth-team" required>${typeof window.buildSkyfunDepartmentSelectHtml === 'function' ? window.buildSkyfunDepartmentSelectHtml() : '<option value="">請選擇處別</option>'}</select>
      </div>
      <div id="toolbox-auth-forgot-extra" class="hidden">
        <label for="toolbox-auth-realname">姓名</label>
        <input id="toolbox-auth-realname" type="text" maxlength="30" autocomplete="name" placeholder="請輸入本名（與註冊相同）" />
      </div>
      <button type="button" id="toolbox-auth-submit">進入工具箱</button>
      <p id="toolbox-auth-msg" class="hidden"></p>
      <p class="lite-auth-switch">
        <button type="button" id="toolbox-auth-switch" class="lite-auth-linkbtn"></button>
        <button type="button" id="toolbox-auth-forgot" class="lite-auth-linkbtn">忘記密碼？</button>
      </p>
      <a id="toolbox-auth-admin-link" href="./admin.html">管理員核准帳號</a>
    `;

    populateDepartmentSelect($('toolbox-auth-team'));

    if (!document.getElementById('toolbox-auth-lite-style')) {
      const st = document.createElement('style');
      st.id = 'toolbox-auth-lite-style';
      st.textContent = [
        '#toolbox-auth-gate{background:radial-gradient(120% 80% at 50% -10%,#134e4a 0%,#0f172a 42%,#020617 100%)!important}',
        '.toolbox-auth-card--lite{max-width:21.5rem;padding:1.65rem 1.4rem 1.25rem;border:1px solid rgba(153,246,228,.22);background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);box-shadow:0 28px 70px rgba(2,6,23,.5)}',
        '.lite-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:14px}',
        '.lite-auth-mark{flex:0 0 auto;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-weight:900;font-size:1.15rem;color:#ecfdf5;background:linear-gradient(145deg,#0f766e,#115e59);box-shadow:0 8px 18px rgba(15,118,110,.35)}',
        '.toolbox-auth-card--lite h2{margin:0;text-align:left;font-size:1.28rem;letter-spacing:.02em;color:#0f172a}',
        '.lite-auth-tag{margin:.15rem 0 0;text-align:left;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0f766e}',
        '.lite-auth-hint{margin:0 0 12px!important;text-align:left!important;color:#64748b!important;font-weight:500!important}',
        '.lite-auth-quote{margin:0 0 12px;padding:.85rem .9rem;border-radius:.9rem;border:1px solid #ccfbf1;background:linear-gradient(180deg,#f0fdfa 0%,#ecfeff 100%)}',
        '.lite-auth-quote-label{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.08em;color:#0f766e;margin-bottom:.35rem}',
        '.lite-auth-quote p,#quote-text-gate{margin:0!important;text-align:left!important;font-size:.92rem!important;font-weight:800!important;line-height:1.45!important;color:#0f172a!important}',
        '.toolbox-auth-card--lite label{margin-top:.7rem;color:#334155}',
        '.toolbox-auth-card--lite input{border:1.5px solid #cbd5e1;border-radius:.8rem;padding:.62rem .75rem;background:#fff;transition:border-color .15s,box-shadow .15s}',
        '.toolbox-auth-card--lite select{border:1.5px solid #cbd5e1;border-radius:.8rem;padding:.62rem .75rem;background:#fff;width:100%;color:#0f172a}',
        '.toolbox-auth-card--lite input:focus{outline:none;border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.15)}',
        '.toolbox-auth-card--lite select:focus{outline:none;border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.15)}',
        '#toolbox-auth-register-extra.hidden{display:none}',
        '#toolbox-auth-gate input[type="password"]{width:100%}',
        '.toolbox-auth-card--lite #toolbox-auth-submit{margin-top:1.1rem;border-radius:.9rem;padding:.72rem;font-weight:800;letter-spacing:.02em;background:linear-gradient(135deg,#0f766e,#0d9488);box-shadow:0 10px 22px rgba(15,118,110,.28)}',
        '.toolbox-auth-card--lite #toolbox-auth-submit:hover{filter:brightness(1.05)}',
        '.lite-auth-switch{margin:.85rem 0 .15rem!important;text-align:center!important}',
        '.lite-auth-linkbtn{border:0;background:transparent;color:#0f766e;font-size:.82rem;font-weight:700;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}',
        '.lite-auth-linkbtn:hover{color:#115e59}',
        '#toolbox-auth-admin-link{display:block;margin-top:10px;text-align:center;font-size:11px;color:#94a3b8;text-decoration:none}',
        '#toolbox-auth-admin-link:hover{color:#64748b}'
      ].join('');
      document.head.appendChild(st);
    }
  }

  function toggleRegisterMode() {
    setMode(mode === 'login' ? 'register' : 'login');
  }

  function wireRegisterSwitch() {
    const gate = $('toolbox-auth-gate');
    if (gate && gate.dataset.registerSwitchBound !== '1') {
      gate.dataset.registerSwitchBound = '1';
      gate.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest('#toolbox-auth-switch')) toggleRegisterMode();
        if (target?.closest('#toolbox-auth-forgot')) setMode('forgot');
      });
    }
    const switchBtn = $('toolbox-auth-switch');
    if (!switchBtn || switchBtn.dataset.bound === '1') return;
    switchBtn.dataset.bound = '1';
    switchBtn.addEventListener('click', toggleRegisterMode);
  }

  function setMode(next) {
    mode = next === 'register' || next === 'forgot' ? next : 'login';
    const extra = $('toolbox-auth-register-extra');
    if (extra) extra.classList.toggle('hidden', mode !== 'register');
    const fextra = $('toolbox-auth-forgot-extra');
    if (fextra) fextra.classList.toggle('hidden', mode !== 'forgot');
    const pwd = $('toolbox-auth-password');
    if (pwd) {
      pwd.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      const pwdLabel = document.querySelector('label[for="toolbox-auth-password"]');
      if (pwdLabel) pwdLabel.style.display = mode === 'forgot' ? 'none' : '';
      pwd.style.display = mode === 'forgot' ? 'none' : '';
    }
    const forgotBtn = $('toolbox-auth-forgot');
    if (forgotBtn) forgotBtn.style.display = mode === 'login' ? '' : 'none';
    const hint = $('toolbox-auth-mode-hint');
    if (hint) {
      hint.textContent =
        mode === 'register'
          ? '帳號、密碼都輸入身分證字號（與公司系統相同），姓名請填本名。送出後需管理員核准。'
          : mode === 'forgot'
            ? '輸入帳號（身分證字號）與姓名，驗證後密碼會重設為身分證字號，並直接登入。'
            : '輸入帳號與密碼即可進入。第一次登入請先註冊。';
    }
    const tag = document.querySelector('.lite-auth-tag');
    if (tag) tag.textContent = mode === 'register' ? '申請帳號' : mode === 'forgot' ? '忘記密碼' : '帳號登入';
    const switchBtn = $('toolbox-auth-switch');
    if (switchBtn) {
      switchBtn.textContent =
        mode === 'register' ? '已有帳號？返回進入' : mode === 'forgot' ? '返回登入' : '還沒有帳號？申請註冊';
    }
    const btn = $('toolbox-auth-submit');
    if (btn && !btn.disabled) btn.textContent = submitLabel();
    setGateMessage('');
  }

  function needsTeam(user) {
    const u = user || session?.supabaseUser || session?.user;
    return !String(u?.team || '').trim();
  }

  function ensureTeamGate() {
    let gate = $('toolbox-team-gate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'toolbox-team-gate';
    gate.className = 'hidden';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.innerHTML =
      '<div class="toolbox-team-card toolbox-auth-card toolbox-auth-card--lite">' +
      '<h2 id="toolbox-team-title">請補填處別</h2>' +
      '<p class="lite-auth-hint">您的帳號尚未設定處別，請選擇後才能繼續使用工具箱。</p>' +
      '<label for="toolbox-team-select">處別</label>' +
      '<select id="toolbox-team-select" required></select>' +
      '<button type="button" id="toolbox-team-submit">確認並進入</button>' +
      '<p id="toolbox-team-msg" class="hidden"></p>' +
      '</div>';
    document.body.appendChild(gate);
    populateDepartmentSelect($('toolbox-team-select'));
    $('toolbox-team-submit')?.addEventListener('click', () => {
      void submitTeamGate();
    });
    $('toolbox-team-select')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void submitTeamGate();
    });
    if (!document.getElementById('toolbox-team-gate-style')) {
      const st = document.createElement('style');
      st.id = 'toolbox-team-gate-style';
      st.textContent = [
        '#toolbox-team-gate{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}',
        '#toolbox-team-gate.hidden{display:none!important}',
        '#toolbox-team-gate .toolbox-team-card{max-width:21.5rem;width:100%}',
        '#toolbox-team-gate h2{margin:0 0 .35rem;font-size:1.2rem;color:#0f172a}',
        '#toolbox-team-submit{margin-top:1rem;width:100%;border:0;border-radius:.9rem;padding:.72rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);cursor:pointer}',
        '#toolbox-team-msg{margin-top:.65rem;font-size:.82rem;color:#0f766e}',
        '#toolbox-team-msg.is-error{color:#b91c1c}'
      ].join('');
      document.head.appendChild(st);
    }
    return gate;
  }

  function setTeamGateMessage(msg, isError) {
    const el = $('toolbox-team-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('hidden', !msg);
  }

  function showTeamGate() {
    document.body.classList.add('toolbox-auth-pending');
    $('toolbox-auth-gate')?.classList.add('hidden');
    ensureTeamGate().classList.remove('hidden');
    populateDepartmentSelect($('toolbox-team-select'));
    ready = false;
    setTeamGateMessage('');
    $('toolbox-team-select')?.focus();
  }

  function hideTeamGate() {
    $('toolbox-team-gate')?.classList.add('hidden');
  }

  async function submitTeamGate() {
    const team = $('toolbox-team-select')?.value?.trim() || '';
    if (!team) {
      setTeamGateMessage('請選擇處別', true);
      return;
    }
    const btn = $('toolbox-team-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '儲存中…';
    }
    setTeamGateMessage('');
    try {
      const data = await rpc('toolbox_set_my_team', {
        p_token: session?.supabaseToken || '',
        p_team: team
      });
      if (!data?.ok || !data.user) throw new Error(data?.error || '儲存失敗');
      applySupabaseSession(session.supabaseToken, data.user);
      hideTeamGate();
      unlockApp();
    } catch (e) {
      setTeamGateMessage(e.message || '儲存失敗', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '確認並進入';
      }
    }
  }

  /* ---------- 帳號實名：帳號、密碼要是身分證字號，姓名要是本名，不符合就不能使用 ---------- */

  function identityIssues(user) {
    const u = user || session?.supabaseUser;
    return u?.needsIdentity ? (Array.isArray(u.identityIssues) ? u.identityIssues : []) : [];
  }

  function needsIdentity(user) {
    return identityIssues(user).length > 0;
  }

  function ensureIdentityGate() {
    let gate = $('toolbox-identity-gate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'toolbox-identity-gate';
    gate.className = 'hidden';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.innerHTML =
      '<div class="toolbox-auth-card toolbox-auth-card--lite">' +
      '<h2>請更新帳號資料</h2>' +
      '<ul id="toolbox-identity-why" class="tig-why"></ul>' +
      '<div id="toolbox-identity-id">' +
      '<label for="toolbox-identity-no">帳號（身分證字號）</label>' +
      `<input id="toolbox-identity-no" type="text" maxlength="12" autocomplete="username" placeholder="${ID_PLACEHOLDER}" />` +
      '<label for="toolbox-identity-no2">密碼（身分證字號）</label>' +
      `<input id="toolbox-identity-no2" type="password" maxlength="12" autocomplete="new-password" placeholder="${ID_PLACEHOLDER}" />` +
      '</div>' +
      '<label for="toolbox-identity-name">姓名（本名）</label>' +
      '<input id="toolbox-identity-name" type="text" maxlength="30" autocomplete="name" placeholder="請輸入本名（與身分證相同）" />' +
      '<button type="button" id="toolbox-identity-submit">更新並進入</button>' +
      '<p id="toolbox-identity-msg" class="hidden"></p>' +
      '<button type="button" id="toolbox-identity-logout" class="tig-logout">登出</button>' +
      '</div>';
    document.body.appendChild(gate);
    $('toolbox-identity-submit')?.addEventListener('click', () => {
      void submitIdentityGate();
    });
    ['toolbox-identity-no', 'toolbox-identity-no2', 'toolbox-identity-name'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void submitIdentityGate();
      });
    });
    $('toolbox-identity-logout')?.addEventListener('click', () => {
      logout().catch(() => {});
    });
    if (!document.getElementById('toolbox-identity-gate-style')) {
      const st = document.createElement('style');
      st.id = 'toolbox-identity-gate-style';
      st.textContent = [
        '#toolbox-identity-gate{position:fixed;inset:0;z-index:100003;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}',
        '#toolbox-identity-gate.hidden,#toolbox-identity-gate .hidden{display:none!important}',
        '#toolbox-identity-gate .toolbox-auth-card{max-width:23rem;width:100%;max-height:calc(100vh - 2rem);overflow:auto}',
        '#toolbox-identity-gate h2{margin:0 0 .6rem;font-size:1.2rem;color:#0f172a}',
        '#toolbox-identity-gate .tig-why{margin:0 0 .4rem;padding:.65rem .8rem .65rem 1.9rem;border-radius:.8rem;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:.85rem;line-height:1.55;text-align:left}',
        '#toolbox-identity-gate .tig-why li{list-style:disc}',
        '#toolbox-identity-gate .tig-why li + li{margin-top:.3rem}',
        '#toolbox-identity-gate input{width:100%}',
        '#toolbox-identity-submit{margin-top:1rem;width:100%;border:0;border-radius:.9rem;padding:.72rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);cursor:pointer}',
        '#toolbox-identity-submit:disabled{opacity:.6;cursor:wait}',
        '#toolbox-identity-msg{margin-top:.65rem;font-size:.82rem;color:#0f766e}',
        '#toolbox-identity-msg.is-error{color:#b91c1c}',
        '#toolbox-identity-gate .tig-logout{display:block;margin:.8rem auto 0;border:0;background:transparent;color:#94a3b8;font-size:.78rem;text-decoration:underline;cursor:pointer}'
      ].join('');
      document.head.appendChild(st);
    }
    return gate;
  }

  function setIdentityGateMessage(msg, isError) {
    const el = $('toolbox-identity-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('hidden', !msg);
  }

  function showIdentityGate() {
    document.documentElement.classList.remove('toolbox-auth-cached');
    document.body.classList.add('toolbox-auth-pending');
    $('toolbox-auth-gate')?.classList.add('hidden');
    hideTeamGate();
    ready = false;
    const gate = ensureIdentityGate();
    const issues = identityIssues();
    const needId = issues.includes('id');
    const u = session?.supabaseUser || session?.user || {};
    const why = [];
    if (needId) why.push('工具箱的帳號、密碼要和公司系統相同，請改成你的身分證字號。之後登入帳號、密碼都輸入身分證字號。');
    if (issues.includes('name')) why.push('姓名請填本名（與身分證相同），不能用英文名、暱稱或加處別。');
    $('toolbox-identity-why').innerHTML = why.map((t) => `<li>${escHtml(t)}</li>`).join('');
    $('toolbox-identity-id').classList.toggle('hidden', !needId);
    const noInput = $('toolbox-identity-no');
    if (noInput) noInput.value = twIdOk(u.username) ? normId(u.username) : '';
    if ($('toolbox-identity-no2')) $('toolbox-identity-no2').value = '';
    if ($('toolbox-identity-name')) $('toolbox-identity-name').value = realNameOk(u.name) ? u.name : '';
    setIdentityGateMessage('');
    gate.classList.remove('hidden');
    (needId && !noInput?.value ? noInput : needId ? $('toolbox-identity-no2') : $('toolbox-identity-name'))?.focus();
  }

  function hideIdentityGate() {
    $('toolbox-identity-gate')?.classList.add('hidden');
  }

  async function submitIdentityGate() {
    const needId = identityIssues().includes('id');
    const idNo = normId($('toolbox-identity-no')?.value);
    const idNo2 = normId($('toolbox-identity-no2')?.value);
    const name = String($('toolbox-identity-name')?.value || '').replace(/\s/g, '');
    if (needId) {
      if (!twIdOk(idNo)) {
        setIdentityGateMessage('身分證字號格式不正確，請再確認', true);
        return;
      }
      if (idNo !== idNo2) {
        setIdentityGateMessage('密碼也請輸入同一組身分證字號', true);
        return;
      }
    }
    if (!realNameOk(name)) {
      setIdentityGateMessage('姓名請填本名（與身分證相同）', true);
      return;
    }
    const btn = $('toolbox-identity-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '更新中…';
    }
    setIdentityGateMessage('');
    try {
      const data = await rpc('toolbox_update_identity', {
        p_token: session?.supabaseToken || '',
        p_id_no: needId ? idNo : '',
        p_name: name
      });
      if (!data?.ok || !data.user) throw new Error(data?.error || '更新失敗');
      applySupabaseSession(session.supabaseToken, data.user);
      if ($('toolbox-auth-username')) $('toolbox-auth-username').value = data.user.username || '';
      hideIdentityGate();
      await finishAuthEntry();
    } catch (e) {
      setIdentityGateMessage(e.message || '更新失敗', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '更新並進入';
      }
    }
  }

  /* ---------- 修改密碼（密碼維持身分證字號） ---------- */

  function ensureChangePwGate() {
    let gate = $('toolbox-chpw-gate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'toolbox-chpw-gate';
    gate.className = 'hidden';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.innerHTML =
      '<div class="toolbox-auth-card toolbox-auth-card--lite">' +
      '<h2>修改密碼</h2>' +
      '<p class="lite-auth-hint">密碼與公司系統相同，請設定為你的身分證字號。</p>' +
      '<label for="toolbox-chpw-current">目前密碼</label>' +
      '<input id="toolbox-chpw-current" type="password" maxlength="72" autocomplete="current-password" placeholder="請輸入目前密碼" />' +
      `<label for="toolbox-chpw-new">新密碼（身分證字號）</label>` +
      `<input id="toolbox-chpw-new" type="password" maxlength="12" autocomplete="new-password" placeholder="${ID_PLACEHOLDER}" />` +
      '<label for="toolbox-chpw-new2">確認新密碼</label>' +
      `<input id="toolbox-chpw-new2" type="password" maxlength="12" autocomplete="new-password" placeholder="再輸入一次身分證字號" />` +
      '<button type="button" id="toolbox-chpw-submit">更新密碼</button>' +
      '<p id="toolbox-chpw-msg" class="hidden"></p>' +
      '<button type="button" id="toolbox-chpw-cancel" class="tig-logout">取消</button>' +
      '</div>';
    document.body.appendChild(gate);
    $('toolbox-chpw-submit')?.addEventListener('click', () => {
      void submitChangePw();
    });
    $('toolbox-chpw-cancel')?.addEventListener('click', () => {
      gate.classList.add('hidden');
    });
    ['toolbox-chpw-current', 'toolbox-chpw-new', 'toolbox-chpw-new2'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void submitChangePw();
      });
    });
    if (!document.getElementById('toolbox-chpw-gate-style')) {
      const st = document.createElement('style');
      st.id = 'toolbox-chpw-gate-style';
      st.textContent = [
        '#toolbox-chpw-gate{position:fixed;inset:0;z-index:100004;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}',
        '#toolbox-chpw-gate.hidden{display:none!important}',
        '#toolbox-chpw-gate .toolbox-auth-card{max-width:21.5rem;width:100%}',
        '#toolbox-chpw-gate h2{margin:0 0 .35rem;font-size:1.2rem;color:#0f172a}',
        '#toolbox-chpw-gate input{width:100%}',
        '#toolbox-chpw-submit{margin-top:1rem;width:100%;border:0;border-radius:.9rem;padding:.72rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);cursor:pointer}',
        '#toolbox-chpw-submit:disabled{opacity:.6;cursor:wait}',
        '#toolbox-chpw-msg{margin-top:.65rem;font-size:.82rem;color:#0f766e}',
        '#toolbox-chpw-msg.is-error{color:#b91c1c}',
        '#toolbox-chpw-gate .tig-logout{display:block;margin:.8rem auto 0;border:0;background:transparent;color:#94a3b8;font-size:.78rem;text-decoration:underline;cursor:pointer}'
      ].join('');
      document.head.appendChild(st);
    }
    return gate;
  }

  function setChangePwMessage(msg, isError) {
    const el = $('toolbox-chpw-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('hidden', !msg);
  }

  function showChangePwGate() {
    if (!session?.supabaseToken) return;
    const gate = ensureChangePwGate();
    ['toolbox-chpw-current', 'toolbox-chpw-new', 'toolbox-chpw-new2'].forEach((id) => {
      if ($(id)) $(id).value = '';
    });
    setChangePwMessage('');
    gate.classList.remove('hidden');
    $('toolbox-chpw-current')?.focus();
  }

  async function submitChangePw() {
    const current = $('toolbox-chpw-current')?.value || '';
    const next = normId($('toolbox-chpw-new')?.value);
    const next2 = normId($('toolbox-chpw-new2')?.value);
    if (!current) {
      setChangePwMessage('請輸入目前密碼', true);
      return;
    }
    if (!twIdOk(next)) {
      setChangePwMessage('新密碼請輸入身分證字號（與公司系統相同）', true);
      return;
    }
    if (next !== next2) {
      setChangePwMessage('兩次新密碼不一致', true);
      return;
    }
    const btn = $('toolbox-chpw-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '更新中…';
    }
    setChangePwMessage('');
    try {
      const data = await rpc('toolbox_change_password', {
        p_token: session?.supabaseToken || '',
        p_current: current,
        p_new: next
      });
      if (!data?.ok) throw new Error(data?.error || '更新失敗');
      setChangePwMessage(data.message || '密碼已更新', false);
      setTimeout(() => $('toolbox-chpw-gate')?.classList.add('hidden'), 900);
    } catch (e) {
      setChangePwMessage(e.message || '更新失敗', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '更新密碼';
      }
    }
  }

  /* ---------- 行政管理部：進入工具箱時要求加官方帳號並綁定 LINE ---------- */

  const LINE_ADD_URL = 'https://line.me/R/ti/p/@522ubeym';
  const LINE_GATE_TEAMS = new Set(['行政管理部']);
  const lineGate = { checked: false, code: '', expiresAt: '', error: '', busy: false, forced: false };

  function lineGateSkipKey() {
    return `skyfun-line-gate-skip-${session?.user?.id || ''}`;
  }

  function lineGateEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function lineGateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function maybeLineGate() {
    if (lineGate.checked || !session?.supabaseToken) return;
    const team = String(session.supabaseUser?.team || session.user?.team || '').trim();
    let info;
    try {
      info = await rpc('line_my_binding', { p_token: session.supabaseToken });
    } catch {
      return;
    }
    if (!info?.ok) return;
    const forced = !!info.forceBind;
    lineGate.forced = forced;
    // 行政管理部未綁定，或後台強制綁定：都要進閘道
    if (info.bound && !forced) {
      lineGate.checked = true;
      return;
    }
    if (!forced && !LINE_GATE_TEAMS.has(team)) {
      lineGate.checked = true;
      return;
    }
    if (info.bound && forced) {
      // 理論上綁定後 trigger 會清掉 force；若仍有標記就當已完成
      lineGate.checked = true;
      return;
    }
    lineGate.checked = true;
    if (!forced) {
      try {
        if (sessionStorage.getItem(lineGateSkipKey())) return;
      } catch {
        /* ignore */
      }
    } else {
      try {
        sessionStorage.removeItem(lineGateSkipKey());
      } catch {
        /* ignore */
      }
    }
    renderLineGate();
  }

  function ensureLineGate() {
    let gate = $('toolbox-line-gate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'toolbox-line-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    document.body.appendChild(gate);
    gate.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lg]');
      if (btn) void lineGateAction(btn.dataset.lg);
    });
    if (!document.getElementById('toolbox-line-gate-style')) {
      const st = document.createElement('style');
      st.id = 'toolbox-line-gate-style';
      st.textContent = [
        '#toolbox-line-gate{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}',
        '#toolbox-line-gate.hidden{display:none!important}',
        '#toolbox-line-gate .lg-card{width:100%;max-width:25rem;max-height:calc(100vh - 2rem);overflow:auto;border-radius:1.25rem;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);box-shadow:0 28px 70px rgba(2,6,23,.5);padding:1.5rem 1.35rem 1.2rem;color:#0f172a}',
        '#toolbox-line-gate .lg-head{display:flex;align-items:center;gap:.75rem;margin-bottom:.8rem}',
        '#toolbox-line-gate .lg-mark{flex:0 0 auto;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-weight:900;font-size:.95rem;color:#fff;background:linear-gradient(145deg,#06c755,#04a344);box-shadow:0 8px 18px rgba(6,199,85,.35)}',
        '#toolbox-line-gate h2{margin:0;font-size:1.15rem;font-weight:900}',
        '#toolbox-line-gate .lg-sub{margin:.15rem 0 0;font-size:.8rem;color:#64748b}',
        '#toolbox-line-gate .lg-why{margin:0 0 .9rem;padding:.7rem .8rem;border-radius:.8rem;background:#f0fdf4;border:1px solid #bbf7d0;font-size:.85rem;line-height:1.55;color:#14532d}',
        '#toolbox-line-gate ol{margin:0;padding:0;list-style:none;display:grid;gap:.55rem}',
        '#toolbox-line-gate li{display:flex;gap:.6rem;align-items:flex-start;font-size:.9rem;line-height:1.5}',
        '#toolbox-line-gate li > b{flex:0 0 auto;width:1.55rem;height:1.55rem;border-radius:999px;display:grid;place-items:center;font-size:.8rem;color:#fff;background:#0f766e}',
        '#toolbox-line-gate li.is-done > b{background:#06c755}',
        '#toolbox-line-gate .lg-add{display:inline-block;margin-top:.3rem;padding:.4rem .85rem;border-radius:.7rem;background:#06c755;color:#fff;font-weight:800;text-decoration:none}',
        '#toolbox-line-gate .lg-id{font-size:.78rem;color:#64748b}',
        '#toolbox-line-gate .lg-code{display:inline-block;margin-top:.3rem;padding:.3rem .8rem;border-radius:.7rem;background:#0f172a;color:#fff;font:900 1.5rem/1.2 ui-monospace,Consolas,monospace;letter-spacing:.25em}',
        '#toolbox-line-gate .lg-note{font-size:.78rem;color:#64748b}',
        '#toolbox-line-gate .lg-btns{display:flex;gap:.5rem;margin-top:1rem}',
        '#toolbox-line-gate .lg-btn{flex:1;border:0;border-radius:.9rem;padding:.7rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);cursor:pointer}',
        '#toolbox-line-gate .lg-btn:disabled{opacity:.6;cursor:wait}',
        '#toolbox-line-gate .lg-btn.is-ghost{color:#0f766e;background:#ecfdf5;border:1px solid #99f6e4}',
        '#toolbox-line-gate .lg-err{margin:.7rem 0 0;font-size:.82rem;color:#b91c1c}',
        '#toolbox-line-gate .lg-ok{text-align:center;padding:.6rem 0}',
        '#toolbox-line-gate .lg-ok div{font-size:2.4rem}',
        '#toolbox-line-gate .lg-skip{display:block;margin:.8rem auto 0;border:0;background:transparent;color:#94a3b8;font-size:.78rem;text-decoration:underline;cursor:pointer}'
      ].join('');
      document.head.appendChild(st);
    }
    return gate;
  }

  function renderLineGate(done) {
    const gate = ensureLineGate();
    gate.classList.remove('hidden');
    if (done) {
      gate.innerHTML = `<div class="lg-card"><div class="lg-ok"><div>✅</div><h2>LINE 綁定完成</h2>
        <p class="lg-sub">${lineGateEsc(done)}，之後的通知會傳到這個 LINE。</p></div>
        <div class="lg-btns"><button type="button" class="lg-btn" data-lg="close">開始使用工具箱</button></div></div>`;
      return;
    }
    const busy = lineGate.busy ? ' disabled' : '';
    const codeStep = lineGate.code
      ? `<span>在小幫手的聊天室傳送這 6 位數驗證碼：</span><br><span class="lg-code">${lineGateEsc(lineGate.code)}</span><br><span class="lg-note">10 分鐘內有效（到 ${lineGateEsc(lineGateTime(lineGate.expiresAt))}），傳出後按「我傳好了」。</span>`
      : '<span>按下方「取得驗證碼」，再到小幫手的聊天室傳送那 6 位數驗證碼。</span>';
    const sub = lineGate.forced
      ? '管理員要求你必須完成綁定後才能繼續使用'
      : '行政管理部同仁都要完成，約 1 分鐘';
    const why = lineGate.forced
      ? '後台已開啟「強制綁定 LINE」。請加入官方帳號並完成綁定後，才能繼續使用工具箱。'
      : '之後抽查結果、考試、績效與公告等通知會用 LINE 傳給你，請先加入官方帳號並完成綁定。';
    const skipBtn = lineGate.forced
      ? ''
      : '<button type="button" class="lg-skip" data-lg="skip">稍後再綁（下次進入工具箱會再提醒）</button>';
    gate.innerHTML = `<div class="lg-card">
      <div class="lg-head"><div class="lg-mark">LINE</div><div><h2>請綁定 LINE 官方帳號</h2><p class="lg-sub">${sub}</p></div></div>
      <p class="lg-why">${why}</p>
      <ol>
        <li><b>1</b><div>加入官方帳號「星鴻萬能小幫手」好友<br><a class="lg-add" href="${LINE_ADD_URL}" target="_blank" rel="noopener">＋ 加好友</a> <span class="lg-id">（電腦版可在 LINE 搜尋 ID：@522ubeym）</span></div></li>
        <li class="${lineGate.code ? 'is-done' : ''}"><b>2</b><div>${codeStep}</div></li>
      </ol>
      <div class="lg-btns">
        <button type="button" class="lg-btn${lineGate.code ? ' is-ghost' : ''}" data-lg="code"${busy}>${lineGate.code ? '重新取得驗證碼' : '取得驗證碼'}</button>
        ${lineGate.code ? `<button type="button" class="lg-btn" data-lg="check"${busy}>${lineGate.busy ? '確認中…' : '我傳好了'}</button>` : ''}
      </div>
      ${lineGate.error ? `<p class="lg-err">${lineGateEsc(lineGate.error)}</p>` : ''}
      ${skipBtn}
    </div>`;
  }

  async function lineGateAction(kind) {
    if (kind === 'close') {
      $('toolbox-line-gate')?.classList.add('hidden');
      return;
    }
    if (kind === 'skip') {
      if (lineGate.forced) return;
      try {
        sessionStorage.setItem(lineGateSkipKey(), '1');
      } catch {
        /* ignore */
      }
      $('toolbox-line-gate')?.classList.add('hidden');
      return;
    }
    if (lineGate.busy) return;
    lineGate.busy = true;
    lineGate.error = '';
    renderLineGate();
    try {
      if (kind === 'code') {
        const res = await rpc('line_bind_code', { p_token: session?.supabaseToken || '' });
        if (!res?.ok) throw new Error(res?.error || '取得驗證碼失敗');
        lineGate.code = res.code;
        lineGate.expiresAt = res.expiresAt;
      } else if (kind === 'check') {
        const info = await rpc('line_my_binding', { p_token: session?.supabaseToken || '' });
        if (info?.bound) {
          lineGate.busy = false;
          renderLineGate(`已綁定 ${info.lineName || 'LINE'}`);
          return;
        }
        lineGate.error = '還沒收到綁定，請確認已加好友，並在小幫手聊天室傳送上面的驗證碼後再按一次。';
      }
    } catch (e) {
      lineGate.error = e.message || '連線失敗，請再試一次';
    }
    lineGate.busy = false;
    renderLineGate();
  }

  async function finishAuthEntry() {
    if (needsIdentity()) {
      showIdentityGate();
      return;
    }
    if (needsTeam()) {
      showTeamGate();
      return;
    }
    unlockApp();
  }

  function updateUserBar() {
    const bar = $('toolbox-user-bar');
    const label = $('toolbox-user-label');
    if (!bar || !label) return;
    if (!session?.user) {
      bar.classList.add('hidden');
      return;
    }
    const u = session.user;
    const uname = session.supabaseUser?.username || u.username || '';
    const team = session.supabaseUser?.team || u.team || '';
    const parts = [u.name || uname || '使用者'];
    if (team) parts.push(team);
    if (uname) parts.push(maskId(uname));
    label.textContent = parts.join(' · ');
    bar.classList.remove('hidden');
  }

  function unlockApp() {
    document.body.classList.remove('toolbox-auth-pending');
    $('toolbox-auth-gate')?.classList.add('hidden');
    ready = true;
    updateUserBar();
    document.dispatchEvent(new CustomEvent('skyfun-auth-ready', { detail: { user: session.user } }));
    patchShowPage();
    logPage('home');
    void maybeLineGate();
  }

  function lockApp() {
    document.documentElement.classList.remove('toolbox-auth-cached');
    document.body.classList.add('toolbox-auth-pending');
    $('toolbox-auth-gate')?.classList.remove('hidden');
    ready = false;
    updateUserBar();
  }

  function applySupabaseSession(token, user) {
    session = {
      supabaseToken: token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role || 'business',
        status: user.status,
        team: user.team || ''
      },
      supabaseUser: user
    };
    persistSession();
  }

  async function validateSession(stored) {
    const token = stored?.supabaseToken || stored?.token;
    if (!token) return false;
    const data = await rpc('toolbox_me', { p_token: token });
    if (!data?.ok || !data.user) return false;
    applySupabaseSession(token, data.user);
    return true;
  }

  async function enter(username, password) {
    const data = await rpc('toolbox_enter', {
      p_username: username,
      p_password: password
    });
    if (!data?.ok || !data.token) throw new Error(data?.error || '無法登入');
    applySupabaseSession(data.token, data.user);
    await finishAuthEntry();
  }

  async function register(username, password, name, team) {
    const data = await rpc('toolbox_register', {
      p_username: username,
      p_password: password,
      p_name: name || '',
      p_team: team || ''
    });
    if (!data?.ok) throw new Error(data?.error || '註冊失敗');
    return data;
  }

  async function logout() {
    try {
      if (session?.supabaseToken) {
        await rpc('toolbox_logout', { p_token: session.supabaseToken });
      }
    } catch {
      /* ignore */
    }
    clearStored();
    session = null;
    ready = false;
    hideTeamGate();
    hideIdentityGate();
    Object.assign(lineGate, { checked: false, code: '', expiresAt: '', error: '' });
    $('toolbox-line-gate')?.classList.add('hidden');
    lockApp();
    setMode('login');
    setGateMessage('已登出', false);
    $('toolbox-auth-username')?.focus();
  }

  let lastUsagePage = '';
  let usageTimer = null;

  function logPage(pageName) {
    if (!ready || !session?.supabaseToken || !pageName) return;
    if (pageName === lastUsagePage) return;
    lastUsagePage = pageName;
    clearTimeout(usageTimer);
    usageTimer = setTimeout(() => {
      rpc('toolbox_usage', { p_token: session.supabaseToken, p_page: pageName }).catch(() => {});
    }, 400);
  }

  function patchShowPage() {
    if (!window.showPage || window.showPage._skyfunAuthPatched) return;
    const orig = window.showPage;
    window.showPage = function (pageName, opts) {
      logPage(pageName);
      return orig(pageName, opts);
    };
    window.showPage._skyfunAuthPatched = true;
  }

  function bindGate() {
    if (!document.getElementById('toolbox-auth-username')) {
      rebuildGateForm();
    } else {
      populateDepartmentSelect($('toolbox-auth-team'));
    }
    wireRegisterSwitch();
    setMode('login');

    $('toolbox-auth-submit')?.addEventListener('click', async () => {
      const username = $('toolbox-auth-username')?.value?.trim() || '';
      const password = $('toolbox-auth-password')?.value || '';
      const password2 = $('toolbox-auth-password2')?.value || '';
      const displayName = $('toolbox-auth-displayname')?.value?.trim() || '';
      const team = $('toolbox-auth-team')?.value?.trim() || '';

      if (!username) {
        setGateMessage('請輸入帳號', true);
        return;
      }
      if (mode === 'forgot') {
        const realname = $('toolbox-auth-realname')?.value?.trim() || '';
        if (!twIdOk(username)) {
          setGateMessage('帳號請輸入身分證字號（與公司系統相同）', true);
          return;
        }
        if (!realname) {
          setGateMessage('請輸入姓名', true);
          return;
        }
        setGateMessage('');
        setGateLoading(true);
        try {
          const data = await rpc('toolbox_reset_password', { p_username: username, p_name: realname });
          if (!data?.ok || !data.token) throw new Error(data?.error || '重設失敗');
          applySupabaseSession(data.token, data.user);
          setGateMessage(data.message || '密碼已重設，已直接登入', false);
          await finishAuthEntry();
        } catch (e) {
          setGateMessage(e.message || '重設失敗', true);
        } finally {
          setGateLoading(false);
        }
        return;
      }
      if (!password) {
        setGateMessage('請輸入密碼', true);
        return;
      }
      if (mode === 'register') {
        if (!twIdOk(username)) {
          setGateMessage('帳號請輸入身分證字號（與公司系統相同）', true);
          return;
        }
        if (normId(password) !== normId(username)) {
          setGateMessage('密碼請輸入身分證字號（與公司系統相同）', true);
          return;
        }
        if (normId(password) !== normId(password2)) {
          setGateMessage('兩次密碼不一致', true);
          return;
        }
        if (!realNameOk(displayName)) {
          setGateMessage('姓名請填本名（與身分證相同）', true);
          return;
        }
        if (!team) {
          setGateMessage('請選擇處別', true);
          return;
        }
      }

      setGateMessage('');
      setGateLoading(true);
      try {
        if (mode === 'register') {
          const data = await register(username, password, displayName, team);
          setMode('login');
          $('toolbox-auth-password').value = '';
          setGateMessage(data.message || '註冊成功，請等待核准', false);
        } else {
          await enter(username, password);
        }
      } catch (e) {
        const msg = String(e.message || '');
        if (/failed to fetch|NetworkError|Load failed/i.test(msg)) {
          setGateMessage('無法連線 Supabase，請檢查設定與網路', true);
        } else {
          setGateMessage(msg || '操作失敗', true);
        }
      } finally {
        setGateLoading(false);
      }
    });

    $('toolbox-logout')?.addEventListener('click', () => {
      logout().catch(() => {});
    });

    $('toolbox-change-pw')?.addEventListener('click', () => {
      showChangePwGate();
    });

    ['toolbox-auth-username', 'toolbox-auth-password', 'toolbox-auth-password2', 'toolbox-auth-realname'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('toolbox-auth-submit')?.click();
      });
    });
  }

  async function restoreOptimistic(stored) {
    const token = stored.supabaseToken || stored.token;
    applySupabaseSession(token, stored.supabaseUser || stored.user);
    await finishAuthEntry();
    let data;
    try {
      ensureClient();
      data = await rpc('toolbox_me', { p_token: token });
    } catch {
      return;
    }
    if (data?.ok && data.user) {
      applySupabaseSession(token, data.user);
      updateUserBar();
      if (needsIdentity()) showIdentityGate();
      else if (needsTeam()) showTeamGate();
      else if (!ready) {
        hideTeamGate();
        unlockApp();
      }
      return;
    }
    clearStored();
    session = null;
    hideTeamGate();
    hideIdentityGate();
    lockApp();
    setMode('login');
    setGateMessage(data?.error || '登入已失效，請重新登入', true);
  }

  async function restoreSession() {
    const cached = loadStored();
    const cachedUser = cached?.supabaseUser || cached?.user;
    if ((cached?.supabaseToken || cached?.token) && cachedUser?.id) {
      await restoreOptimistic(cached);
      return;
    }
    setGateLoading(true);
    setGateMessage('正在連線…', false);
    try {
      ensureClient();
      const stored = loadStored();
      if (stored?.supabaseToken || stored?.token) {
        try {
          if (await validateSession(stored)) {
            await finishAuthEntry();
            return;
          }
          clearStored();
        } catch (e) {
          clearStored();
          if (e?.message) setGateMessage(e.message, true);
          return;
        }
      }
      lockApp();
    } catch (e) {
      setGateMessage(e.message || '連線失敗', true);
      lockApp();
    } finally {
      setGateLoading(false);
      const btn = $('toolbox-auth-submit');
      if (btn) btn.disabled = false;
      const msgEl = $('toolbox-auth-msg');
      if (msgEl && !msgEl.classList.contains('is-error') && msgEl.textContent === '正在連線…') {
        setGateMessage('');
      }
    }
  }

  function init() {
    document.body.classList.add('toolbox-auth-pending', 'toolbox-pages-lite');
    try {
      sessionStorage.setItem('motivation-shown', '1');
    } catch {
      /* ignore */
    }
    document.getElementById('motivation-modal')?.classList.add('hidden');
    bindGate();

    const stored = loadStored();
    const prefill = stored?.supabaseUser?.username || stored?.user?.username || '';
    if (prefill && $('toolbox-auth-username')) {
      $('toolbox-auth-username').value = prefill;
    }

    void restoreSession();
  }

  window.skyfunAuth = {
    isReady: () => ready,
    getToken: () => {
      if (session?.supabaseToken) return session.supabaseToken;
      try {
        const s = loadStored();
        return (s && (s.supabaseToken || s.token)) || '';
      } catch {
        return '';
      }
    },
    getUser: () => session?.user || null,
    getProfile: () => null,
    rpc,
    authHeaders: () => ({ 'Content-Type': 'application/json' }),
    authFetch: async () => {
      throw new Error('GitHub Pages 靜態版不提供 API，請改用 Render 完整版');
    },
    logPage,
    patchShowPage,
    logout,
    toggleRegisterMode,
    mode: 'supabase-password-static'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
