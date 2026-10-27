/**
 * 租管部月報投影片。
 * 產出邏輯與行政「業務管理部月會報告」相同：AdminDeck／固定封面底圖只疊年月與報告人、
 * 內頁共用 slide-bg＋標題列（contentSlide）；僅表格與數據為租管內容。
 * 續轉包率口徑：代管轉包租÷(應續約−包租續包租−不續約)。
 */
(function (root, factory) {
  root.RentmgrReportDeck = factory();
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
    gray: '595959',
    chartRed: 'E03131',
    chartBlue: '0000FF'
  };
  /** 封面用租管專用底圖；內頁 chrome 與行政共用 boss-report */
  const COVER_ASSET = '../assets/rentmgr-report/';
  const BOSS_ASSET = '../assets/boss-report/';
  const BG = BOSS_ASSET + 'slide-bg.jpg';
  const TOP = 1.0;
  const LEFT = 0.3;
  const WIDTH = 12.73;
  const BODY = 11;
  const TO_BAO_FORMULA = '代管轉包租案件數/(應續約件數-包租續包租件數-不續約件數)';

  const NORTH_CITIES = ['台北', '臺北', '新北', '基隆', '宜蘭', '桃園', '新竹'];
  const CENTRAL_CITIES = ['台中', '臺中', '彰化', '南投', '苗栗', '雲林'];
  const SOUTH_CITIES = ['嘉義', '台南', '臺南', '高雄', '屏東', '澎湖', '金門', '連江'];

  const pad2 = (n) => String(n).padStart(2, '0');
  const dash = (v) => (v == null || v === '' ? '—' : v);
  const pct = (v) => (v == null || v === '' ? '—' : `${Number(v)}%`);
  const num = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('zh-TW'));

  function cityArea(city) {
    const s = String(city || '');
    if (NORTH_CITIES.some((k) => s.indexOf(k) >= 0)) return 'north';
    if (CENTRAL_CITIES.some((k) => s.indexOf(k) >= 0)) return 'central';
    if (SOUTH_CITIES.some((k) => s.indexOf(k) >= 0)) return 'south';
    return 'other';
  }

  function headCell(v, o) {
    return { v, fill: C.head, bold: true, size: 8, ...o };
  }

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

  function titleBlocks(title) {
    return [
      { type: 'text', x: 3.2, y: 0.1, w: 7.4, h: 0.68, text: title, size: title.length > 18 ? 20 : 24, bold: true, color: C.ink, spacing: title.length > 18 ? 0.5 : 1.5 },
      { type: 'rect', x: 3.23, y: 0.8, w: 0.45, h: 0.04, fill: C.gold }
    ];
  }

  function contentSlide(title, blocks) {
    return { bg: BG, blocks: [...titleBlocks(title), ...blocks] };
  }

  function tableBlock(table, opts) {
    const total = table.colW.reduce((s, x) => s + x, 0);
    const w = Math.min(WIDTH, opts?.w || WIDTH);
    return {
      type: 'table',
      x: opts?.x ?? LEFT + (WIDTH - w) / 2,
      y: opts?.y ?? TOP,
      w,
      table: { ...table, colW: table.colW.map((x) => x / total) }
    };
  }

  function tableH(t) {
    if (Array.isArray(t.rowH)) return t.rows.reduce((s, _, i) => s + (t.rowH[i] ?? t.rowH[t.rowH.length - 1]), 0);
    return t.rows.length * (t.rowH || 0.3);
  }

  /** 續轉包率＝代管轉包租÷(應續約−包租續包租−不續約)；缺任一分子分母則回 null */
  function calcToBaoRate(parts) {
    const nume = Number(parts && parts.toBao);
    const due = Number(parts && parts.due);
    const baoKeep = Number(parts && parts.baoRenewBao) || 0;
    const noRenew = Number(parts && parts.noRenew) || 0;
    if (!isFinite(nume) || !isFinite(due) || due <= 0) return null;
    const den = due - baoKeep - noRenew;
    if (den <= 0) return null;
    return Math.round((nume / den) * 1000) / 10;
  }

  /* ---------- 折線圖（canvas → data URL，預覽與 PPT 共用） ---------- */

  function lineChartDataUrl(cfg) {
    const W = cfg.width || 1100;
    const H = cfg.height || 520;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas || !canvas.getContext) return null;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const pad = { t: 56, r: 28, b: 48, l: 56 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 22px "Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.title || '', W / 2, 28);
    const series = cfg.series || [];
    const labels = cfg.labels || [];
    let max = cfg.max;
    if (max == null) {
      max = 0;
      series.forEach((s) => (s.values || []).forEach((v) => {
        if (v != null && v > max) max = v;
      }));
      max = Math.max(10, Math.ceil(max / 10) * 10);
    }
    const min = cfg.min != null ? cfg.min : 0;
    /* legend */
    let lx = W / 2 - series.length * 70;
    series.forEach((s) => {
      ctx.strokeStyle = '#' + s.color;
      ctx.fillStyle = '#' + s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, 44);
      ctx.lineTo(lx + 22, 44);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(lx + 11, 44, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.font = '13px "Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.name, lx + 28, 48);
      lx += 140;
    });
    /* grid */
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + (plotH * i) / steps;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      const val = max - ((max - min) * i) / steps;
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1) + '%', pad.l - 8, y + 4);
    }
    const n = Math.max(1, labels.length);
    const xAt = (i) => pad.l + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yAt = (v) => pad.t + plotH * (1 - (v - min) / (max - min || 1));
    labels.forEach((lab, i) => {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lab, xAt(i), H - 18);
    });
    series.forEach((s) => {
      const vals = s.values || [];
      ctx.strokeStyle = '#' + s.color;
      ctx.fillStyle = '#' + s.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let started = false;
      vals.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i);
        const y = yAt(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      vals.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i);
        const y = yAt(v);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        if (cfg.showLabels !== false) {
          ctx.fillStyle = '#' + s.color;
          ctx.font = '11px "Microsoft JhengHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(Number(v).toFixed(1) + '%', x, y - 8);
          ctx.fillStyle = '#' + s.color;
        }
      });
    });
    return canvas.toDataURL('image/png');
  }

  function barCompareDataUrl(cfg) {
    const W = cfg.width || 900;
    const H = cfg.height || 420;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas || !canvas.getContext) return null;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 20px "Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.title || '', W / 2, 28);
    const cats = cfg.categories || [];
    const sA = cfg.seriesA || { name: '114', color: '94a3b8', values: [] };
    const sB = cfg.seriesB || { name: '115', color: 'dc2626', values: [] };
    let max = 1;
    [...(sA.values || []), ...(sB.values || [])].forEach((v) => {
      if (v != null && v > max) max = v;
    });
    const pad = { t: 50, r: 20, b: 40, l: 50 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const groupW = plotW / Math.max(1, cats.length);
    cats.forEach((lab, i) => {
      const gx = pad.l + i * groupW;
      const bw = groupW * 0.32;
      const drawBar = (val, color, ox) => {
        if (val == null) return;
        const h = (plotH * val) / max;
        ctx.fillStyle = '#' + color;
        ctx.fillRect(gx + ox, pad.t + plotH - h, bw, h);
        ctx.fillStyle = '#334155';
        ctx.font = '11px "Microsoft JhengHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(val), gx + ox + bw / 2, pad.t + plotH - h - 4);
      };
      drawBar(sA.values[i], sA.color, groupW * 0.15);
      drawBar(sB.values[i], sB.color, groupW * 0.52);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lab, gx + groupW / 2, H - 14);
    });
    ctx.fillStyle = '#' + sA.color;
    ctx.fillRect(W / 2 - 90, 36, 14, 10);
    ctx.fillStyle = '#334155';
    ctx.font = '12px "Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(sA.name, W / 2 - 72, 45);
    ctx.fillStyle = '#' + sB.color;
    ctx.fillRect(W / 2 + 20, 36, 14, 10);
    ctx.fillStyle = '#334155';
    ctx.fillText(sB.name, W / 2 + 38, 45);
    return canvas.toDataURL('image/png');
  }

  /* ---------- 各頁 ---------- */

  /**
   * 封面＝行政月報同一套路：固定底圖（部門名已設計進圖）＋只疊年月／報告人／製作人。
   * 預覽與下載共用 AdminDeck（PptxGenJS），不用原檔字串取代、不用白底蓋字。
   */
  function coverSlide(d) {
    const coverDate = d.coverDate || ((d.roc || '') + '年' + pad2(d.month || 1) + '月');
    return {
      bg: COVER_ASSET + 'cover-month.jpg',
      blocks: [
        { type: 'text', x: 1.34, y: 5.25, w: 5, h: 0.5, text: coverDate, size: 20, bold: true, color: 'A9823F', spacing: 3 },
        ...(d.reporter || d.maker
          ? [{
              type: 'text',
              x: 1.34,
              y: 5.8,
              w: 5,
              h: 0.4,
              text: [d.reporter && `報告人：${d.reporter}`, d.maker && `製作人：${d.maker}`].filter(Boolean).join('　'),
              size: 13,
              bold: true,
              color: C.ink
            }]
          : [])
      ]
    };
  }

  /** 對齊績效中心「年報」列（不含扣除惡意轉業） */
  const ANNUAL_FALLBACK_ROWS = [
    { key: 'renewRate', label: '當月續約率', kind: 'rate' },
    { key: 'leadRenewNext', label: '領先續約率_次月', kind: 'rate' },
    { key: 'leadRenewNext2', label: '領先續約率_次次月', kind: 'rate' },
    { key: 'toBaoRate', label: '續轉包率', kind: 'rate' },
    { key: 'reLeaseRate', label: '再媒合招租完成招租', kind: 'rate' },
    { key: 'collectOver30', label: '控管包租催收30天以上件數', kind: 'count' }
  ];

  function annualRowsFromDeck(d) {
    if (d.annualKpi && Array.isArray(d.annualKpi.rows) && d.annualKpi.rows.length) {
      return d.annualKpi.rows.map((r) => ({
        key: r.key,
        label: r.label,
        kind: r.kind || 'rate',
        byMonth: r.byMonth || {}
      }));
    }
    return ANNUAL_FALLBACK_ROWS.map((r) => ({
      key: r.key,
      label: r.label,
      kind: r.kind,
      byMonth: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const cell = (d.annualRowsMap && d.annualRowsMap[r.key] && d.annualRowsMap[r.key][m]) || {};
          return [m, cell];
        })
      )
    }));
  }

  function fmtKpiCell(kind, v) {
    if (v == null || v === '') return '—';
    return kind === 'rate' ? pct(v) : num(v);
  }

  /** 與績效中心年報相同：上下半年兩頁、每月「去年同期／目標／實績」 */
  function annualKpiSlides(d) {
    const rows = annualRowsFromDeck(d);
    return [0, 1].map((half) => {
      const months = Array.from({ length: 6 }, (_, i) => half * 6 + i + 1);
      const colW = [2.4, ...months.flatMap(() => [0.56, 0.56, 0.56])];
      const out = [];
      out.push([
        {
          v: `${d.roc}年度租管部KPI月報`,
          cs: colW.length,
          bold: true,
          size: 11,
          fill: C.white
        }
      ]);
      out.push([
        headCell('目標效益指標展開', { rs: 2, size: 8 }),
        ...months.map((m) => headCell(`${m}月`, { cs: 3, size: 8 }))
      ]);
      out.push(
        months.flatMap(() => [
          headCell('去年同期', { size: 6 }),
          headCell('目標', { size: 6, fill: C.target }),
          headCell('實績', { size: 6 })
        ])
      );
      rows.forEach((r) => {
        const line = [{ v: r.label, size: 8, bold: true, align: 'left', fill: C.head }];
        months.forEach((m) => {
          const cell = (r.byMonth && r.byMonth[m]) || {};
          line.push({ v: fmtKpiCell(r.kind, cell.ly), size: 8 });
          line.push({ v: fmtKpiCell(r.kind, cell.target), size: 8, fill: C.target });
          line.push({
            v: fmtKpiCell(r.kind, cell.actual),
            size: 8,
            bold: true,
            fill: m === d.month ? C.y : C.white
          });
        });
        out.push(line);
      });
      const t = bodyFont(
        { colW, size: 8, rowH: [0.32, 0.28, 0.26, ...rows.map(() => 0.38)], rows: out },
        {}
      );
      const halfLabel = half ? '（7–12月）' : '（1–6月）';
      return contentSlide(`一、《租管部｜${d.roc}年度KPI》${halfLabel}`, [
        tableBlock(t, { y: 1.02 }),
        {
          type: 'text',
          x: LEFT,
          y: 6.85,
          w: WIDTH,
          h: 0.28,
          text: `對齊租管師績效中心年報；續轉包率＝${TO_BAO_FORMULA}`,
          size: BODY,
          color: C.muted
        }
      ]);
    });
  }

  /**
   * 各地區 KPI 月報：與績效中心月報矩陣相同（專案／權重／指標 × 地區去年／目標／實績）
   * 北區一頁、南區一頁。
   */
  function regionMonthMatrixSlides(d) {
    const pack = d.monthMatrix || null;
    const northRegs = (d.northRegions && d.northRegions.length)
      ? d.northRegions
      : [
          { id: 'all', label: '全區' },
          { id: 'tpe', label: '台北' },
          { id: 'ntpc', label: '新北' },
          { id: 'tyn', label: '桃園' },
          { id: 'txg', label: '台中' }
        ];
    const southRegs = (d.southRegions && d.southRegions.length)
      ? d.southRegions
      : [
          { id: 'chw', label: '彰化' },
          { id: 'nan', label: '南投' },
          { id: 'cyi', label: '嘉義' },
          { id: 'tnn', label: '台南' },
          { id: 'khh', label: '高雄' }
        ];

    function oneBand(title, regions, rows) {
      const list = rows && rows.length ? rows : [];
      const colW = [1.15, 0.55, 1.7, ...regions.flatMap(() => [0.52, 0.52, 0.52])];
      const out = [];
      out.push([
        headCell('專案', { rs: 2, size: 8 }),
        headCell('權重', { rs: 2, size: 8 }),
        headCell('指標', { rs: 2, size: 8 }),
        ...regions.map((r) => headCell(r.label, { cs: 3, size: 8 }))
      ]);
      out.push(
        regions.flatMap(() => [
          headCell('去年', { size: 6 }),
          headCell('目標', { size: 6, fill: C.target }),
          headCell('實績', { size: 6 })
        ])
      );
      if (!list.length) {
        out.push([
          {
            v: '此月尚無各地區 KPI 月報矩陣（請確認試算表／績效中心月報）',
            cs: colW.length,
            color: C.muted,
            size: 10
          }
        ]);
      } else {
        list.forEach((row) => {
          const line = [
            { v: dash(row.section), size: 7, align: 'left', fill: C.label },
            { v: dash(row.weight), size: 8, fill: C.label },
            { v: dash(row.label), size: 8, bold: true, align: 'left', fill: C.head }
          ];
          regions.forEach((r) => {
            const cell = (row.byRegion && row.byRegion[r.id]) || {};
            const g = cell.target != null ? cell.target : row.goal;
            line.push({ v: fmtKpiCell(row.kind, cell.ly), size: 8 });
            line.push({ v: fmtKpiCell(row.kind, g), size: 8, fill: C.target });
            line.push({ v: fmtKpiCell(row.kind, cell.actual), size: 8, bold: true });
          });
          out.push(line);
        });
      }
      const t = bodyFont(
        {
          colW,
          size: 8,
          rowH: [0.28, 0.24, ...(list.length ? list.map(() => 0.34) : [0.5])],
          rows: out
        },
        {}
      );
      return contentSlide(title, [
        tableBlock(t, { y: 1.02, w: 12.7 }),
        {
          type: 'text',
          x: LEFT,
          y: 6.88,
          w: WIDTH,
          h: 0.26,
          text: `對齊租管師績效中心｜各地區KPI月報；續轉包＝${TO_BAO_FORMULA}`,
          size: 10,
          color: C.muted
        }
      ]);
    }

    const ym = `${d.roc}年${pad2(d.month)}月`;
    return [
      oneBand(`二、《各地區${ym}KPI｜全區～台中》`, northRegs, (pack && pack.north) || []),
      oneBand(`二、《各地區${ym}KPI｜彰化～高雄》`, southRegs, (pack && pack.south) || [])
    ];
  }

  function noRenewShareSlide(d) {
    const dashb = d.noRenew || {};
    const months = dashb.months || [];
    const colW = [2.2, ...months.map(() => 0.75), 1.1];
    const out = [];
    out.push([headCell('項目'), ...months.map((m) => headCell(`${m.m}月`, { size: 8 })), headCell('年度')]);
    out.push([
      { v: '不續約占比（去年）', bold: true, fill: C.label, align: 'left' },
      ...months.map((m) => ({ v: pct(m.ly && m.ly.noRenewRate) })),
      { v: pct(dashb.annual && dashb.annual.lyNoRenewRate), fill: C.total, bold: true }
    ]);
    out.push([
      { v: '不續約占比（實績）', bold: true, fill: C.label, align: 'left' },
      ...months.map((m) => ({
        v: pct(m.act && m.act.noRenewRate),
        bold: true,
        fill: m.m === d.month ? C.y : C.white
      })),
      { v: pct(dashb.annual && dashb.annual.actNoRenewRate), fill: C.total, bold: true }
    ]);
    out.push([
      { v: '招租中占比（實績）', bold: true, fill: C.label, align: 'left' },
      ...months.map((m) => ({ v: pct(m.act && m.act.leaseRate) })),
      { v: pct(dashb.annual && dashb.annual.leaseRate), fill: C.total, bold: true }
    ]);

    const chart = lineChartDataUrl({
      title: `${(dashb.year || d.roc) - 1}／${dashb.year || d.roc}年不續約佔比`,
      labels: months.map((m) => m.m + '月'),
      max: 40,
      series: [
        { name: '去年同期', color: C.gray, values: months.map((m) => (m.ly ? m.ly.noRenewRate : null)) },
        { name: '實績', color: C.chartRed, values: months.map((m) => (m.act ? m.act.noRenewRate : null)) },
        { name: '招租中', color: C.chartBlue, values: months.map((m) => (m.act ? m.act.leaseRate : null)) }
      ]
    });

    const t = bodyFont({ colW, size: 10, rowH: [0.32, 0.36, 0.36, 0.36], rows: out }, {});
    const blocks = [tableBlock(t, { y: 1.0, w: 12.9 })];
    if (chart) {
      blocks.push({ type: 'image', src: chart, x: 0.35, y: 2.85, w: 6.6, h: 3.9 });
    } else {
      blocks.push({
        type: 'text',
        x: 0.5,
        y: 4.2,
        w: 6,
        h: 1,
        text: '圖表需於瀏覽器產生',
        size: BODY,
        color: C.muted,
        align: 'center'
      });
    }
    const cur = dashb.currentMonth || {};
    blocks.push({
      type: 'rect',
      x: 7.2,
      y: 2.95,
      w: 5.7,
      h: 3.6,
      fill: C.label,
      line: 'CBD5E1',
      radius: 0.08
    });
    blocks.push({
      type: 'text',
      x: 7.4,
      y: 3.15,
      w: 5.3,
      h: 3.2,
      text: [
        `${d.roc}/${pad2(d.month)} 當月摘要`,
        `不續約占比 ${pct(cur.noRenewRate)}（去年 ${pct(cur.lyNoRenewRate)}）`,
        `不續約件數 ${num(cur.noRenew)}／應續約 ${num(cur.due)}`,
        `異常轉業比例 ${pct(cur.abnormalRate)}（${num(cur.abnormalTransfer)} 件）`,
        `招租中占比 ${pct(cur.leaseRate)}`
      ].join('\n'),
      size: BODY,
      bold: true,
      color: C.ink,
      valign: 'top'
    });
    return contentSlide(`三、《不續約佔比》`, blocks);
  }

  function detailPages(slideTitle, items) {
    const head = ['狀態', '委託', '縣市', '地址', '業務', '異常轉業', '備註'];
    const colW = [0.9, 0.7, 0.7, 3.6, 0.9, 0.9, 3.0];
    const ROW_H = 0.32;
    const headH = [0.34];
    const avail = 6.6 - 1.15 - headH.reduce((s, x) => s + x, 0);
    const per = Math.max(1, Math.floor(avail / ROW_H));
    const list = items.length ? items : [];
    const chunks = [];
    if (!list.length) chunks.push([]);
    else for (let i = 0; i < list.length; i += per) chunks.push(list.slice(i, i + per));
    return chunks.map((chunk, idx) => {
      const title = idx ? `${slideTitle}（續 ${idx}）` : slideTitle;
      const rows = [
        head.map((t) => headCell(t, { size: 9 })),
        ...(chunk.length
          ? chunk.map((it) => [
              { v: dash(it.status) },
              { v: dash(it.entrustType) },
              { v: dash(it.city) },
              { v: dash(it.address), align: 'left', size: 10 },
              { v: dash(it.sales) },
              {
                v: it.abnormal === true ? '是' : it.abnormal === false ? '否' : '—',
                fill: it.abnormal === true ? C.y : C.white
              },
              { v: dash(it.remark), align: 'left', size: 10 }
            ])
          : [[{ v: '本月此區無不續約案件', cs: head.length, color: C.muted }]])
      ];
      const t = bodyFont(
        { colW, size: 11, rowH: [...headH, ...(chunk.length ? chunk.map(() => ROW_H) : [0.45])], rows },
        {}
      );
      return contentSlide(title, [tableBlock(t, { y: 1.05, w: 12.4 })]);
    });
  }

  function areaDetailSlides(d) {
    const items = (d.noRenewItems || []).slice();
    const north = items.filter((it) => cityArea(it.city) === 'north');
    const central = items.filter((it) => cityArea(it.city) === 'central');
    const south = items.filter((it) => cityArea(it.city) === 'south' || cityArea(it.city) === 'other');
    const ym = `${d.roc}/${pad2(d.month)}`;
    return [
      ...detailPages(`北區不續約明細（${ym}）`, north),
      ...detailPages(`中區不續約明細（${ym}）`, central),
      ...detailPages(`南區不續約明細（${ym}）`, south)
    ];
  }

  function summarySlide(d) {
    const nr = (d.noRenew && d.noRenew.currentMonth) || {};
    const col = d.collectSummary || {};
    const legal = col.legalAssist || {};
    const rows = [
      [headCell('項目'), headCell('數值'), headCell('說明')],
      [{ v: '當月不續約占比', bold: true, fill: C.label, align: 'left' }, { v: pct(nr.noRenewRate), bold: true }, { v: '去年同期 ' + pct(nr.lyNoRenewRate), align: 'left' }],
      [{ v: '異常轉業比例', bold: true, fill: C.label, align: 'left' }, { v: pct(nr.abnormalRate), bold: true, fill: C.y }, { v: num(nr.abnormalTransfer) + ' ÷ 應續約 ' + num(nr.due), align: 'left' }],
      [{ v: '催收 30 天以上', bold: true, fill: C.label, align: 'left' }, { v: num(col.over30 && col.over30.cases) }, { v: '' }],
      [{ v: '請法務協助', bold: true, fill: C.label, align: 'left' }, { v: num(legal.cases), bold: true, fill: C.r }, { v: '催收狀態勾選', align: 'left' }],
      [{ v: '續轉包率口徑', bold: true, fill: C.label, align: 'left' }, { v: '公式' }, { v: TO_BAO_FORMULA, align: 'left', size: 10 }]
    ];
    const t = bodyFont({ colW: [3.2, 2.0, 7.0], size: 12, rowH: [0.36, ...Array(5).fill(0.44)], rows }, {});
    return contentSlide(`四、《${d.roc}年${pad2(d.month)}月｜不續約／催收摘要》`, [
      tableBlock(t, { y: 1.1 })
    ]);
  }

  function orgSlide(d) {
    const people = d.orgPeople || [];
    const monthKey = `${d.roc}-${pad2(d.month)}`;
    const head = ['區', '姓名', '縣市', '職稱', '到職', '本月件數', '115合計', '達標'];
    const colW = [2.0, 1.2, 1.0, 1.4, 1.4, 1.2, 1.2, 1.0];
    const rows = [head.map((t) => headCell(t))];
    people.slice(0, 14).forEach((p) => {
      const mVal = p.months && p.months[monthKey] != null ? p.months[monthKey] : null;
      rows.push([
        { v: dash(p.group), align: 'left' },
        { v: p.status === '待補' ? '（待補）' : dash(p.name), bold: true },
        { v: dash(p.city) },
        { v: dash(p.title) },
        { v: dash(p.joined) },
        { v: num(mVal), bold: true, fill: 'DDEBF7' },
        { v: num(p.year115) },
        { v: dash(p.perf), fill: p.perf === '達標' ? C.g : C.white }
      ]);
    });
    const t = bodyFont(
      { colW, size: 11, rowH: [0.34, ...people.slice(0, 14).map(() => 0.34)], rows },
      {}
    );
    return contentSlide(`五、《租管師人力／人均件數》`, [tableBlock(t, { y: 1.05, w: 12.6 })]);
  }

  function collectChartSlide(d) {
    const s = d.collectSummary || {};
    const regions = s.regions || [];
    const chart = barCompareDataUrl({
      title: '包租催收件數（目前快照；114 同期待歷史檔）',
      categories: regions.slice(0, 6).map((r) => r.name),
      seriesA: { name: '114（無資料）', color: '94a3b8', values: regions.slice(0, 6).map(() => null) },
      seriesB: { name: '115 目前', color: 'dc2626', values: regions.slice(0, 6).map((r) => r.cases) }
    });
    const blocks = [];
    if (chart) blocks.push({ type: 'image', src: chart, x: 0.5, y: 1.0, w: 12.3, h: 3.1 });
    const kpi = [
      ['14天以下', num(s.under14 && s.under14.cases)],
      ['14～29天', num(s.day14to29 && s.day14to29.cases)],
      ['30天以上', num(s.over30 && s.over30.cases)],
      ['請法務協助', num(s.legalAssist && s.legalAssist.cases)]
    ];
    kpi.forEach((k, i) => {
      const x = 0.5 + i * 3.2;
      blocks.push({ type: 'rect', x, y: 4.3, w: 3.0, h: 1.8, fill: C.label, line: 'CBD5E1', radius: 0.08 });
      blocks.push({
        type: 'text',
        x,
        y: 4.45,
        w: 3.0,
        h: 1.5,
        text: `${k[0]}\n${k[1]}`,
        size: 18,
        bold: true,
        color: C.ink,
        align: 'center'
      });
    });
    return contentSlide(`六、《包租催收概況》`, blocks);
  }

  function collectDetailPages(d) {
    const cases = d.collectCases || [];
    const head = ['縣市', '代管', '房客', '天數', '欠款', '催收狀態', '地址'];
    const colW = [0.9, 0.9, 1.1, 0.7, 1.2, 1.4, 5.0];
    const ROW_H = 0.32;
    const headH = [0.34];
    const per = Math.max(1, Math.floor((6.6 - 1.15 - 0.34) / ROW_H));
    if (!cases.length) {
      return [
        contentSlide('催收案件明細', [
          {
            type: 'text',
            x: 1,
            y: 3,
            w: 11,
            h: 1,
            text: '目前無催收案件或資料尚未載入',
            size: 18,
            color: C.muted,
            align: 'center'
          }
        ])
      ];
    }
    const pages = [];
    for (let i = 0; i < cases.length; i += per) {
      const chunk = cases.slice(i, i + per);
      const title = pages.length ? `催收案件明細（續 ${pages.length}）` : '催收案件明細（含請法務協助）';
      const rows = [
        head.map((t) => headCell(t, { size: 9 })),
        ...chunk.map((c) => {
          const legal = String(c.collectStatus || '').trim() === '請法務協助';
          return [
            { v: dash(c.city) },
            { v: dash(c.staff) },
            { v: dash(c.tenant) },
            { v: num(c.maxDays), bold: true, fill: (c.maxDays || 0) >= 30 ? C.y : C.white },
            { v: c.amount != null ? Number(c.amount).toLocaleString('zh-TW') : '—' },
            { v: dash(c.collectStatus), fill: legal ? C.r : C.white, bold: legal },
            { v: dash(c.address), align: 'left', size: 10 }
          ];
        })
      ];
      const t = bodyFont(
        { colW, size: 11, rowH: [...headH, ...chunk.map(() => ROW_H)], rows },
        {}
      );
      pages.push(contentSlide(title, [tableBlock(t, { y: 1.05, w: 12.5 })]));
    }
    return pages;
  }

  function monthDeck(d) {
    return [
      coverSlide(d),
      ...annualKpiSlides(d),
      ...regionMonthMatrixSlides(d),
      noRenewShareSlide(d),
      ...areaDetailSlides(d),
      summarySlide(d),
      orgSlide(d),
      collectChartSlide(d),
      ...collectDetailPages(d)
    ];
  }

  return {
    C,
    TO_BAO_FORMULA,
    calcToBaoRate,
    cityArea,
    monthDeck,
    pad2,
    pct,
    num,
    lineChartDataUrl,
    barCompareDataUrl
  };
});
