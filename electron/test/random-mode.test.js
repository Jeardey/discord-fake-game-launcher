const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isUsableExe,
  buildPool,
  pickNextGame,
  clampMinutes,
  createRandomController
} = require('../src/random-mode');
const { matchPopularGames, normalizeName } = require('../src/popular-games');
const { makeGameKey } = require('../src/launcher-state');

const db = [
  { id: '1', name: 'Alpha', exe: 'alpha.exe', isLauncher: false, usesNewDetection: false, exes: ['alpha.exe', 'alpha_dx12.exe'] },
  { id: '2', name: 'Beta', exe: 'bin/beta.exe', isLauncher: false, usesNewDetection: false, exes: ['bin/beta.exe'] },
  { id: '3', name: 'Gamma (fallback)', exe: 'Gamma (fallback).exe', isLauncher: false, usesNewDetection: true, exes: [] },
  { id: '4', name: 'Delta', exe: '>delta.exe', isLauncher: false, usesNewDetection: false, exes: ['>delta.exe'] },
  { id: '5', name: 'Epsilon Launcher', exe: 'launcher.exe', isLauncher: true, usesNewDetection: false, exes: ['launcher.exe'] },
  { id: '6', name: 'Zeta', exe: '../evil.exe', isLauncher: false, usesNewDetection: false, exes: ['../evil.exe'] }
];

test('isUsableExe rejects invalid / unsafe names', () => {
  assert.equal(isUsableExe('game.exe'), true);
  assert.equal(isUsableExe('bin/win64/game.exe'), true);
  assert.equal(isUsableExe('>game.exe'), false);
  assert.equal(isUsableExe('../game.exe'), false);
  assert.equal(isUsableExe('a:b.exe'), false);
  assert.equal(isUsableExe('con.exe'), false);
  assert.equal(isUsableExe('game.bat'), false);
  assert.equal(isUsableExe(''), false);
  assert.equal(isUsableExe(null), false);
});

test('database pool only contains recognized, usable, non-launcher games', () => {
  const pool = buildPool({ source: 'database', library: [], databaseGames: db });
  assert.deepEqual(pool.map(g => g.name), ['Alpha', 'Beta']);
});

test('library pool keeps only games Discord lists with that exact exe', () => {
  const library = [
    { appId: '1', name: 'Alpha', exe: 'alpha.exe' },
    { appId: '1', name: 'Alpha', exe: 'ALPHA_DX12.exe' },
    { appId: '1', name: 'Alpha', exe: 'something_else.exe' },
    { appId: '3', name: 'Gamma (fallback)', exe: 'Gamma (fallback).exe' },
    { appId: '99', name: 'Not in Discord', exe: 'x.exe' }
  ];
  const pool = buildPool({ source: 'library', library, databaseGames: db });
  assert.deepEqual(pool.map(g => g.exe), ['alpha.exe', 'ALPHA_DX12.exe']);
});

test('pickNextGame avoids running and recent games when possible', () => {
  const pool = [{ appId: '1', exe: 'a.exe', name: 'A' }, { appId: '2', exe: 'b.exe', name: 'B' }, { appId: '3', exe: 'c.exe', name: 'C' }];
  const running = new Set([makeGameKey(pool[0])]);
  const recent = [makeGameKey(pool[1])];
  for (let i = 0; i < 20; i++) {
    assert.equal(pickNextGame(pool, { runningKeys: running, recentKeys: recent }).name, 'C');
  }
  // Everything recent -> falls back to non-running games
  const all = pool.map(makeGameKey);
  assert.ok(pickNextGame(pool, { runningKeys: running, recentKeys: all }));
  // Everything running -> nothing to pick
  assert.equal(pickNextGame(pool, { runningKeys: new Set(all) }), null);
  assert.equal(pickNextGame([], {}), null);
});

test('clampMinutes', () => {
  assert.equal(clampMinutes('15'), 15);
  assert.equal(clampMinutes(0), 1);
  assert.equal(clampMinutes(99999), 1440);
  assert.equal(clampMinutes('abc'), null);
});

function makeHarness({ pool, failFor = new Set() }) {
  const launched = [];
  const stopped = [];
  const running = new Set();
  const timers = [];
  let clock = 1_000_000;
  const changes = [];

  const controller = createRandomController({
    getPool: () => pool,
    launch: async (g) => {
      if (failFor.has(g.name)) return { ok: false, error: 'boom' };
      launched.push(g.name);
      running.add(makeGameKey(g));
      return { ok: true };
    },
    stop: async (g) => { stopped.push(g.name); running.delete(makeGameKey(g)); },
    getRunningKeys: () => new Set(running),
    onChange: (s) => changes.push(s),
    sleep: async () => {},
    now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    gapMs: 0
  });

  return { controller, launched, stopped, running, timers, changes, tick: async () => { const t = timers.shift(); clock += t.ms; t.fn(); await new Promise(r => setImmediate(r)); } };
}

const POOL = ['A', 'B', 'C', 'D'].map((n, i) => ({ appId: String(i + 1), name: n, exe: `${n.toLowerCase()}.exe` }));

test('controller launches immediately, then switches on every interval', async () => {
  const h = makeHarness({ pool: POOL });
  const r = await h.controller.start({ minutes: 2, source: 'library' });
  assert.equal(r.ok, true);
  assert.equal(h.launched.length, 1);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 2 * 60 * 1000);
  assert.equal(h.controller.status().active, true);

  await h.tick();
  assert.equal(h.launched.length, 2);
  assert.equal(h.stopped.length, 1);
  assert.equal(h.stopped[0], h.launched[0]);
  assert.notEqual(h.launched[1], h.launched[0]);
  assert.equal(h.running.size, 1, 'only one random game at a time');

  await h.tick();
  assert.equal(h.controller.status().switches, 3);
});

test('stop() kills the current game and cancels the timer', async () => {
  const h = makeHarness({ pool: POOL });
  await h.controller.start({ minutes: 1, source: 'library' });
  const r = await h.controller.stop();
  assert.equal(r.ok, true);
  assert.equal(h.running.size, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(h.controller.status().active, false);
});

test('start() fails on empty pool and invalid minutes, and cannot start twice', async () => {
  const empty = makeHarness({ pool: [] });
  assert.equal((await empty.controller.start({ minutes: 5, source: 'library' })).ok, false);

  const h = makeHarness({ pool: POOL });
  assert.equal((await h.controller.start({ minutes: 'abc' })).ok, false);
  assert.equal((await h.controller.start({ minutes: 5 })).ok, true);
  assert.equal((await h.controller.start({ minutes: 5 })).ok, false);
});

test('failed launches fall through to another game', async () => {
  const h = makeHarness({ pool: POOL, failFor: new Set(['A', 'B']) });
  await h.controller.start({ minutes: 1, source: 'library' });
  assert.equal(h.launched.length, 1);
  assert.ok(['C', 'D'].includes(h.launched[0]));
});

test('when every launch fails the loop keeps running and reports the issue', async () => {
  const h = makeHarness({ pool: POOL, failFor: new Set(['A', 'B', 'C', 'D']) });
  await h.controller.start({ minutes: 1, source: 'library' });
  const s = h.controller.status();
  assert.equal(s.active, true);
  assert.equal(s.current, null);
  assert.match(s.lastError, /boom/);
  assert.equal(h.timers.length, 1);
});

test('notifyExited clears the current game; dispose returns it for killing', async () => {
  const h = makeHarness({ pool: POOL });
  await h.controller.start({ minutes: 1, source: 'library' });
  const cur = h.controller.status().current;
  h.controller.notifyExited('nope');
  assert.ok(h.controller.status().current);
  h.controller.notifyExited(cur.key);
  assert.equal(h.controller.status().current, null);

  await h.tick();
  const disposed = h.controller.dispose();
  assert.ok(disposed);
  assert.equal(h.controller.status().active, false);
  assert.equal(h.timers.length, 0);
});

test('matchPopularGames matches by normalized name, only recognized games', () => {
  assert.equal(normalizeName("Tom Clancy's Rainbow Six® Siege"), 'tom clancy s rainbow six siege');
  const games = [
    { id: '10', name: 'VALORANT', exe: 'VALORANT-Win64-Shipping.exe', isLauncher: false, usesNewDetection: false },
    { id: '11', name: 'Minecraft', exe: 'minecraft.exe', isLauncher: false, usesNewDetection: true },
    { id: '12', name: 'Fortnite', exe: 'FortniteClient-Win64-Shipping.exe', isLauncher: true, usesNewDetection: false },
    { id: '13', name: 'Some Unlisted Game', exe: 'x.exe', isLauncher: false, usesNewDetection: false }
  ];
  const matched = matchPopularGames(games, ['valorant', 'Minecraft', 'Fortnite']);
  assert.deepEqual(matched.map(g => g.name), ['VALORANT']);
});

test('GTA IV matches by name and by edition-suffixed names, but not GTA V', () => {
  const { POPULAR_GAME_NAMES } = require('../src/popular-games');
  const mk = (id, name, exe = 'gta.exe') => ({ id, name, exe, isLauncher: false, usesNewDetection: false });
  const games = [
    mk('1', 'Grand Theft Auto IV'),
    mk('2', 'Grand Theft Auto IV: Complete Edition'),
    mk('3', 'Grand Theft Auto IVX Mod'),
    mk('4', 'Grand Theft Auto V', 'gta5.exe')
  ];
  const names = matchPopularGames(games, POPULAR_GAME_NAMES).map(g => g.name).sort();
  assert.deepEqual(names, ['Grand Theft Auto IV', 'Grand Theft Auto IV: Complete Edition', 'Grand Theft Auto V']);
});

test('the next game is announced in advance and is the one that starts at the next switch', async () => {
  const h = makeHarness({ pool: POOL });
  await h.controller.start({ minutes: 2, source: 'library' });

  const first = h.controller.status();
  assert.ok(first.next, 'a next game is announced right after start');
  assert.notEqual(first.next.key, first.current.key, 'next is not the game already playing');

  await h.tick();
  assert.equal(h.launched[1], first.next.name, 'the announced game really starts');
  assert.ok(h.controller.status().next, 'a new next game is announced after the switch');

  await h.controller.stop();
  assert.equal(h.controller.status().next, null, 'no next game once random mode is off');
});
