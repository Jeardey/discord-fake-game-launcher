const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');

// Linux AppImages are packaged without root privileges, so the bundled
// `chrome-sandbox` helper can never be chown'd to root:root with the setuid
// bit set. Without that, Chromium's sandbox initialization fails outright on
// many distros (especially ones that restrict unprivileged user namespaces),
// and the whole process exits immediately with no window and no visible
// error. Disable the sandbox on Linux only; Windows/macOS are unaffected.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

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

// ───────────────────────────────────────────────────────────
// Platform support
// ───────────────────────────────────────────────────────────
// Discord's detectable-apps database lists executables per OS ('win32',
// 'linux', 'darwin'). We only ever pick entries matching the OS we're
// actually running on, so existing Windows behavior is unaffected by any
// of the Linux-specific additions below.
function getDetectionOsKey() {
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'darwin') return 'darwin';
  return 'win32';
}

function getDummyBinaryName() {
  return process.platform === 'win32' ? 'DummyGame.exe' : 'DummyGame';
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

  // Only Windows executables use the .exe suffix; Linux/macOS process names
  // typically have no extension.
  if (getDetectionOsKey() !== 'win32') return safeBase;
  return safeBase.toLowerCase().endsWith('.exe') ? safeBase : `${safeBase}.exe`;
}

function normalizeExeRelPath(exeName) {
  return (exeName || '')
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep);
}

function pickBestExecutable(appEntry) {
  const exes = Array.isArray(appEntry.executables) ? appEntry.executables : [];
  const osKey = getDetectionOsKey();

  const nonLauncherMatch = exes.find(e =>
    String(e?.os || '').toLowerCase() === osKey && !e?.is_launcher && e?.name);
  if (nonLauncherMatch) return nonLauncherMatch;

  const anyMatch = exes.find(e =>
    String(e?.os || '').toLowerCase() === osKey && e?.name);
  return anyMatch || null;
}

function toDatabaseGames(detectableApps) {
  const result = [];
  for (const appEntry of detectableApps || []) {
    if (!appEntry?.name) continue;
    const bestExe = pickBestExecutable(appEntry);

    const appId = String(appEntry.id || '');
    const exeName = bestExe?.name ? String(bestExe.name) : fallbackExeNameFromTitle(appEntry.name);

    result.push({
      id: appId,
      name: String(appEntry.name),
      exe: exeName,
      isLauncher: Boolean(bestExe?.is_launcher),
      usesNewDetection: !bestExe || !bestExe.name, // <-- FLAG FOR FRONTEND
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

  const dummyBinaryName = getDummyBinaryName();

  // Packaged build: bundled via electron-builder extraResources
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'dummygame', dummyBinaryName);
    if (fs.existsSync(bundled)) return bundled;
  }

  // Repo-relative fallback (dev): ../src/DummyGame/bin/**/DummyGame(.exe)
  const repoRoot = path.resolve(app.getAppPath(), '..', '..');
  const dummyProjBin = path.join(repoRoot, 'src', 'DummyGame', 'bin');
  if (!fs.existsSync(dummyProjBin)) return null;

  // Try common locations first (Release, Debug)
  const candidates = [];
  const configs = ['Release', 'Debug'];
  const tfms = process.platform === 'win32'
    ? ['net8.0-windows', 'net8.0-windows7.0']
    : ['net8.0'];
  for (const cfg of configs) {
    for (const tfm of tfms) {
      candidates.push(path.join(dummyProjBin, cfg, tfm, dummyBinaryName));
    }
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
      } else if (e.isFile() && e.name.toLowerCase() === dummyBinaryName.toLowerCase()) {
        return p;
      }
    }
  }

  return null;
}

async function ensureFakeExeForGame(game, paths) {
  const dummySourceExe = await findDummyGameTemplate();
  if (!dummySourceExe) {
    throw new Error(`Could not find ${getDummyBinaryName()}. Run: npm run build:dummy (from electron/), or set DUMMYGAME_EXE env var to the built binary path.`);
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

    // fs.copyFile doesn't reliably preserve the executable bit on Linux/macOS
    // (umask can strip it), so make sure Discord can actually run the process.
    if (process.platform !== 'win32') {
      try { await fsp.chmod(destExePath, 0o755); } catch { /* ignore */ }
    }

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

// Escapes a single argument for the Exec= line of a freedesktop .desktop
// entry, per the Desktop Entry Specification quoting rules.
function escapeDesktopExecArg(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

async function createLinuxDesktopShortcut({ desktopDir, baseName, displayName, destExePath, workingDirectory }) {
  ensureDirSync(desktopDir);

  let shortcutPath = path.join(desktopDir, `${baseName}.desktop`);

  // Avoid overwriting existing shortcuts: Game.desktop, Game (2).desktop, ...
  if (fs.existsSync(shortcutPath)) {
    for (let i = 2; i < 1000; i++) {
      const candidate = path.join(desktopDir, `${baseName} (${i}).desktop`);
      if (!fs.existsSync(candidate)) {
        shortcutPath = candidate;
        break;
      }
    }
  }

  const execLine = `${escapeDesktopExecArg(destExePath)} ${escapeDesktopExecArg(displayName)}`;
  const escapedName = String(displayName).replace(/\n/g, ' ');

  const contents = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${escapedName}`,
    `Exec=${execLine}`,
    `Path=${workingDirectory}`,
    'Terminal=false',
    'Categories=Game;',
    ''
  ].join('\n');

  await fsp.writeFile(shortcutPath, contents, 'utf8');

  // Most Linux desktop environments require the executable bit before a
  // .desktop launcher is trusted/runnable from the desktop.
  try { await fsp.chmod(shortcutPath, 0o755); } catch { /* ignore */ }

  return { ok: true, path: shortcutPath };
}

ipcMain.handle('launcher/createShortcut', async (_evt, { appId, exe }) => {
  if (process.platform !== 'win32' && process.platform !== 'linux') {
    return { ok: false, error: 'Shortcuts are only supported on Windows and Linux.' };
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
    const displayName = String(game?.name || path.basename(destExePath));
    const baseName = sanitizeFolderName(game.name || path.basename(destExePath, path.extname(destExePath))) || 'Game';

    if (process.platform === 'linux') {
      return createLinuxDesktopShortcut({ desktopDir, baseName, displayName, destExePath, workingDirectory });
    }

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