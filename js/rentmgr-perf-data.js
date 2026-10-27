/**
 * 租管師績效中心｜欄位定義與資料
 * 續約：已過週＝試算表；本週／未到週＝續約管理系統即時；10–12 月各一張表（表頭＝地區）。
 */
(function (global) {
  'use strict';

  const REGIONS = [
    { id: 'tpe', label: '台北' },
    { id: 'ntpc', label: '新北' },
    { id: 'tyn', label: '桃園' },
    { id: 'txg', label: '台中' },
    { id: 'chw', label: '彰化' },
    { id: 'nan', label: '南投' },
    { id: 'cyi', label: '嘉義' },
    { id: 'tnn', label: '台南' },
    { id: 'khh', label: '高雄' },
    { id: 'all', label: '總計' }
  ];

  /** 試算表地區欄順序（與「115租管部KPI-續約」週報一致） */
  const SHEET_REGION_IDS = REGIONS.map(function (r) { return r.id; });

  const RENEW_METRICS = [
    { key: 'renewRateAll', label: '續約率-全部', kind: 'rate', higherIsBetter: true },
    { key: 'renewRateExcl', label: '當月續約率-異常轉業者', kind: 'rate', higherIsBetter: true },
    { key: 'due', label: '應續約', kind: 'count' },
    { key: 'done', label: '已續約', kind: 'count', higherIsBetter: true },
    { key: 'presign', label: '預簽中', kind: 'count' },
    { key: 'tracking', label: '追蹤中', kind: 'count' },
    { key: 'leasing', label: '招租中', kind: 'count' },
    { key: 'noRenewAll', label: '不續約-全部', kind: 'count', higherIsBetter: false },
    { key: 'noRenewRate', label: '不續約率', kind: 'rate', higherIsBetter: false },
    /* 本週／即時＝不續約明細勾「異常轉業」；已過週仍可用試算表數字 */
    { key: 'noRenewTransfer', label: '不續約-異常轉業', kind: 'count', higherIsBetter: false }
  ];

  const RENEW_WEEK_NAME = ['第一週', '第二週', '第三週', '第四週', '第五週', '第六週'];
  /** @deprecated 僅相容舊呼叫；實際週數依各月日曆 */
  const RENEW_WEEK_LABELS = RENEW_WEEK_NAME.slice(0, 3);
  const RENEW_MONTH_IDS = ['10', '11', '12'];
  /** 試算表每個地區固定 3 欄週次；超過的週改吃系統週快照 */
  const SHEET_WEEK_COLS = 3;
  /**
   * 每月介面最多 4 週：第1–3週＝試算表，第4週＝「第4週起／本週」系統數字。
   * 日曆若還有第5週（如 10/26–11/1），併入第四週，避免出現「第五週·本週」。
   */
  const MAX_DISPLAY_WEEKS = SHEET_WEEK_COLS + 1;

  const RENEW_SHEET_GVIZ =
    'https://docs.google.com/spreadsheets/d/1LS27q0M6kBNzajskkD2T6FDG4bRXfgKn11ToM0TGGFU/gviz/tq?tqx=out:json&gid=460097670';

  /** 各地區 KPI 週報（全區＋分區；總覽卡用全區最近一週） */
  const REGION_KPI_SHEET_GVIZ =
    'https://docs.google.com/spreadsheets/d/1LS27q0M6kBNzajskkD2T6FDG4bRXfgKn11ToM0TGGFU/gviz/tq?tqx=out:json&gid=0';

  /** 各地區 KPI 月報分頁（sheet 名稱含全形括號） */
  const REGION_KPI_MONTH_SHEET_GVIZ =
    'https://docs.google.com/spreadsheets/d/1LS27q0M6kBNzajskkD2T6FDG4bRXfgKn11ToM0TGGFU/gviz/tq?tqx=out:json&sheet=' +
    encodeURIComponent('「115租管部KPI-各地區」-月報');

  /** 各地區 KPI 指標列（對齊試算表） */
  const REGION_KPI_METRICS = [
    { key: 'renewRate', label: '當月續約率-全部', section: '一、《提前續約》', weight: '20%', kind: 'rate' },
    { key: 'renewRateExcl', label: '當月續約率-異常轉業者', section: '', weight: '', kind: 'rate' },
    { key: 'leadRenewNext', label: '領先續約率_次月', section: '', weight: '10%', kind: 'rate' },
    { key: 'leadRenewNext2', label: '領先續約率_次次月', section: '', weight: '10%', kind: 'rate' },
    { key: 'toBaoRate', label: '續轉包率', section: '二、《續約轉包租》', weight: '30%', kind: 'rate' },
    { key: 'reLeaseRate', label: '再媒合完成招租', section: '三、《再媒合招租》', weight: '20%', kind: 'rate' },
    { key: 'collectOver30', label: '控管包租催收30天以上件數', section: '四、《包租催收》', weight: '10%', kind: 'count' }
  ];

  /** 週／月報上表（全區～台中）、下表（彰化～高雄）；欄位 offset 與試算表一致 */
  const REGION_KPI_NORTH = [
    { id: 'all', label: '全區' },
    { id: 'tpe', label: '台北' },
    { id: 'ntpc', label: '新北' },
    { id: 'tyn', label: '桃園' },
    { id: 'txg', label: '台中' }
  ];
  const REGION_KPI_SOUTH = [
    { id: 'chw', label: '彰化' },
    { id: 'nan', label: '南投' },
    { id: 'cyi', label: '嘉義' },
    { id: 'tnn', label: '台南' },
    { id: 'khh', label: '高雄' }
  ];

  /**
   * 年報列（對齊《115年度租管部KPI月報》圖）：1–9 月實績／目標取圖面；
   * 10 月起改由系統／月報矩陣覆寫。
   */
  const ANNUAL_KPI_ROWS = [
    { key: 'renewRate', label: '當月續約率', section: '一、《提前續約》', weight: '20%', kind: 'rate' },
    { key: 'renewRateExcl', label: '當月續約率-異常轉業者', section: '', weight: '', kind: 'rate' },
    { key: 'leadRenewNext', label: '領先續約率_次月', section: '', weight: '10%', kind: 'rate' },
    { key: 'leadRenewNext2', label: '領先續約率_次次月', section: '', weight: '10%', kind: 'rate' },
    { key: 'toBaoRate', label: '續轉包率', section: '二、《續約轉包租》', weight: '30%', kind: 'rate' },
    { key: 'reLeaseRate', label: '再媒合招租完成招租', section: '三、《再媒合》', weight: '20%', kind: 'rate' },
    { key: 'collectOver30', label: '控管包租催收30天以上件數', section: '四、《包租催收》', weight: '10%', kind: 'count' }
  ];

  /**
   * 1–12 月去年同期／1–9 月目標＋實績：依《115年度租管部KPI月報》圖面。
   * 10 月起實績改由系統／月報矩陣覆寫；去年同期圖面數字當缺表時後援。
   */
  const ANNUAL_KPI_STATIC = {
    renewRate: {
      1: { ly: 76, target: 80, actual: 72 },
      2: { ly: 69, target: 80, actual: 75 },
      3: { ly: 75, target: 80, actual: 74 },
      4: { ly: 72, target: 80, actual: 77 },
      5: { ly: 77, target: 80, actual: 73 },
      6: { ly: 72, target: 80, actual: 71 },
      7: { ly: 75, target: 85, actual: 70 },
      8: { ly: 73, target: 85, actual: 73 },
      9: { ly: 71, target: 85, actual: 72 },
      10: { ly: 70, target: 85, actual: null },
      11: { ly: 73, target: 85, actual: null },
      12: { ly: 61, target: 85, actual: null }
    },
    /* 年報圖面原本無此列；目標對齊續約率，1–9 實績／去年同期待月報表或系統補 */
    renewRateExcl: {
      1: { ly: null, target: 80, actual: null },
      2: { ly: null, target: 80, actual: null },
      3: { ly: null, target: 80, actual: null },
      4: { ly: null, target: 80, actual: null },
      5: { ly: null, target: 80, actual: null },
      6: { ly: null, target: 80, actual: null },
      7: { ly: null, target: 85, actual: null },
      8: { ly: null, target: 85, actual: null },
      9: { ly: null, target: 85, actual: null },
      10: { ly: null, target: 85, actual: null },
      11: { ly: null, target: 85, actual: null },
      12: { ly: null, target: 85, actual: null }
    },
    leadRenewNext: {
      1: { ly: 49, target: 60, actual: 43.9 },
      2: { ly: 39, target: 60, actual: 42 },
      3: { ly: 37, target: 60, actual: 32 },
      4: { ly: 37, target: 60, actual: 36 },
      5: { ly: 37, target: 60, actual: 33 },
      6: { ly: 46, target: 60, actual: 21 },
      7: { ly: 25, target: 60, actual: 14 },
      8: { ly: 36, target: 60, actual: 32 },
      9: { ly: 41, target: 60, actual: 20 },
      10: { ly: 35, target: 60, actual: null },
      11: { ly: 32, target: 60, actual: null },
      12: { ly: 53, target: 60, actual: null }
    },
    leadRenewNext2: {
      1: { ly: 11, target: 35, actual: 20.5 },
      2: { ly: 5, target: 35, actual: 11 },
      3: { ly: 17, target: 35, actual: 10 },
      4: { ly: 5, target: 35, actual: 1.1 },
      5: { ly: 21, target: 35, actual: 6 },
      6: { ly: 4, target: 35, actual: 5 },
      7: { ly: 7, target: 35, actual: 5 },
      8: { ly: 26, target: 35, actual: 11 },
      9: { ly: 22, target: 35, actual: 2 },
      10: { ly: 19, target: 35, actual: null },
      11: { ly: 3, target: 35, actual: null },
      12: { ly: 14, target: 35, actual: null }
    },
    toBaoRate: {
      1: { ly: 2, target: 20, actual: 9.6 },
      2: { ly: 3, target: 20, actual: 5.7 },
      3: { ly: 4, target: 20, actual: 8 },
      4: { ly: 1, target: 20, actual: 7 },
      5: { ly: 0, target: 20, actual: 8 },
      6: { ly: 2, target: 20, actual: 10 },
      7: { ly: 3, target: 20, actual: 7 },
      8: { ly: 6, target: 20, actual: 8 },
      9: { ly: 2, target: 20, actual: 5 },
      10: { ly: 3, target: 20, actual: null },
      11: { ly: 13, target: 20, actual: null },
      12: { ly: 10, target: 20, actual: null }
    },
    reLeaseRate: {
      1: { ly: 80, target: 70, actual: 72 },
      2: { ly: 77, target: 70, actual: 71 },
      3: { ly: 71, target: 70, actual: 77 },
      4: { ly: 72, target: 70, actual: 72 },
      5: { ly: 70, target: 70, actual: 69 },
      6: { ly: 72, target: 70, actual: 66 },
      7: { ly: 75, target: 70, actual: 62 },
      8: { ly: 60, target: 70, actual: 56 },
      9: { ly: 45, target: 70, actual: 0 },
      10: { ly: 63, target: 70, actual: null },
      11: { ly: 52, target: 70, actual: null },
      12: { ly: 48, target: 70, actual: null }
    },
    collectOver30: {
      1: { ly: 8, target: 5, actual: 4 },
      2: { ly: 5, target: 5, actual: 4 },
      3: { ly: 4, target: 5, actual: 3 },
      4: { ly: 11, target: 5, actual: 7 },
      5: { ly: 5, target: 5, actual: 8 },
      6: { ly: 8, target: 5, actual: 12 },
      7: { ly: 6, target: 5, actual: 11 },
      8: { ly: 2, target: 5, actual: 9 },
      9: { ly: 0, target: 5, actual: 12 },
      10: { ly: 4, target: 5, actual: null },
      11: { ly: 3, target: 5, actual: null },
      12: { ly: 3, target: 5, actual: null }
    }
  };

  const ANNUAL_LIVE_FROM_MONTH = 10;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function fmtMd(d) {
    return (d.getMonth() + 1) + '/' + pad2(d.getDate());
  }

  function addDays(d, n) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /**
   * 跨月週歸哪一月：以該週「天數較多」的月份為準（平手取結束月）。
   * 例如 10/26–11/1 → 10 月（6 天在 10 月），避免本週被算成 11 月第一週。
   */
  function monthBandForWeekRange(start, end) {
    let startDays = 0;
    let endDays = 0;
    for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      if (d.getMonth() === start.getMonth()) startDays += 1;
      if (d.getMonth() === end.getMonth()) endDays += 1;
    }
    const useStart = startDays > endDays;
    let bandMonth = (useStart ? start.getMonth() : end.getMonth()) + 1;
    if (bandMonth === 1 && !useStart && end.getMonth() === 0) bandMonth = 12;
    if (bandMonth === 1 && useStart && start.getMonth() === 0) bandMonth = 12;
    return pad2(bandMonth);
  }

  /**
   * 115 年（2026）日曆週：用來判斷「本週」對應試算表第幾週。
   * monthBand：跨月週取天數較多的月份（見 monthBandForWeekRange）。
   */
  function buildRenewWeeks() {
    const start = new Date(2026, 8, 28);
    const lastStart = new Date(2026, 11, 28);
    const weeks = [];
    let cursor = start;
    let i = 1;
    while (cursor.getTime() <= lastStart.getTime()) {
      const end = addDays(cursor, 6);
      const bandId = monthBandForWeekRange(cursor, end);
      weeks.push({
        id: 'w' + pad2(i),
        index: i,
        label: 'W' + i,
        range: fmtMd(cursor) + '-' + fmtMd(end),
        startIso: cursor.getFullYear() + '-' + pad2(cursor.getMonth() + 1) + '-' + pad2(cursor.getDate()),
        monthBand: bandId,
        monthLabel: bandId + '月'
      });
      cursor = addDays(cursor, 7);
      i += 1;
    }
    return weeks;
  }

  const RENEW_WEEKS = buildRenewWeeks();

  function weeksForMonth(monthId) {
    return RENEW_WEEKS.filter(function (w) { return w.monthBand === monthId; });
  }

  function weekCountForMonth(monthId) {
    return Math.min(MAX_DISPLAY_WEEKS, Math.max(1, weeksForMonth(monthId).length));
  }

  function weekLabelsForMonth(monthId) {
    const n = weekCountForMonth(monthId);
    return RENEW_WEEK_NAME.slice(0, n);
  }

  /** 日曆週序 → 介面週序（第5週起併入第四週） */
  function clampWeekIndex(monthId, rawIndex) {
    if (rawIndex == null || rawIndex < 0) return -1;
    return Math.min(rawIndex, weekCountForMonth(monthId) - 1);
  }

  const RENEW_MONTH_BANDS = RENEW_MONTH_IDS.map(function (id) {
    return {
      id: id,
      label: id + '月',
      weekLabels: weekLabelsForMonth(id)
    };
  });

  const MODULES = {
    overview: {
      id: 'overview',
      label: '總覽',
      layout: 'overview',
      /** 目標文案對齊示意圖；實績之後由系統帶入，不得寫死數字 */
      kpis: [
        {
          key: 'renewRate',
          label: '當月續約率',
          kind: 'rate',
          higherIsBetter: true,
          goalText: '目標 ≥ 82%',
          goalValue: 82,
          unit: '%'
        },
        {
          key: 'collectOver30',
          label: '催收 30 天以上件數',
          kind: 'count',
          higherIsBetter: false,
          /** 上限控管：不用「達標」慶祝語，改控管內／警戒／超標 */
          statusMode: 'cap',
          goalText: '上限 ≤ 5 件',
          goalValue: 5,
          unit: '件'
        },
        {
          key: 'leadRenewNext',
          label: '領先續約率（次月）',
          kind: 'rate',
          higherIsBetter: true,
          /** 租約到期日為下個月，本月已先簽回的佔比 */
          goalText: '目標 ≥ 60%｜到期次月、本月先簽回',
          goalValue: 60,
          unit: '%',
          hint: '租約到期日為下個月，本月已先簽回的佔比'
        },
        {
          key: 'leadRenewNext2',
          label: '領先續約率（次次月）',
          kind: 'rate',
          higherIsBetter: true,
          /** 租約到期日為下下個月，本月已先簽回的佔比 */
          goalText: '目標 ≥ 35%｜到期次次月、本月先簽回',
          goalValue: 35,
          unit: '%',
          hint: '租約到期日為下下個月，本月已先簽回的佔比'
        },
        {
          key: 'toBaoRate',
          label: '續轉包率',
          kind: 'rate',
          higherIsBetter: true,
          /** 代管轉包租 ÷（應續約 − 包租續包租 − 不續約） */
          goalText: '目標 ≥ 25%｜代管轉包租÷(應續約−包租續包租−不續約)',
          goalValue: 25,
          unit: '%',
          formula: '代管轉包租案件數/(應續約件數-包租續包租件數-不續約件數)'
        },
        {
          key: 'noRenewRate',
          label: '不續約率（暫定上限）',
          kind: 'rate',
          higherIsBetter: false,
          goalText: '目標 ≤ 15%',
          goalValue: 15,
          unit: '%'
        }
      ],
      pointsColumns: [
        { key: 'rank', label: '#' },
        { key: 'name', label: '姓名' },
        { key: 'region', label: '地區' },
        { key: 'office', label: '營業處' },
        { key: 'points', label: '月累積點數' },
        { key: 'note', label: '備註' }
      ]
    },
    regionKpi: {
      id: 'regionKpi',
      label: '各地區 KPI',
      layout: 'regionKpiMatrix',
      cards: [
        { key: 'renewRate', label: '當月續約率' },
        {
          key: 'leadRenewNext',
          label: '領先續約率（次月）',
          hint: '租約到期日為下個月，本月已先簽回的佔比'
        },
        { key: 'toBaoRate', label: '續轉包率' },
        { key: 'collectCount', label: '催收件數（30天以上）' }
      ],
      columns: [
        { key: 'renewRate', label: '當月續約率' },
        {
          key: 'leadRenewNext',
          label: '領先續約率（次月）',
          hint: '租約到期日為下個月，本月已先簽回的佔比'
        },
        { key: 'toBaoRate', label: '續轉包率' },
        { key: 'collectCount', label: '催收件數' }
      ],
      metrics: REGION_KPI_METRICS,
      northRegions: REGION_KPI_NORTH,
      southRegions: REGION_KPI_SOUTH,
      /** 續轉包率＝代管轉包租÷(應續約−包租續包租−不續約)；試算表實績依此口徑 */
      toBaoFormula: '代管轉包租案件數/(應續約件數-包租續包租件數-不續約件數)',
      leadRenewHint: '領先續約率（次月）＝租約到期日為下個月、本月已先簽回的佔比；再媒合完成招租＝算回開始招租月（與當月續約率分開計算）'
    },
    renew: {
      id: 'renew',
      label: '續約',
      layout: 'renewMonths',
      cards: [],
      weeks: RENEW_WEEKS,
      monthBands: RENEW_MONTH_BANDS,
      metrics: RENEW_METRICS,
      weekLabels: weekLabelsForMonth('10'),
      defaultRegion: 'all'
    },
    noRenew: {
      id: 'noRenew',
      label: '不續約明細',
      layout: 'noRenewDashboard',
      cards: []
    },
    collect: {
      id: 'collect',
      label: '催收',
      layout: 'collectDashboard',
      cards: [],
      /** 介面參考 AI 催收系統全國總覽；資料同源 latest.json */
      dashboardUrl: 'https://dahwork123-hash.github.io/skyfun-arrears-dashboard/'
    },
    org: {
      id: 'org',
      label: '組織人力',
      layout: 'orgChart',
      cards: []
    }
  };

  const SHEET_LINKS = [
    {
      label: '115年租管部-各地區KPI週月報',
      url: 'https://docs.google.com/spreadsheets/d/1LS27q0M6kBNzajskkD2T6FDG4bRXfgKn11ToM0TGGFU/edit'
    },
    {
      label: '管理師表_組織報告',
      url: 'https://docs.google.com/spreadsheets/d/1KkZNgTXlFWbFVecw5p-fa0cE8LTPGJnv75EVPPdaHnk/edit'
    },
    {
      label: 'AI 催收系統（全國呆帳）',
      url: 'https://dahwork123-hash.github.io/skyfun-arrears-dashboard/'
    }
  ];

  /** 續約週格額外欄（不進續約分頁列，但供各地區 KPI 爬數） */
  const LIVE_EXTRA_KEYS = ['toBaoRate', 'toBao', 'baoRenewBao'];

  function emptyMetricRow() {
    const row = {};
    RENEW_METRICS.forEach(function (m) { row[m.key] = null; });
    LIVE_EXTRA_KEYS.forEach(function (k) { row[k] = null; });
    return row;
  }

  function emptyRegionRow(columns) {
    const row = {};
    (columns || []).forEach(function (col) { row[col.key] = null; });
    return row;
  }

  function emptyMonthPayload(monthId) {
    const n = weekCountForMonth(monthId);
    const byRegion = {};
    SHEET_REGION_IDS.forEach(function (rid) {
      const weeks = [];
      for (let i = 0; i < n; i++) weeks.push(emptyMetricRow());
      byRegion[rid] = { weeks: weeks };
    });
    return { byRegion: byRegion };
  }

  function emptyModulePayload(mod) {
    if (mod.layout === 'overview') {
      const kpis = {};
      (mod.kpis || []).forEach(function (k) {
        kpis[k.key] = { value: null, prev: null, delta: null, status: null };
      });
      return { kpis: kpis, points: [] };
    }
    if (mod.layout === 'collectDashboard') {
      return { loaded: false, cases: [], summary: null, asOf: null, syncedAt: null, error: null };
    }
    if (mod.layout === 'renewMonths' || mod.layout === 'renewWeeks') {
      const byMonth = {};
      RENEW_MONTH_IDS.forEach(function (id) {
        byMonth[id] = emptyMonthPayload(id);
      });
      return { byMonth: byMonth };
    }

    const cards = {};
    (mod.cards || []).forEach(function (c) { cards[c.key] = null; });
    const regions = {};
    REGIONS.forEach(function (r) {
      regions[r.id] = emptyRegionRow(mod.columns);
    });
    return { cards: cards, regions: regions };
  }

  const RPA_BASE = String(
    (typeof window !== 'undefined' && window.SKYFUN_RPA_BASE) ||
      'https://skyfun-arrears-rpa.dahwork123.workers.dev'
  ).replace(/\/$/, '');

  /** 與 AI 催收系統相同資料源 */
  const ARREARS_DATA_URL = RPA_BASE + '/data/latest.json';
  const ARREARS_DATA_FALLBACK =
    'https://dahwork123-hash.github.io/skyfun-arrears-dashboard/data/latest.json';

  const COLLECT_ALERTS = [
    { key: '1', label: '1～6天', short: '初期', min: 1, max: 6 },
    { key: '7', label: '7～13天', short: '7天警示', min: 7, max: 13 },
    { key: '14', label: '14～29天', short: '14天警示', min: 14, max: 29 },
    { key: '30', label: '30天以上', short: '30天警示', min: 30, max: Infinity }
  ];

  const COLLECT_REGION_ORDER = ['北區', '桃園區', '中區', '台南區', '高雄區', '業務支援管理部', '未歸類'];

  function collectAlertOf(days) {
    const d = Number(days) || 0;
    for (let i = 0; i < COLLECT_ALERTS.length; i++) {
      const a = COLLECT_ALERTS[i];
      if (d >= a.min && d <= a.max) return a;
    }
    return COLLECT_ALERTS[COLLECT_ALERTS.length - 1];
  }

  function collectStageOf(days) {
    const d = Number(days) || 0;
    if (d <= 3) return { stage: 1, label: '一｜LINE催繳', range: '逾期 1～3 天' };
    if (d <= 7) return { stage: 2, label: '二｜AI電話', range: '逾期 4～7 天' };
    if (d <= 14) return { stage: 3, label: '三｜家訪貼單', range: '逾期 8～14 天' };
    return { stage: 4, label: '四｜存證信函', range: '逾期 15 天以上' };
  }

  function collectRiskOf(c) {
    const blob = String(c.note || '') + String(c.status || '');
    if (c.maxDays >= 15 || /法務|拒繳|消極|未接|失聯/.test(blob)) return { level: '高', key: 'high' };
    if (c.maxDays >= 8) return { level: '中', key: 'mid' };
    if (c.maxDays >= 4) return { level: '低', key: 'low' };
    return { level: '', key: '' };
  }

  function normalizeCityLabel(city) {
    const s = String(city || '').trim();
    if (!s) return '未填縣市';
    return s.replace(/^台/, '臺');
  }

  function buildCollectCases(lines) {
    const map = {};
    (lines || []).forEach(function (l) {
      if (!l || !l.caseId) return;
      const arrears = Number(l.arrears) || 0;
      if (arrears <= 0) return;
      if (!map[l.caseId]) {
        map[l.caseId] = {
          caseId: l.caseId,
          region: l.region || '未歸類',
          office: l.office || '',
          staff: l.staff || '',
          city: normalizeCityLabel(l.city),
          type: l.type || '',
          address: l.address || '',
          tenant: l.tenant || '',
          status: l.status || '',
          note: '',
          leaseStart: l.leaseStart || '',
          leaseEnd: l.leaseEnd || '',
          amount: 0,
          maxDays: 0,
          lineCount: 0,
          notes: [],
          lines: []
        };
      }
      const c = map[l.caseId];
      c.amount += arrears;
      c.maxDays = Math.max(c.maxDays, Number(l.days) || 0);
      c.lineCount += 1;
      c.lines.push({
        sourceRow: l.sourceRow || c.lineCount,
        days: Number(l.days) || 0,
        dueDate: l.dueDate || l.dueRaw || '',
        rent: Number(l.rent) || 0,
        receivable: Number(l.receivable) || 0,
        paidDate: l.paidDate || '',
        paid: Number(l.paid) || 0,
        arrears: arrears,
        status: l.status || ''
      });
      if (!c.region && l.region) c.region = l.region;
      if (!c.office && l.office) c.office = l.office;
      if (!c.staff && l.staff) c.staff = l.staff;
      if (!c.address && l.address) c.address = l.address;
      if (!c.tenant && l.tenant) c.tenant = l.tenant;
      if (!c.leaseStart && l.leaseStart) c.leaseStart = l.leaseStart;
      if (!c.leaseEnd && l.leaseEnd) c.leaseEnd = l.leaseEnd;
      if (l.status && !c.status) c.status = l.status;
      if (l.city) c.city = normalizeCityLabel(l.city);
      if (l.note) c.notes.push(String(l.note).trim());
    });
    return Object.keys(map).map(function (id) {
      const c = map[id];
      const notes = (c.notes || []).filter(Boolean);
      c.note = notes.length
        ? notes.sort(function (a, b) { return b.length - a.length; })[0]
        : '';
      delete c.notes;
      c.lines = (c.lines || []).sort(function (a, b) {
        return (b.days - a.days) || (b.arrears - a.arrears);
      });
      /* 應收款日：取欠租天數最長那筆（公司系統 receivableDate） */
      c.dueDate = (c.lines[0] && c.lines[0].dueDate) || '';
      c.alert = collectAlertOf(c.maxDays);
      c.stage = collectStageOf(c.maxDays);
      c.risk = collectRiskOf(c);
      return c;
    }).sort(function (a, b) {
      return (b.maxDays - a.maxDays) || (b.amount - a.amount);
    });
  }

  function summarizeCollectCases(cases) {
    const list = cases || [];
    const sumAmt = function (arr) {
      return arr.reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0);
    };
    /* 互斥區間：14天以下／14～29天／30天以上（不再用「以上」累計重疊） */
    const under14 = list.filter(function (c) { return c.maxDays < 14; });
    const day14to29 = list.filter(function (c) { return c.maxDays >= 14 && c.maxDays <= 29; });
    const a30 = list.filter(function (c) { return c.maxDays >= 30; });
    const legal = list.filter(function (c) {
      return String(c.collectStatus || '').trim() === '請法務協助';
    });
    const alerts = COLLECT_ALERTS.map(function (a) {
      const rows = list.filter(function (c) { return c.alert && c.alert.key === a.key; });
      return {
        key: a.key,
        label: a.label,
        short: a.short,
        cases: rows.length,
        amount: sumAmt(rows)
      };
    });
    const regionMap = {};
    list.forEach(function (c) {
      const name = c.region || '未歸類';
      if (!regionMap[name]) {
        regionMap[name] = { name: name, cases: 0, amount: 0, over30: 0 };
      }
      regionMap[name].cases += 1;
      regionMap[name].amount += Number(c.amount) || 0;
      if (c.maxDays >= 30) regionMap[name].over30 += 1;
    });
    const regions = COLLECT_REGION_ORDER
      .filter(function (n) { return regionMap[n]; })
      .map(function (n) { return regionMap[n]; })
      .concat(
        Object.keys(regionMap)
          .filter(function (n) { return COLLECT_REGION_ORDER.indexOf(n) < 0; })
          .map(function (n) { return regionMap[n]; })
          .sort(function (a, b) { return b.amount - a.amount; })
      );
    regions.sort(function (a, b) {
      const ia = COLLECT_REGION_ORDER.indexOf(a.name);
      const ib = COLLECT_REGION_ORDER.indexOf(b.name);
      if (ia >= 0 || ib >= 0) {
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      }
      return b.amount - a.amount;
    });
    const cityMap = {};
    list.forEach(function (c) {
      const name = c.city || '未填縣市';
      if (!cityMap[name]) cityMap[name] = { name: name, cases: 0, amount: 0, over30: 0 };
      cityMap[name].cases += 1;
      cityMap[name].amount += Number(c.amount) || 0;
      if (c.maxDays >= 30) cityMap[name].over30 += 1;
    });
    const cities = Object.keys(cityMap)
      .map(function (n) { return cityMap[n]; })
      .sort(function (a, b) { return b.cases - a.cases || b.amount - a.amount; });

    return {
      caseCount: list.length,
      lineCount: list.reduce(function (s, c) { return s + (c.lineCount || 0); }, 0),
      amount: sumAmt(list),
      under14: { cases: under14.length, amount: sumAmt(under14) },
      day14to29: { cases: day14to29.length, amount: sumAmt(day14to29) },
      over30: { cases: a30.length, amount: sumAmt(a30) },
      /* 相容舊欄位（月報等）：over7／over14 改指向新區間，避免畫面空白 */
      over7: { cases: under14.length, amount: sumAmt(under14) },
      over14: { cases: day14to29.length, amount: sumAmt(day14to29) },
      legalAssist: { cases: legal.length, amount: sumAmt(legal) },
      alerts: alerts,
      regions: regions,
      cities: cities,
      cases: list
    };
  }

  function fetchArrearsLatestJson(token) {
    const headers = {};
    if (token) headers['X-Skyfun-Session'] = token;
    return fetch(ARREARS_DATA_URL, { headers: headers, credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('arrears worker HTTP ' + res.status);
        return res.json();
      })
      .catch(function () {
        return fetch(ARREARS_DATA_FALLBACK, { credentials: 'omit' }).then(function (res) {
          if (!res.ok) throw new Error('arrears fallback HTTP ' + res.status);
          return res.json();
        });
      });
  }

  /** 租管師績效中心催收：只看業務支援管理部 */
  const COLLECT_OFFICE_FILTER = '業務支援管理部';

  function isCollectTargetLine(l) {
    if (!l) return false;
    const office = String(l.office || '').trim();
    const region = String(l.region || '').trim();
    return office === COLLECT_OFFICE_FILTER || region === COLLECT_OFFICE_FILTER;
  }

  function fetchCollectStatusMap(caseIds) {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const nos = (caseIds || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (!nos.length || !token) {
      return Promise.resolve({});
    }
    const headers = { 'Content-Type': 'application/json' };
    headers['X-Skyfun-Session'] = token;
    return fetch(RPA_BASE + '/admin-points/renew-collect-status-list', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ matchNos: nos })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data || data.ok === false) return {};
          return data.map && typeof data.map === 'object' ? data.map : {};
        });
      })
      .catch(function () {
        return {};
      });
  }

  function applyCollectStatusMap(cases, map) {
    const m = map || {};
    (cases || []).forEach(function (c) {
      const id = String(c.caseId || '');
      c.collectStatus = Object.prototype.hasOwnProperty.call(m, id) ? m[id] : null;
    });
    return cases;
  }

  function loadCollectDashboard() {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    return fetchArrearsLatestJson(token).then(function (data) {
      if (!data || data.ok === false) throw new Error((data && data.error) || '無呆帳資料');
      const lines = (data.lines || []).filter(isCollectTargetLine);
      const cases = buildCollectCases(lines);
      return fetchCollectStatusMap(cases.map(function (c) { return c.caseId; })).then(function (map) {
        applyCollectStatusMap(cases, map);
        const summary = summarizeCollectCases(cases);
        return {
          loaded: true,
          cases: cases,
          summary: summary,
          asOf: data.asOf || null,
          syncedAt: data.syncedAt || null,
          source: data.source || null,
          scopeLabel: COLLECT_OFFICE_FILTER,
          error: null,
          dashboardUrl: MODULES.collect.dashboardUrl
        };
      });
    });
  }

  function todayIsoLocal() {
    const today = new Date();
    return today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
  }

  function weekEndIso(w) {
    const end = addDays(new Date(w.startIso + 'T00:00:00'), 6);
    return end.getFullYear() + '-' + pad2(end.getMonth() + 1) + '-' + pad2(end.getDate());
  }

  function currentRenewWeek() {
    const todayIso = todayIsoLocal();
    for (let i = 0; i < RENEW_WEEKS.length; i++) {
      const w = RENEW_WEEKS[i];
      if (w.startIso <= todayIso && todayIso <= weekEndIso(w)) return w;
    }
    return null;
  }

  /**
   * 本週對應該月介面「第幾週」(0-based；第5週起併入第四週)。
   */
  function currentSheetWeekIndex() {
    const cur = currentRenewWeek();
    if (!cur) return null;
    const bandWeeks = weeksForMonth(cur.monthBand);
    const rawIdx = bandWeeks.findIndex(function (w) { return w.id === cur.id; });
    if (rawIdx < 0) return null;
    return {
      monthId: cur.monthBand,
      weekIndex: clampWeekIndex(cur.monthBand, rawIdx),
      rawWeekIndex: rawIdx,
      weekId: cur.id
    };
  }

  function sheetWeekPhase(monthId, weekIndex) {
    const cur = currentSheetWeekIndex();
    const todayIso = todayIsoLocal();
    const bandWeeks = weeksForMonth(monthId);
    const displayN = weekCountForMonth(monthId);
    if (!bandWeeks.length || weekIndex < 0 || weekIndex >= displayN) return 'future';
    if (cur && cur.monthId === monthId && cur.weekIndex === weekIndex) return 'current';
    if (cur && cur.monthId === monthId && weekIndex < cur.weekIndex) return 'past';
    if (cur && cur.monthId === monthId && weekIndex > cur.weekIndex) return 'future';
    /* 最後一欄代表「第 N 週起」：用該欄對應的最早日曆週判斷已過／未到 */
    const mapped = bandWeeks[Math.min(weekIndex, bandWeeks.length - 1)];
    if (weekIndex === displayN - 1 && bandWeeks.length > displayN) {
      const firstExtra = bandWeeks[displayN - 1];
      if (firstExtra && weekEndIso(bandWeeks[bandWeeks.length - 1]) < todayIso) return 'past';
      if (firstExtra && firstExtra.startIso > todayIso) return 'future';
    } else {
      if (mapped && weekEndIso(mapped) < todayIso) return 'past';
      if (mapped && mapped.startIso > todayIso) return 'future';
    }
    if (Number(monthId) < (cur ? Number(cur.monthId) : Number(todayIso.slice(5, 7)))) return 'past';
    if (Number(monthId) > (cur ? Number(cur.monthId) : Number(todayIso.slice(5, 7)))) return 'future';
    return 'future';
  }

  function normalizeSheetCell(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/\n/g, '');
    if (!s || s === '-' || s === '—' || s === '#N/A') return null;
    return s;
  }

  function metricKeyFromSheetLabel(label) {
    const s = String(label || '').replace(/\s+/g, '').replace(/\n/g, '');
    if (/不續約率/.test(s)) return 'noRenewRate';
    if (/不續約/.test(s) && /惡意|異常|轉業|轉件/.test(s)) return 'noRenewTransfer';
    if (/續約率/.test(s) && /扣除|惡意|異常/.test(s)) return 'renewRateExcl';
    if (/續約率/.test(s)) return 'renewRateAll';
    if (s === '應續約') return 'due';
    if (s === '已續約') return 'done';
    if (s === '預簽中') return 'presign';
    if (s === '追蹤中') return 'tracking';
    if (s === '招租中') return 'leasing';
    if (/不續約/.test(s)) return 'noRenewAll';
    return null;
  }

  function parseGvizTable(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('試算表格式錯誤');
    const data = JSON.parse(text.slice(start, end + 1));
    if (!data || !data.table || !Array.isArray(data.table.rows)) throw new Error('試算表無資料');
    return data.table.rows.map(function (r) {
      return (r.c || []).map(function (c) {
        if (!c) return '';
        if (c.f != null && c.f !== '') return String(c.f);
        if (c.v == null) return '';
        return String(c.v);
      });
    });
  }

  function applySheetRowsToMonth(monthPayload, rows, startIndex) {
    let i = startIndex + 1;
    while (i < rows.length) {
      const label = String((rows[i] && rows[i][1]) || '').trim();
      if (/^\d{1,2}月$/.test(label)) break;
      const metricKey = metricKeyFromSheetLabel(label);
      if (!metricKey) {
        i += 1;
        continue;
      }
      const cells = rows[i] || [];
      SHEET_REGION_IDS.forEach(function (rid, ri) {
        const base = 2 + ri * SHEET_WEEK_COLS;
        const weekSlots = monthPayload.byRegion[rid].weeks;
        for (let wi = 0; wi < SHEET_WEEK_COLS; wi++) {
          if (!weekSlots[wi]) continue;
          const raw = normalizeSheetCell(cells[base + wi]);
          if (raw == null) continue;
          weekSlots[wi][metricKey] = raw;
        }
      });
      i += 1;
    }
    return i;
  }

  function fillDerivedRenewRates(byMonth) {
    RENEW_MONTH_IDS.forEach(function (monthId) {
      const block = byMonth[monthId];
      if (!block) return;
      SHEET_REGION_IDS.forEach(function (rid) {
        const weeks = block.byRegion[rid] && block.byRegion[rid].weeks;
        if (!weeks) return;
        weeks.forEach(function (cell) {
          if (cell.renewRateExcl != null && cell.renewRateExcl !== '') return;
          const due = toNumber(cell.due);
          const done = toNumber(cell.done);
          const transfer = toNumber(cell.noRenewTransfer) || 0;
          if (due == null || done == null) return;
          const base = due - transfer;
          if (base > 0) cell.renewRateExcl = (Math.round((done / base) * 1000) / 10) + '%';
        });
      });
    });
  }

  function parseRenewSheet(rows) {
    const byMonth = {};
    RENEW_MONTH_IDS.forEach(function (id) {
      byMonth[id] = emptyMonthPayload(id);
    });
    for (let i = 0; i < rows.length; i++) {
      const label = String((rows[i] && rows[i][1]) || '').trim();
      const m = label.match(/^(\d{1,2})月$/);
      if (!m) continue;
      const id = pad2(Number(m[1]));
      if (!byMonth[id]) continue;
      i = applySheetRowsToMonth(byMonth[id], rows, i) - 1;
    }
    fillDerivedRenewRates(byMonth);
    return byMonth;
  }

  /**
   * 已過週保留試算表專用欄（無）；本週／即時週可被系統覆蓋，
   * 異常轉業改由工具箱勾選回填，故不再列入 SHEET_ONLY。
   */
  const SHEET_ONLY_KEYS = {};

  function maxWeekIndex(monthId) {
    return weekCountForMonth(monthId) - 1;
  }

  function overlayLiveMonth(byMonth, liveByRegion, monthId, weekIndex) {
    if (!byMonth || !byMonth[monthId] || !liveByRegion) return;
    if (weekIndex == null || weekIndex < 0 || weekIndex > maxWeekIndex(monthId)) return;
    Object.keys(liveByRegion).forEach(function (rid) {
      const dest = byMonth[monthId].byRegion[rid];
      if (!dest || !dest.weeks || !dest.weeks[weekIndex]) return;
      const src = liveByRegion[rid];
      const cell = dest.weeks[weekIndex];
      RENEW_METRICS.forEach(function (met) {
        if (SHEET_ONLY_KEYS[met.key]) return;
        if (src[met.key] != null && src[met.key] !== '') {
          cell[met.key] = src[met.key];
        }
      });
      LIVE_EXTRA_KEYS.forEach(function (k) {
        if (src[k] != null && src[k] !== '') cell[k] = src[k];
      });
      /* 即時覆蓋後，若表上已有異常轉業件數，重算扣除異常續約率 */
      const due = toNumber(cell.due);
      const done = toNumber(cell.done);
      const transfer = toNumber(cell.noRenewTransfer) || 0;
      if (due != null && done != null) {
        const base = due - transfer;
        cell.renewRateExcl = base > 0 ? (Math.round((done / base) * 1000) / 10) + '%' : null;
      }
    });
  }

  /** 非已過週：清掉可被系統覆寫的欄位（異常轉業等試算表專用欄保留） */
  function clearLiveOverwritable(byMonth, monthId, weekIndex) {
    if (!byMonth || !byMonth[monthId]) return;
    if (weekIndex == null || weekIndex < 0 || weekIndex > maxWeekIndex(monthId)) return;
    SHEET_REGION_IDS.forEach(function (rid) {
      const cell = byMonth[monthId].byRegion[rid] && byMonth[monthId].byRegion[rid].weeks[weekIndex];
      if (!cell) return;
      RENEW_METRICS.forEach(function (met) {
        if (SHEET_ONLY_KEYS[met.key]) return;
        cell[met.key] = null;
      });
      LIVE_EXTRA_KEYS.forEach(function (k) { cell[k] = null; });
    });
  }

  /** 要蓋上系統即時的週：本週＋未到的週（已過週維持試算表／週快照） */
  function liveWeekIndexesForMonth(monthId) {
    const out = [];
    const n = weekCountForMonth(monthId);
    for (let wi = 0; wi < n; wi++) {
      if (sheetWeekPhase(monthId, wi) !== 'past') out.push(wi);
    }
    return out;
  }

  /**
   * 試算表只有 3 欄；第 4 週起用 Worker 週快照（該週當下系統數字）。
   * 已過且超出試算表欄的週才套用，不覆蓋第 1–3 週試算表。
   */
  function applyWeekSnapshots(byMonth, weekSnapshots) {
    if (!byMonth || !weekSnapshots) return;
    Object.keys(weekSnapshots).forEach(function (wid) {
      const snap = weekSnapshots[wid];
      if (!snap || !snap.byRegion) return;
      const meta = RENEW_WEEKS.find(function (w) { return w.id === wid; });
      if (!meta) return;
      const monthId = meta.monthBand;
      if (!byMonth[monthId]) return;
      const band = weeksForMonth(monthId);
      const rawWi = band.findIndex(function (w) { return w.id === wid; });
      if (rawWi < 0 || rawWi < SHEET_WEEK_COLS) return;
      const wi = clampWeekIndex(monthId, rawWi);
      if (wi < SHEET_WEEK_COLS) return;
      if (sheetWeekPhase(monthId, wi) !== 'past') return;
      clearLiveOverwritable(byMonth, monthId, wi);
      overlayLiveMonth(byMonth, snap.byRegion, monthId, wi);
    });
  }

  function parseSheetText(text) {
    return parseRenewSheet(parseGvizTable(text));
  }

  function fetchRenewSheet(token) {
    const headers = {};
    if (token) headers['X-Skyfun-Session'] = token;
    /* 優先經 Worker 代理，避免瀏覽器直連 Google 偶發失敗導致整表無資料 */
    return fetch(RPA_BASE + '/admin-points/renew-sheet', { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('renew-sheet HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.text) throw new Error('renew-sheet empty');
        return parseSheetText(data.text);
      })
      .catch(function () {
        return fetch(RENEW_SHEET_GVIZ, { credentials: 'omit' }).then(function (res) {
          if (!res.ok) throw new Error('sheet HTTP ' + res.status);
          return res.text();
        }).then(parseSheetText);
      });
  }

  function fetchLiveRenewKpi(token, monthsCsv, year) {
    const y = Number(year) || 115;
    const cur = currentSheetWeekIndex();
    const q = new URLSearchParams({
      year: String(y),
      months: monthsCsv || '10,11,12'
    });
    /* 週快照僅寫入當年（115）本週 */
    if (y === 115 && cur) {
      q.set('weekId', (currentRenewWeek() || {}).id || '');
      q.set('weekMonth', String(Number(cur.monthId)));
    }
    /* 每天第一次進績效中心強制重爬，讓續轉包／領先續約吃到最新系統數字 */
    try {
      const dayKey = 'rmp-renew-kpi-refresh-v4-' + todayIsoLocal();
      if (!sessionStorage.getItem(dayKey)) {
        q.set('refresh', '1');
        sessionStorage.setItem(dayKey, '1');
      }
    } catch (e) { /* ignore */ }
    const headers = {};
    if (token) headers['X-Skyfun-Session'] = token;
    return fetch(RPA_BASE + '/admin-points/renew-kpi?' + q.toString(), { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('renew-kpi HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error(data && data.error ? data.error : 'renew-kpi');
        return {
          months: data.months || {},
          weekSnapshots: data.weekSnapshots || {},
          fetchedAt: data.fetchedAt || null
        };
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * 試算表「115年不續約占比」（對齊租管部試算表）。
   * 過去月份實績／去年同期一律用表上數字；當月才用公司系統即時。
   */
  /** 改試算表數字時請一併改版號，前端才會重抓、不被記憶體快取卡住 */
  const NORENEW_SHEET_VER = '20261026-abn-month';

  /**
   * 試算表「115年不續約占比」原文（與租管部試算表對齊）。
   * 凡 sheetDue 有填的月份＝實績鎖表；去年同期 lyRate 亦鎖表（勿用系統 114 覆蓋）。
   * 當月（尚無表上定稿）才用系統。
   */
  const NORENEW_SHEET_YOY = {
    year: 115,
    annualLy: {
      due: null,
      leasing: null,
      leaseRate: null,
      noRenew: null,
      noRenewRate: 24.3
    },
    /* 年度合計隨月份累加；此處備註完整年參考值 */
    annualAct: {
      due: 2232,
      leasing: 66,
      leaseRate: 3.0,
      noRenew: 535,
      noRenewRate: 24.0
    },
    /* 1–12 月：ly＝試算表去年同期占比（勿填系統數）；sheet＝115 實績（試算表） */
    months: [
      { m: 1, lyDue: 154, lyLease: null, lyLeaseRate: null, lyNoRenew: 37, lyRate: 23.7, sheetDue: 152, sheetLease: 1, sheetLeaseRate: 0.5, sheetNoRenew: 34, sheetActRate: 22.3 },
      { m: 2, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 30.3, sheetDue: 206, sheetLease: 2, sheetLeaseRate: 0.9, sheetNoRenew: 46, sheetActRate: 22.3 },
      { m: 3, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 26.6, sheetDue: 217, sheetLease: 1, sheetLeaseRate: 0.4, sheetNoRenew: 57, sheetActRate: 26.3 },
      { m: 4, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 27.1, sheetDue: 224, sheetLease: 1, sheetLeaseRate: 0.4, sheetNoRenew: 52, sheetActRate: 23.2 },
      { m: 5, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 23.7, sheetDue: 230, sheetLease: 2, sheetLeaseRate: 0.9, sheetNoRenew: 65, sheetActRate: 28.3 },
      { m: 6, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 27.9, sheetDue: 258, sheetLease: 4, sheetLeaseRate: 1.6, sheetNoRenew: 73, sheetActRate: 28.3 },
      { m: 7, lyDue: 217, lyLease: null, lyLeaseRate: null, lyNoRenew: 49, lyRate: 22.6, sheetDue: 275, sheetLease: 6, sheetLeaseRate: 2.2, sheetNoRenew: 73, sheetActRate: 26.5 },
      { m: 8, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 26.0, sheetDue: 262, sheetLease: 18, sheetLeaseRate: 6.9, sheetNoRenew: 50, sheetActRate: 19.1 },
      { m: 9, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 22.6, sheetDue: 239, sheetLease: 18, sheetLeaseRate: 7.5, sheetNoRenew: 43, sheetActRate: 18.0 },
      /* 10 月起實績尚未定稿：sheetDue 留空；去年同期占比仍鎖試算表 */
      { m: 10, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 21.9, sheetDue: null, sheetLease: null, sheetLeaseRate: null, sheetNoRenew: null, sheetActRate: null },
      { m: 11, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 18.3, sheetDue: null, sheetLease: null, sheetLeaseRate: null, sheetNoRenew: null, sheetActRate: null },
      { m: 12, lyDue: null, lyLease: null, lyLeaseRate: null, lyNoRenew: null, lyRate: 21.3, sheetDue: null, sheetLease: null, sheetLeaseRate: null, sheetNoRenew: null, sheetActRate: null }
    ]
  };

  function regionAllFromLive(live, monthNum) {
    const liveM = live && live.months ? live.months[String(monthNum)] : null;
    return liveM && liveM.byRegion ? liveM.byRegion.all : null;
  }

  function buildNoRenewDashboard(live, liveLy) {
    const months = [];
    let sumDue = 0;
    let sumLease = 0;
    let sumNoRenew = 0;
    let sumTransfer = 0;
    let sumDueLy = 0;
    let sumLeaseLy = 0;
    let sumNoRenewLy = 0;
    let hasLyDue = false;
    const calMonth = new Date().getMonth() + 1;

    NORENEW_SHEET_YOY.months.forEach(function (row) {
      const all = regionAllFromLive(live, row.m);
      /* 有填 sheetDue → 實績鎖死試算表（1–9 月）；沒填才看系統／空白 */
      const useSheetAct = row.sheetDue != null && row.sheetDue !== '';
      const isFuture = row.m > calMonth;

      let due = null;
      let leasing = null;
      let noRenew = null;
      let actRate = null;
      let leaseRate = null;
      let actFromSystem = false;
      let transfer = null;
      /* 異常轉業＝工具箱勾選，跟試算表鎖月無關；與不續約率同一批 live 一起算 */
      if (!isFuture && all) {
        transfer = toNumber(all.noRenewTransfer);
        if (transfer != null) sumTransfer += transfer;
      }

      if (useSheetAct) {
        due = Number(row.sheetDue);
        leasing = row.sheetLease != null ? Number(row.sheetLease) : null;
        noRenew = row.sheetNoRenew != null ? Number(row.sheetNoRenew) : null;
        actRate = row.sheetActRate != null ? Number(row.sheetActRate) : null;
        leaseRate = row.sheetLeaseRate != null ? Number(row.sheetLeaseRate) : null;
        if (leaseRate == null && due != null && leasing != null && due > 0) {
          leaseRate = Math.round((leasing / due) * 1000) / 10;
        }
        if (actRate == null && due != null && noRenew != null && due > 0) {
          actRate = Math.round((noRenew / due) * 1000) / 10;
        }
      } else if (isFuture) {
        /* 未來月且表上未定稿：留空 */
      } else {
        due = all ? toNumber(all.due) : null;
        leasing = all ? toNumber(all.leasing) : null;
        noRenew = all ? toNumber(all.noRenewAll) : null;
        actRate = all ? toNumber(String(all.noRenewRate || '').replace('%', '')) : null;
        if (actRate == null && due != null && noRenew != null && due > 0) {
          actRate = Math.round((noRenew / due) * 1000) / 10;
        }
        if (due != null && leasing != null && due > 0) {
          leaseRate = Math.round((leasing / due) * 1000) / 10;
        }
        actFromSystem = !!all;
      }

      /* 去年同期：試算表有填就鎖表，絕不用系統覆蓋 */
      let lyDue = row.lyDue != null ? Number(row.lyDue) : null;
      let lyLeasing = row.lyLease != null ? Number(row.lyLease) : null;
      let lyNoRenew = row.lyNoRenew != null ? Number(row.lyNoRenew) : null;
      let lyRate = row.lyRate != null ? Number(row.lyRate) : null;
      let lyLeaseRate = row.lyLeaseRate != null ? Number(row.lyLeaseRate) : null;
      if (lyNoRenew == null && lyDue != null && lyRate != null) {
        lyNoRenew = Math.round((lyDue * lyRate) / 100);
      }
      if (lyLeaseRate == null && lyDue != null && lyLeasing != null && lyDue > 0) {
        lyLeaseRate = Math.round((lyLeasing / lyDue) * 1000) / 10;
      }
      if (lyRate == null && lyDue != null && lyNoRenew != null && lyDue > 0) {
        lyRate = Math.round((lyNoRenew / lyDue) * 1000) / 10;
      }
      if (lyDue != null) {
        sumDueLy += lyDue;
        hasLyDue = true;
      }
      if (lyLeasing != null) sumLeaseLy += lyLeasing;
      if (lyNoRenew != null) sumNoRenewLy += lyNoRenew;

      if (due != null) sumDue += due;
      if (leasing != null) sumLease += leasing;
      if (noRenew != null) sumNoRenew += noRenew;

      months.push({
        m: row.m,
        ly: {
          due: lyDue,
          leasing: lyLeasing,
          leaseRate: lyLeaseRate,
          noRenew: lyNoRenew,
          noRenewRate: lyRate,
          fromSystem: false
        },
        act: {
          due: due,
          leasing: leasing,
          leaseRate: leaseRate,
          noRenew: noRenew,
          noRenewRate: actRate,
          abnormalTransfer: transfer,
          fromSystem: actFromSystem,
          fromSheet: useSheetAct
        }
      });
    });

    const sheetAnnLy = NORENEW_SHEET_YOY.annualLy || {};
    /* 年度實績＝已過月試算表＋當月系統累加；去年同期用試算表年度合計 */
    const annualActRate = sumDue > 0 ? Math.round((sumNoRenew / sumDue) * 1000) / 10 : null;
    const annualLeaseRate = sumDue > 0 ? Math.round((sumLease / sumDue) * 1000) / 10 : null;
    const annualAbnormalRate = sumDue > 0 ? Math.round((sumTransfer / sumDue) * 1000) / 10 : null;

    const annualLyRate = sheetAnnLy.noRenewRate != null
      ? sheetAnnLy.noRenewRate
      : (hasLyDue && sumDueLy > 0
        ? Math.round((sumNoRenewLy / sumDueLy) * 1000) / 10
        : 24.3);
    if (sheetAnnLy.due != null) {
      sumDueLy = sheetAnnLy.due;
      hasLyDue = true;
    }
    if (sheetAnnLy.leasing != null) sumLeaseLy = sheetAnnLy.leasing;
    if (sheetAnnLy.noRenew != null) sumNoRenewLy = sheetAnnLy.noRenew;
    const annualLyLeaseRate = sheetAnnLy.leaseRate != null
      ? sheetAnnLy.leaseRate
      : (sumDueLy > 0 && sumLeaseLy > 0
        ? Math.round((sumLeaseLy / sumDueLy) * 1000) / 10
        : null);

    const curMonthRow = months.find(function (x) { return x.m === calMonth; }) || null;
    const curDue = curMonthRow ? curMonthRow.act.due : null;
    const curTransfer = curMonthRow && curMonthRow.act.abnormalTransfer != null
      ? Number(curMonthRow.act.abnormalTransfer)
      : null;
    const curAbnormalRate =
      curDue != null && curDue > 0 && curTransfer != null
        ? Math.round((curTransfer / curDue) * 1000) / 10
        : null;
    const currentMonth = curMonthRow
      ? {
          m: calMonth,
          noRenewRate: curMonthRow.act.noRenewRate,
          lyNoRenewRate: curMonthRow.ly.noRenewRate,
          due: curMonthRow.act.due,
          noRenew: curMonthRow.act.noRenew,
          leasing: curMonthRow.act.leasing,
          leaseRate: curMonthRow.act.leaseRate,
          abnormalTransfer: curTransfer,
          abnormalRate: curAbnormalRate
        }
      : {
          m: calMonth,
          noRenewRate: null,
          lyNoRenewRate: null,
          due: null,
          noRenew: null,
          leasing: null,
          leaseRate: null,
          abnormalTransfer: null,
          abnormalRate: null
        };

    return {
      year: NORENEW_SHEET_YOY.year,
      sheetVer: NORENEW_SHEET_VER,
      months: months,
      currentMonth: currentMonth,
      annual: {
        lyNoRenewRate: annualLyRate,
        actNoRenewRate: annualActRate,
        leaseRate: annualLeaseRate,
        lyLeaseRate: annualLyLeaseRate,
        due: sumDue || null,
        leasing: sumLease || null,
        noRenew: sumNoRenew || null,
        abnormalTransfer: sumTransfer,
        abnormalRate: annualAbnormalRate,
        lyDue: hasLyDue ? sumDueLy : null,
        lyLeasing: sumLeaseLy || null,
        lyNoRenew: sumNoRenewLy || null
      },
      chart: {
        labels: months.map(function (x) { return x.m + '月'; }),
        lyRates: months.map(function (x) { return x.ly.noRenewRate; }),
        actRates: months.map(function (x) { return x.act.noRenewRate; }),
        leaseRates: months.map(function (x) { return x.act.leaseRate; })
      },
      fetchedAt: (live && live.fetchedAt) || null
    };
  }

  function loadNoRenewDashboard() {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const monthsAll = '1,2,3,4,5,6,7,8,9,10,11,12';
    return Promise.all([
      fetchLiveRenewKpi(token, monthsAll, 115),
      fetchLiveRenewKpi(token, monthsAll, 114)
    ]).then(function (pair) {
      return buildNoRenewDashboard(pair[0], pair[1]);
    });
  }

  function fetchNoRenewDetail(month) {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const q = new URLSearchParams({ year: '115', month: String(Number(month) || 1) });
    const headers = {};
    if (token) headers['X-Skyfun-Session'] = token;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 60000) : null;
    return fetch(RPA_BASE + '/admin-points/renew-norenew-detail?' + q.toString(), {
      headers: headers,
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('renew-norenew-detail HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '載入明細失敗');
        return data;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') throw new Error('載入逾時，請再試一次');
        throw err;
      });
  }

  function setNoRenewAbnormal(matchNo, abnormal) {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Skyfun-Session'] = token;
    return fetch(RPA_BASE + '/admin-points/renew-abnormal-transfer', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ matchNo: matchNo, abnormal: abnormal })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data || data.ok === false) {
            throw new Error((data && data.error) || '寫入失敗');
          }
          return data;
        });
      });
  }

  /**
   * 勾選異常轉業後：重抓該月續約 KPI，把異常件數／扣除異常率寫回續約模組 byMonth。
   * @param {object} renewByMonth  cache.modules.renew.byMonth
   * @param {number|string} month  民國月 1–12 或 '10'
   */
  function refreshRenewAbnormalOverlay(renewByMonth, month) {
    const monthId = pad2(Number(month) || 0);
    if (!renewByMonth || !renewByMonth[monthId]) {
      return Promise.resolve(renewByMonth);
    }
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    return fetchLiveRenewKpi(token, String(Number(monthId)), 115).then(function (live) {
      if (!live || !live.months) return renewByMonth;
      const block = live.months[String(Number(monthId))] || live.months[monthId];
      if (!block || !block.byRegion) return renewByMonth;
      const weekIndexes = liveWeekIndexesForMonth(monthId);
      weekIndexes.forEach(function (wi) {
        clearLiveOverwritable(renewByMonth, monthId, wi);
        overlayLiveMonth(renewByMonth, block.byRegion, monthId, wi);
      });
      return renewByMonth;
    });
  }

  /** 催收狀態寫入（媒合／轉租編號＝caseId） */
  function setCollectStatus(caseId, status) {
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Skyfun-Session'] = token;
    return fetch(RPA_BASE + '/admin-points/renew-collect-status', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        matchNo: caseId,
        status: status == null || status === '' ? '' : status
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data || data.ok === false) {
            throw new Error((data && data.error) || '寫入失敗');
          }
          return data;
        });
      });
  }

  const setNoRenewCollectStatus = setCollectStatus;

  const DETAIL_METRICS = {
    due: true,
    done: true,
    presign: true,
    tracking: true,
    leasing: true,
    noRenewAll: true
  };

  function canOpenRenewDetail(metricKey) {
    return !!DETAIL_METRICS[metricKey];
  }

  function fetchRenewKpiDetail(opts) {
    const year = (opts && opts.year) || 115;
    const month = Number(opts && opts.month);
    const region = (opts && opts.region) || 'all';
    const metric = (opts && opts.metric) || '';
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';
    const q = new URLSearchParams({
      year: String(year),
      month: String(month),
      region: String(region),
      metric: String(metric)
    });
    const headers = {};
    if (token) headers['X-Skyfun-Session'] = token;
    return fetch(RPA_BASE + '/admin-points/renew-kpi-detail?' + q.toString(), { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('renew-kpi-detail HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error(data && data.error ? data.error : 'renew-kpi-detail');
        return data;
      });
  }

  function overviewKpiKeyFromLabel(label) {
    const s = String(label || '').replace(/\s+/g, '').replace(/\n/g, '');
    if (/當月續約率/.test(s) && /扣除|惡意|異常轉業/.test(s)) return 'renewRateExcl';
    if (/續約率/.test(s) && /異常轉業者/.test(s)) return 'renewRateExcl';
    if (/當月續約率/.test(s)) return 'renewRate';
    if (/領先續約率/.test(s) && /次次月/.test(s)) return 'leadRenewNext2';
    if (/領先續約率/.test(s) && /次月/.test(s)) return 'leadRenewNext';
    if (/續轉包率/.test(s)) return 'toBaoRate';
    if (/再媒合|再媒介/.test(s)) return 'reLeaseRate';
    if (/催收/.test(s) && /30/.test(s)) return 'collectOver30';
    return null;
  }

  function metricKind(key) {
    return key === 'collectOver30' ? 'count' : 'rate';
  }

  function metricDef(key) {
    for (let i = 0; i < REGION_KPI_METRICS.length; i++) {
      if (REGION_KPI_METRICS[i].key === key) return REGION_KPI_METRICS[i];
    }
    return null;
  }

  /** 試算表地區欄標題 → REGIONS.id（「台北 第一週」等） */
  const REGION_HEADER_TO_ID = [
    { re: /全區/, id: 'all' },
    { re: /總計/, id: 'all' },
    { re: /台北|臺北/, id: 'tpe' },
    { re: /新北/, id: 'ntpc' },
    { re: /桃園/, id: 'tyn' },
    { re: /台中|臺中/, id: 'txg' },
    { re: /彰化/, id: 'chw' },
    { re: /南投/, id: 'nan' },
    { re: /嘉義/, id: 'cyi' },
    { re: /台南|臺南/, id: 'tnn' },
    { re: /高雄/, id: 'khh' }
  ];

  function detectRegionStarts(cols) {
    const starts = [];
    const seen = {};
    (cols || []).forEach(function (col, i) {
      const lab = String((col && col.label) || '');
      if (!/第一週|第\s*1\s*週/.test(lab)) return;
      for (let k = 0; k < REGION_HEADER_TO_ID.length; k++) {
        const hit = REGION_HEADER_TO_ID[k];
        if (!hit.re.test(lab)) continue;
        if (seen[hit.id]) break;
        seen[hit.id] = true;
        starts.push({ id: hit.id, start: i });
        break;
      }
    });
    if (!starts.length) {
      starts.push({ id: 'all', start: 6 });
    }
    return starts;
  }

  function lastWeekValue(row, startCol, kind) {
    let last = null;
    for (let w = 0; w < MAX_DISPLAY_WEEKS; w++) {
      const v = parseOverviewNumber(normalizeSheetCell(row[startCol + w]), kind);
      if (v != null) last = v;
    }
    return last;
  }

  function formatRegionKpiDisplay(key, value) {
    if (value == null || value === '') return null;
    if (key === 'collectCount' || key === 'collectOver30') {
      return String(Math.round(Number(value)));
    }
    const n = Number(value);
    if (!isFinite(n)) return String(value);
    return (Math.round(n * 10) / 10) + '%';
  }

  /** 比率：試算表可能是 0.5 或 50%；件數取整 */
  function parseOverviewNumber(raw, kind) {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).trim();
    if (!s || s === '-' || s === '—' || s === '#N/A') return null;
    const n = toNumber(s);
    if (n == null) return null;
    if (kind === 'count') return Math.round(n);
    if (!/%/.test(s) && n >= 0 && n <= 1) return Math.round(n * 1000) / 10;
    return Math.round(n * 10) / 10;
  }

  /** 全區欄空白／0 時，加總各區同週數字（催收件數常見） */
  function sumRegionWeekCount(row, weekIndex) {
    let sum = 0;
    let found = false;
    for (let start = 11; start + weekIndex < row.length; start += 5) {
      const v = parseOverviewNumber(normalizeSheetCell(row[start + weekIndex]), 'count');
      if (v == null) continue;
      found = true;
      sum += v;
    }
    return found ? sum : null;
  }

  function weekValuesAt(row, startCol, kind) {
    const weeks = [];
    for (let w = 0; w < MAX_DISPLAY_WEEKS; w++) {
      weeks.push(parseOverviewNumber(normalizeSheetCell(row[startCol + w]), kind));
    }
    return weeks;
  }

  /** 北區／南區欄位起點：週報每區 5 欄；南區與北區同欄位、第二段資料列 */
  function regionStartsForBlock(kind, northStarts) {
    const base = (northStarts && northStarts.length)
      ? northStarts
      : [
          { id: 'all', start: 6 },
          { id: 'tpe', start: 11 },
          { id: 'ntpc', start: 16 },
          { id: 'tyn', start: 21 },
          { id: 'txg', start: 26 }
        ];
    if (kind !== 'south') return base.slice();
    return REGION_KPI_SOUTH.map(function (r, idx) {
      const src = base[idx] || base[base.length - 1];
      return { id: r.id, start: src.start };
    });
  }

  function monthRegionStarts(kind) {
    const north = [
      { id: 'all', start: 4 },
      { id: 'tpe', start: 7 },
      { id: 'ntpc', start: 10 },
      { id: 'tyn', start: 13 },
      { id: 'txg', start: 16 }
    ];
    if (kind !== 'south') return north;
    return REGION_KPI_SOUTH.map(function (r, idx) {
      return { id: r.id, start: north[idx].start };
    });
  }

  function parseRegionKpiBlock(rows, startIndex, regionStarts) {
    const out = {};
    const byRegion = {};
    const matrix = [];
    const starts = regionStarts && regionStarts.length ? regionStarts : [{ id: 'all', start: 6 }];
    starts.forEach(function (rs) {
      byRegion[rs.id] = {};
    });
    let i = startIndex;
    for (; i < rows.length; i++) {
      const row = rows[i] || [];
      const section = String(row[1] || '').trim();
      if (/專案及例行性/.test(section) && Object.keys(out).length) break;
      if (/月各地區KPI/.test(section) && Object.keys(out).length) break;
      const key = overviewKpiKeyFromLabel(row[3]);
      if (!key) continue;
      const kind = metricKind(key);
      const weeks = weekValuesAt(row, starts[0] ? starts[0].start : 6, kind);
      /* 催收：全區尚未填時改用各區加總（僅北區全區欄） */
      if (kind === 'count' && starts[0] && starts[0].id === 'all') {
        for (let w = 0; w < weeks.length; w++) {
          if (weeks[w] != null && weeks[w] !== 0) continue;
          const summed = sumRegionWeekCount(row, w);
          if (summed != null && summed > 0) weeks[w] = summed;
        }
      }
      let wi = -1;
      for (let w = weeks.length - 1; w >= 0; w--) {
        if (weeks[w] != null) {
          wi = w;
          break;
        }
      }
      const value = wi >= 0 ? weeks[wi] : null;
      const prev = wi >= 1 ? weeks[wi - 1] : null;
      const ly = parseOverviewNumber(normalizeSheetCell(row[4]), kind);
      const goal = parseOverviewNumber(normalizeSheetCell(row[5]), kind);
      out[key] = {
        value: value,
        prev: prev,
        delta: value != null && prev != null ? Math.round((value - prev) * 10) / 10 : null,
        goal: goal,
        ly: ly,
        weekIndex: wi,
        weeks: weeks
      };
      const regionWeeks = {};
      starts.forEach(function (rs) {
        const wks = weekValuesAt(row, rs.start, kind);
        const rv = lastWeekValue(row, rs.start, kind);
        byRegion[rs.id][key] = rv;
        if (key === 'collectOver30') byRegion[rs.id].collectCount = rv;
        regionWeeks[rs.id] = { weeks: wks, value: rv };
      });
      if (byRegion.all && byRegion.all[key] == null && value != null) {
        byRegion.all[key] = value;
        if (key === 'collectOver30') byRegion.all.collectCount = value;
        if (regionWeeks.all) regionWeeks.all.value = value;
      }
      const def = metricDef(key);
      matrix.push({
        key: key,
        label: (def && def.label) || String(row[3] || '').replace(/\s+/g, ' ').trim(),
        section: (def && def.section) || section,
        weight: (def && def.weight) || String(row[2] || '').trim(),
        kind: kind,
        ly: ly,
        goal: goal,
        byRegion: regionWeeks
      });
    }
    return { metrics: out, regions: byRegion, matrix: matrix, nextIndex: i };
  }

  /** 從試算表標題列推月份，例如「115年10月各地區KPI週報」→ 10 */
  function monthIdFromKpiTitle(title) {
    const m = String(title || '').match(/(\d{1,2})\s*月/);
    if (!m) return null;
    return pad2(Number(m[1]));
  }

  /**
   * 週報：上表北區、下表南區（同欄位第二段）。回傳 metrics／regions／weekMatrix。
   */
  function parseRegionKpiOverview(rows, title, cols) {
    const metricsByMonth = {};
    const regionsByMonth = {};
    const weekMatrixByMonth = {};
    const northStarts = detectRegionStarts(cols);
    const titleMonth = monthIdFromKpiTitle(title) || '10';
    let i = 0;
    let blockIdx = 0;
    while (i < rows.length) {
      const section = String((rows[i] && rows[i][1]) || '').trim();
      if (/專案及例行性/.test(section)) {
        i += 1;
        continue;
      }
      if (!overviewKpiKeyFromLabel((rows[i] && rows[i][3]) || '')) {
        i += 1;
        continue;
      }
      const isSouth = blockIdx % 2 === 1;
      const starts = regionStartsForBlock(isSouth ? 'south' : 'north', northStarts);
      const parsed = parseRegionKpiBlock(rows, i, starts);
      if (Object.keys(parsed.metrics).length) {
        const monthId = titleMonth;
        /* 全區總覽卡只用北區段；南區段只併入分區 */
        if (!isSouth) {
          metricsByMonth[monthId] = Object.assign({}, metricsByMonth[monthId] || {}, parsed.metrics);
        }
        const prevRegions = regionsByMonth[monthId] || {};
        Object.keys(parsed.regions || {}).forEach(function (rid) {
          prevRegions[rid] = Object.assign({}, prevRegions[rid] || {}, parsed.regions[rid]);
        });
        regionsByMonth[monthId] = prevRegions;
        const titleMm = String(title).match(/(\d{1,2})\s*月/);
        const pack = weekMatrixByMonth[monthId] || {
          monthId: monthId,
          title: title,
          lyLabel: '去年同期',
          goalLabel: titleMm ? (Number(titleMm[1]) + '月目標') : '本月目標',
          weekLabels: weekLabelsForMonth(monthId),
          north: [],
          south: []
        };
        if (isSouth) pack.south = parsed.matrix || [];
        else pack.north = parsed.matrix || [];
        weekMatrixByMonth[monthId] = pack;
        blockIdx += 1;
      }
      i = Math.max(parsed.nextIndex, i + 1);
    }
    return {
      metricsByMonth: metricsByMonth,
      regionsByMonth: regionsByMonth,
      weekMatrixByMonth: weekMatrixByMonth
    };
  }

  function parseMonthTriple(row, start, kind) {
    return {
      ly: parseOverviewNumber(normalizeSheetCell(row[start]), kind),
      target: parseOverviewNumber(normalizeSheetCell(row[start + 1]), kind),
      actual: parseOverviewNumber(normalizeSheetCell(row[start + 2]), kind)
    };
  }

  /** 月報：依標題列切月份；每月份北區一段＋南區一段 */
  function parseRegionKpiMonthSheet(rows, colTitle) {
    const byMonth = {};
    let currentMonth = monthIdFromKpiTitle(colTitle) || '01';
    let blockInMonth = 0;
    let i = 0;
    while (i < rows.length) {
      const section = String((rows[i] && rows[i][1]) || '').trim();
      const titleHit = section.match(/(\d{1,2})\s*月.*各地區KPI月報/);
      if (titleHit) {
        currentMonth = pad2(Number(titleHit[1]));
        blockInMonth = 0;
        i += 1;
        continue;
      }
      if (/專案及例行性/.test(section)) {
        i += 1;
        continue;
      }
      if (!overviewKpiKeyFromLabel((rows[i] && rows[i][3]) || '')) {
        i += 1;
        continue;
      }
      const isSouth = blockInMonth % 2 === 1;
      const starts = monthRegionStarts(isSouth ? 'south' : 'north');
      const matrix = [];
      const regions = {};
      starts.forEach(function (rs) { regions[rs.id] = {}; });
      let j = i;
      for (; j < rows.length; j++) {
        const row = rows[j] || [];
        const sec = String(row[1] || '').trim();
        if (/專案及例行性/.test(sec) && matrix.length) break;
        if (/月各地區KPI/.test(sec) && matrix.length) break;
        const key = overviewKpiKeyFromLabel(row[3]);
        if (!key) continue;
        const kind = metricKind(key);
        const def = metricDef(key);
        const byRegion = {};
        starts.forEach(function (rs) {
          const triple = parseMonthTriple(row, rs.start, kind);
          byRegion[rs.id] = triple;
          regions[rs.id][key] = triple.actual;
          if (key === 'collectOver30') regions[rs.id].collectCount = triple.actual;
        });
        const allTriple = byRegion[starts[0].id] || {};
        matrix.push({
          key: key,
          label: (def && def.label) || String(row[3] || '').replace(/\s+/g, ' ').trim(),
          section: (def && def.section) || sec,
          weight: (def && def.weight) || String(row[2] || '').trim(),
          kind: kind,
          ly: allTriple.ly,
          goal: allTriple.target,
          byRegion: byRegion
        });
      }
      if (matrix.length) {
        const pack = byMonth[currentMonth] || {
          monthId: currentMonth,
          title: '115年' + Number(currentMonth) + '月各地區KPI月報',
          north: [],
          south: []
        };
        if (isSouth) pack.south = matrix;
        else pack.north = matrix;
        const prevReg = pack.regions || {};
        Object.keys(regions).forEach(function (rid) {
          prevReg[rid] = Object.assign({}, prevReg[rid] || {}, regions[rid]);
        });
        pack.regions = prevReg;
        byMonth[currentMonth] = pack;
        blockInMonth += 1;
      }
      i = Math.max(j, i + 1);
    }
    return byMonth;
  }

  function fetchGvizJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('sheet HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end < start) throw new Error('試算表格式錯誤');
      const data = JSON.parse(text.slice(start, end + 1));
      const cols = (data.table && data.table.cols) || [];
      const title = (cols[1] && cols[1].label) || (cols[0] && cols[0].label) || '';
      return { cols: cols, title: title, rows: parseGvizTable(text) };
    });
  }

  function fetchRegionKpiOverview() {
    return Promise.all([
      fetchGvizJson(REGION_KPI_SHEET_GVIZ).catch(function () { return null; }),
      fetchGvizJson(REGION_KPI_MONTH_SHEET_GVIZ).catch(function () { return null; })
    ]).then(function (pair) {
      const weekSrc = pair[0];
      const monthSrc = pair[1];
      const week = weekSrc
        ? parseRegionKpiOverview(weekSrc.rows, weekSrc.title, weekSrc.cols)
        : { metricsByMonth: {}, regionsByMonth: {}, weekMatrixByMonth: {} };
      const monthById = monthSrc
        ? parseRegionKpiMonthSheet(monthSrc.rows, monthSrc.title)
        : {};
      return {
        metricsByMonth: week.metricsByMonth,
        regionsByMonth: week.regionsByMonth,
        weekMatrixByMonth: week.weekMatrixByMonth,
        monthMatrixByMonth: monthById
      };
    }).catch(function () {
      return {
        metricsByMonth: {},
        regionsByMonth: {},
        weekMatrixByMonth: {},
        monthMatrixByMonth: {}
      };
    });
  }

  /** 從續約週表取某區某月最近有值的續約率 */
  function pickRenewRegionMetric(byMonth, monthId, regionId, metricKey) {
    const weeks =
      byMonth &&
      byMonth[monthId] &&
      byMonth[monthId].byRegion &&
      byMonth[monthId].byRegion[regionId] &&
      byMonth[monthId].byRegion[regionId].weeks;
    if (!weeks || !weeks.length) return null;
    for (let wi = weeks.length - 1; wi >= 0; wi--) {
      const cell = weeks[wi] || {};
      const value = parseOverviewNumber(cell[metricKey], /Rate/.test(metricKey) ? 'rate' : 'count');
      if (value != null) return value;
    }
    return null;
  }

  function shiftMonthId(monthId, delta) {
    let m = Number(monthId) + Number(delta);
    while (m > 12) m -= 12;
    while (m < 1) m += 12;
    return pad2(m);
  }

  /** 從續約某月各地區取即時／最近一週比率（領先月常用） */
  function pickLiveRenewRate(renewByMonth, monthId, regionId, metricKey) {
    const weeks =
      renewByMonth &&
      renewByMonth[monthId] &&
      renewByMonth[monthId].byRegion &&
      renewByMonth[monthId].byRegion[regionId] &&
      renewByMonth[monthId].byRegion[regionId].weeks;
    if (!weeks || !weeks.length) return null;
    const cur = currentSheetWeekIndex();
    const order = [];
    if (cur && cur.monthId === monthId) order.push(cur.weekIndex);
    for (let wi = weeks.length - 1; wi >= 0; wi--) {
      if (order.indexOf(wi) < 0) order.push(wi);
    }
    for (let i = 0; i < order.length; i++) {
      const v = parseOverviewNumber((weeks[order[i]] || {})[metricKey], 'rate');
      if (v != null) return v;
    }
    return null;
  }

  /**
   * 月報「控管包租催收30天以上」各地區目標：
   * 台北／新北／台中／台南／高雄＝1；其餘地區＝0；全區維持試算表（不動）。
   */
  const COLLECT_MONTH_TARGET_BY_REGION = {
    tpe: 1,
    ntpc: 1,
    txg: 1,
    tnn: 1,
    khh: 1,
    tyn: 0,
    chw: 0,
    nan: 0,
    cyi: 0
  };

  function applyCollectMonthTargets(monthPack) {
    if (!monthPack) return monthPack;
    function patchRows(rows) {
      (rows || []).forEach(function (row) {
        if (!row || row.key !== 'collectOver30' || !row.byRegion) return;
        Object.keys(row.byRegion).forEach(function (rid) {
          if (rid === 'all') return;
          if (!Object.prototype.hasOwnProperty.call(COLLECT_MONTH_TARGET_BY_REGION, rid)) return;
          const cell = row.byRegion[rid];
          if (!cell) return;
          cell.target = COLLECT_MONTH_TARGET_BY_REGION[rid];
        });
      });
    }
    Object.keys(monthPack).forEach(function (mid) {
      const pack = monthPack[mid];
      if (!pack) return;
      patchRows(pack.north);
      patchRows(pack.south);
    });
    return monthPack;
  }

  /** 催收案件縣市 → 各地區 KPI 地區 id */
  function collectCityToRegionId(city) {
    const s = String(city || '');
    if (/台北|臺北/.test(s)) return 'tpe';
    if (/新北/.test(s)) return 'ntpc';
    if (/桃園/.test(s)) return 'tyn';
    if (/台中|臺中/.test(s)) return 'txg';
    if (/彰化/.test(s)) return 'chw';
    if (/南投/.test(s)) return 'nan';
    if (/嘉義/.test(s)) return 'cyi';
    if (/台南|臺南/.test(s)) return 'tnn';
    if (/高雄/.test(s)) return 'khh';
    return null;
  }

  /** 從催收儀表板彙總各地區「30天以上」件數（含全區） */
  function collectOver30ByRegion(collectSummary) {
    const out = { all: 0 };
    const cases = (collectSummary && collectSummary.cases) || [];
    cases.forEach(function (c) {
      if (!c || !(Number(c.maxDays) >= 30)) return;
      out.all += 1;
      const rid = collectCityToRegionId(c.city);
      if (!rid) return;
      out[rid] = (out[rid] || 0) + 1;
    });
    if (!cases.length && collectSummary && collectSummary.over30) {
      out.all = Number(collectSummary.over30.cases) || 0;
    }
    return out;
  }

  /**
   * 各地區 KPI：本週／第4週起改吃系統爬數（不向前帶上一週）。
   * - 當月續約率：當月續約管理（不含再媒合；再媒合另列）
   * - 領先續約率_次月／次次月：下一個／下兩個月到期戶的續約率
   * - 續轉包率：當月續約管理算出的 toBaoRate
   * - 再媒合完成招租：算回開始重新招租那個月（reLeaseRate）
   * - 催收30天以上：本週／第4週起改吃催收系統快照
   */
  function overlayRenewOntoRegionWeekMatrix(weekPack, renewByMonth, monthId, collectByRegion) {
    if (!weekPack || !monthId) return weekPack;
    const renewBlock = renewByMonth && renewByMonth[monthId];
    const weekN = weekCountForMonth(monthId);
    const liveWis = liveWeekIndexesForMonth(monthId);
    const nextId = shiftMonthId(monthId, 1);
    const next2Id = shiftMonthId(monthId, 2);
    const collectMap = collectByRegion || null;

    function liveValueForRow(rowKey, rid, wi) {
      if (rowKey === 'renewRate') {
        const cell = renewBlock && renewBlock.byRegion && renewBlock.byRegion[rid] &&
          renewBlock.byRegion[rid].weeks && renewBlock.byRegion[rid].weeks[wi];
        return parseOverviewNumber(cell && cell.renewRateAll, 'rate');
      }
      if (rowKey === 'renewRateExcl') {
        const cell = renewBlock && renewBlock.byRegion && renewBlock.byRegion[rid] &&
          renewBlock.byRegion[rid].weeks && renewBlock.byRegion[rid].weeks[wi];
        return parseOverviewNumber(cell && cell.renewRateExcl, 'rate');
      }
      if (rowKey === 'leadRenewNext') {
        return pickLiveRenewRate(renewByMonth, nextId, rid, 'renewRateAll');
      }
      if (rowKey === 'leadRenewNext2') {
        return pickLiveRenewRate(renewByMonth, next2Id, rid, 'renewRateAll');
      }
      if (rowKey === 'toBaoRate') {
        const cell = renewBlock && renewBlock.byRegion && renewBlock.byRegion[rid] &&
          renewBlock.byRegion[rid].weeks && renewBlock.byRegion[rid].weeks[wi];
        const fromWeek = parseOverviewNumber(cell && cell.toBaoRate, 'rate');
        if (fromWeek != null) return fromWeek;
        return pickLiveRenewRate(renewByMonth, monthId, rid, 'toBaoRate');
      }
      if (rowKey === 'reLeaseRate') {
        const cell = renewBlock && renewBlock.byRegion && renewBlock.byRegion[rid] &&
          renewBlock.byRegion[rid].weeks && renewBlock.byRegion[rid].weeks[wi];
        const fromWeek = parseOverviewNumber(cell && cell.reLeaseRate, 'rate');
        if (fromWeek != null) return fromWeek;
        return pickLiveRenewRate(renewByMonth, monthId, rid, 'reLeaseRate');
      }
      if (rowKey === 'collectOver30') {
        if (!collectMap) return null;
        if (rid === 'all') return collectMap.all != null ? collectMap.all : null;
        return collectMap[rid] != null ? collectMap[rid] : 0;
      }
      return null;
    }

    function applyRows(rows) {
      (rows || []).forEach(function (row) {
        if (!row || !row.byRegion) return;
        if (!/^(renewRate|renewRateExcl|leadRenewNext|leadRenewNext2|toBaoRate|reLeaseRate|collectOver30)$/.test(row.key || '')) {
          return;
        }
        Object.keys(row.byRegion).forEach(function (rid) {
          const cell = row.byRegion[rid];
          if (!cell) return;
          const weeks = (cell.weeks || []).slice();
          while (weeks.length < weekN) weeks.push(null);
          for (let wi = 0; wi < weekN; wi++) {
            const isLive = liveWis.indexOf(wi) >= 0 || wi >= SHEET_WEEK_COLS;
            /* 催收：空白週也補系統快照（試算表常漏填） */
            const forceCollect = row.key === 'collectOver30' && weeks[wi] == null && collectMap;
            if (!isLive && !forceCollect && weeks[wi] != null) continue;
            if (!isLive && !forceCollect && wi < SHEET_WEEK_COLS) continue;
            const v = liveValueForRow(row.key, rid, Math.min(wi, weekN - 1));
            if (v != null) weeks[wi] = v;
          }
          cell.weeks = weeks;
          let last = null;
          for (let wi = weeks.length - 1; wi >= 0; wi--) {
            if (weeks[wi] != null) {
              last = weeks[wi];
              break;
            }
          }
          if (last != null) cell.value = last;
        });
      });
    }

    applyRows(weekPack.north);
    applyRows(weekPack.south);
    weekPack.weekLabels = weekLabelsForMonth(monthId);
    return weekPack;
  }

  function pickMonthMatrixAllCell(monthPack, monthId, metricKey) {
    const pack = monthPack && monthPack[monthId];
    if (!pack) return null;
    const rows = [].concat(pack.north || [], pack.south || []);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].key === metricKey) {
        const cell = rows[i].byRegion && rows[i].byRegion.all;
        if (!cell) return { ly: rows[i].ly, target: rows[i].goal, actual: null };
        return {
          ly: cell.ly != null ? cell.ly : rows[i].ly,
          target: cell.target != null ? cell.target : rows[i].goal,
          actual: cell.actual
        };
      }
    }
    return null;
  }

  function defaultAnnualTarget(key, month) {
    if (key === 'renewRate' || key === 'renewRateExcl') return month <= 6 ? 80 : 85;
    if (key === 'leadRenewNext') return 60;
    if (key === 'leadRenewNext2') return 35;
    if (key === 'toBaoRate') return 20;
    if (key === 'reLeaseRate') return 70;
    if (key === 'collectOver30') return 5;
    return null;
  }

  /**
   * 年報：1–9 月用圖面靜態；10 月起吃系統（月報全區／續約爬數／催收快照）。
   */
  function buildAnnualKpiPack(renewByMonth, monthPack, collectByRegion) {
    const rows = ANNUAL_KPI_ROWS.map(function (def) {
      const byMonth = {};
      for (let m = 1; m <= 12; m++) {
        const mid = pad2(m);
        if (m < ANNUAL_LIVE_FROM_MONTH) {
          const st = (ANNUAL_KPI_STATIC[def.key] && ANNUAL_KPI_STATIC[def.key][m]) || {};
          byMonth[m] = {
            ly: st.ly != null ? st.ly : null,
            target: st.target != null ? st.target : defaultAnnualTarget(def.key, m),
            actual: st.actual != null ? st.actual : null,
            source: 'sheet-image'
          };
          continue;
        }
        const fromMatrix = pickMonthMatrixAllCell(monthPack, mid, def.key);
        const stLy = (ANNUAL_KPI_STATIC[def.key] && ANNUAL_KPI_STATIC[def.key][m]) || {};
        let ly =
          fromMatrix && fromMatrix.ly != null
            ? fromMatrix.ly
            : stLy.ly != null
              ? stLy.ly
              : null;
        let target =
          fromMatrix && fromMatrix.target != null
            ? fromMatrix.target
            : stLy.target != null
              ? stLy.target
              : defaultAnnualTarget(def.key, m);
        let actual = fromMatrix && fromMatrix.actual != null ? fromMatrix.actual : null;
        let source = fromMatrix && fromMatrix.actual != null ? 'month-sheet' : null;

        if (def.key === 'renewRate') {
          const live = pickLiveRenewRate(renewByMonth, mid, 'all', 'renewRateAll');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'renewRateExcl') {
          const live = pickLiveRenewRate(renewByMonth, mid, 'all', 'renewRateExcl');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'leadRenewNext') {
          const live = pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 1), 'all', 'renewRateAll');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'leadRenewNext2') {
          const live = pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 2), 'all', 'renewRateAll');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'toBaoRate') {
          const live = pickLiveRenewRate(renewByMonth, mid, 'all', 'toBaoRate');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'reLeaseRate') {
          const live = pickLiveRenewRate(renewByMonth, mid, 'all', 'reLeaseRate');
          if (live != null) {
            actual = live;
            source = 'system';
          }
        } else if (def.key === 'collectOver30') {
          if (collectByRegion && collectByRegion.all != null && m === new Date().getMonth() + 1) {
            actual = collectByRegion.all;
            source = 'system';
          } else if (actual == null && fromMatrix && fromMatrix.actual != null) {
            actual = fromMatrix.actual;
            source = 'month-sheet';
          }
        }

        byMonth[m] = { ly: ly, target: target, actual: actual, source: source || 'pending' };
      }
      return {
        key: def.key,
        label: def.label,
        section: def.section,
        weight: def.weight,
        kind: def.kind,
        byMonth: byMonth
      };
    });
    return {
      title: '115年度租管部KPI月報',
      note: '1–9 月＝年報圖面；10 月起＝系統爬數／月報全區',
      halves: [
        { id: 'h1', label: '1–6月', months: [1, 2, 3, 4, 5, 6] },
        { id: 'h2', label: '7–12月', months: [7, 8, 9, 10, 11, 12] }
      ],
      rows: rows
    };
  }

  function buildRegionKpiModule(sheetRegions, renewByMonth, monthId, weekPack, monthPack, collectByRegion) {
    const payload = emptyModulePayload(MODULES.regionKpi);
    const mid = monthId || defaultOverviewMonthId();
    const src = sheetRegions || {};
    const all = src.all || {};
    const monthFixed = applyCollectMonthTargets(
      monthPack ? Object.assign({}, monthPack) : {}
    );
    const syncedWeekPack = overlayRenewOntoRegionWeekMatrix(
      weekPack ? Object.assign({}, weekPack) : null,
      renewByMonth,
      mid,
      collectByRegion || null
    );

    (MODULES.regionKpi.cards || []).forEach(function (c) {
      let raw = all[c.key];
      if (raw == null && c.key === 'collectCount') raw = all.collectOver30;
      if (c.key === 'collectCount' && collectByRegion && collectByRegion.all != null) {
        raw = collectByRegion.all;
      }
      if (raw == null && c.key === 'renewRate') {
        raw = pickRenewRegionMetric(renewByMonth, mid, 'all', 'renewRateAll');
      }
      if (raw == null && c.key === 'leadRenewNext') {
        raw = pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 1), 'all', 'renewRateAll');
      }
      if (raw == null && c.key === 'toBaoRate') {
        raw = pickLiveRenewRate(renewByMonth, mid, 'all', 'toBaoRate');
      }
      payload.cards[c.key] = formatRegionKpiDisplay(c.key, raw);
    });

    REGIONS.forEach(function (r) {
      const row = src[r.id] || {};
      const out = payload.regions[r.id] || emptyRegionRow(MODULES.regionKpi.columns);
      (MODULES.regionKpi.columns || []).forEach(function (col) {
        let raw = row[col.key];
        if (raw == null && col.key === 'collectCount') raw = row.collectOver30;
        if (col.key === 'collectCount' && collectByRegion) {
          raw = r.id === 'all' ? collectByRegion.all : (collectByRegion[r.id] || 0);
        }
        if (raw == null && col.key === 'renewRate') {
          raw = pickRenewRegionMetric(renewByMonth, mid, r.id, 'renewRateAll');
        }
        if (raw == null && col.key === 'leadRenewNext') {
          raw = pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 1), r.id, 'renewRateAll');
        }
        if (raw == null && col.key === 'toBaoRate') {
          raw = pickLiveRenewRate(renewByMonth, mid, r.id, 'toBaoRate');
        }
        out[col.key] = formatRegionKpiDisplay(col.key, raw);
      });
      payload.regions[r.id] = out;
    });
    /* 月報催收實績：空白時補系統；目標已在 applyCollectMonthTargets 調整 */
    if (collectByRegion) {
      overlayCollectOntoMonthMatrix(monthFixed, mid, collectByRegion);
    }
    /* 月報再媒合／續約率：有系統 reLeaseRate 時疊上（算回開始招租月） */
    overlayReLeaseOntoMonthMatrix(monthFixed, renewByMonth);

    payload.monthId = mid;
    payload.view = 'week';
    payload.weekMatrix = syncedWeekPack || null;
    payload.monthMatrixByMonth = monthFixed || {};
    payload.monthIds = Object.keys(monthFixed || {}).sort();
    if (payload.monthIds.indexOf(mid) < 0 && mid) {
      /* 月報缺當月時，用週報最近一週合成月視圖 */
      if (syncedWeekPack && (syncedWeekPack.north || syncedWeekPack.south)) {
        payload.monthMatrixByMonth[mid] = synthesizeMonthFromWeek(syncedWeekPack, mid);
        applyCollectMonthTargets(payload.monthMatrixByMonth);
        if (collectByRegion) {
          overlayCollectOntoMonthMatrix(payload.monthMatrixByMonth, mid, collectByRegion);
        }
        overlayReLeaseOntoMonthMatrix(payload.monthMatrixByMonth, renewByMonth);
        payload.monthIds = Object.keys(payload.monthMatrixByMonth).sort();
      }
    }
    payload.annualKpi = buildAnnualKpiPack(renewByMonth, payload.monthMatrixByMonth, collectByRegion);
    return payload;
  }

  function overlayCollectOntoMonthMatrix(monthPack, monthId, collectByRegion) {
    if (!monthPack || !collectByRegion) return;
    const pack = monthPack[monthId];
    if (!pack) return;
    function patch(rows) {
      (rows || []).forEach(function (row) {
        if (!row || row.key !== 'collectOver30' || !row.byRegion) return;
        Object.keys(row.byRegion).forEach(function (rid) {
          const cell = row.byRegion[rid];
          if (!cell) return;
          const v = rid === 'all' ? collectByRegion.all : collectByRegion[rid];
          if (v == null) return;
          /* 實績空白或 0 且系統有數 → 改吃系統；全區／各地有系統數就更新 */
          if (cell.actual == null || cell.actual === '' || Number(cell.actual) === 0) {
            cell.actual = rid === 'all' ? v : (v || 0);
          } else if (rid !== 'all') {
            cell.actual = v || 0;
          } else {
            cell.actual = v;
          }
        });
      });
    }
    patch(pack.north);
    patch(pack.south);
  }

  /**
   * 月報矩陣疊系統數字：續約／異常轉業續約／領先／續轉包／再媒合。
   * （試算表空白或合成月視圖時補上，避免續轉包等欄空白）
   */
  function overlayReLeaseOntoMonthMatrix(monthPack, renewByMonth) {
    if (!monthPack || !renewByMonth) return;
    Object.keys(monthPack).forEach(function (mid) {
      const pack = monthPack[mid];
      if (!pack) return;
      function liveFor(rowKey, rid) {
        if (rowKey === 'renewRate') return pickLiveRenewRate(renewByMonth, mid, rid, 'renewRateAll');
        if (rowKey === 'renewRateExcl') return pickLiveRenewRate(renewByMonth, mid, rid, 'renewRateExcl');
        if (rowKey === 'leadRenewNext') {
          return pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 1), rid, 'renewRateAll');
        }
        if (rowKey === 'leadRenewNext2') {
          return pickLiveRenewRate(renewByMonth, shiftMonthId(mid, 2), rid, 'renewRateAll');
        }
        if (rowKey === 'toBaoRate') return pickLiveRenewRate(renewByMonth, mid, rid, 'toBaoRate');
        if (rowKey === 'reLeaseRate') return pickLiveRenewRate(renewByMonth, mid, rid, 'reLeaseRate');
        return null;
      }
      function patch(rows) {
        (rows || []).forEach(function (row) {
          if (!row || !row.byRegion) return;
          if (!/^(renewRate|renewRateExcl|leadRenewNext|leadRenewNext2|toBaoRate|reLeaseRate)$/.test(row.key || '')) {
            return;
          }
          /* 統一週／月／年報顯示名稱 */
          if (row.key === 'renewRateExcl') row.label = '當月續約率-異常轉業者';
          Object.keys(row.byRegion).forEach(function (rid) {
            const cell = row.byRegion[rid];
            if (!cell) return;
            const v = liveFor(row.key, rid);
            if (v != null) cell.actual = v;
          });
        });
      }
      patch(pack.north);
      patch(pack.south);
    });
  }

  /** 週報 ly／目標／最近一週實績 → 月報三欄（月報分頁尚無該月時） */
  function synthesizeMonthFromWeek(weekPack, monthId) {
    function mapRows(rows) {
      return (rows || []).map(function (row) {
        const byRegion = {};
        Object.keys(row.byRegion || {}).forEach(function (rid) {
          const cell = row.byRegion[rid] || {};
          const weeks = cell.weeks || [];
          let actual = cell.value;
          if (actual == null) {
            for (let w = weeks.length - 1; w >= 0; w--) {
              if (weeks[w] != null) {
                actual = weeks[w];
                break;
              }
            }
          }
          byRegion[rid] = { ly: row.ly, target: row.goal, actual: actual };
        });
        return {
          key: row.key,
          label: row.label,
          section: row.section,
          weight: row.weight,
          kind: row.kind,
          ly: row.ly,
          goal: row.goal,
          byRegion: byRegion
        };
      });
    }
    return {
      monthId: monthId,
      title: '115年' + Number(monthId) + '月各地區KPI月報（由週報彙整）',
      synthesized: true,
      north: mapRows(weekPack.north),
      south: mapRows(weekPack.south),
      regions: {}
    };
  }

  /** 從續約週表取指定月（或自動）總計某一指標的最近有值週 */
  function pickRenewAllMetric(byMonth, metricKey, forcedMonthId) {
    const cur = currentSheetWeekIndex();
    const monthOrder = [];
    if (forcedMonthId) {
      monthOrder.push(forcedMonthId);
    } else {
      if (cur) monthOrder.push(cur.monthId);
      RENEW_MONTH_IDS.forEach(function (id) {
        if (monthOrder.indexOf(id) < 0) monthOrder.push(id);
      });
    }
    for (let mi = 0; mi < monthOrder.length; mi++) {
      const monthId = monthOrder[mi];
      const weeks = byMonth && byMonth[monthId] && byMonth[monthId].byRegion &&
        byMonth[monthId].byRegion.all && byMonth[monthId].byRegion.all.weeks;
      if (!weeks) continue;
      const startWi = cur && cur.monthId === monthId
        ? cur.weekIndex
        : Math.max(0, weeks.length - 1);
      for (let wi = startWi; wi >= 0; wi--) {
        const cell = weeks[wi] || {};
        const value = parseOverviewNumber(cell[metricKey], /Rate/.test(metricKey) ? 'rate' : 'count');
        if (value == null) continue;
        const prevCell = wi > 0 ? weeks[wi - 1] : null;
        const prev = prevCell
          ? parseOverviewNumber(prevCell[metricKey], /Rate/.test(metricKey) ? 'rate' : 'count')
          : null;
        return {
          value: value,
          prev: prev,
          delta: value != null && prev != null ? Math.round((value - prev) * 10) / 10 : null,
          monthId: monthId,
          weekIndex: wi
        };
      }
    }
    return { value: null, prev: null, delta: null };
  }

  function goalTextFor(def, goal) {
    if (goal == null || !isFinite(goal)) return def.goalText;
    if (def.kind === 'count') {
      return def.higherIsBetter ? ('目標 ≥ ' + goal + ' 件') : ('目標 ≤ ' + goal + ' 件');
    }
    return def.higherIsBetter ? ('目標 ≥ ' + goal + '%') : ('目標 ≤ ' + goal + '%');
  }

  function defaultOverviewMonthId() {
    const cur = currentSheetWeekIndex();
    if (cur && RENEW_MONTH_IDS.indexOf(cur.monthId) >= 0) return cur.monthId;
    const m = new Date().getMonth() + 1;
    const id = pad2(m);
    if (RENEW_MONTH_IDS.indexOf(id) >= 0) return id;
    return '11';
  }

  function buildOverviewModule(sheetMetrics, byMonth, monthId) {
    const payload = emptyModulePayload(MODULES.overview);
    const defs = MODULES.overview.kpis || [];
    const mid = monthId || defaultOverviewMonthId();
    defs.forEach(function (def) {
      const fromSheet = sheetMetrics && sheetMetrics[def.key];
      let row = fromSheet
        ? {
            value: fromSheet.value,
            prev: fromSheet.prev,
            delta: fromSheet.delta,
            goal: fromSheet.goal != null ? fromSheet.goal : def.goalValue,
            goalText: goalTextFor(def, fromSheet.goal != null ? fromSheet.goal : def.goalValue)
          }
        : {
            value: null,
            prev: null,
            delta: null,
            goal: def.goalValue,
            goalText: def.goalText
          };

      if (def.key === 'renewRate') {
        const live = pickRenewAllMetric(byMonth, 'renewRateAll', mid);
        if (live.value != null) {
          row.value = live.value;
          row.prev = live.prev;
          row.delta = live.delta;
        }
      }
      if (def.key === 'noRenewRate') {
        const nr = pickRenewAllMetric(byMonth, 'noRenewRate', mid);
        if (nr.value != null) {
          row.value = nr.value;
          row.prev = nr.prev;
          row.delta = nr.delta;
        }
      }

      payload.kpis[def.key] = row;
    });
    payload.points = [];
    payload.monthId = mid;
    return payload;
  }

  function buildOverviewByMonth(sheetByMonth, renewByMonth) {
    const byMonth = {};
    RENEW_MONTH_IDS.forEach(function (id) {
      byMonth[id] = buildOverviewModule(sheetByMonth[id] || {}, renewByMonth, id);
    });
    return byMonth;
  }

  function loadPerfData() {
    const modules = {};
    Object.keys(MODULES).forEach(function (id) {
      modules[id] = emptyModulePayload(MODULES[id]);
    });
    const token =
      (typeof window !== 'undefined' && window.skyfunAuth && window.skyfunAuth.getToken
        ? window.skyfunAuth.getToken()
        : '') || '';

    return Promise.all([
      fetchRenewSheet(token).catch(function () { return emptyModulePayload(MODULES.renew).byMonth; }),
      fetchLiveRenewKpi(token),
      fetchRegionKpiOverview(),
      loadCollectDashboard().catch(function () { return null; })
    ]).then(function (pair) {
      const byMonth = pair[0] || emptyModulePayload(MODULES.renew).byMonth;
      const live = pair[1];
      const sheetPack = pair[2] || {};
      const collectDash = pair[3];
      const collectByRegion = collectDash && collectDash.summary
        ? collectOver30ByRegion(collectDash.summary)
        : null;
      const sheetByMonth = sheetPack.metricsByMonth || sheetPack || {};
      const regionsByMonth = sheetPack.regionsByMonth || {};
      if (live && live.months) {
        Object.keys(live.months).forEach(function (monthKey) {
          const monthId = pad2(Number(monthKey));
          const weekIndexes = liveWeekIndexesForMonth(monthId);
          const block = live.months[monthKey];
          if (!block || !block.byRegion || !weekIndexes.length) return;
          weekIndexes.forEach(function (wi) {
            clearLiveOverwritable(byMonth, monthId, wi);
            overlayLiveMonth(byMonth, block.byRegion, monthId, wi);
          });
        });
      }
      /* 第 4 週起（試算表無欄）：補上已過週的系統週快照 */
      applyWeekSnapshots(byMonth, live && live.weekSnapshots);
      modules.renew = { byMonth: byMonth };
      const overviewByMonth = buildOverviewByMonth(sheetByMonth, byMonth);
      const defaultMonth = defaultOverviewMonthId();
      const overview = overviewByMonth[defaultMonth] || emptyModulePayload(MODULES.overview);
      modules.overview = {
        kpis: overview.kpis,
        points: overview.points || [],
        monthId: defaultMonth,
        byMonth: overviewByMonth,
        monthIds: RENEW_MONTH_IDS.slice()
      };
      /* 各地區 KPI：試算表週報＋月報矩陣 */
      let regionMonth = defaultMonth;
      if (!regionsByMonth[regionMonth]) {
        const keys = Object.keys(regionsByMonth).sort();
        if (keys.length) regionMonth = keys[keys.length - 1];
      }
      const weekPack =
        (sheetPack.weekMatrixByMonth && sheetPack.weekMatrixByMonth[regionMonth]) ||
        (sheetPack.weekMatrixByMonth &&
          sheetPack.weekMatrixByMonth[Object.keys(sheetPack.weekMatrixByMonth || {}).sort().slice(-1)[0]]) ||
        null;
      modules.regionKpi = buildRegionKpiModule(
        regionsByMonth[regionMonth] || {},
        byMonth,
        regionMonth,
        weekPack,
        sheetPack.monthMatrixByMonth || {},
        collectByRegion
      );
      const hasSheet = Object.keys(sheetByMonth).length > 0;
      return {
        periodLabel: hasSheet
          ? '115年各地區KPI週／月報｜續約／領先／續轉包／再媒合／催收：本週起吃系統'
          : '115年 10–12 月（第1–3週試算表｜第4週起／本週＝系統，每天 08:00 更新）',
        updatedAt: (live && live.fetchedAt) || (collectDash && collectDash.syncedAt) || null,
        modules: modules
      };
    });
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    const s = String(v).trim().replace(/,/g, '').replace(/%/g, '');
    if (!s || s === '-' || s === '—') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  global.RentmgrPerfData = {
    REGIONS: REGIONS,
    REGION_KPI_NORTH: REGION_KPI_NORTH,
    REGION_KPI_SOUTH: REGION_KPI_SOUTH,
    SHEET_REGION_IDS: SHEET_REGION_IDS,
    RENEW_WEEKS: RENEW_WEEKS,
    RENEW_MONTH_BANDS: RENEW_MONTH_BANDS,
    RENEW_WEEK_LABELS: RENEW_WEEK_LABELS,
    RENEW_WEEK_NAME: RENEW_WEEK_NAME,
    RENEW_MONTH_IDS: RENEW_MONTH_IDS,
    RENEW_METRICS: RENEW_METRICS,
    MODULES: MODULES,
    SHEET_LINKS: SHEET_LINKS,
    weekCountForMonth: weekCountForMonth,
    weekLabelsForMonth: weekLabelsForMonth,
    weeksForMonth: weeksForMonth,
    loadPerfData: loadPerfData,
    sheetWeekPhase: sheetWeekPhase,
    currentSheetWeekIndex: currentSheetWeekIndex,
    defaultOverviewMonthId: defaultOverviewMonthId,
    canOpenRenewDetail: canOpenRenewDetail,
    fetchRenewKpiDetail: fetchRenewKpiDetail,
    NORENEW_SHEET_VER: NORENEW_SHEET_VER,
    loadNoRenewDashboard: loadNoRenewDashboard,
    loadCollectDashboard: loadCollectDashboard,
    summarizeCollectCases: summarizeCollectCases,
    fetchNoRenewDetail: fetchNoRenewDetail,
    setNoRenewAbnormal: setNoRenewAbnormal,
    refreshRenewAbnormalOverlay: refreshRenewAbnormalOverlay,
    setCollectStatus: setCollectStatus,
    setNoRenewCollectStatus: setNoRenewCollectStatus,
    fetchCollectStatusMap: fetchCollectStatusMap,
    COLLECT_ALERTS: COLLECT_ALERTS,
    toNumber: toNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
