/**
 * 以官方調解 Word 套版直接填字產出（列印格式＝原檔）。
 * 依賴 JSZip（js/vendor/jszip.min.js）。
 */
(function () {
  'use strict';

  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveUrl(rel) {
    if (/^https?:\/\//i.test(rel)) return rel;
    const base = (typeof window.NOTE_PETITION_ASSET_BASE === 'string' && window.NOTE_PETITION_ASSET_BASE)
      ? window.NOTE_PETITION_ASSET_BASE.replace(/\/?$/, '/')
      : '';
    return new URL((base + rel).replace(/^\.\//, ''), document.baseURI).href;
  }

  async function loadZip(rel) {
    if (!window.JSZip) throw new Error('JSZip 未載入');
    const r = await fetch(resolveUrl(rel));
    if (!r.ok) throw new Error('無法載入套版：' + rel);
    return window.JSZip.loadAsync(await r.arrayBuffer());
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** 調解委任書：官方 租賃糾紛_調解委任書.docx */
  async function fillPoaDocx(d) {
    const zip = await loadZip('docs/mediation/租賃糾紛_調解委任書.docx');
    let xml = await zip.file('word/document.xml').async('string');
    const company = escXml(d.company || '星鴻股份有限公司');
    const agent = escXml(d.agent || '');
    const opponent = escXml(d.opponent || '');
    const matter = escXml(d.matter || '房屋租賃欠租');
    const addr = escXml(d.addr || '');
    const committee = escXml(d.committee || '');
    const y = escXml(d.y || '');
    const m = escXml(d.m || '');
    const day = escXml(d.d || '');
    const caseY = escXml(d.caseY || '');
    const caseNo = escXml(d.caseNo || '');

    if (addr) xml = xml.replace('台北市萬華區中華路一段106號三樓', addr);

    const roleAt = xml.indexOf('>受任人</w:t>');
    if (roleAt >= 0 && agent) {
      const head = xml.slice(0, roleAt);
      let tail = xml.slice(roleAt);
      tail = tail.replace('<w:t xml:space="preserve">　</w:t>', '<w:t>' + agent + '</w:t>');
      xml = head + tail;
    }

    xml = xml.replace(
      '茲因與                 間                     調解事件，',
      '茲因與　' + opponent + '　間　' + matter + '　調解事件，'
    );
    xml = xml.replace(
      '委任                       為代理人，有代為一切調解行為之權，',
      '委任　' + agent + '　為代理人，有代為一切調解行為之權，'
    );
    if (committee) {
      xml = xml.replace('        縣〈市〉         鄉〈鎮市區〉調解委員會', '        ' + committee);
    }
    xml = xml.replace(
      '            委任人：                          〈簽名或蓋章〉',
      '            委任人：' + company + '　　〈簽名或蓋章〉'
    );
    xml = xml.replace(
      '            受任人：                          〈簽名或蓋章〉',
      '            受任人：' + agent + '　　〈簽名或蓋章〉'
    );
    xml = xml.replace(
      '中華民國                年              月              日',
      '中華民國　　' + y + '　　年　　' + m + '　　月　　' + day + '　　日'
    );
    if (caseY) {
      xml = xml.replace(
        '<w:t xml:space="preserve">年    </w:t>',
        '<w:t xml:space="preserve">' + caseY + '年    </w:t>'
      );
    }
    if (caseNo) {
      xml = xml.replace(
        '<w:t xml:space="preserve">          號</w:t>',
        '<w:t xml:space="preserve">  ' + caseNo + '  號</w:t>'
      );
    }

    zip.file('word/document.xml', xml);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), '調解委任書_' + (d.agent || '套版') + '.docx');
  }

  /** 調解聲請書：官方 租賃糾紛_調解聲請書.docx */
  async function fillPetitionDocx(d) {
    const zip = await loadZip('docs/mediation/租賃糾紛_調解聲請書.docx');
    let xml = await zip.file('word/document.xml').async('string');
    const company = escXml(d.company || '星鴻股份有限公司');
    const rep = escXml(d.rep || '吳宗霖');
    const agent = escXml(d.agent || '');
    const addr = escXml(d.addr || '');
    const phone = escXml(d.phone || '');
    const opponent = escXml(d.opponent || '');
    const opponentAddr = escXml(d.opponentAddr || '');
    const opponentPhone = escXml(d.opponentPhone || '');
    const matter = escXml(d.matter || '租賃事件');
    const summary = escXml(d.summary || '');
    const evidence = escXml(d.evidence || '');
    const city = escXml(d.city || '');
    const town = escXml(d.town || '');
    const y = escXml(d.y || '');
    const m = escXml(d.m || '');
    const day = escXml(d.d || '');

    xml = xml.replace(
      '<w:t xml:space="preserve">                                      </w:t>',
      '<w:t xml:space="preserve">　' + matter + '　</w:t>'
    );

    /* 姓名格：公司＋法定／委任（單行，避免破版） */
    let name = company;
    if (rep) name += '（法定代理人' + rep + '）';
    if (agent) name += '（委任代理人' + agent + '）';
    xml = xml.replace('>星鴻股份有限公司</w:t>', '>' + name + '</w:t>');

    /* 概要大格（列高 3402）：寫入住所／對造／概要／證物 */
    const hAt = xml.indexOf('w:val="3402"');
    if (hAt >= 0) {
      const window = xml.slice(hAt, hAt + 4000);
      const pPr = window.indexOf('</w:pPr>');
      if (pPr >= 0) {
        const abs = hAt + pPr + 8;
        const lines = [];
        if (addr) lines.push('聲請人住所：' + addr + (phone ? '　連絡電話：' + phone : ''));
        if (opponent) {
          lines.push('對造人：' + opponent
            + (opponentAddr ? '　住所：' + opponentAddr : '')
            + (opponentPhone ? '　電話：' + opponentPhone : ''));
        }
        if (summary) lines.push(summary);
        if (evidence) lines.push('證物名稱及件數：' + evidence);
        if (d.opponent2) {
          lines.push('對造人二：' + escXml(d.opponent2)
            + (d.opponent2Addr ? '　住所：' + escXml(d.opponent2Addr) : ''));
        }
        const inject = lines.map((line, i) => {
          return (i ? '<w:br/>' : '')
            + '<w:r><w:rPr><w:rFonts w:ascii="標楷體" w:eastAsia="標楷體" w:hAnsi="標楷體" w:hint="eastAsia"/><w:sz w:val="22"/></w:rPr>'
            + '<w:t xml:space="preserve">' + line + '</w:t></w:r>';
        }).join('');
        xml = xml.slice(0, abs) + inject + xml.slice(abs);
      }
    }

    if (city) {
      xml = xml.replace(
        '<w:t xml:space="preserve">      ______</w:t>',
        '<w:t xml:space="preserve">      ' + city + '</w:t>'
      );
    }
    if (town) {
      xml = xml.replace('>)______</w:t>', '>' + town + '</w:t>');
    }

    if (y) {
      xml = xml.replace(
        /中華民國<\/w:t>([\s\S]{0,400}?)<w:t xml:space="preserve">\s*<\/w:t>([\s\S]{0,200}?)<w:t>年<\/w:t>/,
        '中華民國</w:t>$1<w:t xml:space="preserve">　' + y + '　</w:t>$2<w:t>年</w:t>'
      );
    }
    if (m) {
      xml = xml.replace(
        /<w:t>年<\/w:t>([\s\S]{0,300}?)<w:t xml:space="preserve">\s*<\/w:t>([\s\S]{0,200}?)<w:t>月<\/w:t>/,
        '<w:t>年</w:t>$1<w:t xml:space="preserve">　' + m + '　</w:t>$2<w:t>月</w:t>'
      );
    }
    if (day) {
      xml = xml.replace(
        /<w:t>月<\/w:t>([\s\S]{0,300}?)<w:t xml:space="preserve">\s*<\/w:t>([\s\S]{0,200}?)<w:t>日<\/w:t>/,
        '<w:t>月</w:t>$1<w:t xml:space="preserve">　' + day + '　</w:t>$2<w:t>日</w:t>'
      );
    }

    xml = xml.replace(
      /聲請人：<\/w:t>([\s\S]{0,400}?)<w:t xml:space="preserve">\s*<\/w:t>/,
      '聲請人：</w:t>$1<w:t xml:space="preserve">' + company + '　　</w:t>'
    );

    zip.file('word/document.xml', xml);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), '調解聲請書_' + (d.opponent || '套版') + '.docx');
  }

  window.mediationDocxFill = { fillPoaDocx, fillPetitionDocx, resolveUrl };
})();
