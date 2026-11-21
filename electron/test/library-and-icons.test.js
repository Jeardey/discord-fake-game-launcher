const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeGamesIntoLibrary, isStaleCopy } = require('../src/library');
const { buildPool } = require('../src/random-mode');
const { buildIconUrl, isValidAppId, isValidIconHash, createIconResolver } = require('../src/game-icons');

// ── Library merge ───────────────────────────────────────────────────────────

test('mergeGamesIntoLibrary adds new games and never duplicates or touches existing ones', () => {
  const existing = [{ appId: '1', name: 'Alpha', exe: 'alpha.exe', isFavorite: true }];
  const games = [
    { id: '1', name: 'Alpha', exe: 'alpha.exe' },      // already there
    { id: '2', name: 'Beta', exe: 'bin/beta.exe' },
    { id: '2', name: 'Beta', exe: 'bin/beta.exe' },    // duplicate inside the input
    { id: '', name: 'No id', exe: 'x.exe' },           // invalid
    { id: '3', name: 'No exe', exe: '' }               // invalid
  ];

  const { list, added } = mergeGamesIntoLibrary(existing, games);

  assert.equal(added, 1);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { appId: '1', name: 'Alpha', exe: 'alpha.exe', isFavorite: true });
  assert.deepEqual(list[1], { appId: '2', name: 'Beta', exe: 'bin/beta.exe', isFavorite: false });
  assert.equal(existing.length, 1, 'input list must not be mutated');
});

test('mergeGamesIntoLibrary tolerates bad input', () => {
  assert.deepEqual(mergeGamesIntoLibrary(null, null), { list: [], added: 0 });
  assert.equal(mergeGamesIntoLibrary(undefined, [{ id: '9', name: 'Z', exe: 'z.exe' }]).added, 1);
});

test('adding the whole database pool to the library matches the random-mode pool size', () => {
  const db = [
    { id: '1', name: 'Alpha', exe: 'alpha.exe', isLauncher: false, usesNewDetection: false },
    { id: '2', name: 'Beta', exe: 'beta.exe', isLauncher: false, usesNewDetection: false },
    { id: '3', name: 'New detection', exe: 'New detection.exe', isLauncher: false, usesNewDetection: true },
    { id: '4', name: 'Launcher only', exe: 'launcher.exe', isLauncher: true, usesNewDetection: false },
    { id: '5', name: 'Bad name', exe: '>bad.exe', isLauncher: false, usesNewDetection: false }
  ];
  const pool = buildPool({ source: 'database', library: [], databaseGames: db });
  const { list, added } = mergeGamesIntoLibrary([], pool.map(p => ({ id: p.appId, name: p.name, exe: p.exe })));

  assert.equal(added, pool.length);
  assert.deepEqual(list.map(g => g.name), ['Alpha', 'Beta']);

  // Running it a second time changes nothing.
  assert.equal(mergeGamesIntoLibrary(list, pool.map(p => ({ id: p.appId, name: p.name, exe: p.exe }))).added, 0);
});

// ── Stale copy detection (fake game folders vs DummyGame template) ──────────

test('isStaleCopy refreshes only when the copy is missing, different in size or older', () => {
  const src = { size: 100, mtimeMs: 10_000 };
  assert.equal(isStaleCopy(src, null), true);
  assert.equal(isStaleCopy(src, { size: 99, mtimeMs: 10_000 }), true);
  assert.equal(isStaleCopy(src, { size: 100, mtimeMs: 5_000 }), true);
  assert.equal(isStaleCopy(src, { size: 100, mtimeMs: 10_000 }), false);
  assert.equal(isStaleCopy(src, { size: 100, mtimeMs: 90_000 }), false);
  assert.equal(isStaleCopy(null, { size: 1, mtimeMs: 1 }), false);
});

// ── Icons ───────────────────────────────────────────────────────────────────

test('buildIconUrl only accepts safe ids and hashes', () => {
  assert.equal(isValidAppId('356875570916753438'), true);
  assert.equal(isValidAppId('abc'), false);
  assert.equal(isValidAppId('123/../x'), false);
  assert.equal(isValidIconHash('b2b5c9e1a3f4'), true);
  assert.equal(isValidIconHash('x"onerror="alert(1)'), false);
  assert.equal(isValidIconHash(null), false);

  assert.equal(
    buildIconUrl('356875570916753438', 'abcdef123456'),
    'https://cdn.discordapp.com/app-icons/356875570916753438/abcdef123456.png?size=64'
  );
  assert.equal(buildIconUrl('356875570916753438', '"><script>'), '');
  assert.equal(buildIconUrl('nope', 'abcdef123456'), '');
});

test('icon resolver uses the hash from Discord\'s list without any network call', async () => {
  let calls = 0;
  const resolver = createIconResolver({
    getKnownHash: (id) => (id === '11111' ? 'knownhash1' : ''),
    fetchJson: async () => { calls += 1; return { status: 404, json: null }; }
  });
  assert.equal(await resolver.resolve('11111'), 'https://cdn.discordapp.com/app-icons/11111/knownhash1.png?size=64');
  assert.equal(calls, 0);
});

test('icon resolver looks the icon up, caches it and dedupes concurrent requests', async () => {
  let calls = 0;
  const resolver = createIconResolver({
    fetchJson: async () => { calls += 1; return { status: 200, json: { icon: 'fromrpc1234' } }; }
  });

  const [a, b] = await Promise.all([resolver.resolve('22222'), resolver.resolve('22222')]);
  assert.equal(a, 'https://cdn.discordapp.com/app-icons/22222/fromrpc1234.png?size=64');
  assert.equal(b, a);
  assert.equal(calls, 1);

  assert.equal(await resolver.resolve('22222'), a);
  assert.equal(calls, 1, 'second request is served from cache');
});

test('icon resolver caches "no icon" but retries after rate limits and network errors', async () => {
  const seq = [
    { status: 429, json: null },
    'throw',
    { status: 200, json: { icon: null } },
    { status: 200, json: { icon: 'shouldnotbeused' } }
  ];
  let i = 0;
  const resolver = createIconResolver({
    fetchJson: async () => {
      const next = seq[i++];
      if (next === 'throw') throw new Error('offline');
      return next;
    }
  });

  assert.equal(await resolver.resolve('33333'), '', 'rate limited');
  assert.equal(await resolver.resolve('33333'), '', 'network error');
  assert.equal(await resolver.resolve('33333'), '', 'game without icon');
  assert.equal(i, 3);
  assert.equal(await resolver.resolve('33333'), '', 'no-icon result is cached');
  assert.equal(i, 3);
});

test('icon resolver never rejects and ignores invalid ids', async () => {
  const resolver = createIconResolver({
    fetchJson: async () => { throw new Error('boom'); }
  });
  assert.equal(await resolver.resolve('not-an-id'), '');
  assert.equal(await resolver.resolve(undefined), '');
  assert.equal(await resolver.resolve('44444'), '');
});

test('icon resolver respects the concurrency limit', async () => {
  let running = 0;
  let peak = 0;
  const resolver = createIconResolver({
    concurrency: 3,
    fetchJson: async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running -= 1;
      return { status: 200, json: { icon: 'iconhash12' } };
    }
  });

  const ids = Array.from({ length: 12 }, (_, n) => String(50000 + n));
  await Promise.all(ids.map(id => resolver.resolve(id)));
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.ok(peak >= 2);
});
