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

  // Run
  selectGame: (game) => ipcRenderer.invoke('launcher/selectGame', game),
  launchGame: (game) => ipcRenderer.invoke('launcher/launchGame', game),
  stopGame: () => ipcRenderer.invoke('launcher/stopGame'),

  // Events
  onGameExited: (handler) => {
    ipcRenderer.removeAllListeners('launcher/gameExited');
    ipcRenderer.on('launcher/gameExited', handler);
  },

  // Updates
  installUpdate: () => ipcRenderer.invoke('update/install'),
  remindUpdateLater: () => ipcRenderer.invoke('update/remindLater'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('update/quitAndInstall'),
  onUpdateAvailable: (handler) => {
    ipcRenderer.removeAllListeners('update/available');
    ipcRenderer.on('update/available', (_evt, payload) => handler(payload));
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
