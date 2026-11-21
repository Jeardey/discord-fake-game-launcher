const { makeGameKey } = require('./launcher-state');

/**
 * Adds `games` (database entries: {id, name, exe}) to the library list without creating
 * duplicates. Existing entries are never modified or reordered; new ones go to the end.
 * Returns the new list and how many entries were added. The input list is not mutated.
 */
function mergeGamesIntoLibrary(existing, games) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  const keys = new Set(list.map(g => makeGameKey({ appId: g?.appId, exe: g?.exe })));
  let added = 0;

  for (const g of Array.isArray(games) ? games : []) {
    const appId = String(g?.id ?? g?.appId ?? '');
    const exe = String(g?.exe ?? '');
    if (!appId || !exe) continue;

    const key = makeGameKey({ appId, exe });
    if (!key || keys.has(key)) continue;

    keys.add(key);
    list.push({ appId, name: String(g?.name || 'Game'), exe, isFavorite: false });
    added += 1;
  }

  return { list, added };
}

/**
 * True when a copy of a bundled file (dest) is older than / different from its source,
 * so it should be refreshed. Used to keep already-created fake game folders in sync
 * with the DummyGame template after the launcher is updated.
 */
function isStaleCopy(srcStat, destStat) {
  if (!srcStat) return false;
  if (!destStat) return true;
  if (srcStat.size !== destStat.size) return true;
  return srcStat.mtimeMs - destStat.mtimeMs > 1000;
}

module.exports = { mergeGamesIntoLibrary, isStaleCopy };
