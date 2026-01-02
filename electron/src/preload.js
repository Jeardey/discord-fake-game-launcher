const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  // Window
  minimize: () => ipcRenderer.invoke('app/window/minimize'),
  close: () => ipcRenderer.invoke('app/window/close'),

  // Data
  syncGameList: () => ipcRenderer.invoke('launcher/syncGameList'),
  getDatabaseGames: (filter) => ipcRenderer.invoke('launcher/getDatabaseGames', { filter }),
  getMyGames: () => ipcRenderer.invoke('launcher/getMyGames'),
  addGame: (game) => ipcRenderer.invoke('launcher/addGame', game),
  toggleFavorite: (appId, exe) => ipcRenderer.invoke('launcher/toggleFavorite', { appId, exe }),

  // Run
  selectGame: (game) => ipcRenderer.invoke('launcher/selectGame', game),
  launchGame: (game) => ipcRenderer.invoke('launcher/launchGame', game),
  stopGame: () => ipcRenderer.invoke('launcher/stopGame'),

  // Events
  onGameExited: (handler) => {
    ipcRenderer.removeAllListeners('launcher/gameExited');
    ipcRenderer.on('launcher/gameExited', handler);
  }
});
