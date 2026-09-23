/**
 * 房屋租賃終止協議書套印
 * 範本：skyfun PrintContrat／LeaseTerminationHandover
 * 中文標楷體、英文／數字 Times New Roman。
 */
(function () {
  'use strict';

  const TEMPLATE = './docs/forms/termination-agreement.pdf';
  const FONT_MANIFEST = './js/lal-font/manifest.js';
  const FONT_PART_PREFIX = './js/lal-font/part-';
  const SIZE = 13;
  const REASONS_ZHUAN = [
    '承租人死亡',
    '承租人購屋',
    '承租人工作地變動',
    '承租人無租屋需求',
    '承租人因物件問題',
    '承租人因家庭因素',
    '承租人因經濟問題',
    '承租人因環境因素',
    '承租人租屋需求變更',
    '承租人入住社會住宅',
    '承租人因身體狀況需療養',
    '承租人因個人問題被投訴',
    '承租人入矯正機關',
    '其他'
  ];

  /** 包租解約原因（出租人／房東側） */
  const REASONS_BAO = [
    '出租人因素',
    '出租人死亡',
    '出租人欲漲租',
    '出租人收回物件',
    '出租人物件需轉期',
    '出租人欲更換管理業者',
    '出租人欲更換契約類型',
    '出租人將物件售予承租人',
    '其他'
  ];

  const REASONS = REASONS_ZHUAN;

  const PARTY_A = {
    name: '星鴻股份有限公司',
    taxId: '85103034',
    address: '台北市萬華區中華路一段106號',
    phone: '(02) 7755-2669'
  };

  /** 解約單甲／乙方公司營業處（與聲請狀分公司清單一致） */
  const COMPANY_OFFICES = [
    { id: 'hq', name: '企業總部', phone: '(02) 7755-2669', addr: '台北市萬華區中華路一段106號' },
    { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '台北市大同區重慶北路一段26巷9弄1號4樓' },
    { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '桃園市中壢區環北路400號13樓之6' },
    { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '台中市北屯區文心路四段698號6樓之1' },
    { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397', addr: '台中市南區忠明南路789號8樓之2' },
    { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '台南市北區成功路54號11樓之1' },
    { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '高雄市前鎮區一心一路239號11樓之2' },
    { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '新竹縣竹北市光明五街342號2樓' },
    { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '宜蘭縣宜蘭市舊城北路154號2樓' },
    { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '基隆市中正區義二路196號2樓' },
    { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '南投縣草屯鎮中正路755號7樓之1' }
  ];

  function getCompanyOffice(id) {
    return COMPANY_OFFICES.find((o) => o.id === id) || COMPANY_OFFICES[0];
  }

  function resolveCompanyParty(officeId) {
    const o = getCompanyOffice(officeId);
    return {
      name: PARTY_A.name,
      taxId: PARTY_A.taxId,
      address: o.addr,
      phone: o.phone,
      officeId: o.id,
      officeName: o.name
    };
  }

  function officeOptionsHtml(selected) {
    const sel = String(selected || 'hq');
    return COMPANY_OFFICES.map(
      (o) =>
        `<option value="${o.id}"${o.id === sel ? ' selected' : ''}>${o.name}</option>`
    ).join('');
  }

  let kaiPartsPromise = null;
  let kaiFontBytesPromise = null;
  let pdfBusy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function yieldUi() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function val(id) {
    return String($(id)?.value || '').trim();
  }

  function collectExtraItems(pfx) {
    const list = [];
    document.querySelectorAll('[data-extra-items="' + pfx + '"] [data-extra-row]').forEach((row) => {
      const name = String(row.querySelector('[data-extra-name]')?.value || '').trim();
      const amt = Math.round(Number(String(row.querySelector('[data-extra-amt]')?.value || '').replace(/,/g, '')) || 0);
      if (name && amt > 0) list.push({ name, amt });
    });
    return list.slice(0, 4);
  }

  function buildExtraRows(d) {
    const rows = Array.isArray(d.extraItems) ? d.extraItems.slice() : [];
    const hasPenalty = rows.some((r) => /提前解約|違約金/.test(r.name || ''));
    if (d.penalty > 0 && !hasPenalty) {
      rows.unshift({ name: '提前解約違約金', amt: d.penalty });
    }
    return rows.slice(0, 4);
  }

  function checked(id) {
    return !!$(id)?.checked;
  }

  function parseNT(id) {
    const t = String($(id)?.textContent || $(id)?.value || '').replace(/,/g, '');
    const m = t.replace(/[^\d.-]/g, '');
    const n = parseInt(m, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function money(n) {
    const x = Math.round(Number(n) || 0);
    if (!x) return '';
    return x.toLocaleString('en-US');
  }

  function parseRoc(raw) {
    const s = String(raw || '').trim().replace(/\s/g, '');
    if (!s) return null;
    const m = s.match(/^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return null;
    let y = parseInt(m[1], 10);
    if (y >= 1912) y -= 1911;
    return { y: String(y), m: String(+m[2]), d: String(+m[3]) };
  }

  function todayRoc() {
    const d = new Date();
    return { y: String(d.getFullYear() - 1911), m: String(d.getMonth() + 1), d: String(d.getDate()) };
  }

  function isSameRocDay(a, b) {
    if (!a || !b) return false;
    return Number(a.y) === Number(b.y) && Number(a.m) === Number(b.m) && Number(a.d) === Number(b.d);
  }

  /** 房客結清且點交日為「當天」（＝今天或＝實際解約日）→ 不套印第五點 */
  function shouldSkipSection5(utilPayer, handoverDate, exitDate) {
    if (String(utilPayer || '') !== 'tenant') return false;
    if (!handoverDate) return false;
    return isSameRocDay(handoverDate, todayRoc()) || isSameRocDay(handoverDate, exitDate);
  }

  /** 房客結清：不扣匯費 30（與試算「押金沖抵後餘額」一致） */
  function shouldSkipRemitFee(utilPayer) {
    return String(utilPayer || '') === 'tenant';
  }

  function resolveUtilPayerAndHandover(bao) {
    let utilPayer =
      val('term-handover-util-payer') ||
      val(bao ? 'bao-term-handover-util-payer' : 'term-case-handover-util-payer') ||
      '';
    let handoverRaw =
      val('term-handover-exit-date') ||
      val(bao ? 'bao-term-handover-date' : 'term-case-handover-date') ||
      '';
    try {
      const api = bao ? window.TerminationBaoCase : window.TerminationCase;
      const id = val(bao ? 'bao-term-active-id' : 'term-case-active-id');
      const row = (api?.readCases?.() || []).find((c) => c && c.id === id);
      const h = row?.handover || {};
      if (!utilPayer && h.utilPayer) utilPayer = String(h.utilPayer);
      if (!handoverRaw && h.exitDate) handoverRaw = String(h.exitDate);
    } catch (_) {}
    return { utilPayer, handoverDate: parseRoc(handoverRaw) };
  }

  function daysIncl(a, b) {
    if (!a || !b) return 0;
    const da = Date.UTC(+a.y + 1911, +a.m - 1, +a.d);
    const db = Date.UTC(+b.y + 1911, +b.m - 1, +b.d);
    return Math.round((db - da) / 86400000) + 1;
  }

  function rocToDate(roc) {
    if (!roc) return null;
    const dt = new Date(Number(roc.y) + 1911, Number(roc.m) - 1, Number(roc.d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function dateToRoc(dt) {
    if (!dt || Number.isNaN(dt.getTime())) return null;
    return { y: String(dt.getFullYear() - 1911), m: String(dt.getMonth() + 1), d: String(dt.getDate()) };
  }

  function addDays(dt, n) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
  }

  function dueDateInMonth(y, monthIndex, dueDay) {
    const last = new Date(y, monthIndex + 1, 0).getDate();
    return new Date(y, monthIndex, Math.min(dueDay, last));
  }

  /** 民法第 121 條：自首日起一個月之末日 */
  function oneCivilMonthEndInclusive(periodStart) {
    const y = periodStart.getFullYear();
    const m = periodStart.getMonth();
    const d = periodStart.getDate();
    const ny = m === 11 ? y + 1 : y;
    const nm = m === 11 ? 0 : m + 1;
    const last = new Date(ny, nm + 1, 0).getDate();
    if (d > last) return new Date(ny, nm, last);
    return new Date(ny, nm, d - 1);
  }

  function rentPeriodStartContaining(day, dueDay) {
    let y = day.getFullYear();
    let m = day.getMonth();
    let candidate = dueDateInMonth(y, m, dueDay);
    if (candidate > day) {
      const pm = m - 1;
      const py = pm < 0 ? y - 1 : y;
      candidate = dueDateInMonth(py, pm < 0 ? 11 : pm, dueDay);
    }
    let guard = 0;
    while (guard < 3) {
      const pe = oneCivilMonthEndInclusive(candidate);
      if (day <= pe) return candidate;
      candidate = addDays(pe, 1);
      guard += 1;
    }
    return candidate;
  }

  function rentPeriodEndInclusive(periodStart, _dueDay) {
    return oneCivilMonthEndInclusive(periodStart);
  }

  function nextRentPeriodStart(periodStart, dueDay) {
    return addDays(rentPeriodEndInclusive(periodStart, dueDay), 1);
  }

  /** 溢繳未使用區間：解約日次日～「解約次日所屬繳租週期」末日（繳租日＝起租日之幾號） */
  function overpayUnusedRange(leaseStartRoc, exitRoc) {
    const empty = { from: null, to: null, days: 0 };
    const exit = rocToDate(exitRoc);
    if (!exit) return empty;
    const fromDt = addDays(exit, 1);
    const start = rocToDate(leaseStartRoc);
    let toDt;
    if (start) {
      const dueDay = start.getDate();
      const ps = rentPeriodStartContaining(fromDt, dueDay);
      toDt = rentPeriodEndInclusive(ps, dueDay);
      // 解約次日若早於該期首日，整期未使用 → 自週期首日算
      if (fromDt < ps) {
        const from = dateToRoc(ps);
        const to = dateToRoc(toDt);
        return { from, to, days: daysIncl(from, to) };
      }
    } else {
      toDt = new Date(exit.getFullYear(), exit.getMonth() + 1, 0);
    }
    if (fromDt > toDt) return empty;
    const from = dateToRoc(fromDt);
    const to = dateToRoc(toDt);
    return { from, to, days: daysIncl(from, to) };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('無法載入：' + src));
      document.head.appendChild(s);
    });
  }

  async function loadKaiParts() {
    if (kaiPartsPromise) return kaiPartsPromise;
    kaiPartsPromise = (async () => {
      if (!window.LAL_FONT_PART_COUNT) {
        await loadScript(new URL(FONT_MANIFEST, document.baseURI).href);
      }
      const total = window.LAL_FONT_PART_COUNT;
      if (!total) throw new Error('找不到標楷體字型（js/lal-font）');
      window.LAL_FONT_PARTS = window.LAL_FONT_PARTS || [];
      for (let i = window.LAL_FONT_PARTS.length; i < total; i++) {
        if (pdfBusy) setPdfStatus('載入標楷體中…（' + (i + 1) + '/' + total + '）', 'ok', true);
        await loadScript(new URL(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js', document.baseURI).href);
      }
    })();
    try {
      await kaiPartsPromise;
    } catch (err) {
      kaiPartsPromise = null;
      throw err;
    }
  }

  async function decodeKaiParts() {
    const parts = window.LAL_FONT_PARTS || [];
    if (!parts.length) throw new Error('標楷體分片未載入');
    const chunks = [];
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
      setPdfStatus('組標楷體中…（' + (i + 1) + '/' + parts.length + '），請稍候不要關閉', 'ok', true);
      await yieldUi();
      const bin = atob(parts[i]);
      const buf = new Uint8Array(bin.length);
      const step = 32768;
      for (let j = 0; j < bin.length; j += step) {
        const end = Math.min(j + step, bin.length);
        for (let k = j; k < end; k++) buf[k] = bin.charCodeAt(k);
      }
      chunks.push(buf);
      total += buf.length;
    }
    setPdfStatus('合併標楷體中…', 'ok', true);
    await yieldUi();
    const out = new Uint8Array(total);
    let off = 0;
    for (const chunk of chunks) {
      out.set(chunk, off);
      off += chunk.length;
    }
    return out.buffer;
  }

  async function loadKaiBytes() {
    if (kaiFontBytesPromise) return kaiFontBytesPromise;
    kaiFontBytesPromise = (async () => {
      await loadKaiParts();
      return decodeKaiParts();
    })();
    try {
      return await kaiFontBytesPromise;
    } catch (err) {
      kaiFontBytesPromise = null;
      throw err;
    }
  }

  function isTimesChar(ch) {
    const c = ch.charCodeAt(0);
    return c >= 0x20 && c <= 0x7e;
  }

  function pickFont(ch, fonts) {
    return isTimesChar(ch) ? fonts.times : fonts.kai;
  }

  function widthOfMixed(str, size, fonts) {
    const s = size || SIZE;
    let w = 0;
    for (const ch of String(str || '')) {
      w += pickFont(ch, fonts).widthOfTextAtSize(ch, s);
    }
    return w;
  }

  function isBaoMode(forceKind) {
    if (forceKind === 'bao' || forceKind === 'zhuan') return forceKind === 'bao';
    const baoPage = $('page-business-bao-deposit-refund');
    const zhuanPage = $('page-business-deposit-refund');
    const baoVisible = !!(baoPage && !baoPage.classList.contains('hidden'));
    const zhuanVisible = !!(zhuanPage && !zhuanPage.classList.contains('hidden'));
    // 以目前可見頁為準（避免先前點交留下的 __termHandoverKind 蓋掉包租／轉租）
    if (baoVisible && !zhuanVisible) return true;
    if (zhuanVisible && !baoVisible) return false;
    if (window.__termHandoverKind === 'bao') return true;
    if (window.__termHandoverKind === 'zhuan') return false;
    if (val('bao-term-active-id') || val('bao-term-landlord-name')) {
      if (!val('term-case-active-id') && !val('term-case-tenant-name')) return true;
    }
    return baoVisible;
  }

  function reasonText() {
    const bao = isBaoMode();
    const code = val(bao ? 'bao-term-reason' : 'term-case-reason');
    if (!code) return '';
    if (code === '其他') {
      const note = val(bao ? 'bao-term-reason-note' : 'term-case-reason-note');
      if (bao) return note ? '房客因素：' + note : '房客因素';
      return note ? '其他：' + note : '其他';
    }
    return code;
  }

  function collectFill(forceKind) {
    const bao = isBaoMode(forceKind);
    if (bao) window.__termHandoverKind = 'bao';
    else if (forceKind === 'zhuan') window.__termHandoverKind = 'zhuan';
    if (!bao) {
      try {
        window.TerminationCase?.syncNoticeExitFromBao?.(false);
      } catch (_) {}
    }
    const pfx = bao ? 'baoref-' : 'depref-';
    const leaseEnd = val(bao ? 'bao-term-lease-end' : 'term-case-lease-end') || '';
    const exit = parseRoc(val(pfx + 'exit-full-date'));
    const end = parseRoc(leaseEnd);
    const start = parseRoc(val(pfx + 'lease-start-date'));
    let early = true;
    if (exit && end) {
      const a = +exit.y * 10000 + +exit.m * 100 + +exit.d;
      const b = +end.y * 10000 + +end.m * 100 + +end.d;
      early = a < b;
    }
    const grandEl = $(pfx + 'out-grand');
    const deposit = Number(grandEl?.dataset.totalDeposit || 0);
    const balance = Number(grandEl?.dataset.depositBalance || 0);
    const arrears = parseNT(pfx + 'out-arrears-billing');
    const overpay = parseNT(pfx + 'out-overpay');
    const penalty = parseNT(pfx + 'out-penalty-notice');
    const mgmtOver = parseNT(pfx + 'out-mgmt-fee');
    const firstMissed = parseRoc(val(pfx + 'first-missed-due-date'));
    const rentArrearsRaw = Number(grandEl?.dataset?.rentArrears);
    const mgmtArrearsRaw = Number(grandEl?.dataset?.mgmtArrears);
    const arrearsRent = Number.isFinite(rentArrearsRaw) ? Math.round(rentArrearsRaw) : arrears;
    const arrearsMgmt = Number.isFinite(mgmtArrearsRaw) ? Math.round(mgmtArrearsRaw) : 0;
    const company = resolveCompanyParty(val(bao ? 'bao-term-office-id' : 'term-case-office-id'));
    const landlordName = val('bao-term-landlord-name');
    const utilHand = resolveUtilPayerAndHandover(bao);
    const handoverDate = utilHand.handoverDate;
    const utilPayer = utilHand.utilPayer;
    const skipSection5 = shouldSkipSection5(utilPayer, handoverDate, exit);
    // 範本固定印「匯費 30」；試算／押金尚剩餘不扣這 30（與畫面上應退合計一致）
    const remitFee = 0;
    // 押金尚剩餘＝試算合計（押金扣款後餘額＋溢繳），與畫面上「房東／房客應退還合計」一致
    const rawGrand = Number(grandEl?.dataset.rawGrand);
    const remainBase = Number.isFinite(rawGrand) ? rawGrand : Math.round(balance + overpay);
    return {
      kind: bao ? 'bao' : 'zhuan',
      lessor: bao ? landlordName : company.name,
      tenant: bao ? company.name : val('term-case-tenant-name'),
      address: val(bao ? 'bao-term-address' : 'term-case-address'),
      sign: parseRoc(val(bao ? 'bao-term-sign-date' : 'term-case-sign-date')) || start,
      start,
      end,
      exit,
      notice: parseRoc(val(pfx + 'notice-date')),
      reason: reasonText(),
      baoToMgmt: val(bao ? 'bao-term-bao-to-mgmt' : 'term-case-bao-to-mgmt') || 'no',
      early,
      tenantId: bao ? company.taxId : val('term-case-tenant-id'),
      tenantPhone: bao ? company.phone : val('term-case-tenant-phone'),
      partyA: bao
        ? {
            name: landlordName,
            taxId: val('bao-term-landlord-id'),
            address: val('bao-term-landlord-address') || val('bao-term-address'),
            phone: val('bao-term-landlord-phone')
          }
        : company,
      partyB: bao
        ? company
        : {
            name: val('term-case-tenant-name'),
            taxId: val('term-case-tenant-id'),
            address: val('term-case-address'),
            phone: val('term-case-tenant-phone')
          },
      officeId: company.officeId,
      officeName: company.officeName,
      deposit,
      remain: Math.round(remainBase),
      remitFee,
      skipSection5,
      arrears,
      arrearsRent,
      arrearsMgmt,
      overpay,
      overpayOn: checked(pfx + 'overpay-yes'),
      penalty,
      mgmtOver,
      firstMissed,
      extraItems: collectExtraItems('handover'),
      water: parseNT(pfx + 'water'),
      electric: parseNT(pfx + 'electric'),
      gas: parseNT(pfx + 'gas'),
      cleaning: parseNT(pfx + 'cleaning'),
      repair: parseNT(pfx + 'repair'),
      otherDeduct: parseNT(pfx + 'other-deduct'),
      handoverDate,
      handoverWater:
        parseNT(bao ? 'bao-term-handover-water' : 'term-case-handover-water') || parseNT('term-handover-water'),
      handoverElectric:
        parseNT(bao ? 'bao-term-handover-electric' : 'term-case-handover-electric') ||
        parseNT('term-handover-electric'),
      handoverGas:
        parseNT(bao ? 'bao-term-handover-gas' : 'term-case-handover-gas') || parseNT('term-handover-gas'),
      utilPayer,
      bank: {
        bank: val(bao ? 'bao-term-bank-name' : 'term-case-bank-name'),
        branch: val(bao ? 'bao-term-bank-branch' : 'term-case-bank-branch'),
        accountName: val(bao ? 'bao-term-bank-account-name' : 'term-case-bank-account-name'),
        accountNo: val(bao ? 'bao-term-bank-account-no' : 'term-case-bank-account-no')
      },
      promissory: bao ? '' : val('term-case-promissory'),
      formDate: handoverDate || null,
      // start＝baoref/depref 起租日；包租已帶入轉租起租日作為繳租週期
      overpaySpan: overpayUnusedRange(start, exit),
      passbookCover: bao ? null : window.TerminationCase?.getPassbookCover?.() || null
    };
  }

  function base64ToBytes(b64) {
    const bin = atob(String(b64 || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function ensurePassbookCover(d) {
    if (d.kind === 'bao') return null;
    if (d.passbookCover?.base64) return d.passbookCover;
    const lookup = window.TerminationCase?.lookupTenantBank;
    if (typeof lookup !== 'function') return null;
    const tenant = d.tenant || val('term-case-tenant-name');
    const idNo = d.tenantId || val('term-case-tenant-id');
    const matchNo = val('term-case-match-no');
    if (!tenant && !idNo) return null;
    try {
      const data = await lookup(tenant, idNo, matchNo);
      if (data?.passbookCover?.base64) {
        window.TerminationCase?.applyPassbookCover?.(data.passbookCover);
        return data.passbookCover;
      }
    } catch {
      /* 無封面不阻斷解約單 */
    }
    return null;
  }

  async function appendPassbookPage(pdf, fonts, cover, rgb) {
    if (!cover?.base64) return false;
    const bytes = base64ToBytes(cover.base64);
    const ct = String(cover.contentType || '').toLowerCase();
    const name = String(cover.fileName || cover.path || '').toLowerCase();
    let image = null;
    const tryPng = ct.includes('png') || name.endsWith('.png');
    const tryJpg = ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g$/.test(name);
    try {
      if (tryPng) image = await pdf.embedPng(bytes);
      else if (tryJpg || !tryPng) image = await pdf.embedJpg(bytes);
    } catch {
      try {
        image = tryPng ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      } catch {
        return false;
      }
    }
    if (!image) return false;
    const page = pdf.addPage();
    const { width, height } = page.getSize();
    const margin = 36;
    const ink = rgb(0, 0, 0);
    draw(page, fonts, '房客存摺封面', margin, height - margin - 4, 14, ink);
    const maxW = width - margin * 2;
    const maxH = height - margin * 2 - 28;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: margin + (maxW - w) / 2,
      y: margin + Math.max(0, (maxH - h) / 2),
      width: w,
      height: h
    });
    return true;
  }

  function missingForPdf(d) {
    const miss = [];
    if (d.kind === 'bao') {
      if (!d.lessor) miss.push('房東姓名');
    } else {
      if (!d.tenant) miss.push('房客姓名');
    }
    if (!d.address) miss.push('租賃地址');
    if (!d.start) miss.push('合約起租日');
    if (!d.notice) miss.push('告知解約日');
    if (!d.exit) miss.push('實際解約日');
    if (!d.reason) miss.push('解約原因');
    return miss;
  }

  function draw(page, fonts, text, x, y, size, color) {
    const t = String(text || '');
    if (!t) return;
    const s = size || SIZE;
    let cx = x;
    for (const ch of t) {
      const font = pickFont(ch, fonts);
      page.drawText(ch, { x: cx, y, size: s, font, color });
      cx += font.widthOfTextAtSize(ch, s);
    }
  }

  function drawFit(page, fonts, text, x, y, size, maxW, color) {
    const t = String(text || '');
    if (!t) return;
    let s = size || SIZE;
    while (s > 8 && widthOfMixed(t, s, fonts) > maxW) s -= 0.25;
    draw(page, fonts, t, x, y, s, color);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function drawYmd(page, fonts, roc, yX, mX, dX, y, size, color) {
    if (!roc) return;
    draw(page, fonts, roc.y, yX, y, size || SIZE, color);
    draw(page, fonts, pad2(roc.m), mX, y, size || SIZE, color);
    draw(page, fonts, pad2(roc.d), dX, y, size || SIZE, color);
  }

  function cover(page, x, y, w, h, white) {
    page.drawRectangle({ x, y: y - 2.4, width: w, height: h || 15, color: white });
  }

  /** x 為表上「□」格子左緣（標楷體 13pt＝13 寬；半形字 6.5） */
  function glyphW(ch) {
    return isTimesChar(ch) ? SIZE / 2 : SIZE;
  }

  function textWidth(str) {
    let w = 0;
    for (const ch of String(str || '')) w += glyphW(ch);
    return w;
  }

  function boxX(textX, beforeBox) {
    return textX + textWidth(beforeBox);
  }

  /** 蓋掉原稿 □／■，再印與「提前解約」同一顆標楷體方塊字 */
  function stampBox(page, fonts, x, y, ch, white, ink) {
    page.drawRectangle({
      x,
      y: y - 2.2,
      width: SIZE,
      height: SIZE + 3.1,
      color: white
    });
    page.drawText(ch, { x, y, size: SIZE, font: fonts.kai, color: ink });
  }

  function tick(page, fonts, x, y, white, ink) {
    stampBox(page, fonts, x, y, '■', white, ink);
  }

  function wipeSample(page1, white) {
    cover(page1, 86, 718.92, 372, 15, white);
    cover(page1, 86, 691.92, 372, 15, white);
  }

  const SUBMIT_CHECKLIST = [
    '行政解約／解碼表',
    '解約單（A4、A3 版）',
    '房客退押存摺',
    '水電瓦管等其他費用繳費證明',
    '房東／房客提前一個月告知解約之截圖（須有日期、解約原因）',
    '如包租與轉租約都解：請附上房東退押截圖（房東退押後才會退押給房客）',
    '如僅解轉租約、包租約未解：請附上房東止付協議書，或老闆同意空屋成本之簽呈（未附即退件）'
  ];

  /** 完整解約單下載時置於第 1 頁：送件檢核清單（□ 可手勾） */
  function insertSubmitChecklistPage(pdf, fonts, d, rgb) {
    const ink = rgb(0, 0, 0);
    const gray = rgb(0.25, 0.25, 0.28);
    const base = pdf.getPages()[0];
    const { width, height } = base.getSize();
    const page = pdf.addPage([width, height]);
    const marginX = 48;
    const titleSize = 18;
    const bodySize = 12;
    const noteSize = 11;
    let y = height - 56;

    draw(page, fonts, '解約送件檢核清單', marginX, y, titleSize, ink);
    y -= 28;
    drawFit(
      page,
      fonts,
      '請確認資料齊全再送件。下列項目請逐一勾選後，連同本檔一併送件。',
      marginX,
      y,
      noteSize + 1,
      width - marginX * 2,
      ink
    );
    y -= 26;

    const who =
      d.kind === 'bao'
        ? '包租｜房東 ' + (d.lessor || '—')
        : '轉租｜房客 ' + (d.tenant || '—');
    drawFit(page, fonts, '案件：' + who, marginX, y, bodySize, width - marginX * 2, gray);
    y -= 18;
    if (d.address) {
      drawFit(page, fonts, '地址：' + d.address, marginX, y, bodySize, width - marginX * 2, gray);
      y -= 22;
    } else {
      y -= 8;
    }

    const box = 13;
    const lineGap = 8;
    const maxW = width - marginX * 2 - box - 12;

    SUBMIT_CHECKLIST.forEach((text, i) => {
      const num = String(i + 1) + '.';
      // 空心方框供手勾
      page.drawRectangle({
        x: marginX,
        y: y - 2,
        width: box,
        height: box,
        borderColor: ink,
        borderWidth: 1.2
      });
      const label = num + ' ' + text;
      // 簡易換行
      const lines = [];
      let cur = '';
      for (const ch of label) {
        const next = cur + ch;
        if (widthOfMixed(next, bodySize, fonts) > maxW && cur) {
          lines.push(cur);
          cur = ch;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      lines.forEach((line, li) => {
        draw(page, fonts, line, marginX + box + 10, y, bodySize, ink);
        if (li < lines.length - 1) y -= bodySize + 4;
      });
      y -= bodySize + lineGap + 10;
    });

    y -= 8;
    draw(page, fonts, '業務確認', marginX, y, bodySize, ink);
    y -= 28;
    draw(page, fonts, '確認人：____________________', marginX, y, bodySize, gray);
    draw(page, fonts, '日期：______年____月____日', marginX + 260, y, bodySize, gray);
    y -= 36;
    drawFit(
      page,
      fonts,
      '※ 勾選完成後請將本頁連同後附解約單與證明文件一併送件；資料不齊將予退件。',
      marginX,
      y,
      noteSize,
      width - marginX * 2,
      gray
    );

    // 移到第 1 頁
    const last = pdf.getPageCount() - 1;
    const checklistPage = pdf.getPage(last);
    pdf.removePage(last);
    pdf.insertPage(0, checklistPage);
  }

  function fillPages(pdf, fonts, d, rgb) {
    const ink = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const p1 = pdf.getPages()[0];
    const p2 = pdf.getPages()[1];
    const p3 = pdf.getPages()[2];
    const p4 = pdf.getPages()[3];
    wipeSample(p1, white);

    if (d.worksheetHint) {
      cover(p3, 30, 812, 535, 22, white);
      draw(
        p3,
        fonts,
        '【對照用・僅第３－４頁】請將下列數字謄寫至紙本解約單，非正式完整檔',
        36,
        816,
        10,
        ink
      );
    }

    drawFit(p1, fonts, d.lessor, 87.996, 718.92, SIZE, 368, ink);
    drawFit(p1, fonts, d.tenant, 87.996, 691.92, SIZE, 368, ink);
    if (!d.early) {
      tick(p1, fonts, boxX(36, '茲為乙方'), 664.92, white, ink);
      stampBox(p1, fonts, boxX(36, '茲為乙方□到期解約'), 664.92, '□', white, ink);
    }
    drawFit(p1, fonts, d.address, 192, 613.92, SIZE, 338, ink);
    drawYmd(p1, fonts, d.sign, 326.5, 372, 411, 592.92, SIZE, ink);
    drawYmd(p1, fonts, d.start, 326.5, 372, 411, 571.92, SIZE, ink);
    drawYmd(p1, fonts, d.end, 79.5, 125, 164.1, 550.92, SIZE, ink);
    drawFit(p1, fonts, d.reason, 352.5, 550.92, SIZE, 108, ink);
    drawYmd(p1, fonts, d.exit, 79.5, 125, 164.1, 529.92, SIZE, ink);
    draw(p1, fonts, d.notice?.y || '', 79.5, 508.92, SIZE, ink);
    draw(p1, fonts, d.notice ? pad2(d.notice.m) : '', 118, 508.92, SIZE, ink);
    draw(p1, fonts, d.notice ? pad2(d.notice.d) : '', 151, 508.92, SIZE, ink);

    drawFit(p2, fonts, d.partyA.name, 115.5, 622.2, SIZE, 380, ink);
    draw(p2, fonts, d.partyA.taxId, 128.5, 580.2, SIZE, ink);
    drawFit(p2, fonts, d.partyA.address, 115.5, 559.2, SIZE, 400, ink);
    draw(p2, fonts, d.partyA.phone, 115.5, 536, SIZE, ink);
    const partyB = d.partyB || { name: d.tenant, taxId: d.tenantId, address: d.address, phone: d.tenantPhone };
    drawFit(p2, fonts, partyB.name || d.tenant, 115.5, 496.2, SIZE, 380, ink);
    draw(p2, fonts, partyB.taxId || d.tenantId, 115.5, 475.2, SIZE, ink);
    drawFit(p2, fonts, partyB.address || d.address, 115.5, 433.2, SIZE, 400, ink);
    draw(p2, fonts, partyB.phone || d.tenantPhone, 115.5, 410, SIZE, ink);
    if (d.formDate) drawYmd(p2, fonts, d.formDate, 248, 321, 386, 362.7, SIZE, ink);

    if (d.baoToMgmt === 'yes') tick(p3, fonts, boxX(36, '一、本件終止性質'), 718.9, white, ink);
    else if (d.baoToMgmt === 'no') tick(p3, fonts, boxX(36, '一、本件終止性質□是'), 718.9, white, ink);
    if (d.deposit > 0) draw(p3, fonts, money(d.deposit), 428, 700.9, SIZE, ink);

    const rentArr = Math.max(0, Math.round(Number(d.arrearsRent) || 0));
    const mgmtArr = Math.max(0, Math.round(Number(d.arrearsMgmt) || 0));
    const arrearsTotal = rentArr + mgmtArr > 0 ? rentArr + mgmtArr : Math.max(0, Math.round(Number(d.arrears) || 0));
    const utilWater = Math.max(
      0,
      Math.round(Number(d.handoverWater) || Number(d.water) || 0)
    );
    const utilElectric = Math.max(
      0,
      Math.round(Number(d.handoverElectric) || Number(d.electric) || 0)
    );
    const utilGas = Math.max(0, Math.round(Number(d.handoverGas) || Number(d.gas) || 0));
    const utilSum = utilWater + utilElectric + utilGas;
    // 押金扣除／舊版 agent → 欠繳；房客結清、另外給、舊版 tenant → 相關費結算
    const utilPayer = String(d.utilPayer || '');
    const utilToArrears =
      utilPayer === 'agent-deposit' ||
      utilPayer === 'landlord-deposit' ||
      utilPayer === 'agent';
    const utilToSettle =
      utilPayer === 'tenant' ||
      utilPayer === 'agent-extra' ||
      utilPayer === 'landlord-extra' ||
      (!utilPayer && !!d.handoverDate);

    if (arrearsTotal > 0 || (utilToArrears && utilSum > 0)) {
      tick(p3, fonts, boxX(36, '三、欠繳部分'), 664.9, white, ink);
      const from = d.firstMissed || d.start;
      const to = d.exit;
      const n = daysIncl(from, to);
      if (rentArr > 0 || (mgmtArr <= 0 && arrearsTotal > 0)) {
        tick(p3, fonts, boxX(49, '1. '), 646.9, white, ink);
        drawYmd(p3, fonts, from, 148, 186, 212, 646.9, SIZE, ink);
        drawYmd(p3, fonts, to, 292, 329, 355, 646.9, SIZE, ink);
        if (n > 0) draw(p3, fonts, String(n), 84, 628.9, SIZE, ink);
        draw(p3, fonts, money(rentArr > 0 ? rentArr : arrearsTotal), 165, 628.9, SIZE, ink);
      }
      if (mgmtArr > 0) {
        tick(p3, fonts, boxX(49, '2. '), 610.9, white, ink);
        drawYmd(p3, fonts, from, 161, 200, 226, 610.9, SIZE, ink);
        drawYmd(p3, fonts, to, 304, 343, 369, 610.9, SIZE, ink);
        if (n > 0) draw(p3, fonts, String(n), 110, 592.9, SIZE, ink);
        draw(p3, fonts, money(mgmtArr), 191, 592.9, SIZE, ink);
      }
      if (utilToArrears && utilSum > 0) {
        if (utilWater > 0) {
          tick(p3, fonts, boxX(49, '3. '), 574.9, white, ink);
          draw(p3, fonts, money(utilWater), 112, 574.9, SIZE, ink);
        }
        if (utilElectric > 0) {
          tick(p3, fonts, boxX(153, '元整；'), 574.9, white, ink);
          draw(p3, fonts, money(utilElectric), 236, 574.9, SIZE, ink);
        }
        if (utilGas > 0) {
          tick(p3, fonts, boxX(276.5, '元整；'), 574.9, white, ink);
          draw(p3, fonts, money(utilGas), 372, 574.9, SIZE, ink);
        }
      }
    } else {
      tick(p3, fonts, boxX(36, '三、欠繳部分□有'), 664.9, white, ink);
    }

    if (d.cleaning > 0) {
      tick(p3, fonts, 68.5, 556.9, white, ink);
      draw(p3, fonts, money(d.cleaning), 126, 556.9, SIZE, ink);
    }

    if (d.overpayOn && d.overpay > 0) {
      tick(p3, fonts, boxX(36, '四、溢繳部分'), 502.9, white, ink);
      tick(p3, fonts, boxX(49, '1. '), 484.9, white, ink);
      const span = d.overpaySpan || {};
      if (span.from && span.to) {
        drawYmd(p3, fonts, span.from, 148, 186, 212, 484.9, SIZE, ink);
        drawYmd(p3, fonts, span.to, 292, 329, 355, 484.9, SIZE, ink);
        if (span.days > 0) draw(p3, fonts, String(span.days), 84, 466.9, SIZE, ink);
      }
      draw(p3, fonts, money(d.overpay), 165, 466.9, SIZE, ink);
      if (d.mgmtOver > 0) {
        tick(p3, fonts, boxX(49, '2. '), 448.9, white, ink);
        if (span.from && span.to) {
          drawYmd(p3, fonts, span.from, 161, 200, 226, 448.9, SIZE, ink);
          drawYmd(p3, fonts, span.to, 304, 343, 369, 448.9, SIZE, ink);
          if (span.days > 0) draw(p3, fonts, String(span.days), 110, 430.9, SIZE, ink);
        }
        draw(p3, fonts, money(d.mgmtOver), 191, 430.9, SIZE, ink);
      }
    } else {
      tick(p3, fonts, boxX(36, '四、溢繳部分□有'), 502.9, white, ink);
    }

    // 第五點：僅「房客結清」且點交日非當天時套印；當天現場結清則留白且不扣匯費 30
    const fillSection5 = !!d.handoverDate && utilToSettle && !d.skipSection5;
    if (fillSection5) {
      drawYmd(p3, fonts, d.handoverDate, 302, 342, 374, 358.9, SIZE, ink);
      // 勾「承租人」（房客結清）；勿勾出租人
      tick(p3, fonts, 148, 340.9, white, ink);
      if (utilWater > 0) draw(p3, fonts, money(utilWater), 185.5, 322.9, SIZE, ink);
      if (utilElectric > 0) draw(p3, fonts, money(utilElectric), 393.4, 322.9, SIZE, ink);
      if (utilGas > 0) draw(p3, fonts, money(utilGas), 224.5, 304.9, SIZE, ink);
    }

    const extras = buildExtraRows(d);
    const extraY = [250.9, 232.9, 214.9, 196.9];
    extras.forEach((row, i) => {
      const y = extraY[i];
      if (!y) return;
      drawFit(p3, fonts, row.name, 130, y, SIZE, 65, ink);
      draw(p3, fonts, money(row.amt), 320, y, SIZE, ink);
    });

    if (d.bank?.bank) drawFit(p4, fonts, d.bank.bank, 101, 764.7, SIZE, 88, ink);
    if (d.bank?.branch) drawFit(p4, fonts, d.bank.branch, 231, 764.7, SIZE, 62, ink);
    if (d.bank?.accountName) drawFit(p4, fonts, d.bank.accountName, 335, 764.7, SIZE, 160, ink);
    if (d.bank?.accountNo) draw(p4, fonts, d.bank.accountNo, 101, 746.7, SIZE, ink);

    // 點交前不填「押租金尚剩餘」數字與無剩餘／應補付勾選（初稿只帶帳戶）
    if (d.handoverDate) {
      // 範本維持印「匯費…30元」；數字不扣 30、也不蓋成 0（避免跑版）
      if (d.remain > 0) {
        draw(p3, fonts, money(d.remain), 145, 106.9, SIZE, ink);
      } else if (d.remain < 0) {
        tick(p4, fonts, 62, 710.7, white, ink);
        draw(p4, fonts, money(-d.remain), 257, 710.7, SIZE, ink);
      } else if (d.deposit > 0) {
        tick(p4, fonts, 62, 728.7, white, ink);
      }
    }
    if (d.kind !== 'bao') {
      if (d.promissory === 'yes') tick(p4, fonts, 62, 692.7, white, ink);
      else if (d.promissory === 'no') tick(p4, fonts, boxX(62, '□有 '), 692.7, white, ink);
    }
    if (d.formDate) drawYmd(p4, fonts, d.formDate, 178, 247, 312, 325.2, SIZE, ink);
  }

  function setPdfStatus(msg, kind, busy, opts) {
    const bao = isBaoMode();
    const el = $(bao ? 'bao-term-pdf-status' : 'term-case-pdf-status');
    if (el) {
      el.textContent = msg || '';
      el.className =
        'text-sm leading-relaxed ' +
        (kind === 'err' ? 'text-rose-700 font-semibold' : 'text-slate-600');
    }
    const hand = $('term-handover-pdf-status');
    if (hand) {
      hand.textContent = msg || '';
      hand.className =
        'text-xs leading-relaxed ' +
        (kind === 'err' ? 'text-rose-700 font-semibold' : 'text-slate-600');
    }
    const btnIds = bao ? ['bao-term-pdf-btn', 'bao-term-pdf-btn-bottom'] : ['term-case-pdf-btn'];
    btnIds.forEach((id) => {
      const btn = $(id);
      if (btn && typeof busy === 'boolean') {
        btn.disabled = busy;
        btn.textContent = busy ? '套印中…' : '下載已填解約單';
      }
    });
    const okBtn = $('term-handover-pdf-confirm-ok');
    if (okBtn && typeof busy === 'boolean' && opts?.worksheet) {
      okBtn.disabled = busy;
      okBtn.textContent = busy ? '產生中…' : '確認並下載對照用第 3、4 頁';
    }
  }

  function offerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 2000);
    return url;
  }

  function keepOnlyPages(pdf, pages1Based) {
    const keep = new Set(
      (pages1Based || [])
        .map((n) => Math.round(Number(n)) - 1)
        .filter((i) => i >= 0 && i < pdf.getPageCount())
    );
    if (!keep.size) return;
    for (let i = pdf.getPageCount() - 1; i >= 0; i--) {
      if (!keep.has(i)) pdf.removePage(i);
    }
  }

  async function fillAndDownload(opts) {
    if (pdfBusy) return;
    const options = opts && typeof opts === 'object' ? opts : {};
    const worksheet = !!options.worksheet;
    const pagesOnly = Array.isArray(options.pagesOnly) ? options.pagesOnly : null;
    const skipPassbook = options.skipPassbook != null ? !!options.skipPassbook : !!pagesOnly;
    const forceKind = options.kind === 'bao' || options.kind === 'zhuan' ? options.kind : undefined;
    let d;
    try {
      d = collectFill(forceKind);
    } catch (e) {
      setPdfStatus('套印失敗：' + String(e.message || e), 'err', false, options);
      return;
    }
    if (worksheet) d.worksheetHint = true;
    const miss = missingForPdf(d);
    if (miss.length) {
      setPdfStatus(
        (worksheet ? '下載對照用第 3、4 頁前請先填：' : '下載解約單前請先填：') + miss.join('、'),
        'err',
        false,
        options
      );
      if (!worksheet) {
        $('term-case-pdf-status')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        $('bao-term-pdf-status')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        $('term-handover-pdf-status')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }
    pdfBusy = true;
    try {
      setPdfStatus(
        worksheet
          ? '正在產生對照用解約單第 3、4 頁…'
          : '正在套印解約單（首次會載入標楷體，請稍候）…',
        'ok',
        true,
        options
      );
      if (!window.PDFLib) throw new Error('PDF 套件未載入');
      if (!window.fontkit) throw new Error('字型引擎未載入');
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const tplBuf = await fetch(new URL(TEMPLATE, document.baseURI)).then((r) => {
        if (!r.ok) throw new Error('找不到解約單範本');
        return r.arrayBuffer();
      });
      const kaiBytes = await loadKaiBytes();
      setPdfStatus('嵌入標楷體中，畫面可能暫停十幾秒，請不要關閉…', 'ok', true, options);
      await yieldUi();
      const pdf = await PDFDocument.load(tplBuf);
      pdf.registerFontkit(window.fontkit);
      const fonts = {
        kai: await pdf.embedFont(kaiBytes, { subset: true }),
        times: await pdf.embedFont(StandardFonts.TimesRoman)
      };
      setPdfStatus('排版產生中…', 'ok', true, options);
      await yieldUi();
      fillPages(pdf, fonts, d, rgb);
      if (!worksheet && !pagesOnly?.length) {
        insertSubmitChecklistPage(pdf, fonts, d, rgb);
      }
      let attached = false;
      if (!skipPassbook && d.kind !== 'bao') {
        setPdfStatus('附上存摺封面…', 'ok', true, options);
        await yieldUi();
        const cover = await ensurePassbookCover(d);
        attached = await appendPassbookPage(pdf, fonts, cover, rgb);
      }
      if (pagesOnly?.length) keepOnlyPages(pdf, pagesOnly);
      setPdfStatus('輸出檔案中…', 'ok', true, options);
      await yieldUi();
      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const who = d.kind === 'bao' ? d.lessor || '包租解約' : d.tenant || '解約';
      const suffix = worksheet || pagesOnly?.length ? '_點交對照_第3-4頁' : '_房屋租賃終止協議書';
      const name = String(who).replace(/[\\/:*?"<>|]/g, '') + suffix + '.pdf';
      offerDownload(blob, name);
      setPdfStatus(
        worksheet || pagesOnly?.length
          ? '已下載對照用第 3、4 頁。請依 PDF 數字手填紙本解約單；完整解約單請回案件頁「下載已填解約單」。'
          : d.kind === 'bao'
            ? '已產生包租解約單（第 1 頁為送件檢核清單，請勾選確認後再送件）。'
            : attached
              ? '已產生解約單（第 1 頁為送件檢核清單；含存摺封面）。請勾選確認資料齊全再送件。'
              : '已產生解約單（第 1 頁為送件檢核清單）。請勾選確認資料齊全再送件。（未附存摺封面：房客管理可能未上傳）',
        'ok',
        false,
        options
      );
    } catch (e) {
      kaiFontBytesPromise = null;
      setPdfStatus('套印失敗：' + String(e.message || e), 'err', false, options);
    } finally {
      pdfBusy = false;
    }
  }

  function fillReasonSelect() {
    const fill = (id, list) => {
      const sel = $(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML =
        '<option value="">— 請選擇解約原因 —</option>' +
        list
          .map((r) => {
            const label = r === '其他' ? (id === 'bao-term-reason' ? '房客因素' : '其他：附加說明') : r;
            return `<option value="${r}">${label}</option>`;
          })
          .join('');
      if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    };
    fill('term-case-reason', REASONS_ZHUAN);
    fill('bao-term-reason', REASONS_BAO);
  }

  function syncReasonNote() {
    const zhuan = $('term-case-reason-note-wrap');
    if (zhuan) zhuan.classList.toggle('hidden', val('term-case-reason') !== '其他');
    const bao = $('bao-term-reason-note-wrap');
    if (bao) bao.classList.toggle('hidden', val('bao-term-reason') !== '其他');
  }

  function wire() {
    fillReasonSelect();
    $('term-case-reason')?.addEventListener('change', syncReasonNote);
    $('bao-term-reason')?.addEventListener('change', syncReasonNote);
    const pdfBtns = ['term-case-pdf-btn', 'bao-term-pdf-btn', 'bao-term-pdf-btn-bottom'];
    pdfBtns.forEach((id) => {
      $(id)?.addEventListener(
        'pointerdown',
        () => {
          void loadKaiParts().catch(() => {});
        },
        { once: true }
      );
      $(id)?.addEventListener('click', () => {
        const kind = id.indexOf('bao-') === 0 ? 'bao' : 'zhuan';
        void fillAndDownload({ kind });
      });
    });
    syncReasonNote();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.TerminationAgreementPdf = {
    REASONS,
    REASONS_ZHUAN,
    REASONS_BAO,
    PARTY_A,
    COMPANY_OFFICES,
    getCompanyOffice,
    resolveCompanyParty,
    officeOptionsHtml,
    fillAndDownload,
    reasonText
  };
})();
