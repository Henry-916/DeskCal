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
const { DEFAULT_DATA, SCHEMA_VERSION } = DataModel;

let mainWindow = null;
let tray = null;
let appData = structuredClone(DEFAULT_DATA);
let dataPath = '';
let reminderTimer = null;
let isQuitting = false;

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
  try {
    const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    appData = mergeData(stored);
    if (
      stored.schemaVersion !== SCHEMA_VERSION ||
      JSON.stringify(stored) !== JSON.stringify(appData)
    ) {
      persistData();
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const recoveryPath = `${dataPath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(dataPath, recoveryPath);
      } catch {
        // Keep the default store if even the recovery copy cannot be created.
      }
    }
    appData = structuredClone(DEFAULT_DATA);
    persistData();
  }
}

function persistData() {
  if (!dataPath) return;
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(appData, null, 2), 'utf8');
  if (fs.existsSync(dataPath)) {
    fs.copyFileSync(dataPath, `${dataPath}.bak`);
  }
  fs.copyFileSync(tempPath, dataPath);
  fs.unlinkSync(tempPath);
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
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    appData.window = { ...mainWindow.getBounds() };
    persistData();
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
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
  notification.on('click', () => {
    showWindow();
    mainWindow.webContents.send('reminder:open', event.id);
  });
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
  const candidates = CalendarCore.remindersDue(appData.events, now, {
    maxAgeMs: includeMissed ? 24 * 60 * 60000 : 65000
  });

  for (const candidate of candidates) {
    if (alreadySent.has(candidate.token)) continue;
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
    const previousById = new Map(appData.events.map((event) => [event.id, event]));
    const changedIds = new Set();
    const normalizedEvents = DataModel.normalizeEvents(events);
    for (const event of normalizedEvents) {
      const previous = previousById.get(event.id);
      const oldSignature = previous
        ? JSON.stringify([
            previous.date,
            previous.startTime,
            previous.allDay,
            previous.recurrence,
            previous.exceptions,
            previous.reminders
          ])
        : '';
      const newSignature = JSON.stringify([
        event.date,
        event.startTime,
        event.allDay,
        event.recurrence,
        event.exceptions,
        event.reminders
      ]);
      if (oldSignature !== newSignature) changedIds.add(event.id);
      previousById.delete(event.id);
    }
    for (const deletedId of previousById.keys()) changedIds.add(deletedId);
    appData.events = normalizedEvents;
    if (changedIds.size) {
      appData.notifications = appData.notifications.filter(
        (notification) => !changedIds.has(notification.eventId)
      );
    }
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
    const incoming = mergeData(JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')));
    appData = incoming;
    persistData();
    applyWindowSettings();
    updateTrayMenu();
    return {
      canceled: false,
      state: {
        schemaVersion: appData.schemaVersion,
        events: appData.events,
        calendars: appData.calendars,
        settings: appData.settings
      }
    };
  });
}

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
});
