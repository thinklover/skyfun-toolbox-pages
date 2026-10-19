/**
 * 強制執行｜依物件地址判斷應遞狀之地方法院（民事執行處）
 */
(function () {
  'use strict';

  /** 民事執行處遞狀地址（優先執行處／院本部；非簡易庭） */
  var COURTS = {
    '臺北': {
      name: '臺灣臺北地方法院',
      dept: '民事執行處',
      addr: '100206 臺北市中正區博愛路131號',
      phone: '(02)2314-6871',
      maps: 'https://maps.google.com/?q=臺北市中正區博愛路131號'
    },
    '士林': {
      name: '臺灣士林地方法院',
      dept: '民事執行處',
      addr: '111035 臺北市士林區士東路190號',
      phone: '(02)2831-2321',
      maps: 'https://maps.google.com/?q=臺北市士林區士東路190號'
    },
    '新北': {
      name: '臺灣新北地方法院',
      dept: '民事執行處（土城租賃院區）',
      addr: '236013 新北市土城區青雲路152號6樓',
      phone: '(02)2261-6714',
      maps: 'https://maps.google.com/?q=新北市土城區青雲路152號',
      note: '強制執行送土城「青雲路」租賃院區民事執行處，不是金城路院本部或板橋／三重簡易庭。'
    },
    '基隆': {
      name: '臺灣基隆地方法院',
      dept: '民事執行處',
      addr: '201205 基隆市東信路176號',
      phone: '(02)2465-2171',
      maps: 'https://maps.google.com/?q=基隆市東信路176號'
    },
    '桃園': {
      name: '臺灣桃園地方法院',
      dept: '民事執行處（院本部）',
      addr: '330060 桃園市桃園區正光路888號',
      phone: '(03)339-6100',
      maps: 'https://maps.google.com/?q=桃園市桃園區正光路888號',
      note: '強制執行送桃園地院民事執行處（正光路888號），不是中壢簡易庭或桃園簡易庭。'
    },
    '新竹': {
      name: '臺灣新竹地方法院',
      dept: '民事執行處',
      addr: '302050 新竹縣竹北市興隆路2段265號',
      phone: '(03)658-6123',
      maps: 'https://maps.google.com/?q=新竹縣竹北市興隆路2段265號'
    },
    '苗栗': {
      name: '臺灣苗栗地方法院',
      dept: '民事執行處',
      addr: '360012 苗栗縣苗栗市中正路1149號',
      phone: '(037)330-083',
      maps: 'https://maps.google.com/?q=苗栗縣苗栗市中正路1149號'
    },
    '臺中': {
      name: '臺灣臺中地方法院',
      dept: '民事執行處',
      addr: '403601 臺中市西區自由路1段91號',
      phone: '(04)2223-2311',
      maps: 'https://maps.google.com/?q=臺中市西區自由路1段91號'
    },
    '彰化': {
      name: '臺灣彰化地方法院',
      dept: '民事執行處',
      addr: '510201 彰化縣員林市員林大道2段1號',
      phone: '(04)834-3171',
      maps: 'https://maps.google.com/?q=彰化縣員林市員林大道2段1號'
    },
    '南投': {
      name: '臺灣南投地方法院',
      dept: '民事執行處',
      addr: '540240 南投縣南投市中興路759號',
      phone: '(049)224-2590',
      maps: 'https://maps.google.com/?q=南投縣南投市中興路759號'
    },
    '雲林': {
      name: '臺灣雲林地方法院',
      dept: '民事執行處',
      addr: '632202 雲林縣虎尾鎮明正路38號',
      phone: '(05)633-6511',
      maps: 'https://maps.google.com/?q=雲林縣虎尾鎮明正路38號'
    },
    '嘉義': {
      name: '臺灣嘉義地方法院',
      dept: '民事執行處',
      addr: '600249 嘉義市東區林森東路282號',
      phone: '(05)278-3671',
      maps: 'https://maps.google.com/?q=嘉義市東區林森東路282號'
    },
    '臺南': {
      name: '臺灣臺南地方法院',
      dept: '民事執行處',
      addr: '708202 臺南市安平區健康路3段308號',
      phone: '(06)295-6566',
      maps: 'https://maps.google.com/?q=臺南市安平區健康路3段308號'
    },
    '高雄': {
      name: '臺灣高雄地方法院',
      dept: '民事執行處（第二辦公大樓）',
      addr: '800301 高雄市新興區中正三路25號（財稅行政大樓 9–11 樓）',
      phone: '(07)222-8356',
      maps: 'https://maps.google.com/?q=高雄市新興區中正三路25號',
      note: '強制執行送新興區中正三路第二辦公大樓，不是前金區河東路院本部。'
    },
    '橋頭': {
      name: '臺灣橋頭地方法院',
      dept: '民事執行處',
      addr: '825203 高雄市橋頭區經武路911號',
      phone: '(07)611-0030',
      maps: 'https://maps.google.com/?q=高雄市橋頭區經武路911號'
    },
    '屏東': {
      name: '臺灣屏東地方法院',
      dept: '民事執行處',
      addr: '900215 屏東縣屏東市棒球路9號',
      phone: '(08)755-0611',
      maps: 'https://maps.google.com/?q=屏東縣屏東市棒球路9號'
    },
    '臺東': {
      name: '臺灣臺東地方法院',
      dept: '民事執行處',
      addr: '950206 臺東縣臺東市博愛路128號',
      phone: '(089)310-130',
      maps: 'https://maps.google.com/?q=臺東縣臺東市博愛路128號'
    },
    '花蓮': {
      name: '臺灣花蓮地方法院',
      dept: '民事執行處',
      addr: '970019 花蓮縣花蓮市府前路15號',
      phone: '(03)822-5144',
      maps: 'https://maps.google.com/?q=花蓮縣花蓮市府前路15號'
    },
    '宜蘭': {
      name: '臺灣宜蘭地方法院',
      dept: '民事執行處',
      addr: '260011 宜蘭縣宜蘭市縣政西路1號',
      phone: '(03)925-2001',
      maps: 'https://maps.google.com/?q=宜蘭縣宜蘭市縣政西路1號'
    },
    '澎湖': {
      name: '臺灣澎湖地方法院',
      dept: '民事執行處',
      addr: '880008 澎湖縣馬公市西文里西文澳310號',
      phone: '(06)921-6777',
      maps: 'https://maps.google.com/?q=澎湖縣馬公市西文澳310號'
    },
    '金門': {
      name: '福建金門地方法院',
      dept: '民事執行處',
      addr: '893014 金門縣金城鎮民權路178號',
      phone: '(082)327-361',
      maps: 'https://maps.google.com/?q=金門縣金城鎮民權路178號'
    },
    '連江': {
      name: '福建連江地方法院',
      dept: '民事執行處',
      addr: '209002 連江縣南竿鄉復興村209號',
      phone: '(0836)22477',
      maps: 'https://maps.google.com/?q=連江縣南竿鄉復興村209號'
    }
  };

  /** 需看「區」才分得清的縣市 */
  var DISTRICT_COURTS = {
    '臺北市': {
      '中正區': '臺北', '松山區': '臺北', '信義區': '臺北', '文山區': '臺北',
      '大安區': '臺北', '萬華區': '臺北', '中山區': '臺北',
      '士林區': '士林', '北投區': '士林', '大同區': '士林', '內湖區': '士林', '南港區': '士林'
    },
    '新北市': {
      '新店區': '臺北', '烏來區': '臺北', '深坑區': '臺北', '石碇區': '臺北', '坪林區': '臺北',
      '汐止區': '士林', '淡水區': '士林', '八里區': '士林', '三芝區': '士林', '石門區': '士林',
      '瑞芳區': '基隆', '貢寮區': '基隆', '雙溪區': '基隆', '平溪區': '基隆', '金山區': '基隆', '萬里區': '基隆',
      '板橋區': '新北', '三重區': '新北', '永和區': '新北', '中和區': '新北', '新莊區': '新北',
      '蘆洲區': '新北', '三峽區': '新北', '樹林區': '新北', '鶯歌區': '新北', '泰山區': '新北',
      '五股區': '新北', '土城區': '新北', '林口區': '新北'
    },
    '高雄市': {
      '鹽埕區': '高雄', '鼓山區': '高雄', '三民區': '高雄', '新興區': '高雄', '前金區': '高雄',
      '苓雅區': '高雄', '前鎮區': '高雄', '旗津區': '高雄', '小港區': '高雄',
      '鳳山區': '高雄', '大寮區': '高雄', '林園區': '高雄',
      '楠梓區': '橋頭', '左營區': '橋頭', '橋頭區': '橋頭', '大樹區': '橋頭', '鳥松區': '橋頭',
      '仁武區': '橋頭', '大社區': '橋頭', '岡山區': '橋頭', '燕巢區': '橋頭', '永安區': '橋頭',
      '彌陀區': '橋頭', '梓官區': '橋頭', '路竹區': '橋頭', '阿蓮區': '橋頭', '湖內區': '橋頭',
      '茄萣區': '橋頭', '田寮區': '橋頭', '旗山區': '橋頭', '美濃區': '橋頭', '內門區': '橋頭',
      '甲仙區': '橋頭', '杉林區': '橋頭', '六龜區': '橋頭', '那瑪夏區': '橋頭', '桃源區': '橋頭',
      '茂林區': '橋頭'
    }
  };

  /** 整縣／整市同一法院 */
  var CITY_COURTS = {
    '基隆市': '基隆',
    '桃園市': '桃園',
    '新竹市': '新竹',
    '新竹縣': '新竹',
    '苗栗縣': '苗栗',
    '臺中市': '臺中',
    '彰化縣': '彰化',
    '南投縣': '南投',
    '雲林縣': '雲林',
    '嘉義市': '嘉義',
    '嘉義縣': '嘉義',
    '臺南市': '臺南',
    '屏東縣': '屏東',
    '臺東縣': '臺東',
    '花蓮縣': '花蓮',
    '宜蘭縣': '宜蘭',
    '澎湖縣': '澎湖',
    '金門縣': '金門',
    '連江縣': '連江'
  };

  var CITY_OPTIONS = [
    '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
    '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市',
    '高雄市', '屏東縣', '臺東縣', '花蓮縣', '宜蘭縣', '澎湖縣', '金門縣', '連江縣'
  ];

  function norm(s) {
    return String(s || '')
      .replace(/台/g, '臺')
      .replace(/\s+/g, '')
      .trim();
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function districtsOf(city) {
    if (DISTRICT_COURTS[city]) return Object.keys(DISTRICT_COURTS[city]);
    return [];
  }

  function needsDistrict(city) {
    return !!DISTRICT_COURTS[city];
  }

  function parseAddress(raw) {
    var text = norm(raw);
    if (!text) return null;
    var city = null;
    var cityIdx = -1;
    for (var i = 0; i < CITY_OPTIONS.length; i++) {
      var c = CITY_OPTIONS[i];
      var idx = text.indexOf(c);
      if (idx >= 0 && (cityIdx < 0 || idx < cityIdx)) {
        city = c;
        cityIdx = idx;
      }
    }
    if (!city) {
      // 簡寫：臺北／新北／高雄 等
      var aliases = [
        ['臺北市', /^臺北(?!縣)/],
        ['新北市', /^新北/],
        ['桃園市', /^桃園/],
        ['臺中市', /^臺中/],
        ['臺南市', /^臺南/],
        ['高雄市', /^高雄/],
        ['基隆市', /^基隆/],
        ['新竹市', /^新竹市/],
        ['新竹縣', /^新竹縣/],
        ['嘉義市', /^嘉義市/],
        ['嘉義縣', /^嘉義縣/]
      ];
      for (var a = 0; a < aliases.length; a++) {
        if (aliases[a][1].test(text)) {
          city = aliases[a][0];
          cityIdx = 0;
          break;
        }
      }
    }
    if (!city) return { city: null, district: null, error: '請輸入含縣市的物件地址（例：新北市新店區…）' };

    var rest = text.slice(cityIdx + city.length);
    var district = null;
    var list = districtsOf(city);
    if (list.length) {
      for (var d = 0; d < list.length; d++) {
        if (rest.indexOf(list[d]) === 0 || rest.indexOf(list[d].replace(/[區鄉鎮市]$/, '')) === 0) {
          district = list[d];
          break;
        }
        if (text.indexOf(list[d]) >= 0) {
          district = list[d];
          break;
        }
      }
      // 通用 XX區／鄉／鎮／市
      if (!district) {
        var m = rest.match(/^([\u4e00-\u9fff]{1,4}[區鄉鎮市])/);
        if (m) district = m[1];
      }
    }
    return { city: city, district: district, error: null };
  }

  function resolveCourt(city, district) {
    city = norm(city);
    district = norm(district);
    if (!city) return { error: '請先選擇或輸入縣市' };

    if (DISTRICT_COURTS[city]) {
      if (!district) {
        return {
          error: city + ' 分屬不同地院，一定要看到「區」才能判斷。請補上行政區（例：新店區、汐止區）。',
          needDistrict: true,
          city: city
        };
      }
      // 補「區」後綴
      if (!/[區鄉鎮市]$/.test(district)) district = district + '區';
      var key = DISTRICT_COURTS[city][district];
      if (!key) {
        return {
          error: '找不到「' + city + district + '」對應法院，請確認區名是否正確。',
          needDistrict: true,
          city: city
        };
      }
      return { key: key, city: city, district: district };
    }

    var whole = CITY_COURTS[city];
    if (!whole) return { error: '尚不支援此縣市：' + city };
    return { key: whole, city: city, district: district || '' };
  }

  function resultHtml(resolved, sourceLabel) {
    if (resolved.error) {
      return '<div class="ef-court-result is-warn"><p>' + esc(resolved.error) + '</p></div>';
    }
    var court = COURTS[resolved.key];
    if (!court) return '<div class="ef-court-result is-warn"><p>找不到法院資料。</p></div>';
    var where = resolved.city + (resolved.district || '');
    var tip = court.note
      ? '<p class="ef-court-note">' + esc(court.note) + '</p>'
      : '';
    return '' +
      '<div class="ef-court-result is-ok">' +
        '<p class="ef-court-match">物件位於 <b>' + esc(where) + '</b>' +
          (sourceLabel ? ' <span class="muted">（' + esc(sourceLabel) + '）</span>' : '') +
        ' → 應向下列法院遞狀</p>' +
        '<p class="ef-court-name">' + esc(court.name) + '<small>' + esc(court.dept) + '</small></p>' +
        '<p class="ef-court-addr">📍 ' + esc(court.addr) + '</p>' +
        '<p class="ef-court-phone">☎ ' + esc(court.phone) + '</p>' +
        tip +
        '<div class="ef-btns" style="justify-content:flex-start;margin-top:10px">' +
          '<a class="ef-btn" href="' + esc(court.maps) + '" target="_blank" rel="noopener noreferrer">開啟地圖</a>' +
        '</div>' +
      '</div>';
  }

  function fillDistrictSelect(city) {
    var sel = document.getElementById('ef-court-district');
    if (!sel) return;
    var list = districtsOf(city);
    if (!list.length) {
      sel.innerHTML = '<option value="">（此縣市不必選區）</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">－ 請選擇行政區 －</option>' +
      list.map(function (d) {
        return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
      }).join('');
  }

  function runLookup() {
    var out = document.getElementById('ef-court-out');
    if (!out) return;
    var addr = (document.getElementById('ef-court-addr') || {}).value || '';
    var citySel = (document.getElementById('ef-court-city') || {}).value || '';
    var distSel = (document.getElementById('ef-court-district') || {}).value || '';

    var resolved;
    var label = '';
    if (String(addr).trim()) {
      var parsed = parseAddress(addr);
      if (parsed.error) {
        out.innerHTML = resultHtml(parsed);
        return;
      }
      resolved = resolveCourt(parsed.city, parsed.district);
      label = '由地址判斷';
      // sync selects
      var cityEl = document.getElementById('ef-court-city');
      if (cityEl && parsed.city) {
        cityEl.value = parsed.city;
        fillDistrictSelect(parsed.city);
        var distEl = document.getElementById('ef-court-district');
        if (distEl && parsed.district) distEl.value = parsed.district;
      }
    } else if (citySel) {
      resolved = resolveCourt(citySel, distSel);
      label = '由下拉選單';
    } else {
      out.innerHTML = resultHtml({ error: '請貼上物件地址，或用下方縣市／行政區查詢。' });
      return;
    }
    out.innerHTML = resultHtml(resolved, label);
  }

  window.enforcementCourtLookupHtml = function () {
    var cityOpts = CITY_OPTIONS.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    return '' +
      '<div class="ef-court-box" id="ef-court-box">' +
        '<p class="ef-court-label">📍 遞狀法院查詢</p>' +
        '<p class="nrp-tip" style="margin:0 0 10px">輸入<strong>租屋物件地址</strong>，自動判斷要去哪一間地方法院民事執行處。臺北／新北／高雄一定要看到「區」。</p>' +
        '<label class="nrp-field span2" style="display:grid;gap:4px;margin-bottom:8px">' +
          '<span>物件完整地址</span>' +
          '<input id="ef-court-addr" type="text" placeholder="例：新北市新店區安民街…／高雄市鳳山區…" />' +
        '</label>' +
        '<div class="nrp-grid" style="margin-bottom:8px">' +
          '<label class="nrp-field"><span>或選縣市</span>' +
            '<select id="ef-court-city"><option value="">－ 請選擇 －</option>' + cityOpts + '</select></label>' +
          '<label class="nrp-field"><span>行政區（臺北／新北／高雄必填）</span>' +
            '<select id="ef-court-district" disabled><option value="">－ 請先選縣市 －</option></select></label>' +
        '</div>' +
        '<div class="ef-btns" style="justify-content:flex-start;margin-bottom:10px">' +
          '<button type="button" class="ef-btn" id="ef-court-btn">查詢應遞狀法院</button>' +
        '</div>' +
        '<div id="ef-court-out"></div>' +
        '<details class="ef-court-tips">' +
          '<summary>容易搞錯（點開看）</summary>' +
          '<ul>' +
            '<li><b>新北市</b>分 4 個法院：新店等 5 區→臺北地院；汐止等 5 區→士林地院；瑞芳等 6 區→基隆地院；其他 13 區→新北地院。</li>' +
            '<li><b>臺北市</b>：大同、士林、北投、內湖、南港→士林地院；其他→臺北地院。</li>' +
            '<li><b>高雄市</b>：市區＋鳳山、大寮、林園→高雄地院；其他 26 區→橋頭地院。</li>' +
            '<li><b>桃園</b>：強制執行送桃園地院民事執行處（桃園區正光路888號），不是中壢或桃園簡易庭。</li>' +
          '</ul>' +
        '</details>' +
      '</div>';
  };

  window.initEnforcementCourtLookup = function () {
    var box = document.getElementById('ef-court-box');
    if (!box || box.getAttribute('data-bound') === '1') return;
    box.setAttribute('data-bound', '1');
    var city = document.getElementById('ef-court-city');
    var btn = document.getElementById('ef-court-btn');
    var addr = document.getElementById('ef-court-addr');
    if (city) {
      city.addEventListener('change', function () {
        fillDistrictSelect(city.value);
        var out = document.getElementById('ef-court-out');
        if (out) out.innerHTML = '';
      });
    }
    if (btn) btn.addEventListener('click', runLookup);
    if (addr) {
      addr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runLookup();
        }
      });
    }
  };
})();
