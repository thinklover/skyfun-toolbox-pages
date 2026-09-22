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

  function isAqaSplit() {
    return window.matchMedia('(min-width: 900px)').matches;
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

  function reviewPassedMeta(status, reviewedAt) {
    if (!reviewedAt) return '';
    if (status === 'approved') return ' · 檢核通過 ' + esc(fmtDate(reviewedAt));
    if (status === 'rejected') return ' · 檢核 ' + esc(fmtDate(reviewedAt));
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

  function itemQualityClass(isQuality, hasQualityAnswer) {
    if (isQuality || hasQualityAnswer) return ' aqa-item--quality';
    return '';
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

  async function loadLeaderboard() {
    const el = $('aqa-rank');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = rankBoardHtml([]);
    try {
      const data = await rpc('admin_qa_leaderboard', { p_token: token() });
      if (!data?.ok) throw new Error(data?.error || '讀取失敗');
      el.innerHTML = rankBoardHtml(data.top || [], '', data.periodFrom, data.periodTo);
    } catch (err) {
      el.innerHTML = rankBoardHtml([], err.message || String(err));
    }
  }

  function renderList(items) {
    const list = $('aqa-list');
    if (!list) return;
    if (!items?.length) {
      list.innerHTML = '<p class="aqa-empty">尚無問題，或搜尋無結果。</p>';
      return;
    }
    list.innerHTML = items.map(function (it) {
      const hasImg = Array.isArray(it.images) && it.images.length;
      const hasFile = Array.isArray(it.files) && it.files.length;
      const qClass = itemQualityClass(it.isQuality, it.hasQualityAnswer);
      return (
        '<button type="button" class="aqa-item' + qClass + '" data-id="' + esc(it.id) + '">' +
        '<div class="aqa-item-head">' +
        '<h3 class="aqa-item-title">' + esc(it.title) + '</h3>' +
        qualityBadge('question', it.isQuality) +
        qualityBadge('answer', it.hasQualityAnswer) +
        reviewBadge(it.askReviewStatus) +
        '</div>' +
        '<p class="aqa-item-meta">' + categoryBadge(it.category) +
        '<span class="aqa-role aqa-role--ask">提問</span> ' + esc(it.askerName) + ' · ' + esc(fmtDate(it.createdAt)) +
        ' · 回答 ' + esc(it.answerCount || 0) + ' 則' + (hasImg ? ' · 📷' : '') + (hasFile ? ' · 📎' : '') + '</p>' +
        '</button>'
      );
    }).join('');
  }

  async function loadList(query, category) {
    const msg = $('aqa-list-msg');
    if (msg) msg.textContent = '載入中…';
    try {
      const data = await rpc('admin_qa_list', {
        p_token: token(),
        p_query: query || '',
        p_limit: 40,
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
    currentQuestionId = null;
    showDetailPanel(false);
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
      detail.innerHTML =
        '<button type="button" id="aqa-back-list" class="btn btn-sm tone-slate-soft mb-4' + (isAqaSplit() ? ' hidden' : '') + '">← 返回列表</button>' +
        '<article class="aqa-detail-card' + cardQualityClass(q.isQuality) + '">' +
        '<div class="aqa-item-head">' +
        '<h3 class="aqa-detail-title">' + esc(q.title) + '</h3>' +
        qualityBadge('question', q.isQuality) +
        reviewBadge(q.askReviewStatus) +
        '</div>' +
        '<p class="aqa-item-meta">' + categoryBadge(q.category) +
        '<span class="aqa-role aqa-role--ask">提問</span> ' + esc(q.askerName) + ' · ' + esc(fmtDate(q.createdAt)) +
        reviewPassedMeta(q.askReviewStatus, q.askReviewedAt) + '</p>' +
        '<div class="aqa-detail-body">' + esc(q.body || '（無補充說明）') + '</div>' +
        attachmentsHtml(q.images, q.files) +
        reviewNoteHtml(q.askReviewStatus, q.askReviewNote) +
        '</article>' +
        '<section class="aqa-answers">' +
        '<h4 class="aqa-section-title">回答（' + answers.length + '）</h4>' +
        (answers.length
          ? answers.map(function (a) {
              return (
                '<article class="aqa-answer-card' + cardQualityClass(a.isQuality) + '">' +
                '<div class="aqa-item-head">' +
                '<span class="aqa-role aqa-role--ans">回答</span> ' +
                '<span class="aqa-answer-who">' + esc(a.answererName) + '</span>' +
                qualityBadge('answer', a.isQuality) +
                reviewBadge(a.reviewStatus) +
                '</div>' +
                '<p class="aqa-item-meta">' + esc(fmtDate(a.createdAt)) +
                reviewPassedMeta(a.reviewStatus, a.reviewedAt) + '</p>' +
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
