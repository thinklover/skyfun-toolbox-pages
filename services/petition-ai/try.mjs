// 開發用：用假案例實際呼叫 AI，看整理結果、耗時與 token 用量（不經登入檢查、不記次數）
// 用法：node try.mjs [案例編號]，需先設定 CURSOR_API_KEY；可用 CURSOR_MODEL 換模型
import { askCursor, buildPrompt, parseReply, cleanFields } from './server.mjs';

const CASES = [
  {
    name: '口述：公證費漏登',
    text: '測試區假名路100號那間 房東王小明說公證費一直沒收到 我去查才發現當初業績表忘記登 所以財務那邊沒辦法請款 房東很不爽一直打來 公證費是3000 租約是114年3月1日到116年2月28日 想請公司專案補發 不然房東說要解約 附件有收據跟存摺',
    fields: {}
  },
  {
    name: '口述：加班費補發',
    text: '我們組上禮拜六日去測試區幫忙點交 兩天各8小時 打卡系統那兩天沒開放 所以沒有出勤紀錄 加班費就沒算到 想申請補登出勤跟補發加班費 人員有我跟測試員乙',
    fields: {}
  },
  {
    name: '潤飾：已填欄位',
    text: '',
    fields: {
      category: '賠償案件',
      title: '房客搬走冷氣壞掉要賠',
      summary: '假名街5號3樓 房客測試員丙 退租的時候冷氣不會動',
      description: '房東說之前好好的 是房客弄壞的 房客說本來就壞了 我們點交照片沒拍到冷氣',
      proposal: '公司先賠房東一半 5000元'
    }
  }
];

const pick = process.argv[2] ? [CASES[Number(process.argv[2]) - 1]] : CASES;
for (const c of pick) {
  const fields = cleanFields(c.fields);
  const mode = c.text ? 'compose' : 'polish';
  const t0 = Date.now();
  try {
    const reply = await askCursor(buildPrompt(mode, c.text, fields));
    const out = parseReply(reply.text);
    console.log('\n==== ' + c.name + '（' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）====');
    console.log('usage', JSON.stringify(reply.usage));
    for (const [k, v] of Object.entries(out.fields)) if (v) console.log('【' + k + '】\n' + v);
    console.log('【missing】', out.missing.join('、') || '（無）');
  } catch (e) {
    console.log('\n==== ' + c.name + ' 失敗：' + (e?.message || e));
  }
}
