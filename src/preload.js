const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskcal', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveEvents: (events) => ipcRenderer.invoke('events:save', events),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setAgenda: (next) => ipcRenderer.invoke('agenda:set', next),
  previewAgendaWidth: (width) => ipcRenderer.send('agenda:preview-width', width),
  setCalendarWidth: (width) => ipcRenderer.send('window:calendar-width', width),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  setInteractive: (value) => ipcRenderer.send('window:interactive', Boolean(value)),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: () => ipcRenderer.invoke('update:open-releases'),
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update:status', (_event, value) => callback(value)),
  onOpenSettings: (callback) =>
    ipcRenderer.on('settings:open-request', () => callback()),
  onSettingsChanged: (callback) =>
    ipcRenderer.on('settings:changed', (_event, value) => callback(value)),
  onReminder: (callback) =>
    ipcRenderer.on('reminder:fired', (_event, value) => callback(value)),
  onReminderOpen: (callback) =>
    ipcRenderer.on('reminder:open', (_event, payload) => callback(payload))
});
