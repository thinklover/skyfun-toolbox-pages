/**
 * 業務獎金辦法清單（精簡版＋知悉 id）
 * id 寫進 toolbox_biz_bonus_ack，上線後不要改；新增辦法請加新 id
 */
window.SKYFUN_BIZ_BONUS = {
  title: '業務獎金辦法',
  lead: '點「預覽浮水印檔」看辦法原文、看各營業處完成率；再點營業處可看誰還沒勾。營業處業務請打勾「已閱畢知悉」。',
  docs: [
    {
      id: 'bb-gaozhuan-1151031',
      title: '高專業務獎金制度',
      version: '115/10/31 修訂',
      file: './高專業務獎金制度1151031版.pdf',
      moneyHint: '媒合費 50%／55%／30%；代管費依職級 %',
      summaryHtml: `
        <p class="bb-sum-lead">看錢重點（依政府發放補助金額計算，稅前）</p>
        <div class="bb-table-wrap"><table class="bb-table">
          <thead><tr><th>項目</th><th>金額／比例</th></tr></thead>
          <tbody>
            <tr><td>新媒合媒合費</td><td><b>50%</b>；當月達 5 件 → 每件 <b>55%</b></td></tr>
            <tr><td>再媒合／續約媒合費</td><td><b>30%</b></td></tr>
            <tr><td>跨區（已媒合派簽）</td><td>派案方媒合費 <b>50%</b></td></tr>
            <tr><td>跨區（僅物件）</td><td>開發 <b>30%</b>＋出租 <b>20%</b></td></tr>
            <tr><td>主任代管費</td><td>基本 <b>0～15%</b>（範圍 0～15%）</td></tr>
            <tr><td>副理代管費</td><td>基本 <b>15%</b>（範圍 15～25%）</td></tr>
            <tr><td>經理代管費</td><td>基本 <b>20%</b>（範圍 20～40%）</td></tr>
            <tr><td>協理代管費</td><td>基本 <b>20%</b>（範圍 20～45%）</td></tr>
            <tr><td>領先續約率 ≥80%</td><td>代管費 <b>+5%</b></td></tr>
            <tr><td>總包租率 ≥55%</td><td>代管費 <b>+5%</b></td></tr>
            <tr><td>組織門檻（過考核副理）</td><td>4 名 <b>+5%</b>／8 名 <b>+10%</b>／12 名 <b>+15%</b></td></tr>
            <tr><td>季考核（115/11/5 薪資起）</td><td>達 18P → 代管費 <b>100%</b>；未達 → <b>80%</b></td></tr>
          </tbody>
        </table></div>
        <ul class="bb-sum-list">
          <li>租管人員證書登錄公司後，<b>次月起即可領代管費</b>（不受 10 件限制）。</li>
          <li>解約追回：依當初媒合費比例共同負擔（例：媒合費 16,000、領 8,000，半年解約追回 8,000 → 業務負擔 4,000）。</li>
          <li>所得稅代扣 10%、二代健保 2.11%。</li>
        </ul>`
    },
    {
      id: 'bb-subsidy-1151001',
      title: '星財補獎金辦法',
      version: '115/10/01 版',
      file: './1151001%20公告%20星財補獎金辦法.pdf',
      moneyHint: '第2～7月各 1.5 萬元（達件數）',
      summaryHtml: `
        <p class="bb-sum-lead">看錢重點（純新媒合件數；不含一般宅／電服／爬蟲）</p>
        <div class="bb-table-wrap"><table class="bb-table">
          <thead><tr><th>業績月</th><th>當月件數</th><th>財補獎金</th></tr></thead>
          <tbody>
            <tr><td>第 1 個月</td><td>0 件</td><td><b>0 萬元</b>（當月 3 件視同晉升第 2 月）</td></tr>
            <tr><td>第 2～5 個月</td><td>各 3 件</td><td>各 <b>1.5 萬元</b></td></tr>
            <tr><td>第 6～7 個月</td><td>各 4 件</td><td>各 <b>1.5 萬元</b></td></tr>
          </tbody>
        </table></div>
        <ul class="bb-sum-list">
          <li>未達標經總經理同意，次月補差額件數才得領次月補助（<b>獎金不另補發</b>）。</li>
          <li>須結訓考＋信任租＋報名表；一週內合約考 80 分；每日簽到討論行程。</li>
        </ul>`
    },
    {
      id: 'bb-gaodian-1141222',
      title: '高專點獎金辦法',
      version: '114/12/22｜適用 115/01/01～116/06/30',
      file: './1141222%20公告%20高專點獎金辦法.pdf',
      moneyHint: '1 點＝600 元；另有媒合費％',
      summaryHtml: `
        <p class="bb-sum-lead">看錢重點：<b>1 點＝600 元</b></p>
        <div class="bb-table-wrap"><table class="bb-table">
          <thead><tr><th>類型</th><th>條件摘要</th><th>錢／點</th></tr></thead>
          <tbody>
            <tr><td>直接媒合－代管</td><td>派案後 21 日內繳件無誤</td><td><b>3 點</b>（＝1,800 元）</td></tr>
            <tr><td>直接媒合－包租</td><td>同上</td><td><b>5 點</b>（＝3,000 元）</td></tr>
            <tr><td>間接媒合－代管</td><td>1 個月內完成</td><td>媒合費 <b>30%</b>＋代管費（處業績算 0.5 件）</td></tr>
            <tr><td>間接媒合－包租</td><td>1 個月內完成</td><td>媒合費 <b>40%</b>＋代管費（處業績算 0.5 件）</td></tr>
            <tr><td>修繕協助</td><td>無租管區協助 1 萬修繕補助</td><td><b>1 點</b>（＝600 元）</td></tr>
            <tr><td>續約（代管／包租）</td><td>21 日內</td><td><b>3 點</b></td></tr>
            <tr><td>代管轉包租</td><td>21 日內</td><td><b>5 點</b></td></tr>
            <tr><td>再媒合－代管</td><td>1 個月內</td><td>媒合費 <b>30%</b></td></tr>
            <tr><td>再媒合－轉包租</td><td>1 個月內</td><td>媒合費 <b>40%</b></td></tr>
            <tr><td>一般宅（電銷）</td><td>1 個月內媒合</td><td>房客服務費合計 <b>50%</b>；公司管理費×<b>20%</b> 代管獎金</td></tr>
          </tbody>
        </table></div>
        <ul class="bb-sum-list">
          <li>一般宅公司管理費：≤5 間＝總租金×15%；≥6 間＝總租金×10%。</li>
          <li>逾期未完成則該項無點／無費。</li>
        </ul>`
    },
    {
      id: 'bb-jili-911-1150824',
      title: '第 9～11 業績月高專業務激勵方案',
      version: '115/08/24 公告｜第 9～11 業績月',
      file: './1150824%20公告%20第9至第11業績月高專業務激勵方案.pdf',
      moneyHint: '續轉包：階梯 1,000／1,500／2,000 元',
      summaryHtml: `
        <p class="bb-sum-lead">標的：單月完成「續轉包」件數（分段累計，非整批同一單價）</p>
        <div class="bb-table-wrap"><table class="bb-table">
          <thead><tr><th>件數區間</th><th>每件</th><th>累計對照（例）</th></tr></thead>
          <tbody>
            <tr><td>第 1～2 件</td><td><b>1,000 元</b></td><td>2 件＝2,000</td></tr>
            <tr><td>第 3～4 件</td><td><b>1,500 元</b></td><td>4 件＝5,000</td></tr>
            <tr><td>第 5 件起</td><td><b>2,000 元</b></td><td>6 件＝9,000；10 件＝17,000</td></tr>
          </tbody>
        </table></div>
        <ul class="bb-sum-list">
          <li>例：6 件＝(2×1,000)＋(2×1,500)＋(2×2,000)＝<b>9,000 元</b>。</li>
        </ul>`
    },
    {
      id: 'bb-family-1151031',
      title: '婚育家庭獎金辦法（展延）',
      version: '展延至第 8～12 業績月（115）',
      file: './婚育家庭獎金辦法展延簽呈1151031.pdf',
      moneyHint: '處別競賽：冠 8,000／亞 5,000／季 3,000',
      summaryHtml: `
        <p class="bb-sum-lead">以營業處競賽；單月達標才發獎</p>
        <div class="bb-table-wrap"><table class="bb-table">
          <thead><tr><th>名次</th><th>獎金</th><th>門檻</th></tr></thead>
          <tbody>
            <tr><td>第 1 名</td><td><b>8,000 元</b></td><td rowspan="3">該處單月婚育家庭新媒合＋再媒合 ≥ <b>5 件</b></td></tr>
            <tr><td>第 2 名</td><td><b>5,000 元</b></td></tr>
            <tr><td>第 3 名</td><td><b>3,000 元</b></td></tr>
          </tbody>
        </table></div>
        <ul class="bb-sum-list">
          <li>新婚：114/10/01 後結婚且未滿 2 年；育兒：子女 114/10/01 後出生（含收養）或申請時懷孕。</li>
          <li>獎金由營業處統籌，優先用於處內聚餐等。</li>
        </ul>`
    }
  ]
};
