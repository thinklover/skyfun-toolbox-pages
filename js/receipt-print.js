/**
 * 星華／星鴻領款收據套印（業務專區）
 * 媒合編號查案 → 選媒合／解約版 → 公司別自動 → 四聯 PDF 座標套印
 */
(function () {
  'use strict';

  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  const FONT_MANIFEST = './js/lal-font/manifest.js';
  const FONT_PART_PREFIX = './js/lal-font/part-';
  const TEMPLATES = {
    match_xinghong: './docs/forms/媒合-領款收據_1151016版_星鴻.pdf',
    match_xinghua: './docs/forms/媒合-領款收據_1151016版_星華.pdf',
    term_xinghong: './docs/forms/解約-領款收據_1151016版_星鴻.pdf',
    term_xinghua: './docs/forms/解約-領款收據_1151016版_星華.pdf'
  };

  /** PDF 座標（pdf-lib 原點在左下；由 pymupdf 量測後換算；字型＝標楷體同範本） */
  const LAYOUT = {
    pageH: 841.92,
    amount: { x: 292, top: 175, size: 13 },
    address: { x: 224, top: 415, size: 12 },
    manager: { x: 224, top: 451, size: 12 },
    year: { x: 230, top: 603, size: 12 },
    month: { x: 345, top: 603, size: 12 },
    day: { x: 438, top: 603, size: 12 }
  };

  const $ = (id) => document.getElementById(id);
  const state = { row: null, busy: false };
  let kaiPartsPromise = null;
  let kaiBytesCache = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function setMsg(text, kind) {
    const el = $('rcp-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'rcp-msg' + (kind ? ' is-' + kind : '');
  }

  function todayParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
    const m = Number(parts.find((p) => p.type === 'month')?.value || 0);
    const d = Number(parts.find((p) => p.type === 'day')?.value || 0);
    return { y: y - 1911, m, d };
  }

  function moneyText(n) {
    const v = Math.round(Number(n) || 0);
    return v ? v.toLocaleString('zh-TW') : '';
  }

  function brandLabel(brand) {
    return brand === 'xinghua' ? '星華' : '星鴻';
  }

  /** 星華台北／星華臺北媒合編號：租管人員一律林呈錡 */
  function resolveManagerName(matchNo, fromApi) {
    const no = String(matchNo || '').normalize('NFKC');
    if (/星華台北|星華臺北/.test(no)) return '林呈錡';
    return String(fromApi || '').trim();
  }

  function yieldUi() {
    return new Promise((r) => setTimeout(r, 0));
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
        setMsg('載入標楷體中…（' + (i + 1) + '/' + total + '）', 'ok');
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
      setMsg('組標楷體中…（' + (i + 1) + '/' + parts.length + '）', 'ok');
      await yieldUi();
      const bin = atob(parts[i]);
      const buf = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
      chunks.push(buf);
      total += buf.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const chunk of chunks) {
      out.set(chunk, off);
      off += chunk.length;
    }
    return out.buffer;
  }

  async function loadKaiBytes() {
    if (kaiBytesCache) return kaiBytesCache;
    await loadKaiParts();
    kaiBytesCache = await decodeKaiParts();
    return kaiBytesCache;
  }

  function fillFormFromRow(row) {
    state.row = row;
    const panel = $('rcp-fields');
    if (panel) panel.hidden = false;
    if ($('rcp-match-show')) $('rcp-match-show').textContent = row.matchNo || '—';
    if ($('rcp-brand-show')) $('rcp-brand-show').textContent = brandLabel(row.brand) + '（' + (row.companyName || '') + '）';
    if ($('rcp-address')) $('rcp-address').value = row.address || '';
    if ($('rcp-manager')) $('rcp-manager').value = resolveManagerName(row.matchNo, row.managerName);
    if ($('rcp-amount')) $('rcp-amount').value = row.depositAmount || row.rent * (row.depositMonths || 2) || '';
    if ($('rcp-rent-hint')) {
      $('rcp-rent-hint').textContent = row.rent
        ? '系統月租 ' + moneyText(row.rent) + ' 元' + (row.depositMonths ? ' × ' + row.depositMonths + ' 個月' : '')
        : '系統未帶回月租，請自行確認金額';
    }
    const t = todayParts();
    if ($('rcp-year')) $('rcp-year').value = t.y;
    if ($('rcp-month')) $('rcp-month').value = t.m;
    if ($('rcp-day')) $('rcp-day').value = t.d;
    const dl = $('rcp-download');
    if (dl) dl.disabled = false;
  }

  async function lookup() {
    const matchNo = String($('rcp-match')?.value || '').trim();
    if (!matchNo) {
      setMsg('請輸入媒合編號', 'err');
      $('rcp-match')?.focus();
      return;
    }
    if (!token()) {
      setMsg('請先登入工具箱', 'err');
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const btn = $('rcp-lookup');
    if (btn) { btn.disabled = true; btn.textContent = '查詢中…'; }
    setMsg('正在向公司系統帶入合約…', 'ok');
    try {
      const res = await fetch(RPA_BASE + '/receipt/lookup?matchNo=' + encodeURIComponent(matchNo), {
        headers: { 'X-Skyfun-Session': token() }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || ('查詢失敗（' + res.status + '）'));
      fillFormFromRow(data);
      setMsg('已帶入：' + brandLabel(data.brand) + ' · ' + (data.address || '（無門牌）'), 'ok');
    } catch (err) {
      state.row = null;
      $('rcp-fields') && ($('rcp-fields').hidden = true);
      $('rcp-download') && ($('rcp-download').disabled = true);
      setMsg(String(err.message || err), 'err');
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '查詢帶入'; }
    }
  }

  function collectPrint() {
    if (!state.row) throw new Error('請先查詢媒合編號');
    const kind = String(document.querySelector('input[name="rcp-kind"]:checked')?.value || 'match');
    if (kind !== 'match' && kind !== 'term') throw new Error('請選擇媒合版或解約版');
    const address = String($('rcp-address')?.value || '').trim();
    const manager = resolveManagerName(state.row.matchNo, String($('rcp-manager')?.value || '').trim());
    const amount = Math.round(Number(String($('rcp-amount')?.value || '').replace(/[,，]/g, '')) || 0);
    const year = Number($('rcp-year')?.value || 0);
    const month = Number($('rcp-month')?.value || 0);
    const day = Number($('rcp-day')?.value || 0);
    if (!address) throw new Error('請填門牌');
    if (!manager) throw new Error('請填租賃住宅管理人員');
    if (!amount) throw new Error('請填押金金額');
    if (!year || !month || !day) throw new Error('請填日期（年／月／日）');
    const brand = state.row.brand === 'xinghua' ? 'xinghua' : 'xinghong';
    const key = (kind === 'term' ? 'term_' : 'match_') + brand;
    return {
      template: TEMPLATES[key],
      kind,
      brand,
      matchNo: state.row.matchNo,
      address,
      manager,
      amount,
      amountText: moneyText(amount),
      year: String(year),
      month: String(month),
      day: String(day),
      fileName: '領款收據_' + (kind === 'term' ? '解約' : '媒合') + '_' + brandLabel(brand) + '_' + (state.row.matchNo || '') + '.pdf'
    };
  }

  function pdfY(top, size) {
    return LAYOUT.pageH - top - size * 0.15;
  }

  async function downloadPdf() {
    let pack;
    try {
      pack = collectPrint();
    } catch (e) {
      setMsg(String(e.message || e), 'err');
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const btn = $('rcp-download');
    if (btn) { btn.disabled = true; btn.textContent = '套印中…'; }
    try {
      if (!window.PDFLib) throw new Error('PDF 套件未載入');
      if (!window.fontkit) throw new Error('字型引擎未載入');
      setMsg('載入範本與標楷體…（首次較久）', 'ok');
      const [tplBuf, kaiBytes] = await Promise.all([
        fetch(new URL(pack.template, document.baseURI)).then((r) => {
          if (!r.ok) throw new Error('找不到收據範本');
          return r.arrayBuffer();
        }),
        loadKaiBytes()
      ]);
      setMsg('寫入套印欄位…', 'ok');
      await yieldUi();
      const { PDFDocument, rgb } = window.PDFLib;
      const pdf = await PDFDocument.load(tplBuf);
      pdf.registerFontkit(window.fontkit);
      const font = await pdf.embedFont(kaiBytes, { subset: true });
      const ink = rgb(0.08, 0.1, 0.14);
      const pages = pdf.getPages();
      for (const page of pages) {
        page.drawText(pack.amountText, {
          x: LAYOUT.amount.x,
          y: pdfY(LAYOUT.amount.top, LAYOUT.amount.size),
          size: LAYOUT.amount.size,
          font,
          color: ink
        });
        page.drawText(pack.address, {
          x: LAYOUT.address.x,
          y: pdfY(LAYOUT.address.top, LAYOUT.address.size),
          size: LAYOUT.address.size,
          font,
          color: ink,
          maxWidth: 340
        });
        page.drawText(pack.manager, {
          x: LAYOUT.manager.x,
          y: pdfY(LAYOUT.manager.top, LAYOUT.manager.size),
          size: LAYOUT.manager.size,
          font,
          color: ink,
          maxWidth: 220
        });
        page.drawText(pack.year, {
          x: LAYOUT.year.x,
          y: pdfY(LAYOUT.year.top, LAYOUT.year.size),
          size: LAYOUT.year.size,
          font,
          color: ink
        });
        page.drawText(pack.month, {
          x: LAYOUT.month.x,
          y: pdfY(LAYOUT.month.top, LAYOUT.month.size),
          size: LAYOUT.month.size,
          font,
          color: ink
        });
        page.drawText(pack.day, {
          x: LAYOUT.day.x,
          y: pdfY(LAYOUT.day.top, LAYOUT.day.size),
          size: LAYOUT.day.size,
          font,
          color: ink
        });
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pack.fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg('已下載「' + pack.fileName + '」（四聯皆已套印；簽名欄留白）', 'ok');
    } catch (err) {
      setMsg('套印失敗：' + String(err.message || err), 'err');
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = !state.row; btn.textContent = '下載套印 PDF'; }
    }
  }

  function bind() {
    if (!$('page-business-receipt-print')) return;
    $('rcp-lookup')?.addEventListener('click', () => void lookup());
    $('rcp-match')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void lookup(); }
    });
    $('rcp-download')?.addEventListener('click', () => void downloadPdf());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.receiptPrintLookup = lookup;
})();
