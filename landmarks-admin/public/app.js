(function () {
  const $ = (id) => document.getElementById(id);

  const storageKey = 'landmarksCms:apiBase';
  const tokenKey = 'landmarksCms:access';
  const refreshKey = 'landmarksCms:refresh';
  const userKey = 'landmarksCms:userJson';

  
  const DEFAULT_BUNDLE = {
    homeCountryOrder: ['UA'],
    homeRegionIdsByCountry: { UA: ['kyiv'] },
    regions: {
      kyiv: {
        id: 'kyiv',
        titleUk: 'Київ',
        titleEn: 'Kyiv',
        countryUk: 'Україна',
        countryEn: 'Ukraine',
        flag: '🏳️',
        center: {
          latitude: 50.4527,
          longitude: 30.5138,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        },
        landmarks: [
          {
            id: 'example_landmark',
            titleUk: 'Приклад пам’ятки — замініть або видаліть',
            titleEn: 'Example landmark',
            lat: 50.4527,
            lng: 30.5138,
            minutes: 30,
            free: true,
            thumbRef: 't1',
            descUk:
              'Текст для прев’ю. Додайте thumbUri або завантажте фото в «Медіа». Структура має бути всередині regions[].landmarks[].',
          },
        ],
      },
    },
    homeCountryHeroRefs: {},
    homeCountryHeroUris: {},
  };

  function apiBase() {
    const raw = ($('apiBase') && $('apiBase').value.trim()) || sessionStorage.getItem(storageKey) || '';
    if (raw) return raw.replace(/\/$/, '');
    return '';
  }

  function authHeaders(withJson) {
    const t = sessionStorage.getItem(tokenKey);
    const h = {};
    if (t) h.Authorization = 'Bearer ' + t;
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
  }

  async function api(path, opt) {
    const base = apiBase();
    const url = (base || '') + path;
    const m = (opt && opt.method) || 'GET';
    const withJson = m === 'PUT' || (m === 'POST' && opt && opt.body);
    const res = await fetch(url, {
      ...opt,
      headers: { ...authHeaders(!!withJson), ...((opt && opt.headers) || {}) },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (res.status === 401) {
      showLogin();
      const err = new Error('session_expired');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error((data && (data.code || data.error || data.message)) || res.statusText || 'request_failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(msg, kind) {
    const host = $('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'info');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }

  function showError(el, msg) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function shellEl() {
    return document.querySelector('.shell');
  }

  function mountBrandForApp() {
    const shell = shellEl();
    const brand = $('globalBrand');
    const mainPanel = $('mainPanel');
    if (!shell || !brand || !mainPanel) return;
    if (brand.parentElement !== shell) {
      shell.insertBefore(brand, mainPanel);
    }
  }

  function mountBrandForLogin() {
    const authStage = $('authStage');
    const brand = $('globalBrand');
    const loginPanel = $('loginPanel');
    if (!authStage || !brand || !loginPanel) return;
    if (brand.parentElement !== authStage) {
      authStage.insertBefore(brand, loginPanel);
    }
  }

  function setShellMode(app) {
    const shell = shellEl();
    if (!shell) return;
    shell.classList.toggle('shell--app', !!app);
    shell.classList.toggle('shell--login', !app);
  }

  function showMain(user) {
    $('loginPanel').classList.add('hidden');
    mountBrandForApp();
    const authStage = $('authStage');
    if (authStage) authStage.classList.add('hidden');
    $('mainPanel').classList.remove('hidden');
    setShellMode(true);
    if (user) sessionStorage.setItem(userKey, JSON.stringify(user));
    const u = user || safeJsonParse(sessionStorage.getItem(userKey));
    const info = $('userInfo');
    if (info && u) {
      info.textContent = (u.email || '') + (u.role ? ' · ' + u.role : '');
    }
  }

  function safeJsonParse(s) {
    try {
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  function showLogin() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(refreshKey);
    sessionStorage.removeItem(userKey);
    $('mainPanel').classList.add('hidden');
    $('loginPanel').classList.remove('hidden');
    const authStage = $('authStage');
    if (authStage) authStage.classList.remove('hidden');
    mountBrandForLogin();
    setShellMode(false);
  }

  function updateEditorMeta() {
    const ed = $('jsonEditor');
    const meta = $('editorMeta');
    const status = $('jsonStatus');
    if (!ed || !meta) return;
    const len = ed.value.length;
    const lines = ed.value.split(/\n/).length;
    meta.textContent = len + ' символів · ' + lines + ' рядків';
    let ok = false;
    let hint = 'JSON?';
    try {
      const o = JSON.parse(ed.value || 'null');
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        ok = true;
        const r = o.regions && typeof o.regions === 'object' ? Object.keys(o.regions).length : 0;
        hint = 'OK · регіонів: ' + r;
      }
    } catch (e) {
      hint = 'помилка: ' + (e.message || '');
    }
    if (status) {
      status.textContent = ok ? hint : 'не валідний';
      status.className = 'pill ' + (ok ? '' : 'pill-muted');
    }
  }

  async function loadEditor() {
    const data = await api('/api/admin/landmark-content/bundle', { method: 'GET' });
    const editor = $('jsonEditor');
    if (!editor) return;
    if (data && data.empty) {
      editor.value = JSON.stringify(DEFAULT_BUNDLE, null, 2);
    } else if (data && data.bundle) {
      editor.value = JSON.stringify(data.bundle, null, 2);
    } else {
      editor.value = JSON.stringify(DEFAULT_BUNDLE, null, 2);
    }
    updateEditorMeta();
    scheduleLandmarkPreview();
  }

  function downloadJson(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function parseEditorJson() {
    return JSON.parse($('jsonEditor').value);
  }

  async function loadMedia() {
    const data = await api('/api/admin/landmark-content/media', { method: 'GET' });
    const grid = $('mediaGrid');
    const empty = $('mediaEmpty');
    if (!grid) return;
    grid.innerHTML = '';
    const items = (data && data.items) || [];
    if (empty) empty.classList.toggle('hidden', items.length > 0);
    items.forEach((it) => {
      const tile = document.createElement('div');
      tile.className = 'media-tile';
      const img = document.createElement('img');
      img.src = it.url;
      img.alt = '';
      img.loading = 'lazy';
      const body = document.createElement('div');
      body.className = 'media-tile-body';
      const name = document.createElement('div');
      name.className = 'media-tile-name';
      name.textContent = it.fileName;
      const actions = document.createElement('div');
      actions.className = 'media-tile-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-secondary';
      copy.textContent = 'Копіювати URL';
      copy.addEventListener('click', () => {
        navigator.clipboard.writeText(it.url).then(
          () => toast('URL у буфері', 'ok'),
          () => toast(it.url, 'info'),
        );
      });
      const open = document.createElement('a');
      open.href = it.url;
      open.target = '_blank';
      open.rel = 'noreferrer';
      open.className = 'btn btn-ghost';
      open.textContent = 'Відкрити';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger';
      del.textContent = 'Видалити';
      del.addEventListener('click', async () => {
        if (!confirm('Видалити ' + it.fileName + '?')) return;
        const enc = encodeURIComponent(it.fileName);
        await api('/api/admin/landmark-content/media/' + enc, { method: 'DELETE' });
        toast('Видалено', 'ok');
        loadMedia();
      });
      actions.appendChild(copy);
      actions.appendChild(open);
      actions.appendChild(del);
      body.appendChild(name);
      body.appendChild(actions);
      tile.appendChild(img);
      tile.appendChild(body);
      grid.appendChild(tile);
    });
  }

  function isHttpsUrl(str) {
    return /^https?:\/\//i.test(String(str || '').trim());
  }

  function collectLandmarkPhotoUrls(lm) {
    const urls = [];
    const seen = new Set();
    const push = (u) => {
      const t = String(u || '').trim();
      if (!isHttpsUrl(t) || seen.has(t)) return;
      seen.add(t);
      urls.push(t);
    };
    if (!lm || typeof lm !== 'object') return urls;
    push(lm.thumbUri);
    const gall = lm.galleryUris;
    if (Array.isArray(gall)) gall.forEach(push);
    const st = lm.story && typeof lm.story === 'object' ? lm.story : null;
    if (st) {
      if (st.photoFact && typeof st.photoFact === 'object') push(st.photoFact.bgUri);
      if (st.beforeAfter && typeof st.beforeAfter === 'object') {
        push(st.beforeAfter.newUri);
        push(st.beforeAfter.oldUri);
      }
      if (st.thirdFact && typeof st.thirdFact === 'object') push(st.thirdFact.bgUri);
      push(st.closingBgUri);
      const pageLists = [st.introPagesUk, st.introPages];
      pageLists.forEach(function (arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function (p) {
          if (p && typeof p === 'object') push(p.photoUri || p.imageUri || p.uri);
        });
      });
    }
    return urls;
  }

  function flattenLandmarksFromBundle(bundle) {
    const list = [];
    const regs = bundle && bundle.regions && typeof bundle.regions === 'object' ? bundle.regions : {};
    Object.keys(regs).forEach((rid) => {
      const R = regs[rid];
      const regionTitle = (R && (R.titleUk || R.titleEn || R.id)) || rid;
      const lms = R && Array.isArray(R.landmarks) ? R.landmarks : [];
      lms.forEach((lm, idx) => {
        if (!lm || typeof lm !== 'object') return;
        list.push({ regionId: rid, regionTitle: String(regionTitle), index: idx, lm });
      });
    });
    return list;
  }

  function truncateText(str, max) {
    const s = String(str || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  function coordsLabel(lm) {
    const lat = Number(lm.lat);
    const lng = Number(lm.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'немає координат';
    return lat.toFixed(4) + ', ' + lng.toFixed(4);
  }

  let cachedPreviewRows = [];
  
  let previewSelection = null;

  let previewRefreshTimer = null;
  function scheduleLandmarkPreview() {
    clearTimeout(previewRefreshTimer);
    previewRefreshTimer = setTimeout(renderLandmarkPreview, 420);
  }

  function highlightPreviewSelection(regionId, index) {
    document.querySelectorAll('.preview-card').forEach((c) => {
      const on = c.dataset.regionId === regionId && Number(c.dataset.landmarkIndex) === index;
      c.classList.toggle('preview-card--active', on);
    });
    document.querySelectorAll('.preview-landmark-item').forEach((b) => {
      const on = b.dataset.regionId === regionId && Number(b.dataset.landmarkIndex) === index;
      b.classList.toggle('preview-landmark-item--active', on);
    });
  }

  function scrollPreviewCardIntoView(regionId, index) {
    const grid = $('previewGrid');
    if (!grid) return;
    const card = Array.from(grid.querySelectorAll('.preview-card')).find(
      (c) => c.dataset.regionId === regionId && Number(c.dataset.landmarkIndex) === index,
    );
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getLandmarkStoryPages(lm) {
    const st = lm && lm.story && typeof lm.story === 'object' ? lm.story : {};
    if (Array.isArray(st.introPagesUk) && st.introPagesUk.length) {
      return st.introPagesUk.map(function (p) {
        if (typeof p === 'string') return { body: p, photoUri: '' };
        return {
          body: String((p && (p.body || p.text)) || '').trim(),
          photoUri: String((p && (p.photoUri || p.imageUri || p.uri)) || '').trim(),
        };
      });
    }
    const pages = [];
    if (st.introPage1Uk) pages.push({ body: String(st.introPage1Uk), photoUri: '' });
    if (Array.isArray(st.introPages) && st.introPages.length) {
      st.introPages.forEach(function (p) {
        pages.push({
          body: String((p && (p.bodyUk || p.body || p.text)) || '').trim(),
          photoUri: String((p && (p.photoUri || '')) || '').trim(),
        });
      });
    }
    return pages;
  }

  function renderPreviewDetail(lm, regionTitle, regionId) {
    const detail = $('previewDetail');
    const grid = $('previewGrid');
    if (!detail) return;
    if (!lm) {
      detail.classList.add('hidden');
      if (grid) grid.classList.remove('preview-grid--dim');
      return;
    }
    detail.classList.remove('hidden');
    if (grid) grid.classList.add('preview-grid--dim');

    const titleEl = $('previewDetailTitle');
    if (titleEl) titleEl.textContent = lm.titleUk || lm.titleEn || lm.id || 'Пам’ятка';
    const metaEl = $('previewDetailMeta');
    if (metaEl) {
      metaEl.textContent =
        (regionTitle || regionId || '') +
        (lm.id ? ' · id: ' + lm.id : '') +
        ' · ' +
        coordsLabel(lm);
    }

    const photos = $('previewDetailPhotos');
    if (photos) {
      photos.innerHTML = '';
      const urls = collectLandmarkPhotoUrls(lm);
      if (!urls.length) {
        photos.innerHTML = '<p class="hint">Немає фото — додай thumbUri / galleryUris або завантаж у «Медіа».</p>';
      } else {
        urls.forEach(function (u) {
          const a = document.createElement('a');
          a.href = u;
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'preview-detail-photo';
          const img = document.createElement('img');
          img.src = u;
          img.alt = '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          a.appendChild(img);
          photos.appendChild(a);
        });
      }
    }

    const textHost = $('previewDetailText');
    if (textHost) {
      textHost.innerHTML = '';
      const st = lm.story && typeof lm.story === 'object' ? lm.story : {};
      const blocks = [
        { label: 'Короткий вступ', value: st.shortIntroUk || st.shortIntroEn || '' },
        { label: 'Опис (UK)', value: lm.descUk || '' },
        { label: 'Опис (EN)', value: lm.descEn || '' },
      ];
      let any = false;
      blocks.forEach(function (b) {
        const v = String(b.value || '').trim();
        if (!v) return;
        any = true;
        const wrap = document.createElement('div');
        wrap.className = 'preview-detail-text-block';
        const lab = document.createElement('div');
        lab.className = 'preview-detail-text-label';
        lab.textContent = b.label;
        const p = document.createElement('p');
        p.className = 'preview-detail-text-body';
        p.textContent = v;
        wrap.appendChild(lab);
        wrap.appendChild(p);
        textHost.appendChild(wrap);
      });
      if (!any) {
        textHost.innerHTML = '<p class="hint">Немає shortIntro / desc — заповни поля зліва або в сторінках нижче.</p>';
      }
    }

    renderPreviewStoryPagesEditor(getLandmarkStoryPages(lm));
  }

  function renderPreviewStoryPagesEditor(pages) {
    const host = $('previewStoryPages');
    if (!host) return;
    host.innerHTML = '';
    const list = Array.isArray(pages) && pages.length ? pages : [{ body: '', photoUri: '' }];
    list.forEach(function (page, i) {
      const card = document.createElement('div');
      card.className = 'preview-story-page';
      card.dataset.pageIndex = String(i);

      const head = document.createElement('div');
      head.className = 'preview-story-page-head';
      head.innerHTML = '<strong>Сторінка ' + (i + 1) + '</strong>';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'btn btn-ghost btn-compact';
      rm.textContent = 'Прибрати';
      rm.addEventListener('click', function () {
        card.remove();
        renumberPreviewStoryPages();
      });
      head.appendChild(rm);

      const bodyLabel = document.createElement('label');
      bodyLabel.className = 'field';
      bodyLabel.innerHTML = '<span class="field-label">Текст</span>';
      const bodyTa = document.createElement('textarea');
      bodyTa.className = 'field-input field-textarea preview-story-body';
      bodyTa.rows = 5;
      bodyTa.value = page.body || '';
      bodyLabel.appendChild(bodyTa);

      const photoLabel = document.createElement('label');
      photoLabel.className = 'field';
      photoLabel.innerHTML = '<span class="field-label">Фото сторінки (HTTPS URL)</span>';
      const photoIn = document.createElement('input');
      photoIn.type = 'url';
      photoIn.className = 'field-input preview-story-photo';
      photoIn.placeholder = 'https://…';
      photoIn.value = page.photoUri || '';
      photoLabel.appendChild(photoIn);

      let thumb = null;
      if (page.photoUri) {
        thumb = document.createElement('img');
        thumb.className = 'preview-story-thumb';
        thumb.src = page.photoUri;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.referrerPolicy = 'no-referrer';
      }

      card.appendChild(head);
      card.appendChild(bodyLabel);
      card.appendChild(photoLabel);
      if (thumb) card.appendChild(thumb);
      host.appendChild(card);
    });
  }

  function renumberPreviewStoryPages() {
    const host = $('previewStoryPages');
    if (!host) return;
    Array.from(host.querySelectorAll('.preview-story-page')).forEach(function (card, i) {
      const strong = card.querySelector('.preview-story-page-head strong');
      if (strong) strong.textContent = 'Сторінка ' + (i + 1);
      card.dataset.pageIndex = String(i);
    });
  }

  function readPreviewStoryPagesFromEditor() {
    const host = $('previewStoryPages');
    if (!host) return [];
    return Array.from(host.querySelectorAll('.preview-story-page')).map(function (card) {
      const body = (card.querySelector('.preview-story-body') && card.querySelector('.preview-story-body').value) || '';
      const photoUri =
        (card.querySelector('.preview-story-photo') && card.querySelector('.preview-story-photo').value) || '';
      return { body: String(body).trim(), photoUri: String(photoUri).trim() };
    }).filter(function (p) {
      return p.body || p.photoUri;
    });
  }

  function fillPreviewEditForm(regionId, index) {
    let bundle;
    try {
      bundle = JSON.parse(($('jsonEditor') && $('jsonEditor').value) || 'null');
    } catch {
      return;
    }
    const region = bundle.regions && bundle.regions[regionId];
    const lm = region && region.landmarks && region.landmarks[index];
    if (!lm || typeof lm !== 'object') return;

    const setVal = (id, v) => {
      const el = $(id);
      if (el) el.value = v != null ? String(v) : '';
    };
    setVal('previewEditTitleUk', lm.titleUk || '');
    setVal('previewEditTitleEn', lm.titleEn || '');
    setVal('previewEditLat', Number.isFinite(Number(lm.lat)) ? lm.lat : '');
    setVal('previewEditLng', Number.isFinite(Number(lm.lng)) ? lm.lng : '');
    setVal('previewEditThumbUri', lm.thumbUri || '');
    const gallery = Array.isArray(lm.galleryUris) ? lm.galleryUris.filter(Boolean) : [];
    setVal('previewEditGallery', gallery.join('\n'));
    const st = lm.story && typeof lm.story === 'object' ? lm.story : {};
    setVal('previewEditShortIntro', st.shortIntroUk || '');
    setVal('previewEditDescUk', lm.descUk || '');
    setVal('previewEditDescEn', lm.descEn || '');

    const h = $('previewEditHeading');
    if (h) h.textContent = lm.titleUk || lm.titleEn || lm.id || 'Пам’ятка';
    const hint = $('previewEditHint');
    if (hint) hint.textContent = regionId + ' · № у масиві ' + index + (lm.id ? ' · id: ' + lm.id : '');
    const panel = $('previewEditPanel');
    if (panel) {
      panel.classList.remove('hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderPreviewDetail(lm, region.titleUk || region.titleEn || regionId, regionId);
  }

  function clearPreviewSelection() {
    previewSelection = null;
    const panel = $('previewEditPanel');
    if (panel) panel.classList.add('hidden');
    renderPreviewDetail(null);
    document.querySelectorAll('.preview-card').forEach((el) => {
      el.classList.remove('preview-card--active');
    });
    document.querySelectorAll('.preview-landmark-item').forEach((el) => {
      el.classList.remove('preview-landmark-item--active');
    });
  }

  function selectPreviewLandmark(regionId, index) {
    previewSelection = { regionId, index };
    fillPreviewEditForm(regionId, index);
    highlightPreviewSelection(regionId, index);
    scrollPreviewCardIntoView(regionId, index);
  }

  function renderPreviewLandmarkList() {
    const wrap = $('previewLandmarkList');
    if (!wrap) return;
    wrap.innerHTML = '';
    const q = (($('previewSearch') && $('previewSearch').value) || '').trim().toLowerCase();
    const filtered = cachedPreviewRows.filter((r) => {
      if (!q) return true;
      const blob = [
        r.regionTitle,
        r.regionId,
        r.lm.titleUk,
        r.lm.titleEn,
        r.lm.id,
        String(r.lm.lat ?? ''),
        String(r.lm.lng ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });

    filtered.forEach(({ regionId, regionTitle, index, lm }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preview-landmark-item';
      btn.dataset.regionId = regionId;
      btn.dataset.landmarkIndex = String(index);
      const line1 = document.createElement('span');
      line1.className = 'preview-landmark-item-line';
      line1.textContent = lm.titleUk || lm.titleEn || lm.id || 'Без назви';
      const line2 = document.createElement('span');
      line2.className = 'preview-landmark-item-meta';
      line2.textContent = regionTitle + (lm.id ? ' · ' + lm.id : '');
      btn.appendChild(line1);
      btn.appendChild(line2);
      if (
        previewSelection &&
        previewSelection.regionId === regionId &&
        previewSelection.index === index
      ) {
        btn.classList.add('preview-landmark-item--active');
      }
      btn.addEventListener('click', () => selectPreviewLandmark(regionId, index));
      wrap.appendChild(btn);
    });
  }

  function savePreviewLandmarkEdits(opts) {
    const publish = !!(opts && opts.publish);
    if (!previewSelection) {
      toast('Оберіть пам’ятку зі списку', 'info');
      return Promise.resolve(false);
    }
    const { regionId, index } = previewSelection;
    let bundle;
    try {
      bundle = JSON.parse($('jsonEditor').value);
    } catch (e) {
      toast('JSON не парситься: ' + (e.message || e), 'err');
      return Promise.resolve(false);
    }
    const lm =
      bundle.regions &&
      bundle.regions[regionId] &&
      bundle.regions[regionId].landmarks &&
      bundle.regions[regionId].landmarks[index];
    if (!lm || typeof lm !== 'object') {
      toast('Пам’ятку не знайдено — оновіть перегляд', 'err');
      return Promise.resolve(false);
    }

    lm.titleUk = ($('previewEditTitleUk') && $('previewEditTitleUk').value || '').trim();
    lm.titleEn = ($('previewEditTitleEn') && $('previewEditTitleEn').value || '').trim();
    const lat = parseFloat(String(($('previewEditLat') && $('previewEditLat').value) || '').replace(',', '.'));
    const lng = parseFloat(String(($('previewEditLng') && $('previewEditLng').value) || '').replace(',', '.'));
    if (Number.isFinite(lat)) lm.lat = lat;
    else delete lm.lat;
    if (Number.isFinite(lng)) lm.lng = lng;
    else delete lm.lng;

    const thumb = (($('previewEditThumbUri') && $('previewEditThumbUri').value) || '').trim();
    if (thumb) lm.thumbUri = thumb;
    else delete lm.thumbUri;

    const galleryRaw = (($('previewEditGallery') && $('previewEditGallery').value) || '').trim();
    const gallery = galleryRaw
      ? galleryRaw.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean)
      : [];
    if (gallery.length) lm.galleryUris = gallery;
    else delete lm.galleryUris;

    const intro = (($('previewEditShortIntro') && $('previewEditShortIntro').value) || '').trim();
    lm.story = lm.story && typeof lm.story === 'object' ? lm.story : {};
    if (intro) lm.story.shortIntroUk = intro;
    else delete lm.story.shortIntroUk;

    const descUk = (($('previewEditDescUk') && $('previewEditDescUk').value) || '').trim();
    const descEn = (($('previewEditDescEn') && $('previewEditDescEn').value) || '').trim();
    if (descUk) lm.descUk = descUk;
    else delete lm.descUk;
    if (descEn) lm.descEn = descEn;
    else delete lm.descEn;

    const pages = readPreviewStoryPagesFromEditor();
    if (pages.length) {
      lm.story.introPagesUk = pages.map(function (p) {
        const out = { body: p.body };
        if (p.photoUri) out.photoUri = p.photoUri;
        return out;
      });
      if (pages[0] && pages[0].body) lm.story.introPage1Uk = pages[0].body;
      else delete lm.story.introPage1Uk;
    } else {
      delete lm.story.introPagesUk;
      delete lm.story.introPage1Uk;
    }

    $('jsonEditor').value = JSON.stringify(bundle, null, 2);
    updateEditorMeta();
    scheduleLandmarkPreview();
    toast(publish ? 'Збережено в JSON…' : 'Зміни записані в JSON', publish ? 'info' : 'ok');

    if (!publish) return Promise.resolve(true);
    return publishLandmarkBundle(bundle);
  }

  function publishLandmarkBundle(bundle) {
    return api('/api/admin/landmark-content/bundle', {
      method: 'PUT',
      body: JSON.stringify(bundle),
    })
      .then(function () {
        toast('Опубліковано для застосунку', 'ok');
        return true;
      })
      .catch(function (e) {
        toast((e && e.message) || 'publish_failed', 'err');
        return false;
      });
  }

  function deletePreviewLandmark() {
    if (!previewSelection) {
      toast('Оберіть пам’ятку зі списку', 'info');
      return;
    }
    const { regionId, index } = previewSelection;
    let bundle;
    try {
      bundle = JSON.parse($('jsonEditor').value);
    } catch (e) {
      toast('JSON не парситься: ' + (e.message || e), 'err');
      return;
    }
    const region = bundle.regions && bundle.regions[regionId];
    const lm = region && region.landmarks && region.landmarks[index];
    const name = (lm && (lm.titleUk || lm.titleEn || lm.id)) || 'цю пам’ятку';
    if (!confirm('Видалити «' + name + '» з бандла?')) return;
    if (!region || !Array.isArray(region.landmarks)) {
      toast('Пам’ятку не знайдено', 'err');
      return;
    }
    region.landmarks.splice(index, 1);
    $('jsonEditor').value = JSON.stringify(bundle, null, 2);
    updateEditorMeta();
    clearPreviewSelection();
    scheduleLandmarkPreview();
    const alsoPublish = confirm('Видалено з JSON. Опублікувати бандл зараз (щоб зникло в застосунку)?');
    if (alsoPublish) {
      void publishLandmarkBundle(bundle);
    } else {
      toast('Лише в редакторі. Збережи бандл пізніше, щоб застосунок оновився.', 'info');
    }
  }

  function renderLandmarkPreview() {
    const grid = $('previewGrid');
    const meta = $('previewMeta');
    if (!grid) return;

    grid.innerHTML = '';
    let bundle;
    try {
      bundle = JSON.parse(($('jsonEditor') && $('jsonEditor').value) || 'null');
    } catch (e) {
      cachedPreviewRows = [];
      renderPreviewLandmarkList();
      clearPreviewSelection();
      const bn = $('previewEmptyBanner');
      if (bn) bn.classList.add('hidden');
      if (meta) meta.textContent = 'JSON у редакторі не парситься — виправте текст і повторіть.';
      const err = document.createElement('p');
      err.className = 'preview-empty preview-empty--err';
      err.textContent = 'Помилка: ' + (e.message || String(e));
      grid.appendChild(err);
      return;
    }

    const rows = flattenLandmarksFromBundle(bundle);
    cachedPreviewRows = rows;

    const previewBn = $('previewEmptyBanner');
    if (previewBn) previewBn.classList.toggle('hidden', rows.length > 0);

    if (meta) {
      meta.textContent = rows.length
        ? 'Пам’яток: ' + rows.length + '. Зліва — список і редагування; справа — прев’ю карток.'
        : 'Немає записів у regions[].landmarks[] або bundle порожній.';
    }

    rows.forEach(({ regionTitle, lm, regionId, index }) => {
      const urls = collectLandmarkPhotoUrls(lm);

      const card = document.createElement('article');
      card.className = 'preview-card';
      card.dataset.regionId = regionId;
      card.dataset.landmarkIndex = String(index);

      const thumb = document.createElement('div');
      thumb.className = 'preview-card-thumb';
      if (urls[0]) {
        const img = document.createElement('img');
        img.src = urls[0];
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        thumb.appendChild(img);
      } else {
        thumb.classList.add('preview-card-thumb--empty');
        const ph = document.createElement('span');
        ph.className = 'preview-card-ph';
        ph.textContent = lm.thumbRef ? 'thumbRef: ' + String(lm.thumbRef) : 'немає HTTPS-фото в JSON';
        thumb.appendChild(ph);
      }

      const body = document.createElement('div');
      body.className = 'preview-card-body';

      const title = document.createElement('h3');
      title.className = 'preview-card-title';
      title.textContent = lm.titleUk || lm.titleEn || lm.id || 'Без назви';

      const intro = document.createElement('p');
      intro.className = 'preview-card-intro';
      const shortUk = lm.story && lm.story.shortIntroUk;
      const shortEn = lm.story && lm.story.shortIntroEn;
      intro.textContent =
        truncateText(shortUk || shortEn || lm.descUk || lm.descEn || '', 220) ||
        'Додайте story.shortIntroUk або descUk — тут з’явиться короткий текст як у застосунку.';

      const metaRow = document.createElement('div');
      metaRow.className = 'preview-card-meta';
      const regSpan = document.createElement('span');
      regSpan.textContent = regionTitle;
      const cooSpan = document.createElement('span');
      cooSpan.textContent = coordsLabel(lm);
      metaRow.appendChild(regSpan);
      metaRow.appendChild(cooSpan);

      body.appendChild(title);
      body.appendChild(intro);
      body.appendChild(metaRow);

      const urlsEl = document.createElement('div');
      urlsEl.className = 'preview-card-urls';

      if (urls.length) {
        urls.slice(0, 6).forEach((u, i) => {
          const row = document.createElement('div');
          row.className = 'preview-url-row';
          const snip = document.createElement('span');
          snip.className = 'preview-url-snippet';
          snip.title = u;
          snip.textContent = i + 1 + '. ' + u;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-secondary btn-compact preview-url-copy';
          btn.textContent = 'Копіювати';
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(u).then(
              () => toast('URL у буфері', 'ok'),
              () => toast(u, 'info'),
            );
          });
          row.appendChild(snip);
          row.appendChild(btn);
          urlsEl.appendChild(row);
        });
      } else {
        const hint = document.createElement('p');
        hint.className = 'hint preview-empty';
        hint.style.margin = '0';
        hint.style.padding = '0';
        hint.textContent =
          'Додайте HTTPS-посилання: thumbUri, galleryUris[], або story.photoFact.bgUri тощо. Завантажте файл у вкладці «Медіа» й вставте URL сюди в JSON.';
        urlsEl.appendChild(hint);
      }

      card.appendChild(thumb);
      card.appendChild(body);
      card.appendChild(urlsEl);
      grid.appendChild(card);
    });

    if (!rows.length && bundle && typeof bundle === 'object') {
      const empty = document.createElement('p');
      empty.className = 'preview-empty';
      empty.textContent = 'У regions[].landmarks[] поки порожньо — додайте пам’ятки в редакторі бандла.';
      grid.appendChild(empty);
    }

    renderPreviewLandmarkList();
    if (previewSelection) {
      const { regionId, index } = previewSelection;
      const ok = rows.some((r) => r.regionId === regionId && r.index === index);
      if (ok) {
        highlightPreviewSelection(regionId, index);
        fillPreviewEditForm(regionId, index);
      } else {
        clearPreviewSelection();
      }
    }
  }

  function setTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.getAttribute('data-tab') === name;
      t.classList.toggle('tab-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const map = { ai: 'tabAi', bundle: 'tabBundle', preview: 'tabPreview', media: 'tabMedia', team: 'tabTeam' };
    Object.keys(map).forEach((k) => {
      const el = $(map[k]);
      if (el) el.classList.toggle('hidden', k !== name);
    });
    if (name === 'preview') renderLandmarkPreview();
    if (name === 'team') void loadAdminsList();
    if (name === 'ai') void loadAiHistory();
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.getAttribute('data-tab') || 'ai'));
  });

  $('btnLogin').addEventListener('click', async () => {
    showError($('loginError'), '');
    const email = ($('email') && $('email').value) || '';
    const password = ($('password') && $('password').value) || '';
    const b = apiBase();
    if (b) sessionStorage.setItem(storageKey, b);
    else sessionStorage.removeItem(storageKey);
    try {
      const base = b || '';
      const res = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError($('loginError'), (data && (data.code || data.message || data.error)) || 'login failed');
        return;
      }
      if (data.user && data.user.role !== 'admin') {
        showError($('loginError'), 'потрібен role=admin — попросіть існуючого адміна додати вашу пошту у вкладці «Команда»');
        return;
      }
      sessionStorage.setItem(tokenKey, data.access_token);
      if (data.refresh_token) sessionStorage.setItem(refreshKey, data.refresh_token);
      showMain(data.user);
      await loadEditor();
      await loadMedia();
      void loadAiHistory();
      toast('Вітаємо в CMS', 'ok');
    } catch (e) {
      showError($('loginError'), e.message || 'network error');
    }
  });

  async function completeCmsLogin(data) {
    if (!data || !data.access_token) throw new Error('login_failed');
    if (data.user && data.user.role !== 'admin') {
      throw new Error('not_admin');
    }
    sessionStorage.setItem(tokenKey, data.access_token);
    if (data.refresh_token) sessionStorage.setItem(refreshKey, data.refresh_token);
    showMain(data.user);
    await loadEditor();
    await loadMedia();
    void loadAiHistory();
    toast('Вітаємо в CMS', 'ok');
  }

  async function loginWithGoogleIdToken(idToken) {
    showError($('loginError'), '');
    const b = apiBase();
    if (b) sessionStorage.setItem(storageKey, b);
    else sessionStorage.removeItem(storageKey);
    const base = b || '';
    const res = await fetch(base + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data && (data.code || data.error || data.message)) || 'google_login_failed');
    }
    try {
      await completeCmsLogin(data);
    } catch (e) {
      if (e && e.message === 'not_admin') {
        showError(
          $('loginError'),
          'Цей Google-акаунт ще не адмін. Попросіть існуючого адміна додати вашу пошту у «Команда».',
        );
        return;
      }
      throw e;
    }
  }

  let googleClientId = null;
  let googleInitDone = false;

  async function fetchCmsConfig() {
    try {
      const base = apiBase() || '';
      const res = await fetch(base + '/api/app/cms-config', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.google_client_id) {
        googleClientId = String(data.google_client_id);
      }
    } catch {
      /* ignore */
    }
  }

  function onGoogleCredential(response) {
    const token = response && response.credential;
    if (!token) {
      showError($('loginError'), 'Google не повернув токен');
      return;
    }
    void loginWithGoogleIdToken(token).catch((e) => {
      showError($('loginError'), (e && e.message) || 'google_login_failed');
    });
  }

  function renderOfficialGoogleButton() {
    const host = $('googleBtnHost');
    if (!host || !(window.google && google.accounts && google.accounts.id)) return;
    host.hidden = false;
    host.innerHTML = '';
    const width = Math.min(360, (host.parentElement && host.parentElement.clientWidth) || 320);
    google.accounts.id.renderButton(host, {
      theme: 'outline',
      size: 'large',
      width: width,
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'uk',
    });
  }

  function initGoogleSignIn() {
    if (googleInitDone) return;
    if (!googleClientId) {
      showError(
        $('loginError'),
        'Немає Google Client ID на сервері. Додайте CMS_GOOGLE_CLIENT_ID у backend/.env',
      );
      const hint = $('loginGoogleHint');
      if (hint) hint.textContent = 'Google Sign-In недоступний: немає Client ID на сервері.';
      return;
    }
    if (!(window.google && google.accounts && google.accounts.id)) return;
    googleInitDone = true;
    try {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: onGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: false,
      });
    } catch (e) {
      showError($('loginError'), (e && e.message) || 'google_init_failed');
      return;
    }

    renderOfficialGoogleButton();

    const hint = $('loginGoogleHint');
    if (hint && googleClientId) {
      hint.textContent =
        'Адміни: Google з дозволеною поштою, або email + пароль. Client ID: ' +
        googleClientId.slice(0, 22) +
        '… · origins: http://localhost:3000';
    }
  }

  async function loadAdminsList() {
    const list = $('adminsList');
    const empty = $('adminsEmpty');
    showError($('teamError'), '');
    if (!list) return;
    try {
      const data = await api('/api/admin/admins', { method: 'GET' });
      const admins = Array.isArray(data && data.admins) ? data.admins : [];
      list.innerHTML = '';
      if (!admins.length) {
        if (empty) empty.classList.remove('hidden');
        return;
      }
      if (empty) empty.classList.add('hidden');
      const me = safeJsonParse(sessionStorage.getItem(userKey));
      const meEmail = (me && me.email ? String(me.email) : '').toLowerCase();
      admins.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'admin-row';
        const left = document.createElement('div');
        left.className = 'admin-row-main';
        const emailEl = document.createElement('div');
        emailEl.className = 'admin-row-email';
        emailEl.textContent = a.email || '';
        const meta = document.createElement('div');
        meta.className = 'admin-row-meta';
        meta.textContent =
          (a.auth_provider ? a.auth_provider + ' · ' : '') +
          (a.status || 'active') +
          (a.display_name ? ' · ' + a.display_name : '');
        left.appendChild(emailEl);
        left.appendChild(meta);
        row.appendChild(left);
        const emailLower = String(a.email || '').toLowerCase();
        if (emailLower && emailLower !== meEmail) {
          const revoke = document.createElement('button');
          revoke.type = 'button';
          revoke.className = 'btn btn-ghost btn-compact';
          revoke.textContent = 'Забрати доступ';
          revoke.addEventListener('click', async () => {
            if (!window.confirm('Забрати admin у ' + a.email + '?')) return;
            try {
              await api('/api/admin/admins/revoke', {
                method: 'POST',
                body: JSON.stringify({ email: a.email }),
              });
              toast('Доступ знято', 'ok');
              await loadAdminsList();
            } catch (e) {
              showError($('teamError'), e.message || 'revoke_failed');
              toast(e.message || 'Помилка', 'err');
            }
          });
          row.appendChild(revoke);
        } else {
          const you = document.createElement('span');
          you.className = 'pill';
          you.textContent = 'ви';
          row.appendChild(you);
        }
        list.appendChild(row);
      });
    } catch (e) {
      showError($('teamError'), e.message || 'load_failed');
    }
  }

  const btnGrantAdmin = $('btnGrantAdmin');
  if (btnGrantAdmin) {
    btnGrantAdmin.addEventListener('click', async () => {
      showError($('teamError'), '');
      const email = (($('adminGrantEmail') && $('adminGrantEmail').value) || '').trim();
      if (!email) {
        showError($('teamError'), 'Вкажіть email');
        return;
      }
      try {
        await api('/api/admin/admins/grant', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        if ($('adminGrantEmail')) $('adminGrantEmail').value = '';
        toast('Адміна додано: ' + email, 'ok');
        await loadAdminsList();
      } catch (e) {
        showError($('teamError'), e.message || 'grant_failed');
        toast(e.message || 'Помилка', 'err');
      }
    });
  }

  void fetchCmsConfig().then(() => {
    initGoogleSignIn();
    // GIS script may load after us
    window.addEventListener('load', initGoogleSignIn);
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      initGoogleSignIn();
      if (googleInitDone || tries > 40) clearInterval(t);
    }, 250);
  });

  $('btnSave').addEventListener('click', async () => {
    showError($('mainError'), '');
    let obj;
    try {
      obj = parseEditorJson();
    } catch (e) {
      showError($('mainError'), 'Невалідний JSON: ' + (e.message || e));
      toast('JSON не парситься', 'err');
      return;
    }
    try {
      const resp = await api('/api/admin/landmark-content/bundle', {
        method: 'PUT',
        body: JSON.stringify(obj),
      });
      toast('Збережено на сервері', 'ok');
      const fs = resp && resp.firestore;
      if (fs && fs.status === 'published') {
        toast(`Опубліковано в Firestore: ${fs.written} локацій`, 'ok');
      } else if (fs && fs.status === 'empty') {
        toast('Збережено, але в бандлі немає валідних локацій для Firestore', 'info');
      } else if (fs && fs.status === 'skipped' && fs.reason === 'no_admin') {
        toast('Збережено локально. Firestore не налаштовано (FIREBASE_SERVICE_ACCOUNT_*)', 'info');
      } else if (fs && fs.status === 'skipped' && fs.reason === 'skip_flag') {
        toast('Збережено. Бандл містить _skip — у Firestore не публікуємо', 'info');
      } else if (fs && fs.status === 'error') {
        toast('Збережено локально, але Firestore: ' + (fs.message || 'помилка'), 'err');
      }
      updateEditorMeta();
    } catch (e) {
      showError($('mainError'), e.message || 'save failed');
      toast(e.message || 'Помилка збереження', 'err');
    }
  });

  $('btnReload').addEventListener('click', async () => {
    showError($('mainError'), '');
    try {
      await loadEditor();
      await loadMedia();
      toast('Оновлено з сервера', 'ok');
    } catch (e) {
      showError($('mainError'), e.message || 'reload failed');
      toast(e.message || 'Помилка', 'err');
    }
  });

  $('btnExport').addEventListener('click', () => {
    let text;
    try {
      const o = parseEditorJson();
      text = JSON.stringify(o, null, 2);
    } catch (e) {
      toast('Спочатку виправте JSON', 'err');
      return;
    }
    const iso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJson('kraina_landmark_bundle_' + iso + '.json', text);
    toast('Файл завантажено', 'ok');
  });

  $('btnImportFile').addEventListener('click', () => $('importJsonFile') && $('importJsonFile').click());

  $('importJsonFile').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object');
        const ed = $('jsonEditor');
        if (ed && ed.value.trim() && !confirm('Замінити поточний вміст редактора імпортом?')) return;
        if (ed) ed.value = JSON.stringify(o, null, 2);
        updateEditorMeta();
        scheduleLandmarkPreview();
        toast('Імпорт у редактор', 'ok');
      } catch (e) {
        toast('Файл не JSON-об’єкт: ' + (e.message || e), 'err');
      }
    };
    reader.readAsText(f, 'utf-8');
  });

  $('btnFormat').addEventListener('click', () => {
    try {
      const o = parseEditorJson();
      $('jsonEditor').value = JSON.stringify(o, null, 2);
      updateEditorMeta();
      scheduleLandmarkPreview();
      toast('Відформатовано', 'ok');
    } catch (e) {
      toast('Невалідний JSON', 'err');
    }
  });

  $('btnValidate').addEventListener('click', () => {
    try {
      const o = parseEditorJson();
      if (!o.regions || typeof o.regions !== 'object') {
        const looksLikeSingleLandmark =
          o &&
          typeof o === 'object' &&
          !Array.isArray(o) &&
          Number.isFinite(Number(o.lat)) &&
          Number.isFinite(Number(o.lng)) &&
          (typeof o.titleUk === 'string' || typeof o.titleEn === 'string') &&
          !('regions' in o);
        toast(
          looksLikeSingleLandmark
            ? 'Це одна пам’ятка без бандла: додайте корінь з regions.{місто}.landmarks[] (як у застосунку), не лише об’єкт пам’ятки.'
            : 'У корені JSON має бути об’єкт regions.',
          'err',
        );
        return;
      }
      const n = Object.keys(o.regions).length;
      toast('Валідний JSON · регіонів: ' + n, 'ok');
      updateEditorMeta();
    } catch (e) {
      toast('Помилка: ' + (e.message || e), 'err');
    }
  });

  function refreshMediaFileLabel() {
    const input = $('fileInput');
    const el = document.querySelector('.file-pick-ui');
    if (!el || !input) return;
    const n = input.files ? input.files.length : 0;
    if (!n) {
      el.textContent = 'Обрати файли…';
      return;
    }
    if (n === 1) {
      el.textContent = input.files[0].name;
      return;
    }
    el.textContent = n + ' файлів обрано';
  }

  $('btnUpload').addEventListener('click', async () => {
    const input = $('fileInput');
    const raw = input && input.files ? Array.from(input.files) : [];
    const imageFiles = raw.filter((f) => /^image\//i.test(f.type));
    const out = $('lastUpload');
    if (out) out.textContent = '';

    if (!imageFiles.length) {
      toast(raw.length ? 'Лише зображення (JPEG, PNG, WebP, GIF)' : 'Оберіть хоча б один файл', 'err');
      return;
    }

    const MAX_BATCH = 60;
    const batch = imageFiles.slice(0, MAX_BATCH);
    if (imageFiles.length > MAX_BATCH) {
      toast('За один раз — до ' + MAX_BATCH + ' файлів; решту завантажте повторно', 'info');
    }

    const btnUp = $('btnUpload');
    if (btnUp) btnUp.disabled = true;

    const base = apiBase();
    const token = sessionStorage.getItem(tokenKey);
    const urls = [];

    try {
      for (let i = 0; i < batch.length; i++) {
        const form = new FormData();
        form.append('file', batch[i]);
        const res = await fetch((base || '') + '/api/admin/landmark-content/media', {
          method: 'POST',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          body: form,
        });
        if (res.status === 401) {
          showLogin();
          toast('Сесію завершено — увійдіть знову', 'err');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(
            (data && (data.code || data.message)) || 'Помилка: «' + (batch[i].name || 'файл') + '»',
            'err',
          );
          return;
        }
        if (data.url) urls.push(data.url);
      }

      if (out) out.textContent = urls.join('\n');
      try {
        await navigator.clipboard.writeText(urls.join('\n'));
        toast(
          urls.length === 1
            ? 'Завантажено · URL у буфері'
            : 'Завантажено ' + urls.length + ' файлів · усі URL у буфері',
          'ok',
        );
      } catch {
        toast(urls.length === 1 ? 'Завантажено' : 'Завантажено ' + urls.length + ' файлів', 'ok');
      }
      loadMedia();
    } catch (e) {
      toast(e.message || 'Мережа або сервер', 'err');
    } finally {
      if (btnUp) btnUp.disabled = false;
    }
  });

  $('btnLogout').addEventListener('click', () => {
    showLogin();
    toast('Вихід', 'info');
  });

  const btnPrev = $('btnPreviewRefresh');
  if (btnPrev) btnPrev.addEventListener('click', () => renderLandmarkPreview());

  const btnPreviewExample = $('btnPreviewLoadExample');
  if (btnPreviewExample) {
    btnPreviewExample.addEventListener('click', () => {
      if (
        !confirm(
          'Замінити текст у редакторі «Бандл локацій» на приклад (Київ + одна пам’ятка)? Незбережені зміни в редакторі будуть втрачені.',
        )
      ) {
        return;
      }
      const ed = $('jsonEditor');
      if (!ed) return;
      ed.value = JSON.stringify(DEFAULT_BUNDLE, null, 2);
      updateEditorMeta();
      scheduleLandmarkPreview();
      toast('Приклад у редакторі — натисніть «Зберегти», щоб записати на сервер', 'ok');
    });
  }

  const previewGridEl = $('previewGrid');
  if (previewGridEl) {
    previewGridEl.addEventListener('click', (ev) => {
      if (ev.target.closest('button') || ev.target.closest('a')) return;
      const card = ev.target.closest('.preview-card');
      if (!card || card.dataset.regionId == null || card.dataset.landmarkIndex == null) return;
      selectPreviewLandmark(card.dataset.regionId, Number(card.dataset.landmarkIndex));
    });
  }

  let previewSearchTimer = null;
  const previewSearchEl = $('previewSearch');
  if (previewSearchEl) {
    previewSearchEl.addEventListener('input', () => {
      clearTimeout(previewSearchTimer);
      previewSearchTimer = setTimeout(renderPreviewLandmarkList, 180);
    });
  }

  const btnPreviewSaveLm = $('btnPreviewSaveLandmark');
  if (btnPreviewSaveLm) {
    btnPreviewSaveLm.addEventListener('click', () => {
      void savePreviewLandmarkEdits({ publish: false });
    });
  }
  const btnPreviewPublishLm = $('btnPreviewPublishLandmark');
  if (btnPreviewPublishLm) {
    btnPreviewPublishLm.addEventListener('click', () => {
      void savePreviewLandmarkEdits({ publish: true });
    });
  }
  const btnPreviewDeleteLm = $('btnPreviewDeleteLandmark');
  if (btnPreviewDeleteLm) {
    btnPreviewDeleteLm.addEventListener('click', () => {
      deletePreviewLandmark();
    });
  }
  const btnPreviewClearLm = $('btnPreviewClearLandmark');
  if (btnPreviewClearLm) btnPreviewClearLm.addEventListener('click', clearPreviewSelection);
  const btnPreviewAddStoryPage = $('btnPreviewAddStoryPage');
  if (btnPreviewAddStoryPage) {
    btnPreviewAddStoryPage.addEventListener('click', () => {
      const pages = readPreviewStoryPagesFromEditor();
      pages.push({ body: '', photoUri: '' });
      renderPreviewStoryPagesEditor(pages);
    });
  }

  $('jsonEditor').addEventListener('input', () => {
    updateEditorMeta();
    scheduleLandmarkPreview();
  });

  document.addEventListener('keydown', (e) => {
    const isS = e.key === 's' || e.key === 'S';
    if ((e.ctrlKey || e.metaKey) && isS) {
      const main = $('mainPanel');
      if (main && !main.classList.contains('hidden')) {
        e.preventDefault();
        $('btnSave').click();
      }
    }
  });

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizeTextKey(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .replace(/[\s'’`".,;:()\-_/\\]+/g, '');
  }

  function slugifyRegionName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  var CANONICAL_CITIES = [
    { id: 'kyiv', titleUk: 'Київ', titleEn: 'Kyiv', aliases: ['київ', 'kyiv', 'kiev', 'киев'] },
    { id: 'lviv', titleUk: 'Львів', titleEn: 'Lviv', aliases: ['львів', 'lviv', 'lwow', 'львов'] },
    { id: 'odesa', titleUk: 'Одеса', titleEn: 'Odesa', aliases: ['одеса', 'odesa', 'odessa'] },
    { id: 'kharkiv', titleUk: 'Харків', titleEn: 'Kharkiv', aliases: ['харків', 'kharkiv', 'kharkov'] },
    { id: 'dnipro', titleUk: 'Дніпро', titleEn: 'Dnipro', aliases: ['дніпро', 'dnipro'] },
    { id: 'warsaw', titleUk: 'Варшава', titleEn: 'Warsaw', aliases: ['варшава', 'warsaw', 'warszawa'] },
    { id: 'berlin', titleUk: 'Берлін', titleEn: 'Berlin', aliases: ['берлін', 'berlin'] },
    { id: 'paris', titleUk: 'Париж', titleEn: 'Paris', aliases: ['париж', 'paris'] },
    { id: 'rome', titleUk: 'Рим', titleEn: 'Rome', aliases: ['рим', 'rome', 'roma'] },
    { id: 'madrid', titleUk: 'Мадрид', titleEn: 'Madrid', aliases: ['мадрид', 'madrid'] },
    { id: 'amsterdam', titleUk: 'Амстердам', titleEn: 'Amsterdam', aliases: ['амстердам', 'amsterdam'] },
    { id: 'prague', titleUk: 'Прага', titleEn: 'Prague', aliases: ['прага', 'prague', 'praha'] },
    { id: 'vienna', titleUk: 'Відень', titleEn: 'Vienna', aliases: ['відень', 'vienna', 'wien'] },
    { id: 'budapest', titleUk: 'Будапешт', titleEn: 'Budapest', aliases: ['будапешт', 'budapest'] },
    { id: 'london', titleUk: 'Лондон', titleEn: 'London', aliases: ['лондон', 'london'] },
    { id: 'lisbon', titleUk: 'Лісабон', titleEn: 'Lisbon', aliases: ['лісабон', 'lisbon', 'lisboa'] },
    { id: 'brussels', titleUk: 'Брюссель', titleEn: 'Brussels', aliases: ['брюссель', 'brussels'] },
    { id: 'bucharest', titleUk: 'Бухарест', titleEn: 'Bucharest', aliases: ['бухарест', 'bucharest'] },
    { id: 'vilnius', titleUk: 'Вільнюс', titleEn: 'Vilnius', aliases: ['вільнюс', 'vilnius'] },
    { id: 'riga', titleUk: 'Рига', titleEn: 'Riga', aliases: ['рига', 'riga'] },
    { id: 'tallinn', titleUk: 'Таллінн', titleEn: 'Tallinn', aliases: ['таллінн', 'tallinn'] },
    { id: 'helsinki', titleUk: 'Гельсінкі', titleEn: 'Helsinki', aliases: ['гельсінкі', 'helsinki'] },
    { id: 'stockholm', titleUk: 'Стокгольм', titleEn: 'Stockholm', aliases: ['стокгольм', 'stockholm'] },
    { id: 'oslo', titleUk: 'Осло', titleEn: 'Oslo', aliases: ['осло', 'oslo'] },
    { id: 'copenhagen', titleUk: 'Копенгаген', titleEn: 'Copenhagen', aliases: ['копенгаген', 'copenhagen'] },
    { id: 'athens', titleUk: 'Афіни', titleEn: 'Athens', aliases: ['афіни', 'athens'] },
    { id: 'sofia', titleUk: 'Софія', titleEn: 'Sofia', aliases: ['софія', 'sofia'] },
    { id: 'zagreb', titleUk: 'Загреб', titleEn: 'Zagreb', aliases: ['загреб', 'zagreb'] },
    { id: 'belgrade', titleUk: 'Белград', titleEn: 'Belgrade', aliases: ['белград', 'belgrade'] },
    { id: 'yerevan', titleUk: 'Єреван', titleEn: 'Yerevan', aliases: ['єреван', 'yerevan'] },
  ];

  function resolveCanonicalCity(input) {
    var keys = [input && input.regionId, input && input.cityUk, input && input.cityEn, input && input.city]
      .map(function (x) { return normalizeTextKey(x); })
      .filter(Boolean);
    for (var i = 0; i < CANONICAL_CITIES.length; i += 1) {
      var c = CANONICAL_CITIES[i];
      var aliases = [c.id, c.titleUk, c.titleEn].concat(c.aliases || []).map(normalizeTextKey);
      for (var k = 0; k < keys.length; k += 1) {
        if (aliases.indexOf(keys[k]) >= 0) {
          return { id: c.id, titleUk: c.titleUk, titleEn: c.titleEn };
        }
      }
    }
    var en = String((input && (input.cityEn || input.city || input.cityUk)) || '').trim();
    var uk = String((input && (input.cityUk || input.city || input.cityEn)) || '').trim();
    var id = slugifyRegionName(en) || slugifyRegionName(uk) || String((input && input.regionId) || '').trim();
    if (!id || /[^a-z0-9_]/.test(id)) id = 'city_' + Date.now().toString(36);
    return { id: id, titleUk: uk || en || id, titleEn: en || uk || id };
  }


  /** ISO + common UK/EN aliases for Europe catalog countries. */
  var AI_COUNTRY_ALIASES = {
    UA: ['UA', 'Ukraine', 'Україна', 'Ukraina'],
    PL: ['PL', 'Poland', 'Polska', 'Польща'],
    DE: ['DE', 'Germany', 'Deutschland', 'Німеччина'],
    FR: ['FR', 'France', 'Франція'],
    IT: ['IT', 'Italy', 'Italia', 'Італія'],
    ES: ['ES', 'Spain', 'España', 'Espana', 'Іспанія'],
    NL: ['NL', 'Netherlands', 'Nederland', 'Нідерланди', 'Holland'],
    RO: ['RO', 'Romania', 'România', 'Romania', 'Румунія'],
    LT: ['LT', 'Lithuania', 'Lietuva', 'Литва'],
    LV: ['LV', 'Latvia', 'Latvija', 'Латвія'],
    AM: ['AM', 'Armenia', 'Հայաստան', 'Вірменія'],
    PT: ['PT', 'Portugal', 'Португалія'],
    BE: ['BE', 'Belgium', 'België', 'Belgique', 'Belgien', 'Бельгія'],
    AT: ['AT', 'Austria', 'Österreich', 'Osterreich', 'Австрія'],
    CH: ['CH', 'Switzerland', 'Schweiz', 'Suisse', 'Svizzera', 'Швейцарія'],
    CZ: ['CZ', 'Czechia', 'Czech Republic', 'Česko', 'Cesko', 'Чехія'],
    SK: ['SK', 'Slovakia', 'Slovensko', 'Словаччина'],
    HU: ['HU', 'Hungary', 'Magyarország', 'Magyarorszag', 'Угорщина'],
    IE: ['IE', 'Ireland', 'Éire', 'Eire', 'Ірландія'],
    GB: ['GB', 'UK', 'United Kingdom', 'Britain', 'Great Britain', 'Велика Британія', 'Британія'],
    SE: ['SE', 'Sweden', 'Sverige', 'Швеція'],
    NO: ['NO', 'Norway', 'Norge', 'Норвегія'],
    DK: ['DK', 'Denmark', 'Danmark', 'Данія'],
    FI: ['FI', 'Finland', 'Suomi', 'Фінляндія'],
    IS: ['IS', 'Iceland', 'Ísland', 'Island', 'Ісландія'],
    EE: ['EE', 'Estonia', 'Eesti', 'Естонія'],
    GR: ['GR', 'Greece', 'Ελλάδα', 'Ellada', 'Греція'],
    BG: ['BG', 'Bulgaria', 'България', 'Bulgariya', 'Болгарія'],
    HR: ['HR', 'Croatia', 'Hrvatska', 'Хорватія'],
    SI: ['SI', 'Slovenia', 'Slovenija', 'Словенія'],
    RS: ['RS', 'Serbia', 'Србија', 'Srbija', 'Сербія'],
    BA: ['BA', 'Bosnia', 'Bosnia and Herzegovina', 'Bosna i Hercegovina', 'Боснія', 'Боснія і Герцеговина'],
    ME: ['ME', 'Montenegro', 'Crna Gora', 'Чорногорія'],
    MK: ['MK', 'North Macedonia', 'Macedonia', 'Северна Македонија', 'Північна Македонія', 'Македонія'],
    AL: ['AL', 'Albania', 'Shqipëria', 'Shqiperia', 'Албанія'],
    XK: ['XK', 'Kosovo', 'Kosova', 'Косово'],
    MD: ['MD', 'Moldova', 'Moldavia', 'Молдова'],
    LU: ['LU', 'Luxembourg', 'Lëtzebuerg', 'Letzebuerg', 'Люксембург'],
    MT: ['MT', 'Malta', 'Мальта'],
    CY: ['CY', 'Cyprus', 'Κύπρος', 'Kypros', 'Кіпр'],
    MC: ['MC', 'Monaco', 'Монако'],
    AD: ['AD', 'Andorra', 'Андорра'],
    LI: ['LI', 'Liechtenstein', 'Ліхтенштейн'],
    SM: ['SM', 'San Marino', 'Сан-Марино', 'Сан Марино'],
    VA: ['VA', 'Vatican', 'Vatican City', 'Città del Vaticano', 'Ватикан'],
  };

  var AI_COUNTRY_META = {
    UA: { uk: 'Україна', en: 'Ukraine' },
    PL: { uk: 'Польща', en: 'Poland' },
    DE: { uk: 'Німеччина', en: 'Germany' },
    FR: { uk: 'Франція', en: 'France' },
    IT: { uk: 'Італія', en: 'Italy' },
    ES: { uk: 'Іспанія', en: 'Spain' },
    NL: { uk: 'Нідерланди', en: 'Netherlands' },
    RO: { uk: 'Румунія', en: 'Romania' },
    LT: { uk: 'Литва', en: 'Lithuania' },
    LV: { uk: 'Латвія', en: 'Latvia' },
    AM: { uk: 'Вірменія', en: 'Armenia' },
    PT: { uk: 'Португалія', en: 'Portugal' },
    BE: { uk: 'Бельгія', en: 'Belgium' },
    AT: { uk: 'Австрія', en: 'Austria' },
    CH: { uk: 'Швейцарія', en: 'Switzerland' },
    CZ: { uk: 'Чехія', en: 'Czechia' },
    SK: { uk: 'Словаччина', en: 'Slovakia' },
    HU: { uk: 'Угорщина', en: 'Hungary' },
    IE: { uk: 'Ірландія', en: 'Ireland' },
    GB: { uk: 'Велика Британія', en: 'United Kingdom' },
    SE: { uk: 'Швеція', en: 'Sweden' },
    NO: { uk: 'Норвегія', en: 'Norway' },
    DK: { uk: 'Данія', en: 'Denmark' },
    FI: { uk: 'Фінляндія', en: 'Finland' },
    IS: { uk: 'Ісландія', en: 'Iceland' },
    EE: { uk: 'Естонія', en: 'Estonia' },
    GR: { uk: 'Греція', en: 'Greece' },
    BG: { uk: 'Болгарія', en: 'Bulgaria' },
    HR: { uk: 'Хорватія', en: 'Croatia' },
    SI: { uk: 'Словенія', en: 'Slovenia' },
    RS: { uk: 'Сербія', en: 'Serbia' },
    BA: { uk: 'Боснія і Герцеговина', en: 'Bosnia and Herzegovina' },
    ME: { uk: 'Чорногорія', en: 'Montenegro' },
    MK: { uk: 'Північна Македонія', en: 'North Macedonia' },
    AL: { uk: 'Албанія', en: 'Albania' },
    XK: { uk: 'Косово', en: 'Kosovo' },
    MD: { uk: 'Молдова', en: 'Moldova' },
    LU: { uk: 'Люксембург', en: 'Luxembourg' },
    MT: { uk: 'Мальта', en: 'Malta' },
    CY: { uk: 'Кіпр', en: 'Cyprus' },
    MC: { uk: 'Монако', en: 'Monaco' },
    AD: { uk: 'Андорра', en: 'Andorra' },
    LI: { uk: 'Ліхтенштейн', en: 'Liechtenstein' },
    SM: { uk: 'Сан-Марино', en: 'San Marino' },
    VA: { uk: 'Ватикан', en: 'Vatican City' },
  };

  function resolveCountryFromLabel(raw) {
    var label = String(raw || '').trim();
    if (!label) return null;
    var key = normalizeTextKey(label);
    var iso = label.toUpperCase();
    if (/^[A-Z]{2}$/.test(iso) && AI_COUNTRY_META[iso]) {
      var m = AI_COUNTRY_META[iso];
      return { countryId: iso, countryUk: m.uk, countryEn: m.en };
    }
    var ids = Object.keys(AI_COUNTRY_ALIASES);
    for (var i = 0; i < ids.length; i += 1) {
      var id = ids[i];
      var aliases = AI_COUNTRY_ALIASES[id] || [];
      for (var j = 0; j < aliases.length; j += 1) {
        if (normalizeTextKey(aliases[j]) === key) {
          var meta = AI_COUNTRY_META[id] || { uk: label, en: label };
          return { countryId: id, countryUk: meta.uk, countryEn: meta.en };
        }
      }
    }
    return { countryId: 'XX', countryUk: label, countryEn: label };
  }

  function parseLandmarkLine(line) {
    var cleaned = String(line || '')
      .replace(/^\d+[\).]\s*/, '')
      .trim();
    if (!cleaned || cleaned.length < 2) return null;
    var parts = cleaned.split(/\s+[—–-]\s+|\s+\|\s+/g).map(function (x) {
      return x.trim();
    }).filter(Boolean);
    return { name: parts[0] || cleaned, address: parts.slice(1).join(', ') };
  }

  function matchLabeledLine(line, labels) {
    var re = new RegExp('^(' + labels.join('|') + ')\\s*[:：\\-–—]\\s*(.+)$', 'i');
    var m = String(line || '').trim().match(re);
    return m ? String(m[2] || '').trim() : '';
  }

  /**
   * Freeform blocks:
   *   Країна: Україна
   *   Місто: Київ
   *   Софійський собор — вул. Володимирська, 24
   *   Золоті ворота
   *
   *   Країна: Польща
   *   Місто: Варшава
   *   ...
   * Also accepts bare ISO on its own line (UA / PL) before city.
   */
  function parseAiImportGroups(text) {
    var lines = String(text || '')
      .split(/\r?\n|;|•/g)
      .map(function (l) {
        return String(l || '').trim();
      });
    var groups = [];
    var cur = null;

    function ensureGroup() {
      if (!cur) {
        cur = {
          countryId: 'UA',
          countryUk: 'Україна',
          countryEn: 'Ukraine',
          cityUk: '',
          cityEn: '',
          regionId: '',
          items: [],
        };
      }
      return cur;
    }

    function pushGroup() {
      if (!cur) return;
      if (cur.items && cur.items.length) groups.push(cur);
      cur = null;
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (!line) {
        pushGroup();
        continue;
      }

      var countryVal = matchLabeledLine(line, [
        'країна',
        'страна',
        'country',
        'iso',
        'код',
        'код країни',
        'country code',
      ]);
      if (countryVal) {
        pushGroup();
        cur = ensureGroup();
        var resolved = resolveCountryFromLabel(countryVal);
        cur.countryId = resolved.countryId;
        cur.countryUk = resolved.countryUk;
        cur.countryEn = resolved.countryEn;
        continue;
      }

      var cityVal = matchLabeledLine(line, ['місто', 'город', 'city', 'місто uk', 'city en']);
      if (cityVal) {
        cur = ensureGroup();
        if (cur.items && cur.items.length) {
          var keepCountry = {
            countryId: cur.countryId,
            countryUk: cur.countryUk,
            countryEn: cur.countryEn,
          };
          pushGroup();
          cur = ensureGroup();
          cur.countryId = keepCountry.countryId;
          cur.countryUk = keepCountry.countryUk;
          cur.countryEn = keepCountry.countryEn;
        }
        var canCity = resolveCanonicalCity({ cityUk: cityVal, cityEn: cityVal });
        cur.cityUk = canCity.titleUk;
        cur.cityEn = canCity.titleEn;
        cur.regionId = canCity.id;
        continue;
      }

      var regionVal = matchLabeledLine(line, ['регіон', 'region', 'region id', 'id регіону']);
      if (regionVal) {
        cur = ensureGroup();
        cur.regionId = slugifyRegionName(regionVal) || normalizeTextKey(regionVal).slice(0, 48) || regionVal;
        continue;
      }

      // Bare ISO country code on its own line starts a new group
      if (/^[A-Za-z]{2}$/.test(line) && AI_COUNTRY_META[line.toUpperCase()]) {
        pushGroup();
        cur = ensureGroup();
        var r = resolveCountryFromLabel(line);
        cur.countryId = r.countryId;
        cur.countryUk = r.countryUk;
        cur.countryEn = r.countryEn;
        continue;
      }

      var item = parseLandmarkLine(line);
      if (!item) continue;
      cur = ensureGroup();
      // If no city yet and this looks like a city-only header (no dash address),
      // treat first bare line after country as city when group has no city.
      if (!cur.cityUk && !cur.cityEn && !item.address && cur.items.length === 0) {
        var canBare = resolveCanonicalCity({ cityUk: item.name, cityEn: item.name });
        cur.cityUk = canBare.titleUk;
        cur.cityEn = canBare.titleEn;
        cur.regionId = canBare.id;
        continue;
      }
      cur.items.push(item);
    }
    pushGroup();

    var total = 0;
    var out = [];
    for (var g = 0; g < groups.length; g += 1) {
      var group = groups[g];
      if (!group.cityUk && !group.cityEn) continue;
      if (!group.items || !group.items.length) continue;
      var room = 100 - total;
      if (room <= 0) break;
      group.items = group.items.slice(0, room);
      total += group.items.length;
      out.push(group);
    }
    return out;
  }

  function parseAiLocationItems(text) {
    var groups = parseAiImportGroups(text);
    var items = [];
    groups.forEach(function (g) {
      (g.items || []).forEach(function (it) {
        items.push(it);
      });
    });
    return items.slice(0, 100);
  }

  function unionBundlesClient(primary, secondary) {
    const next = JSON.parse(
      JSON.stringify(primary && typeof primary === 'object' ? primary : DEFAULT_BUNDLE),
    );
    if (!secondary || typeof secondary !== 'object') return next;
    if (!next.regions || typeof next.regions !== 'object') next.regions = {};
    if (!Array.isArray(next.homeCountryOrder)) next.homeCountryOrder = [];
    if (!next.homeRegionIdsByCountry || typeof next.homeRegionIdsByCountry !== 'object') {
      next.homeRegionIdsByCountry = {};
    }
    (Array.isArray(secondary.homeCountryOrder) ? secondary.homeCountryOrder : []).forEach(function (raw) {
      const cid = String(raw || '').trim().toUpperCase();
      if (cid && next.homeCountryOrder.indexOf(cid) < 0) next.homeCountryOrder.push(cid);
    });
    const secMap =
      secondary.homeRegionIdsByCountry && typeof secondary.homeRegionIdsByCountry === 'object'
        ? secondary.homeRegionIdsByCountry
        : {};
    Object.keys(secMap).forEach(function (cidRaw) {
      const cid = String(cidRaw || '').trim().toUpperCase();
      if (!cid) return;
      if (!Array.isArray(next.homeRegionIdsByCountry[cid])) next.homeRegionIdsByCountry[cid] = [];
      (Array.isArray(secMap[cidRaw]) ? secMap[cidRaw] : []).forEach(function (rid) {
        const id = String(rid || '').trim();
        if (id && next.homeRegionIdsByCountry[cid].indexOf(id) < 0) {
          next.homeRegionIdsByCountry[cid].push(id);
        }
      });
    });
    const secRegions = secondary.regions && typeof secondary.regions === 'object' ? secondary.regions : {};
    Object.keys(secRegions).forEach(function (rid) {
      const src = secRegions[rid];
      if (!src || typeof src !== 'object') return;
      if (!next.regions[rid]) {
        next.regions[rid] = JSON.parse(JSON.stringify(src));
        return;
      }
      const dst = next.regions[rid];
      dst.landmarks = Array.isArray(dst.landmarks) ? dst.landmarks : [];
      const existingIds = new Set(dst.landmarks.map(function (lm) { return String((lm && lm.id) || ''); }));
      const existingTitles = new Set(
        dst.landmarks
          .flatMap(function (lm) {
            return [normalizeTextKey(lm && lm.titleUk), normalizeTextKey(lm && lm.titleEn)];
          })
          .filter(Boolean),
      );
      (Array.isArray(src.landmarks) ? src.landmarks : []).forEach(function (lm) {
        if (!lm || typeof lm !== 'object') return;
        const titleKey = normalizeTextKey(lm.titleUk || lm.titleEn);
        if ((lm.id && existingIds.has(String(lm.id))) || (titleKey && existingTitles.has(titleKey))) return;
        dst.landmarks.push(JSON.parse(JSON.stringify(lm)));
        if (lm.id) existingIds.add(String(lm.id));
        if (titleKey) existingTitles.add(titleKey);
      });
    });
    return next;
  }

  async function ensureSnapshotFromServer() {
    let editorSnap;
    try {
      editorSnap = parseEditorJson();
    } catch (e) {
      editorSnap = JSON.parse(JSON.stringify(DEFAULT_BUNDLE));
    }
    try {
      const data = await api('/api/admin/landmark-content/bundle', { method: 'GET' });
      if (data && data.bundle && typeof data.bundle === 'object') {
        // Server bundle is primary — never let a thin editor wipe countries/cities.
        editorSnap = unionBundlesClient(data.bundle, editorSnap);
        if ($('jsonEditor')) $('jsonEditor').value = JSON.stringify(editorSnap, null, 2);
        updateEditorMeta();
        scheduleLandmarkPreview();
      }
    } catch (e) {
      /* keep editor */
    }
    return editorSnap;
  }

  function mergeLandmarksIntoBundle(bundle, mergeTarget, landmarks) {
    const next = JSON.parse(JSON.stringify(bundle && typeof bundle === 'object' ? bundle : DEFAULT_BUNDLE));
    if (!next.regions || typeof next.regions !== 'object') next.regions = {};
    if (!Array.isArray(next.homeCountryOrder)) next.homeCountryOrder = [];
    if (!next.homeRegionIdsByCountry || typeof next.homeRegionIdsByCountry !== 'object') {
      next.homeRegionIdsByCountry = {};
    }

    const countryId = String(mergeTarget.countryId || 'UA').trim().toUpperCase();
    if (!next.homeCountryOrder.includes(countryId)) next.homeCountryOrder.push(countryId);
    if (!Array.isArray(next.homeRegionIdsByCountry[countryId])) next.homeRegionIdsByCountry[countryId] = [];

    const can = resolveCanonicalCity({
      regionId: mergeTarget.regionId,
      cityUk: mergeTarget.cityUk,
      cityEn: mergeTarget.cityEn,
    });
    const cityUk = can.titleUk;
    const cityEn = can.titleEn;
    let regionId = can.id;

    if (!next.regions[regionId]) {
      next.regions[regionId] = {
        id: regionId,
        titleUk: cityUk || cityEn || regionId,
        titleEn: cityEn || cityUk || regionId,
        countryUk: mergeTarget.countryUk || countryId,
        countryEn: mergeTarget.countryEn || countryId,
        flag: '🏳️',
        center: { latitude: 0, longitude: 0, latitudeDelta: 0.12, longitudeDelta: 0.12 },
        heroThumbRef: 't1',
        landmarks: [],
      };
    }
    if (!next.homeRegionIdsByCountry[countryId].includes(regionId)) {
      next.homeRegionIdsByCountry[countryId].push(regionId);
    }
    next.regions[regionId].id = regionId;
    next.regions[regionId].titleUk = cityUk || next.regions[regionId].titleUk;
    next.regions[regionId].titleEn = cityEn || next.regions[regionId].titleEn;

    const region = next.regions[regionId];
    region.landmarks = Array.isArray(region.landmarks) ? region.landmarks : [];
    const existingTitles = new Set(
      region.landmarks
        .flatMap((lm) => [normalizeTextKey(lm && lm.titleUk), normalizeTextKey(lm && lm.titleEn)])
        .filter(Boolean),
    );
    const existingIds = new Set(region.landmarks.map((lm) => String((lm && lm.id) || '')));

    (landmarks || []).forEach((lm, idx) => {
      const titleKey = normalizeTextKey((lm && lm.titleUk) || (lm && lm.titleEn));
      if (titleKey && existingTitles.has(titleKey)) return;
      let id = String((lm && lm.id) || 'lm_' + Date.now().toString(36) + '_' + idx).trim();
      let suffix = 1;
      while (existingIds.has(id)) {
        suffix += 1;
        id = ((lm && lm.id) || 'lm') + '_' + suffix;
      }
      existingIds.add(id);
      if (titleKey) existingTitles.add(titleKey);
      region.landmarks.push({ ...lm, id });
      if (!region.heroUri && lm && lm.thumbUri) region.heroUri = lm.thumbUri;
      if (!(region.center && region.center.latitude) && lm && Number(lm.lat) && Number(lm.lng)) {
        region.center = {
          latitude: Number(lm.lat),
          longitude: Number(lm.lng),
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        };
      }
    });

    return { bundle: next, regionId };
  }

  function setAiProgress(text) {
    const el = $('aiProgress');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(st) {
    if (st === 'ok') return 'готово';
    if (st === 'running') return 'в процесі';
    if (st === 'skipped') return 'пропущено';
    if (st === 'removed') return 'видалено';
    if (st === 'error') return 'помилка';
    if (st === 'needs_decision') return 'потрібне рішення';
    return 'очікує';
  }

  var activeAiJobId = null;

  async function resolveAiDuplicate(itemIndex, action) {
    if (!activeAiJobId) return;
    try {
      const last = await api(
        '/api/admin/locations/ai-enrich-job/' +
          encodeURIComponent(activeAiJobId) +
          '/items/' +
          encodeURIComponent(String(itemIndex)) +
          '/duplicate-decision',
        { method: 'POST', body: JSON.stringify({ action: action }) },
      );
      renderAiInspector(last);
      const labels = {
        merge: 'Додано в існуючу',
        replace: 'Замінено',
        keep_both: 'Залишено окремо',
        skip: 'Пропущено',
      };
      toast(labels[action] || 'OK', 'ok');
      try {
        await loadEditor();
      } catch (e) {
        /* ignore */
      }
      return last;
    } catch (e) {
      toast((e && e.message) || 'не вдалося застосувати рішення', 'err');
      return null;
    }
  }

  async function removeAiItem(itemIndex) {
    if (!activeAiJobId) return;
    try {
      const last = await api(
        '/api/admin/locations/ai-enrich-job/' +
          encodeURIComponent(activeAiJobId) +
          '/items/' +
          encodeURIComponent(String(itemIndex)) +
          '/remove',
        { method: 'POST', body: '{}' },
      );
      renderAiInspector(last);
      toast('Видалено з імпорту', 'info');
    } catch (e) {
      toast((e && e.message) || 'не вдалося видалити', 'err');
    }
  }

  function renderAiInspector(job) {
    const tracesEl = $('aiItemTraces');
    const logEl = $('aiLog');
    const inspector = $('aiInspector');
    if (inspector) inspector.open = true;

    const traces = (job && Array.isArray(job.itemTraces) ? job.itemTraces : []).slice();
    if (tracesEl) {
      if (!traces.length) {
        tracesEl.innerHTML = '<p class="hint">Після старту тут з’являться пошук, текст і фото по кожній локації.</p>';
      } else {
        tracesEl.innerHTML = traces
          .map(function (t) {
            const imgs = (t.imagesHosted && t.imagesHosted.length ? t.imagesHosted : t.imagesFound || []).slice(0, 8);
            const thumbs = imgs
              .map(function (u) {
                return (
                  '<a href="' +
                  escapeHtml(u) +
                  '" target="_blank" rel="noopener"><img src="' +
                  escapeHtml(u) +
                  '" alt="" loading="lazy" /></a>'
                );
              })
              .join('');
            const wikiBits = [];
            if (t.wikiUk && t.wikiUk.url) {
              wikiBits.push(
                'UK: <a href="' + escapeHtml(t.wikiUk.url) + '" target="_blank" rel="noopener">' + escapeHtml(t.wikiUk.title) + '</a>',
              );
            }
            if (t.wikiEn && t.wikiEn.url) {
              wikiBits.push(
                'EN: <a href="' + escapeHtml(t.wikiEn.url) + '" target="_blank" rel="noopener">' + escapeHtml(t.wikiEn.title) + '</a>',
              );
            }
            const candUk = (t.wikiUk && t.wikiUk.candidates) || [];
            const candEn = (t.wikiEn && t.wikiEn.candidates) || [];
            const queries = (t.queries || []).join(' · ');
            const extract = t.extractUkPreview || t.extractEnPreview || '';
            return (
              '<article class="ai-item-card" data-status="' +
              escapeHtml(t.status || 'pending') +
              '">' +
              '<div class="ai-item-top">' +
              '<div class="ai-item-title">' +
              (t.index + 1) +
              '. ' +
              escapeHtml(t.name) +
              (t.address ? ' — ' + escapeHtml(t.address) : '') +
              '</div>' +
              '<div class="ai-item-actions">' +
              '<div class="ai-item-status">' +
              escapeHtml(statusLabel(t.status)) +
              (t.published ? ' · у бандлі' : '') +
              '</div>' +
              (t.status === 'pending' || t.status === 'running'
                ? '<button type="button" class="btn btn-ghost ai-remove-btn" data-ai-remove="' +
                  t.index +
                  '">Видалити</button>'
                : '') +
              '</div>' +
              '</div>' +
              '<div class="ai-item-meta">' +
              (queries ? '<div><strong>Пошук:</strong> ' + escapeHtml(queries) + '</div>' : '') +
              (wikiBits.length ? '<div><strong>Wikipedia:</strong> ' + wikiBits.join(' · ') + '</div>' : '') +
              (candUk.length > 1
                ? '<div><strong>Кандидати UK:</strong> ' + escapeHtml(candUk.join(', ')) + '</div>'
                : '') +
              (candEn.length > 1
                ? '<div><strong>Кандидати EN:</strong> ' + escapeHtml(candEn.join(', ')) + '</div>'
                : '') +
              '<div><strong>Текст:</strong> UK ' +
              (t.extractUkChars || 0) +
              ' / EN ' +
              (t.extractEnChars || 0) +
              ' симв.' +
              (t.lat != null ? ' · ' + t.lat + ', ' + t.lng : '') +
              '</div>' +
              '<div><strong>Фото:</strong> знайдено ' +
              ((t.imagesFound && t.imagesFound.length) || 0) +
              ', на сервері ' +
              ((t.imagesHosted && t.imagesHosted.length) || 0) +
              (t.translatedLangs && t.translatedLangs.length
                ? ' · мови: ' + t.translatedLangs.length
                : '') +
              '</div>' +
              (t.skipReason ? '<div><strong>Пропуск:</strong> ' + escapeHtml(t.skipReason) + '</div>' : '') +
              (t.error ? '<div><strong>Помилка:</strong> ' + escapeHtml(t.error) + '</div>' : '') +
              (t.status === 'needs_decision' && t.duplicateMatch
                ? '<div class="ai-dup-box">' +
                  '<strong>Уже є схожа локація:</strong> ' +
                  escapeHtml(t.duplicateMatch.titleUk || t.duplicateMatch.titleEn || t.duplicateMatch.id) +
                  (t.duplicateMatch.reason ? ' <span class="hint">(' + escapeHtml(t.duplicateMatch.reason) + ')</span>' : '') +
                  '<div class="ai-dup-actions">' +
                  '<button type="button" class="btn btn-primary btn-compact" data-ai-dup="' +
                  t.index +
                  '" data-ai-dup-action="merge">Додати в існуючу</button>' +
                  '<button type="button" class="btn btn-secondary btn-compact" data-ai-dup="' +
                  t.index +
                  '" data-ai-dup-action="replace">Замінити</button>' +
                  '<button type="button" class="btn btn-secondary btn-compact" data-ai-dup="' +
                  t.index +
                  '" data-ai-dup-action="keep_both">Залишити окремо</button>' +
                  '<button type="button" class="btn btn-ghost btn-compact" data-ai-dup="' +
                  t.index +
                  '" data-ai-dup-action="skip">Пропустити</button>' +
                  '</div></div>'
                : '') +
              '</div>' +
              (extract ? '<div class="ai-item-extract">' + escapeHtml(extract) + '</div>' : '') +
              (thumbs ? '<div class="ai-thumbs">' + thumbs + '</div>' : '') +
              '</article>'
            );
          })
          .join('');
      }
    }

    if (logEl) {
      const log = (job && Array.isArray(job.log) ? job.log : []).slice(-200);
      logEl.innerHTML = log
        .map(function (e) {
          const t = (e.ts || '').slice(11, 19);
          const lvl = e.level || 'info';
          return (
            '<div class="lvl-' +
            escapeHtml(lvl) +
            '">[' +
            escapeHtml(t) +
            '] ' +
            escapeHtml(e.step || '') +
            ' · ' +
            escapeHtml(e.message || '') +
            '</div>'
          );
        })
        .join('');
      logEl.scrollTop = logEl.scrollHeight;
    }

    if (tracesEl) {
      tracesEl.querySelectorAll('[data-ai-remove]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var idx = Number(btn.getAttribute('data-ai-remove'));
          if (!Number.isFinite(idx)) return;
          btn.disabled = true;
          void removeAiItem(idx);
        });
      });
      tracesEl.querySelectorAll('[data-ai-dup]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var idx = Number(btn.getAttribute('data-ai-dup'));
          var action = btn.getAttribute('data-ai-dup-action');
          if (!Number.isFinite(idx) || !action) return;
          tracesEl.querySelectorAll('[data-ai-dup="' + idx + '"]').forEach(function (b) {
            b.disabled = true;
          });
          void resolveAiDuplicate(idx, action);
        });
      });
    }
  }


  function formatAiHistoryWhen(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || '');
      return d.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return String(iso || '');
    }
  }

  function historyStatusLabel(st) {
    if (st === 'completed') return 'завершено';
    if (st === 'awaiting_decisions') return 'чекає рішення';
    if (st === 'running' || st === 'queued') return 'триває';
    if (st === 'failed') return 'помилка';
    return st || '';
  }

  async function openLandmarkInPreview(regionId, landmarkId, titleHint) {
    try {
      await loadEditor();
    } catch (e) {
      /* keep local editor */
    }
    setTab('preview');
    let bundle;
    try {
      bundle = parseEditorJson();
    } catch (e) {
      toast('Не вдалося прочитати бандл', 'err');
      return;
    }
    const regions = (bundle && bundle.regions) || {};
    let rid = String(regionId || '').trim();
    let index = -1;
    if (rid && regions[rid] && Array.isArray(regions[rid].landmarks)) {
      index = regions[rid].landmarks.findIndex(function (lm) {
        return landmarkId && String(lm && lm.id) === String(landmarkId);
      });
      if (index < 0 && titleHint) {
        const want = normalizeTextKey(titleHint);
        index = regions[rid].landmarks.findIndex(function (lm) {
          return (
            normalizeTextKey(lm && lm.titleUk) === want || normalizeTextKey(lm && lm.titleEn) === want
          );
        });
      }
    }
    if (index < 0 && landmarkId) {
      Object.keys(regions).some(function (key) {
        const lms = regions[key].landmarks || [];
        const i = lms.findIndex(function (lm) {
          return String(lm && lm.id) === String(landmarkId);
        });
        if (i >= 0) {
          rid = key;
          index = i;
          return true;
        }
        return false;
      });
    }
    renderLandmarkPreview();
    if (rid && index >= 0) {
      selectPreviewLandmark(rid, index);
      toast('Відкрито в «Як у застосунку»', 'ok');
    } else {
      toast('Локацію не знайдено в поточному бандлі — оновіть бандл', 'err');
    }
  }

  async function openJobInspector(jobId) {
    try {
      const job = await api('/api/admin/locations/ai-enrich-job/' + encodeURIComponent(jobId), {
        method: 'GET',
      });
      activeAiJobId = job && job.status === 'running' ? job.id : null;
      renderAiInspector(job);
      const inspector = $('aiInspector');
      if (inspector) {
        inspector.open = true;
        inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      toast('Інспектор імпорту відкрито', 'info');
    } catch (e) {
      toast((e && e.message) || 'не вдалося відкрити job', 'err');
    }
  }

  var aiHistoryById = {};

  function buildAiImportTextFromRetry(retry, mode) {
    const r = retry || {};
    const list =
      mode === 'failed'
        ? Array.isArray(r.itemsFailed)
          ? r.itemsFailed
          : []
        : Array.isArray(r.itemsAll)
          ? r.itemsAll
          : [];
    const countryLabel = r.countryUk || r.countryEn || r.country || r.countryId || '';
    const cityLabel = r.cityUk || r.cityEn || r.city || '';
    const lines = [];
    if (countryLabel) lines.push('Країна: ' + countryLabel);
    if (cityLabel) lines.push('Місто: ' + cityLabel);
    list.forEach(function (it) {
      if (!it || !it.name) return;
      lines.push(it.address ? it.name + ' — ' + it.address : it.name);
    });
    return lines.join('\n');
  }

  function fillAiFormFromRetry(retry, mode) {
    const text = buildAiImportTextFromRetry(retry, mode);
    if (!text.trim()) {
      toast('Немає даних для повтору', 'err');
      return false;
    }
    if ($('aiLocationsText')) $('aiLocationsText').value = text;
    const el = $('aiLocationsText');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  async function retryAiImportFromHistory(jobId, mode) {
    const job = aiHistoryById[jobId];
    if (!job || !job.retry) {
      toast('Немає збереженого запиту для повтору', 'err');
      return;
    }
    const retry = job.retry;
    const list =
      mode === 'failed'
        ? retry.itemsFailed || []
        : retry.itemsAll || [];
    if (!list.length) {
      toast(mode === 'failed' ? 'Немає невдалих локацій для повтору' : 'Порожній запит', 'info');
      return;
    }
    if (!fillAiFormFromRetry(retry, mode)) return;
    toast(mode === 'failed' ? 'Повторюю невдалі…' : 'Повторюю імпорт…', 'info');
    await runAiImportJob();
  }

  async function loadAiHistory() {
    const host = $('aiHistoryList');
    if (!host) return;
    host.innerHTML = '<p class="ai-history-empty">Завантаження історії…</p>';
    try {
      const data = await api('/api/admin/locations/ai-enrich-jobs', { method: 'GET' });
      const items = (data && Array.isArray(data.items) ? data.items : []).slice(0, 40);
      aiHistoryById = {};
      items.forEach(function (job) {
        if (job && job.id) aiHistoryById[job.id] = job;
      });
      if (!items.length) {
        host.innerHTML = '<p class="ai-history-empty">Поки немає імпортів. Після першого запуску вони з’являться тут.</p>';
        return;
      }
      host.innerHTML = items
        .map(function (job) {
          const place =
            (job.countryId ? job.countryId + ' · ' : '') +
            (job.city || job.country || '—');
          const failedN = (job.retry && job.retry.itemsFailed && job.retry.itemsFailed.length) || 0;
          const rows = (job.items || [])
            .filter(function (it) {
              return it.status === 'ok' || it.status === 'skipped' || it.status === 'error' || it.status === 'removed';
            })
            .map(function (it) {
              const thumb = it.thumbUri
                ? '<img src="' + escapeHtml(it.thumbUri) + '" alt="" loading="lazy" />'
                : '';
              const openBtn =
                it.status === 'ok'
                  ? '<button type="button" class="btn btn-ghost" data-open-lm="' +
                    escapeHtml(it.regionId || job.regionId || '') +
                    '" data-open-id="' +
                    escapeHtml(it.landmarkId || '') +
                    '" data-open-title="' +
                    escapeHtml(it.titleUk || it.name || '') +
                    '">Відкрити локацію</button>'
                  : it.status === 'error' || it.status === 'skipped' || it.status === 'removed'
                    ? '<button type="button" class="btn btn-ghost" data-retry-one-job="' +
                      escapeHtml(job.id) +
                      '" data-retry-one-name="' +
                      escapeHtml(it.name || '') +
                      '" data-retry-one-address="' +
                      escapeHtml(it.address || '') +
                      '">Повторити</button>'
                    : '';
              return (
                '<div class="ai-history-item">' +
                '<div class="ai-history-item-main">' +
                thumb +
                '<div><strong>' +
                escapeHtml(it.titleUk || it.name || '') +
                '</strong>' +
                (it.address ? '<div class="ai-history-card-meta">' + escapeHtml(it.address) + '</div>' : '') +
                '<div class="ai-history-card-meta">' +
                escapeHtml(statusLabel(it.status)) +
                (it.published ? ' · у бандлі' : '') +
                (it.wikiUk ? ' · ' + escapeHtml(it.wikiUk) : '') +
                '</div></div></div>' +
                '<div class="ai-history-item-actions">' +
                openBtn +
                '</div></div>'
              );
            })
            .join('');
          return (
            '<article class="ai-history-card" data-job-id="' +
            escapeHtml(job.id) +
            '">' +
            '<div class="ai-history-card-top">' +
            '<div class="ai-history-card-title">' +
            escapeHtml(place) +
            '</div>' +
            '<div class="ai-history-card-meta">' +
            escapeHtml(formatAiHistoryWhen(job.createdAt)) +
            ' · ' +
            escapeHtml(historyStatusLabel(job.status)) +
            ' · +' +
            (job.publishedCount || job.landmarkCount || 0) +
            (failedN ? ' · невдалих: ' + failedN : '') +
            '</div></div>' +
            (rows ? '<div class="ai-history-items">' + rows + '</div>' : '') +
            '<div class="ai-history-card-actions">' +
            '<button type="button" class="btn btn-primary" data-retry-job="' +
            escapeHtml(job.id) +
            '">Повторити все</button>' +
            (failedN
              ? '<button type="button" class="btn btn-ghost" data-retry-failed-job="' +
                escapeHtml(job.id) +
                '">Повторити невдалі (' +
                failedN +
                ')</button>'
              : '') +
            '<button type="button" class="btn btn-ghost" data-fill-job="' +
            escapeHtml(job.id) +
            '">Вставити в форму</button>' +
            '<button type="button" class="btn btn-ghost" data-open-job="' +
            escapeHtml(job.id) +
            '">Інспектор</button>' +
            (job.regionId
              ? '<button type="button" class="btn btn-ghost" data-open-region="' +
                escapeHtml(job.regionId) +
                '">Усі в місті</button>'
              : '') +
            '<button type="button" class="btn btn-ghost" data-open-media="1">Медіа / фото</button>' +
            '</div></article>'
          );
        })
        .join('');

      host.querySelectorAll('[data-open-job]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          void openJobInspector(btn.getAttribute('data-open-job'));
        });
      });
      host.querySelectorAll('[data-retry-job]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          void retryAiImportFromHistory(btn.getAttribute('data-retry-job'), 'all');
        });
      });
      host.querySelectorAll('[data-retry-failed-job]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          void retryAiImportFromHistory(btn.getAttribute('data-retry-failed-job'), 'failed');
        });
      });
      host.querySelectorAll('[data-fill-job]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const job = aiHistoryById[btn.getAttribute('data-fill-job')];
          if (!job || !fillAiFormFromRetry(job.retry, 'all')) return;
          toast('Запит вставлено у форму — можна правити і запустити', 'ok');
        });
      });
      host.querySelectorAll('[data-retry-one-job]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const job = aiHistoryById[btn.getAttribute('data-retry-one-job')];
          if (!job || !job.retry) return;
          const one = {
            ...job.retry,
            itemsAll: [
              {
                name: btn.getAttribute('data-retry-one-name') || '',
                address: btn.getAttribute('data-retry-one-address') || '',
              },
            ].filter(function (x) {
              return x.name;
            }),
            itemsFailed: [
              {
                name: btn.getAttribute('data-retry-one-name') || '',
                address: btn.getAttribute('data-retry-one-address') || '',
              },
            ].filter(function (x) {
              return x.name;
            }),
          };
          if (!fillAiFormFromRetry(one, 'all')) return;
          toast('Повторюю одну локацію…', 'info');
          void runAiImportJob();
        });
      });
      host.querySelectorAll('[data-open-lm]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          void openLandmarkInPreview(
            btn.getAttribute('data-open-lm'),
            btn.getAttribute('data-open-id'),
            btn.getAttribute('data-open-title'),
          );
        });
      });
      host.querySelectorAll('[data-open-region]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const rid = btn.getAttribute('data-open-region');
          setTab('preview');
          if ($('previewSearch')) {
            $('previewSearch').value = rid || '';
            $('previewSearch').dispatchEvent(new Event('input'));
          }
          renderLandmarkPreview();
        });
      });
      host.querySelectorAll('[data-open-media]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setTab('media');
          toast('Завантаж додаткові фото й встав URL у локацію', 'info');
        });
      });
    } catch (e) {
      host.innerHTML =
        '<p class="ai-history-empty">' +
        escapeHtml((e && e.message) || 'Не вдалося завантажити історію') +
        '</p>';
    }
  }

  async function runOneAiGroupJob(group, snapshot, autoPublish, progressPrefix) {
    const cityUk = String(group.cityUk || group.cityEn || '').trim();
    const cityEn = String(group.cityEn || group.cityUk || '').trim();
    const countryId = String(group.countryId || 'UA').trim().toUpperCase();
    const countryUk = String(group.countryUk || countryId).trim();
    const countryEn = String(group.countryEn || countryId).trim();
    const regionId = String(group.regionId || '').trim();
    const items = Array.isArray(group.items) ? group.items : [];

    const body = {
      country: countryEn || countryUk,
      city: cityEn || cityUk,
      items,
      rehostImages: true,
      autoPublish,
      mergeTarget: {
        countryId,
        countryUk,
        countryEn,
        regionId,
        cityUk: cityUk || cityEn,
        cityEn: cityEn || cityUk,
      },
      snapshot,
    };

    async function startJob() {
      const started = await api('/api/admin/locations/ai-enrich-job', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const jobId = started && started.id;
      if (!jobId) throw new Error('job_start_failed');
      return { started: started, jobId: jobId };
    }

    let { started, jobId } = await startJob();
    activeAiJobId = jobId;
    let last = started;
    let workingSnapshot = snapshot;
    const seenLmIds = new Set();
    renderAiInspector(last);
    const startedAt = Date.now();
    let restartRetries = 0;

    function ingestReadyLandmarks(job) {
      const lms = Array.isArray(job.landmarks) ? job.landmarks : [];
      const fresh = [];
      lms.forEach(function (lm) {
        const id = String((lm && lm.id) || '');
        if (!id || seenLmIds.has(id)) return;
        seenLmIds.add(id);
        fresh.push(lm);
      });
      if (!fresh.length) return;
      const merged = mergeLandmarksIntoBundle(
        workingSnapshot,
        {
          countryId,
          countryUk,
          countryEn,
          regionId: (job && job.appliedRegionId) || regionId,
          cityUk: cityUk || cityEn,
          cityEn: cityEn || cityUk,
        },
        fresh,
      );
      workingSnapshot = merged.bundle;
      if ($('jsonEditor')) $('jsonEditor').value = JSON.stringify(workingSnapshot, null, 2);
      updateEditorMeta();
    }

    while (true) {
      const p = last.progress || {};
      const phaseLabel =
        p.phase === 'rehost'
          ? 'Зберігаю фото'
          : p.phase === 'translate'
            ? 'Перекладаю на всі мови'
            : p.phase === 'publish'
              ? 'Публікую'
              : 'Wikipedia';
      const pubN = Number(last.publishedCount) || 0;
      setAiProgress(
        (progressPrefix || '') +
          phaseLabel +
          ': ' +
          Math.max(1, Number(p.done) || 1) +
          '/' +
          (p.total || items.length) +
          (p.currentName ? ' — ' + p.currentName : '') +
          (pubN ? ' · уже в бандлі: ' + pubN : ''),
      );
      ingestReadyLandmarks(last);
      renderAiInspector(last);

      if (last.status === 'failed') {
        const errCode = String(last.error || '');
        if ((errCode === 'server_restarted' || /перезапуск/i.test(errCode)) && restartRetries < 2) {
          restartRetries += 1;
          setAiProgress((progressPrefix || '') + 'Сервер перезапустився — запускаю знову (' + restartRetries + ')…');
          renderAiInspector(last);
          const again = await startJob();
          started = again.started;
          jobId = again.jobId;
          activeAiJobId = jobId;
          last = again.started;
          continue;
        }
        if (errCode === 'server_restarted') {
          throw new Error('Сервер перезапустився під час імпорту. Натисни кнопку ще раз.');
        }
        throw new Error(last.error || 'enrich_failed');
      }
      if (last.status === 'awaiting_decisions') {
        const pendingN = Array.isArray(last.pendingDuplicates) ? last.pendingDuplicates.length : 0;
        setAiProgress(
          (progressPrefix || '') +
            'Схожі локації вже є — обери в інспекторі: додати / замінити / окремо / пропустити' +
            (pendingN ? ' (' + pendingN + ')' : ''),
        );
        renderAiInspector(last);
        if (Date.now() - startedAt > 90 * 60 * 1000) {
          throw new Error('timeout_waiting_duplicate_decisions');
        }
        await sleep(1500);
        try {
          last = await api('/api/admin/locations/ai-enrich-job/' + encodeURIComponent(jobId), { method: 'GET' });
        } catch (e) {
          const msg = String((e && e.message) || '');
          if (/Load failed|Failed to fetch|NetworkError|network|TypeError/i.test(msg) || (e && !e.status)) {
            await sleep(2500);
            continue;
          }
          throw e;
        }
        continue;
      }
      if (last.status === 'completed') break;
      if (Date.now() - startedAt > 90 * 60 * 1000) throw new Error('timeout');
      await sleep(1500);
      try {
        last = await api('/api/admin/locations/ai-enrich-job/' + encodeURIComponent(jobId), { method: 'GET' });
      } catch (e) {
        const msg = String((e && e.message) || '');
        // Safari often reports transient network blips as "Load failed"
        if (
          /Load failed|Failed to fetch|NetworkError|network|TypeError/i.test(msg) ||
          (e && !e.status)
        ) {
          setAiProgress((progressPrefix || '') + 'Звʼязок з сервером тимчасово зник — повторюю…');
          await sleep(2500);
          continue;
        }
        if ((msg === 'job_not_found' || (e && e.status === 404)) && restartRetries < 2) {
          restartRetries += 1;
          setAiProgress((progressPrefix || '') + 'Сервер перезапустився — запускаю знову (' + restartRetries + ')…');
          const again = await startJob();
          started = again.started;
          jobId = again.jobId;
          activeAiJobId = jobId;
          last = again.started;
          continue;
        }
        if (msg === 'job_not_found' || (e && e.status === 404)) {
          throw new Error('Сервер перезапустився під час імпорту. Натисни кнопку ще раз.');
        }
        throw e;
      }
    }
    ingestReadyLandmarks(last);
    renderAiInspector(last);
    activeAiJobId = null;

    const landmarks = Array.isArray(last.landmarks) ? last.landmarks : [];
    if (!landmarks.length && !(Number(last.publishedCount) > 0)) {
      throw new Error('AI не знайшов локації для «' + (cityUk || cityEn) + '». Перевірте назви.');
    }

    const merged = mergeLandmarksIntoBundle(
      workingSnapshot,
      {
        countryId,
        countryUk,
        countryEn,
        regionId: last.appliedRegionId || regionId,
        cityUk: cityUk || cityEn,
        cityEn: cityEn || cityUk,
      },
      landmarks,
    );

    return {
      bundle: merged.bundle,
      regionId: merged.regionId,
      landmarks,
      published: !!last.published,
    };
  }

  async function runAiImportJob() {
    showError($('aiError'), '');
    const resultEl = $('aiResult');
    if (resultEl) {
      resultEl.hidden = true;
      resultEl.textContent = '';
    }

    const groups = parseAiImportGroups(($('aiLocationsText') && $('aiLocationsText').value) || '');
    const autoPublish = !($('aiAutoPublish') && !$('aiAutoPublish').checked);
    const totalItems = groups.reduce(function (n, g) {
      return n + ((g.items && g.items.length) || 0);
    }, 0);

    if (!groups.length) {
      showError(
        $('aiError'),
        'Додайте блоки: Країна: … / Місто: … / пам’ятка — вулиця (можна кілька країн)',
      );
      return;
    }

    let snapshot;
    try {
      setAiProgress('Підтягую всі країни/міста з сервера…');
      snapshot = await ensureSnapshotFromServer();
    } catch (e) {
      try {
        snapshot = parseEditorJson();
      } catch (e2) {
        snapshot = JSON.parse(JSON.stringify(DEFAULT_BUNDLE));
        if ($('jsonEditor')) $('jsonEditor').value = JSON.stringify(snapshot, null, 2);
        updateEditorMeta();
      }
    }

    const btn = $('btnAiImport');
    if (btn) btn.disabled = true;
    setAiProgress('Запуск AI… груп: ' + groups.length + ', локацій: ' + totalItems);
    renderAiInspector({ itemTraces: [], log: [{ ts: new Date().toISOString(), level: 'info', step: 'start', message: 'Запуск…' }] });

    try {
      let added = 0;
      const regionIds = [];
      let anyPublished = false;

      for (let gi = 0; gi < groups.length; gi += 1) {
        const g = groups[gi];
        const prefix =
          '[' +
          (gi + 1) +
          '/' +
          groups.length +
          '] ' +
          (g.countryEn || g.countryUk || g.countryId) +
          ' / ' +
          (g.cityEn || g.cityUk) +
          ' · ';
        const result = await runOneAiGroupJob(g, snapshot, autoPublish, prefix);
        snapshot = result.bundle;
        added += result.landmarks.length;
        regionIds.push(result.regionId);
        if (result.published) anyPublished = true;
        if ($('jsonEditor')) $('jsonEditor').value = JSON.stringify(snapshot, null, 2);
        updateEditorMeta();
      }

      if (!anyPublished) {
        await api('/api/admin/landmark-content/bundle', {
          method: 'PUT',
          body: JSON.stringify(snapshot),
        });
      }

      setAiProgress('');
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.textContent =
          'Готово: додано ' +
          added +
          ' локацій у регіони «' +
          regionIds.join(', ') +
          '». Тексти перекладені на всі мови застосунку. Опубліковано для користувачів.';
      }
      toast('AI імпорт готовий: ' + added, 'ok');
      if ($('aiLocationsText')) $('aiLocationsText').value = '';
      void loadAiHistory();
    } catch (e) {
      setAiProgress('');
      const raw = String((e && e.message) || 'ai_import_failed');
      const msg =
        raw === 'job_not_found' || raw === 'server_restarted'
          ? 'Сервер перезапустився під час імпорту. Натисни кнопку ще раз.'
          : raw === 'rate_limited'
            ? 'Забагато запитів. Зачекай ~1 хв і натисни знову.'
            : raw;
      showError($('aiError'), msg);
      toast(msg, 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  const btnAiImport = $('btnAiImport');
  if (btnAiImport) {
    btnAiImport.addEventListener('click', () => {
      void runAiImportJob();
    });
  }
  const btnAiHistoryRefresh = $('btnAiHistoryRefresh');
  if (btnAiHistoryRefresh) {
    btnAiHistoryRefresh.addEventListener('click', () => {
      void loadAiHistory();
    });
  }

  async function tryResumeSession() {
    const savedBase = sessionStorage.getItem(storageKey);
    if (savedBase && $('apiBase')) $('apiBase').value = savedBase;
    if (!sessionStorage.getItem(tokenKey)) return;
    try {
      await api('/api/admin/landmark-content/bundle', { method: 'GET' });
      showMain(null);
      await loadEditor();
      await loadMedia();
      void loadAiHistory();
      toast('Сесію відновлено', 'info');
    } catch (e) {
      if (e && e.status === 401) return;
      showLogin();
      toast('Сесію не відновлено (мережа або API)', 'err');
    }
  }

  const fileIn = $('fileInput');
  const uploadZone = $('uploadZone');
  if (fileIn) {
    fileIn.addEventListener('change', () => refreshMediaFileLabel());
  }
  if (uploadZone && fileIn) {
    function setDragging(on) {
      uploadZone.classList.toggle('upload-zone--drag', on);
    }
    uploadZone.addEventListener('dragenter', (ev) => {
      ev.preventDefault();
      setDragging(true);
    });
    uploadZone.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    });
    uploadZone.addEventListener('dragleave', (ev) => {
      ev.preventDefault();
      const nextTarget = ev.relatedTarget;
      if (!nextTarget || !uploadZone.contains(nextTarget)) {
        setDragging(false);
      }
    });
    uploadZone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      setDragging(false);
      const incoming = ev.dataTransfer && ev.dataTransfer.files;
      if (!incoming || !incoming.length) return;
      const dt = new DataTransfer();
      Array.from(incoming).forEach((f) => {
        if (/^image\//i.test(f.type)) dt.items.add(f);
      });
      if (!dt.files.length) {
        toast('Потрібні зображення (JPEG, PNG, WebP, GIF)', 'err');
        return;
      }
      fileIn.files = dt.files;
      refreshMediaFileLabel();
      toast(
        dt.files.length === 1
          ? 'Файл обрано — натисніть «Завантажити на сервер»'
          : 'Обрано ' + dt.files.length + ' файлів — натисніть «Завантажити на сервер»',
        'info',
      );
    });
  }

  const hard = $('btnHardRefresh');
  if (hard) {
    hard.addEventListener('click', () => {
      const u = new URL(window.location.href);
      u.searchParams.set('_r', String(Date.now()));
      window.location.replace(u.toString());
    });
  }

  const themeKey = 'landmarksCms:theme';
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const mc = $('metaThemeColor');
    if (mc) mc.setAttribute('content', t === 'dark' ? '#000000' : '#f5f7fa');
    const btnTheme = $('btnThemeToggle');
    if (btnTheme) {
      btnTheme.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      const lightIc = btnTheme.querySelector('.btn-theme-icon-light');
      const darkIc = btnTheme.querySelector('.btn-theme-icon-dark');
      if (lightIc && darkIc) {
        lightIc.classList.toggle('hidden', t === 'dark');
        darkIc.classList.toggle('hidden', t !== 'dark');
      }
    }
  }
  const btnThemeToggle = $('btnThemeToggle');
  if (btnThemeToggle) {
    const initial = document.documentElement.getAttribute('data-theme');
    applyTheme(initial === 'dark' ? 'dark' : 'light');
    btnThemeToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(themeKey, next);
      } catch (e) {}
      applyTheme(next);
    });
  }

  tryResumeSession();
})();
