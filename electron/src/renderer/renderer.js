/* global launcherApi */

const starSvg = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

let myGames = [];
let selectedGame = null;

// Games currently running, as reported by the main process: [{ appId, name, exe, startedAt }]
let runningGames = [];

let modalState = {
  filter: '',
  sort: 'name',
  offset: 0,
  limit: 200,
  hasMore: false,
  loading: false,
  requestId: 0
};

// Same key format as src/launcher-state.js (the renderer can't require it).
function makeGameKey(game) {
  if (!game || typeof game !== 'object') return '';
  const appId = String(game.appId ?? '');
  const exe = String(game.exe ?? '');
  const key = `${appId}::${exe}`;
  return key === '::' ? '' : key;
}

function sameGame(a, b) {
  const key = makeGameKey(a);
  return Boolean(key) && key === makeGameKey(b);
}

function isGameRunning(game) {
  const key = makeGameKey(game);
  return Boolean(key) && runningGames.some(r => makeGameKey(r) === key);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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
const modalCountEl = document.getElementById('modalCount');

// Running games panel
const runningPanel = document.getElementById('runningPanel');
const runningCountEl = document.getElementById('runningCount');
const runningListEl = document.getElementById('runningList');

// Custom game modal
const customGameModal = document.getElementById('customGameModal');
const customNameInput = document.getElementById('customNameInput');
const customExeInput = document.getElementById('customExeInput');
const customErrorEl = document.getElementById('customError');

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
  const t = new Date().toLocaleTimeString([], { hour12: false });
  div.innerHTML = `<span class="log-time">[${t}]</span> `;
  div.appendChild(document.createTextNode(String(msg)));
  logArea.appendChild(div);
  logArea.scrollTop = logArea.scrollHeight;
}

// Hero reflects whether the *selected* game is running; other games may be running too.
function resetHeroState() {
  const running = isGameRunning(selectedGame);

  if (running) {
    statusDot.style.backgroundColor = 'var(--success)';
    statusDot.style.color = 'var(--success)';
    statusText.innerText = 'Playing Now';
    statusText.style.color = 'var(--success)';

    launchBtn.classList.add('running');
    document.getElementById('launchBtnText').innerText = 'Stop Playing';
    document.getElementById('playIcon').style.display = 'none';
    document.getElementById('stopIcon').style.display = 'block';
  } else {
    statusDot.style.backgroundColor = 'var(--text-muted)';
    statusDot.style.color = 'var(--text-muted)';
    statusText.innerText = 'Ready';
    statusText.style.color = 'var(--text-muted)';

    launchBtn.classList.remove('running');
    document.getElementById('launchBtnText').innerText = 'Launch Game';
    document.getElementById('playIcon').style.display = 'block';
    document.getElementById('stopIcon').style.display = 'none';
  }

  updateDetailsPanel();
}

function renderRunningPanel() {
  runningPanel.style.display = runningGames.length ? 'block' : 'none';
  runningCountEl.textContent = String(runningGames.length);
  runningListEl.innerHTML = '';

  const now = Date.now();
  for (const r of runningGames) {
    const row = document.createElement('div');
    row.className = 'running-item';
    row.title = r.exe;
    row.innerHTML = `
      <div class="live-dot"></div>
      <div class="running-item-name">${escapeHtml(r.name)}</div>
      <div class="running-item-time" data-started="${Number(r.startedAt) || now}">${formatElapsed(now - (Number(r.startedAt) || now))}</div>
      <button class="running-item-stop" aria-label="Stop ${escapeHtml(r.name)}" title="Stop">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1"/></svg>
      </button>
    `;

    row.querySelector('.running-item-stop').addEventListener('click', async (e) => {
      e.stopPropagation();
      await stopGame(r);
    });

    row.addEventListener('click', async () => {
      const game = myGames.find(g => sameGame(g, r));
      if (game) await selectGame(game);
    });

    runningListEl.appendChild(row);
  }
}

function tickRunningTimers() {
  const now = Date.now();
  for (const el of runningListEl.querySelectorAll('.running-item-time')) {
    el.textContent = formatElapsed(now - Number(el.dataset.started));
  }
}

function setRunningGames(list) {
  runningGames = Array.isArray(list) ? list : [];
  renderRunningPanel();
  renderMainList(searchInput.value);
  resetHeroState();
}

async function stopGame(game) {
  await launcherApi.stopGame({ appId: game.appId, exe: game.exe });
  log(`Stopped ${game.name}.`, 'log-danger');
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
  detailFavorite.textContent = selectedGame.isFavorite ? 'Yes' : 'No';
  detailRunning.textContent = isGameRunning(selectedGame) ? 'Yes' : 'No';
}

// No background thumbnails in the public build.

function renderMainList(filter = '') {
  gameListEl.innerHTML = '';

  const sortedGames = [...myGames].sort((a, b) => {
    if (a.isFavorite === b.isFavorite) return a.name.localeCompare(b.name);
    return a.isFavorite ? -1 : 1;
  });

  const term = filter.toLowerCase();
  for (const game of sortedGames) {
    if (!game.name.toLowerCase().includes(term)) continue;

    const div = document.createElement('div');
    const running = isGameRunning(game);
    div.className = `game-item ${sameGame(selectedGame, game) ? 'active' : ''} ${game.isFavorite ? 'favorite' : ''} ${running ? 'running' : ''}`;
    div.title = game.exe;

    div.innerHTML = `
      <div class="game-status-dot ${running ? 'active' : ''}" aria-label="${running ? 'Running' : 'Stopped'}"></div>
      <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(game.name)}</div>
      <div class="fav-icon">${starSvg}</div>
    `;

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
}

function closeContextMenu() {
  contextMenuEl.style.display = 'none';
  contextMenuEl.innerHTML = '';
}

function openGameContextMenu(game, x, y) {
  if (!game) return;

  const running = isGameRunning(game);
  contextMenuEl.innerHTML = `
    <div class="context-menu-item" id="ctxToggleRun">${running ? 'Stop' : 'Launch'}</div>
    <div class="context-menu-item" id="ctxShortcut">Create shortcut</div>
    <div class="context-menu-item danger" id="ctxDelete">Delete from library</div>
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

  const toggleRunBtn = document.getElementById('ctxToggleRun');
  const shortcutBtn = document.getElementById('ctxShortcut');
  const deleteBtn = document.getElementById('ctxDelete');

  toggleRunBtn.addEventListener('click', async () => {
    closeContextMenu();
    if (isGameRunning(game)) await stopGame(game);
    else await launchGame(game);
  });

  shortcutBtn.addEventListener('click', async () => {
    closeContextMenu();
    log(`Creating shortcut for ${game.name}...`);

    const r = await launcherApi.createShortcut(game.appId, game.exe);
    if (!r?.ok) {
      log(`Shortcut failed: ${r?.error || 'unknown error'}`, 'log-danger');
      return;
    }

    log(`Shortcut created: ${r.path}`, 'log-success');
  });

  deleteBtn.addEventListener('click', async () => {
    // Avoid deleting a game that is running
    if (isGameRunning(game)) {
      log('Stop the running game before deleting it.', 'log-danger');
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

    log(`Deleted ${game.name} from library.`, 'log-success');
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
  if (!game) return;
  selectedGame = game;

  heroEmptyState.style.display = 'none';
  heroContent.style.display = 'flex';

  document.getElementById('heroTitle').innerText = game.name;
  document.getElementById('heroExe').innerText = game.exe;

  updateDetailsPanel();

  await launcherApi.selectGame(game);

  resetHeroState();
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
  updateInstallBtn.textContent = 'Install update';

  const version = payload.version ? `v${payload.version}` : 'New version';
  updateSubtitle.textContent = payload.releaseName
    ? `${version} — ${payload.releaseName}`
    : version;

  updateNotes.innerHTML = renderReleaseNotesHtml(payload.releaseNotes);

  if (updateProgressWrap) {
    updateProgressWrap.style.display = 'none';
    updateProgressFill.style.width = '0%';
    updateProgressText.textContent = 'Downloading update…';
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
      `Downloading update… ${pct}% (${formatBytes(payload.transferred)} / ${formatBytes(payload.total)})${speed}`;
  } else {
    updateProgressText.textContent = `Downloading update… ${pct}%`;
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
  if (!text) return '<p style="color:var(--text-muted);">No release notes provided.</p>';

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
  modalState = {
    filter: String(filter || ''),
    sort: modalState.sort,
    offset: 0,
    limit: 200,
    hasMore: false,
    loading: false,
    requestId: modalState.requestId + 1
  };
  modalListEl.innerHTML = '';
  modalCountEl.textContent = '';
  renderNextModalPage();
}

function setModalSort(sort) {
  if (modalState.sort === sort) return;
  modalState.sort = sort;
  for (const btn of document.querySelectorAll('.segmented-btn[data-sort]')) {
    btn.classList.toggle('active', btn.dataset.sort === sort);
  }
  modalListEl.scrollTop = 0;
  resetAndRenderModal(modalSearchInput.value);
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

async function addDatabaseGame(game) {
  // --- CHECK DETECTION FLAG BEFORE ADDING ---
  if (game.usesNewDetection) {
    const userWantsToProceed = await promptDetectionWarning();
    if (!userWantsToProceed) {
      log(`Cancelled adding ${game.name}.`, 'log-entry');
      return; // Abort silently
    }
  }
  // ------------------------------------------

  const installed = await launcherApi.addGame(game);
  log(`Installed ${installed.name} successfully.`, 'log-success');
  closeModal();
  await refreshMyGames();
  await selectGame(myGames.find(g => sameGame(g, installed)) || myGames[myGames.length - 1]);
}

async function renderNextModalPage() {
  if (modalState.loading) return;
  modalState.loading = true;
  const requestId = modalState.requestId;

  let page;
  try {
    page = await launcherApi.getDatabaseGames(modalState.filter, modalState.offset, modalState.limit, modalState.sort);
  } catch (e) {
    if (requestId !== modalState.requestId) return;
    modalState.loading = false;
    modalListEl.innerHTML = `<div style="padding:20px; text-align:center;">Database not ready. Try again. (${escapeHtml(String(e.message || e))})</div>`;
    return;
  }

  // The search changed while this page was loading; a newer request owns the list now.
  if (requestId !== modalState.requestId) return;

  const frag = document.createDocumentFragment();
  const items = Array.isArray(page?.items) ? page.items : [];

  for (const game of items) {
    // Games already in the library stay visible (marked), so searching for them doesn't look like they're missing.
    const libraryGame = myGames.find(mg => mg.appId === game.id && mg.exe === game.exe);

    const div = document.createElement('div');
    div.className = `modal-item ${libraryGame ? 'in-library' : ''}`;
    div.innerHTML = `
      <div class="modal-item-info">
        <span class="modal-item-name">${escapeHtml(game.name)}${game.usesNewDetection ? '<span class="modal-item-badge" title="Discord has no executable name for this game">NO EXE</span>' : ''}</span>
        <span class="modal-item-exe">${escapeHtml(game.exe)}</span>
      </div>
      <div class="modal-item-action">${libraryGame ? '✓ IN LIBRARY' : '+ ADD'}</div>
    `;

    div.onclick = async () => {
      if (libraryGame) {
        closeModal();
        await selectGame(libraryGame);
        return;
      }
      await addDatabaseGame(game);
    };

    frag.appendChild(div);
  }

  modalListEl.appendChild(frag);

  const total = Number(page?.total);
  if (Number.isFinite(total)) {
    modalCountEl.textContent = `${total.toLocaleString()} ${total === 1 ? 'game' : 'games'}`;
  }

  const hasAnyRows = modalListEl.querySelector('.modal-item') != null;
  if (!hasAnyRows && modalState.offset === 0) {
    modalListEl.innerHTML = `<div style="padding:20px; text-align:center;">No results. Not in Discord's database? Use <b>+ Custom game</b>.</div>`;
  }

  modalState.hasMore = Boolean(page?.hasMore);
  modalState.offset += items.length;
  modalState.loading = false;
}

// --- CUSTOM GAMES ---
function openCustomGameModal() {
  customNameInput.value = modalSearchInput.value.trim();
  customExeInput.value = '';
  customErrorEl.textContent = '';
  customGameModal.style.display = 'flex';
  customNameInput.focus();
}

function closeCustomGameModal() {
  customGameModal.style.display = 'none';
}

async function saveCustomGame() {
  const name = customNameInput.value.trim();
  let exe = customExeInput.value.trim().replace(/^["']+|["']+$/g, '');

  if (!name) {
    customErrorEl.textContent = 'Enter a name.';
    customNameInput.focus();
    return;
  }

  if (exe) {
    // Only a file name or a relative path like "bin/game.exe" — never an absolute path or "..".
    if (/^[a-z]:/i.test(exe) || /^[\\/]/.test(exe) || /(^|[\\/])\.\.([\\/]|$)/.test(exe) || /[<>:"|?*]/.test(exe)) {
      customErrorEl.textContent = 'Use just a file name like "game.exe" (or a relative path like "bin/game.exe").';
      customExeInput.focus();
      return;
    }
    if (!exe.toLowerCase().endsWith('.exe')) exe += '.exe';
  }

  const installed = await launcherApi.addGame({ id: '', name, exe, isCustom: true });
  log(`Added custom game ${installed.name} (${installed.exe}).`, 'log-success');
  closeCustomGameModal();
  closeModal();
  await refreshMyGames();
  await selectGame(myGames.find(g => sameGame(g, installed)) || myGames[myGames.length - 1]);
}
// --------------------

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
    log(r.updated ? 'Updated gamelist.json from Discord API.' : 'gamelist.json already up-to-date.', 'log-success');
  } catch (e) {
    log(`Could not sync gamelist.json: ${String(e.message || e)}`, 'log-danger');
  }
}

async function launchGame(game) {
  const r = await launcherApi.launchGame(game);
  if (r?.ok && r.alreadyRunning) {
    log(`${game.name} is already running.`);
  } else if (r?.ok) {
    log(`Process started: ${game.name} (${game.exe})`, 'log-success');
  } else {
    log(`Failed to launch ${game.name}: ${r?.error || 'unknown error'}`, 'log-danger');
  }
}

launchBtn.addEventListener('click', async () => {
  if (!selectedGame) return;

  launchBtn.disabled = true;
  try {
    if (isGameRunning(selectedGame)) await stopGame(selectedGame);
    else await launchGame(selectedGame);
  } finally {
    launchBtn.disabled = false;
  }
});

document.getElementById('stopAllBtn').addEventListener('click', async () => {
  const count = runningGames.length;
  await launcherApi.stopAllGames();
  log(`Stopped ${count} ${count === 1 ? 'game' : 'games'}.`, 'log-danger');
});

document.getElementById('sortNameBtn').addEventListener('click', () => setModalSort('name'));
document.getElementById('sortNewestBtn').addEventListener('click', () => setModalSort('newest'));

document.getElementById('openCustomGameBtn').addEventListener('click', openCustomGameModal);
document.getElementById('customCloseBtn').addEventListener('click', closeCustomGameModal);
document.getElementById('customCancelBtn').addEventListener('click', closeCustomGameModal);
document.getElementById('customSaveBtn').addEventListener('click', saveCustomGame);
for (const input of [customNameInput, customExeInput]) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCustomGame();
  });
}

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
  if (e.key !== 'Escape') return;
  closeContextMenu();
  if (customGameModal.style.display === 'flex') closeCustomGameModal();
  else if (addGameModal.style.display === 'flex') closeModal();
});

window.addEventListener('blur', () => closeContextMenu());

// Update modal events
if (updateCloseBtn) {
  updateCloseBtn.addEventListener('click', async () => {
    await launcherApi.remindUpdateLater();
    hideUpdateModal();
  });
}

if (updateRemindBtn) {
  updateRemindBtn.addEventListener('click', async () => {
    await launcherApi.remindUpdateLater();
    hideUpdateModal();
  });
}

if (updateInstallBtn) {
  updateInstallBtn.addEventListener('click', async () => {
    if (updateUiState.installing) return;
    updateUiState.installing = true;
    updateInstallBtn.disabled = true;
    updateRemindBtn.disabled = true;
    updateInstallBtn.textContent = 'Downloading…';
    setUpdateProgress(0, null);

    const r = await launcherApi.installUpdate();
    if (!r?.ok) {
      log(`Update failed: ${r?.error || 'unknown error'}`, 'log-danger');
      updateUiState.installing = false;
      updateInstallBtn.disabled = false;
      updateRemindBtn.disabled = false;
      updateInstallBtn.textContent = 'Install update';
      if (updateProgressWrap) updateProgressWrap.style.display = 'none';
    }
  });
}

// Window controls
const minBtn = document.getElementById('minBtn');
const closeBtn = document.getElementById('closeBtn');
minBtn.addEventListener('click', () => launcherApi.minimize());
closeBtn.addEventListener('click', () => launcherApi.close());

launcherApi.onGameExited((payload) => {
  // The process ended by itself (closed window, crash...). runningChanged updates the UI.
  log(`Process exited: ${payload?.name || 'game'}.`, 'log-danger');
});

launcherApi.onRunningChanged((list) => setRunningGames(list));

window.setInterval(tickRunningTimers, 1000);

(async function init() {
  await ensureDatabaseSynced();
  await refreshMyGames();
  setRunningGames(await launcherApi.getRunningGames());

  // Update notifications
  if (launcherApi.onUpdateAvailable) {
    launcherApi.onUpdateAvailable((payload) => {
      showUpdateModal(payload);
      log('Update available.', 'log-success');
    });
  }
  if (launcherApi.onUpdateProgress) {
    launcherApi.onUpdateProgress((payload) => {
      setUpdateProgress(payload?.percent || 0, payload);
    });
  }
  if (launcherApi.onUpdateDownloaded) {
    launcherApi.onUpdateDownloaded(async () => {
      setUpdateProgress(100, null);
      if (updateProgressText) updateProgressText.textContent = 'Download complete. Installing…';
      if (updateInstallBtn) updateInstallBtn.textContent = 'Installing…';
      log('Update downloaded. Installing…', 'log-success');
      // Opens the downloaded installer and quits this app so it can run.
      await launcherApi.quitAndInstallUpdate();
    });
  }
  if (launcherApi.onUpdateError) {
    launcherApi.onUpdateError((payload) => {
      log(`Update error: ${payload?.message || 'unknown error'}`, 'log-danger');
    });
  }
})();