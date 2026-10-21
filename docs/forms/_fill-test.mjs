import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = join(here, '..', '..');
const { PDFDocument, rgb } = require(join(root, 'js', 'vendor', 'pdf-lib.min.js'));
const fontkit = require(join(root, 'js', 'vendor', 'fontkit.umd.js'));

const ctx = { window: { LAL_FONT_PARTS: [], LAL_FONT_PART_COUNT: 0 } };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'js', 'lal-font', 'manifest.js'), 'utf8'), ctx);
for (let i = 0; i < ctx.window.LAL_FONT_PART_COUNT; i++) {
  vm.runInContext(
    readFileSync(join(root, 'js', 'lal-font', `part-${String(i).padStart(3, '0')}.js`), 'utf8'),
    ctx
  );
}
const b64 = ctx.window.LAL_FONT_PARTS.join('');
const fontBytes = Buffer.from(b64, 'base64');

function draw(page, font, text, x, y, size = 12) {
  const t = String(text || '');
  if (!t) return;
  page.drawText(t, { x, y, size, font, color: rgb(0.05, 0.08, 0.16) });
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function drawYmd(page, font, roc, yX, mX, dX, y) {
  draw(page, font, roc.y, yX, y);
  draw(page, font, pad2(roc.m), mX, y);
  draw(page, font, pad2(roc.d), dX, y);
}
function fit(page, font, text, x, y, maxW, size = 12) {
  let s = size;
  const t = String(text || '');
  if (!t) return;
  while (s > 7 && font.widthOfTextAtSize(t, s) > maxW) s -= 0.4;
  draw(page, font, t, x, y, s);
}

const pdf = await PDFDocument.load(readFileSync(join(here, 'termination-agreement.pdf')));
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(fontBytes, { subset: true });
const [p1, p2, p3, p4] = pdf.getPages();

const sign = { y: '115', m: '9', d: '1' };
const start = { y: '115', m: '9', d: '1' };
const end = { y: '116', m: '8', d: '31' };
const exit = { y: '115', m: '10', d: '31' };
const notice = { y: '115', m: '9', d: '20' };

fit(p1, font, '星鴻股份有限公司', 88, 718.9, 360);
fit(p1, font, '江荺宣', 88, 691.9, 360);
fit(p1, font, '高雄市林園區文賢南路107號(1-2樓)', 192, 613.9, 340);
drawYmd(p1, font, sign, 326.5, 372, 411, 592.9);
drawYmd(p1, font, start, 326.5, 372, 411, 571.9);
drawYmd(p1, font, end, 79.5, 125, 164.1, 550.9);
fit(p1, font, '承租人因家庭因素', 352.5, 550.9, 108);
drawYmd(p1, font, exit, 79.5, 125, 164.1, 529.9);
draw(p1, font, notice.y, 79.5, 508.9);
draw(p1, font, pad2(notice.m), 118, 508.9);
draw(p1, font, pad2(notice.d), 151, 508.9);

fit(p2, font, '星鴻股份有限公司', 115.5, 622.2, 380);
draw(p2, font, '85103034', 115.5, 580.2);
fit(p2, font, '台北市萬華區中華路一段106號', 115.5, 559.2, 400, 11);
draw(p2, font, '(02) 7755-2669', 115.5, 538.2);
fit(p2, font, '江荺宣', 115.5, 496.2, 380);
draw(p2, font, 'L223302394', 115.5, 475.2);
fit(p2, font, '高雄市林園區文賢南路107號(1-2樓)', 115.5, 433.2, 400, 11);
draw(p2, font, '0919058375', 115.5, 412.2);
drawYmd(p2, font, exit, 248, 321, 386, 362.7);

draw(p3, font, '■', 166, 718.9, 11);
draw(p3, font, '18,800', 428, 700.9);
draw(p3, font, '■', 151, 664.9, 11);
draw(p3, font, '■', 151, 502.9, 11);
drawYmd(p3, font, exit, 302, 342, 374, 358.9);
draw(p3, font, '18,770', 145, 106.9);
drawYmd(p4, font, exit, 178, 247, 312, 325.2);

const outDir = join(here, '_handover-extract');
mkdirSync(outDir, { recursive: true });
const outPdf = join(outDir, 'filled-test.pdf');
writeFileSync(outPdf, await pdf.save());

const base =
  'file:///C:/Users/USER/Desktop/%E7%A4%BE%E5%AE%85%E5%8C%85%E7%A7%9F%E4%BB%A3%E7%AE%A1/AI%E5%82%AC%E6%94%B6%E6%A8%A1%E6%93%AC%E7%95%AB%E9%9D%A2/node_modules/';
const { PDFParse } = await import(base + 'pdf-parse/dist/pdf-parse/esm/index.js');
const parser = new PDFParse({ data: readFileSync(outPdf) });
const shots = await parser.getScreenshot({ scale: 1.7, imageBuffer: true, imageDataUrl: false });
for (const page of shots.pages) {
  writeFileSync(join(outDir, `filled-${String(page.pageNumber).padStart(2, '0')}.png`), page.data);
  console.log('shot', page.pageNumber);
}
await parser.destroy();
console.log('ok', outPdf);
