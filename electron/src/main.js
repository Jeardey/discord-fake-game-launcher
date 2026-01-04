const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');

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
    gamesRoot: path.join(userData, 'games'),
    updateStatePath: path.join(userData, 'updateState.json')
  };
}

function sanitizeFolderName(name) {
  return (name || 'UnknownApp')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u0000-\u001F]/g, '_')
    .trim()
    .slice(0, 128);
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
    if (!bestExe?.name) continue;

    const appId = String(appEntry.id || '');

    result.push({
      id: appId,
      name: String(appEntry.name),
      exe: String(bestExe.name),
      isLauncher: Boolean(bestExe.is_launcher),
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
    databaseCache = {
      loaded: true,
      gameListPath,
      games
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
        isLauncher: g.isLauncher
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
let runningProc = null;

let pendingUpdateInfo = null;

async function readUpdateState() {
  const paths = getUserDataPaths();
  return await readJsonIfExists(paths.updateStatePath, { dismissedVersion: null, dismissedAt: null });
}

async function writeUpdateState(state) {
  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);
  await writeJson(paths.updateStatePath, state);
}

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

  autoUpdater.on('update-available', async (info) => {
    try {
      const state = await readUpdateState();
      if (state?.dismissedVersion && String(state.dismissedVersion) === String(info?.version || '')) {
        return; // user chose "remind later" for this version
      }
    } catch {
      // ignore
    }

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

ipcMain.handle('launcher/launchGame', async (_evt, game) => {
  if (runningProc) {
    return { ok: false, error: 'A game is already running.' };
  }

  const paths = getUserDataPaths();
  ensureDirSync(paths.userData);

  const { destExePath, workingDirectory } = await ensureFakeExeForGame(game, paths);

  const displayName = String(game?.name || path.basename(destExePath));

  runningProc = spawn(destExePath, [displayName], {
    cwd: workingDirectory,
    windowsHide: false,
    stdio: 'ignore'
  });

  runningProc.once('exit', () => {
    runningProc = null;
    mainWindow?.webContents.send('launcher/gameExited');
  });

  return { ok: true, exePath: destExePath };
});

ipcMain.handle('launcher/stopGame', async () => {
  if (!runningProc) return { ok: true };

  try {
    runningProc.kill();
  } catch {
    // ignore
  }

  runningProc = null;
  return { ok: true };
});

// ───────────────────────────────────────────────────────────
// Updates
// ───────────────────────────────────────────────────────────
ipcMain.handle('update/remindLater', async () => {
  const v = String(pendingUpdateInfo?.version || '');
  await writeUpdateState({ dismissedVersion: v || null, dismissedAt: new Date().toISOString() });
  pendingUpdateInfo = null;
  return { ok: true };
});

ipcMain.handle('update/install', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Updates are only available in packaged builds.' };

  try {
    // Clear any previous dismiss state so the same version doesn't get suppressed.
    await writeUpdateState({ dismissedVersion: null, dismissedAt: null });

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
