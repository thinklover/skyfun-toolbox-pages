/**
 * 591 自動上架（工具箱）— 表單對齊 591上架RPA/public
 */
(function () {
  const API = (window.SKYFUN_591_API || 'https://skyfun-591-listing.dahwork123.workers.dev').replace(/\/$/, '');
  const form = document.getElementById('sf591-listing-form');
  if (!form) return;

  const el = (id) => document.getElementById(id);
  const status = (msg) => {
    const s = el('sf591-status');
    if (s) s.textContent = msg;
  };

  let cachedBroker = null;

  const REGIONS = [
    '台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市', '台南市', '臺南市', '高雄市',
    '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
    '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
  ];

  function normalizeAddr(text) {
    return String(text || '').replace(/\s+/g, '').replace(/臺/g, '台').replace(/－/g, '-').trim();
  }

  function parseTaiwanAddress(full) {
    const raw = String(full || '').trim();
    const s = normalizeAddr(raw);
    const out = {
      region: '', section: '', street: '', lane: '', alley: '', number: '', floor: '', totalFloors: '', raw,
    };
    if (!s) return out;
    let rest = s;
    for (const r of REGIONS) {
      const n = normalizeAddr(r);
      if (rest.startsWith(n)) {
        out.region = n;
        rest = rest.slice(n.length);
        break;
      }
    }
    const sec = rest.match(/^(.+?[區市鎮鄉])/);
    if (sec) {
      out.section = sec[1];
      rest = rest.slice(sec[1].length);
    }
    let floorPart = '';
    const floorMatch = rest.match(/(?:(\d+)\s*[FfＦｆ]|(\d+)\s*樓(?:之\d+)?|([Bb]?\d+)\s*[FfＦｆ]|地下\s*(\d+)\s*樓?)$/);
    if (floorMatch) {
      floorPart = floorMatch[0];
      out.floor = floorMatch[1] || floorMatch[2] || floorMatch[4] || floorMatch[3] || '';
      if (/^B/i.test(String(floorMatch[3] || '')) || floorMatch[4]) {
        out.floor = floorMatch[4] ? `-${floorMatch[4]}` : String(floorMatch[3]).replace(/^B/i, '-');
      }
      rest = rest.slice(0, rest.length - floorPart.length);
    }
    const slashFloor = s.match(/(\d+)\s*[FfＦｆ／/]\s*(\d+)\s*[FfＦｆ]?/);
    if (slashFloor) {
      out.floor = slashFloor[1];
      out.totalFloors = slashFloor[2];
      rest = rest.replace(slashFloor[0], '');
    }
    const lane = rest.match(/(\d+)\s*巷/);
    if (lane) out.lane = lane[1];
    const alley = rest.match(/(\d+)\s*弄/);
    if (alley) out.alley = alley[1];
    const numExact = rest.match(/(\d+(?:[-－之]\d+)*)\s*號/);
    if (numExact) {
      out.number = numExact[1].replace(/－/g, '-').replace(/之/g, '-');
    } else if (/路|街|段/.test(rest)) {
      const afterRoad = rest.match(/(?:路|街|道|大道)(?:[一二三四五六七八九十\d]+段)?(.+)$/);
      if (afterRoad) {
        const m = afterRoad[1].match(/(\d+(?:[-－之]\d+)*)/);
        if (m) out.number = m[1].replace(/之/g, '-');
      }
    }
    let street = rest;
    street = street.replace(/\d+\s*巷.*/, '');
    street = street.replace(/\d+\s*弄.*/, '');
    street = street.replace(/\d+(?:[-－之]\d+)*\s*號.*/, '');
    street = street.replace(/\d+(?:[-－之]\d+)*$/, '');
    out.street = street.trim();
    if (!out.floor && floorPart) {
      const m = floorPart.match(/(\d+)/);
      if (m) out.floor = m[1];
    }
    return out;
  }

  function applyParsedAddress(parsed) {
    const set = (name, val) => {
      const node = form.elements.namedItem(name);
      if (!node) return;
      node.value = val == null ? '' : String(val);
    };
    const prevRegion = form.elements.namedItem('region')?.value || '';
    set('region', parsed.region);
    set('section', parsed.section);
    set('street', parsed.street);
    set('lane', parsed.lane || '');
    set('alley', parsed.alley || '');
    set('number', parsed.number);
    set('floor', parsed.floor || '');
    if (parsed.totalFloors) set('totalFloors', parsed.totalFloors);
    const hint = el('sf591-addr-hint');
    if (hint) {
      if (!parsed.region || !parsed.section || !parsed.street || !parsed.number) {
        hint.textContent = '拆解不完整，請檢查下方欄位並手動補齊';
        hint.className = 'text-xs text-amber-700';
      } else {
        hint.textContent = `已拆解：${parsed.region}${parsed.section}${parsed.street}${parsed.lane ? parsed.lane + '巷' : ''}${parsed.alley ? parsed.alley + '弄' : ''}${parsed.number}號${parsed.floor ? parsed.floor + '樓' : ''}`;
        hint.className = 'text-xs text-emerald-700';
      }
    }
    if (parsed.region && parsed.region !== prevRegion) scheduleBrokerLookup();
  }

  function parseFullAddress() {
    const full = form.elements.namedItem('fullAddress')?.value?.trim() || '';
    if (!full) return;
    applyParsedAddress(parseTaiwanAddress(full));
  }

  function syncBillingModeUi() {
    const mode = form.elements.namedItem('billingMode')?.value || 'package';
    const pkg = el('sf591-package-wrap');
    const single = el('sf591-single-wrap');
    if (pkg) pkg.classList.toggle('hidden', mode !== 'package');
    if (single) single.classList.toggle('hidden', mode !== 'single');
  }

  function setLicenseUi(license, ok, msg) {
    const lic = form.elements.namedItem('salesLicense');
    if (lic) lic.value = license || '';
    const st = el('sf591-license-status');
    if (st) {
      st.textContent = msg || (ok && license ? `已帶入 ${license}` : '無證號不可上架');
      st.className = 'text-xs ' + (ok && license ? 'text-emerald-700' : 'text-rose-700');
    }
  }

  function formatBrokerLine(broker) {
    if (!broker) return '';
    const name = String(broker.name || '')
      .replace(/[：:]/g, '')
      .trim();
    const cert = String(broker.certNo || '').replace(/\s+/g, '').trim();
    if (name && cert && !/法人|名稱|住址|通訊/.test(name)) {
      return `不動產經紀人${name}：${cert}`;
    }
    const raw = String(broker.rawLine || '').trim();
    if (/不動產經紀人[\u4e00-\u9fff]{2,8}：/.test(raw) && !/法人名稱|通訊住址/.test(raw)) return raw;
    return '';
  }

  function setBrokerUi(broker) {
    cachedBroker = broker || null;
    const line = form.elements.namedItem('brokerLine');
    const json = form.elements.namedItem('brokerJson');
    const formatted = formatBrokerLine(broker);
    if (broker && formatted) {
      broker.rawLine = formatted;
      cachedBroker = broker;
    }
    if (json) json.value = broker && formatted ? JSON.stringify(broker) : '';
    if (line) line.value = formatted;
  }

  let licenseTimer = null;
  let brokerTimer = null;

  async function autoLookupLicense() {
    const name = form.elements.namedItem('posterName')?.value?.trim() || '';
    if (name.length < 2) return;
    try {
      status('自動查詢人事證號…');
      const data = await api('/api/license/lookup', { name });
      setLicenseUi(data.license, !!data.canPost, data.error);
      status(data.canPost ? `證號已自動帶入：${data.license}` : data.error || '無證號不可上架');
    } catch (e) {
      setLicenseUi('', false, e.message);
      status('自動查證號失敗：' + (e.message || e));
    }
  }

  async function autoLookupBroker() {
    const city = form.elements.namedItem('region')?.value?.trim() || '';
    if (city.length < 2) return;
    try {
      status('自動抓取地區經紀人…');
      const data = await api('/api/broker/lookup', { city });
      if (!data.ok) throw new Error(data.error || '找不到經紀人');
      setBrokerUi(data.broker);
      status('經紀人已自動帶入：' + formatBrokerLine(data.broker));
    } catch (e) {
      setBrokerUi(null);
      status('自動抓經紀人失敗：' + (e.message || e));
    }
  }

  function scheduleLicenseLookup() {
    clearTimeout(licenseTimer);
    licenseTimer = setTimeout(() => autoLookupLicense(), 600);
  }

  function scheduleBrokerLookup() {
    clearTimeout(brokerTimer);
    brokerTimer = setTimeout(() => autoLookupBroker(), 600);
  }

  function depositAmount(fd) {
    const rent = Number(fd.get('rent') || 0);
    const type = fd.get('depositType') || '';
    const custom = Number(fd.get('deposit') || 0);
    if (type === 'one') return rent;
    if (type === 'two') return rent * 2;
    return custom || 0;
  }

  function formToListing() {
    const fd = new FormData(form);
    const amenities = [...form.querySelectorAll('#sf591-amenity-checks input:checked')].map((n) => n.value);
    const petsRaw = fd.get('pets');
    let pets = null;
    if (petsRaw === 'false') pets = false;
    else if (petsRaw === 'true') pets = true;
    else if (petsRaw === 'cat' || petsRaw === 'dog') pets = petsRaw;

    let broker = cachedBroker;
    const brokerRaw = fd.get('brokerJson');
    if (brokerRaw) {
      try {
        broker = JSON.parse(brokerRaw);
      } catch {
        /* keep */
      }
    }

    return {
      kind: fd.get('kind'),
      buildingType: fd.get('buildingType') || 'elevator',
      title: fd.get('title') || '',
      aiBody: fd.get('aiBody') || '',
      posterName: fd.get('posterName') || '',
      salesLicense: fd.get('salesLicense') || '',
      broker,
      address: {
        full: fd.get('fullAddress') || '',
        region: fd.get('region') || '',
        section: fd.get('section') || '',
        street: fd.get('street') || '',
        lane: fd.get('lane') || '',
        alley: fd.get('alley') || '',
        number: fd.get('number') || '',
        floor: fd.get('floor') || '',
        totalFloors: fd.get('totalFloors') || '',
        community: fd.get('community') || '',
      },
      hideAddressNumber: fd.get('hideAddressNumber') === '1',
      layout: {
        bedrooms: fd.get('bedrooms') === '' ? null : Number(fd.get('bedrooms')),
        livingRooms: fd.get('livingRooms') === '' ? null : Number(fd.get('livingRooms')),
        bathrooms: fd.get('bathrooms') === '' ? null : Number(fd.get('bathrooms')),
        balconies: fd.get('balconies') === '' ? null : Number(fd.get('balconies')),
        areaPing: fd.get('areaPing') === '' ? null : Number(fd.get('areaPing')),
        houseAge: fd.get('houseAge') === '' ? null : Number(fd.get('houseAge')),
        direction: fd.get('direction') || '',
        decoration: fd.get('decoration') || '',
      },
      rent: {
        rent: fd.get('rent') === '' ? null : Number(fd.get('rent')),
        managementFee: fd.get('managementFee') === '' ? null : Number(fd.get('managementFee')),
        depositType: fd.get('depositType') || '',
        deposit: depositAmount(fd),
        includes: fd.get('rentIncludes') ? [fd.get('rentIncludes')] : [],
        waterFee: fd.get('waterFee') || '',
        electricFee: fd.get('electricFee') || '',
        rentSubsidy: fd.get('rentSubsidy') === '1',
        otherFees: fd.get('otherFees') || '',
        minLease: fd.get('minLease') || '',
        moveIn: fd.get('moveIn') || '',
      },
      ownership: fd.get('ownership') || '',
      amenities,
      parking: {
        car: {
          has: fd.get('carParking') === '1',
          type: fd.get('carType') || '',
          fee: fd.get('carFee') === '' ? null : Number(fd.get('carFee') || 0),
        },
        motorcycle: {
          has: fd.get('motoParking') === '1',
          fee: fd.get('motoFee') === '' ? null : Number(fd.get('motoFee') || 0),
        },
      },
      rules: {
        cooking: fd.get('cooking') === '' ? null : fd.get('cooking') === '1',
        pets,
        worship: fd.get('worship') === '' ? null : fd.get('worship') === '1',
        household: fd.get('household') === '' ? null : fd.get('household') === '1',
        gender: fd.get('gender') || '',
        identity: fd.get('identity') || '',
      },
      serviceFee: {
        charge: fd.get('serviceFee') || '',
        type: fd.get('serviceFeeType') || '',
      },
      authorization: fd.get('authorization') || '',
      description: fd.get('description') || '',
      contact: {
        name: fd.get('contactName') || '',
        phone: fd.get('contactPhone') || '',
        role: fd.get('contactRole') || '',
      },
      billing: {
        mode: fd.get('billingMode') === 'single' ? 'single' : 'package',
        packageName: fd.get('packageName') || '住宅-黃金套餐',
        singlePlanName: fd.get('singlePlanName') || '',
      },
    };
  }

  async function api(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  function showConfirm(data) {
    const modal = el('sf591-modal');
    const frame = el('sf591-frame');
    const shot = el('sf591-shot');
    const tab = el('sf591-open-tab');
    const url = data.liveViewUrl || '';
    if (tab) {
      tab.href = url || '#';
      tab.classList.toggle('hidden', !url);
    }
    if (url && frame) {
      frame.classList.remove('hidden');
      if (shot) shot.classList.add('hidden');
      frame.src = url;
    } else if (data.screenshot && shot) {
      if (frame) {
        frame.classList.add('hidden');
        frame.removeAttribute('src');
      }
      shot.classList.remove('hidden');
      shot.src = data.screenshot;
    }
    modal?.classList.remove('hidden');
  }

  function closeConfirm() {
    el('sf591-modal')?.classList.add('hidden');
    const frame = el('sf591-frame');
    if (frame) frame.removeAttribute('src');
  }

  form.elements.namedItem('billingMode')?.addEventListener('change', syncBillingModeUi);
  syncBillingModeUi();

  el('sf591-btn-parse-addr')?.addEventListener('click', parseFullAddress);
  const fullAddr = form.elements.namedItem('fullAddress');
  fullAddr?.addEventListener('paste', () => setTimeout(parseFullAddress, 50));
  fullAddr?.addEventListener('change', parseFullAddress);
  fullAddr?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      parseFullAddress();
    }
  });

  form.elements.namedItem('posterName')?.addEventListener('change', scheduleLicenseLookup);
  form.elements.namedItem('posterName')?.addEventListener('blur', scheduleLicenseLookup);
  form.elements.namedItem('region')?.addEventListener('change', scheduleBrokerLookup);
  form.elements.namedItem('region')?.addEventListener('blur', scheduleBrokerLookup);

  el('sf591-btn-license')?.addEventListener('click', () => autoLookupLicense());
  el('sf591-btn-broker')?.addEventListener('click', () => autoLookupBroker());

  el('sf591-btn-prepare')?.addEventListener('click', async () => {
    try {
      status('準備文案（證號＋經紀＋模板）…');
      const data = await api('/api/prepare', { listing: formToListing() });
      if (data.listing?.salesLicense) setLicenseUi(data.listing.salesLicense, true);
      if (data.listing?.broker) setBrokerUi(data.listing.broker);
      if (data.listing?.title && form.elements.namedItem('title')) {
        form.elements.namedItem('title').value = data.listing.title;
      }
      if (data.listing?.aiBody && form.elements.namedItem('aiBody')) {
        form.elements.namedItem('aiBody').value = data.listing.aiBody;
      }
      if (data.listing?.description && form.elements.namedItem('description')) {
        form.elements.namedItem('description').value = data.listing.description;
      }
      const prev = el('sf591-preview');
      if (prev) {
        prev.classList.remove('hidden');
        prev.textContent = (data.listing?.title || '') + '\n\n' + (data.listing?.description || '');
      }
      status(
        '文案已準備｜營業員：' +
          (data.listing?.salesLicense || '') +
          '｜' +
          (data.listing?.broker?.rawLine || '')
      );
    } catch (e) {
      status('準備失敗：' + (e.message || e));
    }
  });

  el('sf591-modal-close')?.addEventListener('click', closeConfirm);
  el('sf591-modal')?.addEventListener('click', (e) => {
    if (e.target === el('sf591-modal')) closeConfirm();
  });

  el('sf591-btn-run')?.addEventListener('click', async () => {
    const btn = el('sf591-btn-run');
    const username = el('sf591-user')?.value?.trim() || '';
    const password = el('sf591-pass')?.value || '';
    if (!username || !password) {
      status('請填自己的 591 帳號與密碼');
      return;
    }
    if (!form.reportValidity()) {
      status('請補齊必填欄位');
      return;
    }
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '後台執行中…';
      }
      status('後台執行中：查證號／組文案／登入 591／填表，請稍候（約 1～2 分鐘）…');
      const data = await api('/api/run', {
        username,
        password,
        listing: formToListing(),
      });
      if (!data.ok) throw new Error(data.error || '執行失敗');
      if (data.listing?.salesLicense) setLicenseUi(data.listing.salesLicense, true);
      if (data.listing?.broker) setBrokerUi(data.listing.broker);
      if (data.listing?.description && form.elements.namedItem('description')) {
        form.elements.namedItem('description').value = data.listing.description;
      }
      const prev = el('sf591-preview');
      if (prev) {
        prev.classList.remove('hidden');
        prev.textContent = (data.listing?.title || '') + '\n\n' + (data.listing?.description || '');
      }
      status(
        (data.message || '已到確認前') +
          '｜營業員：' +
          (data.listing?.salesLicense || '') +
          '｜' +
          (data.listing?.broker?.rawLine || '')
      );
      showConfirm(data);
    } catch (e) {
      status('失敗：' + (e.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '開始上架（後台執行）';
      }
    }
  });
})();
