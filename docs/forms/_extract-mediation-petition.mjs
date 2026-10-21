import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const src = path.join(
  'C:/Users/USER/Desktop/社宅包租代管/skyfun-toolbox-pages/docs/mediation',
  '租賃糾紛_調解聲請書.docx'
);
const tmp = path.join(os.tmpdir(), 'mf-petition-docx');
const zip = path.join(os.tmpdir(), 'mf-petition.zip');
fs.copyFileSync(src, zip);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`);
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
const text = xml
  .replace(/<w:tab[^/]*\/>/g, '\t')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n');
const out = path.join(
  'C:/Users/USER/Desktop/社宅包租代管/skyfun-toolbox-pages/docs/forms',
  '_mediation-petition-extract.txt'
);
fs.writeFileSync(out, text);
console.log(text);
console.log('--- wrote', out, 'len', text.length);
