// Game icons come from Discord's own CDN and are only kept in memory (never written to disk),
// so nothing about artwork is persisted in the user's library.

const RPC_URL = (appId) => `https://discord.com/api/v10/applications/${appId}/rpc`;
const ICON_URL = (appId, hash) => `https://cdn.discordapp.com/app-icons/${appId}/${hash}.png?size=64`;

const APP_ID_RE = /^\d{5,25}$/;
const ICON_HASH_RE = /^[A-Za-z0-9_]{4,64}$/;

function isValidAppId(appId) {
  return APP_ID_RE.test(String(appId ?? ''));
}

function isValidIconHash(hash) {
  return typeof hash === 'string' && ICON_HASH_RE.test(hash);
}

/** Builds the CDN url, or '' when the id/hash are not safe/valid. */
function buildIconUrl(appId, hash) {
  if (!isValidAppId(appId) || !isValidIconHash(hash)) return '';
  return ICON_URL(String(appId), hash);
}

/**
 * Creates an icon resolver.
 *
 * deps:
 *   getKnownHash(appId) -> string|''   icon hash already present in Discord's list (optional)
 *   fetchJson(url)      -> Promise<{status:number, json:any}>   (injected so it is testable)
 *   concurrency         -> max parallel lookups
 *
 * resolve(appId) always resolves to a url string, or '' when the game has no icon / the lookup
 * failed. It never rejects. Rate limited (429) and network errors are NOT cached, so they are
 * retried the next time the icon is requested.
 */
function createIconResolver({ getKnownHash = () => '', fetchJson, concurrency = 4 } = {}) {
  const cache = new Map();     // appId -> url ('' = no icon)
  const inflight = new Map();  // appId -> Promise<string>
  const waiting = [];
  let active = 0;

  function pump() {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      active += 1;
      job().finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  function schedule(task) {
    return new Promise((resolve) => {
      waiting.push(() => task().then(resolve, () => resolve('')));
      pump();
    });
  }

  async function lookup(appId) {
    const known = getKnownHash(appId);
    if (isValidIconHash(known)) {
      const url = buildIconUrl(appId, known);
      cache.set(appId, url);
      return url;
    }

    if (typeof fetchJson !== 'function') return '';

    let res;
    try {
      res = await fetchJson(RPC_URL(appId));
    } catch {
      return ''; // offline / timeout: try again later
    }

    if (!res || res.status === 429 || res.status >= 500) return ''; // transient: do not cache

    const url = res.status >= 200 && res.status < 300
      ? buildIconUrl(appId, res?.json?.icon)
      : '';
    cache.set(appId, url);
    return url;
  }

  function resolve(appIdRaw) {
    const appId = String(appIdRaw ?? '');
    if (!isValidAppId(appId)) return Promise.resolve('');
    if (cache.has(appId)) return Promise.resolve(cache.get(appId));
    if (inflight.has(appId)) return inflight.get(appId);

    const p = schedule(() => lookup(appId)).finally(() => inflight.delete(appId));
    inflight.set(appId, p);
    return p;
  }

  return { resolve, _cache: cache };
}

module.exports = {
  isValidAppId,
  isValidIconHash,
  buildIconUrl,
  createIconResolver
};
