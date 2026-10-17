const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { makeGameKey } = require('./launcher-state');

const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';

// In-memory cache to avoid re-reading/parsing large gamelist.json on every search.
let databaseCache = {
  loaded: false,
  gameListPath: null,
  games: []
};

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getUserDataPaths() {
  const userData = app.getPath('userData');
  return {
    userData,
    myGamesPath: path.join(userData, 'myGames.json'),
    gameListPath: path.join(userData, 'gamelist.json'),
    gamesRoot: path.join(userData, 'games')
  };
}

function sanitizeFolderName(name) {
  return (name || 'UnknownApp')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u0000-\u001F]/g, '_')
    .trim()
    .slice(0, 128);
}

function fallbackExeNameFromTitle(name) {
  const base = sanitizeFolderName(String(name || 'Game'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const safeBase = base || 'Game';
  return safeBase.toLowerCase().endsWith('.exe') ? safeBase : `${safeBase}.exe`;
}

function normalizeExeRelPath(exeName) {
  return (exeName || '')
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep);
}

function pickBestExecutable(appEntry) {
  const exes = Array.isArray(appEntry.executables) ? appEntry.executables : [];

  const nonLauncherWin32 = exes.find(e =>
    String(e?.os || '').toLowerCase() === 'win32' && !e?.is_launcher && e?.name);
  if (nonLauncherWin32) return nonLauncherWin32;

  const anyWin32 = exes.find(e =>
    String(e?.os || '').toLowerCase() === 'win32' && e?.name);
  return anyWin32 || null;
}

// Roman numerals are mapped to digits so "Modern Warfare III" and "modern warfare 3" match.
// Single letters (i, v, x) are left alone: too many real titles use them as words.
const ROMAN_NUMERALS = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };

// Lowercase, strip accents, ®/™ and punctuation so "Call of Duty®: Modern Warfare® 4"
// and "call of duty modern warfare 4" compare equal.
function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => ROMAN_NUMERALS[w] || w)
    .join(' ');
}

// "call of duty modern warfare 4" -> "codmw4", so searches like "cod mw4" work.
function acronymOf(normalized) {
  return normalized
    .split(' ')
    .map(w => (/^\d+$/.test(w) ? w : w[0]))
    .join('');
}

function toDatabaseGames(detectableApps) {
  const result = [];
  for (const appEntry of detectableApps || []) {
    if (!appEntry?.name) continue;
    const bestExe = pickBestExecutable(appEntry);

    const appId = String(appEntry.id || '');
    const exeName = bestExe?.name ? String(bestExe.name) : fallbackExeNameFromTitle(appEntry.name);

    const winExes = (Array.isArray(appEntry.executables) ? appEntry.executables : [])
      .filter(e => String(e?.os || '').toLowerCase() === 'win32' && e?.name)
      .map(e => String(e.name));
    const aliases = (Array.isArray(appEntry.aliases) ? appEntry.aliases : []).map(String);

    const nameNorm = normalizeSearchText(appEntry.name);
    const aliasNorms = aliases.map(normalizeSearchText).filter(a => a && a !== nameNorm);

    let idNum = 0n;
    try { idNum = BigInt(appId); } catch { /* non-numeric id */ }

    result.push({
      id: appId,
      name: String(appEntry.name),
      exe: exeName,
      isLauncher: Boolean(bestExe?.is_launcher),
      usesNewDetection: !bestExe || !bestExe.name, // <-- FLAG FOR FRONTEND
      _nameNorm: nameNorm,
      _haystack: [nameNorm, ...aliasNorms, ...winExes.map(normalizeSearchText)].join(' | '),
      _acronyms: [nameNorm, ...aliasNorms].map(acronymOf),
      _idNum: idNum
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// Higher = better match. 0 = no match.
function scoreDatabaseGame(g, query, tokens) {
  if (!query) return 1;
  if (g._nameNorm === query) return 100;
  if (g._nameNorm.startsWith(query)) return 80;
  if (g._nameNorm.includes(query)) return 60;

  let viaName = true;
  for (const t of tokens) {
    if (g._nameNorm.includes(t)) continue;
    viaName = false;
    const inOther = g._haystack.includes(t) ||
      (t.length >= 2 && g._acronyms.some(a => a.includes(t)));
    if (!inOther) return 0;
  }
  return viaName ? 40 : 20;
}

// Discord app ids are snowflakes: a bigger id means the app was registered later.
function compareNewest(a, b) {
  if (a._idNum === b._idNum) return a.name.localeCompare(b.name);
  return a._idNum > b._idNum ? -1 : 1;
}

let searchMemo = { key: null, games: null, matches: [] };

function searchDatabaseGames(filter, sort) {
  const query = normalizeSearchText(filter);
  const sortMode = sort === 'newest' ? 'newest' : 'name';
  const key = `${sortMode}\u0000${query}`;
  if (searchMemo.key === key && searchMemo.games === databaseCache.games) return searchMemo.matches;

  const tokens = query ? query.split(' ') : [];
  const scored = [];
  for (const g of databaseCache.games) {
    const score = scoreDatabaseGame(g, query, tokens);
    if (score > 0) scored.push({ g, score });
  }

  if (sortMode === 'newest') {
    scored.sort((a, b) => compareNewest(a.g, b.g));
  } else if (query) {
    // Best matches first; games Discord can detect by exe before ones it can't.
    scored.sort((a, b) =>
      (b.score - a.score) ||
      (Number(a.g.usesNewDetection) - Number(b.g.usesNewDetection)) ||
      a.g.name.localeCompare(b.g.name));
  }
  // name sort without a query: databaseCache.games is already alphabetical

  const matches = scored.map(s => s.g);
  searchMemo = { key, games: databaseCache.games, matches };
  return matches;
}

async function loadDatabaseCache(gameListPath) {
  if (!gameListPath) return;

  try {
    const detectableApps = await readJsonIfExists(gameListPath, []);
    const games = toDatabaseGames(detectableApps);
    databaseCache = {
      loaded: true,
      gameListPath,
      games
    };
  } catch {
    // Keep old cache if parsing fails
  }
}

function pageDatabaseGames({ filter, offset, limit, sort }) {
  const start = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const pageSize = Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 200;

  const matches = searchDatabaseGames(filter, sort);

  // Strip internal fields before crossing IPC boundary
  const items = matches.slice(start, start + pageSize).map(g => ({
    id: g.id,
    name: g.name,
    exe: g.exe,
    isLauncher: g.isLauncher,
    usesNewDetection: g.usesNewDetection // <-- SEND TO FRONTEND
  }));

  return {
    items,
    offset: start,
    limit: pageSize,
    total: matches.length,
    hasMore: start + items.length < matches.length
  };
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2) + os.EOL, 'utf8');
}

async function syncGameList(gameListPath) {
  const res = await fetch(DISCORD_DETECTABLE_URL, {
    headers: {
      'User-Agent': 'DiscordFakeGameLauncherUI/0.1.0',
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }

  const text = (await res.text()).trim();

  let localTrimmed = null;
  try {
    localTrimmed = (await fsp.readFile(gameListPath, 'utf8')).trim();
  } catch {
    localTrimmed = null;
  }

  if (localTrimmed !== text) {
    // Optional backup
    if (localTrimmed != null) {
      try {
        await fsp.copyFile(gameListPath, gameListPath + '.bak');
      } catch {
        // ignore
      }
    }

    await fsp.writeFile(gameListPath, text + os.EOL, 'utf8');
    return { updated: true };
  }

  return { updated: false };
}


async function findDummyGameTemplate() {
  if (process.env.DUMMYGAME_EXE && fs.existsSync(process.env.DUMMYGAME_EXE)) {
    return process.env.DUMMYGAME_EXE;
  }

  // Packaged build: bundled via electron-builder extraResources
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'dummygame', 'DummyGame.exe');
    if (fs.existsSync(bundled)) return bundled;
  }

  // Repo-relative fallback (dev): ../src/DummyGame/bin/**/DummyGame.exe
  const repoRoot = path.resolve(app.getAppPath(), '..', '..');
  const dummyProjBin = path.join(repoRoot, 'src', 'DummyGame', 'bin');
  if (!fs.existsSync(dummyProjBin)) return null;

  // Try common locations first (Release, Debug)
  const candidates = [];
  const configs = ['Release', 'Debug'];
  for (const cfg of configs) {
    candidates.push(path.join(dummyProjBin, cfg, 'net8.0-windows', 'DummyGame.exe'));
    candidates.push(path.join(dummyProjBin, cfg, 'net8.0-windows7.0', 'DummyGame.exe'));
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Last resort: shallow search
  const stack = [dummyProjBin];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // avoid huge recursion
        if (p.toLowerCase().includes('ref')) continue;
        stack.push(p);
      } else if (e.isFile() && e.name.toLowerCase() === 'dummygame.exe') {
        return p;
      }
    }
  }

  return null;
}

async function ensureFakeExeForGame(game, paths) {
  const dummySourceExe = await findDummyGameTemplate();
  if (!dummySourceExe) {
    throw new Error('Could not find DummyGame.exe. Run: npm run build:dummy (from electron/), or set DUMMYGAME_EXE env var to the built DummyGame.exe path.');
  }

  ensureDirSync(paths.gamesRoot);

  const appIdFolder = game.appId ? String(game.appId) : sanitizeFolderName(game.name);

  const exeRelPath = normalizeExeRelPath(game.exe);
  const exeFolderPart = path.dirname(exeRelPath) === '.' ? '' : path.dirname(exeRelPath);
  const exeFileName = path.basename(exeRelPath);

  const gameFolder = path.join(paths.gamesRoot, appIdFolder, exeFolderPart);

  // Never write outside the games folder (e.g. an exe path containing "..").
  const rel = path.relative(paths.gamesRoot, gameFolder);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Invalid executable path: ${game.exe}`);
  }

  ensureDirSync(gameFolder);

  const destExePath = path.join(gameFolder, exeFileName);

  if (!fs.existsSync(destExePath)) {
    // Copy main exe but rename to target exe file name
    await fsp.copyFile(dummySourceExe, destExePath);

    // Copy sidecar files DummyGame.* from source dir
    const sourceDir = path.dirname(dummySourceExe);
    const dummyBase = path.basename(dummySourceExe, path.extname(dummySourceExe));

    const sidecars = await fsp.readdir(sourceDir);
    for (const fileName of sidecars) {
      if (!fileName.toLowerCase().startsWith(dummyBase.toLowerCase() + '.')) continue;
      if (fileName.toLowerCase() === path.basename(dummySourceExe).toLowerCase()) continue;

      const src = path.join(sourceDir, fileName);
      const dest = path.join(gameFolder, fileName);
      if (!fs.existsSync(dest)) {
        await fsp.copyFile(src, dest);
      }
    }
  }

  return { destExePath, workingDirectory: path.dirname(destExePath) };
}

let mainWindow = null;

// Every fake game currently running, keyed by makeGameKey(). Several can run at once.
const runningProcs = new Map();

function listRunning() {
  return Array.from(runningProcs.values()).map(r => ({
    appId: r.appId,
    name: r.name,
    exe: r.exe,
    startedAt: r.startedAt
  }));
}

function notifyRunningChanged() {
  mainWindow?.webContents.send('launcher/runningChanged', listRunning());
}

function stopRunning(key) {
  const r = runningProcs.get(key);
  if (!r) return false;
  runningProcs.delete(key);
  try {
    r.proc.kill();
  } catch {
    // ignore
  }
  return true;
}

function stopAllRunning() {
  for (const key of Array.from(runningProcs.keys())) stopRunning(key);
}

let pendingUpdateInfo = null;

function coerceReleaseNotesToText(releaseNotes) {
  if (!releaseNotes) return '';

  // electron-updater can provide string or array (for multi-platform notes)
  if (typeof releaseNotes === 'string') return releaseNotes;

  if (Array.isArray(releaseNotes)) {
    // Prefer Windows notes, else join whatever exists
    const win = releaseNotes.find(r => String(r?.path || '').toLowerCase().includes('win'));
    const chosen = win || releaseNotes[0];
    if (typeof chosen?.note === 'string') return chosen.note;
    return releaseNotes
      .map(r => (typeof r?.note === 'string' ? r.note : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  return String(releaseNotes);
}

async function maybeCheckForUpdates() {
  // Updates only make sense in packaged builds.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    // No persisted dismissal: if the user picks "remind later", the update
    // prompt will simply reappear the next time the app starts and checks.
    pendingUpdateInfo = info;
    const payload = {
      version: String(info?.version || ''),
      releaseName: String(info?.releaseName || ''),
      releaseDate: info?.releaseDate ? String(info.releaseDate) : '',
      releaseNotes: coerceReleaseNotesToText(info?.releaseNotes)
    };

    mainWindow?.webContents.send('update/available', payload);
  });

  autoUpdater.on('update-not-available', () => {
    pendingUpdateInfo = null;
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update/error', { message: String(err?.message || err || 'Unknown error') });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update/progress', {
      percent: Number(progress?.percent) || 0,
      transferred: Number(progress?.transferred) || 0,
      total: Number(progress?.total) || 0,
      bytesPerSecond: Number(progress?.bytesPerSecond) || 0
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update/downloaded');
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    mainWindow?.webContents.send('update/error', { message: String(e?.message || e || 'Unknown error') });
  }
}


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#36393f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await createWindow();

  // Check for updates (packaged builds only)
  await maybeCheckForUpdates();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

// Don't leave fake games running (and showing in Discord) after the launcher closes.
app.on('before-quit', () => {
  stopAllRunning();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app/window/minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('app/window/close', () => {
  mainWindow?.close();
});

ipcMain.handle('launcher/syncGameList', async () => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  const result = await syncGameList(paths.gameListPath);
  await loadDatabaseCache(paths.gameListPath);
  return { ...result, gameListPath: paths.gameListPath };
});

ipcMain.handle('launcher/getDatabaseGames', async (_evt, { filter, offset, limit, sort } = {}) => {
  const paths = getUserDataPaths();

  if (!databaseCache.loaded || databaseCache.gameListPath !== paths.gameListPath) {
    await loadDatabaseCache(paths.gameListPath);
  }

  return pageDatabaseGames({ filter, offset, limit, sort });
});

ipcMain.handle('launcher/getMyGames', async () => {
  const paths = getUserDataPaths();
  const list = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(list) ? list : [];

  // Privacy/safety: remove any persisted artwork fields from older versions.
  let changed = false;
  for (const g of safeList) {
    if (g && typeof g === 'object') {
      if (Object.prototype.hasOwnProperty.call(g, 'icon')) { delete g.icon; changed = true; }
      if (Object.prototype.hasOwnProperty.call(g, 'thumbnail')) { delete g.thumbnail; changed = true; }
      if (Object.prototype.hasOwnProperty.call(g, 'igdbId')) { delete g.igdbId; changed = true; }
    }
  }
  if (changed) {
    try { await writeJson(paths.myGamesPath, safeList); } catch { /* ignore */ }
  }

  return safeList;
});

ipcMain.handle('launcher/addGame', async (_evt, game) => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);

  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];

  const entry = {
    appId: String(game?.id || ''),
    name: String(game?.name || 'Game').trim() || 'Game',
    exe: String(game?.exe || '').trim() || fallbackExeNameFromTitle(game?.name),
    isFavorite: false
  };
  if (game?.isCustom) {
    entry.isCustom = true;
    // Custom games have no Discord app id; give them a stable one so they get their own folder.
    if (!entry.appId) {
      const slug = sanitizeFolderName(entry.name).toLowerCase().replace(/\s+/g, '-').slice(0, 60) || 'game';
      entry.appId = `custom-${slug}`;
    }
  }

  // Avoid duplicates by (appId + exe)
  const key = `${entry.appId}::${entry.exe}`;
  const existingKey = (g) => `${String(g?.appId || '')}::${String(g?.exe || '')}`;
  if (!safeList.some(g => existingKey(g) === key)) {
    safeList.push(entry);
    await writeJson(paths.myGamesPath, safeList);
  }

  return entry;
});

ipcMain.handle('launcher/toggleFavorite', async (_evt, { appId, exe }) => {
  const paths = getUserDataPaths();
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];

  let updated = null;
  for (const g of safeList) {
    if (String(g?.appId || '') === String(appId || '') && String(g?.exe || '') === String(exe || '')) {
      g.isFavorite = !g.isFavorite;
      updated = g;
      break;
    }
  }

  await writeJson(paths.myGamesPath, safeList);
  return updated;
});

ipcMain.handle('launcher/deleteGame', async (_evt, { appId, exe }) => {
  const paths = getUserDataPaths();
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];

  const before = safeList.length;
  const filtered = safeList.filter(g => !(
    String(g?.appId || '') === String(appId || '') &&
    String(g?.exe || '') === String(exe || '')
  ));

  if (filtered.length !== before) {
    await writeJson(paths.myGamesPath, filtered);
  }

  return { ok: true, removed: before - filtered.length };
});

ipcMain.handle('launcher/createShortcut', async (_evt, { appId, exe }) => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Shortcuts are only supported on Windows.' };
  }

  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);

  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];

  const game = safeList.find(g =>
    String(g?.appId || '') === String(appId || '') &&
    String(g?.exe || '') === String(exe || '')
  );

  if (!game) return { ok: false, error: 'Game not found in library.' };

  try {
    const { destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths);
    const desktopDir = app.getPath('desktop');

    const baseName = sanitizeFolderName(game.name || path.basename(destExePath, path.extname(destExePath))) || 'Game';
    let shortcutPath = path.join(desktopDir, `${baseName}.lnk`);

    // Avoid overwriting existing shortcuts: Game.lnk, Game (2).lnk, ...
    if (fs.existsSync(shortcutPath)) {
      for (let i = 2; i < 1000; i++) {
        const candidate = path.join(desktopDir, `${baseName} (${i}).lnk`);
        if (!fs.existsSync(candidate)) {
          shortcutPath = candidate;
          break;
        }
      }
    }

    const displayName = String(game?.name || path.basename(destExePath));
    const escaped = displayName.replace(/"/g, '\\"');
    const args = `"${escaped}"`;

    const ok = shell.writeShortcutLink(shortcutPath, {
      target: destExePath,
      cwd: workingDirectory,
      args
    });

    if (!ok) return { ok: false, error: 'Failed to create shortcut.' };
    return { ok: true, path: shortcutPath };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to create shortcut') };
  }
});

ipcMain.handle('launcher/selectGame', async (_evt, game) => {
  // No per-game icons/thumbnails in the public build.
  return true;
});

ipcMain.handle('launcher/launchGame', async (_evt, game) => {
  const key = makeGameKey(game);
  if (!key) return { ok: false, error: 'Invalid game.' };
  const existing = runningProcs.get(key);
  if (existing) {
    return { ok: true, exePath: existing.exePath, gameKey: key, alreadyRunning: true };
  }

  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);

  let destExePath;
  let workingDirectory;
  try {
    ({ destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths));
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to prepare executable') };
  }

  // Two library entries can map to the same fake exe file; only one process per file.
  for (const r of runningProcs.values()) {
    if (r.exePath.toLowerCase() === destExePath.toLowerCase()) {
      return { ok: false, error: `${r.name} is already running from the same executable.` };
    }
  }

  const displayName = String(game?.name || path.basename(destExePath));

  let proc;
  try {
    proc = spawn(destExePath, [displayName], {
      cwd: workingDirectory,
      windowsHide: false,
      stdio: 'ignore'
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to start process') };
  }

  const entry = {
    proc,
    appId: String(game?.appId || ''),
    name: displayName,
    exe: String(game?.exe || ''),
    exePath: destExePath,
    startedAt: Date.now()
  };
  runningProcs.set(key, entry);

  const onGone = () => {
    // Only report if this process is still the tracked one (not already stopped by the user).
    if (runningProcs.get(key) !== entry) return;
    runningProcs.delete(key);
    mainWindow?.webContents.send('launcher/gameExited', { gameKey: key, appId: entry.appId, exe: entry.exe, name: entry.name });
    notifyRunningChanged();
  };
  proc.once('exit', onGone);
  proc.once('error', onGone);

  notifyRunningChanged();
  return { ok: true, exePath: destExePath, gameKey: key };
});

ipcMain.handle('launcher/stopGame', async (_evt, game) => {
  // No game given: keep the old behaviour of stopping everything.
  const key = game ? makeGameKey(game) : '';
  if (!key) stopAllRunning();
  else stopRunning(key);
  notifyRunningChanged();
  return { ok: true };
});

ipcMain.handle('launcher/stopAllGames', async () => {
  stopAllRunning();
  notifyRunningChanged();
  return { ok: true };
});

ipcMain.handle('launcher/getRunningGames', async () => listRunning());

// ───────────────────────────────────────────────────────────
// Updates
// ───────────────────────────────────────────────────────────
ipcMain.handle('update/remindLater', async () => {
  // Intentionally not persisted: the update prompt will show again on the
  // next app startup since nothing is written to disk here.
  pendingUpdateInfo = null;
  return { ok: true };
});

ipcMain.handle('update/install', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Updates are only available in packaged builds.' };

  try {
    await autoUpdater.downloadUpdate();

    // When update-downloaded fires, renderer can call quitAndInstall.
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to download update') };
  }
});

ipcMain.handle('update/quitAndInstall', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Not packaged.' };
  try {
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || 'Failed to install update') };
  }
});