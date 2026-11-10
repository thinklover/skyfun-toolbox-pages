/**
 * 辦法／獎金制度閘門
 * - 一般同仁：先看精簡版（免密碼）
 * - 完整檔預覽／下載：處長密碼（與主管獎金專區同一組）
 * - 完整預覽加浮水印
 */
(function () {
  'use strict';

  const HASH = 'a012f2d92edb3fb1d06c889c194a331ce314ac0a4b283e6eaac917c7f2ef2e12';
  const SALT = 'skyfun-manager-bonus:';
  const KEY = 'skyfun-manager-bonus-unlocked';
  const WM = '星鴻內部文件｜僅供內部參考｜禁止外流｜違者須自負法律責任';

  const INCLUDE = [
    '獎金辦法',
    '獎金制度',
    '獎懲辦法',
    '激勵方案',
    '行政管理部獎金',
    '跨區管理獎金',
    '租管師獎金',
    '租管師未申請修繕',
    '儲備處經理考核',
    '儲備處經理代管費',
    '業務區協理管理津貼',
    '營業處經理審件補貼',
    '公司部門請款流程',
    '金牌講師辦法',
    '全年度競賽辦法',
    '高專點獎金',
    '高專業務獎金'
  ];

  const EXCLUDE = [
    '複審檢核表',
    '領款收據',
    '協議書',
    'termination',
    '公證費用',
    '報名表',
    '切結書',
    '點交',
    '讓渡'
  ];

  /** 免密碼、直接浮水印預覽（業務不可下載原檔） */
  const FREE_WATERMARK = [
    '高專業務獎金制度1151031',
    '星財補獎金辦法',
    '高專點獎金辦法',
    '第9至第11業績月高專業務激勵方案',
    '第9至第11業績月',
    '婚育家庭獎金辦法展延'
  ];

  /** 精簡版：依檔名關鍵字對應（愈前面愈優先） */
  const SUMMARIES = [
    {
      test: /星財補|財補獎金/,
      title: '星財補獎金辦法｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li><strong>看錢：</strong>第 2～5 月各達 3 件 → 各 <strong>1.5 萬元</strong>；第 6～7 月各達 4 件 → 各 <strong>1.5 萬元</strong>（第 1 月 0 元）。</li>
          <li>只認<strong>純新媒合</strong>（不含一般宅、電服、爬蟲件）。</li>
          <li>須結訓考＋信任租＋報名表；一週內合約考 80 分；每日簽到。</li>
          <li>未達標經核准次月補差額件數才得領次月補助（獎金不另補發）。</li>
        </ul>
        <p class="pdg-sum-more">業務專區有完整金額表與知悉打勾。</p>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /行政管理部獎金|績效點數與獎金/,
      title: '行政管理部績效點數與獎金｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>業績月：每月 29 日至次月 28 日，點數依點數月累積。</li>
          <li>常見計點：物審／房客／預審等 1 點；複審、五期產編 2 點；包租解約 3 點。</li>
          <li>個人月獎金：未滿 250 點 $0；250～349 點 $2,000；350 點以上 $5,000。</li>
          <li>上月未達 250 點，本月達標獎金先按 80% 計；新人到職當月不列入。</li>
          <li>組長 KPI、良率與懲處扣減細節以完整檔為準。</li>
        </ul>
        <p class="pdg-sum-more">摘要亦收合於「行政績效中心」頁首。</p>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="admin-points">前往行政績效中心 →</button></p>`
    },
    {
      test: /跨區管理獎金|租管師獎金|租管師未申請修繕|獎懲辦法-租管/,
      title: '租賃管理部獎金／獎懲｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>跨區管理獎金、租管師考核暨獎金、未協助申請修繕之獎懲，頁面上已整理重點條文。</li>
          <li>一般同仁請先閱讀租管專區精簡說明；完整 Word 原檔僅限處長下載。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="rentmanager-crossarea-bonus">前往租管獎金辦法 →</button></p>`
    },
    {
      test: /營業處主管獎金|儲備處經理|業務區協理管理津貼|審件補貼|請款流程/,
      title: '主管相關辦法｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>本類文件屬主管獎金、津貼、考核或管理規範。</li>
          <li>一般業務可於此查看說明；完整條文與計算請由處長解鎖後預覽／下載。</li>
          <li>解鎖後亦可至「主管獎金專區」一次瀏覽相關檔案清單。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="manager-bonus">前往主管獎金專區 →</button></p>`
    },
    {
      test: /特定地區高專/,
      title: '特定地區高專獎金｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>適用：嘉義／彰化／南投／基隆／宜蘭營業處之該區案件。</li>
          <li><strong>看錢：</strong>新媒合媒合費 <strong>75%</strong>（先扣稅 5%）；再媒合／續約 <strong>30%</strong>。</li>
          <li>例：媒合費 13,000 → 扣 5% 後 ×75%＝<strong>9,262 元</strong>。「滿 5 件再＋5%」不適用。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /第9至第11|第 9 至第 11|激勵方案/,
      title: '高專激勵方案｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>第 9～11 業績月：單月「續轉包」件數分段計獎。</li>
          <li><strong>看錢：</strong>第 1～2 件各 <strong>1,000</strong>；第 3～4 件各 <strong>1,500</strong>；第 5 件起各 <strong>2,000</strong> 元。</li>
          <li>例：6 件＝9,000 元；10 件＝17,000 元。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /高專點獎金|點數獎金/,
      title: '高專點獎金｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li><strong>看錢：1 點＝600 元</strong>（例：直接媒合包租 5 點＝3,000 元）。</li>
          <li>直接媒合：代管 3 點／包租 5 點；續約 3 點；代管轉包租 5 點；修繕 1 點。</li>
          <li>間接／再媒合另有媒合費 30% 或 40%（詳見業務專區表）。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /高專業務獎金|高專業務獎金制度/,
      title: '高專業務獎金制度｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li><strong>媒合費：</strong>新媒合 <strong>50%</strong>（當月達 5 件每件 <strong>55%</strong>）；再媒合／續約 <strong>30%</strong>。</li>
          <li><strong>代管費基本：</strong>副理 15%／經理 20%／協理 20%；續約率 80%、包租率 55% 可各＋5%。</li>
          <li>季考核達 18P → 代管費 100%；未達 → 80%。登錄租管證次月即可領代管費。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /婚育家庭/,
      title: '婚育家庭獎金｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>營業處競賽；單月婚育案 ≥5 件才進入排名。</li>
          <li><strong>看錢：</strong>第 1 名 <strong>8,000</strong>／第 2 名 <strong>5,000</strong>／第 3 名 <strong>3,000</strong> 元。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /高專.*獎金|高專點/,
      title: '高專／激勵相關｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>高專相關獎金請至業務專區查看<strong>含金額／比例</strong>的精簡版，並打勾知悉。</li>
        </ul>
        <p><button type="button" class="pdg-btn pdg-btn--soft" data-pdg-page="business-bonus">前往業務獎金辦法 →</button></p>`
    },
    {
      test: /金牌講師|全年度競賽/,
      title: '講師／競賽辦法｜精簡版',
      html: `
        <ul class="pdg-sum-list">
          <li>本檔為公司活動或講師相關辦法完整公告。</li>
          <li>一般同仁可向主管確認報名資格與時程；完整條文請處長解鎖後預覽／下載。</li>
        </ul>`
    }
  ];

  const DEFAULT_SUMMARY = {
    title: '辦法精簡版',
    html: `
      <ul class="pdg-sum-list">
        <li>此為公司內部辦法／獎金制度相關文件。</li>
        <li><strong>一般同仁</strong>可閱讀本精簡說明；細節、比例與例外條款以完整檔為準。</li>
        <li><strong>完整檔預覽與下載</strong>僅限處長，需輸入密碼；預覽畫面含浮水印。</li>
      </ul>`
  };

  function decodePath(href) {
    try {
      const u = new URL(href, location.href);
      return decodeURIComponent(u.pathname || '');
    } catch {
      try {
        return decodeURIComponent(String(href || ''));
      } catch {
        return String(href || '');
      }
    }
  }

  function fileNameOf(href) {
    const p = decodePath(href).replace(/\\/g, '/');
    return (p.split('/').pop() || '').split('?')[0];
  }

  function isPolicyDoc(href) {
    const path = decodePath(href);
    const name = fileNameOf(href);
    if (!/\.(pdf|docx?)($|\?)/i.test(path) && !/\.(pdf|docx?)($|\?)/i.test(name)) return false;
    if (EXCLUDE.some((k) => path.includes(k) || name.includes(k))) return false;
    return INCLUDE.some((k) => path.includes(k) || name.includes(k));
  }

  function isFreeWatermark(href) {
    const blob = decodePath(href) + ' ' + fileNameOf(href);
    return FREE_WATERMARK.some((k) => blob.includes(k));
  }

  function summaryFor(href, title) {
    const blob = decodePath(href) + ' ' + fileNameOf(href) + ' ' + (title || '');
    for (const s of SUMMARIES) {
      if (s.test.test(blob)) return s;
    }
    return DEFAULT_SUMMARY;
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(KEY) === HASH;
    } catch {
      return false;
    }
  }

  function setUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(KEY, HASH);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('skyfun-policy-unlock', { detail: { unlocked: !!on } }));
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function checkPassword(raw) {
    return (await sha256(SALT + String(raw || '').trim())) === HASH;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureUi() {
    let root = document.getElementById('policy-doc-gate');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'policy-doc-gate';
    root.className = 'pdg-root';
    root.hidden = true;
    root.innerHTML = `
      <div class="pdg-backdrop" data-pdg-close></div>
      <div class="pdg-panel" role="dialog" aria-modal="true" aria-labelledby="pdg-title">
        <header class="pdg-head">
          <div>
            <h3 id="pdg-title">辦法</h3>
            <p class="pdg-sub" id="pdg-sub"></p>
          </div>
          <button type="button" class="pdg-x" data-pdg-close aria-label="關閉">×</button>
        </header>
        <nav class="pdg-tabs" aria-label="版本切換">
          <button type="button" class="pdg-tab is-on" data-pdg-tab="summary">精簡版（免密碼）</button>
          <button type="button" class="pdg-tab" data-pdg-tab="full">完整檔（需密碼）</button>
        </nav>
        <div class="pdg-summary" id="pdg-summary"></div>
        <div class="pdg-full" id="pdg-full" hidden>
          <div class="pdg-lock" id="pdg-lock">
            <p class="pdg-lock-lead">完整辦法僅限處長查閱與下載。請輸入密碼後繼續。</p>
            <form id="pdg-form" class="pdg-form" autocomplete="off">
              <label for="pdg-password">密碼</label>
              <div class="pdg-form-row">
                <input id="pdg-password" type="password" inputmode="numeric" required placeholder="請輸入密碼" />
                <button type="submit" class="pdg-btn pdg-btn--main">解鎖</button>
              </div>
              <p class="pdg-msg" id="pdg-msg" role="status" aria-live="polite"></p>
            </form>
          </div>
          <div class="pdg-view" id="pdg-view" hidden>
            <div class="pdg-toolbar">
              <button type="button" class="pdg-btn" id="pdg-download">⬇️ 下載完整檔</button>
              <button type="button" class="pdg-btn pdg-btn--soft" id="pdg-relock">🔒 重新上鎖</button>
            </div>
            <div class="pdg-stage">
              <iframe id="pdg-frame" title="辦法預覽"></iframe>
              <div id="pdg-pages" class="pdg-pages" hidden></div>
              <div class="pdg-wm" aria-hidden="true"></div>
              <p class="pdg-wm-note">預覽含浮水印；下載檔為原檔（無浮水印），請妥善保管。</p>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);

    const wm = root.querySelector('.pdg-wm');
    wm.innerHTML = `<div class="pdg-wm-grid">${Array.from({ length: 24 }, () => `<span>${WM}</span>`).join('')}</div>`;

    root.querySelectorAll('[data-pdg-close]').forEach((el) => el.addEventListener('click', close));

    root.querySelectorAll('[data-pdg-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.getAttribute('data-pdg-tab')));
    });

    root.querySelector('#pdg-summary').addEventListener('click', (e) => {
      const go = e.target.closest('[data-pdg-page]');
      if (!go) return;
      const page = go.getAttribute('data-pdg-page');
      close();
      if (typeof window.showPage === 'function') window.showPage(page);
    });

    root.querySelector('#pdg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = root.querySelector('#pdg-password');
      const msg = root.querySelector('#pdg-msg');
      msg.textContent = '';
      if (!(await checkPassword(input.value))) {
        msg.textContent = '密碼錯誤，請再試一次';
        input.select();
        return;
      }
      setUnlocked(true);
      showFullView();
    });

    root.querySelector('#pdg-download').addEventListener('click', () => {
      if (root.dataset.freeWm === '1') return;
      if (!isUnlocked()) {
        setTab('full');
        return;
      }
      const href = root.dataset.href || '';
      if (!href) return;
      const a = document.createElement('a');
      a.href = href;
      a.download = root.dataset.download || fileNameOf(href) || 'download';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    root.querySelector('#pdg-relock').addEventListener('click', () => {
      setUnlocked(false);
      showFullLock();
    });

    root.querySelector('.pdg-stage').addEventListener('contextmenu', (e) => {
      if (root.dataset.freeWm === '1') e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) close();
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's') && !root.hidden && root.dataset.freeWm === '1') {
        e.preventDefault();
      }
    });
    return root;
  }

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loadPdfJs.promise) return loadPdfJs.promise;
    loadPdfJs.promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      s.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error('預覽元件載入失敗'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('預覽元件載入失敗'));
      document.head.appendChild(s);
    });
    return loadPdfJs.promise;
  }

  async function renderProtectedPdf(host, url) {
    if (!host) return;
    host.innerHTML = '<p class="pdg-pdf-wait">全文載入中…</p>';
    host.oncontextmenu = (e) => e.preventDefault();
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ url, disableAutoFetch: false }).promise;
    host.innerHTML = '';
    const width = Math.max(320, Math.min(host.clientWidth || 860, 980));
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = 'pdg-pdf-page';
      host.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }

  function setTab(tab) {
    const root = ensureUi();
    root.querySelectorAll('.pdg-tab').forEach((b) => {
      b.classList.toggle('is-on', b.getAttribute('data-pdg-tab') === tab);
    });
    const sum = root.querySelector('#pdg-summary');
    const full = root.querySelector('#pdg-full');
    if (tab === 'summary') {
      sum.hidden = false;
      full.hidden = true;
      root.querySelector('#pdg-sub').textContent = '一般同仁可直接閱讀精簡版';
    } else {
      sum.hidden = true;
      full.hidden = false;
      if (isUnlocked()) showFullView();
      else showFullLock();
      root.querySelector('#pdg-sub').textContent = '完整檔預覽／下載需處長密碼';
    }
  }

  function showFullLock() {
    const root = ensureUi();
    root.querySelector('#pdg-lock').hidden = false;
    root.querySelector('#pdg-view').hidden = true;
    root.querySelector('#pdg-frame').removeAttribute('src');
    root.querySelector('#pdg-frame').removeAttribute('srcdoc');
    const input = root.querySelector('#pdg-password');
    input.value = '';
    root.querySelector('#pdg-msg').textContent = '';
    setTimeout(() => input.focus(), 40);
  }

  function showFullView() {
    const root = ensureUi();
    const href = root.dataset.href || '';
    const name = root.dataset.title || fileNameOf(href);
    root.querySelector('#pdg-lock').hidden = true;
    root.querySelector('#pdg-view').hidden = false;
    const frame = root.querySelector('#pdg-frame');
    const pages = root.querySelector('#pdg-pages');
    const isDoc = /\.docx?($|\?)/i.test(href) || /\.docx?$/i.test(fileNameOf(href));
    if (pages) {
      pages.hidden = true;
      pages.innerHTML = '';
    }
    frame.hidden = false;
    if (isDoc) {
      frame.removeAttribute('src');
      frame.srcdoc = `<!doctype html><html><body style="font:16px/1.6 sans-serif;padding:2rem;color:#334155">
        <p><strong>${escapeHtml(name)}</strong></p>
        <p>Word 檔無法在頁面內預覽，請按「下載完整檔」開啟。</p>
        <p style="color:#94a3b8;font-size:13px">${escapeHtml(WM)}</p>
      </body></html>`;
    } else if (root.dataset.freeWm === '1' && pages) {
      frame.removeAttribute('src');
      frame.removeAttribute('srcdoc');
      frame.hidden = true;
      pages.hidden = false;
      renderProtectedPdf(pages, href).catch(() => {
        pages.innerHTML = '<p class="pdg-pdf-wait">全文預覽失敗，請稍後再試。</p>';
      });
    } else {
      frame.removeAttribute('srcdoc');
      frame.src = href;
    }
    if (root.dataset.wantDownload === '1' && root.dataset.freeWm !== '1') {
      root.dataset.wantDownload = '';
      root.querySelector('#pdg-download').click();
    }
  }

  function paintSummary() {
    const root = ensureUi();
    const sum = summaryFor(root.dataset.href || '', root.dataset.title || '');
    const box = root.querySelector('#pdg-summary');
    box.innerHTML = `
      <div class="pdg-sum-card">
        <h4 class="pdg-sum-title">${escapeHtml(sum.title)}</h4>
        <p class="pdg-sum-lead">以下為公開精簡說明，非正式完整條文。</p>
        ${sum.html}
      </div>`;
  }

  function openFreeWatermark(href, opts) {
    const root = ensureUi();
    root.hidden = false;
    document.body.classList.add('pdg-open');
    root.dataset.href = href;
    root.dataset.title = (opts && opts.title) || fileNameOf(href);
    root.dataset.download = '';
    root.dataset.wantDownload = '';
    root.dataset.freeWm = '1';
    root.querySelector('#pdg-title').textContent = root.dataset.title || '辦法';
    root.querySelectorAll('.pdg-tab').forEach((b) => {
      b.hidden = true;
    });
    root.querySelector('#pdg-summary').hidden = true;
    root.querySelector('#pdg-full').hidden = false;
    root.querySelector('#pdg-lock').hidden = true;
    root.querySelector('#pdg-view').hidden = false;
    const dl = root.querySelector('#pdg-download');
    const relock = root.querySelector('#pdg-relock');
    if (dl) {
      dl.hidden = true;
      dl.textContent = '⬇️ 下載完整檔';
    }
    if (relock) relock.hidden = true;
    root.querySelector('#pdg-sub').textContent = '浮水印預覽｜免密碼｜僅供內部參考｜禁止外流｜不可下載';
    const note = root.querySelector('.pdg-wm-note');
    if (note) note.textContent = '預覽含浮水印｜星鴻內部文件｜禁止外流｜業務不可下載原檔';
    showFullView();
  }

  function openGate(href, opts) {
    const root = ensureUi();
    root.dataset.freeWm = '';
    root.querySelectorAll('.pdg-tab').forEach((b) => {
      b.hidden = false;
    });
    const dl = root.querySelector('#pdg-download');
    const relock = root.querySelector('#pdg-relock');
    if (dl) dl.hidden = false;
    if (relock) relock.hidden = false;
    const note = root.querySelector('.pdg-wm-note');
    if (note) note.textContent = '預覽含浮水印；下載檔為原檔（無浮水印），請妥善保管。';

    // 免密碼浮水印檔：業務只能預覽，想下載也擋下（不開原檔）
    if (isFreeWatermark(href)) {
      openFreeWatermark(href, opts);
      return;
    }

    root.hidden = false;
    document.body.classList.add('pdg-open');
    root.dataset.href = href;
    root.dataset.title = (opts && opts.title) || fileNameOf(href);
    root.dataset.download = (opts && opts.download) || fileNameOf(href);
    root.dataset.wantDownload = opts && opts.wantDownload ? '1' : '';
    root.querySelector('#pdg-title').textContent = root.dataset.title || '辦法';
    if (dl) dl.textContent = '⬇️ 下載完整檔';
    paintSummary();
    if (opts && opts.wantDownload && isUnlocked()) {
      setTab('full');
      showFullView();
    } else if (opts && opts.forceFull) {
      setTab('full');
    } else {
      setTab('summary');
    }
  }

  function close() {
    const root = document.getElementById('policy-doc-gate');
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove('pdg-open');
    const frame = root.querySelector('#pdg-frame');
    if (frame) {
      frame.removeAttribute('src');
      frame.removeAttribute('srcdoc');
    }
    const pages = root.querySelector('#pdg-pages');
    if (pages) pages.innerHTML = '';
  }

  function linkTitle(a) {
    const card = a.closest('.rounded-xl, .nb-doc-card, .af-item, .apt-bonus-fold, details');
    const bold = card && card.querySelector('.font-extrabold, .nb-doc-card-title, .af-item-name, b');
    const t = (bold && bold.textContent) || a.getAttribute('aria-label') || a.textContent || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 80) || fileNameOf(a.href);
  }

  function onClick(e) {
    const a = e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-policy-skip')) return;
    if (!isPolicyDoc(a.getAttribute('href') || a.href)) return;
    e.preventDefault();
    e.stopPropagation();
    const wantDownload = a.hasAttribute('download') || /下載/.test(a.textContent || '');
    openGate(a.href, {
      title: linkTitle(a),
      download: a.getAttribute('download') || fileNameOf(a.href),
      wantDownload,
      forceFull: wantDownload
    });
  }

  function bind() {
    document.addEventListener('click', onClick, true);
  }

  window.SkyfunPolicyDocGate = {
    isPolicyDoc,
    isFreeWatermark,
    isUnlocked,
    setUnlocked,
    checkPassword,
    open: openGate,
    openFreeWatermark,
    renderProtectedPdf,
    close,
    lock: () => {
      setUnlocked(false);
      close();
    },
    HASH,
    KEY,
    SALT,
    WM
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
