/**
 * 591 自動上架（工具箱）— 表單對齊 591上架RPA/public
 */
(function () {
  const API = (window.SKYFUN_591_API || 'https://skyfun-591-listing.dahwork123.workers.dev').replace(/\/$/, '');
  const CRED_KEY = 'sf591-local-cred-v1';
  const form = document.getElementById('sf591-listing-form');
  if (!form) return;

  const el = (id) => document.getElementById(id);
  const status = (msg) => {
    const s = el('sf591-status');
    if (s) s.textContent = msg;
  };

  function loadSavedCreds() {
    try {
      const raw = localStorage.getItem(CRED_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const u = el('sf591-user');
      const p = el('sf591-pass');
      if (u && data.username) u.value = String(data.username);
      if (p && data.password) p.value = String(data.password);
    } catch {
      /* ignore */
    }
  }

  function saveCreds() {
    try {
      const username = el('sf591-user')?.value?.trim() || '';
      const password = el('sf591-pass')?.value || '';
      if (!username || !password) return;
      localStorage.setItem(CRED_KEY, JSON.stringify({ username, password }));
    } catch {
      /* ignore */
    }
  }

  loadSavedCreds();
  el('sf591-user')?.addEventListener('change', saveCreds);
  el('sf591-pass')?.addEventListener('change', saveCreds);
  el('sf591-user')?.addEventListener('blur', saveCreds);
  el('sf591-pass')?.addEventListener('blur', saveCreds);

  let cachedBroker = null;
  /** @type {{ name: string, mimeType: string, base64: string, preview: string }[]} */
  let photoItems = [];
  const PHOTO_MAX = 8;
  const PHOTO_MAX_EDGE = 1280;
  const PHOTO_QUALITY = 0.72;

  function updatePhotoUi() {
    const count = el('sf591-photo-count');
    const grid = el('sf591-photo-grid');
    if (count) {
      count.textContent = photoItems.length
        ? `已選 ${photoItems.length} 張（第 1 張＝封面）`
        : '尚未選擇照片';
    }
    if (!grid) return;
    grid.innerHTML = '';
    photoItems.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'relative rounded-lg overflow-hidden border border-slate-200 bg-white';
      wrap.innerHTML = `<img src="${p.preview}" alt="" class="w-full h-24 object-cover" /><button type="button" data-i="${i}" class="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">×</button>${i === 0 ? '<span class="absolute bottom-1 left-1 bg-purple-700 text-white text-[10px] px-1 rounded">封面</span>' : ''}`;
      wrap.querySelector('button')?.addEventListener('click', () => {
        photoItems.splice(i, 1);
        updatePhotoUi();
      });
      grid.appendChild(wrap);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function compressImage(file) {
    return new Promise(async (resolve, reject) => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const jpeg = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
          const base64 = jpeg.split(',')[1] || '';
          resolve({
            name: (file.name || 'photo.jpg').replace(/\.\w+$/, '.jpg'),
            mimeType: 'image/jpeg',
            base64,
            preview: jpeg,
          });
        };
        img.onerror = reject;
        img.src = dataUrl;
      } catch (e) {
        reject(e);
      }
    });
  }

  async function addPhotoFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    status(`壓縮照片中（${files.length}）…`);
    for (const f of files) {
      if (photoItems.length >= PHOTO_MAX) break;
      try {
        photoItems.push(await compressImage(f));
      } catch (e) {
        console.warn('photo compress fail', e);
      }
    }
    updatePhotoUi();
    status(photoItems.length ? `已準備 ${photoItems.length} 張照片` : '照片讀取失敗');
  }

  const dropzone = el('sf591-dropzone');
  const photoInput = el('sf591-photo-input');
  dropzone?.addEventListener('click', () => photoInput?.click());
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-purple-500');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('border-purple-500'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-purple-500');
    addPhotoFiles(e.dataTransfer?.files);
  });
  photoInput?.addEventListener('change', () => {
    addPhotoFiles(photoInput.files);
    photoInput.value = '';
  });
  el('sf591-btn-clear-photos')?.addEventListener('click', () => {
    photoItems = [];
    updatePhotoUi();
  });

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
      photos: photoItems.map((p) => ({
        name: p.name,
        mimeType: p.mimeType,
        base64: p.base64,
      })),
    };
  }

  async function api(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.ok && !data.needManualLogin) {
      throw new Error(data.error || data.message || 'HTTP ' + res.status);
    }
    return data;
  }

  /** /api/run NDJSON 串流：可能先 login、再 confirm */
  async function apiRunStream(body, onEvent) {
    const res = await fetch(API + '/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok && !ctype.includes('ndjson')) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.message || 'HTTP ' + res.status);
    }
    // 非串流（準備失敗等）
    if (!ctype.includes('ndjson')) {
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || '執行失敗');
      if (onEvent) await onEvent(data);
      return data;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let last = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) {
        if (!line.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        last = ev;
        if (onEvent) await onEvent(ev);
        if (ev.phase === 'error') throw new Error(ev.error || '執行失敗');
      }
    }
    if (buf.trim()) {
      try {
        const ev = JSON.parse(buf);
        last = ev;
        if (onEvent) await onEvent(ev);
        if (ev.phase === 'error') throw new Error(ev.error || '執行失敗');
      } catch (e) {
        if (e.message && e.message !== '執行失敗') throw e;
      }
    }
    return last;
  }

  let lastSessionId = '';
  let lastLiveUrl = '';
  let heartbeatTimer = null;

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (!lastSessionId) return;
    // 每 45 秒輕觸 session，避免 idle 關閉（keep_alive 上限 10 分鐘）
    heartbeatTimer = setInterval(() => {
      if (!lastSessionId) return;
      api('/api/session/live', { sessionId: lastSessionId })
        .then((data) => {
          if (data?.liveViewUrl) {
            lastLiveUrl = data.liveViewUrl;
            const tab = el('sf591-open-tab');
            if (tab) tab.href = data.liveViewUrl;
          }
          if (data?.screenshot) {
            const shot = el('sf591-shot');
            if (shot) shot.src = data.screenshot;
          }
        })
        .catch(() => {});
    }, 45000);
  }

  function showConfirm(data) {
    const modal = el('sf591-modal');
    const shot = el('sf591-shot');
    const tab = el('sf591-open-tab');
    const hint = el('sf591-modal-hint');
    const title = el('sf591-modal-title');
    const sub = el('sf591-modal-sub');
    const doneBtn = el('sf591-btn-done');
    const url = data.liveViewUrl || '';
    lastSessionId = data.sessionId || lastSessionId || '';
    lastLiveUrl = url || lastLiveUrl || '';
    const isLogin = data.phase === 'login' || data.needManualLogin;

    if (title) title.textContent = isLogin ? '請登入 591' : '後台已填完—請確認刊登';
    if (sub) {
      sub.textContent = isLogin
        ? '在 591 分頁用「密碼登入」自行輸入帳密；登入成功後回到工具箱按下方 Done。'
        : '在 591 分頁核對後按「確認刊登」，再回到工具箱按下方 Done。';
    }
    if (tab) {
      tab.href = url || '#';
      tab.classList.toggle('pointer-events-none', !url);
      tab.classList.toggle('opacity-50', !url);
      tab.textContent = isLogin ? '開啟 591 登入分頁' : '開啟 591 確認畫面（新分頁）';
    }
    if (doneBtn) {
      doneBtn.disabled = !lastSessionId;
      doneBtn.textContent = isLogin ? 'Done（已登入，繼續填表）' : 'Done（已確認刊登）';
    }
    if (hint) {
      hint.textContent = url
        ? '不要用分頁右上角的內頁按鈕；請回工具箱按綠色 Done。'
        : '尚無連結。請按「重新取得連結」，或重跑開始上架。';
    }
    if (shot) {
      if (data.screenshot) {
        shot.src = data.screenshot;
        shot.classList.remove('hidden');
      } else {
        shot.removeAttribute('src');
      }
    }
    const frame = el('sf591-frame');
    if (frame) {
      frame.removeAttribute('src');
      frame.classList.add('hidden');
    }
    modal?.classList.remove('hidden');
    startHeartbeat();
  }

  async function sendToolboxDone(action) {
    const hint = el('sf591-modal-hint');
    const doneBtn = el('sf591-btn-done');
    if (!lastSessionId) {
      if (hint) hint.textContent = '沒有 session，請重新按「開始上架」。';
      return;
    }
    if (doneBtn) doneBtn.disabled = true;
    if (hint) hint.textContent = action === 'fail' ? '已送出 Fail…' : '已送出 Done，後台繼續處理中…';
    try {
      await api('/api/session/done', { sessionId: lastSessionId, action: action || 'done' });
      status(action === 'fail' ? '已按 Fail' : '已按 Done，請稍候…');
    } catch (e) {
      if (hint) hint.textContent = '送出失敗：' + (e.message || e);
      if (doneBtn) doneBtn.disabled = false;
    }
  }

  function closeConfirm() {
    stopHeartbeat();
    el('sf591-modal')?.classList.add('hidden');
    const frame = el('sf591-frame');
    if (frame) frame.removeAttribute('src');
  }

  async function reconnectLiveView() {
    const hint = el('sf591-modal-hint');
    const btn = el('sf591-btn-relive');
    if (!lastSessionId) {
      if (hint) hint.textContent = '沒有 session，請重新按「開始上架」。';
      return;
    }
    if (hint) hint.textContent = '重新取得連結中…';
    if (btn) btn.disabled = true;
    try {
      const data = await api('/api/session/live', { sessionId: lastSessionId });
      if (!data.liveViewUrl) throw new Error(data.error || '無法取得 Live View');
      lastLiveUrl = data.liveViewUrl;
      const tab = el('sf591-open-tab');
      if (tab) {
        tab.href = data.liveViewUrl;
        tab.classList.remove('pointer-events-none', 'opacity-50');
        tab.textContent = '開啟 591 確認畫面（新分頁）';
      }
      if (data.screenshot) {
        const shot = el('sf591-shot');
        if (shot) shot.src = data.screenshot;
      }
      if (hint) hint.textContent = '連結已更新，請再點綠色按鈕開啟。';
      startHeartbeat();
    } catch (e) {
      if (hint) hint.textContent = '失敗：' + (e.message || e) + '（請重跑開始上架）';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  el('sf591-btn-relive')?.addEventListener('click', () => reconnectLiveView());
  el('sf591-btn-done')?.addEventListener('click', () => sendToolboxDone('done'));

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

  /** 上架人姓名＝工具箱登入使用者本名 */
  function toolboxDisplayName() {
    try {
      const u = window.skyfunAuth?.getUser?.();
      const name = String(u?.name || '').trim();
      // 排除身分證當 username 誤填進 name 的情況
      if (name && !/^[A-Za-z][12]\d{8}$/.test(name) && name.length >= 2) return name;
    } catch {
      /* ignore */
    }
    return '';
  }

  function prefillPosterFromToolbox(force) {
    const poster = form.elements.namedItem('posterName');
    const contact = form.elements.namedItem('contactName');
    const name = toolboxDisplayName();
    if (!name || !poster) return false;
    if (!force && poster.value && poster.value.trim() !== name) return false;
    if (!poster.value || force || poster.value.trim() === name) {
      poster.value = name;
      if (contact && (!contact.value || contact.value.trim() === name)) contact.value = name;
      scheduleLicenseLookup();
      return true;
    }
    return false;
  }

  document.addEventListener('skyfun-auth-ready', () => prefillPosterFromToolbox(true));
  // 進入 591 頁時再帶一次（auth 通常已就緒）
  const pageEl = document.getElementById('page-business-591-listing');
  if (pageEl && typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => {
      if (!pageEl.classList.contains('hidden')) prefillPosterFromToolbox(true);
    });
    mo.observe(pageEl, { attributes: true, attributeFilter: ['class'] });
  }
  // auth 腳本在後面載入：短暫重試
  let tries = 0;
  const boot = setInterval(() => {
    tries += 1;
    if (prefillPosterFromToolbox(true) || tries >= 20) clearInterval(boot);
  }, 300);

  el('sf591-btn-prepare')?.addEventListener('click', async () => {
    const btn = el('sf591-btn-prepare');
    const prepSt = el('sf591-prepare-status');
    const setPrep = (msg, cls) => {
      if (prepSt) {
        prepSt.textContent = msg || '';
        prepSt.className = 'text-xs ' + (cls || 'text-slate-600');
      }
      status(msg || '');
    };
    const prevLabel = btn?.textContent || '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '產生中…';
      }
      setPrep('正在產生標題／開場（約數秒）…', 'text-amber-700');
      const data = await api('/api/prepare', { listing: formToListing() });
      if (!data?.ok) throw new Error(data?.error || '準備失敗');
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
      const src =
        data.copySource === 'workers-ai'
          ? 'Workers AI'
          : data.copySource === 'openai'
            ? 'OpenAI'
            : data.copySource === 'fallback'
              ? '規則備援'
              : data.copySource || 'AI';
      const okMsg =
        `已帶入標題／描述（${src}）` +
        (data.listing?.salesLicense ? `｜${data.listing.salesLicense}` : '') +
        (data.warning ? `｜${data.warning}` : '');
      setPrep(okMsg, 'text-emerald-700');
      form.elements.namedItem('title')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      setPrep('準備失敗：' + (e.message || e), 'text-rose-700');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || '準備文案（AI 標題＋開場＋模板）';
      }
    }
  });

  el('sf591-modal-close')?.addEventListener('click', closeConfirm);
  el('sf591-modal')?.addEventListener('click', (e) => {
    if (e.target === el('sf591-modal')) closeConfirm();
  });

  el('sf591-btn-run')?.addEventListener('click', async () => {
    const btn = el('sf591-btn-run');
    if (!form.reportValidity()) {
      status('請補齊必填欄位（標 * 者）');
      return;
    }
    if (!photoItems.length) {
      status('請至少上傳 1 張照片（建議 5 張以上）');
      el('sf591-dropzone')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '後台執行中…';
      }
      status('後台準備中…接著會開啟 591 登入分頁，請自行輸入帳密');
      const data = await apiRunStream(
        { listing: formToListing() },
        async (ev) => {
          if (ev.phase === 'status' && ev.message) status(ev.message);
          if (ev.listing?.salesLicense) setLicenseUi(ev.listing.salesLicense, true);
          if (ev.listing?.broker) setBrokerUi(ev.listing.broker);
          if (ev.listing?.description && form.elements.namedItem('description')) {
            form.elements.namedItem('description').value = ev.listing.description;
          }
          if (ev.listing?.title) {
            const prev = el('sf591-preview');
            if (prev) {
              prev.classList.remove('hidden');
              prev.textContent = (ev.listing.title || '') + '\n\n' + (ev.listing.description || '');
            }
          }
          // 開 591 分頁；Done 一定在工具箱按（不用內頁按鈕）
          if (ev.phase === 'login' && ev.liveViewUrl) {
            status(ev.message || '請在 591 分頁登入，再回工具箱按 Done');
            showConfirm({ ...ev, needManualLogin: true });
            try {
              window.open(ev.liveViewUrl, '_blank', 'noopener,noreferrer');
            } catch {
              /* 被擋則靠「開啟 591 分頁」 */
            }
          }
          if (ev.phase === 'confirm' && ev.liveViewUrl) {
            status(ev.message || '後台已填完，請確認刊登後回工具箱按 Done');
            showConfirm(ev);
            try {
              window.open(ev.liveViewUrl, '_blank', 'noopener,noreferrer');
            } catch {
              /* ignore */
            }
          }
        }
      );

      if (data?.phase === 'confirm' || data?.ok) {
        /* 已在 onEvent 處理 */
      } else if (data && !data.ok) {
        throw new Error(data.error || '執行失敗');
      }
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
