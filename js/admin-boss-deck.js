/**
 * 主管週報／月報投影片與後台報表表格（版面同管理部週報、業務管理部月會簡報）。
 * 只負責排版；資料由後台頁面準備好再傳進來。表格格式見 admin-deck.js。
 */
(function (root, factory) {
  root.AdminBossDeck = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const C = {
    navy: '0B1F44',
    ink: '142238',
    gold: 'C3A165',
    head: 'D9EAD3',
    label: 'EEF3F8',
    beige: 'FBF3E4',
    target: 'FDF3D0',
    total: 'F6EAD2',
    g: 'D9F2D9',
    y: 'FFF2CC',
    r: 'F8D7DA',
    white: 'FFFFFF',
    muted: '64748B',
    pts: 'FCE4E4',
    lvr: 'FCE5CD',
    list: 'DDEBF7'
  };
  const ASSET = '../assets/boss-report/';
  const BG = ASSET + 'slide-bg.jpg';
  const TOP = 1.0;
  const BOTTOM = 6.6;
  const LEFT = 0.3;
  const WIDTH = 12.73;

  /** 週報／月報投影片的內文字級下限（pt） */
  const BODY = 11;

  const pad2 = (n) => String(n).padStart(2, '0');
  const pct0 = (v) => `${Math.round(v * 100)}%`;
  const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
  /** 投影片格子窄：100% 不帶小數 */
  const pctFit = (v) => (v >= 0.9995 ? '100%' : pct1(v));

  /** 表格內每一格（含小字）至少 BODY pt；over 可順便換欄寬、列高 */
  function bodyFont(table, over) {
    const base = table.size || 9;
    const up = (c) => {
      const cell = c != null && typeof c === 'object' ? { ...c } : { v: c };
      cell.size = Math.max(cell.size || base, BODY);
      if (cell.sub != null && cell.sub !== '') cell.subSize = Math.max(cell.subSize || 0, BODY);
      return cell;
    };
    return { ...table, size: Math.max(base, BODY), rows: table.rows.map((r) => r.map(up)), ...over };
  }
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const mmdd = (iso) => String(iso || '').slice(5).replace('-', '/');
  const slash = (iso) => String(iso || '').replace(/-/g, '/');

  /** 承接率顏色（同地區承接率頁） */
  function takeupFill(rate) {
    if (rate == null) return C.white;
    if (rate >= 0.95) return C.g;
    if (rate >= 0.8) return C.white;
    if (rate >= 0.6) return C.y;
    return C.r;
  }
  /** 目標達成顏色（同各地區KPI指標頁） */
  function goalFill(rate, target) {
    if (rate == null) return C.white;
    if (rate >= target) return C.g;
    if (rate >= target - 0.1) return C.y;
    return C.r;
  }

  function fmtSec(sec) {
    if (sec == null) return '—';
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}分${pad2(s % 60)}秒`;
  }

  /* ---------- 管理部KPI月報（年度） ---------- */

  const KPI_ANNUAL_ROWS = [
    { unit: '行政', item: '一、人力效率', label: '效能：第一階段以上達成率', key: 'stage', w: '10%' },
    { unit: '行政', item: '一、人力效率', label: '量能：行政案件承接率', key: 'takeup', w: '10%' },
    { unit: '行政', item: '二、良率', label: '清冊作業良率', key: 'roster', w: '10%' },
    { unit: '行政', item: '二、良率', label: '審件作業良率', key: 'audit', w: '10%' },
    { unit: '業務', item: '三、續約率', label: '公司', key: 'renew_co', w: '10%' },
    { unit: '業務', item: '三、續約率', label: '公司-扣除業務轉業者件', key: 'renew_co_ex', join: true, optional: true },
    { unit: '業務', item: '三、續約率', label: '業務', key: 'renew_sales', w: '10%' },
    { unit: '業務', item: '四、包租新件率', label: '公司', key: 'newbao_co', w: '10%' },
    { unit: '業務', item: '四、包租新件率', label: '業務', key: 'newbao_sales', w: '10%' },
    { unit: '業務', item: '五、續轉包率', label: '公司', key: 'conv_co', w: '10%' },
    { unit: '業務', item: '五、續轉包率', label: '業務', key: 'conv_sales', w: '10%' }
  ];
  const WEEK_NAMES = ['第一週', '第二週', '第三週', '第四週', '第五週', '第六週'];

  /**
   * @param annual { rows: { key: { months: { "9": { last, target, actual, weeks } } } } }
   * @param opts { roc, half: 0|1, curMonth: 報告月份(1–12)，之前月份沒資料顯示「-」, weekMonth?, weekCount? }
   */
  function kpiAnnualTable(annual, opts) {
    const months = Array.from({ length: 6 }, (_, i) => opts.half * 6 + i + 1);
    const cell = (key, m) => annual?.rows?.[key]?.months?.[m] || {};
    const rows = KPI_ANNUAL_ROWS.filter((r) => !r.optional || months.some((m) => Object.values(cell(r.key, m)).some((v) => v != null)));
    const weeksOf = (m) => (m === opts.weekMonth ? opts.weekCount || 0 : 0);
    const colW = [0.7, 1.05, 0.42, 1.55];
    months.forEach((m) => colW.push(...Array(3 + weeksOf(m)).fill(0.42)));
    const width = colW.length;
    const head = (v, o) => ({ v, fill: C.head, bold: true, size: 8, ...o });
    const out = [];
    out.push([{ v: `${opts.roc}年度管理部KPI月報`, cs: width, bold: true, size: 11, fill: C.white }]);
    out.push([
      head('管理單位', { rs: 2 }),
      head('專案及例行性\n業務項目', { rs: 2 }),
      head('權重%', { rs: 2 }),
      head('目標效益指標展開', { rs: 2 }),
      ...months.map((m) => head(`${m}月`, { cs: 3 + weeksOf(m) }))
    ]);
    out.push(months.flatMap((m) => [head('去年\n同期', { size: 7 }), head('目標', { size: 7 }), head('實績', { size: 7 }), ...WEEK_NAMES.slice(0, weeksOf(m)).map((w) => head(w, { size: 7, fill: C.target }))]));
    const fmt = (v, empty) => (v == null ? empty : pct0(v));
    rows.forEach((r, i) => {
      const line = [];
      if (i === 0 || rows[i - 1].unit !== r.unit) line.push({ v: r.unit.split('').join(' '), rs: rows.filter((x) => x.unit === r.unit).length, bold: true, size: 12 });
      if (i === 0 || rows[i - 1].item !== r.item) line.push({ v: r.item, rs: rows.filter((x) => x.item === r.item).length, bold: true, size: 8 });
      if (!r.join) line.push({ v: r.w, rs: rows[i + 1]?.join ? 2 : 1, size: 8 });
      line.push({ v: r.label, size: 8, bold: true });
      for (const m of months) {
        const x = cell(r.key, m);
        const past = opts.year < opts.thisYear || m < opts.curMonth;
        line.push({ v: fmt(x.last, '-'), size: 8 });
        line.push({ v: fmt(x.target, '-'), size: 8, fill: C.target });
        line.push({ v: fmt(x.actual, past ? '-' : ''), size: 8, bold: x.actual != null });
        for (let w = 0; w < weeksOf(m); w++) line.push({ v: fmt(x.weeks?.[w], ''), size: 8, bold: true });
      }
      out.push(line);
    });
    return { colW, size: 8, rowH: [0.34, 0.3, 0.36, ...rows.map(() => 0.36)], rows: out };
  }

  /* ---------- 各地區行政承接率（一區一張表） ---------- */

  /**
   * @param t Core.takeupReport 結果
   * @param area { name, regions }
   * @param cols [{ key, label, sub }]
   * @param title 表格最上面的標題列（選填）
   */
  const TAKEUP_SLIDE_COL = 0.68;
  function takeupTable(t, area, cols, title, slide) {
    const items = t.items.map((i) => ({ key: i.key, label: i.key === 'tenant' ? '房客' : i.label })).concat([{ key: 'total', label: '整體承接率', total: true }]);
    const width = 1 + area.regions.length * cols.length;
    const colW = [1.2, ...Array(width - 1).fill(1)];
    const rows = [];
    if (title) rows.push([{ v: title, cs: width, bold: true, size: 10, fill: C.white }]);
    rows.push([{ v: `${area.name}｜案件所在地行政承接率${slide ? '（格內：承接率、行政件數/總件數）' : ''}`, cs: width, bold: true, size: 11, fill: C.navy, color: C.white }]);
    rows.push([{ v: '地區', fill: C.head, bold: true, size: 9 }, ...area.regions.map((g) => ({ v: g, cs: cols.length, fill: C.head, bold: true, size: 9 }))]);
    rows.push([{ v: '週別', fill: C.head, bold: true, size: 9 }, ...area.regions.flatMap(() => cols.map((c) => ({ v: c.label, sub: slide ? String(c.sub || '').replace('–', '–\n') : c.sub, bold: true, size: 7, subSize: 6 })))]);
    for (const it of items) {
      rows.push([
        { v: it.label, fill: it.total ? C.total : C.label, bold: true, size: 8 },
        ...area.regions.flatMap((g) =>
          cols.map((c) => {
            const x = t.get(g, it.key, c.key);
            if (!x) return { v: '—', fill: it.total ? C.total : C.white, size: 8 };
            const sub = slide ? `${x.local}/${x.total}` : `行${x.local}｜非${x.other}｜總${x.total}`;
            return { v: pct0(x.rate), sub, fill: takeupFill(x.rate), bold: true, size: 9, subSize: 5.5 };
          })
        )
      ]);
    }
    if (slide) {
      const head = title ? [0.3, 0.34, 0.3, 0.6] : [0.34, 0.3, 0.6];
      return bodyFont({ colW: [1.2, ...Array(width - 1).fill(TAKEUP_SLIDE_COL)], size: 8, rows }, { rowH: [...head, ...items.map(() => 0.43)] });
    }
    const head = title ? [0.28, 0.3, 0.28, 0.38] : [0.32, 0.3, 0.4];
    return { colW, size: 8, rowH: [...head, ...items.map(() => (title ? 0.45 : 0.5))], rows };
  }

  /* ---------- 行政人員每月進度（兩欄並排） ---------- */

  const PROGRESS_HEAD = ['排名', '姓名', '地區／\n部別', '營業處', '報到年月', '專案任務', '月累計\n點數', '月度級距', '抽查\n件數', '組長抽查\n良率'];
  const PROGRESS_W = [0.34, 0.55, 0.5, 0.68, 0.6, 0.86, 0.45, 0.7, 0.38, 0.58];

  function progressCells(x) {
    if (!x) return PROGRESS_HEAD.map(() => ({ v: '' }));
    const proj = x.project ? (x.project.includes('清冊') ? C.list : C.lvr) : C.white;
    const stage = x.stageLabel === '未達第一階段' ? C.y : C.list;
    const rate = x.rate == null ? { v: '未抽查' } : { v: pct1(x.rate), fill: x.rate >= 0.9 ? C.g : x.rate >= 0.6 ? C.y : C.r };
    return [
      { v: x.rank },
      { v: x.name, bold: true },
      { v: x.region },
      { v: x.office },
      { v: x.hire },
      { v: x.project, fill: proj, size: 6.5 },
      { v: x.points, fill: C.pts, bold: true, size: 8.5 },
      { v: x.stageLabel, fill: stage, bold: true },
      { v: x.checked },
      rate
    ];
  }

  /**
   * @param rep Core.monthlyReport 結果
   * @param head { title, info, note, sum }
   */
  function progressTable(rep, head, maxH) {
    const half = Math.ceil(rep.full.length / 2);
    const width = PROGRESS_HEAD.length * 2 + 1;
    const line = (v, fill, o) => [{ v, cs: width, fill, size: 7.5, bold: true, ...o }];
    const hd = PROGRESS_HEAD.map((t) => ({ v: t, fill: C.head, bold: true, size: 7 }));
    const rows = [
      line(head.title, C.navy, { color: C.white, size: 11 }),
      line(head.info, C.beige),
      line(head.note, C.label, { bold: false }),
      line(head.sum, C.label),
      [...hd, { v: '' }, ...hd]
    ];
    for (let i = 0; i < half; i++) rows.push([...progressCells(rep.full[i]), { v: '' }, ...progressCells(rep.full[half + i])]);
    const headH = [0.3, 0.22, 0.22, 0.22, 0.34];
    const avail = (maxH || BOTTOM - TOP) - headH.reduce((s, x) => s + x, 0);
    const bodyH = Math.max(0.16, Math.min(0.28, avail / Math.max(1, half)));
    return { colW: [...PROGRESS_W, 0.08, ...PROGRESS_W], size: bodyH < 0.2 ? 6.5 : 7.5, rowH: [...headH, ...Array(half).fill(bodyH)], rows };
  }

  /** 投影片版：單欄全寬、內文 BODY pt，人數多就分頁（第二頁起只留標題列與表頭） */
  const PROGRESS_SLIDE_W = [0.6, 1.0, 1.05, 1.5, 1.1, 2.6, 0.95, 1.4, 0.8, 1.2];
  function progressPages(rep, head) {
    const width = PROGRESS_HEAD.length;
    const line = (v, fill, o) => [{ v, cs: width, fill, bold: true, ...o }];
    const hd = PROGRESS_HEAD.map((t) => ({ v: t, fill: C.head, bold: true }));
    const BODY_H = 0.28;
    const first = { rows: [line(head.title, C.navy, { color: C.white, size: 13 }), line(head.info, C.beige), line(head.note, C.label, { bold: false }), line(head.sum, C.label), hd], rowH: [0.36, 0.3, 0.3, 0.3, 0.5] };
    const rest = (n) => ({ rows: [line(`${head.title}（續 ${n}）`, C.navy, { color: C.white, size: 13 }), hd], rowH: [0.36, 0.5] });
    const fit = (h) => Math.max(1, Math.floor((BOTTOM - 1.0 - h.rowH.reduce((s, x) => s + x, 0)) / BODY_H));
    const pages = [];
    let i = 0;
    do {
      const h = pages.length ? rest(pages.length) : first;
      const take = rep.full.slice(i, i + fit(h));
      i += take.length;
      pages.push(bodyFont({ colW: PROGRESS_SLIDE_W, size: BODY, rows: [...h.rows, ...take.map(progressCells)] }, { rowH: [...h.rowH, ...take.map(() => BODY_H)] }));
    } while (i < rep.full.length);
    return pages;
  }

  /* ---------- 各地區KPI指標（月報附件1-1） ---------- */

  /**
   * @param k { blocks:[[地區]], rows:[{ key, label, target }], cell(row, region) → { last, actual:{ rate, text } } }
   */
  function kpiRegionTable(k, regions) {
    const width = 1 + regions.length * 3;
    const rows = [];
    rows.push([
      { v: '月指標', rs: 2, fill: C.head, bold: true, size: 8 },
      ...regions.map((g) => ({ v: g, cs: 3, fill: g === '全區' ? C.target : C.head, bold: true, size: 9 }))
    ]);
    rows.push(regions.flatMap(() => ['去年同期', '目標', '本月實績'].map((v) => ({ v, size: 6.5, bold: true }))));
    for (const row of k.rows) {
      rows.push([
        { v: row.label, fill: C.label, bold: true, size: 8 },
        ...regions.flatMap((g) => {
          const x = k.cell(row, g);
          const a = x.actual;
          return [
            { v: x.last == null ? '—' : pctFit(x.last) },
            { v: pct0(row.target), fill: C.target },
            a.rate == null ? { v: a.text || '—', bold: true } : { v: pctFit(a.rate), bold: true, fill: goalFill(a.rate, row.target) }
          ];
        })
      ]);
    }
    return bodyFont({ colW: [1.6, ...Array(width - 1).fill(0.53)], size: BODY, rows }, { rowH: [0.3, 0.46, ...k.rows.map(() => 0.36)] });
  }

  /* ---------- 系統作業效率月報 ---------- */

  /**
   * @param e { title, info, cur, prev, month, curLabel, prevLabel, monthLabel }（cur/prev/month 為 Core.efficiencyReport）
   */
  function efficiencyTables(e) {
    const cur = e.cur;
    const otherRate = cur.total ? cur.other / cur.total : null;
    const diff = cur.localRate != null && e.prev.localRate != null ? (cur.localRate - e.prev.localRate) * 100 : null;
    const sm = (v, o) => ({ v, size: 8, ...o });
    const big = (v, o) => ({ v, size: 18, bold: true, ...o });
    const summary = {
      colW: [1, 1, 1, 1],
      size: 9,
      rowH: [0.32, 0.24, 0.28, 0.46, 0.28],
      rows: [
        [{ v: e.title, cs: 4, fill: C.navy, color: C.white, bold: true, size: 13 }],
        [sm(e.info, { cs: 4, fill: C.label })],
        [
          sm(`本期完成｜${e.curLabel}`, { bold: true, fill: C.label }),
          sm('行政完成', { bold: true, fill: C.label }),
          sm('非行政完成', { bold: true, fill: C.target }),
          sm(`月累計｜${e.monthLabel}`, { bold: true, fill: C.label })
        ],
        [big(`${num(cur.total)} 次`), big(`${num(cur.local)} 次`), big(`${num(cur.other)} 次`, { fill: C.target }), big(`${num(e.month.total)} 次`)],
        [
          sm('七項作業節點完成次數', { color: C.muted }),
          { v: cur.localRate == null ? '—' : `占比 ${pct1(cur.localRate)}`, bold: true, size: 12 },
          { v: otherRate == null ? '—' : `占比 ${pct1(otherRate)}`, bold: true, size: 12, fill: C.target },
          sm(`包含本期 ${num(cur.total)} 次`, { color: C.muted })
        ]
      ]
    };
    const compare = {
      colW: [3, 0.7, 3, 3],
      size: 9,
      rowH: [0.26, 0.46],
      rows: [
        [
          sm(`行政完成比例｜${e.prevLabel}`, { bold: true, fill: C.label }),
          { v: '→', rs: 2, size: 18, bold: true },
          sm(`行政完成比例｜${e.curLabel}`, { bold: true, fill: C.navy, color: C.white }),
          sm('行政完成比例變化', { bold: true, fill: C.target })
        ],
        [
          big(e.prev.localRate == null ? '—' : pct1(e.prev.localRate), { color: '2F6690' }),
          big(cur.localRate == null ? '—' : pct1(cur.localRate), { fill: C.navy, color: C.white }),
          big(diff == null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} 個百分點`, { fill: C.target })
        ]
      ]
    };
    const nodes = cur.nodes;
    const nodeRows = nodes.map((n) => {
      const shares = [n.under5, n.mid, n.over30];
      const max = Math.max(...shares.map((x) => x ?? -1));
      const share = (x) => ({ v: x == null ? '—' : pct0(x), size: 10, fill: x != null && x === max && max > 0 ? C.target : C.white });
      return [
        { v: n.label, bold: true, size: 10, fill: C.label },
        { v: fmtSec(n.median), bold: true, size: 13, fill: C.target },
        { v: num(n.count), size: 10 },
        { v: num(n.timed), size: 10 },
        ...shares.map(share)
      ];
    });
    const nodeTable = {
      colW: [1.1, 2, 1, 1, 1, 1, 1],
      size: 10,
      rowH: [0.4, ...nodes.map(() => 0.3)],
      rows: [
        ['作業節點', '單次參考耗時', '完成\n次數', '計時\n紀錄數', '未滿\n5分鐘', '5至未滿\n30分鐘', '30分鐘\n以上'].map((v) => ({ v, fill: C.navy, color: C.white, bold: true, size: 9 })),
        ...nodeRows
      ]
    };
    const p4 = nodes.find((n) => n.key === 'p4');
    const p5 = nodes.find((n) => n.key === 'p5');
    const headline = `產編參考耗時：四期 ${fmtSec(p4?.median)}、五期 ${fmtSec(p5?.median)}${p5?.over30 != null ? `；五期有 ${pct0(p5.over30)} 的計時紀錄達30分鐘以上` : ''}。`;
    const note = '行政含組長與工讀生；各節點分別計次。兩段期間天數與案件組成不同，比例變化不等於系統節省時間。';
    const notes = [
      '參考耗時採中位數：約一半的紀錄在此時間內完成；右側金色表示該列最多紀錄落入的時間範圍。',
      '完成次數含0秒紀錄；計時紀錄數排除0秒，右側比例以計時紀錄數計算。百分比取整數，合計可能略有差異。',
      '時間為系統留下的作業紀錄，可能含等待；完整案件耗時需追蹤同一案件，不能將各節點時間直接相加。',
      `本期共有 ${num(cur.timed)} 筆有效計時紀錄；${num(cur.zero)} 筆0秒排除耗時統計，${num(cur.under10)} 筆低於10秒仍保留，待確認計時涵蓋範圍。`
    ];
    return { summary, compare, nodeTable, headline, note, notes };
  }

  /* ---------- 行政每週進度（後台頁面用） ---------- */

  function weeklyProgressTable(wp, area, cols) {
    const width = 5 + cols.length * 2;
    const hd = (v, o) => ({ v, fill: C.head, bold: true, size: 8, ...o });
    const rows = [
      [{ v: area.name, cs: width, fill: C.navy, color: C.white, bold: true, size: 10 }],
      [hd('姓名', { rs: 2 }), hd('部別', { rs: 2 }), hd('報到年月', { rs: 2 }), hd('專案任務', { rs: 2 }), hd('月度級距', { rs: 2 }), ...cols.map((c) => hd(c.label, { sub: c.sub, cs: 2 }))],
      cols.flatMap(() => [hd('累積點數', { size: 7 }), hd('審件良率', { size: 7 })])
    ];
    for (const r of area.rows) {
      rows.push([
        { v: r.name, bold: true },
        { v: r.region },
        { v: r.hire },
        { v: r.project, size: 7, fill: r.project ? (r.project.includes('清冊') ? C.list : C.lvr) : C.white },
        { v: r.stageLabel, fill: r.stageLabel === '未達第一階段' ? C.y : C.list, bold: true },
        ...cols.flatMap((c) => {
          const x = r.weeks[c.key];
          if (!x) return [{ v: '' }, { v: '' }];
          return [
            { v: x.points, bold: true, fill: C.pts },
            x.rate == null ? { v: '—' } : { v: pct1(x.rate), fill: x.rate >= 0.9 ? C.g : x.rate >= 0.6 ? C.y : C.r }
          ];
        })
      ]);
    }
    return { colW: [0.7, 0.6, 0.75, 1.1, 0.95, ...cols.flatMap(() => [0.6, 0.6])], size: 8, rows };
  }

  /* ---------- 投影片 ---------- */

  function titleBlocks(title) {
    return [
      { type: 'text', x: 3.2, y: 0.1, w: 7.4, h: 0.68, text: title, size: title.length > 18 ? 20 : 24, bold: true, color: C.ink, spacing: title.length > 18 ? 0.5 : 1.5 },
      { type: 'rect', x: 3.23, y: 0.8, w: 0.45, h: 0.04, fill: C.gold }
    ];
  }
  function contentSlide(title, blocks) {
    return { bg: BG, blocks: [...titleBlocks(title), ...blocks] };
  }
  /** 表格估計高度（英吋），用來置中或排下一塊 */
  function tableH(t) {
    if (Array.isArray(t.rowH)) return t.rows.reduce((s, _, i) => s + (t.rowH[i] ?? t.rowH[t.rowH.length - 1]), 0);
    return t.rows.length * (t.rowH || 0.3);
  }
  function tableBlock(table, opts) {
    const total = table.colW.reduce((s, x) => s + x, 0);
    const w = Math.min(WIDTH, opts?.w || WIDTH);
    return { type: 'table', x: opts?.x ?? LEFT + (WIDTH - w) / 2, y: opts?.y ?? TOP, w, table: { ...table, colW: table.colW.map((x) => x / total) } };
  }

  function coverWeek(d) {
    return {
      bg: ASSET + 'cover-week.jpg',
      blocks: [
        { type: 'text', x: 0.95, y: 5.0, w: 6.3, h: 0.45, text: d.coverDate, size: 17, bold: true, color: C.ink, spacing: 1 },
        { type: 'text', x: 9.27, y: 5.66, w: 2.05, h: 0.4, text: `報告人：${d.reporter || ''}`, size: 15, bold: true, color: C.ink },
        { type: 'text', x: 9.27, y: 6.17, w: 2.05, h: 0.4, text: `製作人：${d.maker || ''}`, size: 15, bold: true, color: C.ink }
      ]
    };
  }
  function coverMonth(d) {
    return {
      bg: ASSET + 'cover-month.jpg',
      blocks: [
        { type: 'text', x: 1.34, y: 5.25, w: 5, h: 0.5, text: d.coverDate, size: 20, bold: true, color: 'A9823F', spacing: 3 },
        ...(d.reporter || d.maker
          ? [{ type: 'text', x: 1.34, y: 5.8, w: 5, h: 0.4, text: [d.reporter && `報告人：${d.reporter}`, d.maker && `製作人：${d.maker}`].filter(Boolean).join('　'), size: 13, bold: true, color: C.ink }]
          : [])
      ]
    };
  }

  function kpiSlides(d) {
    return [0, 1].map((half) => {
      const t = kpiAnnualTable(d.annual, { roc: d.roc, half, year: d.year, thisYear: d.year, curMonth: d.month, weekMonth: d.weekMonth, weekCount: d.weekCount });
      const label = [0.35, 0.62, 0.4, 1.0];
      const values = t.colW.length - label.length;
      // 11pt 的「100%」約 0.47 吋；週報多了週欄放不下時，數字拿掉 % 改在標題註明單位
      const valueW = (WIDTH - label.reduce((s, x) => s + x, 0)) / values;
      const bare = valueW < 0.47;
      const rows = bare
        ? t.rows.map((r, i) => (i === 0 ? r.map((c) => ({ ...c, v: `${c.v}（數值單位：%）` })) : i < 3 ? r : r.map((c) => (/^\d+%$/.test(c.v) ? { ...c, v: c.v.slice(0, -1) } : c))))
        : t.rows;
      const big = bodyFont({ ...t, rows }, {
        colW: [...label, ...Array(values).fill(valueW)],
        rowH: [0.36, 0.3, 0.46, ...t.rows.slice(3).map(() => 0.4)]
      });
      return contentSlide(`一、《管理部｜${d.roc}年度KPI》`, [tableBlock(big, { y: 1.05 })]);
    });
  }

  /** 字級放大後一頁放不下整區，就把該區的地區拆成幾頁 */
  function takeupSlides(d, title) {
    const cols = d.takeup.cols;
    const per = Math.max(1, Math.floor((WIDTH - 1.2) / (cols.length * TAKEUP_SLIDE_COL)));
    return d.takeup.t.areas
      .filter((a) => a.name !== '東部及離島')
      .flatMap((a) => {
        const n = Math.ceil(a.regions.length / per);
        return Array.from({ length: n }, (_, i) => {
          const regions = a.regions.slice(i * per, (i + 1) * per);
          const part = { ...a, name: n > 1 ? `${a.name}（${i + 1}／${n}）` : a.name, regions };
          const t = takeupTable(d.takeup.t, part, cols, d.takeup.title, true);
          const w = Math.min(WIDTH, 1.2 + regions.length * cols.length * TAKEUP_SLIDE_COL);
          return contentSlide(title(a), [tableBlock(t, { y: 1.05, w: Math.max(w, 6) })]);
        });
      });
  }

  function progressSlides(d, title) {
    return progressPages(d.progress.rep, d.progress.head).map((t) => contentSlide(title, [tableBlock(t, { y: 1.0 })]));
  }

  function kpiRegionSlide(d) {
    const k = d.kpiRegion;
    const blocks = [];
    blocks.push({ type: 'rect', x: LEFT, y: 1.0, w: WIDTH, h: 0.42, fill: C.navy });
    blocks.push({ type: 'text', x: LEFT, y: 1.0, w: WIDTH, h: 0.42, text: k.title, size: 15, bold: true, color: C.white, align: 'center' });
    blocks.push({ type: 'text', x: LEFT, y: 1.45, w: WIDTH, h: 0.5, text: k.info.join('\n'), size: BODY, color: '334155', valign: 'top' });
    let y = 2.0;
    for (const regions of k.blocks) {
      const t = kpiRegionTable(k, regions);
      const w = 1.6 + regions.length * 3 * 0.53;
      blocks.push(tableBlock(t, { x: LEFT, y, w }));
      y += tableH(t) + 0.15;
    }
    return contentSlide(`附件1-1《各地區${pad2(d.month)}月KPI》`, blocks);
  }

  function efficiencySlide(d) {
    const raw = efficiencyTables(d.eff);
    const e = {
      ...raw,
      summary: bodyFont(raw.summary, { rowH: [0.36, 0.28, 0.28, 0.44, 0.28] }),
      compare: bodyFont(raw.compare, { rowH: [0.28, 0.44] }),
      nodeTable: bodyFont(raw.nodeTable, { rowH: [0.5, ...raw.nodeTable.rows.slice(1).map(() => 0.3)] })
    };
    const x = 0.85;
    const w = 11.6;
    let y = 0.98;
    const blocks = [];
    const add = (t) => {
      blocks.push(tableBlock(t, { x, y, w }));
      y += tableH(t);
    };
    add(e.summary);
    add(e.compare);
    blocks.push({ type: 'text', x, y: y + 0.02, w, h: 0.24, text: e.note, size: BODY, color: C.muted });
    y += 0.28;
    blocks.push({ type: 'text', x, y, w, h: 0.32, text: e.headline, size: 12, bold: true, color: C.ink, align: 'center' });
    y += 0.34;
    add(e.nodeTable);
    return contentSlide(`三、《${pad2(d.month)}月系統作業效率月報》`, blocks);
  }

  function placeholderSlide(title, lines) {
    return contentSlide(title, [
      { type: 'rect', x: 2.2, y: 2.4, w: 8.9, h: 2.4, fill: 'F8FAFC', line: 'CBD5E1', radius: 0.15 },
      { type: 'text', x: 2.2, y: 2.6, w: 8.9, h: 0.6, text: '資料待串接', size: 26, bold: true, color: C.ink, align: 'center' },
      { type: 'text', x: 2.6, y: 3.3, w: 8.1, h: 1.3, text: lines.join('\n'), size: 12, color: C.muted, align: 'center', valign: 'top' }
    ]);
  }

  /** 週報：封面、年度KPI×2、行政人員每月進度、北中南承接率（後兩項依人數／地區數分頁） */
  function weekDeck(d) {
    return [
      coverWeek(d),
      ...kpiSlides(d),
      ...progressSlides(d, '一、《行政人員每月進度》'),
      ...takeupSlides(d, (a) => `二、${a.name}－行政量能承接率`)
    ];
  }

  /** 月報：封面、年度KPI×2、各地區KPI、北中南承接率週變化、個人效能、系統作業效率、新媒合包租率 */
  function monthDeck(d) {
    const mm = pad2(d.month);
    return [
      coverMonth(d),
      ...kpiSlides(d),
      kpiRegionSlide(d),
      ...takeupSlides(d, () => '附件1-2《北、中、南區行政承接率週變化》'),
      ...progressSlides(d, `二、《行政${mm}月個人效能》`),
      d.eff ? efficiencySlide(d) : placeholderSlide(`三、《${mm}月系統作業效率月報》`, ['審核時間紀錄讀取失敗，請稍後再產生一次。', d.effError || '']),
      placeholderSlide(`四、《${mm}月新媒合包租率月報》`, ['新媒合包租率（業務）的資料來源尚未串接。', '提供爬取方式後，這頁會自動帶入年度趨勢、各營業處與各區排名。'])
    ];
  }

  return {
    C,
    KPI_ANNUAL_ROWS,
    pct0,
    pct1,
    fmtSec,
    mmdd,
    slash,
    kpiAnnualTable,
    takeupTable,
    progressTable,
    kpiRegionTable,
    efficiencyTables,
    weeklyProgressTable,
    weekDeck,
    monthDeck
  };
});
