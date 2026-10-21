/**
 * 催收解約專區首屏：六階段 SOP 卡片
 * 一進專區即可看到卡片內容與工具按鈕，直接開產生器／完整 SOP。
 */
(function () {
  'use strict';

  const CF = './docs/collection-flow/?v=20261019-9';

  const STEPS = [
    {
      n: 1,
      day: '逾期 7 日內',
      act: '提醒 + 電話催繳',
      icon: '📱',
      items: ['透過 LINE、簡訊及電話聯繫房客', '確認欠租原因及繳款時間', '完整留下催繳紀錄'],
      focus: ['記錄還款時間', '填寫當月催收紀錄'],
      when: '此階段是<strong>提醒繳款</strong>，建議逾期 <b>1～3 天內</b>就動手，越早越好。',
      how: [
        { t: 'LINE／簡訊通知', d: '用「訊息範本」傳給租客，留下催繳時間與截圖，證明已通知繳款。' },
        { t: '電話催繳', d: '問清欠租原因與<strong>確定還款日</strong>；重點是拿到承諾日期與對談內容。' },
        { t: '星鴻系統入檔', d: '到催收管理填「當月催收紀錄」（時間、對談、承諾還款日）並儲存備註。' }
      ],
      tools: [
        { label: '訊息範本產生器', kind: '開啟', page: 'practice-templates' },
        { label: '完整 SOP 第 1 階段', kind: '說明', href: CF + '#stage-1' }
      ]
    },
    {
      n: 2,
      day: '逾期 7～14 日',
      act: '面訪貼單',
      icon: '📋',
      items: ['家訪務必攜帶合約書', '未遇人：家訪通知單貼門縫', '拍照存證並留下面訪紀錄'],
      focus: ['攜帶合約書', '門縫貼家訪單'],
      when: '訊息／電話仍無結果時到現場確認。建議逾期 <b>7～14 日</b>內完成面訪或貼單。',
      how: [
        { t: '現場面訪／貼單', d: '出發帶<strong>合約書</strong>；未遇人將<strong>家訪通知單貼門縫</strong>；遇人仍要問清還款日。' },
        { t: '拍照＋LINE 告知', d: '貼單後拍照（門牌／門縫／時間可辨）並 LINE 告知，雙重留證。' },
        { t: '星鴻系統入檔', d: '填當月催收紀錄 → 催收流程 Step 2 填實地訪查日並上傳訪查照片。' }
      ],
      tools: [
        { label: '家訪單產生器', kind: '開啟', page: 'care-visit-notice' },
        { label: '完整 SOP 第 2 階段', kind: '說明', href: CF + '#stage-2' }
      ]
    },
    {
      n: 3,
      day: '逾期 14～21 日',
      act: '存證信函',
      icon: '✉️',
      items: ['產出存證信函並蓋章寄出', '追蹤回執、保留退件信封', '結果寫進催收流程'],
      focus: ['正式催告', '回執入檔'],
      when: '友善提醒無效後改書面催告。建議逾期 <b>14～21 日</b>寄出並追蹤回執；郵局留存內容與送達紀錄，後續法務才站得住。',
      how: [
        { t: '產出／蓋章寄出', d: '用存證信函產生器產出，蓋章後掛號附回執寄出（建議租屋處＋戶籍地）。' },
        { t: '追蹤回執', d: '保管回執聯；退件勿拆，連同信封留存，並以 LINE／簡訊通知＋截圖。' },
        { t: '星鴻系統入檔', d: '催收流程填「第一封存證信函寄出日」並上傳存證（連同回執聯）。' }
      ],
      tools: [
        { label: '存證信函產生器', kind: '開啟', page: 'lal-generator' },
        { label: '如何寄存證信函', kind: '說明', href: './docs/lal-howto/?v=20261017-1' },
        { label: '完整 SOP 第 3 階段', kind: '說明', href: CF + '#stage-3' }
      ]
    },
    {
      n: 4,
      day: '逾期 21～30 日',
      act: '申請調解',
      icon: '⚖️',
      items: ['備齊資料向調解會申請', '三大目的：本票／協議書／搬遷日', '結果寫進當月催收紀錄'],
      focus: ['三大目的', '結果入檔'],
      when: '自行催收無效時先走調解。三大目的：<b>① 簽立本票　② 簽署還款協議書　③ 約定搬遷日</b>。建議逾期 <b>21～30 日</b>內申請。',
      how: [
        { t: '確認管轄', d: '向<strong>被申請人住所地</strong>調解會申請（非公司所在地）。' },
        { t: '備齊並送件', d: '用調解委任書／聲請書（申請書）套版備件；線上或親送／郵寄依縣市規定。' },
        { t: '出席調解', d: '現場完成三大目的；結果寫進當月催收紀錄。不成則請領不成立證明。' }
      ],
      tools: [
        { label: '調解委任書套版', kind: '開啟', href: CF + '#stage-4-poa' },
        { label: '調解聲請書套版', kind: '開啟', href: CF + '#stage-4-petition' },
        { label: '調解流程圖', kind: '開啟', page: 'mediation-flow' },
        { label: '完整 SOP 第 4 階段', kind: '說明', href: CF + '#stage-4' }
      ]
    },
    {
      n: 5,
      day: '逾期 30 日以上',
      act: '本票裁定',
      icon: '📑',
      items: ['提交本票＋聲請狀', '戶籍謄本／民事補正狀', '核發裁定後強執或債權憑證'],
      focus: ['本票聲請', '聲請狀產生器'],
      when: '本票到期未獲付款（或調解／協議跳票）時，向法院聲請准予本票強制執行。建議逾期 <b>30 日以上</b>或跳票後盡速辦理。',
      how: [
        { t: '備件聲請', d: '本票正本＋聲請狀；必要時戶籍謄本、民事補正狀。' },
        { t: '取得裁定', d: '約 2～3 週（各法院不同）；再取得確定證明書。' },
        { t: '下一步', d: '有財產則強執；無財產可換債權憑證。' }
      ],
      tools: [
        { label: '本票裁定／聲請狀', kind: '開啟', href: CF + '#stage-5' },
        { label: '完整 SOP 第 5 階段', kind: '說明', href: CF + '#stage-5' }
      ]
    },
    {
      n: 6,
      day: '調解不成立／仍未還款',
      act: '聲請強制執行',
      icon: '🏛️',
      items: ['確認執行名義並備齊資料', '向法院聲請強制執行', '進度寫進當月催收紀錄'],
      focus: ['依法執行', '進度入檔'],
      when: '已有執行名義（公證可逕執、調解書或確定判決），對方仍不還時才進強制執行。',
      how: [
        { t: '確認執行名義', d: '確認可執行之名義與範圍；可先查財產再選標的。' },
        { t: '聲請強制執行', d: '用聲請狀產生器備件後向法院聲請；進度寫進當月催收紀錄。' },
        { t: '紅線', d: '不可自行換鎖、斷水斷電、清空物品或擅自闖入。' }
      ],
      tools: [
        { label: '強制執行聲請狀', kind: '開啟', page: 'collection-case' },
        { label: '強制執行流程', kind: '開啟', page: 'enforcement-flow' },
        { label: '完整 SOP 第 6 階段', kind: '說明', href: CF + '#stage-6' }
      ]
    }
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toolAttrs(t) {
    if (t.page) {
      return 'type="button" class="term-sop-tool" data-term-page="' + esc(t.page) + '"';
    }
    const ext = t.href.startsWith('http') || t.href.includes('/docs/') || /\.(pdf|docx|rar)(\?|$)/i.test(t.href);
    return 'class="term-sop-tool" href="' + esc(t.href) + '"'
      + (ext ? ' target="_blank" rel="noopener noreferrer"' : '')
      + (/\.(pdf|docx|rar)(\?|$)/i.test(t.href) ? ' download' : '');
  }

  function toolBtn(t) {
    if (t.page) {
      return '<button ' + toolAttrs(t) + '>' + esc(t.label) + ' →</button>';
    }
    return '<a ' + toolAttrs(t) + '>' + esc(t.label) + ' →</a>';
  }

  function toolCard(t) {
    const action = t.page
      ? '<button type="button" class="term-file-btn" data-term-page="' + esc(t.page) + '">' + esc(t.kind || '開啟') + ' →</button>'
      : '<a class="term-file-btn" href="' + esc(t.href) + '"'
        + (t.href.startsWith('http') || t.href.includes('/docs/') ? ' target="_blank" rel="noopener noreferrer"' : '')
        + '>' + esc(t.kind || '開啟') + ' →</a>';
    return '<div class="term-file-card">' +
      '<div class="term-file-name"><span class="term-file-ico" aria-hidden="true">📄</span>' + esc(t.label) + '</div>' +
      action +
      '</div>';
  }

  function cardHtml(s) {
    /* 用 div 避免卡片內再嵌套按鈕（工具列） */
    return '<div class="term-sop-card" role="button" tabindex="0" data-term-step="' + s.n + '" aria-expanded="false">' +
      '<span class="term-sop-num">' + s.n + '</span>' +
      '<span class="term-sop-day">' + esc(s.day) + '</span>' +
      '<strong class="term-sop-act">' + esc(s.act) + '</strong>' +
      '<span class="term-sop-icon" aria-hidden="true">' + s.icon + '</span>' +
      '<ul class="term-sop-items">' + s.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
      '<div class="term-sop-focus"><b>重點</b>' +
        s.focus.map((f) => '<span>' + esc(f) + '</span>').join('') +
      '</div>' +
      (s.tools?.length
        ? '<div class="term-sop-tools" data-term-tools>' + s.tools.map(toolBtn).join('') + '</div>'
        : '') +
      '<span class="term-sop-cta">點卡片看怎麼做</span>' +
    '</div>';
  }

  function detailHtml(s) {
    return '<div class="term-sop-detail-inner">' +
      '<div class="term-sop-detail-head">' +
        '<span class="term-sop-num">' + s.n + '</span>' +
        '<div><p class="term-sop-day">' + esc(s.day) + '</p><h3>' + esc(s.act) + '　·　怎麼做＋為什麼</h3></div>' +
        '<button type="button" class="term-sop-close" data-term-close aria-label="關閉">✕</button>' +
      '</div>' +
      '<p class="term-sop-when">' + s.when + '</p>' +
      '<ol class="term-sop-how">' +
        s.how.map((h) => '<li><strong>' + esc(h.t) + '</strong><span>' + h.d + '</span></li>').join('') +
      '</ol>' +
      (s.tools?.length
        ? '<div class="term-file-grid" aria-label="本階段工具">' + s.tools.map(toolCard).join('') + '</div>'
        : '') +
    '</div>';
  }

  function goPage(page) {
    if (page && typeof window.showPage === 'function') window.showPage(page);
  }

  function render() {
    const board = document.getElementById('term-sop-board');
    const detail = document.getElementById('term-sop-detail');
    if (!board) return;

    board.innerHTML = STEPS.map(cardHtml).join('');
    let open = null;

    const setOpen = (n) => {
      const step = STEPS.find((s) => s.n === n) || null;
      open = step ? n : null;
      board.querySelectorAll('.term-sop-card').forEach((btn) => {
        const on = Number(btn.getAttribute('data-term-step')) === open;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      if (!detail) return;
      if (!step) {
        detail.hidden = true;
        detail.innerHTML = '';
        return;
      }
      detail.hidden = false;
      detail.innerHTML = detailHtml(step);
    };

    const onCardActivate = (card) => {
      const n = Number(card.getAttribute('data-term-step'));
      setOpen(open === n ? null : n);
    };

    board.addEventListener('click', (e) => {
      const tool = e.target.closest('[data-term-page], a.term-sop-tool');
      if (tool && board.contains(tool)) {
        e.preventDefault();
        e.stopPropagation();
        if (tool.getAttribute('data-term-page')) {
          goPage(tool.getAttribute('data-term-page'));
        } else if (tool.href) {
          window.open(tool.href, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      const card = e.target.closest('[data-term-step]');
      if (!card || !board.contains(card)) return;
      onCardActivate(card);
    });

    board.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('[data-term-tools]')) return;
      const card = e.target.closest('[data-term-step]');
      if (!card || !board.contains(card)) return;
      e.preventDefault();
      onCardActivate(card);
    });

    detail?.addEventListener('click', (e) => {
      if (e.target.closest('[data-term-close]')) {
        setOpen(null);
        return;
      }
      const go = e.target.closest('[data-term-page]');
      if (go) goPage(go.getAttribute('data-term-page'));
    });

    document.getElementById('term-sop-open-1')?.addEventListener('click', () => setOpen(1));

    /* 一進專區就展開第 1 階段，可立刻照 SOP 開始 */
    setOpen(1);

    window.skyfunTermSopOpen = setOpen;
  }

  function boot() {
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
