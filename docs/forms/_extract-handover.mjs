import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(here, 'lease-termination-handover.pdf');
const outDir = join(here, '_handover-extract');
mkdirSync(outDir, { recursive: true });

const base = 'file:///C:/Users/USER/Desktop/%E7%A4%BE%E5%AE%85%E5%8C%85%E7%A7%9F%E4%BB%A3%E7%AE%A1/AI%E5%82%AC%E6%94%B6%E6%A8%A1%E6%93%AC%E7%95%AB%E9%9D%A2/node_modules/';
const { PDFParse } = await import(base + 'pdf-parse/dist/pdf-parse/esm/index.js');
const pdfjs = await import(base + 'pdfjs-dist/legacy/build/pdf.mjs');

const data = readFileSync(pdfPath);
const parser = new PDFParse({ data });
const info = await parser.getInfo({ parsePageInfo: true });
const text = await parser.getText();
writeFileSync(join(outDir, 'text.txt'), text.text, 'utf8');
writeFileSync(join(outDir, 'info.json'), JSON.stringify(info, null, 2), 'utf8');
console.log('pages', info.total);
console.log('page info keys', Object.keys(info));

try {
  const shots = await parser.getScreenshot({ scale: 1.6, imageBuffer: true, imageDataUrl: false });
  for (const page of shots.pages || []) {
    const name = `page-${String(page.pageNumber).padStart(2, '0')}.png`;
    writeFileSync(join(outDir, name), page.data);
    console.log('shot', name, page.width, page.height);
  }
} catch (e) {
  console.error('screenshot failed', e);
}

const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true });
const doc = await loadingTask.promise;
const all = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.map((it) => ({
    str: it.str,
    x: Math.round(it.transform[4] * 10) / 10,
    y: Math.round(it.transform[5] * 10) / 10,
    w: Math.round((it.width || 0) * 10) / 10,
    h: Math.round((it.height || 0) * 10) / 10,
    font: it.fontName
  }));
  all.push({ page: i, width: vp.width, height: vp.height, items });
  console.log('page', i, 'size', vp.width, vp.height, 'items', items.length);
}
writeFileSync(join(outDir, 'items.json'), JSON.stringify(all, null, 2), 'utf8');
await parser.destroy();
console.log('done');
