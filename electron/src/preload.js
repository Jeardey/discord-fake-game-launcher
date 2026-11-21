const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  // Window
  minimize: () => ipcRenderer.invoke('app/window/minimize'),
  close: () => ipcRenderer.invoke('app/window/close'),

  // Data
  syncGameList: () => ipcRenderer.invoke('launcher/syncGameList'),
  getDatabaseGames: (filter, offset, limit) => ipcRenderer.invoke('launcher/getDatabaseGames', { filter, offset, limit }),
  getMyGames: () => ipcRenderer.invoke('launcher/getMyGames'),
  addGame: (game) => ipcRenderer.invoke('launcher/addGame', game),
  toggleFavorite: (appId, exe) => ipcRenderer.invoke('launcher/toggleFavorite', { appId, exe }),
  deleteGame: (appId, exe) => ipcRenderer.invoke('launcher/deleteGame', { appId, exe }),
  createShortcut: (appId, exe) => ipcRenderer.invoke('launcher/createShortcut', { appId, exe }),
  addPopularGames: () => ipcRenderer.invoke('launcher/addPopularGames'),
  addAllGames: () => ipcRenderer.invoke('launcher/addAllGames'),
  getGameIcon: (appId) => ipcRenderer.invoke('launcher/getGameIcon', { appId }),

  // Random mode
  startRandomMode: (minutes, source) => ipcRenderer.invoke('random/start', { minutes, source }),
  stopRandomMode: () => ipcRenderer.invoke('random/stop'),
  getRandomStatus: () => ipcRenderer.invoke('random/status'),
  getRandomPoolSize: (source) => ipcRenderer.invoke('random/poolSize', { source }),
  onRandomChanged: (handler) => {
    ipcRenderer.removeAllListeners('random/changed');
    ipcRenderer.on('random/changed', (_evt, payload) => handler(payload));
  },

  // Run
  selectGame: (game) => ipcRenderer.invoke('launcher/selectGame', game),
  launchGame: (game) => ipcRenderer.invoke('launcher/launchGame', game),
  stopGame: (game) => ipcRenderer.invoke('launcher/stopGame', game),

  // Events
  onGameExited: (handler) => {
    ipcRenderer.removeAllListeners('launcher/gameExited');
    ipcRenderer.on('launcher/gameExited', (_evt, payload) => handler(payload));
  },

  // App info
  getAppVersion: () => ipcRenderer.invoke('app/getVersion'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('update/check'),
  getPendingUpdate: () => ipcRenderer.invoke('update/getPending'),
  installUpdate: () => ipcRenderer.invoke('update/install'),
  remindUpdateLater: () => ipcRenderer.invoke('update/remindLater'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('update/quitAndInstall'),
  onUpdateAvailable: (handler) => {
    ipcRenderer.removeAllListeners('update/available');
    ipcRenderer.on('update/available', (_evt, payload) => handler(payload));
  },
  onUpdateProgress: (handler) => {
    ipcRenderer.removeAllListeners('update/progress');
    ipcRenderer.on('update/progress', (_evt, payload) => handler(payload));
  },
  onUpdateDownloaded: (handler) => {
    ipcRenderer.removeAllListeners('update/downloaded');
    ipcRenderer.on('update/downloaded', handler);
  },
  onUpdateError: (handler) => {
    ipcRenderer.removeAllListeners('update/error');
    ipcRenderer.on('update/error', (_evt, payload) => handler(payload));
  }
});
