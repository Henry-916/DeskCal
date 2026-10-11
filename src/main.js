const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification,
  nativeImage,
  dialog,
  screen,
  powerMonitor
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const CalendarCore = require('./calendar-core');
const DataModel = require('./data-model');
const DataStore = require('./data-store');
const { DEFAULT_DATA, SCHEMA_VERSION } = DataModel;

let mainWindow = null;
let tray = null;
let appData = structuredClone(DEFAULT_DATA);
let dataPath = '';
let reminderTimer = null;
let isQuitting = false;
let loadResult = null;
let boundsSaveTimer = null;
let pendingBounds = false;
const activeNotifications = new Set();

const appIconPath = path.join(__dirname, '..', 'assets', 'deskcal-icon.png');
const iconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="5" y="8" width="54" height="51" rx="13" fill="#6750E8"/>
    <rect x="5" y="17" width="54" height="12" fill="#EAE5FF"/>
    <rect x="17" y="3" width="6" height="17" rx="3" fill="#6750E8"/>
    <rect x="41" y="3" width="6" height="17" rx="3" fill="#6750E8"/>
    <circle cx="22" cy="41" r="5" fill="white"/>
    <circle cx="41" cy="41" r="5" fill="white" opacity=".65"/>
  </svg>`;

function createAppIcon() {
  const image = nativeImage.createFromPath(appIconPath);
  if (!image.isEmpty()) return image;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`
  );
}

function mergeData(value) {
  return DataModel.migrateData(value);
}

function loadData() {
  dataPath = path.join(app.getPath('userData'), 'deskcal-data.json');
  loadResult = DataStore.loadStore(dataPath);
  appData = loadResult.data;
}

function persistData(options) {
  if (!dataPath) return;
  DataStore.saveStore(dataPath, appData, options);
}

function flushBounds() {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  if (pendingBounds) {
    pendingBounds = false;
    persistData();
  }
}

function scheduleSaveBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  appData.window = { ...mainWindow.getBounds() };
  pendingBounds = true;
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null;
    pendingBounds = false;
    persistData();
  }, 500);
}

function ensureVisibleBounds(saved) {
  const displays = screen.getAllDisplays();
  const width = Math.max(720, Number(saved.width) || DEFAULT_DATA.window.width);
  const height = Math.max(520, Number(saved.height) || DEFAULT_DATA.window.height);
  const candidate = {
    x: Number(saved.x),
    y: Number(saved.y),
    width,
    height
  };
  const isVisible =
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    displays.some((display) => {
      const area = display.workArea;
      return (
        candidate.x < area.x + area.width - 80 &&
        candidate.x + width > area.x + 80 &&
        candidate.y < area.y + area.height - 80 &&
        candidate.y + height > area.y + 80
      );
    });

  if (isVisible) return candidate;
  const area = screen.getPrimaryDisplay().workArea;
  return {
    width: Math.min(width, area.width),
    height: Math.min(height, area.height),
    x: area.x + area.width - Math.min(width, area.width) - 24,
    y: area.y + 24
  };
}

function applyWindowSettings() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { windowMode, opacity, clickThrough } = appData.settings;
  mainWindow.setOpacity(Math.min(1, Math.max(0.55, Number(opacity) || 0.96)));
  mainWindow.setAlwaysOnTop(windowMode === 'top', 'floating');
  mainWindow.setSkipTaskbar(windowMode !== 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  mainWindow.setIgnoreMouseEvents(Boolean(clickThrough), { forward: true });
}

function createWindow() {
  const bounds = ensureVisibleBounds(appData.window);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    roundedCorners: true,
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  applyWindowSettings();

  mainWindow.once('ready-to-show', () => {
    mainWindow.showInactive();
    if (loadResult && (loadResult.corruptPath || loadResult.source === 'backup')) {
      const isRecovered = loadResult.source === 'backup';
      const message = isRecovered
        ? '数据文件损坏或丢失，已自动从备份恢复。'
        : '数据文件已损坏且备份不可用，已重置为空白数据。';
      const detail = loadResult.corruptPath
        ? `原始损坏文件已留存至：\n${loadResult.corruptPath}`
        : '';
      dialog
        .showMessageBox(mainWindow, {
          type: isRecovered ? 'info' : 'warning',
          title: 'DeskCal 数据恢复提示',
          message,
          detail
        })
        .catch(() => {});
      loadResult = null;
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  applyWindowSettings();
  mainWindow.show();
  if (!appData.settings.clickThrough) mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = mainWindow && mainWindow.isVisible();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: visible ? '隐藏桌面日历' : '显示桌面日历',
        click: () => (visible ? mainWindow.hide() : showWindow())
      },
      {
        label: '快速添加日程',
        click: () => {
          showWindow();
          mainWindow.webContents.send('event:create-request');
        }
      },
      { type: 'separator' },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: appData.settings.windowMode === 'top',
        click: (item) => {
          appData.settings.windowMode = item.checked ? 'top' : 'desktop';
          persistData();
          applyWindowSettings();
          mainWindow?.webContents.send('settings:changed', appData.settings);
          updateTrayMenu();
        }
      },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: appData.settings.clickThrough,
        click: (item) => {
          appData.settings.clickThrough = item.checked;
          persistData();
          applyWindowSettings();
          mainWindow?.webContents.send('settings:changed', appData.settings);
          updateTrayMenu();
        }
      },
      { type: 'separator' },
      {
        label: '设置',
        click: () => {
          showWindow();
          mainWindow.webContents.send('settings:open-request');
        }
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createTray() {
  tray = new Tray(createAppIcon().resize({ width: 20, height: 20 }));
  tray.setToolTip('DeskCal 桌面日历');
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showWindow();
    updateTrayMenu();
  });
  tray.on('right-click', updateTrayMenu);
  updateTrayMenu();
}

function localDateKey(date) {
  return CalendarCore.dateKey(date);
}

function showReminder(event, dateKey, late = false) {
  const notification = new Notification({
    title: late ? `遗漏提醒 · ${event.title}` : event.title,
    body: event.allDay
      ? `${dateKey} · 全天日程`
      : `${event.startTime || '09:00'}${event.notes ? ` · ${event.notes.slice(0, 60)}` : ''}`,
    icon: createAppIcon(),
    silent: !appData.settings.sound,
    timeoutType: 'never'
  });

  const cleanup = () => {
    activeNotifications.delete(notification);
  };
  notification.on('click', () => {
    cleanup();
    showWindow();
    mainWindow.webContents.send('reminder:open', {
      eventId: event.id,
      occurrenceDate: dateKey
    });
  });
  notification.on('close', cleanup);
  notification.on('failed', cleanup);

  if (activeNotifications.size >= 50) {
    const oldest = activeNotifications.values().next().value;
    activeNotifications.delete(oldest);
  }
  activeNotifications.add(notification);

  notification.show();
  mainWindow?.webContents.send('reminder:fired', {
    eventId: event.id,
    title: event.title,
    date: dateKey,
    time: event.startTime,
    late
  });
}

function checkReminders(includeMissed = false) {
  const now = new Date();
  let changed = false;
  const alreadySent = new Set(appData.notifications.map((item) => item.token));
  const candidates = CalendarCore.unsentReminders(appData.events, alreadySent, now, {
    maxAgeMs: includeMissed ? 24 * 60 * 60000 : 65000
  });

  for (const candidate of candidates) {
    showReminder(candidate.event, candidate.occurrenceKey, candidate.ageMs > 65000);
    appData.notifications.push({
      token: candidate.token,
      eventId: candidate.event.id,
      occurrenceDate: candidate.occurrenceKey,
      minutesBefore: candidate.minutes,
      firedAt: now.toISOString()
    });
    alreadySent.add(candidate.token);
    changed = true;
  }

  if (appData.notifications.length > 1000) {
    appData.notifications = appData.notifications.slice(-1000);
    changed = true;
  }
  if (changed) persistData();
}

function registerIpc() {
  ipcMain.handle('app:get-state', () => ({
    schemaVersion: appData.schemaVersion,
    events: appData.events,
    calendars: appData.calendars,
    settings: appData.settings,
    platform: process.platform,
    version: app.getVersion(),
    dataPath
  }));

  ipcMain.handle('events:save', (_event, events) => {
    if (!Array.isArray(events)) throw new Error('日程数据格式不正确');
    const normalizedEvents = DataModel.normalizeEvents(events);
    const existingIds = new Set(normalizedEvents.map((event) => event.id));
    appData.events = normalizedEvents;
    appData.notifications = appData.notifications.filter((notification) =>
      existingIds.has(notification.eventId)
    );
    persistData();
    checkReminders(false);
    return { ok: true };
  });

  ipcMain.handle('calendars:save', (_event, calendars) => {
    const normalized = DataModel.normalizeCalendars(calendars);
    const validIds = new Set(normalized.map((calendar) => calendar.id));
    appData.calendars = normalized;
    appData.events = appData.events.map((event) => ({
      ...event,
      calendarId: validIds.has(event.calendarId) ? event.calendarId : DataModel.DEFAULT_CALENDAR_ID
    }));
    persistData();
    return appData.calendars;
  });

  ipcMain.handle('settings:update', (_event, patch) => {
    appData.settings = { ...appData.settings, ...(patch || {}) };
    if (Object.hasOwn(patch || {}, 'startOnBoot')) {
      const loginSettings = {
        openAtLogin: Boolean(appData.settings.startOnBoot),
        path: process.execPath
      };
      if (!app.isPackaged) loginSettings.args = [app.getAppPath()];
      app.setLoginItemSettings(loginSettings);
    }
    persistData();
    applyWindowSettings();
    updateTrayMenu();
    return appData.settings;
  });

  ipcMain.handle('window:action', (_event, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    switch (action) {
      case 'hide':
        mainWindow.hide();
        break;
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'toggle-visibility':
        mainWindow.isVisible() ? mainWindow.hide() : showWindow();
        break;
      default:
        return false;
    }
    updateTrayMenu();
    return true;
  });

  ipcMain.handle('data:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出DeskCal备份',
      defaultPath: `DeskCal-backup-${localDateKey(new Date())}.json`,
      filters: [{ name: 'DeskCal备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(appData, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入DeskCal备份',
      properties: ['openFile'],
      filters: [{ name: 'DeskCal备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    let rawContent;
    let parsed;
    try {
      rawContent = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error('备份文件解析失败：不是合法的 JSON');
    }
    const validation = DataModel.validateBackup(parsed);
    if (!validation.ok) {
      throw new Error(`不是有效的 DeskCal 备份文件：${validation.reason}`);
    }

    if (dataPath && fs.existsSync(dataPath)) {
      fs.copyFileSync(dataPath, `${dataPath}.before-import`);
    }

    const incoming = mergeData(parsed);
    const imported = incoming.events.length;
    const skipped = parsed.events.length - imported;
    appData = incoming;
    persistData();
    applyWindowSettings();
    updateTrayMenu();
    return {
      canceled: false,
      summary: { imported, skipped },
      state: {
        schemaVersion: appData.schemaVersion,
        events: appData.events,
        calendars: appData.calendars,
        settings: appData.settings
      }
    };
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.deskcal.windows');
    loadData();
    registerIpc();
    createWindow();
    createTray();
    checkReminders(true);
    reminderTimer = setInterval(() => checkReminders(false), 15000);
    powerMonitor.on('resume', () => setTimeout(() => checkReminders(true), 1500));
    screen.on('display-removed', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const safeBounds = ensureVisibleBounds(mainWindow.getBounds());
      mainWindow.setBounds(safeBounds);
    });

    app.on('activate', showWindow);
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (reminderTimer) clearInterval(reminderTimer);
    flushBounds();
  });
}
