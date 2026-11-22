/* global launcherApi, I18N */

// ───────────────────────────────────────────────────────────
// Language (pt-BR / en / es). Saved in localStorage; falls back to the system language.
// ───────────────────────────────────────────────────────────
const LANGUAGE_STORAGE_KEY = 'language';

function readSavedLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved) return I18N.normalizeLanguage(saved);
  } catch { /* storage may be unavailable */ }
  return I18N.normalizeLanguage(navigator.language);
}

let currentLanguage = readSavedLanguage();

function t(key, params) {
  return I18N.translate(currentLanguage, key, params);
}

const starSvg = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

let myGames = [];
let selectedGame = null;
let runningGames = new Set();

let modalState = {
  filter: '',
  offset: 0,
  limit: 200,
  hasMore: false,
  loading: false
};

const gameListEl = document.getElementById('gameList');
const heroEmptyState = document.getElementById('heroEmptyState');
const heroContent = document.getElementById('heroContent');
const mainContent = document.getElementById('mainContent');

const launchBtn = document.getElementById('launchBtn');
const logArea = document.getElementById('logArea');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const addGameModal = document.getElementById('addGameModal');
const modalListEl = document.getElementById('modalList');
const searchInput = document.getElementById('searchInput');
const modalSearchInput = document.getElementById('modalSearchInput');
const contextMenuEl = document.getElementById('contextMenu');

// Update modal
const updateModal = document.getElementById('updateModal');
const updateCloseBtn = document.getElementById('updateCloseBtn');
const updateSubtitle = document.getElementById('updateSubtitle');
const updateNotes = document.getElementById('updateNotes');
const updateInstallBtn = document.getElementById('updateInstallBtn');
const updateRemindBtn = document.getElementById('updateRemindBtn');
const updateProgressWrap = document.getElementById('updateProgressWrap');
const updateProgressFill = document.getElementById('updateProgressFill');
const updateProgressText = document.getElementById('updateProgressText');

// Details panel
const detailAppId = document.getElementById('detailAppId');
const detailExe = document.getElementById('detailExe');
const detailFavorite = document.getElementById('detailFavorite');
const detailRunning = document.getElementById('detailRunning');
let updateUiState = {
  visible: false,
  installing: false
};

function log(msg, type = '') {
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour12: false });
  const stamp = document.createElement('span');
  stamp.className = 'log-time';
  stamp.textContent = `[${time}]`;
  div.append(stamp, document.createTextNode(` ${msg}`));
  logArea.appendChild(div);
  logArea.scrollTop = logArea.scrollHeight;
}

function resetHeroState() {
  statusDot.style.backgroundColor = 'var(--text-muted)';
  statusDot.style.color = 'var(--text-muted)';
  statusText.innerText = t('status.ready');
  statusText.style.color = 'var(--text-muted)';

  launchBtn.classList.remove('running');
  document.getElementById('launchBtnText').innerText = t('btn.launch');
  document.getElementById('playIcon').style.display = 'block';
  document.getElementById('stopIcon').style.display = 'none';

  updateDetailsPanel();
}

function syncSelectedGameLaunchState() {
  if (!selectedGame) {
    resetHeroState();
    return;
  }

  const running = isGameRunning(selectedGame);
  if (!running) {
    resetHeroState();
    return;
  }

  statusDot.style.backgroundColor = 'var(--success)';
  statusDot.style.color = 'var(--success)';
  statusText.innerText = t('status.playing');
  statusText.style.color = 'var(--success)';

  launchBtn.classList.add('running');
  document.getElementById('launchBtnText').innerText = t('btn.stop');
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('stopIcon').style.display = 'block';

  updateDetailsPanel();
}

function makeGameKey(game) {
  if (!game || typeof game !== 'object') return '';
  const appId = String(game.appId ?? '');
  const exe = String(game.exe ?? '');
  const key = `${appId}::${exe}`;
  return key === '::' ? '' : key;
}

function isGameRunning(game) {
  return Boolean(game && makeGameKey(game) && runningGames.has(makeGameKey(game)));
}

function updateDetailsPanel() {
  const dash = '—';

  if (!detailAppId || !detailExe || !detailFavorite || !detailRunning) return;

  if (!selectedGame) {
    detailAppId.textContent = dash;
    detailExe.textContent = dash;
    detailFavorite.textContent = dash;
    detailRunning.textContent = dash;
    return;
  }

  detailAppId.textContent = selectedGame.appId || dash;
  detailExe.textContent = selectedGame.exe || dash;
  detailFavorite.textContent = selectedGame.isFavorite ? t('common.yes') : t('common.no');
  detailRunning.textContent = isGameRunning(selectedGame) ? t('common.yes') : t('common.no');
}

// No background thumbnails in the public build.

// ───────────────────────────────────────────────────────────
// Game icons: small images from Discord's CDN, loaded only for rows that are on screen.
// Nothing is saved to disk; while loading (or when a game has no icon) its first letter is shown.
// ───────────────────────────────────────────────────────────
const iconUrlCache = new Map(); // appId -> url (only successful lookups are remembered)

function iconLetter(name) {
  const ch = String(name || '?').trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

function applyIconImage(el, url) {
  if (!el || !url) return;
  const forAppId = el.dataset.appid;
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  // Swap the letter for the image only once it really loaded, so a broken link never shows.
  img.onload = () => {
    if (el.dataset.appid !== forAppId) return; // element was reused for another game meanwhile
    el.textContent = '';
    el.appendChild(img);
  };
  img.src = url;
}

function createIconEl(game) {
  const el = document.createElement('span');
  el.className = 'game-icon';
  el.dataset.appid = String(game?.appId ?? game?.id ?? '');
  el.textContent = iconLetter(game?.name);

  const cached = iconUrlCache.get(el.dataset.appid);
  if (cached) applyIconImage(el, cached);
  return el;
}

async function requestIcon(el) {
  const appId = el?.dataset?.appid;
  if (!appId || el.dataset.iconState === 'loading' || el.dataset.iconState === 'done') return;

  const cached = iconUrlCache.get(appId);
  if (cached) {
    el.dataset.iconState = 'done';
    applyIconImage(el, cached);
    return;
  }

  if (!launcherApi.getGameIcon) return;

  el.dataset.iconState = 'loading';
  let url = '';
  try {
    const r = await launcherApi.getGameIcon(appId);
    url = r?.url || '';
  } catch {
    url = '';
  }

  if (el.dataset.appid !== appId) return; // reused for another game meanwhile
  if (url) {
    iconUrlCache.set(appId, url);
    el.dataset.iconState = 'done';
    applyIconImage(el, url);
  } else {
    delete el.dataset.iconState; // no icon (or temporary failure): ask again next time it is shown
  }
}

function createIconObserver(rootEl) {
  if (typeof IntersectionObserver === 'undefined') return null;
  return new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      requestIcon(entry.target);
    }
  }, { root: rootEl, rootMargin: '120px' });
}

function watchIcon(observer, el) {
  if (!el || el.querySelector('img')) return;
  if (observer) observer.observe(el);
  else requestIcon(el);
}

let sidebarIconObserver = null;
let modalIconObserver = null;

function setHeroIcon(game) {
  const heroIconEl = document.getElementById('heroIcon');
  if (!heroIconEl) return;

  heroIconEl.textContent = iconLetter(game?.name);
  heroIconEl.dataset.appid = String(game?.appId ?? '');
  delete heroIconEl.dataset.iconState;
  heroIconEl.style.display = 'inline-flex';

  const cached = iconUrlCache.get(heroIconEl.dataset.appid);
  if (cached) applyIconImage(heroIconEl, cached);
  else requestIcon(heroIconEl);
}

// The library can hold thousands of games (see "Add ALL recognized games"); drawing every row
// at once would make the sidebar sluggish, so only the first rows that match are drawn.
const MAIN_LIST_LIMIT = 500;
const nameCollator = new Intl.Collator();

function renderMainList(filter = '') {
  gameListEl.innerHTML = '';

  if (sidebarIconObserver) sidebarIconObserver.disconnect();
  sidebarIconObserver = createIconObserver(gameListEl);

  const sortedGames = [...myGames].sort((a, b) => {
    if (a.isFavorite === b.isFavorite) return nameCollator.compare(a.name, b.name);
    return a.isFavorite ? -1 : 1;
  });

  const term = filter.toLowerCase();
  let matched = 0;
  let shown = 0;
  for (const game of sortedGames) {
    if (!game.name.toLowerCase().includes(term)) continue;

    matched += 1;
    if (shown >= MAIN_LIST_LIMIT) continue;
    shown += 1;

    const div = document.createElement('div');
    const running = isGameRunning(game);
    div.className = `game-item ${selectedGame === game ? 'active' : ''} ${game.isFavorite ? 'favorite' : ''}`;

    div.innerHTML = `
      <div class="game-status-dot ${running ? 'active' : ''}" aria-label="${running ? t('sidebar.running') : t('sidebar.stopped')}"></div>
      <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(game.name)}</div>
      <div class="fav-icon">${starSvg}</div>
    `;

    const iconEl = createIconEl(game);
    div.insertBefore(iconEl, div.children[1]);
    watchIcon(sidebarIconObserver, iconEl);

    div.addEventListener('click', async (e) => {
      if (e.target.closest('.fav-icon')) {
        await toggleFavorite(game);
      } else {
        await selectGame(game);
      }
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openGameContextMenu(game, e.clientX, e.clientY);
    });

    gameListEl.appendChild(div);
  }

  if (matched > shown) {
    const note = document.createElement('div');
    note.className = 'list-note';
    note.textContent = t('sidebar.listNote', { shown, matched });
    gameListEl.appendChild(note);
  }
}

function closeContextMenu() {
  contextMenuEl.style.display = 'none';
  contextMenuEl.innerHTML = '';
}

function openGameContextMenu(game, x, y) {
  if (!game) return;

  contextMenuEl.innerHTML = `
    <div class="context-menu-item" id="ctxShortcut">${escapeHtml(t('ctx.shortcut'))}</div>
    <div class="context-menu-item danger" id="ctxDelete">${escapeHtml(t('ctx.delete'))}</div>
  `;

  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  contextMenuEl.style.display = 'block';

  // Position first, then clamp after layout
  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;

  requestAnimationFrame(() => {
    const rect = contextMenuEl.getBoundingClientRect();
    let left = x;
    let top = y;

    if (left + rect.width + margin > vw) left = Math.max(margin, vw - rect.width - margin);
    if (top + rect.height + margin > vh) top = Math.max(margin, vh - rect.height - margin);

    contextMenuEl.style.left = `${left}px`;
    contextMenuEl.style.top = `${top}px`;
  });

  const shortcutBtn = document.getElementById('ctxShortcut');
  const deleteBtn = document.getElementById('ctxDelete');

  shortcutBtn.addEventListener('click', async () => {
    closeContextMenu();
    log(t('log.shortcutCreating', { name: game.name }));

    const r = await launcherApi.createShortcut(game.appId, game.exe);
    if (!r?.ok) {
      log(t('log.shortcutFailed', { error: r?.error || t('log.unknownError') }), 'log-danger');
      return;
    }

    log(t('log.shortcutCreated', { path: r.path }), 'log-success');
  });

  deleteBtn.addEventListener('click', async () => {
    // Avoid deleting the currently running selection
      if (isGameRunning(game) && selectedGame && makeGameKey(selectedGame) === makeGameKey(game)) {
      log(t('log.stopBeforeDelete'), 'log-danger');
      closeContextMenu();
      return;
    }

    await launcherApi.deleteGame(game.appId, game.exe);
    closeContextMenu();
    await refreshMyGames();

    // If deleted selected game (not running), clear selection
    if (selectedGame && selectedGame.appId === game.appId && selectedGame.exe === game.exe) {
      selectedGame = null;
      heroEmptyState.style.display = 'flex';
      heroContent.style.display = 'none';
      renderMainList(searchInput.value);
      updateDetailsPanel();
    }

    log(t('log.deleted', { name: game.name }), 'log-success');
  });
}

async function toggleFavorite(game) {
  const updated = await launcherApi.toggleFavorite(game.appId, game.exe);
  if (updated) {
    game.isFavorite = updated.isFavorite;
    renderMainList(searchInput.value);

    if (selectedGame && selectedGame.appId === game.appId && selectedGame.exe === game.exe) {
      selectedGame.isFavorite = updated.isFavorite;
      updateDetailsPanel();
    }
  }
}

async function selectGame(game) {
  selectedGame = game;

  heroEmptyState.style.display = 'none';
  heroContent.style.display = 'flex';

  document.getElementById('heroTitle').innerText = game.name;
  document.getElementById('heroExe').innerText = game.exe;
  setHeroIcon(game);

  updateDetailsPanel();

  await launcherApi.selectGame(game);

  syncSelectedGameLaunchState();
  renderMainList(searchInput.value);
}

function openModal() {
  addGameModal.style.display = 'flex';
  modalSearchInput.value = '';
  resetAndRenderModal('');
}

function closeModal() {
  addGameModal.style.display = 'none';
}

function showUpdateModal(payload) {
  if (!payload || !updateModal) return;

  updateUiState.visible = true;
  updateUiState.installing = false;

  updateInstallBtn.disabled = false;
  updateRemindBtn.disabled = false;
  updateInstallBtn.textContent = t('update.install');

  const version = payload.version ? `v${payload.version}` : t('update.newVersion');
  updateSubtitle.textContent = payload.releaseName
    ? `${version} — ${payload.releaseName}`
    : version;

  updateNotes.innerHTML = renderReleaseNotesHtml(payload.releaseNotes);

  if (updateProgressWrap) {
    updateProgressWrap.style.display = 'none';
    updateProgressFill.style.width = '0%';
    updateProgressText.textContent = t('update.downloading');
  }

  updateModal.style.display = 'flex';
}

function hideUpdateModal() {
  updateUiState.visible = false;
  updateUiState.installing = false;
  updateModal.style.display = 'none';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function setUpdateProgress(percent, payload) {
  if (!updateProgressWrap) return;
  updateProgressWrap.style.display = 'block';

  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  updateProgressFill.style.width = `${pct}%`;

  if (payload && Number.isFinite(payload.total) && payload.total > 0) {
    const speed = payload.bytesPerSecond ? ` — ${formatBytes(payload.bytesPerSecond)}/s` : '';
    updateProgressText.textContent =
      `${t('update.downloading')} ${pct}% (${formatBytes(payload.transferred)} / ${formatBytes(payload.total)})${speed}`;
  } else {
    updateProgressText.textContent = `${t('update.downloading')} ${pct}%`;
  }
}

// --- RELEASE NOTES SANITIZER/RENDERER ---
// GitHub release notes arrive as HTML (markdown already converted upstream).
// We only allow a small whitelist of formatting tags and strip everything
// else (including <img> tags entirely, per design) to avoid XSS and to keep
// the rendered notes looking like the GitHub release page.
const RELEASE_NOTES_ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S',
  'UL', 'OL', 'LI', 'A', 'CODE', 'PRE', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'SPAN'
]);
const RELEASE_NOTES_DROP_TAGS = new Set([
  'IMG', 'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED',
  'VIDEO', 'AUDIO', 'SVG', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON'
]);
const RELEASE_NOTES_SAFE_URL_RE = /^(https?:|mailto:)/i;

function sanitizeReleaseNotesNode(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;

    if (RELEASE_NOTES_DROP_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (tag === 'A' && name === 'href') {
        if (!RELEASE_NOTES_SAFE_URL_RE.test(attr.value.trim())) child.removeAttribute(attr.name);
        continue;
      }
      child.removeAttribute(attr.name);
    }

    if (tag === 'A') {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }

    if (!RELEASE_NOTES_ALLOWED_TAGS.has(tag)) {
      sanitizeReleaseNotesNode(child);
      while (child.firstChild) node.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }

    sanitizeReleaseNotesNode(child);
  }
}

function renderReleaseNotesHtml(rawNotes) {
  const text = String(rawNotes || '').trim();
  if (!text) return `<p style="color:var(--text-muted);">${escapeHtml(t('update.noNotes'))}</p>`;

  // Plain text (no HTML tags) - escape and preserve line breaks.
  if (!/<[a-z!/][\s\S]*>/i.test(text)) {
    const escapeDiv = document.createElement('div');
    escapeDiv.textContent = text;
    return `<p>${escapeDiv.innerHTML.replace(/\n/g, '<br>')}</p>`;
  }

  const doc = new DOMParser().parseFromString(`<div id="release-notes-root">${text}</div>`, 'text/html');
  const root = doc.getElementById('release-notes-root');
  if (!root) return '';

  sanitizeReleaseNotesNode(root);
  return root.innerHTML;
}
// ------------------------------------------

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function resetAndRenderModal(filter) {
    updateDetailsPanel();
  modalState = {
    filter: String(filter || ''),
    offset: 0,
    limit: 200,
    hasMore: false,
    loading: false
  };
  modalListEl.innerHTML = '';
  if (modalIconObserver) modalIconObserver.disconnect();
  modalIconObserver = createIconObserver(modalListEl);
  renderNextModalPage();
}

// --- NEW DETECTION WARNING PROMISE HELPERS ---
function promptDetectionWarning() {
  return new Promise((resolve) => {
    const modal = document.getElementById('warningModal');
    const closeBtn = document.getElementById('warningCloseBtn');
    const cancelBtn = document.getElementById('warningCancelBtn');
    const confirmBtn = document.getElementById('warningConfirmBtn');

    if (!modal) return resolve(true);

    modal.style.display = 'flex';

    const handleChoice = (proceed) => {
      modal.style.display = 'none';
      closeBtn.onclick = null;
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      resolve(proceed);
    };

    closeBtn.onclick = () => handleChoice(false);
    cancelBtn.onclick = () => handleChoice(false);
    confirmBtn.onclick = () => handleChoice(true);
  });
}
// ---------------------------------------------

async function renderNextModalPage() {
  if (modalState.loading) return;
  modalState.loading = true;

  let page;
  try {
    page = await launcherApi.getDatabaseGames(modalState.filter, modalState.offset, modalState.limit);
  } catch (e) {
    modalState.loading = false;
    modalListEl.innerHTML = `<div style="padding:20px; text-align:center;">${escapeHtml(t('modal.dbNotReady', { error: String(e.message || e) }))}</div>`;
      updateDetailsPanel();
    return;
  }

  const frag = document.createDocumentFragment();
  const items = Array.isArray(page?.items) ? page.items : [];

  for (const game of items) {
    if (myGames.some(mg => mg.appId === game.id && mg.exe === game.exe)) continue;

    const div = document.createElement('div');
    updateDetailsPanel();
    div.className = 'modal-item';
    div.innerHTML = `
      <div class="modal-item-info">
        <span class="modal-item-name">${escapeHtml(game.name)}</span>
        <span class="modal-item-exe">${escapeHtml(game.exe)}</span>
      </div>
      <div class="modal-item-add">${escapeHtml(t('modal.add'))}</div>
    `;

    const modalIconEl = createIconEl({ appId: game.id, name: game.name });
    div.insertBefore(modalIconEl, div.firstChild);
    watchIcon(modalIconObserver, modalIconEl);

    div.onclick = async () => {
      // --- CHECK DETECTION FLAG BEFORE ADDING ---
      if (game.usesNewDetection) {
        const userWantsToProceed = await promptDetectionWarning();
        if (!userWantsToProceed) {
          log(t('log.cancelledAdd', { name: game.name }), 'log-entry');
          return; // Abort silently
        }
      }
      // ------------------------------------------

      const installed = await launcherApi.addGame(game);
      log(t('log.installed', { name: installed.name }), 'log-success');
      closeModal();
      await refreshMyGames();
      await selectGame(myGames[myGames.length - 1]);
    };

    frag.appendChild(div);
  }

  modalListEl.appendChild(frag);

  const hasAnyRows = modalListEl.querySelector('.modal-item') != null;
  if (!hasAnyRows && modalState.offset === 0) {
    modalListEl.innerHTML = `<div style="padding:20px; text-align:center;">${escapeHtml(t('modal.noResults'))}</div>`;
  }

  modalState.hasMore = Boolean(page?.hasMore);
  modalState.offset += Number.isFinite(page?.items?.length) ? page.items.length : items.length;
  modalState.loading = false;
}

async function refreshMyGames() {
  myGames = await launcherApi.getMyGames();
  renderMainList(searchInput.value);

  // Empty state by default
  if (!myGames.length) {
    selectedGame = null;
    heroEmptyState.style.display = 'flex';
    heroContent.style.display = 'none';
  }
}

async function ensureDatabaseSynced() {
  try {
    const r = await launcherApi.syncGameList();
    if (r.offline) {
      log(t('log.syncOffline'), 'log-danger');
    } else {
      log(r.updated ? t('log.synced') : t('log.upToDate'), 'log-success');
    }
  } catch (e) {
    log(t('log.syncFailed', { error: String(e.message || e) }), 'log-danger');
  }
}

launchBtn.addEventListener('click', async () => {
  if (!selectedGame) return;

  const selectedKey = makeGameKey(selectedGame);
  const currentlyRunning = isGameRunning(selectedGame);

  if (!currentlyRunning) {
    launchBtn.classList.add('running');
    document.getElementById('launchBtnText').innerText = t('btn.stop');
    document.getElementById('playIcon').style.display = 'none';
    document.getElementById('stopIcon').style.display = 'block';

    statusDot.style.backgroundColor = 'var(--success)';
    statusDot.style.color = 'var(--success)';
    statusText.innerText = t('status.playing');
    statusText.style.color = 'var(--success)';

    const r = await launcherApi.launchGame(selectedGame);
    if (r.ok) {
      runningGames.add(selectedKey);
      renderMainList(searchInput.value);
      syncSelectedGameLaunchState();
      log(t('log.started', { exe: selectedGame.exe }), 'log-success');
    } else {
      log(t('log.launchFailed', { error: r.error || t('log.unknownError') }), 'log-danger');
      launchBtn.classList.remove('running');
      resetHeroState();
    }
  } else {
    await launcherApi.stopGame(selectedGame);
    runningGames.delete(selectedKey);
    renderMainList(searchInput.value);
    syncSelectedGameLaunchState();
    log(t('log.terminated'), 'log-danger');
  }
});

document.getElementById('openAddModalBtn').onclick = openModal;
document.getElementById('closeModalBtn').onclick = closeModal;
searchInput.addEventListener('input', (e) => renderMainList(e.target.value));
const onModalSearch = debounce((value) => resetAndRenderModal(value), 200);
modalSearchInput.addEventListener('input', (e) => onModalSearch(e.target.value));

modalListEl.addEventListener('scroll', () => {
  if (!addGameModal || addGameModal.style.display !== 'flex') return;
  if (!modalState.hasMore) return;
  if (modalState.loading) return;

  const remaining = modalListEl.scrollHeight - (modalListEl.scrollTop + modalListEl.clientHeight);
  if (remaining < 250) {
    renderNextModalPage();
  }
});

// Close context menu on outside click / escape
document.addEventListener('click', (e) => {
  if (contextMenuEl.style.display === 'none') return;
  if (e.target && contextMenuEl.contains(e.target)) return;
  closeContextMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu();
});

window.addEventListener('blur', () => closeContextMenu());

// ───────────────────────────────────────────────────────────
// Updates: the user is told when a newer version is released and updates with one click.
// ───────────────────────────────────────────────────────────
const updateBadge = document.getElementById('updateBadge');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const appVersionEl = document.getElementById('appVersion');

let availableUpdate = null; // last "update available" payload from the main process
const dismissedUpdateVersions = new Set(); // versions the user chose "remind me later" for (this run only)
let appVersion = '';

function refreshUpdateBadge() {
  if (!updateBadge) return;
  if (availableUpdate && !updateUiState.installing) {
    updateBadge.textContent = t('update.badge', { version: availableUpdate.version });
    updateBadge.style.display = 'inline-flex';
  } else {
    updateBadge.style.display = 'none';
  }
}

function handleUpdateAvailable(payload) {
  if (!payload || !payload.version) return;
  availableUpdate = payload;
  refreshUpdateBadge();

  // A download is already running for this update: do not reset the progress window.
  if (updateUiState.installing) return;

  log(t('update.availableLog', { version: payload.version }), 'log-success');
  if (!dismissedUpdateVersions.has(payload.version)) showUpdateModal(payload);
}

async function dismissUpdateModal() {
  if (updateUiState.installing) return; // keep the progress window while downloading
  if (availableUpdate?.version) dismissedUpdateVersions.add(availableUpdate.version);
  try { await launcherApi.remindUpdateLater(); } catch { /* ignore */ }
  hideUpdateModal();
  refreshUpdateBadge();
}

if (updateCloseBtn) updateCloseBtn.addEventListener('click', dismissUpdateModal);
if (updateRemindBtn) updateRemindBtn.addEventListener('click', dismissUpdateModal);

if (updateBadge) {
  updateBadge.addEventListener('click', () => {
    if (availableUpdate && !updateUiState.installing) showUpdateModal(availableUpdate);
  });
}

if (updateInstallBtn) {
  updateInstallBtn.addEventListener('click', async () => {
    if (updateUiState.installing) return;
    updateUiState.installing = true;
    updateInstallBtn.disabled = true;
    updateRemindBtn.disabled = true;
    updateInstallBtn.textContent = t('update.downloadingBtn');
    setUpdateProgress(0, null);
    refreshUpdateBadge();

    const r = await launcherApi.installUpdate();
    if (!r?.ok) {
      log(t('update.failed', { error: r?.error || t('log.unknownError') }), 'log-danger');
      updateUiState.installing = false;
      updateInstallBtn.disabled = false;
      updateRemindBtn.disabled = false;
      updateInstallBtn.textContent = t('update.install');
      if (updateProgressWrap) updateProgressWrap.style.display = 'none';
      refreshUpdateBadge();
    }
  });
}

if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener('click', async () => {
    if (updateUiState.installing) return;
    checkUpdateBtn.disabled = true;
    checkUpdateBtn.textContent = t('update.checking');
    try {
      const r = await launcherApi.checkForUpdates();
      if (!r?.ok) {
        log(r?.devBuild ? t('update.devOnly') : t('update.error', { error: r?.error || t('log.unknownError') }), 'log-danger');
      } else if (r.available) {
        // Asked on purpose: show the window even if "remind me later" was chosen before.
        dismissedUpdateVersions.delete(r.version);
        if (availableUpdate && !updateUiState.visible) showUpdateModal(availableUpdate);
      } else {
        availableUpdate = null;
        refreshUpdateBadge();
        log(t('update.upToDate'), 'log-success');
      }
    } catch (e) {
      log(t('update.error', { error: String(e?.message || e) }), 'log-danger');
    } finally {
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = t('update.check');
    }
  });
}

// ───────────────────────────────────────────────────────────
// Popular games pack
// ───────────────────────────────────────────────────────────
const addPopularBtn = document.getElementById('addPopularBtn');
if (addPopularBtn) {
  addPopularBtn.addEventListener('click', async () => {
    addPopularBtn.disabled = true;
    addPopularBtn.textContent = t('common.adding');
    try {
      const r = await launcherApi.addPopularGames();
      if (!r?.ok || r.matched === 0) {
        log(t('log.popularNone'), 'log-danger');
        return;
      }
      log(t('log.popularAdded', { added: r.added, skipped: r.matched - r.added }), 'log-success');
      closeModal();
      await refreshMyGames();
    } catch (e) {
      log(t('log.popularFailed', { error: String(e?.message || e) }), 'log-danger');
    } finally {
      addPopularBtn.disabled = false;
      addPopularBtn.textContent = t('modal.addPopular');
    }
  });
}

// ───────────────────────────────────────────────────────────
// Add ALL recognized games
// ───────────────────────────────────────────────────────────
const addAllBtn = document.getElementById('addAllBtn');
if (addAllBtn) {
  addAllBtn.addEventListener('click', async () => {
    const proceed = window.confirm(t('log.allConfirm'));
    if (!proceed) return;

    addAllBtn.disabled = true;
    addAllBtn.textContent = t('common.adding');
    try {
      const r = await launcherApi.addAllGames();
      if (!r?.ok) {
        log(t('log.allFailed', { error: r?.error || t('log.unknownError') }), 'log-danger');
        return;
      }
      log(t('log.allAdded', { added: r.added, skipped: r.matched - r.added }), 'log-success');
      closeModal();
      await refreshMyGames();
    } catch (e) {
      log(t('log.allFailed', { error: String(e?.message || e) }), 'log-danger');
    } finally {
      addAllBtn.disabled = false;
      addAllBtn.textContent = t('modal.addAll');
    }
  });
}

// ───────────────────────────────────────────────────────────
// Random mode
// ───────────────────────────────────────────────────────────
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

const randomModal = document.getElementById('randomModal');
const openRandomModalBtn = document.getElementById('openRandomModalBtn');
const randomBtnText = document.getElementById('randomBtnText');
const randomCloseBtn = document.getElementById('randomCloseBtn');
const randomMinutesInput = document.getElementById('randomMinutes');
const randomSourceSelect = document.getElementById('randomSource');
const randomPoolEl = document.getElementById('randomPool');
const randomStateEl = document.getElementById('randomState');
const randomCurrentEl = document.getElementById('randomCurrent');
const randomCountdownEl = document.getElementById('randomCountdown');
const randomSwitchesEl = document.getElementById('randomSwitches');
const randomErrorRow = document.getElementById('randomErrorRow');
const randomErrorEl = document.getElementById('randomError');
const randomToggleBtn = document.getElementById('randomToggleBtn');
const randomToggleText = document.getElementById('randomToggleText');

let randomStatus = { active: false };
let randomCurrentKey = '';
let randomCountdownTimer = null;
let randomBusy = false;

function readRandomPrefs() {
  try {
    const minutes = Number(localStorage.getItem('randomMinutes'));
    const source = localStorage.getItem('randomSource');
    if (Number.isFinite(minutes) && minutes >= 1) randomMinutesInput.value = String(Math.min(1440, Math.round(minutes)));
    if (source === 'library' || source === 'database') randomSourceSelect.value = source;
  } catch { /* storage may be unavailable */ }
}

function saveRandomPrefs() {
  try {
    localStorage.setItem('randomMinutes', String(randomMinutesInput.value));
    localStorage.setItem('randomSource', String(randomSourceSelect.value));
  } catch { /* ignore */ }
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateRandomCountdown() {
  const rbCountdown = document.getElementById('rbCountdown');
  const rbFill = document.getElementById('rbFill');

  if (!randomStatus?.active) {
    randomCountdownEl.textContent = '—';
    if (rbCountdown) rbCountdown.textContent = '—';
    if (rbFill) rbFill.style.width = '0%';
    return;
  }

  const text = randomStatus.nextSwitchAt
    ? formatCountdown(randomStatus.nextSwitchAt - Date.now())
    : t('random.switching');
  randomCountdownEl.textContent = text;
  if (rbCountdown) rbCountdown.textContent = text;

  // Progress bar: how much of the current interval has already passed.
  const total = (Number(randomStatus.intervalMinutes) || 0) * 60 * 1000;
  if (rbFill && total > 0 && randomStatus.nextSwitchAt) {
    const left = Math.max(0, Math.min(total, randomStatus.nextSwitchAt - Date.now()));
    rbFill.style.width = `${(100 - (left / total) * 100).toFixed(1)}%`;
  }
}

// Game "cards" (icon + name) shown in the Random Mode bar and in its settings window.
let randomCardsKey = '';

function fillGameCard(el, labelKey, game, emptyKey) {
  if (!el) return;
  el.textContent = '';

  const icon = createIconEl({ appId: game?.appId, name: game?.name });
  const info = document.createElement('div');
  info.className = 'rb-info';

  const label = document.createElement('span');
  label.className = 'rb-label';
  label.textContent = t(labelKey);

  const name = document.createElement('span');
  name.className = 'rb-name';
  name.textContent = game?.name || (emptyKey ? t(emptyKey) : '—');
  name.title = game?.name || '';

  info.append(label, name);
  if (game?.exe) {
    const exe = document.createElement('span');
    exe.className = 'rb-exe';
    exe.textContent = game.exe;
    info.append(exe);
  }

  el.append(icon, info);
  if (game) watchIcon(null, icon);
}

function renderRandomCards() {
  const active = Boolean(randomStatus?.active);
  const bar = document.getElementById('randomBar');
  const modalGames = document.getElementById('rmGames');
  if (bar) bar.style.display = active ? 'block' : 'none';
  if (modalGames) modalGames.style.display = active ? 'flex' : 'none';

  if (!active) {
    randomCardsKey = '';
    return;
  }

  const key = `${currentLanguage}|${randomStatus.current?.key || ''}|${randomStatus.next?.key || ''}`;
  if (key === randomCardsKey) return; // icons are only redrawn when a game changes
  randomCardsKey = key;

  for (const [id, labelKey, game, emptyKey] of [
    ['rbNow', 'random.nowPlaying', randomStatus.current, 'random.switching'],
    ['rbNext', 'random.next', randomStatus.next, 'random.pickingNext'],
    ['rmNow', 'random.nowPlaying', randomStatus.current, 'random.switching'],
    ['rmNext', 'random.next', randomStatus.next, 'random.pickingNext']
  ]) {
    fillGameCard(document.getElementById(id), labelKey, game, emptyKey);
  }
}

function renderRandomStatus() {
  const active = Boolean(randomStatus?.active);

  randomStateEl.textContent = active ? t('random.running') : t('random.stopped');
  randomStateEl.style.color = active ? 'var(--success)' : 'var(--text-muted)';
  randomCurrentEl.textContent = randomStatus?.current?.name || '—';
  randomSwitchesEl.textContent = String(randomStatus?.switches || 0);

  const issue = randomStatus?.lastError || '';
  randomErrorRow.style.display = issue ? 'block' : 'none';
  randomErrorEl.textContent = issue;

  randomMinutesInput.disabled = active;
  randomSourceSelect.disabled = active;
  randomToggleBtn.classList.toggle('running', active);
  randomToggleText.textContent = active ? t('random.stop') : t('random.start');

  openRandomModalBtn.classList.toggle('active', active);
  randomBtnText.textContent = active ? t('sidebar.randomOn') : t('sidebar.random');

  // While Random Mode is on, games cannot be launched or stopped by hand.
  launchBtn.disabled = active;
  launchBtn.title = active ? t('random.manualLocked') : '';
  const lockHint = document.getElementById('lockHint');
  if (lockHint) lockHint.style.display = active ? 'block' : 'none';

  renderRandomCards();

  updateRandomCountdown();

  if (active && !randomCountdownTimer) {
    randomCountdownTimer = window.setInterval(updateRandomCountdown, 1000);
  } else if (!active && randomCountdownTimer) {
    window.clearInterval(randomCountdownTimer);
    randomCountdownTimer = null;
  }
}

async function refreshRandomPoolSize() {
  try {
    const r = await launcherApi.getRandomPoolSize(randomSourceSelect.value);
    randomPoolEl.textContent = t('random.pool', { n: r?.size ?? 0 });
  } catch {
    randomPoolEl.textContent = 'Pool: —';
  }
}

function applyRandomStatus(status) {
  const previousKey = randomCurrentKey;
  const nextKey = status?.current?.key || '';

  // Keep the sidebar "running" dots in sync with what random mode launched/stopped.
  if (previousKey && previousKey !== nextKey) runningGames.delete(previousKey);
  if (nextKey) runningGames.add(nextKey);

  if (nextKey && nextKey !== previousKey) {
    log(t('log.randomPlaying', { name: status.current.name }), 'log-success');
  } else if (randomStatus?.active && !status?.active) {
    log(t('log.randomStopped'), 'log-danger');
  }
  if (status?.lastError && status.lastError !== randomStatus?.lastError) {
    log(t('log.randomIssue', { error: status.lastError }), 'log-danger');
  }

  randomCurrentKey = nextKey;
  randomStatus = status || { active: false };

  renderRandomStatus();
  renderMainList(searchInput.value);
  syncSelectedGameLaunchState();
}

openRandomModalBtn.addEventListener('click', async () => {
  readRandomPrefs();
  randomModal.style.display = 'flex';
  try {
    randomStatus = (await launcherApi.getRandomStatus()) || { active: false };
  } catch {
    randomStatus = { active: false };
  }
  renderRandomStatus();
  refreshRandomPoolSize();
});

randomCloseBtn.addEventListener('click', () => { randomModal.style.display = 'none'; });
randomSourceSelect.addEventListener('change', () => { saveRandomPrefs(); refreshRandomPoolSize(); });
randomMinutesInput.addEventListener('change', saveRandomPrefs);

randomToggleBtn.addEventListener('click', async () => {
  if (randomBusy) return;
  randomBusy = true;
  randomToggleBtn.disabled = true;

  try {
    if (randomStatus?.active) {
      await launcherApi.stopRandomMode();
    } else {
      const minutes = Number(randomMinutesInput.value);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        log(t('log.randomMinutes'), 'log-danger');
        return;
      }
      saveRandomPrefs();
      randomToggleText.textContent = t('random.starting');
      const r = await launcherApi.startRandomMode(minutes, randomSourceSelect.value);
      if (!r?.ok) {
        log(t('log.randomCouldNotStart', { error: r?.error || t('log.randomCannotStart') }), 'log-danger');
        renderRandomStatus();
      }
    }
  } catch (e) {
    log(t('log.randomError', { error: String(e?.message || e) }), 'log-danger');
    renderRandomStatus();
  } finally {
    randomBusy = false;
    randomToggleBtn.disabled = false;
  }
});

if (launcherApi.onRandomChanged) {
  launcherApi.onRandomChanged((status) => applyRandomStatus(status));
}

// Window controls
const minBtn = document.getElementById('minBtn');
const closeBtn = document.getElementById('closeBtn');
minBtn.addEventListener('click', () => launcherApi.minimize());
closeBtn.addEventListener('click', () => launcherApi.close());

launcherApi.onGameExited((payload = {}) => {
  const exitedKey = payload && payload.gameKey ? String(payload.gameKey) : '';
  if (!exitedKey) return;

  runningGames.delete(exitedKey);
  renderMainList(searchInput.value);
  if (selectedGame && makeGameKey(selectedGame) === exitedKey) {
    syncSelectedGameLaunchState();
    log(t('log.exited'), 'log-danger');
  }
  updateDetailsPanel();
});

document.getElementById('rbManage')?.addEventListener('click', () => openRandomModalBtn.click());
document.getElementById('rbStop')?.addEventListener('click', () => randomToggleBtn.click());

// "Show fake game window" switch (on = normal window, the default; off = starts minimized).
const showWindowToggle = document.getElementById('showWindowToggle');
if (showWindowToggle) {
  showWindowToggle.addEventListener('change', async () => {
    try { await launcherApi.setShowFakeWindow(showWindowToggle.checked); } catch { /* ignore */ }
  });
}

// ───────────────────────────────────────────────────────────
// Language switching
// ───────────────────────────────────────────────────────────
const langSelect = document.getElementById('langSelect');

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });

  if (langSelect) {
    langSelect.setAttribute('aria-label', t('common.language'));
    if (langSelect.parentElement) langSelect.parentElement.title = t('common.language');
  }
  if (appVersionEl) appVersionEl.textContent = appVersion ? t('credits.version', { version: appVersion }) : '';
}

function applyLanguage(language) {
  currentLanguage = I18N.normalizeLanguage(language);
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage); } catch { /* ignore */ }
  if (langSelect) langSelect.value = currentLanguage;

  applyStaticTranslations();

  // Texts that depend on the current state are drawn again.
  syncSelectedGameLaunchState();
  renderMainList(searchInput.value);
  renderRandomStatus();
  refreshRandomPoolSize();
  if (!updateUiState.installing && updateInstallBtn) updateInstallBtn.textContent = t('update.install');
  if (checkUpdateBtn && !checkUpdateBtn.disabled) checkUpdateBtn.textContent = t('update.check');
  refreshUpdateBadge();
}

if (langSelect) {
  for (const lang of I18N.LANGUAGES) {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.short;
    option.title = lang.label;
    langSelect.appendChild(option);
  }
  langSelect.value = currentLanguage;
  langSelect.addEventListener('change', () => applyLanguage(langSelect.value));
}

(async function init() {
  applyStaticTranslations();

  // Listen for update events before anything slow (the game list sync) so none is missed.
  if (launcherApi.onUpdateAvailable) {
    launcherApi.onUpdateAvailable((payload) => handleUpdateAvailable(payload));
  }
  if (launcherApi.onUpdateProgress) {
    launcherApi.onUpdateProgress((payload) => {
      setUpdateProgress(payload?.percent || 0, payload);
    });
  }
  if (launcherApi.onUpdateDownloaded) {
    launcherApi.onUpdateDownloaded(async () => {
      setUpdateProgress(100, null);
      if (updateProgressText) updateProgressText.textContent = t('update.complete');
      if (updateInstallBtn) updateInstallBtn.textContent = t('update.installing');
      log(t('update.downloadedLog'), 'log-success');
      // Opens the downloaded installer and quits this app so it can run.
      await launcherApi.quitAndInstallUpdate();
    });
  }
  if (launcherApi.onUpdateError) {
    launcherApi.onUpdateError((payload) => {
      log(t('update.error', { error: payload?.message || t('log.unknownError') }), 'log-danger');
    });
  }

  if (launcherApi.getAppVersion) {
    try {
      appVersion = String((await launcherApi.getAppVersion()) || '');
      applyStaticTranslations();
    } catch { /* version is only informative */ }
  }

  if (showWindowToggle && launcherApi.getSettings) {
    try { showWindowToggle.checked = (await launcherApi.getSettings())?.showFakeWindow !== false; } catch { /* ignore */ }
  }

  // Random Mode may already be running (the window can be reloaded): show it right away.
  try {
    const current = await launcherApi.getRandomStatus();
    if (current?.active) applyRandomStatus(current);
  } catch { /* ignore */ }

  await ensureDatabaseSynced();
  await refreshMyGames();
  renderMainList('');

  // An update found while the window was still starting is asked for here.
  if (launcherApi.getPendingUpdate) {
    try {
      const pending = await launcherApi.getPendingUpdate();
      if (pending && !availableUpdate) handleUpdateAvailable(pending);
    } catch { /* ignore */ }
  }
})();
