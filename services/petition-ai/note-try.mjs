// 本機測試業務備註整理（不經登入檢查、不記次）：node note-try.mjs；需要環境變數 CURSOR_API_KEY
import { writeFileSync } from 'node:fs';
import { askCursor, buildNotePrompt, parseNoteReply } from './server.mjs';

const samples = [
  '到期不續約，出租人的家人是社宅業務，訴說要轉給家人處理，因新租約於10/1號起租，要求解除物件編號。',
  '房東說他兒子要搬回來住所以不租了 我們有打給房東三次問能不能續租 還有提供換租客的方案 但房東還是堅持 租客也已經找好新房子 9/30搬走 鑰匙已經收回',
  '房東要賣房子'
];
let out = '';
for (const text of samples) {
  const t0 = Date.now();
  const reply = await askCursor(buildNotePrompt(text));
  const r = parseNoteReply(reply.text);
  out += `---- 原文：${text}\n${r.text}\n待補：${r.todo.join(' | ')}\n（${Date.now() - t0} ms）\n\n`;
}
writeFileSync(new URL('./note-try-out.txt', import.meta.url), out, 'utf8');
console.log('done');
