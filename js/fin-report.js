/**
 * 財務部問題回報（比照人資回報：Supabase＋LINE 通知會計）
 */
(function () {
  'use strict';

  const OFFICES = [
    '北一處', '北二處', '北三處', '北四處', '北五處', '桃一處', '宜一處', '基一處',
    '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '投一處', '嘉一處', '南一處', '南二處', '高一處', '高二處',
    '租賃管理部', '行政管理部', '電服部', '客服部', '商辦部'
  ];

  const ISSUE_PKG = '社宅包租金流相關(進件、解約或資料異動)';
  const ISSUE_PAY = '社宅租金及款項處理';
  const ISSUE_COLLECT = '社宅催收管理相關問題';
  const ISSUE_SUPP = '補件與資料查詢';
  const ISSUE_STOP = '止付通知';
  const ISSUE_GEN = '一般宅金流相關(進件、解約)';
  const ISSUE_OFFICE = '商辦部';
  const GEN_CANCEL = '解約申請';
  const GEN_KIND_SIMPLE = '單純代租';
  const GEN_KIND_MANAGE = '代租代管';

  const BIZ_CONTRACT = '新合約/續約簽約';
  const BIZ_ROOM = '會議室租借與影印費';
  const BIZ_POST = '郵資費';
  const BIZ_REFUND = '退押';
  const BIZ_ACT_BOTH = '查帳＋開立發票';
  const BIZ_ACT_CHECK = '僅查帳';
  const BIZ_ACT_INV = '僅開立發票';
  const BIZ_REFUND_INV = '退押＋開立日租金發票';
  const BIZ_REFUND_ONLY = '僅退押';
  const BIZ_INCOME_ROOM = '會議室租借';
  const BIZ_INCOME_COPY = '影印費';

  const PAY_REMIT = '租金補匯款/重匯款申請';
  const PAY_CANCEL = '取消包租/退款訂金申請';
  const PAY_CORRECT = '房東/房客匯款錯誤更正申請';
  const PAY_OVERPAY = '溢繳租金/重複付款退款申請';
  /** 不顯示交易日期、需存摺封面／原匯款明細、只能退原匯款帳號 */
  const PAY_PASSBOOK = [PAY_REMIT, PAY_CANCEL];
  /** 溢繳／重複付款：存摺封面＋原匯款明細＋匯款明細／收據 */
  const PAY_OVERPAY_DOCS = [PAY_OVERPAY];
  const PAY_ORIGIN_DOCS = [PAY_REMIT, PAY_CANCEL, PAY_OVERPAY];
  const PAY_TX_DATE = [PAY_CORRECT];

  const PKG_NEW = '新媒合申請';
  const PKG_RENEW_SUB = '續約轉包租申請';
  const PKG_RENEW_PKG = '包租續約包租申請';
  const PKG_REMATCH = '解約再媒合/到期再媒合申請';
  const PKG_REFUND = '到期或解約退押申請';
  const PKG_CHANGE = '房東或房客資料異動(異動-更換房東客)';
  const REFUND_SUBLEASE_TERM = '轉租契約解約退押申請';

  /** 各包租金流項目可選的押金類型（空陣列＝不顯示押金類型） */
  const DEPOSIT_BY_PKG = {
    [PKG_NEW]: ['兩押一租', '領款收據'],
    [PKG_RENEW_SUB]: ['兩押一租', '領款收據', '兩押(續約轉包租才可選這個)'],
    [PKG_RENEW_PKG]: [],
    [PKG_REMATCH]: ['兩押一租', '領款收據']
  };

  const PKG_INTAKE = [PKG_NEW, PKG_RENEW_SUB, PKG_RENEW_PKG, PKG_REMATCH];
  /** 需上傳包租／轉租契約書（同一欄） */
  const PKG_CONTRACT = [PKG_NEW, PKG_RENEW_SUB, PKG_RENEW_PKG, PKG_REMATCH];

  const MAX_FILES = 8;
  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const OK_EXT = IMAGE_EXT.concat(['pdf', 'doc', 'docx', 'xls', 'xlsx']);

  const DEPOSIT_FILE_LABEL = {
    '兩押一租': '兩押一租截圖上傳',
    '領款收據': '領款收據上傳',
    '兩押(續約轉包租才可選這個)': '兩押證明上傳'
  };

  const DOCS_FILE_LABEL = {
    '信任租': '信任租上傳',
    '六個月繳租證明': '六個月繳租證明上傳',
    '保證人+簽呈': '保證人＋簽呈上傳',
    '緊急連絡人+簽呈': '緊急連絡人＋簽呈上傳',
    '個案簽呈': '個案簽呈上傳'
  };

  const DOCS_WITH_SIGN = ['保證人+簽呈', '緊急連絡人+簽呈', '個案簽呈'];
  const PKG_SIGN_TO_DISTRICT = [PKG_NEW, PKG_RENEW_SUB];
  const DOCS_PATH_SIGN = '簽呈';

  function resolvePkgDocs() {
    const path = checked('fin-pkg-docs-path');
    if (!path) return '';
    if (path === DOCS_PATH_SIGN) return checked('fin-pkg-docs-sign') || '';
    return path;
  }

  /** 房東／房客異動：各原因逐項上傳（key 同時當 state.files 鍵） */
  const LL_DOC_SETS = {
    'll-inherit': [
      { key: 'llInh_contract', label: '原契約' },
      { key: 'llInh_supplement', label: '補充協議' },
      { key: 'llInh_death', label: '死亡證明' },
      { key: 'llInh_form1', label: '新房東的表單1' },
      { key: 'llInh_id', label: '新房東身分證' },
      { key: 'llInh_passbook', label: '存摺' }
    ],
    'll-sale': [
      { key: 'llSale_contract', label: '新契約書' },
      { key: 'llSale_form1', label: '新房東表單1' },
      { key: 'llSale_id', label: '新房東身分證' },
      { key: 'llSale_passbook', label: '存摺' }
    ],
    'll-rename': [
      { key: 'llRen_form1', label: '表單1' },
      { key: 'llRen_id', label: '新身分證' },
      { key: 'llRen_passbook', label: '新存摺' },
      { key: 'llRen_transcript', label: '戶籍謄本' },
      { key: 'llRen_roster', label: '戶口名簿' }
    ],
    'pb-apply': [
      { key: 'pbApply_form1', label: '表單1' },
      { key: 'pbApply_id', label: '身分證' },
      { key: 'pbApply_passbook', label: '新存摺' }
    ],
    'pb-frozen': [
      { key: 'pbFrozen_affidavit', label: '更換切結書' },
      { key: 'pbFrozen_familyId', label: '更換家人身分證' },
      { key: 'pbFrozen_familyPassbook', label: '家人存摺' }
    ],
    'tn-inherit': [
      { key: 'tnInh_contract', label: '原契約' },
      { key: 'tnInh_supplement', label: '補充協議' },
      { key: 'tnInh_death', label: '死亡證明' },
      { key: 'tnInh_form5', label: '新房客的表單5' },
      { key: 'tnInh_id', label: '新房客身分證' },
      { key: 'tnInh_passbook', label: '新房客存摺' }
    ],
    'tn-rename': [
      { key: 'tnRen_form5', label: '表單5' },
      { key: 'tnRen_id', label: '新身分證' },
      { key: 'tnRen_passbook', label: '新存摺' }
    ],
    'tn-pb-apply': [
      { key: 'tnPb_form5', label: '表單5' },
      { key: 'tnPb_id', label: '身分證' },
      { key: 'tnPb_passbook', label: '新存摺' }
    ]
  };

  const LL_DOC_KEYS = Object.values(LL_DOC_SETS).flat().map((d) => d.key);

  const MAX_ROOMMATES = 8;
  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');

  const state = {
    files: {
      sign: [], deposit: [], receivable: [], topup: [], contract: [], gap: [], refundGap: [], cancelSheet: [],
      payPassbook: [], payOrigin: [], payReceipt: [], fee: [], collect: [], stop: [], misc: [], office: [], change: [],
      supp: [], genLeaseAuth: [], genLeaseContract: [], genManageAuth: [], genCancel: []
    },
    roommateCount: 1,
    busy: false,
    llDocsBound: false,
    leaseOptions: [],
    addrOptions: [],
    addrLooking: false,
    suppOrigin: null,
    suppCandidates: [],
    suppLooking: false
  };

  LL_DOC_KEYS.forEach((k) => { state.files[k] = []; });

  function $(id) { return document.getElementById(id); }

  function token() {
    try { return window.skyfunAuth?.getToken?.() || ''; } catch (_) { return ''; }
  }

  function rpaHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) {
      h.Authorization = 'Bearer ' + t;
      h['X-Skyfun-Session'] = t;
    }
    return h;
  }

  function rocToIso(text) {
    const s = String(text || '').trim();
    const west = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (west) {
      return west[1] + '-' + west[2].padStart(2, '0') + '-' + west[3].padStart(2, '0');
    }
    const m = s.match(/(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) return '';
    let y = Number(m[1]);
    if (y < 1911) y += 1911;
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }

  function dateScore(text) {
    const iso = rocToIso(text);
    const n = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  function matchLandlord(landlords, tenant) {
    const list = Array.isArray(landlords) ? landlords : [];
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const t = dateScore(tenant && tenant.leaseStart);
    return list.slice().sort((a, b) =>
      Math.abs(dateScore(a.leaseStart) - t) - Math.abs(dateScore(b.leaseStart) - t)
    )[0];
  }

  function setLookupStatus(msg, isErr) {
    const el = $('fin-addr-lookup-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isErr ? '#b91c1c' : '';
  }

  function setOriginLookupStatus(msg, isErr) {
    const el = $('fin-origin-lookup-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isErr ? '#b91c1c' : '';
  }

  function clearSuppOrigin() {
    state.suppOrigin = null;
    state.suppCandidates = [];
    const reason = $('fin-missing-items');
    const meta = $('fin-reject-meta');
    const pickWrap = $('fin-origin-pick-wrap');
    const pick = $('fin-origin-pick');
    const serial = $('fin-origin-serial');
    if (reason) reason.value = '';
    if (meta) {
      meta.textContent = '';
      meta.hidden = true;
    }
    if (pickWrap) pickWrap.hidden = true;
    if (pick) pick.innerHTML = '<option value="">請選擇退件案件</option>';
    if (serial) serial.value = '';
  }

  function applySuppOriginFill(row) {
    if (!row) return;
    if (row.address) {
      const addr = $('fin-address');
      if (addr) addr.value = row.address;
      const originAddr = $('fin-origin-address');
      if (originAddr && !val('fin-origin-address')) originAddr.value = row.address;
    }
    if (row.landlord) {
      const ll = $('fin-landlord');
      if (ll) ll.value = row.landlord;
    }
    if (row.tenant) {
      const tn = $('fin-tenant');
      if (tn) tn.value = row.tenant;
    }
  }

  function showSuppOrigin(row) {
    state.suppOrigin = row || null;
    const reason = $('fin-missing-items');
    const meta = $('fin-reject-meta');
    const serial = $('fin-origin-serial');
    if (!state.suppOrigin) {
      if (reason) reason.value = '';
      if (meta) {
        meta.textContent = '';
        meta.hidden = true;
      }
      if (serial) serial.value = '';
      return;
    }
    if (serial) serial.value = String(state.suppOrigin.id || '');
    if (reason) reason.value = state.suppOrigin.rejectReason || '（無退件原因文字）';
    if (meta) {
      const bits = [];
      bits.push('原單 #' + state.suppOrigin.id);
      if (state.suppOrigin.issueType) bits.push('原類型：' + state.suppOrigin.issueType);
      if (state.suppOrigin.rejectedAt) {
        try {
          bits.push('退件時間：' + new Date(state.suppOrigin.rejectedAt).toLocaleString('zh-TW', { hour12: false }));
        } catch (_) {
          bits.push('退件時間：' + state.suppOrigin.rejectedAt);
        }
      }
      meta.textContent = bits.join('｜');
      meta.hidden = false;
    }
    applySuppOriginFill(state.suppOrigin);
  }

  function renderSuppCandidates(rows) {
    const list = Array.isArray(rows) ? rows : [];
    state.suppCandidates = list;
    const pickWrap = $('fin-origin-pick-wrap');
    const pick = $('fin-origin-pick');
    if (!pickWrap || !pick) return;
    if (!list.length) {
      pickWrap.hidden = true;
      pick.innerHTML = '<option value="">請選擇退件案件</option>';
      return;
    }
    pick.innerHTML = '<option value="">請選擇退件案件（' + list.length + ' 筆）</option>' + list.map((r) => {
      const when = r.rejectedAt
        ? (() => { try { return new Date(r.rejectedAt).toLocaleDateString('zh-TW'); } catch (_) { return ''; } })()
        : '';
      const label = '#' + r.id + '｜' + (r.issueType || '回報') +
        (r.address ? '｜' + r.address : '') +
        (when ? '｜退件 ' + when : '');
      return '<option value="' + esc(String(r.id)) + '">' + esc(label) + '</option>';
    }).join('');
    pickWrap.hidden = list.length <= 1;
    if (list.length === 1) {
      pick.value = String(list[0].id);
      showSuppOrigin(list[0]);
    }
  }

  function selectSuppCandidate(id) {
    const row = state.suppCandidates.find((r) => String(r.id) === String(id));
    if (!row) {
      showSuppOrigin(null);
      setOriginLookupStatus('請選擇退件案件', true);
      return;
    }
    showSuppOrigin(row);
    setOriginLookupStatus('已確認財務退件，可上傳補件附件後送出');
  }

  async function lookupRejectedOrigin() {
    if (state.suppLooking) return;
    if (!token()) {
      setOriginLookupStatus('請先登入工具箱', true);
      return;
    }
    const addr = val('fin-origin-address');
    if (addr.length < 2) {
      clearSuppOrigin();
      setOriginLookupStatus('請輸入物件地址（至少 2 字）', true);
      return;
    }
    state.suppLooking = true;
    clearSuppOrigin();
    setOriginLookupStatus('查詢中…');
    try {
      const data = await rpc('fin_report_lookup_rejected', {
        p_token: token(),
        p_address: addr
      });
      if (!data || data.ok === false) {
        clearSuppOrigin();
        setOriginLookupStatus((data && data.error) || '查詢失敗', true);
        return;
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) {
        clearSuppOrigin();
        setOriginLookupStatus('找不到此地址的財務退件案件', true);
        return;
      }
      renderSuppCandidates(rows);
      if (rows.length === 1) {
        setOriginLookupStatus('已確認財務退件，可上傳補件附件後送出');
      } else {
        setOriginLookupStatus('找到 ' + rows.length + ' 筆退件，請選擇案件');
      }
    } catch (e) {
      clearSuppOrigin();
      setOriginLookupStatus(e.message || String(e), true);
    } finally {
      state.suppLooking = false;
    }
  }

  const CITY_ORDER = [
    '基隆市', '台北市', '新北市', '宜蘭縣', '桃園市', '新竹市', '新竹縣', '苗栗縣',
    '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市',
    '屏東縣', '台東縣', '花蓮縣', '澎湖縣', '金門縣', '連江縣'
  ];

  function cityOfAddress(address) {
    const s = String(address || '').normalize('NFKC').replace(/臺/g, '台').replace(/\s+/g, '');
    const m = s.match(/^(.{2,3}[縣市])/);
    return m ? m[1] : '其他';
  }

  function setAddrPickOpen(open) {
    const toggle = $('fin-addr-pick-toggle');
    const panel = $('fin-addr-pick-panel');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.hidden = !open;
  }

  function setAddrPickLabel(text) {
    const toggle = $('fin-addr-pick-toggle');
    if (toggle) toggle.textContent = text || '請選擇地址';
  }

  function clearAddrPick() {
    state.addrOptions = [];
    state.selectedAddrIdx = -1;
    const wrap = $('fin-addr-pick-wrap');
    const panel = $('fin-addr-pick-panel');
    if (wrap) wrap.hidden = true;
    if (panel) panel.innerHTML = '';
    setAddrPickLabel('請選擇地址');
    setAddrPickOpen(false);
  }

  function clearLeasePick() {
    state.leaseOptions = [];
    const wrap = $('fin-lease-pick-wrap');
    const sel = $('fin-lease-pick');
    if (wrap) wrap.hidden = true;
    if (sel) sel.innerHTML = '<option value="">請先選擇地址（查不到可略過，改人工填）</option>';
  }

  function renderAddrPick(addresses) {
    const wrap = $('fin-addr-pick-wrap');
    const panel = $('fin-addr-pick-panel');
    if (!wrap || !panel) return;
    state.addrOptions = Array.isArray(addresses) ? addresses : [];
    state.selectedAddrIdx = -1;
    if (!state.addrOptions.length) {
      wrap.hidden = true;
      panel.innerHTML = '';
      setAddrPickOpen(false);
      return;
    }
    const groups = new Map();
    state.addrOptions.forEach((a, i) => {
      const city = cityOfAddress(a.address);
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city).push({ row: a, idx: i });
    });
    const cities = [...groups.keys()].sort((a, b) => {
      const ia = CITY_ORDER.indexOf(a);
      const ib = CITY_ORDER.indexOf(b);
      if (ia < 0 && ib < 0) return a.localeCompare(b, 'zh-Hant');
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    panel.innerHTML = cities.map((city) => {
      const items = groups.get(city) || [];
      return (
        '<section class="fin-addr-city">' +
        '<h4 class="fin-addr-city-head">' + esc(city) + '（' + items.length + '）</h4>' +
        '<div class="fin-addr-city-list">' +
        items.map(({ row, idx }) => {
          const count = row.count > 1
            ? (' <span class="fin-addr-pick-count">（' + row.count + ' 筆）</span>')
            : '';
          return (
            '<button type="button" class="fin-addr-pick-item" data-fin-addr-idx="' + idx + '">' +
            esc(row.address) + count +
            '</button>'
          );
        }).join('') +
        '</div></section>'
      );
    }).join('');
    if (hideCompanyAddrFields()) {
      wrap.hidden = true;
      setAddrPickOpen(false);
      return;
    }
    wrap.hidden = false;
    setAddrPickLabel('請選擇地址（共 ' + state.addrOptions.length + ' 筆，已分縣市）');
    setAddrPickOpen(true);
  }

  function selectAddrOption(idx) {
    const row = state.addrOptions[idx];
    if (!row?.address) return;
    state.selectedAddrIdx = idx;
    const addrEl = $('fin-address');
    if (addrEl) addrEl.value = row.address;
    setAddrPickLabel(row.address);
    setAddrPickOpen(false);
    document.querySelectorAll('#page-finance .fin-addr-pick-item').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.getAttribute('data-fin-addr-idx')) === idx);
    });
    void loadLeasesForAddress(row.address).catch((ex) => {
      clearLeasePick();
      setLookupStatus(ex.message || String(ex), true);
    });
  }

  function isDisabledLease(row) {
    const st = String(row?.applyStatus || row?.status || '').replace(/\s+/g, ' ').trim();
    if (!st) return false;
    if (/已停用|^停用$|系統停用/.test(st)) return true;
    if (Number(row?.applyStatus) === 15) return true;
    return false;
  }

  function buildLeaseOptions(data) {
    const landlords = (Array.isArray(data?.landlords) ? data.landlords : []).filter((r) => !isDisabledLease(r));
    const tenants = (Array.isArray(data?.tenants) ? data.tenants : []).filter((r) => !isDisabledLease(r));
    const options = [];
    if (tenants.length) {
      tenants.forEach((tn, i) => {
        const ll = matchLandlord(landlords, tn);
        const label = [
          tn.leaseStart ? ('轉租起租 ' + tn.leaseStart) : '',
          tn.leaseEnd ? ('～' + tn.leaseEnd) : '',
          tn.name ? ('房客 ' + tn.name) : '',
          ll?.name ? ('房東 ' + ll.name) : '',
          tn.matchNo || ''
        ].filter(Boolean).join('｜');
        options.push({
          id: 'tn-' + i,
          label: label || ('轉租案件 ' + (i + 1)),
          landlord: ll || null,
          tenant: tn
        });
      });
    } else {
      landlords.forEach((ll, i) => {
        const label = [
          ll.leaseStart ? ('包租起租 ' + ll.leaseStart) : '',
          ll.leaseEnd ? ('～' + ll.leaseEnd) : '',
          ll.name ? ('房東 ' + ll.name) : '',
          ll.matchNo || ''
        ].filter(Boolean).join('｜');
        options.push({
          id: 'll-' + i,
          label: label || ('包租案件 ' + (i + 1)),
          landlord: ll,
          tenant: null
        });
      });
    }
    return options;
  }

  function renderLeasePick(options) {
    const wrap = $('fin-lease-pick-wrap');
    const sel = $('fin-lease-pick');
    if (!wrap || !sel) return;
    state.leaseOptions = options || [];
    if (!state.leaseOptions.length || hideCompanyAddrFields()) {
      wrap.hidden = true;
      if (!state.leaseOptions.length) {
        sel.innerHTML = '<option value="">查無租期</option>';
      }
      return;
    }
    sel.innerHTML = '<option value="">請選擇租期</option>' + state.leaseOptions.map((o) =>
      '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'
    ).join('');
    wrap.hidden = false;
  }

  function applyLeaseOption(opt) {
    if (!opt) return;
    const ll = opt.landlord;
    const tn = opt.tenant;
    if (ll?.name) {
      const el = $('fin-landlord');
      if (el) el.value = ll.name;
    }
    if (tn?.name) {
      const el = $('fin-tenant');
      if (el) el.value = tn.name;
    }
    const baoStart = $('fin-bao-lease-start');
    const baoEnd = $('fin-bao-lease-end');
    const zhStart = $('fin-zhuan-lease-start');
    const zhEnd = $('fin-zhuan-lease-end');
    if (baoStart) baoStart.value = rocToIso(ll?.leaseStart || '') || '';
    if (baoEnd) baoEnd.value = rocToIso(ll?.leaseEnd || '') || '';
    if (zhStart) zhStart.value = rocToIso(tn?.leaseStart || '') || '';
    if (zhEnd) zhEnd.value = rocToIso(tn?.leaseEnd || '') || '';
    if (ll?.address) {
      const addr = $('fin-address');
      if (addr && ll.address) addr.value = ll.address;
    } else if (tn?.address) {
      const addr = $('fin-address');
      if (addr && tn.address) addr.value = tn.address;
    }
  }

  async function loadLeasesForAddress(address) {
    const addr = String(address || '').trim();
    if (!addr) return;
    clearLeasePick();
    setLookupStatus('載入租期中…');
    const q = new URLSearchParams({ address: addr, kind: 'both' });
    const r = await fetch(RPA_BASE + '/termination/candidates?' + q.toString(), {
      headers: rpaHeaders(),
      cache: 'no-store'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.message || data.error || '租期查詢失敗（HTTP ' + r.status + '）');
    }
    const options = buildLeaseOptions(data);
    if (!options.length) {
      clearLeasePick();
      setLookupStatus('此地址查無有效租期，請改以人工填寫。', true);
      return;
    }
    renderLeasePick(options);
    setLookupStatus(data.message || ('找到 ' + options.length + ' 筆租期，請選擇'));
    if (options.length === 1) {
      const sel = $('fin-lease-pick');
      if (sel) sel.value = options[0].id;
      applyLeaseOption(options[0]);
      setLookupStatus('已自動帶入唯一租期與房東客姓名');
    }
  }

  async function lookupCompanyByAddress() {
    if (state.addrLooking) return;
    const address = val('fin-address');
    if (!address) {
      setLookupStatus('請先輸入物件地址或路名', true);
      return;
    }
    if (!token()) {
      setLookupStatus('請先登入工具箱再查公司資料', true);
      return;
    }
    state.addrLooking = true;
    const btn = $('fin-addr-lookup');
    if (btn) btn.disabled = true;
    setLookupStatus('查詢相符地址中…');
    clearAddrPick();
    clearLeasePick();
    try {
      const q = new URLSearchParams({ q: address });
      const r = await fetch(RPA_BASE + '/termination/address-search?' + q.toString(), {
        headers: rpaHeaders(),
        cache: 'no-store'
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        throw new Error(data.message || data.error || '地址查詢失敗（HTTP ' + r.status + '）');
      }
      const addresses = Array.isArray(data.addresses) ? data.addresses : [];
      if (!addresses.length) {
        setLookupStatus('查無相符地址，請確認關鍵字，或改以人工填寫。', true);
        return;
      }
      renderAddrPick(addresses);
      setLookupStatus(data.message || ('找到 ' + addresses.length + ' 筆地址，請向下展開選擇'));
      if (addresses.length === 1) {
        selectAddrOption(0);
      }
    } catch (ex) {
      clearAddrPick();
      clearLeasePick();
      const msg = ex.message || String(ex);
      setLookupStatus(/查無|失敗|錯誤/.test(msg)
        ? (msg.replace(/。?$/, '') + (/人工/.test(msg) ? '' : '。查不到時請人工填寫。'))
        : msg, true);
    } finally {
      state.addrLooking = false;
      if (btn) btn.disabled = false;
    }
  }

  function sessionUser() {
    try { return window.skyfunAuth?.getUser?.() || {}; } catch (_) { return {}; }
  }

  function sbClient() {
    const c = window.SKYFUN_SUPABASE || {};
    if (!window.supabase || !c.url || !(c.anonKey || c.anon_key)) return null;
    return window.supabase.createClient(c.url, c.anonKey || c.anon_key);
  }

  async function rpc(name, args) {
    if (!window.skyfunAuth?.rpc) throw new Error('請先登入工具箱');
    return window.skyfunAuth.rpc(name, args);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fileExt(name, type) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m && OK_EXT.includes(m[1])) return m[1];
    if (/pdf/.test(type || '')) return 'pdf';
    if (/jpeg/.test(type || '')) return 'jpg';
    if (/png/.test(type || '')) return 'png';
    if (/gif/.test(type || '')) return 'gif';
    if (/webp/.test(type || '')) return 'webp';
    return '';
  }

  function isImageExt(ext) { return IMAGE_EXT.includes(String(ext || '').toLowerCase()); }

  function setMsg(text, kind) {
    const el = $('fin-form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'hr-msg' + (kind ? ' is-' + kind : '');
  }

  function officeOptionsHtml(selected) {
    const sel = String(selected || '');
    return '<option value="">請選擇</option>' +
      OFFICES.map((o) => `<option value="${esc(o)}"${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('') +
      '<option value="其他"' + (sel === '其他' ? ' selected' : '') + '>其他</option>';
  }

  function fillOffice() {
    const el = $('fin-office');
    if (!el) return;
    if (!el.options.length) el.innerHTML = officeOptionsHtml('');
    const u = sessionUser();
    const name = String(u.name || u.displayName || '').trim();
    const team = String(u.team || '').trim();
    if (name && $('fin-full-name') && !$('fin-full-name').value) $('fin-full-name').value = name;
    if (team && !el.value) {
      if (OFFICES.includes(team)) el.value = team;
      else {
        el.value = '其他';
        if ($('fin-office-other')) $('fin-office-other').value = team;
      }
    }
    syncOther();
  }

  function syncOther() {
    const wrap = $('fin-office-other-wrap');
    if (wrap) wrap.hidden = ($('fin-office')?.value || '') !== '其他';
  }

  function checked(name) {
    return document.querySelector('#page-finance input[name="' + name + '"]:checked')?.value || '';
  }

  function val(id) { return ($(id)?.value || '').trim(); }

  function syncDepositOptions(pkgItem) {
    const allowed = DEPOSIT_BY_PKG[pkgItem] || null;
    document.querySelectorAll('#page-finance [data-fin-deposit]').forEach((lab) => {
      const key = lab.getAttribute('data-fin-deposit');
      const show = Array.isArray(allowed) && allowed.includes(key);
      lab.hidden = !show;
      if (!show) {
        const input = lab.querySelector('input[type="radio"]');
        if (input?.checked) input.checked = false;
      }
    });
  }

  function clearFields(root) {
    if (!root) return;
    root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      if (el.checked) el.checked = false;
    });
    root.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), select, textarea').forEach((el) => {
      if (el.value) el.value = '';
    });
  }

  function placeExpandedBlocks() {
    const sharedHold = $('fin-shared-hold');
    const shared = $('fin-shared-block');
    const footerHold = $('fin-footer-hold');
    const footer = $('fin-footer-block');
    const openCard = document.querySelector('#page-finance .fin-issue-card.is-open');
    const openBody = openCard && openCard.querySelector('.fin-issue-body');
    if (!shared || !footer) return;
    if (openBody) {
      // 標題下方：先共用欄位，再本卡題目，最後送出區；內容只往下長
      if (shared.parentNode !== openBody || openBody.firstChild !== shared) {
        openBody.insertBefore(shared, openBody.firstChild);
      }
      if (footer.parentNode !== openBody || openBody.lastChild !== footer) {
        openBody.appendChild(footer);
      }
    } else {
      if (sharedHold) sharedHold.appendChild(shared);
      if (footerHold) footerHold.appendChild(footer);
    }
  }

  /** 展開後讓標題留在點擊時的畫面位置，內容往下長（不要整頁往上跳） */
  function keepHeadStable(head, anchorTop) {
    if (!head || !Number.isFinite(anchorTop)) return;
    const adjust = () => {
      const now = head.getBoundingClientRect().top;
      const delta = now - anchorTop;
      if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    };
    requestAnimationFrame(() => {
      adjust();
      requestAnimationFrame(adjust);
    });
  }

  function syncPanels() {
    const issue = checked('fin-issue');
    const pkgItem = checked('fin-pkg-item');
    const payItem = checked('fin-pay-item');
    const collectItem = checked('fin-collect-item');
    const suppItem = checked('fin-supp-item');
    const genItem = checked('fin-gen-item');
    const officeItem = checked('fin-biz-item');
    const bizAction = checked('fin-biz-action');
    const bizRoomAction = checked('fin-biz-room-action');
    const bizRefundAction = checked('fin-biz-refund-action');
    const bizIncome = checked('fin-biz-income');
    const signedDone = checked('fin-signed-done');
    const renewTopup = checked('fin-renew-topup');
    const renewGap = checked('fin-gap');
    const refundGap = checked('fin-refund-gap');
    const feeChange = checked('fin-fee-change');
    const rematch = checked('fin-rematch-type');
    const refund = checked('fin-refund-type');
    const changeTarget = checked('fin-change-target');
    const landlordReason = checked('fin-landlord-reason');
    const tenantReason = checked('fin-tenant-reason');
    const genKind = checked('fin-gen-kind');

    const depositType = checked('fin-deposit-type');
    const docsPath = checked('fin-pkg-docs-path');
    const pkgDocs = resolvePkgDocs();
    const hasRoommate = checked('fin-has-roommate');
    const receivableChecked = Array.from(document.querySelectorAll('#page-finance input[name="fin-receivable"]:checked')).map((x) => x.value);
    const showIntake = issue === ISSUE_PKG && PKG_INTAKE.includes(pkgItem);
    const showContract = issue === ISSUE_PKG && PKG_CONTRACT.includes(pkgItem);
    const showDeposit = showIntake && Array.isArray(DEPOSIT_BY_PKG[pkgItem]) && DEPOSIT_BY_PKG[pkgItem].length > 0;
    const showDocs = showIntake && pkgItem !== PKG_RENEW_PKG;
    const showTopup = issue === ISSUE_PKG && pkgItem === PKG_RENEW_PKG;
    const showTopupAmt = showTopup && renewTopup === '是';
    const showDepositFile = showDeposit && !!depositType;
    const showSignPick = showDocs && docsPath === DOCS_PATH_SIGN;
    const showDocsFile = showDocs && !!pkgDocs;
    const showReceivableOther = showIntake && receivableChecked.includes('其他');
    const showRoommateYes = issue === ISSUE_PKG && pkgItem === PKG_REMATCH && hasRoommate === '有';

    syncDepositOptions(pkgItem);
    syncUploadLabels(depositType, pkgDocs, pkgItem);

    document.querySelectorAll('#page-finance [data-fin-panel]').forEach((el) => {
      const keys = String(el.getAttribute('data-fin-panel') || '').split('|');
      el.classList.toggle('is-open', keys.includes(issue));
    });
    document.querySelectorAll('#page-finance [data-fin-card]').forEach((el) => {
      const open = !!issue && el.getAttribute('data-fin-card') === issue;
      el.classList.toggle('is-open', open);
      const go = el.querySelector('.fin-issue-go');
      if (go) go.textContent = open ? '收合' : '進入';
      const head = el.querySelector('.fin-issue-head');
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('#page-finance [data-fin-when]').forEach((el) => {
      const rule = String(el.getAttribute('data-fin-when') || '');
      let ok = false;
      if (rule.startsWith('pkg:')) ok = issue === ISSUE_PKG && pkgItem === rule.slice(4);
      else if (rule.startsWith('pay:')) ok = issue === ISSUE_PAY && payItem === rule.slice(4);
      else if (rule === 'pay-tx-date') ok = issue === ISSUE_PAY && PAY_TX_DATE.includes(payItem);
      else if (rule === 'pay-passbook') ok = issue === ISSUE_PAY && PAY_PASSBOOK.includes(payItem);
      else if (rule === 'pay-overpay') ok = issue === ISSUE_PAY && PAY_OVERPAY_DOCS.includes(payItem);
      else if (rule.startsWith('collect:')) ok = issue === ISSUE_COLLECT && collectItem === rule.slice(8);
      else if (rule === 'issue-supp') ok = issue === ISSUE_SUPP;
      else if (rule.startsWith('supp:')) ok = issue === ISSUE_SUPP && suppItem === rule.slice(5);
      else if (rule.startsWith('gen:')) ok = issue === ISSUE_GEN && genItem === rule.slice(4);
      else if (rule.startsWith('biz:')) ok = issue === ISSUE_OFFICE && officeItem === rule.slice(4);
      else if (rule === 'pkg-lease') ok = issue === ISSUE_PKG;
      else if (rule === 'pkg-contract') ok = showContract;
      else if (rule === 'pkg-intake') ok = showIntake;
      else if (rule === 'pkg-deposit') ok = showDeposit;
      else if (rule === 'pkg-docs') ok = showDocs;
      else if (rule === 'docs-sign-pick') ok = showSignPick;
      else if (rule === 'docs-sign-district') {
        ok = showSignPick && PKG_SIGN_TO_DISTRICT.includes(pkgItem);
      }
      else if (rule === 'deposit-file') ok = showDepositFile;
      else if (rule === 'docs-file') ok = showDocsFile;
      else if (rule === 'receivable-other') ok = showReceivableOther;
      else if (rule === 'roommate-yes') ok = showRoommateYes;
      else if (rule === 'deposit-topup') ok = showTopup;
      else if (rule === 'topup-yes') ok = showTopupAmt;
      else if (rule === 'gap-yes') ok = renewGap === '是';
      else if (rule === 'refund-sublease-term') {
        ok = issue === ISSUE_PKG && pkgItem === PKG_REFUND && refund === REFUND_SUBLEASE_TERM;
      }
      else if (rule === 'refund-gap-yes') {
        ok = issue === ISSUE_PKG && pkgItem === PKG_REFUND && refund === REFUND_SUBLEASE_TERM && refundGap === '有';
      }
      else if (rule === 'refund-gap-no') {
        ok = issue === ISSUE_PKG && pkgItem === PKG_REFUND && refund === REFUND_SUBLEASE_TERM && refundGap === '無';
      }
      else if (rule === 'fee-change') ok = feeChange === '改變費用';
      else if (rule === 'rematch-people') ok = !!rematch;
      else if (rule === 'refund-info') ok = !!refund || pkgItem === PKG_REFUND;
      else if (rule === 'change-landlord') ok = changeTarget === '包租契約-房東';
      else if (rule === 'change-tenant') ok = changeTarget === '轉租契約-房客';
      else if (rule === 'change-party-names') {
        ok = (changeTarget === '包租契約-房東' && (
          landlordReason === '房東-繼承(房東死亡)' ||
          landlordReason === '房東-買賣' ||
          landlordReason === '房東-更名'
        )) || (changeTarget === '轉租契約-房客' && (
          tenantReason === '房客-繼承(房客死亡)' ||
          tenantReason === '房客-更名'
        ));
      }
      else if (rule === 'll-inherit') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-繼承(房東死亡)';
      else if (rule === 'll-sale') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-買賣';
      else if (rule === 'll-rename') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-更名';
      else if (rule === 'll-passbook-pick') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-更換存摺';
      else if (rule === 'pb-apply') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-更換存摺' && checked('fin-passbook-why') === '社宅如有申請異動';
      else if (rule === 'pb-frozen') ok = changeTarget === '包租契約-房東' && landlordReason === '房東-更換存摺' && checked('fin-passbook-why') === '因帳戶被凍結';
      else if (rule === 'tn-inherit') ok = changeTarget === '轉租契約-房客' && tenantReason === '房客-繼承(房客死亡)';
      else if (rule === 'tn-rename') ok = changeTarget === '轉租契約-房客' && tenantReason === '房客-更名';
      else if (rule === 'tn-passbook-pick') ok = changeTarget === '轉租契約-房客' && tenantReason === '房客-更換存摺';
      else if (rule === 'tn-pb-apply') {
        ok = changeTarget === '轉租契約-房客' && tenantReason === '房客-更換存摺' &&
          checked('fin-tenant-passbook-why') === '社宅如有申請異動';
      }
      else if (rule === 'passbook') {
        ok = (changeTarget === '包租契約-房東' && landlordReason === '房東-更換存摺') ||
          (changeTarget === '轉租契約-房客' && tenantReason === '房客-更換存摺');
      } else if (rule === 'gen-intake') {
        ok = issue === ISSUE_GEN && !!genItem && genItem !== GEN_CANCEL;
      } else if (rule === 'gen-lease-docs') {
        ok = issue === ISSUE_GEN && !!genItem && genItem !== GEN_CANCEL &&
          (genKind === GEN_KIND_SIMPLE || genKind === GEN_KIND_MANAGE);
      } else if (rule === 'gen-manage-doc') {
        ok = issue === ISSUE_GEN && !!genItem && genItem !== GEN_CANCEL && genKind === GEN_KIND_MANAGE;
      } else if (rule === 'gen-manage') {
        ok = issue === ISSUE_GEN && !!genItem && genItem !== GEN_CANCEL && genKind === GEN_KIND_MANAGE;
      }
      else if (rule === 'biz-contract') ok = officeItem === BIZ_CONTRACT;
      else if (rule === 'biz-room') ok = officeItem === BIZ_ROOM;
      else if (rule === 'biz-refund') ok = officeItem === BIZ_REFUND;
      else if (rule === 'biz-postage') ok = officeItem === BIZ_POST;
      else if (rule.startsWith('biz-')) {
        const isBiz = issue === ISSUE_OFFICE;
        const isA = isBiz && officeItem === BIZ_CONTRACT;
        const isB = isBiz && officeItem === BIZ_ROOM;
        const isC = isBiz && officeItem === BIZ_POST;
        const isD = isBiz && officeItem === BIZ_REFUND;
        const aBoth = isA && bizAction === BIZ_ACT_BOTH;
        const aCheck = isA && bizAction === BIZ_ACT_CHECK;
        const aInv = isA && bizAction === BIZ_ACT_INV;
        const bBoth = isB && bizRoomAction === BIZ_ACT_BOTH;
        const bCheck = isB && bizRoomAction === BIZ_ACT_CHECK;
        const bInv = isB && bizRoomAction === BIZ_ACT_INV;
        const dInv = isD && bizRefundAction === BIZ_REFUND_INV;
        const dOnly = isD && bizRefundAction === BIZ_REFUND_ONLY;
        const signedYes = signedDone === '是';
        const signedNo = signedDone === '否';
        const aCheckPath = aCheck || (aBoth && signedNo);
        const aBothYes = aBoth && signedYes;
        const aInvYes = aInv && signedYes;
        const roomReady = isB && !!bizIncome;
        const roomCheck = roomReady && (bBoth || bCheck);
        const roomInv = roomReady && (bBoth || bInv);
        if (rule === 'biz-signed') ok = aBoth || aInv;
        else if (rule === 'biz-signed-to-check') ok = aBoth && signedNo;
        else if (rule === 'biz-signed-block') ok = aInv && signedNo;
        else if (rule === 'biz-check') {
          ok = isC || aCheckPath || aBothYes || roomCheck;
        } else if (rule === 'biz-check-simple') {
          ok = isC || aCheckPath || aBothYes || (roomCheck && bizIncome === BIZ_INCOME_COPY);
        } else if (rule === 'biz-check-room') {
          ok = roomCheck && bizIncome === BIZ_INCOME_ROOM;
        } else if (rule === 'biz-contract-info') {
          ok = aCheckPath || aBothYes;
        } else if (rule === 'biz-invoice') {
          ok = aBothYes || aInvYes || roomInv || dInv;
        } else if (rule === 'biz-invoice-item') {
          ok = dInv;
        } else if (rule === 'biz-invoice-client') {
          ok = roomInv;
        } else if (rule === 'biz-refund-info') {
          ok = dInv || dOnly;
        }
      }
      const wasOpen = el.classList.contains('is-open');
      el.classList.toggle('is-open', !!ok);
      if (wasOpen && !ok && (rule === 'pkg-intake' || rule === 'pkg-deposit' || rule === 'pkg-docs' || rule === 'docs-sign-pick' || rule === 'deposit-topup' || rule === 'topup-yes' || rule === 'receivable-other' || rule === 'pkg-contract')) {
        clearFields(el);
        if (rule === 'topup-yes') {
          state.files.topup = [];
          renderFiles('topup');
        }
        if (rule === 'pkg-contract') {
          state.files.contract = [];
          renderFiles('contract');
        }
      }
      if (wasOpen && !ok && rule === 'deposit-file') {
        state.files.deposit = [];
        renderFiles('deposit');
      }
      if (wasOpen && !ok && rule === 'docs-file') {
        state.files.sign = [];
        renderFiles('sign');
      }
      if (wasOpen && !ok && rule === 'receivable-other') {
        state.files.receivable = [];
        renderFiles('receivable');
      }
      if (wasOpen && !ok && rule === 'gen-lease-docs') {
        state.files.genLeaseAuth = [];
        state.files.genLeaseContract = [];
        state.files.genManageAuth = [];
        renderFiles('genLeaseAuth');
        renderFiles('genLeaseContract');
        renderFiles('genManageAuth');
      }
      if (wasOpen && !ok && rule === 'gen-manage-doc') {
        state.files.genManageAuth = [];
        renderFiles('genManageAuth');
      }
      if (wasOpen && !ok && rule === 'gen:' + GEN_CANCEL) {
        state.files.genCancel = [];
        renderFiles('genCancel');
        clearFields(el);
      }
      if (wasOpen && !ok && rule === 'change-party-names') {
        clearFields(el);
      }
      if (wasOpen && !ok && rule === 'biz-invoice-item') {
        clearFields(el);
      }
      if (wasOpen && !ok && rule === 'roommate-yes') {
        resetRoommates();
      }
      if (wasOpen && !ok && rule === 'gap-yes') {
        state.files.gap = [];
        renderFiles('gap');
      }
      if (wasOpen && !ok && (rule === 'refund-sublease-term' || rule === 'refund-gap-yes' || rule === 'refund-gap-no')) {
        clearFields(el);
        if (rule === 'refund-gap-yes' || rule === 'refund-sublease-term') {
          state.files.refundGap = [];
          renderFiles('refundGap');
        }
      }
      if (wasOpen && !ok && rule === 'pkg:' + PKG_REFUND) {
        state.files.cancelSheet = [];
        renderFiles('cancelSheet');
      }
      if (wasOpen && !ok && rule === 'pay-tx-date') {
        clearFields(el);
      }
      if (wasOpen && !ok && rule === 'pay-passbook') {
        state.files.payPassbook = [];
        state.files.payOrigin = [];
        renderFiles('payPassbook');
        renderFiles('payOrigin');
      }
      if (wasOpen && !ok && rule === 'pay-overpay') {
        state.files.payPassbook = [];
        state.files.payOrigin = [];
        renderFiles('payPassbook');
        renderFiles('payOrigin');
      }
      if (wasOpen && !ok && (rule === 'pay:' + PAY_CANCEL || rule === 'pay:' + PAY_CORRECT)) {
        clearFields(el);
      }
    });
    if (showRoommateYes && !$('fin-roommate-list')?.children?.length) renderRoommateRows();
    ensureLlDocUploads();
    const activeSet = activeLlDocSet();
    if (state._llDocSet !== activeSet) {
      clearLlDocFiles(activeSet);
      state._llDocSet = activeSet;
    }
    const addrLab = $('fin-address-label');
    if (addrLab) {
      const addrRequired = !!issue && issue !== ISSUE_OFFICE;
      addrLab.classList.toggle('hr-req', addrRequired);
    }
    const noteLab = $('fin-note-label');
    const noteEl = $('fin-note');
    if (noteLab) {
      const noteRequired = issue === ISSUE_COLLECT;
      noteLab.classList.toggle('hr-req', noteRequired);
      if (noteEl) noteEl.placeholder = noteRequired ? '必填' : '選填';
    }
    placeSharedPropertyFields();
    placeExpandedBlocks();
    syncOther();
  }

  function isSuppReject() {
    return checked('fin-issue') === ISSUE_SUPP &&
      checked('fin-supp-item') === '退件補件/資料補正申請';
  }

  function hideCompanyAddrFields() {
    const issue = checked('fin-issue');
    return isSuppReject() || issue === ISSUE_OFFICE || issue === ISSUE_GEN;
  }

  function placeSharedPropertyFields() {
    const isReject = isSuppReject();
    const isOffice = checked('fin-issue') === ISSUE_OFFICE;
    const isGen = checked('fin-issue') === ISSUE_GEN;
    const hideAddr = isReject || isOffice;
    const hideLookup = hideAddr || isGen;
    const officeBlock = $('fin-office-block');
    const addrBlock = $('fin-address-block');
    const addrHint = $('fin-addr-hint');
    const addrBtn = $('fin-addr-lookup');
    const addrInput = $('fin-address');
    const pickWrap = $('fin-addr-pick-wrap');
    const leaseWrap = $('fin-lease-pick-wrap');
    const names = $('fin-party-names');
    if (officeBlock) officeBlock.hidden = !!isOffice;
    if (addrBlock) addrBlock.hidden = !!hideAddr;
    if (addrHint) {
      addrHint.hidden = !!hideLookup;
      if (isGen) {
        addrHint.hidden = false;
        addrHint.textContent = '一般宅請直接手填物件地址與房東／房客姓名。';
      } else if (!hideLookup) {
        addrHint.textContent = '註記：可先輸入路名（例：文化一路）查出所有相符地址再選；查不到時請人工填寫租期與房東／房客姓名。';
      }
    }
    if (addrBtn) addrBtn.hidden = !!hideLookup;
    if (addrInput) {
      addrInput.placeholder = isGen
        ? '請手填物件地址'
        : '輸入地址後按查公司資料';
    }
    if (hideLookup) {
      if (pickWrap) {
        pickWrap.hidden = true;
        setAddrPickOpen(false);
      }
      if (leaseWrap) leaseWrap.hidden = true;
      clearAddrPick();
      clearLeasePick();
    }
    if (names) {
      if (isOffice) {
        names.hidden = true;
      } else {
        names.hidden = false;
        if (isReject) {
          const panel = document.querySelector('#page-finance [data-fin-when="supp:退件補件/資料補正申請"]');
          const reasonField = $('fin-missing-items')?.closest('.hr-field');
          if (panel && reasonField) panel.insertBefore(names, reasonField);
        } else if (addrBlock && addrBlock.parentNode) {
          addrBlock.parentNode.insertBefore(names, addrBlock.nextSibling);
        }
      }
    }
  }

  function activeLlDocSet() {
    const changeTarget = checked('fin-change-target');
    const reason = checked('fin-landlord-reason');
    const why = checked('fin-passbook-why');
    const tnReason = checked('fin-tenant-reason');
    const tnWhy = checked('fin-tenant-passbook-why');
    if (changeTarget === '包租契約-房東') {
      if (reason === '房東-繼承(房東死亡)') return 'll-inherit';
      if (reason === '房東-買賣') return 'll-sale';
      if (reason === '房東-更名') return 'll-rename';
      if (reason === '房東-更換存摺' && why === '社宅如有申請異動') return 'pb-apply';
      if (reason === '房東-更換存摺' && why === '因帳戶被凍結') return 'pb-frozen';
    }
    if (changeTarget === '轉租契約-房客') {
      if (tnReason === '房客-繼承(房客死亡)') return 'tn-inherit';
      if (tnReason === '房客-更名') return 'tn-rename';
      if (tnReason === '房客-更換存摺' && tnWhy === '社宅如有申請異動') return 'tn-pb-apply';
    }
    return '';
  }

  function needChangePartyNames(payload) {
    if (payload.changeTarget === '包租契約-房東') {
      return payload.landlordReason === '房東-繼承(房東死亡)' ||
        payload.landlordReason === '房東-買賣' ||
        payload.landlordReason === '房東-更名';
    }
    if (payload.changeTarget === '轉租契約-房客') {
      return payload.tenantReason === '房客-繼承(房客死亡)' ||
        payload.tenantReason === '房客-更名';
    }
    return false;
  }

  function clearLlDocFiles(exceptSet) {
    Object.keys(LL_DOC_SETS).forEach((setId) => {
      if (setId === exceptSet) return;
      (LL_DOC_SETS[setId] || []).forEach((d) => {
        state.files[d.key] = [];
        renderFiles(d.key);
      });
    });
  }

  function ensureLlDocUploads() {
    document.querySelectorAll('#page-finance [data-fin-doc-set]').forEach((wrap) => {
      const setId = wrap.getAttribute('data-fin-doc-set');
      const docs = LL_DOC_SETS[setId] || [];
      if (wrap.dataset.built === '1') return;
      wrap.dataset.built = '1';
      wrap.innerHTML = docs.map((d) =>
        `<div class="hr-field hr-files fin-doc-item">
          <label class="hr-req" for="fin-files-${esc(d.key)}">${esc(d.label)}</label>
          <input id="fin-files-${esc(d.key)}" type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,image/*" data-fin-doc-input="${esc(d.key)}">
          <ul class="hr-file-list" data-fin-file-list="${esc(d.key)}"></ul>
        </div>`
      ).join('');
    });
  }

  function syncUploadLabels(depositType, pkgDocs, pkgItem) {
    const depLab = $('fin-files-deposit-label');
    if (depLab) depLab.textContent = DEPOSIT_FILE_LABEL[depositType] || '押金證明上傳';
    const docsLab = $('fin-files-sign-label');
    if (docsLab) docsLab.textContent = DOCS_FILE_LABEL[pkgDocs] || '必檢附資料上傳';
    const docsHint = $('fin-files-sign-hint');
    if (docsHint) {
      const toDistrict = PKG_SIGN_TO_DISTRICT.includes(pkgItem) && DOCS_WITH_SIGN.includes(pkgDocs);
      docsHint.textContent = toDistrict
        ? '請依所選項目上傳對應檔案（圖片／PDF／Word／Excel）。簽呈呈至區協理即可。'
        : '請依所選項目上傳對應檔案（圖片／PDF／Word／Excel）。';
    }
  }

  function roommateValues() {
    return Array.from(document.querySelectorAll('#page-finance .fin-roommate-name'))
      .map((el) => String(el.value || '').trim())
      .filter(Boolean);
  }

  function renderRoommateRows() {
    const list = $('fin-roommate-list');
    if (!list) return;
    const n = Math.max(1, Math.min(MAX_ROOMMATES, state.roommateCount || 1));
    state.roommateCount = n;
    const prev = Array.from(list.querySelectorAll('.fin-roommate-name')).map((el) => el.value);
    list.innerHTML = Array.from({ length: n }, (_, i) => {
      const v = esc(prev[i] || '');
      const rm = n > 1
        ? `<button type="button" class="fin-roommate-rm" data-fin-rm-roommate="${i}">移除</button>`
        : '';
      return `<div class="hr-field fin-roommate-row">
        <label class="hr-req" for="fin-roommate-${i}">共住人姓名 ${i + 1}</label>
        <div class="fin-roommate-row-inner">
          <input id="fin-roommate-${i}" class="fin-roommate-name" type="text" maxlength="40" placeholder="必填" value="${v}">
          ${rm}
        </div>
      </div>`;
    }).join('');
    const addBtn = $('fin-add-roommate');
    if (addBtn) addBtn.hidden = n >= MAX_ROOMMATES;
  }

  function resetRoommates() {
    state.roommateCount = 1;
    renderRoommateRows();
  }

  function renderFiles(key) {
    const keys = key ? [key] : Object.keys(state.files);
    keys.forEach((k) => {
      const lists = document.querySelectorAll('[data-fin-file-list="' + k + '"]');
      if (!lists.length) return;
      const arr = state.files[k] || [];
      const html = arr.length
        ? arr.map((f, i) =>
            `<li><span>${esc(f.name)}</span><button type="button" data-fin-rm-key="${k}" data-fin-rm="${i}">移除</button></li>`
          ).join('')
        : '';
      lists.forEach((list) => { list.innerHTML = html; });
    });
  }

  async function uploadSelected(files) {
    if (!files.length) return [];
    const sb = sbClient();
    if (!sb) throw new Error('尚未設定 Supabase 連線');
    const out = [];
    for (const file of files) {
      const ext = fileExt(file.name, file.type);
      if (!ext) throw new Error('不支援的檔案：' + (file.name || ''));
      const prep = await rpc('fin_report_prepare_upload', { p_token: token(), p_ext: ext });
      if (!prep?.ok) throw new Error(prep?.error || '無法準備上傳');
      const { error } = await sb.storage.from('fin-report').upload(prep.path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (error) throw new Error(error.message || '上傳失敗');
      out.push({
        path: prep.path,
        url: prep.publicUrl,
        name: String(file.name || prep.path).slice(0, 120),
        kind: isImageExt(ext) ? 'image' : 'file'
      });
    }
    return out;
  }

  function resolveOffice() {
    let office = val('fin-office');
    if (office === '其他') office = val('fin-office-other') || '其他';
    return office;
  }

  function collectPayload() {
    const payload = {
      address: val('fin-address'),
      landlord: val('fin-landlord'),
      tenant: val('fin-tenant'),
      note: val('fin-note')
    };
    const issue = checked('fin-issue');
    if (issue === ISSUE_PKG) {
      payload.pkgItem = checked('fin-pkg-item');
      payload.baoLeaseStart = val('fin-bao-lease-start');
      payload.baoLeaseEnd = val('fin-bao-lease-end');
      payload.zhuanLeaseStart = val('fin-zhuan-lease-start');
      payload.zhuanLeaseEnd = val('fin-zhuan-lease-end');
      payload.leaseStart = payload.baoLeaseStart || payload.zhuanLeaseStart;
      payload.leaseEnd = payload.baoLeaseEnd || payload.zhuanLeaseEnd;
      payload.leasePick = val('fin-lease-pick');
      if (PKG_INTAKE.includes(payload.pkgItem)) {
        if ((DEPOSIT_BY_PKG[payload.pkgItem] || []).length) {
          payload.depositType = checked('fin-deposit-type');
        }
        if (payload.pkgItem === PKG_RENEW_PKG) {
          payload.renewTopup = checked('fin-renew-topup');
          if (payload.renewTopup === '是') payload.topupAmount = val('fin-topup-amount');
        }
        payload.receivable = Array.from(document.querySelectorAll('#page-finance input[name="fin-receivable"]:checked')).map((x) => x.value);
        if (payload.receivable.includes('其他')) payload.receivableOther = val('fin-receivable-other');
        if (payload.pkgItem !== PKG_RENEW_PKG) payload.pkgDocs = resolvePkgDocs();
      }
      payload.rematchType = checked('fin-rematch-type');
      payload.oldTenant = val('fin-old-tenant');
      payload.newTenant = val('fin-new-tenant');
      payload.hasRoommate = checked('fin-has-roommate');
      payload.roommates = roommateValues();
      payload.roommate = payload.roommates.join('、');
      payload.refundType = checked('fin-refund-type');
      payload.hasGap = checked('fin-gap');
      payload.subleaseStart = val('fin-sublease-start');
      payload.refundDate = val('fin-refund-date');
      payload.refundMethod = checked('fin-refund-method');
      payload.refundSettle = checked('fin-refund-settle');
      payload.refundGap = checked('fin-refund-gap');
      payload.refundSubleaseStart = val('fin-refund-sublease-start');
      payload.changeTarget = checked('fin-change-target');
      payload.landlordReason = checked('fin-landlord-reason');
      payload.passbookWhy = checked('fin-passbook-why');
      payload.tenantReason = checked('fin-tenant-reason');
      payload.tenantPassbookWhy = checked('fin-tenant-passbook-why');
      payload.oldParty = val('fin-old-party');
      payload.newParty = val('fin-new-party');
      payload.changeNote = val('fin-change-note');
      payload.oldAccountName = val('fin-old-acc-name');
      payload.oldBank = val('fin-old-bank');
      payload.oldBankCode = val('fin-old-bank-code');
      payload.oldBranch = val('fin-old-branch');
      payload.oldBranchCode = val('fin-old-branch-code');
      payload.oldAccount = val('fin-old-account');
      payload.newAccountName = val('fin-new-acc-name');
      payload.newBank = val('fin-new-bank');
      payload.newBankCode = val('fin-new-bank-code');
      payload.newBranch = val('fin-new-branch');
      payload.newBranchCode = val('fin-new-branch-code');
      payload.newAccount = val('fin-new-account');
      payload.passbookNote = val('fin-passbook-note');
    } else if (issue === ISSUE_PAY) {
      payload.payItem = checked('fin-pay-item');
      payload.virtualAccount = val('fin-virtual-account');
      payload.payerName = val('fin-payer-name');
      payload.txDate = val('fin-tx-date');
      payload.wrongAccount = val('fin-wrong-account');
      payload.correctAccount = val('fin-correct-account');
      payload.amount = val('fin-amount');
      payload.reason = val('fin-reason');
    } else if (issue === ISSUE_COLLECT) {
      payload.collectItem = checked('fin-collect-item');
      payload.adjustItem = checked('fin-adjust-item');
      payload.feeChange = checked('fin-fee-change');
      payload.changedAmount = val('fin-changed-amount');
      payload.subChangeStart = val('fin-sub-change-start');
      payload.pkgChangeStart = val('fin-pkg-change-start');
      payload.abnormalNote = val('fin-abnormal-note');
    } else if (issue === ISSUE_SUPP) {
      payload.suppItem = checked('fin-supp-item');
      payload.originAddress = val('fin-origin-address');
      payload.originSerial = val('fin-origin-serial') || (state.suppOrigin ? String(state.suppOrigin.id || '') : '');
      payload.missingItems = val('fin-missing-items');
      payload.expectCancelDate = val('fin-expect-cancel');
      payload.cancelTogether = checked('fin-cancel-together');
      if (state.suppOrigin && String(state.suppOrigin.id) === String(payload.originSerial)) {
        payload.originRejectReason = state.suppOrigin.rejectReason || '';
        payload.originIssueType = state.suppOrigin.issueType || '';
        if (!payload.address && state.suppOrigin.address) payload.address = state.suppOrigin.address;
      } else if (!payload.address && payload.originAddress) {
        payload.address = payload.originAddress;
      }
    } else if (issue === ISSUE_STOP) {
      payload.stopPayStart = val('fin-stop-start');
    } else if (issue === ISSUE_GEN) {
      payload.genItem = checked('fin-gen-item');
      payload.genLeaseStart = val('fin-gen-lease-start');
      payload.genLeaseEnd = val('fin-gen-lease-end');
      payload.genKind = checked('fin-gen-kind');
      payload.feeLandlord = checked('fin-fee-landlord');
      payload.feeTenant = checked('fin-fee-tenant');
      payload.managePct = checked('fin-manage-pct');
      payload.genCancelDate = val('fin-gen-cancel-date');
      payload.genSettle = checked('fin-gen-settle');
    } else if (issue === ISSUE_OFFICE) {
      payload.venue = checked('fin-venue');
      payload.officeItem = checked('fin-biz-item');
      payload.bizCase = checked('fin-biz-case');
      payload.contractType = checked('fin-contract-type');
      payload.contractSerial = val('fin-contract-serial');
      payload.bizAction = checked('fin-biz-action');
      payload.bizIncome = checked('fin-biz-income');
      payload.bizRoomAction = checked('fin-biz-room-action');
      payload.bizRefundAction = checked('fin-biz-refund-action');
      payload.signedDone = checked('fin-signed-done');
      payload.clientInfo = val('fin-client-info');
      payload.remitAmount = val('fin-remit-amount');
      payload.remitTotal = val('fin-remit-total');
      payload.remitDeposit = val('fin-remit-deposit');
      payload.remitRent = val('fin-remit-rent');
      payload.remitDate = val('fin-remit-date');
      payload.remitTail = val('fin-remit-tail');
      payload.bizCheckNote = val('fin-biz-check-note');
      payload.contractStart = val('fin-contract-start');
      payload.contractEnd = val('fin-contract-end');
      payload.contractPeriods = val('fin-contract-periods');
      payload.periodPrice = val('fin-period-price');
      payload.rentTotal = val('fin-rent-total');
      payload.deposit = val('fin-deposit');
      payload.invoiceItem = checked('fin-invoice-item');
      payload.invoiceClient = val('fin-invoice-client');
      payload.invoiceBuyer = val('fin-invoice-buyer');
      payload.invoiceTaxId = val('fin-invoice-tax');
      payload.invoiceAmount = val('fin-invoice-amount');
      payload.bizInvoiceNote = val('fin-biz-invoice-note');
      payload.refundClient = val('fin-biz-refund-client');
      payload.refundBank = val('fin-biz-refund-bank');
      payload.refundBranch = val('fin-biz-refund-branch');
      payload.refundName = val('fin-biz-refund-name');
      payload.refundAccount = val('fin-biz-refund-account');
      payload.refundFee = checked('fin-biz-refund-fee');
      payload.refundAmount = val('fin-biz-refund-amount');
      payload.bizRefundNote = val('fin-biz-refund-note');
    }
    return payload;
  }

  function validate(issue, payload, fileCount) {
    const suppReject = issue === ISSUE_SUPP && payload.suppItem === '退件補件/資料補正申請';
    if (!suppReject && !payload.address && issue !== ISSUE_OFFICE) return '請填物件地址';
    if (!payload.landlord && issue !== ISSUE_OFFICE) return '請填房東姓名';
    if (!payload.tenant && issue !== ISSUE_OFFICE) return '請填房客姓名';
    if (issue !== ISSUE_OFFICE && issue !== ISSUE_GEN && !suppReject) {
      const leaseWrap = $('fin-lease-pick-wrap');
      if (leaseWrap && !leaseWrap.hidden && state.leaseOptions.length && !payload.leasePick) {
        return '請選擇租期';
      }
    }
    if (issue === ISSUE_PKG) {
      if (!payload.pkgItem) return '請選包租金流項目';
      if (!payload.baoLeaseStart) return '請填包租開始日期';
      if (!payload.baoLeaseEnd) return '請填包租到期日';
      if (!payload.zhuanLeaseStart) return '請填轉租開始日期';
      if (!payload.zhuanLeaseEnd) return '請填轉租到期日';
      if (payload.pkgItem === PKG_REFUND) {
        if (!payload.refundType) return '請選退押類型';
        if (!payload.refundDate) return '請填解約日／到期日';
        if ((fileCount.cancelSheet || 0) < 1) return '請上傳解約單';
        if (!payload.refundMethod) return '請選退押方式';
        if (!payload.refundSettle) return '請選退押相關費用結清人員';
        if (payload.refundType === REFUND_SUBLEASE_TERM) {
          if (!payload.refundGap) return '請選包租契約是否有空窗期';
          if (payload.refundGap === '有' && (fileCount.refundGap || 0) < 1) {
            return '有空窗期請上傳須呈總經理的空窗簽呈';
          }
          if (payload.refundGap === '無' && !payload.refundSubleaseStart) {
            return '無空窗期請填轉租契約新約起租日';
          }
        }
      }
      if (payload.pkgItem === PKG_CHANGE && !payload.changeTarget) return '請選異動對象';
      if (payload.pkgItem === PKG_CHANGE && payload.changeTarget === '包租契約-房東' && !payload.landlordReason) {
        return '請選房東異動原因';
      }
      if (payload.pkgItem === PKG_CHANGE && payload.changeTarget === '轉租契約-房客' && !payload.tenantReason) {
        return '請選房客異動原因';
      }
      if (payload.pkgItem === PKG_CHANGE && payload.landlordReason === '房東-更換存摺' && !payload.passbookWhy) {
        return '請選更換存摺原因';
      }
      if (payload.pkgItem === PKG_CHANGE && payload.tenantReason === '房客-更換存摺' && !payload.tenantPassbookWhy) {
        return '請選更換存摺原因';
      }
      if (payload.pkgItem === PKG_CHANGE && needChangePartyNames(payload)) {
        if (!payload.oldParty) return '請填原房東/客姓名';
        if (!payload.newParty) return '請填新房東/客姓名';
      }
      if (payload.pkgItem === PKG_CHANGE && (payload.changeTarget === '包租契約-房東' || payload.changeTarget === '轉租契約-房客')) {
        const setId = activeLlDocSet();
        const docs = LL_DOC_SETS[setId] || [];
        if (!setId) {
          if (payload.changeTarget === '包租契約-房東' && payload.landlordReason === '房東-更換存摺') {
            return '請選更換存摺原因';
          }
          if (payload.changeTarget === '轉租契約-房客' && payload.tenantReason === '房客-更換存摺') {
            return '請選更換存摺原因';
          }
        }
        for (const d of docs) {
          if ((fileCount[d.key] || 0) < 1) return '請上傳：' + d.label;
        }
      }
      if (PKG_CONTRACT.includes(payload.pkgItem) && (fileCount.contract || 0) < 1) {
        return '請上傳契約書+行政檢核表（包租／轉租可傳同一欄）';
      }
      if ((DEPOSIT_BY_PKG[payload.pkgItem] || []).length && !payload.depositType) return '請選押金類型';
      if (payload.depositType && (fileCount.deposit || 0) < 1) {
        return '請上傳' + (DEPOSIT_FILE_LABEL[payload.depositType] || '押金證明').replace(/上傳$/, '');
      }
      if (PKG_INTAKE.includes(payload.pkgItem) && payload.pkgItem !== PKG_RENEW_PKG && !payload.pkgDocs) {
        if (checked('fin-pkg-docs-path') === DOCS_PATH_SIGN) return '請選簽呈類型';
        return '請選包租必檢附資料';
      }
      if (payload.pkgDocs && (fileCount.sign || 0) < 1) {
        return '請上傳' + (DOCS_FILE_LABEL[payload.pkgDocs] || '必檢附資料').replace(/上傳$/, '');
      }
      if (PKG_INTAKE.includes(payload.pkgItem) && (!Array.isArray(payload.receivable) || !payload.receivable.length)) {
        return '請選入應收費用';
      }
      if (Array.isArray(payload.receivable) && payload.receivable.includes('其他')) {
        if (!payload.receivableOther) return '請填其他費用說明';
        if ((fileCount.receivable || 0) < 1) return '請上傳其他費用金額檔案';
      }
      if (payload.pkgItem === PKG_RENEW_PKG && !payload.renewTopup) return '請選是否要補押金';
      if (payload.renewTopup === '是' && !payload.topupAmount) return '請填補押金金額';
      if (payload.renewTopup === '是' && (fileCount.topup || 0) < 1) return '請上傳補押金差額明細';
      if (payload.pkgItem === PKG_REMATCH) {
        if (!payload.rematchType) return '請選再媒合類型';
        if (!payload.oldTenant) return '請填原房客姓名';
        if (!payload.newTenant) return '請填新房客姓名';
        if (!payload.subleaseStart) return '請填轉租契約新約起租日';
        if (!payload.hasRoommate) return '請選有無共住人';
        if (payload.hasRoommate === '有') {
          if (!payload.roommates || !payload.roommates.length) return '請填共住人姓名';
          const blanks = document.querySelectorAll('#page-finance .fin-roommate-name');
          for (const el of blanks) {
            if (!String(el.value || '').trim()) return '請填齊所有共住人姓名，或移除空白欄位';
          }
        }
        if (!payload.hasGap) return '請選包租契約是否有空窗期';
        if (payload.hasGap === '是' && (fileCount.gap || 0) < 1) return '請上傳包租空窗簽呈';
      }
    }
    if (issue === ISSUE_PAY) {
      if (!payload.payItem) return '請選租金及款項項目';
      if (!payload.amount) return '請填金額';
      if (!payload.reason) return '請填原因';
      if (payload.payItem === PAY_CANCEL) {
        if (!payload.virtualAccount) return '請填匯款虛擬帳號';
        if (!payload.payerName) return '請填匯款人姓名';
      }
      if (payload.payItem === PAY_CORRECT) {
        if (!payload.wrongAccount) return '請填錯誤虛擬帳號';
        if (!payload.correctAccount) return '請填正確虛擬帳號';
        if (!payload.txDate) return '請填交易日期';
      }
      if (PAY_PASSBOOK.includes(payload.payItem) && (fileCount.payPassbook || 0) < 1) {
        return '請上傳匯款人存摺封面';
      }
      if (PAY_ORIGIN_DOCS.includes(payload.payItem) && (fileCount.payOrigin || 0) < 1) {
        return '請上傳原匯款明細';
      }
      if (PAY_OVERPAY_DOCS.includes(payload.payItem)) {
        if ((fileCount.payPassbook || 0) < 1) return '請上傳匯款人存摺封面';
      }
    }
    if (issue === ISSUE_COLLECT) {
      if (!payload.collectItem) return '請選催收管理項目';
      if (!payload.note) return '請填其他備註';
      if (payload.collectItem === '金流應收調整') {
        if (!payload.adjustItem) return '請選包租案件應收調整項目';
        if (!payload.feeChange) return '請選新增減少或改變費用';
        if (payload.feeChange === '改變費用') {
          if (!payload.changedAmount) return '請填變更後金額';
          if (!payload.subChangeStart) return '請填轉租變更起始日';
          if (!payload.pkgChangeStart) return '請填包租變更起始日';
          if ((fileCount.fee || 0) < 1) return '請上傳費用改變相關檔案佐證';
        }
      }
      if (payload.collectItem === '應收款項異常問題回報') {
        if (!payload.abnormalNote) return '請填應收款項異常回報';
        if ((fileCount.collect || 0) < 1) return '請上傳相關資料';
      }
    }
    if (issue === ISSUE_SUPP) {
      if (!payload.suppItem) return '請選資料項目';
      if (payload.suppItem === '退件補件/資料補正申請') {
        if (!payload.originAddress) return '請填退件物件地址';
        if (!state.suppOrigin || !payload.originSerial || String(state.suppOrigin.id) !== String(payload.originSerial)) {
          return '請先按「查退件」並選擇已被財務退件的案件';
        }
        if ((fileCount.supp || 0) < 1) return '請上傳補件附件';
      }
      if (payload.suppItem === '金流明細表調閱申請') {
        if (!payload.expectCancelDate) return '請填預計解約日期';
        if (!payload.cancelTogether) return '請選包租與轉租是否一起解約';
      }
    }
    if (issue === ISSUE_STOP && !payload.stopPayStart) return '請填包租契約停止付款起始日';
    if (issue === ISSUE_STOP && fileCount.stop < 1) return '請上傳止付通知簽呈';
    if (issue === ISSUE_GEN) {
      if (!payload.genItem) return '請選一般宅金流項目';
      if (!payload.genLeaseStart) return '請填租約開始日期';
      if (!payload.genLeaseEnd) return '請填租約到期日期';
      if (payload.genItem === GEN_CANCEL) {
        if (!payload.genCancelDate) return '請填解約日期';
        if (!payload.genSettle) return '請選退押相關費用結清人員';
        if ((fileCount.genCancel || 0) < 1) return '請上傳解約單';
      } else {
        if (!payload.genKind) return '請選一般宅項目';
        if ((fileCount.genLeaseAuth || 0) < 1) return '請上傳委託租賃';
        if ((fileCount.genLeaseContract || 0) < 1) return '請上傳租賃契約';
        if (payload.genKind === GEN_KIND_MANAGE && (fileCount.genManageAuth || 0) < 1) {
          return '請上傳委託管理';
        }
        if (!payload.feeLandlord) return '請選服務費確認-房東方';
        if (!payload.feeTenant) return '請選服務費確認-房客方';
        if (payload.genKind === GEN_KIND_MANAGE && !payload.managePct) return '請選代管費百分比';
      }
    }
    if (issue === ISSUE_OFFICE) {
      if (!payload.venue) return '請選館別';
      if (!payload.officeItem) return '請選款項性質';

      const isA = payload.officeItem === BIZ_CONTRACT;
      const isB = payload.officeItem === BIZ_ROOM;
      const isC = payload.officeItem === BIZ_POST;
      const isD = payload.officeItem === BIZ_REFUND;
      const signedYes = payload.signedDone === '是';
      const signedNo = payload.signedDone === '否';
      const aBoth = isA && payload.bizAction === BIZ_ACT_BOTH;
      const aCheck = isA && payload.bizAction === BIZ_ACT_CHECK;
      const aInv = isA && payload.bizAction === BIZ_ACT_INV;
      const aCheckPath = aCheck || (aBoth && signedNo);
      const aBothYes = aBoth && signedYes;
      const aInvYes = aInv && signedYes;
      const bBoth = isB && payload.bizRoomAction === BIZ_ACT_BOTH;
      const bCheck = isB && payload.bizRoomAction === BIZ_ACT_CHECK;
      const bInv = isB && payload.bizRoomAction === BIZ_ACT_INV;
      const roomReady = isB && !!payload.bizIncome;
      const roomCheck = roomReady && (bBoth || bCheck);
      const roomInv = roomReady && (bBoth || bInv);
      const roomMeet = roomCheck && payload.bizIncome === BIZ_INCOME_ROOM;
      const roomCopy = roomCheck && payload.bizIncome === BIZ_INCOME_COPY;
      const dInv = isD && payload.bizRefundAction === BIZ_REFUND_INV;
      const dOnly = isD && payload.bizRefundAction === BIZ_REFUND_ONLY;
      const needCheck = isC || aCheckPath || aBothYes || roomCheck;
      const needContract = aCheckPath || aBothYes;
      const needInvoice = aBothYes || aInvYes || roomInv || dInv;
      const needRefund = dInv || dOnly;

      if (isA) {
        if (!payload.bizCase) return '請選案件類型';
        if (!payload.contractType) return '請選合約性質';
        if (!payload.contractSerial) return '請填合約序號（公司NAS合約資料夾序號）';
        if (!payload.bizAction) return '請選作業需求';
        if ((aBoth || aInv) && !payload.signedDone) return '請選合約是否已簽約完成';
        if (aInv && signedNo) return '合約未簽約完成，請先完成合約簽約再提出需求';
      }
      if (isB) {
        if (!payload.bizIncome) return '請選收入類型';
        if (!payload.bizRoomAction) return '請選作業需求';
      }
      if (isD && !payload.bizRefundAction) return '請選作業需求';

      if (needCheck) {
        if (!payload.clientInfo) return '請填客戶資訊';
        if (roomMeet) {
          if (!payload.remitTotal) return '請填匯款總金額';
          if (!payload.remitDeposit) return '請填匯款押金金額';
          if (!payload.remitRent) return '請填匯款租金金額';
        } else if (isC || aCheckPath || aBothYes || roomCopy) {
          if (!payload.remitAmount) return '請填匯款金額';
        }
        if (!payload.remitDate) return '請填匯款日期';
        if (!payload.remitTail) return '請填匯款後5碼';
      }
      if (needContract) {
        if (!payload.contractStart) return '請填合約開始日期';
        if (!payload.contractEnd) return '請填合約到期日期';
        if (!payload.contractPeriods) return '請填合約期數';
        if (!payload.periodPrice) return '請填合約每期價格（含稅）';
        if (!payload.rentTotal) return '請填合約租金總額（不含押金）';
        if (!payload.deposit) return '請填合約押金';
      }
      if (needInvoice) {
        if (dInv && !payload.invoiceItem) return '請選發票項目';
        if (roomInv && !payload.invoiceClient) return '請填發票客戶資訊';
        if (!payload.invoiceBuyer) return '請填買受人';
        if (!payload.invoiceTaxId) return '請填統一編號';
        if (!payload.invoiceAmount) return '請填發票金額';
      }
      if (needRefund) {
        if (!payload.refundClient) return '請填退押客戶資訊';
        if (!payload.refundBank) return '請填退押帳戶銀行';
        if (!payload.refundBranch) return '請填退押帳戶銀行分行';
        if (!payload.refundName) return '請填退押帳戶戶名';
        if (!payload.refundAccount) return '請填退押帳戶號碼';
        if (!payload.refundFee) return '請選是否扣手續費';
        if (!payload.refundAmount) return '請填退押金額';
      }
    }
    return '';
  }

  function bindFileInput(inputId, key) {
    $(inputId)?.addEventListener('change', (e) => {
      const picked = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of picked) {
        if (state.files[key].length >= MAX_FILES) {
          setMsg('最多上傳 ' + MAX_FILES + ' 個檔案', 'err');
          break;
        }
        const ext = fileExt(f.name, f.type);
        if (!ext) continue;
        state.files[key].push(f);
      }
      renderFiles(key);
    });
  }

  function bind() {
    const page = $('page-finance');
    if (!page || page.dataset.finBound) return;
    page.dataset.finBound = '1';
    fillOffice();
    ensureLlDocUploads();
    page.addEventListener('change', (e) => {
      if (e.target.matches('input[name="fin-issue"]')) return;
      if (e.target.id === 'fin-lease-pick') {
        const opt = state.leaseOptions.find((o) => o.id === e.target.value);
        applyLeaseOption(opt);
        return;
      }
      if (e.target.id === 'fin-address') {
        clearAddrPick();
        clearLeasePick();
        setLookupStatus('');
      }
      if (e.target.id === 'fin-origin-pick') {
        selectSuppCandidate(e.target.value);
        return;
      }
      if (e.target.matches('input[name="fin-supp-item"]')) {
        clearSuppOrigin();
        setOriginLookupStatus('');
      }
      if (e.target.matches('input[type="radio"], #fin-office, input[type="checkbox"]')) syncPanels();
    });
    $('fin-addr-lookup')?.addEventListener('click', () => { void lookupCompanyByAddress(); });
    $('fin-origin-lookup')?.addEventListener('click', () => { void lookupRejectedOrigin(); });
    $('fin-address')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void lookupCompanyByAddress();
      }
    });
    $('fin-origin-address')?.addEventListener('input', () => {
      clearSuppOrigin();
      setOriginLookupStatus('');
    });
    $('fin-origin-address')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void lookupRejectedOrigin();
      }
    });
    page.addEventListener('click', (e) => {
      const toggle = e.target.closest('#fin-addr-pick-toggle');
      if (toggle && page.contains(toggle)) {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        setAddrPickOpen(!open);
        return;
      }
      const addrBtn = e.target.closest('[data-fin-addr-idx]');
      if (addrBtn && page.contains(addrBtn)) {
        const idx = Number(addrBtn.getAttribute('data-fin-addr-idx'));
        if (Number.isFinite(idx)) selectAddrOption(idx);
      }
    });
    bindFileInput('fin-files-sign', 'sign');
    bindFileInput('fin-files-deposit', 'deposit');
    bindFileInput('fin-files-receivable', 'receivable');
    bindFileInput('fin-files-topup', 'topup');
    bindFileInput('fin-files-contract', 'contract');
    bindFileInput('fin-files-gap', 'gap');
    bindFileInput('fin-files-refund-gap', 'refundGap');
    bindFileInput('fin-files-cancel-sheet', 'cancelSheet');
    bindFileInput('fin-files-pay-passbook', 'payPassbook');
    bindFileInput('fin-files-pay-passbook-over', 'payPassbook');
    bindFileInput('fin-files-pay-origin', 'payOrigin');
    bindFileInput('fin-files-pay-origin-over', 'payOrigin');
    bindFileInput('fin-files-fee', 'fee');
    bindFileInput('fin-files-collect', 'collect');
    bindFileInput('fin-files-stop', 'stop');
    bindFileInput('fin-files-supp', 'supp');
    bindFileInput('fin-files-gen-lease-auth', 'genLeaseAuth');
    bindFileInput('fin-files-gen-lease-contract', 'genLeaseContract');
    bindFileInput('fin-files-gen-manage-auth', 'genManageAuth');
    bindFileInput('fin-files-gen-cancel', 'genCancel');
    bindFileInput('fin-files-misc', 'misc');
    bindFileInput('fin-files-office', 'office');
    bindFileInput('fin-files-change', 'change');
    LL_DOC_KEYS.forEach((k) => bindFileInput('fin-files-' + k, k));
    page.addEventListener('click', (e) => {
      const head = e.target.closest('.fin-issue-head');
      if (head && page.contains(head)) {
        e.preventDefault();
        const input = head.querySelector('input[name="fin-issue"]');
        if (!input) return;
        const wasOn = !!input.checked;
        const anchorTop = head.getBoundingClientRect().top;
        document.querySelectorAll('#page-finance input[name="fin-issue"]').forEach((r) => {
          r.checked = false;
        });
        if (!wasOn) input.checked = true;
        syncPanels();
        if (input.checked) keepHeadStable(head, anchorTop);
        return;
      }
      // 點選項後接續欄位出現在下方；標題／選項留在原位，不要整頁往上跳
      const radioLab = e.target.closest('.hr-radio');
      if (radioLab && page.contains(radioLab)) {
        const anchorTop = radioLab.getBoundingClientRect().top;
        setTimeout(() => keepHeadStable(radioLab, anchorTop), 0);
      }
      if (e.target.id === 'fin-add-roommate' || e.target.closest('#fin-add-roommate')) {
        if (state.roommateCount < MAX_ROOMMATES) {
          state.roommateCount += 1;
          renderRoommateRows();
        }
        return;
      }
      const rmMate = e.target.closest('[data-fin-rm-roommate]');
      if (rmMate) {
        const idx = Number(rmMate.getAttribute('data-fin-rm-roommate'));
        const names = Array.from(document.querySelectorAll('#page-finance .fin-roommate-name')).map((el) => el.value);
        if (Number.isFinite(idx) && names.length > 1) {
          names.splice(idx, 1);
          state.roommateCount = names.length;
          renderRoommateRows();
          document.querySelectorAll('#page-finance .fin-roommate-name').forEach((el, i) => {
            el.value = names[i] || '';
          });
        }
        return;
      }
      const btn = e.target.closest('[data-fin-rm]');
      if (!btn) return;
      const key = btn.getAttribute('data-fin-rm-key');
      const i = Number(btn.getAttribute('data-fin-rm'));
      if (!key || !state.files[key] || !Number.isFinite(i)) return;
      state.files[key].splice(i, 1);
      renderFiles(key);
    });

    $('fin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.busy) return;
      setMsg('');
      if (!token()) { setMsg('請先登入工具箱再送出', 'err'); return; }
      const fullName = val('fin-full-name');
      const issueType = checked('fin-issue');
      let office = resolveOffice();
      if (!fullName) { setMsg('請填姓名全名', 'err'); return; }
      if (!issueType) { setMsg('請選擇回報問題', 'err'); return; }
      if (issueType === ISSUE_OFFICE) {
        office = checked('fin-venue') || '商辦部';
      } else if (!office) {
        setMsg('請選案件所屬處所', 'err');
        return;
      }
      const payload = collectPayload();
      const fileCount = Object.fromEntries(Object.keys(state.files).map((k) => [k, state.files[k].length]));
      const err = validate(issueType, payload, fileCount);
      if (err) { setMsg(err, 'err'); return; }

      state.busy = true;
      const btn = $('fin-submit');
      if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
      try {
        const depositLabel = DEPOSIT_FILE_LABEL[payload.depositType] || '押金證明';
        const docsLabel = DOCS_FILE_LABEL[payload.pkgDocs] || '必檢附資料';
        const llDocGroups = Object.values(LL_DOC_SETS).flat().map((d) => ({ key: d.key, label: '異動｜' + d.label }));
        const groups = [
          { key: 'contract', label: '契約書+行政檢核表' },
          { key: 'deposit', label: depositLabel.replace(/上傳$/, '') },
          { key: 'sign', label: docsLabel.replace(/上傳$/, '') },
          { key: 'receivable', label: '其他費用金額' },
          { key: 'topup', label: '補押金差額明細' },
          { key: 'gap', label: '空窗簽呈' },
          { key: 'refundGap', label: '退押空窗簽呈(總經理)' },
          { key: 'cancelSheet', label: '解約單' },
          { key: 'payPassbook', label: '匯款人存摺封面' },
          { key: 'payOrigin', label: '原匯款明細' },
          { key: 'fee', label: '費用佐證' },
          { key: 'collect', label: '催收資料' },
          { key: 'stop', label: '止付簽呈' },
          { key: 'supp', label: '補件附件' },
          { key: 'genLeaseAuth', label: '委託租賃' },
          { key: 'genLeaseContract', label: '租賃契約' },
          { key: 'genManageAuth', label: '委託管理' },
          { key: 'genCancel', label: '解約單' },
          { key: 'misc', label: '附件' },
          { key: 'office', label: '商辦附件' },
          { key: 'change', label: '異動附件' }
        ].concat(llDocGroups);
        let files = [];
        for (const g of groups) {
          const uploaded = await uploadSelected(state.files[g.key] || []);
          files = files.concat(uploaded.map((f) => Object.assign({}, f, { name: g.label + '｜' + f.name })));
        }
        const res = await rpc('fin_report_submit', {
          p_token: token(),
          p_data: { fullName, office, issueType, payload, files }
        });
        if (!res?.ok) throw new Error(res?.error || '送出失敗');
        const line = res.line || {};
        if (line.error) setMsg('已送出，但 LINE 未送出：' + line.error + '（請至財務回報後台查看）', 'warn');
        else setMsg('已送出，並已通知財務部（' + (line.recipients || 0) + ' 人）', 'ok');
        $('fin-form')?.reset();
        Object.keys(state.files).forEach((k) => { state.files[k] = []; });
        resetRoommates();
        clearAddrPick();
        clearLeasePick();
        setLookupStatus('');
        renderFiles();
        fillOffice();
        syncPanels();
      } catch (ex) {
        setMsg(ex.message || String(ex), 'err');
      } finally {
        state.busy = false;
        if (btn) { btn.disabled = false; btn.textContent = '送出'; }
      }
    });

    syncPanels();
  }

  window.FinReport = {
    onShow() {
      bind();
      fillOffice();
      syncPanels();
    }
  };
})();
