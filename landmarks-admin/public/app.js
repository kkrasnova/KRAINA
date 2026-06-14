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
    shell.classList.toggle('shell
    shell.classList.toggle('shell
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
      c.classList.toggle('preview-card
    });
    document.querySelectorAll('.preview-landmark-item').forEach((b) => {
      const on = b.dataset.regionId === regionId && Number(b.dataset.landmarkIndex) === index;
      b.classList.toggle('preview-landmark-item
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

  function fillPreviewEditForm(regionId, index) {
    let bundle;
    try {
      bundle = JSON.parse(($('jsonEditor') && $('jsonEditor').value) || 'null');
    } catch {
      return;
    }
    const lm =
      bundle.regions &&
      bundle.regions[regionId] &&
      bundle.regions[regionId].landmarks &&
      bundle.regions[regionId].landmarks[index];
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
    const st = lm.story && typeof lm.story === 'object' ? lm.story : {};
    setVal('previewEditShortIntro', st.shortIntroUk || '');
    setVal('previewEditDescUk', lm.descUk || '');

    const h = $('previewEditHeading');
    if (h) h.textContent = lm.titleUk || lm.titleEn || lm.id || 'Пам’ятка';
    const hint = $('previewEditHint');
    if (hint) hint.textContent = regionId + ' · № у масиві ' + index + (lm.id ? ' · id: ' + lm.id : '');
    const panel = $('previewEditPanel');
    if (panel) panel.classList.remove('hidden');
  }

  function clearPreviewSelection() {
    previewSelection = null;
    const panel = $('previewEditPanel');
    if (panel) panel.classList.add('hidden');
    document.querySelectorAll('.preview-card
    document.querySelectorAll('.preview-landmark-item
      el.classList.remove('preview-landmark-item
    );
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
        btn.classList.add('preview-landmark-item
      }
      btn.addEventListener('click', () => selectPreviewLandmark(regionId, index));
      wrap.appendChild(btn);
    });
  }

  function savePreviewLandmarkEdits() {
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
    const lm =
      bundle.regions &&
      bundle.regions[regionId] &&
      bundle.regions[regionId].landmarks &&
      bundle.regions[regionId].landmarks[index];
    if (!lm || typeof lm !== 'object') {
      toast('Пам’ятку не знайдено — оновіть перегляд', 'err');
      return;
    }

    lm.titleUk = ($('previewEditTitleUk').value || '').trim();
    lm.titleEn = ($('previewEditTitleEn').value || '').trim();
    const lat = parseFloat(String($('previewEditLat').value || '').replace(',', '.'));
    const lng = parseFloat(String($('previewEditLng').value || '').replace(',', '.'));
    if (Number.isFinite(lat)) lm.lat = lat;
    else delete lm.lat;
    if (Number.isFinite(lng)) lm.lng = lng;
    else delete lm.lng;

    const thumb = ($('previewEditThumbUri').value || '').trim();
    if (thumb) lm.thumbUri = thumb;
    else delete lm.thumbUri;

    const intro = ($('previewEditShortIntro').value || '').trim();
    lm.story = lm.story && typeof lm.story === 'object' ? lm.story : {};
    if (intro) lm.story.shortIntroUk = intro;
    else delete lm.story.shortIntroUk;

    const desc = ($('previewEditDescUk').value || '').trim();
    if (desc) lm.descUk = desc;
    else delete lm.descUk;

    $('jsonEditor').value = JSON.stringify(bundle, null, 2);
    updateEditorMeta();
    scheduleLandmarkPreview();
    toast('Зміни записані в JSON', 'ok');
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
      err.className = 'preview-empty preview-empty
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
        thumb.classList.add('preview-card-thumb
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
    const map = { bundle: 'tabBundle', preview: 'tabPreview', media: 'tabMedia' };
    Object.keys(map).forEach((k) => {
      const el = $(map[k]);
      if (el) el.classList.toggle('hidden', k !== name);
    });
    if (name === 'preview') renderLandmarkPreview();
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.getAttribute('data-tab') || 'bundle'));
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
        showError($('loginError'), (data && (data.code || data.message)) || 'login failed');
        return;
      }
      if (data.user && data.user.role !== 'admin') {
        showError($('loginError'), 'потрібен role=admin у PostgreSQL');
        return;
      }
      sessionStorage.setItem(tokenKey, data.access_token);
      if (data.refresh_token) sessionStorage.setItem(refreshKey, data.refresh_token);
      showMain(data.user);
      await loadEditor();
      await loadMedia();
      toast('Вітаємо в CMS', 'ok');
    } catch (e) {
      showError($('loginError'), e.message || 'network error');
    }
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
  if (btnPreviewSaveLm) btnPreviewSaveLm.addEventListener('click', savePreviewLandmarkEdits);
  const btnPreviewClearLm = $('btnPreviewClearLandmark');
  if (btnPreviewClearLm) btnPreviewClearLm.addEventListener('click', clearPreviewSelection);

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

  async function tryResumeSession() {
    const savedBase = sessionStorage.getItem(storageKey);
    if (savedBase && $('apiBase')) $('apiBase').value = savedBase;
    if (!sessionStorage.getItem(tokenKey)) return;
    try {
      await api('/api/admin/landmark-content/bundle', { method: 'GET' });
      showMain(null);
      await loadEditor();
      await loadMedia();
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
      uploadZone.classList.toggle('upload-zone
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
