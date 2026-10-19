/**
 * 解約怎麼辦（新人版）— 用白話說明兩條路：主動退租／欠租催收
 */
(function () {
  'use strict';

  const STEPS = {
    A: [
      {
        id: 'A1',
        title: '房客說要退租',
        when: '房客當天用口頭、LINE 或書面告訴你要解約',
        who: '你（業務／租管）',
        prep: ['截圖或錄音留存（含日期）', '確認是包租還是轉租', '問清楚預計搬走日'],
        do: [
          '跟房客確認：什麼時候搬走、鑰匙怎麼還、點交時間',
          '回報主管／行政，不要自己口頭答應扣罰或退押金額',
          '接著去做「試算 → 點交 → 押金／結案」'
        ],
        done: '已留下通知紀錄，並約好後續點交／結算時間',
        next: '共同收尾',
        tools: [
          { label: '包租／轉租解約試算', page: 'termination' },
          { label: '現場點交', page: 'termination' }
        ]
      }
    ],
    B: [
      {
        id: 'B1',
        title: '第 1 步：提醒＋打電話',
        when: '欠租後 7 天內',
        who: '你（業務／租管）',
        prep: ['虛擬帳號（匯款帳號）', '應繳金額與應繳日', '公司電話'],
        do: [
          '先用 LINE／簡訊提醒一次，附上虛擬帳號',
          '再打電話：問有沒有匯錯帳、什麼時候能繳',
          '把通話重點寫進追蹤備註（時間、對方說什麼）'
        ],
        done: '已提醒＋已電訪，並留下紀錄',
        next: '若仍未繳 → 第 2 步',
        tools: [
          { label: '訊息範本', page: 'practice-templates' },
          { label: '催收期程試算', page: 'practice-timeline' }
        ]
      },
      {
        id: 'B2',
        title: '第 2 步：去現場＋貼通知單',
        when: '欠租後約 7～14 天',
        who: '你（須先跟主管確認）',
        prep: ['家訪單／關懷通知單', '相機或手機', '案件地址'],
        do: [
          '到租屋處關懷／了解狀況（勿威脅、勿擅入）',
          '若人不在，可貼通知單並拍照存證',
          '回報主管，更新備註'
        ],
        done: '已面訪或已貼單並拍照',
        next: '若仍未繳 → 第 3 步',
        tools: [{ label: '家訪單產生器', page: 'care-visit-notice' }]
      },
      {
        id: 'B3',
        title: '第 3 步：寄存證信函',
        when: '欠租後約 14～21 天（或主管指定門檻）',
        who: '你準備文件，主管確認後寄出',
        prep: ['正確姓名、地址、欠款金額', '合約起迄日'],
        do: [
          '用工具箱產生存證信函 PDF',
          '給主管核對後，到郵局寄發',
          '保留回執／掛號單'
        ],
        done: '存證信函已寄出並留存單據',
        next: '若仍未繳 → 第 4 步',
        tools: [
          { label: '存證信函產生器', page: 'lal-generator' },
          { label: '催收期程試算', page: 'practice-timeline' }
        ]
      },
      {
        id: 'B4',
        title: '第 4 步：還款協議＋本票',
        when: '欠租後約 21～30 天，房客願意分期還',
        who: '你＋主管（金額與條件需主管同意）',
        prep: ['欠款明細', '還款協議書', '本票（若需要）'],
        do: [
          '跟主管確認可否分期、每期金額與日期',
          '簽署房租欠款還款協議書',
          '若需本票，現場依規定填寫與保管（勿自行決定）'
        ],
        done: '協議已簽妥；本票依主管指示處理',
        next: '若違約未繳 → 第 5 步；若繳清 → 結案',
        tools: [{ label: '還款協議書（表單）', page: 'business-forms' }]
      },
      {
        id: 'B5',
        title: '第 5 步：調解',
        when: '欠租約 30 天以上，雙方談不攏或需正式程序',
        who: '行政／法務主導，你協助備件',
        prep: ['調解所需文件（依流程圖）', '欠款證明'],
        do: [
          '依「欠租調解流程圖」備齊文件',
          '聲請調解、配合開會',
          '成立則依協議執行；不成立再走法律程序'
        ],
        done: '已進入調解程序或取得證明書',
        next: '必要時 → 第 6 步強制執行',
        tools: [{ label: '調解流程圖', page: 'mediation-flow' }]
      },
      {
        id: 'B6',
        title: '第 6 步：強制執行',
        when: '有執行名義（如公證載明逕受強制執行、調解書等）且主管／法務指示',
        who: '法務／主管主導，你協助資料',
        prep: ['公證書或調解書', '欠款金額', '租屋地址'],
        do: [
          '不要自己去法院亂送件；依主管指示',
          '可用聲請狀產生器協助套印（須覆核）',
          '配合查封屋內動產等程序'
        ],
        done: '已依指示提出或完成執行程序',
        next: '同時或之後進入共同收尾（試算／點交／結案）',
        tools: [
          { label: '強制執行流程（案例）', page: 'enforcement-flow' },
          { label: '聲請狀產生器', page: 'collection-case' }
        ]
      }
    ],
    C: [
      {
        id: 'C1',
        title: '試算應退／應扣金額',
        when: '確定要解約、或催收進入收尾時',
        who: '你',
        prep: ['告知解約日、實際解約日', '合約起租日', '租金／押金／欠款資料'],
        do: [
          '到催收解約專區查地址',
          '選包租或轉租解約試算（兩頁不同，勿混用）',
          '金額有疑問先問主管，不要自行承諾'
        ],
        done: '試算完成並經主管確認原則',
        next: '點交',
        tools: [{ label: '催收解約專區（查地址／試算）', page: 'termination' }]
      },
      {
        id: 'C2',
        title: '現場點交',
        when: '約好點交日當天',
        who: '你（現場）',
        prep: ['相機', '鑰匙清點清單', '設備／屋況對照'],
        do: [
          '拍照存證（入住對照、損壞處）',
          '清點鑰匙、設備',
          '損壞賠償可先用設備折舊試算，再跟主管確認'
        ],
        done: '點交完成並留下照片與紀錄',
        next: '押金／本票處理',
        tools: [
          { label: '現場點交（解約專區）', page: 'termination' },
          { label: '設備損壞賠償試算', page: 'equip-dep' }
        ]
      },
      {
        id: 'C3',
        title: '押金／本票處理',
        when: '點交後結算時',
        who: '你＋行政／財務（依案件）',
        prep: ['試算結果', '帳戶／虛擬帳號', '本票（若有）'],
        do: [
          '依試算與主管指示退押或扣抵',
          '包租／轉租退還規則不同，照系統與專區說明做',
          '有本票者依主管指示處理，勿私自銷毀'
        ],
        done: '押金與本票狀態已結清或已移交',
        next: '結案',
        tools: [{ label: '解約退還試算', page: 'termination' }]
      },
      {
        id: 'C4',
        title: '系統結案',
        when: '錢與文件都處理完',
        who: '你＋行政',
        prep: ['解約單／相關申請表', '點交與匯款證明'],
        do: [
          '完成公司系統解約／結案作業',
          '文件繳回行政',
          '案件備註寫清楚結果'
        ],
        done: '系統已結案，文件已繳',
        next: '完成',
        tools: []
      }
    ]
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toolBtns(tools) {
    if (!tools || !tools.length) return '';
    return (
      '<div class="tnf-tools">' +
      tools
        .map(function (t) {
          return (
            '<button type="button" class="tnf-tool" data-tnf-page="' +
            esc(t.page) +
            '">' +
            esc(t.label) +
            ' →</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function stepCard(step, tone) {
    const list = function (arr) {
      return '<ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    };
    return (
      '<details class="tnf-card tnf-card--' +
      tone +
      '" id="tnf-' +
      esc(step.id) +
      '">' +
      '<summary>' +
      '<span class="tnf-badge">' +
      esc(step.id) +
      '</span>' +
      '<span class="tnf-card-main">' +
      '<strong>' +
      esc(step.title) +
      '</strong>' +
      '<small>' +
      esc(step.when) +
      '</small>' +
      '</span>' +
      '<span class="tnf-chevron" aria-hidden="true">▾</span>' +
      '</summary>' +
      '<div class="tnf-body">' +
      '<p><b>誰來做：</b>' +
      esc(step.who) +
      '</p>' +
      '<p><b>先準備：</b></p>' +
      list(step.prep) +
      '<p><b>要做什麼：</b></p>' +
      list(step.do) +
      '<p><b>怎樣算完成：</b>' +
      esc(step.done) +
      '</p>' +
      '<p><b>下一步：</b>' +
      esc(step.next) +
      '</p>' +
      toolBtns(step.tools) +
      '</div></details>'
    );
  }

  function render() {
    const root = document.getElementById('termination-newbie-flow-root');
    if (!root || root.dataset.ready === '1') return;
    root.dataset.ready = '1';
    root.innerHTML =
      '<div class="tnf">' +
      '<header class="tnf-head">' +
      '<h2>解約怎麼辦？<span>（新人版）</span></h2>' +
      '<p>只要先看懂兩件事：<strong>房客自己要退</strong>，還是<strong>房客欠租</strong>。選好後，照步驟做；不確定就問主管。</p>' +
      '</header>' +
      '<section class="tnf-choose" aria-label="先選情況">' +
      '<p class="tnf-choose-title">① 先選你遇到的情況</p>' +
      '<div class="tnf-choose-grid">' +
      '<button type="button" class="tnf-pick tnf-pick--blue" data-tnf-jump="path-A">' +
      '<span class="tnf-pick-kicker">情況 A</span>' +
      '<strong>房客自己要退租</strong>' +
      '<small>沒有欠租，只是要搬走</small>' +
      '</button>' +
      '<button type="button" class="tnf-pick tnf-pick--rose" data-tnf-jump="path-B">' +
      '<span class="tnf-pick-kicker">情況 B</span>' +
      '<strong>房客欠租金</strong>' +
      '<small>要先催收，不能跳步驟</small>' +
      '</button>' +
      '</div>' +
      '<p class="tnf-choose-note">兩種情況最後都會走到下面的<strong>共同收尾</strong>。催收途中若房客把錢繳清，也可以直接結案。</p>' +
      '</section>' +
      '<section class="tnf-path" id="path-A">' +
      '<h3><span class="tnf-dot tnf-dot--blue"></span>情況 A｜房客主動退租</h3>' +
      '<ol class="tnf-mini">' +
      '<li>留下通知紀錄</li><li>試算</li><li>點交</li><li>押金</li><li>結案</li>' +
      '</ol>' +
      STEPS.A.map(function (s) { return stepCard(s, 'blue'); }).join('') +
      '</section>' +
      '<section class="tnf-path" id="path-B">' +
      '<h3><span class="tnf-dot tnf-dot--rose"></span>情況 B｜欠租催收（請照順序）</h3>' +
      '<div class="tnf-rules">' +
      '<p class="tnf-rules-title">記住這 4 句</p>' +
      '<ul>' +
      '<li><b>合法：</b>不要威脅、不要擅自進門、不要亂扣東西。</li>' +
      '<li><b>專業：</b>說明欠多少、何時該繳、帳號是什麼。</li>' +
      '<li><b>留紀錄：</b>LINE、電話、面訪都要寫時間與結果。</li>' +
      '<li><b>升級要報備：</b>存證、協議、調解、強制執行前先問主管。</li>' +
      '</ul>' +
      '<p class="tnf-rules-warn">重要：不要跳步驟。前面沒做完，不要直接做後面。</p>' +
      '</div>' +
      '<ol class="tnf-mini tnf-mini--rose">' +
      '<li>提醒＋電話</li><li>面訪貼單</li><li>存證信函</li><li>還款協議</li><li>調解</li><li>強制執行</li>' +
      '</ol>' +
      STEPS.B.map(function (s) { return stepCard(s, 'rose'); }).join('') +
      '</section>' +
      '<section class="tnf-path" id="path-C">' +
      '<h3><span class="tnf-dot tnf-dot--green"></span>共同收尾｜兩條路最後都到這裡</h3>' +
      '<ol class="tnf-mini tnf-mini--green">' +
      '<li>試算</li><li>點交</li><li>押金／本票</li><li>結案</li>' +
      '</ol>' +
      STEPS.C.map(function (s) { return stepCard(s, 'green'); }).join('') +
      '</section>' +
      '</div>';

    root.addEventListener('click', function (e) {
      const jump = e.target.closest('[data-tnf-jump]');
      if (jump) {
        const el = document.getElementById(jump.getAttribute('data-tnf-jump'));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const first = el.querySelector('details.tnf-card');
          if (first && !first.open) first.open = true;
        }
        return;
      }
      const tool = e.target.closest('[data-tnf-page]');
      if (tool && typeof window.showPage === 'function') {
        window.showPage(tool.getAttribute('data-tnf-page'));
      }
    });
  }

  function boot() {
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.TerminationNewbieFlow = { render: render };
})();
