function makeGameKey(game) {
  if (!game || typeof game !== 'object') return '';
  const appId = String(game.appId ?? '');
  const exe = String(game.exe ?? '');
  const key = `${appId}::${exe}`;
  return key === '::' ? '' : key;
}

function isGameRunning(runningGames, game) {
  if (!runningGames || !game) return false;
  const key = makeGameKey(game);
  return Boolean(key && runningGames.has(key));
}

function syncRunningGameSet(runningGames, game, isRunning) {
  const next = new Set(runningGames || []);
  const key = makeGameKey(game);

  if (!key) return next;
  if (isRunning) {
    next.add(key);
  } else {
    next.delete(key);
  }

  return next;
}

function removeExitedGame(runningGames, game) {
  const next = new Set(runningGames || []);
  const key = makeGameKey(game);
  if (key) next.delete(key);
  return next;
}

module.exports = {
  makeGameKey,
  isGameRunning,
  syncRunningGameSet,
  removeExitedGame
};
