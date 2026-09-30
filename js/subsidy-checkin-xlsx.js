(function (global) {
    'use strict';

    const FONT = 'Microsoft JhengHei';
    const BLACK = { argb: 'FF000000' };
    const THIN = { style: 'thin', color: BLACK };
    const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    const TITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0E3' }, bgColor: { argb: 'FFD0E0E3' } };
    const HINT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' }, bgColor: { argb: 'FFFFF2CC' } };
    const HINT_TEXT = '圖片插入方式：插入→圖片→將圖片插入儲存格內';
    const NOTICE = '注意事項：\n' +
        '1.如果當天業務出門場勘無法進辦公室打卡請上傳產勘照\n' +
        '2.如果證照上課，請於第一天上傳報名收據，並在上課那幾天輸入文字『證照上課中』\n' +
        '3.如有符合請假規範，請上傳主管同意請假畫面(但如果業績結算後不符合還是會退出計畫)';
    const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五'];
    const DAY_COL_WIDTH = 24.13;
    const PHOTO_ROW_HEIGHT = 129.75;
    const GAP_ROW_HEIGHT = 66;
    const EMU_PER_PX = 9525;
    const CELL_W_PX = Math.floor(DAY_COL_WIDTH * 7 + 5);
    const CELL_H_PX = Math.floor(PHOTO_ROW_HEIGHT * 96 / 72);
    const PAD_PX = 5;
    const NOTE_PX = 30;
    const MONTH_COLS = [1, 7];

    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
    function dow(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
    function addMonths(y, m, n) {
        const t = y * 12 + (m - 1) + n;
        return { y: Math.floor(t / 12), m: (t % 12) + 1 };
    }
    function rocMonth(y, m) { return (y - 1911) + '年' + pad(m) + '月'; }
    function rocYm(y, m) { return String(y - 1911) + pad(m); }

    function monthWeeks(y, m) {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const weeks = [];
        let row = null;
        for (let d = 1; d <= last; d++) {
            const s = ymd(y, m, d);
            const w = dow(s);
            if (w === 0 || w === 6) continue;
            if (!row || w === 1) { row = [null, null, null, null, null]; weeks.push(row); }
            row[w - 1] = s;
        }
        return weeks;
    }

    function rangeOf(startY, startM) {
        const end = addMonths(startY, startM, 3);
        return { from: ymd(startY, startM, 1), to: ymd(end.y, end.m, new Date(Date.UTC(end.y, end.m, 0)).getUTCDate()) };
    }

    function sheetName(raw, used) {
        let base = String(raw || '未命名').replace(/[\[\]:*?\/\\]/g, '').trim().slice(0, 28) || '未命名';
        let name = base, i = 2;
        while (used.has(name)) name = base.slice(0, 26) + '(' + i++ + ')';
        used.add(name);
        return name;
    }

    function style(cell, opts) {
        cell.font = Object.assign({ name: FONT, color: BLACK }, opts.font || {});
        if (opts.fill) cell.fill = opts.fill;
        if (opts.border) cell.border = opts.border;
        cell.alignment = Object.assign({ horizontal: 'center' }, opts.alignment || {});
    }

    function placeImage(wb, ws, img, col, row, reserveNote) {
        const boxW = CELL_W_PX - PAD_PX * 2;
        const boxH = CELL_H_PX - PAD_PX * 2 - (reserveNote ? NOTE_PX : 0);
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const offX = Math.floor((CELL_W_PX - w) / 2);
        const offY = PAD_PX + Math.floor((boxH - h) / 2);
        const id = wb.addImage({ buffer: img.buffer, extension: img.extension || 'jpeg' });
        ws.addImage(id, {
            tl: { nativeCol: col - 1, nativeColOff: offX * EMU_PER_PX, nativeRow: row - 1, nativeRowOff: offY * EMU_PER_PX },
            ext: { width: w, height: h },
            editAs: 'oneCell'
        });
    }

    function buildSheet(wb, ws, person, startY, startM, images) {
        const byDay = {};
        (person.entries || []).forEach((e) => { byDay[e.day] = e; });

        ws.properties.defaultRowHeight = 15.75;
        ws.columns = [
            DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, 4.13,
            DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, DAY_COL_WIDTH, 4.25, 66.75
        ].map((width) => ({ width }));

        const nameCell = ws.getCell(1, 13);
        nameCell.value = '姓名：' + (person.userName || person.username || '') + (person.team ? '（' + person.team + '）' : '');
        style(nameCell, { font: { bold: true, size: 16 }, alignment: { horizontal: 'left', vertical: 'middle' } });

        let r = 1;
        let noticePlaced = false;
        for (let block = 0; block < 2; block++) {
            const months = [addMonths(startY, startM, block * 2), addMonths(startY, startM, block * 2 + 1)];
            const weeks = months.map((mm) => monthWeeks(mm.y, mm.m));
            const rows = Math.max(weeks[0].length, weeks[1].length);

            ws.getRow(r).height = 45;
            ws.getRow(r + 1).height = 18.75;
            ws.getRow(r + 2).height = 22.5;
            months.forEach((mm, i) => {
                const c0 = MONTH_COLS[i];
                for (let k = 0; k < 5; k++) {
                    const title = ws.getCell(r, c0 + k);
                    title.value = rocMonth(mm.y, mm.m);
                    style(title, { font: { bold: true, size: 30 }, fill: TITLE_FILL, border: BOX, alignment: { vertical: 'middle', wrapText: true } });
                    const wd = ws.getCell(r + 1, c0 + k);
                    wd.value = WEEKDAYS[k];
                    style(wd, { border: BOX, alignment: { vertical: 'middle', wrapText: true } });
                    const hint = ws.getCell(r + 2, c0 + k);
                    hint.value = HINT_TEXT;
                    style(hint, { font: { bold: true, size: 14 }, fill: HINT_FILL, border: BOX, alignment: { vertical: 'middle' } });
                }
                ws.mergeCells(r, c0, r, c0 + 4);
                ws.mergeCells(r + 2, c0, r + 2, c0 + 4);
            });

            for (let w = 0; w < rows; w++) {
                const dateRow = r + 3 + w * 2;
                const photoRow = dateRow + 1;
                ws.getRow(photoRow).height = PHOTO_ROW_HEIGHT;
                if (!noticePlaced) {
                    const n = ws.getCell(photoRow, 13);
                    n.value = NOTICE;
                    style(n, { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
                    noticePlaced = true;
                }
                months.forEach((mm, i) => {
                    const week = weeks[i][w] || [null, null, null, null, null];
                    for (let k = 0; k < 5; k++) {
                        const col = MONTH_COLS[i] + k;
                        const s = week[k];
                        const dc = ws.getCell(dateRow, col);
                        const pc = ws.getCell(photoRow, col);
                        if (s) dc.value = Number(s.slice(8));
                        style(dc, { border: BOX, alignment: { vertical: 'middle' } });
                        style(pc, { border: BOX, alignment: { vertical: 'middle', wrapText: true } });
                        const e = s ? byDay[s] : null;
                        if (!e) continue;
                        const img = images && images[e.day + '|' + (person.userId || '')];
                        if (img) placeImage(wb, ws, img, col, photoRow, !!e.note);
                        if (e.note) {
                            pc.value = e.note;
                            if (img) style(pc, { font: { size: 10, bold: true }, border: BOX, alignment: { vertical: 'bottom', wrapText: true } });
                            else style(pc, { font: { size: 14, bold: true }, border: BOX, alignment: { vertical: 'middle', wrapText: true } });
                        }
                    }
                });
            }
            r += 3 + rows * 2;
            if (block === 0) {
                ws.getRow(r).height = GAP_ROW_HEIGHT;
                r += 1;
            }
        }
    }

    function buildWorkbook(ExcelJS, people, startY, startM, images) {
        const wb = new ExcelJS.Workbook();
        wb.creator = '星鴻工具箱';
        wb.created = new Date();
        const used = new Set();
        people.forEach((p) => {
            const ws = wb.addWorksheet(sheetName(p.userName || p.username, used), {
                views: [{ showGridLines: true, zoomScale: 100 }]
            });
            buildSheet(wb, ws, p, startY, startM, images);
        });
        return wb;
    }

    function fileName(startY, startM, suffix) {
        return '財補計畫照片上傳' + rocYm(startY, startM) + '開始_' + String(suffix || '').replace(/[\\/:*?"<>|]/g, '') + '.xlsx';
    }

    const api = { buildWorkbook, monthWeeks, rangeOf, addMonths, rocMonth, rocYm, fileName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.SubsidyCheckinXlsx = api;
})(typeof window !== 'undefined' ? window : globalThis);
