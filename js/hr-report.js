/**
 * 人資部問題回報／內勤報到／內勤離職
 */
(function () {
  'use strict';

  const OFFICES = [
    '北一處', '北二處', '北三處', '北四處', '桃一處', '宜一處', '基一處',
    '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '投一處', '嘉一處', '南一處', '南二處', '高一處', '高二處',
    '租賃管理部', '行政管理部', '電服部', '客服部', '總經理室', '整租部', '商辦部', '行銷部', '財務部'
  ];

  const MAX_FILES = 5;
  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const OK_EXT = IMAGE_EXT.concat(['pdf', 'doc', 'docx', 'xls', 'xlsx']);

  const state = {
    files: {
      leave: [], ot: [],
      onboardId: [], onboardBank: [], onboardPersonnel: [],
      onboardTrust: [], onboardProbation: [],
      resign: []
    },
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function token() {
    try {
      return window.skyfunAuth?.getToken?.() || '';
    } catch (_) {
      return '';
    }
  }

  function sessionUser() {
    try {
      return window.skyfunAuth?.getUser?.() || {};
    } catch (_) {
      return {};
    }
  }

  function sbClient() {
    const c = window.SKYFUN_SUPABASE || {};
    if (!window.supabase || !c.url || !(c.anonKey || c.anon_key)) return null;
    return window.supabase.createClient(c.url, c.anonKey || c.anon_key);
  }

  async function rpc(name, args) {
    if (!window.skyfunAuth?.rpc) throw new Error('請先登入工具箱');
    return window.skyfunAuth.rpc(name, args);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fileExt(name, type) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m && OK_EXT.includes(m[1])) return m[1];
    if (/pdf/.test(type || '')) return 'pdf';
    if (/jpeg/.test(type || '')) return 'jpg';
    if (/png/.test(type || '')) return 'png';
    if (/gif/.test(type || '')) return 'gif';
    if (/webp/.test(type || '')) return 'webp';
    return '';
  }

  function isImageExt(ext) {
    return IMAGE_EXT.includes(String(ext || '').toLowerCase());
  }

  function setMsg(elId, text, kind) {
    const el = $(elId);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'hr-msg' + (kind ? ' is-' + kind : '');
  }

  function officeOptionsHtml(selected) {
    const sel = String(selected || '');
    return '<option value="">請選擇</option>' +
      OFFICES.map((o) => `<option value="${esc(o)}"${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('') +
      '<option value="其他"' + (sel === '其他' ? ' selected' : '') + '>其他</option>';
  }

  function fillOfficeSelect(selId, otherWrapId, otherInputId) {
    const el = $(selId);
    if (!el) return;
    if (!el.options.length) el.innerHTML = officeOptionsHtml('');
    const u = sessionUser();
    const team = String(u.team || '').trim();
    const name = String(u.name || u.displayName || '').trim();
    if (name) {
      const nameMap = {
        'hr-full-name': 'hr-full-name',
        'hr-onboard-full-name': 'hr-onboard-full-name',
        'hr-resign-full-name': 'hr-resign-full-name'
      };
      Object.keys(nameMap).forEach((id) => {
        const n = $(id);
        if (n && !n.value) n.value = name;
      });
    }
    if (team && !el.value) {
      if (OFFICES.includes(team)) el.value = team;
      else {
        el.value = '其他';
        const other = $(otherInputId);
        if (other) other.value = team;
      }
    }
    syncOther(selId, otherWrapId);
  }

  function syncOther(selId, wrapId) {
    const wrap = $(wrapId);
    if (!wrap) return;
    wrap.hidden = ($(selId)?.value || '') !== '其他';
  }

  function syncReportPanels() {
    const type = document.querySelector('#page-hr-report input[name="hr-issue"]:checked')?.value || '';
    document.querySelectorAll('#page-hr-report [data-hr-panel]').forEach((el) => {
      const keys = String(el.getAttribute('data-hr-panel') || '').split('|');
      el.classList.toggle('is-open', keys.includes(type));
    });
    syncOther('hr-office', 'hr-office-other-wrap');
  }

  function renderFormFiles(key) {
    const keys = key ? [key] : Object.keys(state.files);
    keys.forEach((k) => {
      const list = document.querySelector('[data-hr-file-list="' + k + '"]');
      if (!list) return;
      const arr = state.files[k] || [];
      list.innerHTML = arr.length
        ? arr.map((f, i) =>
            `<li><span>${esc(f.name)}</span><button type="button" data-hr-rm-key="${k}" data-hr-rm="${i}">移除</button></li>`
          ).join('')
        : '';
    });
  }

  async function uploadSelected(files) {
    if (!files.length) return [];
    const sb = sbClient();
    if (!sb) throw new Error('尚未設定 Supabase 連線');
    const out = [];
    for (const file of files) {
      const ext = fileExt(file.name, file.type);
      if (!ext) throw new Error('不支援的檔案：' + (file.name || ''));
      const prep = await rpc('hr_report_prepare_upload', { p_token: token(), p_ext: ext });
      if (!prep?.ok) throw new Error(prep?.error || '無法準備上傳');
      const { error } = await sb.storage.from('hr-report').upload(prep.path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (error) throw new Error(error.message || '上傳失敗');
      out.push({
        path: prep.path,
        url: prep.publicUrl,
        name: String(file.name || prep.path).slice(0, 120),
        kind: isImageExt(ext) ? 'image' : 'file'
      });
    }
    return out;
  }

  function resolveOffice(selId, otherId) {
    let office = ($(selId)?.value || '').trim();
    if (office === '其他') office = ($(otherId)?.value || '').trim() || '其他';
    return office;
  }

  function bindFileInput(inputId, key) {
    $(inputId)?.addEventListener('change', (e) => {
      const picked = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of picked) {
        if (state.files[key].length >= MAX_FILES) {
          setMsg('hr-form-msg', '最多上傳 ' + MAX_FILES + ' 個檔案', 'err');
          setMsg('hr-onboard-msg', '最多上傳 ' + MAX_FILES + ' 個檔案', 'err');
          setMsg('hr-resign-msg', '最多上傳 ' + MAX_FILES + ' 個檔案', 'err');
          break;
        }
        const ext = fileExt(f.name, f.type);
        if (!ext) continue;
        state.files[key].push(f);
      }
      renderFormFiles(key);
    });
  }

  function bindRemoveClicks(root) {
    root?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hr-rm]');
      if (!btn) return;
      const key = btn.getAttribute('data-hr-rm-key');
      const i = Number(btn.getAttribute('data-hr-rm'));
      if (!key || !state.files[key] || !Number.isFinite(i)) return;
      state.files[key].splice(i, 1);
      renderFormFiles(key);
    });
  }

  async function doSubmit(opts) {
    if (state.busy) return;
    const msgId = opts.msgId;
    setMsg(msgId, '');
    if (!token()) {
      setMsg(msgId, '請先登入工具箱再送出', 'err');
      return;
    }
    const fullName = (opts.fullName || '').trim();
    const office = (opts.office || '').trim();
    const issueType = opts.issueType;
    const payload = opts.payload || {};
    const fileGroups = opts.fileGroups || [];
    if (!fullName) { setMsg(msgId, '請填姓名全名', 'err'); return; }
    if (!office) { setMsg(msgId, '請選所屬處所', 'err'); return; }
    if (opts.validate) {
      const err = opts.validate(payload, fileGroups);
      if (err) { setMsg(msgId, err, 'err'); return; }
    }

    state.busy = true;
    const btn = opts.btn;
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    try {
      let files = [];
      for (const g of fileGroups) {
        const uploaded = await uploadSelected(g.files);
        files = files.concat(uploaded.map((f) => Object.assign({}, f, { name: (g.label ? g.label + '｜' : '') + f.name })));
      }
      const res = await rpc('hr_report_submit', {
        p_token: token(),
        p_data: { fullName, office, issueType, payload, files }
      });
      if (!res?.ok) throw new Error(res?.error || '送出失敗');
      const line = res.line || {};
      if (line.error) {
        setMsg(msgId, '已送出，但 LINE 未送出：' + line.error + '（請至人資問題回報後台查看）', 'warn');
      } else {
        setMsg(msgId, '已送出，並已通知財務部（' + (line.recipients || 0) + ' 人）', 'ok');
      }
      if (typeof opts.onSuccess === 'function') opts.onSuccess();
    } catch (err) {
      setMsg(msgId, err.message || String(err), 'err');
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '送出'; }
    }
  }

  /* ---------- 一般回報 ---------- */
  function bindReport() {
    const page = $('page-hr-report');
    if (!page || page.dataset.hrBound) return;
    page.dataset.hrBound = '1';
    fillOfficeSelect('hr-office', 'hr-office-other-wrap', 'hr-office-other');
    page.addEventListener('change', (e) => {
      if (e.target.matches('input[name="hr-issue"], #hr-office')) syncReportPanels();
    });
    bindFileInput('hr-files-leave', 'leave');
    bindFileInput('hr-files-ot', 'ot');
    bindRemoveClicks(page);
    $('hr-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const issueType = document.querySelector('#page-hr-report input[name="hr-issue"]:checked')?.value || '';
      const payload = {};
      let fileGroups = [];
      if (issueType === '延展休假申請') {
        payload.leaveKind = document.querySelector('#page-hr-report input[name="hr-leave-kind"]:checked')?.value || '';
        payload.leavePeriod = ($('hr-leave-period')?.value || '').trim();
        fileGroups = [{ label: '佐證', files: state.files.leave.slice() }];
      } else if (issueType === '加班超時申請') {
        payload.applyDate = ($('hr-ot-date')?.value || '').trim();
        fileGroups = [{ label: '簽呈', files: state.files.ot.slice() }];
      } else if (issueType === '資遣通報') {
        payload.layoffName = ($('hr-layoff-name')?.value || '').trim();
        payload.layoffDate = ($('hr-layoff-date')?.value || '').trim();
        let off = ($('hr-layoff-office')?.value || '').trim();
        if (off === '其他') off = ($('hr-layoff-office-other')?.value || '').trim() || '其他';
        payload.layoffOffice = off;
      } else if (issueType === '整租部門_調班申請') {
        payload.shiftPerson = ($('hr-shift-person')?.value || '').trim();
        payload.origDate = ($('hr-shift-orig-date')?.value || '').trim();
        payload.origTime = ($('hr-shift-orig-time')?.value || '').trim();
        payload.partner = ($('hr-shift-partner')?.value || '').trim();
        payload.newDate = ($('hr-shift-new-date')?.value || '').trim();
        payload.newTime = ($('hr-shift-new-time')?.value || '').trim();
      }
      doSubmit({
        msgId: 'hr-form-msg',
        btn: $('hr-submit'),
        fullName: $('hr-full-name')?.value,
        office: resolveOffice('hr-office', 'hr-office-other'),
        issueType,
        payload,
        fileGroups,
        validate(p, groups) {
          if (!issueType) return '請選擇出勤相關問題';
          if (issueType === '延展休假申請') {
            if (!p.leaveKind) return '請選擇延展假期類別';
            if (!p.leavePeriod) return '請填延展期間申請';
          } else if (issueType === '加班超時申請') {
            if (!p.applyDate) return '請填申請日期';
            if (!(groups[0] && groups[0].files.length)) return '請上傳主管同意簽呈';
          } else if (issueType === '資遣通報') {
            if (!p.layoffName) return '請填資遣人員姓名';
            if (!p.layoffDate) return '請填預計資遣日期';
            if (!p.layoffOffice) return '請選資遣人員所屬處所';
          } else if (issueType === '整租部門_調班申請') {
            if (!p.shiftPerson) return '請填申請人員';
            if (!p.origDate) return '請填原上班日期';
            if (!p.origTime) return '請填原上班時間';
            if (!p.partner) return '請填配合調班人員';
            if (!p.newDate) return '請填調班後上班日期';
            if (!p.newTime) return '請填調班後上班時間';
          }
          return '';
        },
        onSuccess() {
          state.files.leave = [];
          state.files.ot = [];
          renderFormFiles();
          $('hr-form')?.reset();
          fillOfficeSelect('hr-office', 'hr-office-other-wrap', 'hr-office-other');
          syncReportPanels();
        }
      });
    });
    $('hr-clear')?.addEventListener('click', () => {
      $('hr-form')?.reset();
      state.files.leave = [];
      state.files.ot = [];
      renderFormFiles();
      setMsg('hr-form-msg', '');
      fillOfficeSelect('hr-office', 'hr-office-other-wrap', 'hr-office-other');
      syncReportPanels();
    });
    const layoffOffice = $('hr-layoff-office');
    if (layoffOffice && !layoffOffice.options.length) layoffOffice.innerHTML = officeOptionsHtml('');
    page.addEventListener('change', (e) => {
      if (e.target.id === 'hr-layoff-office') syncOther('hr-layoff-office', 'hr-layoff-office-other-wrap');
    });
  }

  function selectOnboardStep(step) {
    const page = $('page-hr-onboard');
    if (!page) return;
    const key = String(step || '');
    page.querySelectorAll('.hr-sop-card').forEach((btn) => {
      const on = btn.getAttribute('data-hr-step') === key;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    page.querySelectorAll('[data-hr-step-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-hr-step-panel') !== key;
    });
    const detail = $('hr-sop-detail');
    if (detail) detail.hidden = !key;
    if (key && detail) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- 報到 ---------- */
  function bindOnboard() {
    const page = $('page-hr-onboard');
    if (!page || page.dataset.hrBound) return;
    page.dataset.hrBound = '1';
    fillOfficeSelect('hr-onboard-office', 'hr-onboard-office-other-wrap', 'hr-onboard-office-other');
    page.addEventListener('change', (e) => {
      if (e.target.id === 'hr-onboard-office') syncOther('hr-onboard-office', 'hr-onboard-office-other-wrap');
    });
    page.addEventListener('click', (e) => {
      if (e.target.closest('[data-hr-sop-close]')) {
        selectOnboardStep('');
        return;
      }
      const card = e.target.closest('.hr-sop-card[data-hr-step]');
      if (!card || !page.contains(card)) return;
      const step = card.getAttribute('data-hr-step');
      const open = card.classList.contains('is-on');
      selectOnboardStep(open ? '' : step);
    });
    page.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.hr-sop-card[data-hr-step]');
      if (!card || !page.contains(card)) return;
      e.preventDefault();
      const step = card.getAttribute('data-hr-step');
      const open = card.classList.contains('is-on');
      selectOnboardStep(open ? '' : step);
    });
    bindFileInput('hr-files-onboard-id', 'onboardId');
    bindFileInput('hr-files-onboard-bank', 'onboardBank');
    bindFileInput('hr-files-onboard-personnel', 'onboardPersonnel');
    bindFileInput('hr-files-onboard-trust', 'onboardTrust');
    bindFileInput('hr-files-onboard-probation', 'onboardProbation');
    bindRemoveClicks(page);
    $('hr-onboard-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const hasId = state.files.onboardId.length > 0;
      const hasBank = state.files.onboardBank.length > 0;
      const hasPersonnel = state.files.onboardPersonnel.length > 0;
      const gmail = ($('hr-onboard-gmail')?.value || '').trim();
      const fullName = ($('hr-onboard-full-name')?.value || '').trim();
      const office = resolveOffice('hr-onboard-office', 'hr-onboard-office-other');
      if (!fullName) { selectOnboardStep('1'); setMsg('hr-onboard-msg', '請填姓名全名', 'err'); return; }
      if (!office) { selectOnboardStep('1'); setMsg('hr-onboard-msg', '請選所屬處所', 'err'); return; }
      doSubmit({
        msgId: 'hr-onboard-msg',
        btn: $('hr-onboard-submit'),
        fullName,
        office,
        issueType: '內勤報到通知(有底薪人員)',
        payload: {
          eventDate: ($('hr-onboard-date')?.value || '').trim(),
          salary: ($('hr-onboard-salary')?.value || '').trim(),
          onboardId: hasId,
          onboardBank: hasBank,
          onboardPersonnel: hasPersonnel,
          onboardForm: hasId && hasBank && hasPersonnel,
          onboardTrust: state.files.onboardTrust.length > 0,
          onboardProbation: state.files.onboardProbation.length > 0,
          financeDone: !!$('hr-onboard-finance-done')?.checked,
          workGmail: gmail,
          sysDone: !!$('hr-onboard-sys-done')?.checked,
          groupDone: !!$('hr-onboard-group-done')?.checked,
          centerDone: !!$('hr-onboard-center-done')?.checked
        },
        fileGroups: [
          { label: '身分證正反面', files: state.files.onboardId.slice() },
          { label: '存摺封面', files: state.files.onboardBank.slice() },
          { label: '人事資料表', files: state.files.onboardPersonnel.slice() },
          { label: '簽署信任租', files: state.files.onboardTrust.slice() },
          { label: '試用期協議書', files: state.files.onboardProbation.slice() }
        ],
        validate(p, groups) {
          if (!p.eventDate) { selectOnboardStep('1'); return '請填報到日期'; }
          if (!p.salary) { selectOnboardStep('1'); return '請填報到人員薪資'; }
          if (!groups[0].files.length) { selectOnboardStep('1'); return '請上傳身分證正反面'; }
          if (!groups[1].files.length) { selectOnboardStep('1'); return '請上傳存摺封面'; }
          if (!groups[2].files.length) { selectOnboardStep('1'); return '請上傳人事資料表'; }
          if (!groups[3].files.length) { selectOnboardStep('2'); return '請上傳簽署信任租檔案'; }
          if (!groups[4].files.length) { selectOnboardStep('3'); return '請上傳試用期協議書'; }
          if (!p.workGmail) { selectOnboardStep('5'); return '請填工作用 Gmail'; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.workGmail)) {
            selectOnboardStep('5');
            return '工作用 Gmail 格式不正確';
          }
          return '';
        },
        onSuccess() {
          state.files.onboardId = [];
          state.files.onboardBank = [];
          state.files.onboardPersonnel = [];
          state.files.onboardTrust = [];
          state.files.onboardProbation = [];
          renderFormFiles();
          $('hr-onboard-form')?.reset();
          fillOfficeSelect('hr-onboard-office', 'hr-onboard-office-other-wrap', 'hr-onboard-office-other');
          selectOnboardStep('');
        }
      });
    });
    $('hr-onboard-clear')?.addEventListener('click', () => {
      $('hr-onboard-form')?.reset();
      state.files.onboardId = [];
      state.files.onboardBank = [];
      state.files.onboardPersonnel = [];
      state.files.onboardTrust = [];
      state.files.onboardProbation = [];
      renderFormFiles();
      setMsg('hr-onboard-msg', '');
      fillOfficeSelect('hr-onboard-office', 'hr-onboard-office-other-wrap', 'hr-onboard-office-other');
      selectOnboardStep('');
    });
    selectOnboardStep('');
  }

  /* ---------- 離職 ---------- */
  function bindResign() {
    const page = $('page-hr-resign');
    if (!page || page.dataset.hrBound) return;
    page.dataset.hrBound = '1';
    fillOfficeSelect('hr-resign-office', 'hr-resign-office-other-wrap', 'hr-resign-office-other');
    page.addEventListener('change', (e) => {
      if (e.target.id === 'hr-resign-office') syncOther('hr-resign-office', 'hr-resign-office-other-wrap');
    });
    bindFileInput('hr-files-resign', 'resign');
    bindRemoveClicks(page);
    $('hr-resign-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      doSubmit({
        msgId: 'hr-resign-msg',
        btn: $('hr-resign-submit'),
        fullName: $('hr-resign-full-name')?.value,
        office: resolveOffice('hr-resign-office', 'hr-resign-office-other'),
        issueType: '內勤離職通知(有底薪人員)',
        payload: {
          eventDate: ($('hr-resign-date')?.value || '').trim(),
          salary: ($('hr-resign-salary')?.value || '').trim() || '無'
        },
        fileGroups: [{ label: '離職文件', files: state.files.resign.slice() }],
        validate(p, groups) {
          if (!p.eventDate) return '請填離職日期';
          if (!p.salary) return '請填薪資欄（可填「無」）';
          if (!groups[0].files.length) return '請上傳離職文件';
          return '';
        },
        onSuccess() {
          state.files.resign = [];
          renderFormFiles();
          $('hr-resign-form')?.reset();
          if ($('hr-resign-salary')) $('hr-resign-salary').value = '無';
          fillOfficeSelect('hr-resign-office', 'hr-resign-office-other-wrap', 'hr-resign-office-other');
        }
      });
    });
    $('hr-resign-clear')?.addEventListener('click', () => {
      $('hr-resign-form')?.reset();
      if ($('hr-resign-salary')) $('hr-resign-salary').value = '無';
      state.files.resign = [];
      renderFormFiles();
      setMsg('hr-resign-msg', '');
      fillOfficeSelect('hr-resign-office', 'hr-resign-office-other-wrap', 'hr-resign-office-other');
    });
  }

  window.HrReport = {
    onShowForm() {
      bindReport();
      fillOfficeSelect('hr-office', 'hr-office-other-wrap', 'hr-office-other');
      syncReportPanels();
    },
    onShowOnboard() {
      bindOnboard();
      fillOfficeSelect('hr-onboard-office', 'hr-onboard-office-other-wrap', 'hr-onboard-office-other');
    },
    onShowResign() {
      bindResign();
      fillOfficeSelect('hr-resign-office', 'hr-resign-office-other-wrap', 'hr-resign-office-other');
    }
  };
})();
