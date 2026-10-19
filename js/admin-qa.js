/**
 * 行政 QA：提問、回答、關鍵字搜尋、點數（需 Supabase admin_qa.sql）
 */
(function () {
  'use strict';

  const DEBOUNCE_MS = 320;
  const MAX_IMAGES = 4;
  const MAX_FILES = 4;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv';
  const FILE_MIME = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/vnd.rar': 'rar',
    'application/x-7z-compressed': '7z',
    'text/plain': 'txt',
    'text/csv': 'csv',
  };
  const CATEGORY_LABELS = {
    system: '系統問題',
    subsidy300: '300億問題',
    review: '審核問題',
    guild: '公會問題',
    other: '其他',
  };
  let debounceTimer = null;
  let currentQuestionId = null;
  let detailData = null;
  let sbClient = null;
  let aqaInited = false;
  let canParticipate = false;
  const ADMIN_QA_TEAM = '行政管理部';

  function syncParticipationFromUser() {
    const team = String(window.skyfunAuth?.getUser?.()?.team || '').trim();
    canParticipate = team === ADMIN_QA_TEAM;
  }

  function applyParticipationUI() {
    const askFold = document.querySelector('.aqa-ask-fold');
    const notice = $('aqa-participation-notice');
    const teamEl = $('aqa-participation-team');
    const team = String(window.skyfunAuth?.getUser?.()?.team || '').trim();
    if (askFold) askFold.classList.toggle('hidden', !canParticipate);
    if (notice) notice.classList.toggle('hidden', canParticipate);
    if (teamEl) {
      teamEl.textContent = team
        ? ('您目前的處別：' + team + (canParticipate ? '' : '（非行政管理部）'))
        : '您尚未設定處別，請先至登入設定補填。';
    }
  }

  /** 列表全寬（已通過｜待審核 左右兩欄），點題目後整區換成詳情，不再左右分割 */
  function isAqaSplit() {
    return false;
  }

  function detailEmptyHtml() {
    return '<div id="aqa-detail-empty" class="aqa-detail-empty">← 選擇左側問題查看詳情與回答</div>';
  }

  function setListActive(id) {
    document.querySelectorAll('#aqa-list .aqa-item').forEach(function (btn) {
      btn.classList.toggle('aqa-item--active', btn.dataset.id === id);
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('zh-TW', { hour12: false });
    } catch {
      return iso;
    }
  }

  function reviewPassedMeta(status, reviewedAt, reviewedBy) {
    if (!reviewedAt && !reviewedBy) return '';
    const t = reviewedAt ? esc(fmtDate(reviewedAt)) : '—';
    const who = String(reviewedBy || '').trim();
    const by = who ? ' · 通過者：' + esc(who) : '';
    if (status === 'approved') {
      return '<p class="aqa-item-meta aqa-item-meta--passed">檢核通過時間：' + t + by + '</p>';
    }
    if (status === 'rejected') {
      const rejBy = who ? ' · 檢核者：' + esc(who) : '';
      return '<p class="aqa-item-meta aqa-item-meta--rejected">檢核時間：' + t + rejBy + '</p>';
    }
    return '';
  }

  function reviewBadge(status) {
    const map = {
      pending: ['待檢核', 'aqa-badge--pending'],
      approved: ['已通過', 'aqa-badge--ok'],
      rejected: ['未通過', 'aqa-badge--no'],
    };
    const [label, cls] = map[status] || [status, ''];
    return '<span class="aqa-badge ' + cls + '">' + esc(label) + '</span>';
  }

  function qualityBadge(kind, show) {
    if (!show) return '';
    const labels = {
      question: '⭐ 優質問題',
      answer: '⭐ 優質回答',
    };
    const tips = {
      question: '婷婷認定之優質問題，點數翻倍',
      answer: '婷婷認定之優質回答，點數翻倍',
    };
    const label = labels[kind] || labels.question;
    const tip = tips[kind] || tips.question;
    return '<span class="aqa-badge aqa-badge--quality" title="' + esc(tip) + '">' + label + '</span>';
  }

  function cardQualityClass(isQuality) {
    return isQuality ? ' aqa-detail-card--quality' : '';
  }

  function categoryBadge(category) {
    const label = CATEGORY_LABELS[category];
    if (!label) return '';
    return '<span class="aqa-badge aqa-badge--cat">' + esc(label) + '</span>';
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || '';
  }

  function reviewNoteHtml(status, note) {
    if (!note || !String(note).trim()) return '';
    if (status !== 'approved' && status !== 'rejected') return '';
    return '<p class="aqa-review-note"><strong>檢核備註：</strong>' + esc(note) + '</p>';
  }

  function imagesHtml(images) {
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) return '';
    return (
      '<div class="aqa-img-gallery">' +
      list.map(function (url) {
        return (
          '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' + esc(url) + '" alt="附加圖片" loading="lazy" />' +
          '</a>'
        );
      }).join('') +
      '</div>'
    );
  }

  function filesHtml(files) {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!list.length) return '';
    return (
      '<ul class="aqa-file-list">' +
      list.map(function (url, i) {
        const name = fileLabelFromUrl(url, i);
        return (
          '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" download>' +
          '📎 ' + esc(name) +
          '</a></li>'
        );
      }).join('') +
      '</ul>'
    );
  }

  function attachmentsHtml(images, files) {
    return imagesHtml(images) + filesHtml(files);
  }

  function fileLabelFromUrl(url, index) {
    const raw = String(url || '').split('/').pop() || '';
    const decoded = decodeURIComponent(raw);
    if (decoded && decoded.includes('.')) return decoded;
    return '附件 ' + ((index || 0) + 1);
  }

  function isImageFile(file) {
    return String(file?.type || '').startsWith('image/');
  }

  function attachmentFileExt(name, type) {
    const fromName = String(name || '').split('.').pop() || '';
    const clean = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowed = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'txt', 'csv'];
    if (allowed.includes(clean)) return clean;
    return FILE_MIME[type] || '';
  }

  async function rpc(name, args) {
    const auth = window.skyfunAuth;
    if (!auth?.rpc) throw new Error('請先登入工具箱');
    return auth.rpc(name, args);
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function getSb() {
    if (sbClient) return sbClient;
    const c = window.SKYFUN_SUPABASE || {};
    const url = String(c.url || '').trim();
    const anonKey = String(c.anonKey || '').trim();
    if (!url || !anonKey || !window.supabase?.createClient) {
      throw new Error('Supabase 未設定');
    }
    sbClient = window.supabase.createClient(url, anonKey);
    return sbClient;
  }

  function fileExt(name, type) {
    const fromName = String(name || '').split('.').pop() || '';
    const clean = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(clean)) return clean;
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return map[type] || 'jpg';
  }

  function renderAttachmentPreview(input, previewEl, kind) {
    if (!input || !previewEl) return;
    previewEl.innerHTML = '';
    const max = kind === 'image' ? MAX_IMAGES : MAX_FILES;
    Array.from(input.files || []).slice(0, max).forEach(function (file) {
      const wrap = document.createElement('div');
      wrap.className = kind === 'image' ? 'aqa-img-thumb' : 'aqa-file-chip';
      if (kind === 'image') {
        const img = document.createElement('img');
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        wrap.appendChild(img);
      } else {
        wrap.textContent = '📎 ' + file.name;
      }
      previewEl.appendChild(wrap);
    });
  }

  function bindAttachmentPicker(inputId, previewId, kind) {
    const input = $(inputId);
    const preview = $(previewId);
    if (!input || input.dataset.aqaBound) return;
    input.dataset.aqaBound = '1';
    input.addEventListener('change', function () {
      const max = kind === 'image' ? MAX_IMAGES : MAX_FILES;
      if (input.files && input.files.length > max) {
        alert('最多只能選 ' + max + (kind === 'image' ? ' 張圖片' : ' 個檔案'));
      }
      renderAttachmentPreview(input, preview, kind);
    });
  }

  function clearAttachmentPicker(inputId, previewId) {
    const input = $(inputId);
    const preview = $(previewId);
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
  }

  async function uploadAttachments(input, kind) {
    const bucket = kind === 'image' ? 'admin-qa-images' : 'admin-qa-files';
    const rpcName = kind === 'image' ? 'admin_qa_prepare_upload' : 'admin_qa_prepare_file_upload';
    const max = kind === 'image' ? MAX_IMAGES : MAX_FILES;
    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    const files = Array.from(input?.files || []).slice(0, max);
    if (!files.length) return [];
    const sb = getSb();
    const urls = [];
    for (const file of files) {
      if (kind === 'image') {
        if (!isImageFile(file)) throw new Error('僅支援 JPG、PNG、GIF、WEBP 圖片');
      } else if (isImageFile(file)) {
        throw new Error('圖片請使用「附加圖片」，檔案請選 PDF、Word、Excel 等文件');
      }
      if (file.size > maxBytes) {
        throw new Error((kind === 'image' ? '單張圖片' : '單一檔案') + '不可超過 ' + (maxBytes / (1024 * 1024)) + 'MB');
      }
      const ext = kind === 'image' ? fileExt(file.name, file.type) : attachmentFileExt(file.name, file.type);
      if (!ext) throw new Error('不支援的檔案格式：' + (file.name || ''));
      const prep = await rpc(rpcName, { p_token: token(), p_ext: ext });
      if (!prep?.ok) throw new Error(prep?.error || '無法準備上傳');
      const { error } = await sb.storage.from(bucket).upload(prep.path, file, {
        contentType: file.type || (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
        upsert: false,
      });
      if (error) throw new Error(error.message || '上傳失敗');
      urls.push(prep.publicUrl);
    }
    return urls;
  }

  function renderFilePreview(input, previewEl) {
    renderAttachmentPreview(input, previewEl, 'image');
  }

  function bindImagePicker(inputId, previewId) {
    bindAttachmentPicker(inputId, previewId, 'image');
  }

  function clearImagePicker(inputId, previewId) {
    clearAttachmentPicker(inputId, previewId);
  }

  async function uploadImages(input) {
    return uploadAttachments(input, 'image');
  }

  async function uploadFiles(input) {
    return uploadAttachments(input, 'file');
  }

  function periodLabel(from, to) {
    if (!from || !to) return '';
    return '<p class="aqa-period-note">業績月 ' + esc(from) + '～' + esc(to) + '</p>';
  }

  async function loadStats() {
    const el = $('aqa-stats');
    if (!el) return;
    try {
      const data = await rpc('admin_qa_my_stats', { p_token: token() });
      if (!data?.ok) throw new Error(data?.error || '讀取失敗');
      canParticipate = !!data.canParticipate;
      applyParticipationUI();
      el.innerHTML =
        periodLabel(data.periodFrom, data.periodTo) +
        '<div class="aqa-stat"><strong>提問認列</strong><span>' + esc(data.askPoints) + ' / ' + esc(data.askCap) + '</span></div>' +
        '<div class="aqa-stat"><strong>回答認列</strong><span>' + esc(data.answerPoints) + ' / ' + esc(data.answerCap) + '</span></div>' +
        '<div class="aqa-stat aqa-stat--rank"><strong>排行榜總點</strong><span>' + esc(data.rankPoints != null ? data.rankPoints : ((data.askTotal || data.askPoints || 0) + (data.answerTotal || data.answerPoints || 0))) + '</span></div>';
    } catch (err) {
      canParticipate = false;
      applyParticipationUI();
      el.innerHTML = '<p class="aqa-msg aqa-msg--err">' + esc(err.message || err) + '</p>';
    }
  }

  function rankBoardHtml(top, emptyMsg, periodFrom, periodTo) {
    const medals = ['🥇', '🥈', '🥉'];
    const list = (top || []).map(function (row, i) {
      const rank = row.rank || i + 1;
      const team = row.team ? '<span class="aqa-rank-team">' + esc(row.team) + '</span>' : '';
      return (
        '<div class="aqa-rank-item aqa-rank-item--' + rank + '">' +
        '<span class="aqa-rank-medal">' + (medals[i] || rank) + '</span>' +
        '<div class="aqa-rank-main">' +
        '<div class="aqa-rank-who">' + esc(row.userName) + team + '</div>' +
        '</div>' +
        '<div class="aqa-rank-total"><strong>' + esc(row.totalPoints) + '</strong><span>總點</span></div>' +
        '</div>'
      );
    }).join('');
    const empty = emptyMsg || '尚無排行榜資料，通過檢核後即可上榜。';
    const period = periodFrom && periodTo
      ? '<div class="aqa-rank-period">業績月 ' + esc(periodFrom) + '～' + esc(periodTo) + '</div>'
      : '';
    return (
      '<div class="aqa-rank-head">' +
      '<div class="aqa-rank-title">🏆 點數排行榜 TOP 3</div>' +
      period +
      '<div class="aqa-rank-prizes">' +
      '<span class="aqa-rank-prize aqa-rank-prize--1">🥇 第1名 1,000 元</span>' +
      '<span class="aqa-rank-prize aqa-rank-prize--2">🥈 第2名 500 元</span>' +
      '<span class="aqa-rank-prize aqa-rank-prize--3">🥉 第3名 300 元</span>' +
      '</div></div>' +
      '<div class="aqa-rank-list">' +
      (list || '<p class="aqa-rank-empty">' + esc(empty) + '</p>') +
      '</div>'
    );
  }

  /** 行政專區「行政問答」卡片上的前三名 */
  function renderCardTop(top) {
    const el = $('aqa-card-top');
    if (!el) return;
    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = (top || []).length
      ? top.slice(0, 3).map(function (row, i) {
        return '<span class="adz-top-item"><i>' + medals[i] + '</i><span>' + esc(row.userName) + '</span><b>' + esc(row.totalPoints) + '<small>點</small></b></span>';
      }).join('')
      : '<span class="adz-top-empty">本月還沒有人上榜</span>';
  }

  async function loadLeaderboard() {
    const el = $('aqa-rank');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = rankBoardHtml([]);
    try {
      const data = await rpc('admin_qa_leaderboard', { p_token: token() });
      if (!data?.ok) throw new Error(data?.error || '讀取失敗');
      el.innerHTML = rankBoardHtml(data.top || [], '', data.periodFrom, data.periodTo);
      renderCardTop(data.top || []);
    } catch (err) {
      el.innerHTML = rankBoardHtml([], err.message || String(err));
    }
  }

  /** 舊連結相容：行政問答已改成獨立頁面 */
  window.adminQaToggle = function () {
    if (typeof window.showPage === 'function') window.showPage('admin-qa');
  };

  /** 列表用的短日期：今年只顯示月/日 */
  function fmtShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const md = (d.getMonth() + 1) + '/' + d.getDate();
    return d.getFullYear() === new Date().getFullYear() ? md : d.getFullYear() + '/' + md;
  }

  function itemHtml(it) {
    const hasImg = Array.isArray(it.images) && it.images.length;
    const hasFile = Array.isArray(it.files) && it.files.length;
    const approved = it.askReviewStatus === 'approved' && it.askReviewedAt;
    const when = approved
      ? '<span class="aqa-row-when aqa-row-when--ok" title="通過時間 ' + esc(fmtDate(it.askReviewedAt)) + '">' + esc(fmtShort(it.askReviewedAt)) + ' 通過</span>'
      : '<span class="aqa-row-when" title="提問時間 ' + esc(fmtDate(it.createdAt)) + '">' + esc(fmtShort(it.createdAt)) + ' 提問</span>';
    const cat = categoryLabel(it.category);
    const star = it.isQuality ? '<span class="aqa-row-star" title="優質問題，點數翻倍">⭐</span>' : '';
    const n = Number(it.answerCount) || 0;
    return (
      '<button type="button" class="aqa-item aqa-row' + (it.isQuality ? ' aqa-row--quality' : '') + '" data-id="' + esc(it.id) + '">' +
      '<span class="aqa-row-main">' +
      '<span class="aqa-row-title">' + star + esc(it.title) + '</span>' +
      '<span class="aqa-row-meta">' +
      (cat ? '<span class="aqa-row-cat">' + esc(cat) + '</span>' : '') +
      '<span>' + esc(it.askerName) + '</span>' + when +
      (hasImg ? '<span title="有附圖">📷</span>' : '') + (hasFile ? '<span title="有附件">📎</span>' : '') +
      (it.hasQualityAnswer ? '<span class="aqa-row-tag" title="有優質回答，點數翻倍">⭐ 優質回答</span>' : '') +
      '</span></span>' +
      '<span class="aqa-row-ans' + (n ? '' : ' aqa-row-ans--zero') + '"><b>' + n + '</b><small>' + (n ? '回答' : '待回答') + '</small></span>' +
      '</button>'
    );
  }

  const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

  /** 依檢核狀態分區：已通過（依通過時間新到舊）、待審核（依提問時間新到舊），未通過收在最下面 */
  function renderList(items) {
    const list = $('aqa-list');
    if (!list) return;
    if (!items?.length) {
      list.innerHTML = '<p class="aqa-empty">尚無問題，或搜尋無結果。</p>';
      return;
    }
    const by = (status) => items.filter(function (it) { return it.askReviewStatus === status; });
    const passed = by('approved').sort(function (a, b) {
      return time(b.askReviewedAt) - time(a.askReviewedAt) || time(b.createdAt) - time(a.createdAt);
    });
    const newest = function (a, b) { return time(b.createdAt) - time(a.createdAt); };
    const pending = by('pending').sort(newest);
    const rejected = by('rejected').sort(newest);
    const group = function (key, icon, title, sub, rows, emptyText) {
      return (
        '<details class="aqa-group aqa-group--' + key + '"' + (key === 'rejected' ? '' : ' open') + '>' +
        '<summary class="aqa-group-title">' +
        '<span class="aqa-group-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="aqa-group-text"><b>' + title + '</b><small>' + sub + '</small></span>' +
        '<span class="aqa-group-count">' + rows.length + '</span>' +
        '</summary>' +
        '<div class="aqa-group-body">' +
        (rows.length ? rows.map(itemHtml).join('') : '<p class="aqa-empty">' + esc(emptyText) + '</p>') +
        '</div></details>'
      );
    };
    list.innerHTML =
      '<div class="aqa-group-cols">' +
      group('approved', '✓', '已通過', '依通過時間排序，最新在上', passed, '目前沒有已通過的問題') +
      group('pending', '⏳', '待審核', '等待小組長檢核，歡迎協助回答', pending, '目前沒有待審核的問題') +
      '</div>' +
      (rejected.length ? group('rejected', '✕', '未通過', '未通過檢核的問題', rejected, '') : '');
  }

  async function loadList(query, category) {
    const msg = $('aqa-list-msg');
    if (msg) msg.textContent = '載入中…';
    try {
      const data = await rpc('admin_qa_list', {
        p_token: token(),
        p_query: query || '',
        p_limit: 200,
        p_offset: 0,
        p_category: category || '',
      });
      if (!data?.ok) throw new Error(data?.error || '讀取失敗');
      renderList(data.items || []);
      if (msg) msg.textContent = '';
    } catch (err) {
      if (msg) msg.textContent = err.message || String(err);
      renderList([]);
    }
  }

  function showDetailPanel(show) {
    const panel = $('aqa-detail');
    const workspace = $('aqa-workspace');
    const listWrap = $('aqa-list-wrap');
    if (!panel) return;
    if (isAqaSplit()) {
      if (listWrap) listWrap.classList.remove('hidden');
      if (workspace) workspace.classList.remove('aqa-workspace--detail-open');
      if (!show) {
        panel.innerHTML = detailEmptyHtml();
        setListActive('');
      }
      return;
    }
    if (workspace) workspace.classList.toggle('aqa-workspace--detail-open', !!show);
    if (listWrap) listWrap.classList.toggle('hidden', !!show);
    if (!show) {
      panel.innerHTML = detailEmptyHtml();
      setListActive('');
    }
  }

  function closeDetail() {
    const back = currentQuestionId;
    currentQuestionId = null;
    showDetailPanel(false);
    const item = back && document.querySelector('#aqa-list .aqa-item[data-id="' + back + '"]');
    if (item) item.scrollIntoView({ block: 'center' });
  }

  async function openQuestion(id) {
    currentQuestionId = id;
    const detail = $('aqa-detail');
    if (!detail) return;
    setListActive(id);
    detail.innerHTML = '<p class="aqa-msg">載入中…</p>';
    showDetailPanel(true);
    try {
      const data = await rpc('admin_qa_get', { p_token: token(), p_question_id: id });
      if (!data?.ok) throw new Error(data?.error || '讀取失敗');
      const q = data.question;
      const answers = data.answers || [];
      const canEdit = !!data.canEdit;
      detailData = { question: q, answers: answers };
      const editBtn = function (key) {
        return canEdit ? '<button type="button" class="aqa-edit-btn" data-aqa-edit="' + esc(key) + '">✏️ 修改</button>' : '';
      };
      detail.innerHTML =
        '<button type="button" id="aqa-back-list" class="btn btn-sm tone-slate-soft mb-4' + (isAqaSplit() ? ' hidden' : '') + '">← 返回列表</button>' +
        '<article class="aqa-detail-card' + cardQualityClass(q.isQuality) + '" data-aqa-card="q">' +
        '<div class="aqa-item-head">' +
        '<h3 class="aqa-detail-title">' + esc(q.title) + '</h3>' +
        qualityBadge('question', q.isQuality) +
        reviewBadge(q.askReviewStatus) +
        editBtn('q') +
        '</div>' +
        '<p class="aqa-item-meta">' + categoryBadge(q.category) +
        '<span class="aqa-role aqa-role--ask">提問</span> ' + esc(q.askerName) + ' · 送出 ' + esc(fmtDate(q.createdAt)) + '</p>' +
        reviewPassedMeta(q.askReviewStatus, q.askReviewedAt, q.askReviewedBy) +
        editedMeta(q.editedAt, q.editedBy) +
        '<div class="aqa-detail-body">' + esc(q.body || '（無補充說明）') + '</div>' +
        attachmentsHtml(q.images, q.files) +
        reviewNoteHtml(q.askReviewStatus, q.askReviewNote) +
        '</article>' +
        '<section class="aqa-answers">' +
        '<h4 class="aqa-section-title">回答（' + answers.length + '）</h4>' +
        (answers.length
          ? answers.map(function (a) {
              return (
                '<article class="aqa-answer-card' + cardQualityClass(a.isQuality) + '" data-aqa-card="a:' + esc(a.id) + '">' +
                '<div class="aqa-item-head">' +
                '<span class="aqa-role aqa-role--ans">回答</span> ' +
                '<span class="aqa-answer-who">' + esc(a.answererName) + '</span>' +
                qualityBadge('answer', a.isQuality) +
                reviewBadge(a.reviewStatus) +
                editBtn('a:' + a.id) +
                '</div>' +
                '<p class="aqa-item-meta">送出 ' + esc(fmtDate(a.createdAt)) + '</p>' +
                reviewPassedMeta(a.reviewStatus, a.reviewedAt, a.reviewedBy) +
                editedMeta(a.editedAt, a.editedBy) +
                '<div class="aqa-detail-body">' + esc(a.body) + '</div>' +
                attachmentsHtml(a.images, a.files) +
                reviewNoteHtml(a.reviewStatus, a.reviewNote) +
                '</article>'
              );
            }).join('')
          : '<p class="aqa-empty">尚無回答，歡迎行政同仁協助解答。</p>') +
        '</section>' +
        (canParticipate
          ? '<section class="aqa-reply-form">' +
            '<h4 class="aqa-section-title">我要回答</h4>' +
            '<textarea id="aqa-answer-body" class="aqa-textarea" rows="4" placeholder="輸入你的回答（必填，至少 4 字）…"></textarea>' +
            '<div class="aqa-upload-row">' +
            '<label class="aqa-upload-btn">' +
            '<input id="aqa-answer-images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple />' +
            '📷 附加圖片（選填，最多 4 張）' +
            '</label>' +
            '<div id="aqa-answer-preview" class="aqa-img-preview"></div>' +
            '</div>' +
            '<div class="aqa-upload-row">' +
            '<label class="aqa-upload-btn">' +
            '<input id="aqa-answer-files" type="file" accept="' + FILE_ACCEPT + '" multiple />' +
            '📎 附加檔案（選填，最多 4 個，單檔 10MB）' +
            '</label>' +
            '<div id="aqa-answer-files-preview" class="aqa-file-preview"></div>' +
            '</div>' +
            '<button type="button" id="aqa-submit-answer" class="btn btn-sm btn-solid-emerald mt-2">送出回答</button>' +
            '<p id="aqa-answer-msg" class="aqa-msg hidden"></p>' +
            '</section>'
          : '<p class="aqa-participation-note">提問與回答僅限<strong>行政管理部</strong>同仁，您目前可瀏覽問題與回答。</p>');

      $('aqa-back-list')?.addEventListener('click', closeDetail);
      if (canParticipate) {
        bindImagePicker('aqa-answer-images', 'aqa-answer-preview');
        bindAttachmentPicker('aqa-answer-files', 'aqa-answer-files-preview', 'file');
        $('aqa-submit-answer')?.addEventListener('click', submitAnswer);
      }
    } catch (err) {
      detail.innerHTML = '<p class="aqa-msg aqa-msg--err">' + esc(err.message || err) + '</p>';
    }
  }

  function editedMeta(at, by) {
    if (!at) return '';
    const who = String(by || '').trim();
    return '<p class="aqa-item-meta aqa-item-meta--edited">✏️ ' + (who ? esc(who) + ' ' : '') + '修改於 ' + esc(fmtDate(at)) + '</p>';
  }

  /** 有修改權限的人：把卡片換成編輯表單（取消或存檔後整個詳情重畫） */
  function startEdit(key) {
    const card = document.querySelector('#aqa-detail [data-aqa-card="' + key + '"]');
    if (!card || !detailData) return;
    const btns =
      '<div class="aqa-edit-btns">' +
      '<button type="button" class="btn btn-sm btn-solid-emerald" data-aqa-save="' + esc(key) + '">儲存修改</button>' +
      '<button type="button" class="btn btn-sm tone-slate-soft" data-aqa-cancel="1">取消</button>' +
      '</div><p class="aqa-msg hidden" data-e="msg"></p>';
    if (key === 'q') {
      const q = detailData.question;
      const opts = Object.keys(CATEGORY_LABELS).map(function (k, i) {
        return '<option value="' + k + '"' + (k === q.category ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(CATEGORY_LABELS[k]) + '</option>';
      }).join('');
      card.innerHTML =
        '<h4 class="aqa-section-title">✏️ 修改問題</h4>' +
        '<select class="aqa-select" data-e="category">' + opts + '</select>' +
        '<input type="text" class="aqa-input aqa-edit-title" data-e="title" maxlength="120" value="' + esc(q.title) + '" />' +
        '<textarea class="aqa-textarea" data-e="body" rows="6" placeholder="補充說明（選填）">' + esc(q.body || '') + '</textarea>' +
        btns;
    } else {
      const a = detailData.answers.find(function (x) { return 'a:' + x.id === key; });
      if (!a) return;
      card.innerHTML =
        '<h4 class="aqa-section-title">✏️ 修改 ' + esc(a.answererName) + ' 的回答</h4>' +
        '<textarea class="aqa-textarea" data-e="body" rows="8">' + esc(a.body || '') + '</textarea>' +
        btns;
    }
    card.querySelector('[data-e="body"]')?.focus();
  }

  async function saveEdit(key, btn) {
    const card = btn.closest('[data-aqa-card]');
    const val = function (name) { return (card.querySelector('[data-e="' + name + '"]')?.value || '').trim(); };
    const msg = card.querySelector('[data-e="msg"]');
    const say = function (text, err) {
      msg.textContent = text;
      msg.classList.remove('hidden');
      msg.classList.toggle('aqa-msg--err', !!err);
    };
    btn.disabled = true;
    say('儲存中…');
    try {
      const data = key === 'q'
        ? await rpc('admin_qa_edit_question', {
          p_token: token(), p_question_id: currentQuestionId,
          p_title: val('title'), p_body: val('body'), p_category: val('category'),
        })
        : await rpc('admin_qa_edit_answer', { p_token: token(), p_answer_id: key.slice(2), p_body: val('body') });
      if (!data?.ok) throw new Error(data?.error || '儲存失敗');
      await openQuestion(currentQuestionId);
      const f = listFilters();
      loadList(f.query, f.category).then(function () { setListActive(currentQuestionId); });
    } catch (err) {
      btn.disabled = false;
      say(err.message || String(err), true);
    }
  }

  async function submitAsk() {
    if (!canParticipate) {
      const msg = $('aqa-ask-msg');
      if (msg) {
        msg.textContent = '僅行政管理部同仁可提問';
        msg.classList.remove('hidden');
      }
      return;
    }
    const category = ($('aqa-ask-category')?.value || '').trim();
    const title = ($('aqa-ask-title')?.value || '').trim();
    const body = ($('aqa-ask-body')?.value || '').trim();
    const msg = $('aqa-ask-msg');
    if (!category) {
      if (msg) {
        msg.textContent = '請選擇問題分類';
        msg.classList.remove('hidden');
        msg.classList.add('aqa-msg--err');
      }
      return;
    }
    if (title.length < 4) {
      if (msg) {
        msg.textContent = '請填寫問題標題（至少 4 字）';
        msg.classList.remove('hidden');
        msg.classList.add('aqa-msg--err');
      }
      return;
    }
    if (msg) {
      msg.textContent = '送出中…';
      msg.classList.remove('hidden', 'aqa-msg--err');
    }
    try {
      const images = await uploadImages($('aqa-ask-images'));
      const files = await uploadFiles($('aqa-ask-files'));
      const data = await rpc('admin_qa_ask', {
        p_token: token(),
        p_title: title,
        p_body: body,
        p_images: images,
        p_files: files,
        p_category: category,
      });
      if (!data?.ok) throw new Error(data?.error || '送出失敗');
      if ($('aqa-ask-category')) $('aqa-ask-category').value = '';
      if ($('aqa-ask-title')) $('aqa-ask-title').value = '';
      if ($('aqa-ask-body')) $('aqa-ask-body').value = '';
      clearImagePicker('aqa-ask-images', 'aqa-ask-preview');
      clearAttachmentPicker('aqa-ask-files', 'aqa-ask-files-preview');
      if (msg) msg.textContent = data.message || '已送出';
      await loadStats();
      await loadLeaderboard();
      await loadList($('aqa-search')?.value || '', $('aqa-filter-category')?.value || '');
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || String(err);
        msg.classList.add('aqa-msg--err');
      }
    }
  }

  async function submitAnswer() {
    if (!canParticipate) {
      const msg = $('aqa-answer-msg');
      if (msg) {
        msg.textContent = '僅行政管理部同仁可回答';
        msg.classList.remove('hidden');
        msg.classList.add('aqa-msg--err');
      }
      return;
    }
    if (!currentQuestionId) return;
    const body = ($('aqa-answer-body')?.value || '').trim();
    const msg = $('aqa-answer-msg');
    if (body.length < 4) {
      if (msg) {
        msg.textContent = '回答至少 4 個字';
        msg.classList.remove('hidden');
        msg.classList.add('aqa-msg--err');
      }
      return;
    }
    if (msg) {
      msg.textContent = '送出中…';
      msg.classList.remove('hidden', 'aqa-msg--err');
    }
    try {
      const images = await uploadImages($('aqa-answer-images'));
      const files = await uploadFiles($('aqa-answer-files'));
      const data = await rpc('admin_qa_answer', {
        p_token: token(),
        p_question_id: currentQuestionId,
        p_body: body,
        p_images: images,
        p_files: files,
      });
      if (!data?.ok) throw new Error(data?.error || '送出失敗');
      await loadStats();
      await loadLeaderboard();
      await openQuestion(currentQuestionId);
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || String(err);
        msg.classList.add('aqa-msg--err');
      }
    }
  }

  function listFilters() {
    return {
      query: $('aqa-search')?.value || '',
      category: $('aqa-filter-category')?.value || '',
    };
  }

  function onSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      const f = listFilters();
      loadList(f.query, f.category);
    }, DEBOUNCE_MS);
  }

  function bindEvents() {
    $('aqa-search')?.addEventListener('input', onSearchInput);
    $('aqa-filter-category')?.addEventListener('change', onSearchInput);
    $('aqa-submit-ask')?.addEventListener('click', submitAsk);
    bindImagePicker('aqa-ask-images', 'aqa-ask-preview');
    bindAttachmentPicker('aqa-ask-files', 'aqa-ask-files-preview', 'file');
    $('aqa-list')?.addEventListener('click', function (e) {
      const btn = e.target.closest?.('[data-id]');
      if (!btn?.dataset?.id) return;
      openQuestion(btn.dataset.id);
    });
    $('aqa-detail')?.addEventListener('click', function (e) {
      const edit = e.target.closest?.('[data-aqa-edit]');
      if (edit) return startEdit(edit.dataset.aqaEdit);
      const save = e.target.closest?.('[data-aqa-save]');
      if (save) return saveEdit(save.dataset.aqaSave, save);
      if (e.target.closest?.('[data-aqa-cancel]') && currentQuestionId) openQuestion(currentQuestionId);
    });
  }

  function initPage() {
    if (!$('aqa-list') || !$('page-administration')) return;
    if (!aqaInited) {
      bindEvents();
      aqaInited = true;
    }
    canParticipate = false;
    applyParticipationUI();
    syncParticipationFromUser();
    applyParticipationUI();
    loadStats().then(function () {
      loadLeaderboard();
      loadList('', '');
    }).catch(function () {
      loadLeaderboard();
      loadList('', '');
    });
    closeDetail();
  }

  window.adminQaInit = initPage;

  document.addEventListener('skyfun-auth-ready', initPage);
})();
