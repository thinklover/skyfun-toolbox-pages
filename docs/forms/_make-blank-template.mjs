import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pagesRoot = join(here, '..', '..');
const { PDFDocument, rgb } = require(join(pagesRoot, 'js', 'vendor', 'pdf-lib.min.js'));

const src = join(here, 'lease-termination-handover.pdf');
const outPdf = join(here, 'termination-agreement.pdf');
const tmpCovered = join(here, '_handover-extract', 'covered.pdf');
mkdirSync(join(here, '_handover-extract'), { recursive: true });

function cover(page, x, y, w, h = 14) {
  page.drawRectangle({
    x,
    y: y - 3,
    width: w,
    height: h,
    color: rgb(1, 1, 1)
  });
}

const pdf = await PDFDocument.load(readFileSync(src));
const [p1, p2, p3] = pdf.getPages();

cover(p1, 86, 718.9, 372);
cover(p1, 86, 691.9, 372);
cover(p1, 190, 613.9, 270, 14);
cover(p1, 325, 592.9, 22, 13);
cover(p1, 370, 592.9, 16, 13);
cover(p1, 409, 592.9, 16, 13);
cover(p1, 325, 571.9, 22, 13);
cover(p1, 370, 571.9, 16, 13);
cover(p1, 409, 571.9, 16, 13);
cover(p1, 78, 550.9, 22, 13);
cover(p1, 123, 550.9, 16, 13);
cover(p1, 162, 550.9, 16, 13);
cover(p1, 350, 550.9, 110, 13);
cover(p1, 78, 529.9, 22, 13);
cover(p1, 123, 529.9, 16, 13);
cover(p1, 162, 529.9, 16, 13);

cover(p2, 114, 622.2, 400);
cover(p2, 114, 601.2, 280);
cover(p2, 114, 559.2, 430, 16);
cover(p2, 114, 538.2, 280);
cover(p2, 114, 496.2, 400);
cover(p2, 114, 475.2, 280);
cover(p2, 114, 433.2, 430, 16);
cover(p2, 114, 412.2, 280);

cover(p3, 420, 700.9, 90);

writeFileSync(tmpCovered, await pdf.save());

const base =
  'file:///C:/Users/USER/Desktop/%E7%A4%BE%E5%AE%85%E5%8C%85%E7%A7%9F%E4%BB%A3%E7%AE%A1/AI%E5%82%AC%E6%94%B6%E6%A8%A1%E6%93%AC%E7%95%AB%E9%9D%A2/node_modules/';
const { PDFParse } = await import(base + 'pdf-parse/dist/pdf-parse/esm/index.js');
const parser = new PDFParse({ data: readFileSync(tmpCovered) });
const shots = await parser.getScreenshot({ scale: 2, imageBuffer: true, imageDataUrl: false });
await parser.destroy();

const blank = await PDFDocument.create();
for (const shot of shots.pages) {
  const png = await blank.embedPng(shot.data);
  const page = blank.addPage([594.96, 841.92]);
  page.drawImage(png, { x: 0, y: 0, width: 594.96, height: 841.92 });
  writeFileSync(join(here, '_handover-extract', `blank-${String(shot.pageNumber).padStart(2, '0')}.png`), shot.data);
}
writeFileSync(outPdf, await blank.save());
console.log('blank template', outPdf, blank.getPageCount());
