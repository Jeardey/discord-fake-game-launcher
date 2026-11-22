const { makeGameKey } = require('./launcher-state');

const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;
const DEFAULT_GAP_MS = 5000;     // pause between stopping one game and starting the next
const MAX_LAUNCH_ATTEMPTS = 5;   // different games to try when a launch fails
const MAX_RECENT = 10;           // how many past games are avoided when picking the next one

const INVALID_FILENAME_CHARS = /[<>:"|?*\u0000-\u001F]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * True when `exe` can safely be created on disk as a fake executable.
 * Discord sometimes prefixes names with ">" or uses wildcard-ish entries;
 * those are not valid Windows file names, so they are never used for random mode.
 */
function isUsableExe(exe) {
  if (typeof exe !== 'string') return false;
  const value = exe.trim();
  if (!value) return false;
  if (INVALID_FILENAME_CHARS.test(value)) return false;

  const parts = value.split(/[\\/]+/);
  for (const part of parts) {
    if (!part || part === '.' || part === '..') return false;
    if (RESERVED_WINDOWS_NAMES.test(part)) return false;
  }

  return parts[parts.length - 1].toLowerCase().endsWith('.exe');
}

/**
 * A database game counts as "recognized by Discord" when Discord lists an explicit
 * executable name for it (not the "new detection" fallback) and that name is usable.
 */
function isRecognizedDatabaseGame(game) {
  return Boolean(
    game &&
    game.id &&
    game.name &&
    !game.usesNewDetection &&
    isUsableExe(game.exe)
  );
}

function toPoolEntry(appId, name, exe) {
  return { appId: String(appId), name: String(name), exe: String(exe) };
}

/**
 * Builds the list of games random mode may pick from. Only games whose executable
 * is listed by Discord's detectable-apps database are ever returned.
 *
 * @param {object} args
 * @param {'library'|'database'} args.source
 * @param {Array} args.library       entries of myGames.json ({appId, name, exe})
 * @param {Array} args.databaseGames entries of the Discord database cache
 *                                   ({id, name, exe, isLauncher, usesNewDetection, exes?})
 */
function buildPool({ source, library, databaseGames }) {
  const db = Array.isArray(databaseGames) ? databaseGames : [];
  const seen = new Set();
  const pool = [];

  const push = (entry) => {
    const key = makeGameKey(entry);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pool.push(entry);
  };

  if (source === 'database') {
    for (const g of db) {
      if (!isRecognizedDatabaseGame(g) || g.isLauncher) continue;
      push(toPoolEntry(g.id, g.name, g.exe));
    }
    return pool;
  }

  // Library: keep only entries Discord lists with that exact executable.
  const recognizedExes = new Map(); // appId -> Set(lowercase exe names)
  for (const g of db) {
    if (!g || !g.id || g.usesNewDetection) continue;
    const exes = Array.isArray(g.exes) && g.exes.length ? g.exes : [g.exe];
    let set = recognizedExes.get(String(g.id));
    if (!set) {
      set = new Set();
      recognizedExes.set(String(g.id), set);
    }
    for (const exe of exes) {
      if (typeof exe === 'string' && exe) set.add(exe.toLowerCase());
    }
  }

  for (const g of Array.isArray(library) ? library : []) {
    if (!g || !g.appId || !g.name || !isUsableExe(g.exe)) continue;
    const set = recognizedExes.get(String(g.appId));
    if (!set || !set.has(String(g.exe).toLowerCase())) continue;
    push(toPoolEntry(g.appId, g.name, g.exe));
  }

  return pool;
}

/**
 * Picks a random game, avoiding games that are already running and (when possible)
 * games that were played recently.
 */
function pickNextGame(pool, { recentKeys = [], runningKeys = new Set(), rng = Math.random } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  const notRunning = pool.filter(g => !runningKeys.has(makeGameKey(g)));
  if (notRunning.length === 0) return null;

  const recent = new Set(recentKeys);
  let candidates = notRunning.filter(g => !recent.has(makeGameKey(g)));
  if (candidates.length === 0) candidates = notRunning;

  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index];
}

function clampMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(n)));
}

/**
 * Random mode state machine. All side effects are injected so it can be tested
 * without Electron.
 *
 * deps:
 *   getPool(source)  -> Array<{appId,name,exe}>   (called on every switch)
 *   launch(game)     -> Promise<{ok, alreadyRunning?, error?}>
 *   stop(game)       -> Promise<void>              (resolves once the process is gone)
 *   getRunningKeys() -> Set<string>
 *   onChange(status) -> void
 *   sleep(ms)        -> Promise<void>
 *   now()            -> number
 *   setTimer / clearTimer, rng, gapMs
 */
function createRandomController(deps) {
  const {
    getPool,
    launch,
    stop,
    getRunningKeys = () => new Set(),
    onChange = () => {},
    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (t) => clearTimeout(t),
    rng = Math.random,
    gapMs = DEFAULT_GAP_MS
  } = deps;

  let active = false;
  let runId = 0;
  let switching = false;
  let timer = null;
  let intervalMinutes = 0;
  let source = 'library';
  let current = null;        // game launched by random mode and still considered running
  let nextSwitchAt = null;
  let switches = 0;
  let lastError = null;
  let poolSize = 0;
  let recent = [];
  let upcoming = null;       // game already chosen to start at the next switch

  function status() {
    return {
      active,
      intervalMinutes,
      source,
      poolSize,
      switches,
      nextSwitchAt,
      lastError,
      current: current ? { ...current, key: makeGameKey(current) } : null,
      next: upcoming ? { ...upcoming, key: makeGameKey(upcoming) } : null
    };
  }

  function emit() {
    try { onChange(status()); } catch { /* UI errors must never break the loop */ }
  }

  function clearScheduled() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    nextSwitchAt = null;
  }

  function schedule(myRun) {
    clearScheduled();
    const ms = intervalMinutes * 60 * 1000;
    nextSwitchAt = now() + ms;
    timer = setTimer(() => {
      timer = null;
      switchGame(myRun).catch(() => { /* handled inside */ });
    }, ms);
  }

  // Chooses (and shows) which game will start at the next switch.
  function planNext() {
    try {
      const pool = getPool(source) || [];
      upcoming = pickNextGame(pool, { recentKeys: recent, runningKeys: getRunningKeys(), rng }) || null;
    } catch {
      upcoming = null;
    }
  }

  async function stopCurrent() {
    const game = current;
    if (!game) return;
    current = null;
    try { await stop(game); } catch { /* ignore */ }
  }

  async function switchGame(myRun) {
    if (!active || myRun !== runId || switching) return;
    switching = true;

    try {
      if (current) {
        await stopCurrent();
        emit();
        if (gapMs > 0) await sleep(gapMs);
        if (!active || myRun !== runId) return;
      }

      const pool = getPool(source) || [];
      poolSize = pool.length;

      const tried = new Set();
      let launched = null;
      lastError = null;
      const preferred = upcoming; // the game that was announced as "next"
      upcoming = null;

      for (let attempt = 0; attempt < MAX_LAUNCH_ATTEMPTS; attempt++) {
        const remaining = pool.filter(g => !tried.has(makeGameKey(g)));
        const preferredKey = preferred ? makeGameKey(preferred) : '';
        const usePreferred = attempt === 0 && preferred
          && !tried.has(preferredKey) && !getRunningKeys().has(preferredKey);
        const game = usePreferred ? preferred : pickNextGame(remaining, {
          recentKeys: recent,
          runningKeys: getRunningKeys(),
          rng
        });
        if (!game) break;

        tried.add(makeGameKey(game));

        let result;
        try {
          result = await launch(game);
        } catch (e) {
          result = { ok: false, error: String(e?.message || e) };
        }

        if (!active || myRun !== runId) {
          // Stopped while launching: do not leave the new process behind.
          if (result?.ok && !result.alreadyRunning) {
            try { await stop(game); } catch { /* ignore */ }
          }
          return;
        }

        if (result?.ok && !result.alreadyRunning) {
          launched = game;
          break;
        }
        if (!result?.ok) lastError = `${game.name}: ${result?.error || 'launch failed'}`;
      }

      if (launched) {
        current = launched;
        switches += 1;
        lastError = null;
        recent.push(makeGameKey(launched));
        const keep = Math.min(MAX_RECENT, Math.floor(poolSize / 2));
        recent = keep > 0 ? recent.slice(-keep) : [];
      } else if (!lastError) {
        lastError = 'No recognized game available to launch.';
      }

      planNext();
      schedule(myRun);
      emit();
    } finally {
      switching = false;
    }
  }

  async function start({ minutes, source: requestedSource } = {}) {
    if (active) return { ok: false, error: 'Random mode is already running.' };

    const clamped = clampMinutes(minutes);
    if (clamped == null) return { ok: false, error: 'Enter a valid number of minutes.' };

    const nextSource = requestedSource === 'database' ? 'database' : 'library';
    const pool = getPool(nextSource) || [];
    if (pool.length === 0) {
      return {
        ok: false,
        error: nextSource === 'library'
          ? 'Your library has no games recognized by Discord. Add games first or use the Discord database.'
          : 'No recognized games found in the Discord database. Try syncing the game list.'
      };
    }

    active = true;
    runId += 1;
    intervalMinutes = clamped;
    source = nextSource;
    poolSize = pool.length;
    switches = 0;
    lastError = null;
    current = null;
    upcoming = null;
    recent = [];
    emit();

    await switchGame(runId);
    return { ok: true, status: status() };
  }

  async function stopMode() {
    if (!active) return { ok: true, status: status() };
    active = false;
    runId += 1;
    clearScheduled();
    upcoming = null;
    await stopCurrent();
    emit();
    return { ok: true, status: status() };
  }

  /** Call when a process exits on its own (closed by the user, crashed...). */
  function notifyExited(gameKey) {
    if (!active || !current || makeGameKey(current) !== gameKey) return;
    current = null;
    emit();
  }

  /** Synchronous teardown for app quit. Returns the game that must be killed, if any. */
  function dispose() {
    const game = current;
    active = false;
    runId += 1;
    clearScheduled();
    current = null;
    return game;
  }

  return { start, stop: stopMode, status, notifyExited, dispose };
}

module.exports = {
  MIN_MINUTES,
  MAX_MINUTES,
  DEFAULT_GAP_MS,
  isUsableExe,
  isRecognizedDatabaseGame,
  buildPool,
  pickNextGame,
  clampMinutes,
  createRandomController
};
