const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { makeGameKey } = require('./launcher-state');
const { buildPool, createRandomController } = require('./random-mode');
const { matchPopularGames } = require('./popular-games');
const { mergeGamesIntoLibrary, isStaleCopy } = require('./library');
const { createIconResolver } = require('./game-icons');

const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';

// Fake game processes start with their (normal) window MINIMIZED by default, so nothing pops up.
// The "Show fake game window" switch in the app (or FAKEGAME_SHOW_WINDOW=1) opens it normally.
let appSettings = null; // { showFakeWindow: boolean }

async function getSettings() {
  if (!appSettings) {
    const saved = await readJsonIfExists(path.join(app.getPath('userData'), 'settings.json'), {});
    appSettings = { showFakeWindow: Boolean(saved && saved.showFakeWindow) };
  }
  return appSettings;
}

async function shouldHideFakeWindows() {
  if (process.env.FAKEGAME_SHOW_WINDOW === '1') return false;
  return !(await getSettings()).showFakeWindow;
}

// In-memory cache to avoid re-reading/parsing large gamelist.json on every search.
let databaseCache = {
  loaded: false,
  gameListPath: null,
  games: [],
  iconById: new Map() // appId -> icon hash, only for entries where Discord's list includes one
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

function toDatabaseGames(detectableApps) {
  const result = [];
  for (const appEntry of detectableApps || []) {
    if (!appEntry?.name) continue;
    const bestExe = pickBestExecutable(appEntry);

    const appId = String(appEntry.id || '');
    const exeName = bestExe?.name ? String(bestExe.name) : fallbackExeNameFromTitle(appEntry.name);

    // Every win32 executable Discord lists for this app (internal, used by random mode).
    const win32Exes = (Array.isArray(appEntry.executables) ? appEntry.executables : [])
      .filter(e => String(e?.os || '').toLowerCase() === 'win32' && e?.name)
      .map(e => String(e.name));

    result.push({
      id: appId,
      name: String(appEntry.name),
      exe: exeName,
      isLauncher: Boolean(bestExe?.is_launcher),
      usesNewDetection: !bestExe || !bestExe.name, // <-- FLAG FOR FRONTEND
      exes: win32Exes,
      _nameLower: String(appEntry.name).toLowerCase()
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

async function loadDatabaseCache(gameListPath) {
  if (!gameListPath) return;

  try {
    const detectableApps = await readJsonIfExists(gameListPath, []);
    const games = toDatabaseGames(detectableApps);

    const iconById = new Map();
    for (const appEntry of Array.isArray(detectableApps) ? detectableApps : []) {
      if (appEntry?.id && typeof appEntry.icon === 'string' && appEntry.icon) {
        iconById.set(String(appEntry.id), appEntry.icon);
      }
    }

    databaseCache = {
      loaded: true,
      gameListPath,
      games,
      iconById
    };
  } catch {
    // Keep old cache if parsing fails
  }
}

function pageDatabaseGames({ filter, offset, limit }) {
  const term = String(filter || '').trim().toLowerCase();
  const start = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const pageSize = Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 200;

  const items = [];
  let matchIndex = 0;
  let hasMore = false;

  const games = databaseCache.games;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (term && !g._nameLower.includes(term)) continue;

    if (matchIndex >= start && items.length < pageSize) {
      // Strip internal fields before crossing IPC boundary
      items.push({
        id: g.id,
        name: g.name,
        exe: g.exe,
        isLauncher: g.isLauncher,
        usesNewDetection: g.usesNewDetection // <-- SEND TO FRONTEND
      });
    }

    matchIndex++;

    // Determine whether there is at least one more match beyond this page
    if (items.length >= pageSize && matchIndex > start + pageSize) {
      hasMore = true;
      break;
    }
  }

  return {
    items,
    offset: start,
    limit: pageSize,
    hasMore
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
  ensureDirSync(gameFolder);

  const destExePath = path.join(gameFolder, exeFileName);

  const sourceDir = path.dirname(dummySourceExe);
  const dummyBase = path.basename(dummySourceExe, path.extname(dummySourceExe));

  if (!fs.existsSync(destExePath)) {
    // Copy main exe but rename to target exe file name
    await fsp.copyFile(dummySourceExe, destExePath);
  }

  // Sidecar files DummyGame.* (dll, runtimeconfig, deps...). Missing ones are copied exactly as
  // before. Ones that already exist are refreshed only when the bundled template changed
  // (so fake games created by an older version pick up new DummyGame behaviour). A file that is
  // in use (game running) is simply left alone and refreshed on the next launch.
  const sidecars = await fsp.readdir(sourceDir);
  for (const fileName of sidecars) {
    if (!fileName.toLowerCase().startsWith(dummyBase.toLowerCase() + '.')) continue;
    if (fileName.toLowerCase() === path.basename(dummySourceExe).toLowerCase()) continue;

    const src = path.join(sourceDir, fileName);
    const dest = path.join(gameFolder, fileName);

    if (!fs.existsSync(dest)) {
      await fsp.copyFile(src, dest);
      continue;
    }

    try {
      const [srcStat, destStat] = await Promise.all([fsp.stat(src), fsp.stat(dest)]);
      if (isStaleCopy(srcStat, destStat)) await fsp.copyFile(src, dest);
    } catch {
      // Locked or unreadable: keep the existing copy.
    }
  }

  return { destExePath, workingDirectory: path.dirname(destExePath) };
}

let mainWindow = null;
let runningProcesses = new Map();

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

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
let updaterReady = false;
let updateDownloading = false;
let pendingUpdatePayload = null;

function setupAutoUpdater() {
  if (updaterReady) return;
  updaterReady = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    // No persisted dismissal: if the user picks "remind later", the prompt appears again
    // the next time the app starts (or from the "Update available" badge / check button).
    pendingUpdateInfo = info;
    pendingUpdatePayload = {
      version: String(info?.version || ''),
      releaseName: String(info?.releaseName || ''),
      releaseDate: info?.releaseDate ? String(info.releaseDate) : '',
      releaseNotes: coerceReleaseNotesToText(info?.releaseNotes)
    };

    mainWindow?.webContents.send('update/available', pendingUpdatePayload);
  });

  autoUpdater.on('update-not-available', () => {
    pendingUpdateInfo = null;
    pendingUpdatePayload = null;
  });

  autoUpdater.on('error', (err) => {
    updateDownloading = false;
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
    updateDownloading = false;
    mainWindow?.webContents.send('update/downloaded');
  });
}

// Looks for a newer release on GitHub. Returns { ok, available, version } (never throws).
async function checkForUpdatesNow({ silent = false } = {}) {
  // Updates only make sense in packaged builds.
  if (!app.isPackaged) return { ok: false, devBuild: true, error: 'Updates are only available in packaged builds.' };
  if (updateDownloading) return { ok: true, available: Boolean(pendingUpdatePayload), version: pendingUpdatePayload?.version || '' };

  setupAutoUpdater();
  try {
    const result = await autoUpdater.checkForUpdates();
    const available = Boolean(result?.isUpdateAvailable);
    return { ok: true, available, version: available ? String(result?.updateInfo?.version || '') : '' };
  } catch (e) {
    const message = String(e?.message || e || 'Unknown error');
    // Background checks stay quiet when the user is offline; manual checks report the problem.
    if (!silent) mainWindow?.webContents.send('update/error', { message });
    return { ok: false, error: message };
  }
}

async function maybeCheckForUpdates() {
  if (!app.isPackaged) return;

  await checkForUpdatesNow();

  // Users who keep the app open for days still get told about new releases.
  const timer = setInterval(() => { checkForUpdatesNow({ silent: true }); }, UPDATE_CHECK_INTERVAL_MS);
  timer.unref?.();
}


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#141526',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Links in release notes open in the default browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app/window/minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('app/window/close', () => {
  mainWindow?.close();
});

// A snapshot of Discord's list can be bundled with the installer at build time
// (resources/dummygame/gamelist.seed.json). It is only used when no local list exists yet,
// so a first launch without internet still has games to show.
async function seedGameListIfMissing(gameListPath) {
  if (fs.existsSync(gameListPath)) return false;

  const candidates = [];
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'dummygame', 'gamelist.seed.json'));
  candidates.push(path.resolve(app.getAppPath(), 'build-resources', 'dummygame', 'gamelist.seed.json'));

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      await fsp.copyFile(candidate, gameListPath);
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

ipcMain.handle('launcher/syncGameList', async () => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  await seedGameListIfMissing(paths.gameListPath);

  let result;
  try {
    result = await syncGameList(paths.gameListPath);
  } catch (e) {
    // Offline / Discord API down: keep working with the local (or bundled) list.
    if (!fs.existsSync(paths.gameListPath)) throw e;
    await loadDatabaseCache(paths.gameListPath);
    return { updated: false, offline: true, gameListPath: paths.gameListPath };
  }

  await loadDatabaseCache(paths.gameListPath);
  return { ...result, gameListPath: paths.gameListPath };
});

ipcMain.handle('launcher/getDatabaseGames', async (_evt, { filter, offset, limit } = {}) => {
  const paths = getUserDataPaths();

  if (!databaseCache.loaded || databaseCache.gameListPath !== paths.gameListPath) {
    await loadDatabaseCache(paths.gameListPath);
  }

  return pageDatabaseGames({ filter, offset, limit });
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
    name: String(game?.name || 'Game'),
    exe: String(game?.exe || ''),
    isFavorite: false
  };

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

function notifyGameExited(gameKey, game) {
  randomController.notifyExited(gameKey);
  mainWindow?.webContents.send('launcher/gameExited', {
    gameKey,
    appId: String(game?.appId || ''),
    exe: String(game?.exe || ''),
    name: String(game?.name || '')
  });
}

async function launchFakeGame(game) {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);

  const gameKey = makeGameKey(game);
  const existing = gameKey ? runningProcesses.get(gameKey) : null;
  if (existing && !existing.killed && existing.exitCode === null) {
    return { ok: true, exePath: existing.spawnargs?.[0] || '', gameKey, alreadyRunning: true };
  }

  const { destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths);

  const displayName = String(game?.name || path.basename(destExePath));

  // "--hidden" is understood by the current DummyGame build; older builds just ignore it.
  const spawnArgs = (await shouldHideFakeWindows()) ? [displayName, '--hidden'] : [displayName];

  const proc = spawn(destExePath, spawnArgs, {
    cwd: workingDirectory,
    windowsHide: false,
    stdio: 'ignore'
  });

  runningProcesses.set(gameKey, proc);

  const forgetProcess = () => {
    // Only forget this exact process; a newer one for the same game may already exist.
    if (runningProcesses.get(gameKey) === proc) runningProcesses.delete(gameKey);
  };

  proc.once('exit', () => {
    forgetProcess();
    notifyGameExited(gameKey, game);
  });

  // Without this handler a failed spawn (missing/blocked exe) would raise an uncaught exception.
  proc.once('error', () => {
    forgetProcess();
    notifyGameExited(gameKey, game);
  });

  return { ok: true, exePath: destExePath, gameKey };
}

ipcMain.handle('launcher/launchGame', async (_evt, game) => {
  // Manual launches are only allowed while Random Mode is off.
  if (randomController.status().active) return { ok: false, error: 'Random Mode is on. Turn it off to launch games manually.' };
  return launchFakeGame(game);
});

// Stops one fake game and resolves once its process is gone (or after a short timeout).
function stopFakeGame(game) {
  const gameKey = makeGameKey(game);
  const proc = gameKey ? runningProcesses.get(gameKey) : null;
  if (!proc) return Promise.resolve(false);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(finish, 3000);

    proc.once('exit', finish);
    proc.once('error', finish);
    try { proc.kill(); } catch { finish(); }
    if (runningProcesses.get(gameKey) === proc) runningProcesses.delete(gameKey);
  });
}

// Removes the fake exe folder of a game that is not in the user's library (random mode
// over the whole Discord database would otherwise leave one copy of DummyGame per game).
async function cleanupTransientGame(game) {
  try {
    const paths = getUserDataPaths();
    const myGames = await readJsonIfExists(paths.myGamesPath, []);
    const inLibrary = (Array.isArray(myGames) ? myGames : []).some(g => makeGameKey({ appId: g?.appId, exe: g?.exe }) === makeGameKey(game));
    if (inLibrary || !game?.appId) return;

    const stillRunning = [...runningProcesses.keys()].some(k => k.startsWith(`${String(game.appId)}::`));
    if (stillRunning) return;

    const root = path.resolve(paths.gamesRoot);
    const folder = path.resolve(root, String(game.appId));
    if (!folder.startsWith(root + path.sep)) return;

    await fsp.rm(folder, { recursive: true, force: true });
  } catch {
    // Best effort only.
  }
}

// ───────────────────────────────────────────────────────────
// Random mode
// ───────────────────────────────────────────────────────────
function getRandomPool(source) {
  const paths = getUserDataPaths();
  let library = [];
  if (source !== 'database') {
    try {
      const raw = fs.readFileSync(paths.myGamesPath, 'utf8');
      const parsed = JSON.parse(raw);
      library = Array.isArray(parsed) ? parsed : [];
    } catch {
      library = [];
    }
  }
  return buildPool({ source, library, databaseGames: databaseCache.games });
}

const randomController = createRandomController({
  getPool: getRandomPool,
  launch: (game) => launchFakeGame(game),
  stop: async (game) => {
    await stopFakeGame(game);
    await cleanupTransientGame(game);
  },
  getRunningKeys: () => new Set(runningProcesses.keys()),
  onChange: (status) => {
    mainWindow?.webContents.send('random/changed', status);
  }
});

async function ensureDatabaseLoaded() {
  const paths = getUserDataPaths();
  if (!databaseCache.loaded || databaseCache.gameListPath !== paths.gameListPath) {
    await loadDatabaseCache(paths.gameListPath);
  }
}

ipcMain.handle('random/start', async (_evt, { minutes, source } = {}) => {
  await ensureDatabaseLoaded();
  return randomController.start({ minutes, source });
});

ipcMain.handle('random/stop', async () => randomController.stop());

ipcMain.handle('random/status', async () => randomController.status());

ipcMain.handle('random/poolSize', async (_evt, { source } = {}) => {
  await ensureDatabaseLoaded();
  return { size: getRandomPool(source).length };
});

app.on('before-quit', () => {
  // Random mode ends with the app: kill the process it started so it does not linger.
  const game = randomController.dispose();
  if (!game) return;
  const proc = runningProcesses.get(makeGameKey(game));
  try { proc?.kill(); } catch { /* ignore */ }
});

// ───────────────────────────────────────────────────────────
// Popular games pack
// ───────────────────────────────────────────────────────────
ipcMain.handle('launcher/addPopularGames', async () => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  await ensureDatabaseLoaded();

  const matches = matchPopularGames(databaseCache.games);
  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const safeList = Array.isArray(myGames) ? myGames : [];

  const existingKeys = new Set(safeList.map(g => `${String(g?.appId || '')}::${String(g?.exe || '')}`));
  const added = [];

  for (const g of matches) {
    const key = `${g.id}::${g.exe}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const entry = { appId: String(g.id), name: String(g.name), exe: String(g.exe), isFavorite: false };
    safeList.push(entry);
    added.push(entry.name);
  }

  if (added.length) await writeJson(paths.myGamesPath, safeList);

  return { ok: true, matched: matches.length, added: added.length, names: added };
});

// ───────────────────────────────────────────────────────────
// Add every game Discord recognizes (same rules as the random mode "database" pool)
// ───────────────────────────────────────────────────────────
ipcMain.handle('launcher/addAllGames', async () => {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  await ensureDatabaseLoaded();

  const pool = buildPool({ source: 'database', library: [], databaseGames: databaseCache.games });
  if (pool.length === 0) {
    return { ok: false, error: 'No recognized games found in the Discord database. Try restarting to sync the game list.' };
  }

  const myGames = await readJsonIfExists(paths.myGamesPath, []);
  const { list, added } = mergeGamesIntoLibrary(
    myGames,
    pool.map(p => ({ id: p.appId, name: p.name, exe: p.exe }))
  );

  // Keep a copy of the previous library, just in case.
  if (added > 0) {
    try { await fsp.copyFile(paths.myGamesPath, paths.myGamesPath + '.bak'); } catch { /* no previous file */ }
    await writeJson(paths.myGamesPath, list);
  }

  return { ok: true, matched: pool.length, added };
});

// ───────────────────────────────────────────────────────────
// Game icons (Discord CDN, memory cache only)
// ───────────────────────────────────────────────────────────
async function fetchJsonWithTimeout(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'DiscordFakeGameLauncherUI/0.1.0',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  let json = null;
  if (res.ok) {
    try { json = await res.json(); } catch { json = null; }
  }
  return { status: res.status, json };
}

const iconResolver = createIconResolver({
  getKnownHash: (appId) => databaseCache.iconById.get(String(appId)) || '',
  fetchJson: fetchJsonWithTimeout,
  concurrency: 4
});

// Returns the icon url for one game, or '' when it has none (the UI then shows a letter).
ipcMain.handle('launcher/getGameIcon', async (_evt, { appId } = {}) => {
  try {
    await ensureDatabaseLoaded();
  } catch {
    // Icons are optional: keep going without the local list.
  }
  return { url: await iconResolver.resolve(appId) };
});

ipcMain.handle('launcher/stopGame', async (_evt, game) => {
  const requestedKey = game ? makeGameKey(game) : null;
  const randomState = randomController.status();
  if (randomState.active && (!requestedKey || requestedKey === randomState.current?.key)) {
    return { ok: false, error: 'Random Mode is on. Stop it to control games manually.' };
  }

  if (!requestedKey) {
    for (const [gameKey, proc] of [...runningProcesses.entries()]) {
      try { proc.kill(); } catch {}
      runningProcesses.delete(gameKey);
    }
    return { ok: true, stoppedAll: true };
  }

  const proc = runningProcesses.get(requestedKey);
  if (!proc) {
    return { ok: true, stopped: false, gameKey: requestedKey };
  }

  try {
    proc.kill();
  } catch {
    // ignore
  }

  runningProcesses.delete(requestedKey);
  return { ok: true, stopped: true, gameKey: requestedKey };
});

// ───────────────────────────────────────────────────────────
// Updates
// ───────────────────────────────────────────────────────────
ipcMain.handle('update/remindLater', async () => {
  // Intentionally not persisted: the update prompt will show again on the
  // next app startup since nothing is written to disk here.
  pendingUpdateInfo = null;
  return { ok: true };
});

ipcMain.handle('app/getVersion', () => app.getVersion());

ipcMain.handle('settings/get', async () => ({ ...(await getSettings()) }));

ipcMain.handle('settings/setShowFakeWindow', async (_evt, value) => {
  const settings = await getSettings();
  settings.showFakeWindow = Boolean(value);
  try {
    ensureDirSync(app.getPath('userData'));
    await writeJson(path.join(app.getPath('userData'), 'settings.json'), settings);
  } catch { /* the choice still applies until the app closes */ }
  return { ...settings };
});

ipcMain.handle('update/check', async () => checkForUpdatesNow());

ipcMain.handle('update/getPending', async () => pendingUpdatePayload);

ipcMain.handle('update/install', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Updates are only available in packaged builds.' };
  if (updateDownloading) return { ok: true };

  try {
    setupAutoUpdater();
    updateDownloading = true;
    await autoUpdater.downloadUpdate();

    // When update-downloaded fires, renderer can call quitAndInstall.
    return { ok: true };
  } catch (e) {
    updateDownloading = false;
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