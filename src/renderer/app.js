if (!window.deskcal) {
  const previewStore = {
    events: [],
    calendars: [
      {
        id: 'personal',
        name: '个人',
        color: '#6750e8',
        visible: true,
        createdAt: null
      }
    ],
    settings: {
      theme: 'system',
      windowMode: 'desktop',
      backgroundOpacity: null,
      frostedGlass: true,
      clickThrough: false,
      startOnBoot: false,
      sound: true,
      showLunar: true,
      showTraditionalFestivals: true,
      showCommemorativeDays: false,
      showSolarTerms: true,
      showOfficialHolidays: true,
      showHolidayBadges: true,
      highlightWeekends: true,
      agendaCollapsed: true,
      agendaWidth: null
    }
  };
  window.deskcal = {
    getState: async () => structuredClone(previewStore),
    saveEvents: async (events) => {
      previewStore.events = structuredClone(events);
      return { ok: true };
    },
    updateSettings: async (patch) => {
      Object.assign(previewStore.settings, patch);
      return structuredClone(previewStore.settings);
    },
    setAgenda: async ({ collapsed, width }) => {
      if (typeof collapsed === 'boolean') previewStore.settings.agendaCollapsed = collapsed;
      if (Number(width) > 0) previewStore.settings.agendaWidth = Math.round(width);
      return structuredClone(previewStore.settings);
    },
    previewAgendaWidth: () => {},
    setCalendarWidth: () => {},
    windowAction: async () => true,
    setInteractive: () => {},
    exportData: async () => ({ canceled: true }),
    importData: async () => ({ canceled: true }),
    checkForUpdates: async () => {},
    downloadUpdate: async () => {},
    installUpdate: async () => {},
    openReleasePage: async () => {},
    onUpdateStatus: () => {},
    onOpenSettings: () => {},
    onSettingsChanged: () => {},
    onReminder: () => {},
    onReminderOpen: () => {}
  };
}

const { dateKey, parseDate, daysBetween, occursOn, normalizeRecurrence } = window.DeskCalCore;
const ChineseCalendar = window.DeskCalChineseCalendar;
const PlannerCore = window.DeskCalPlannerCore;

const state = {
  events: [],
  calendars: [],
  settings: {},
  selectedDate: dateKey(new Date()),
  // 上一次画日历时选中的是哪天
  shownSelectedDate: null,
  viewMode: 'month',
  filter: 'pending',
  searchQuery: '',
  editingId: null,
  editingOccurrenceDate: null,
  formColor: '',
  scopeResolver: null,
  askResolver: null,
  submittingEvent: false,
  undoSnapshot: null,
  acrylicSupported: false,
  // 鼠标点过“已完成 / 待处理”清单里的勾之后，清单保持打开，直到鼠标移开
  statKeep: null,
  themeTurn: 0,
  update: { state: 'unsupported' }
};

const weekdayShort = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekdayHeaders = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const repeatLabels = {
  none: '',
  daily: '每天重复',
  weekdays: '工作日重复',
  weekly: '每周重复',
  monthly: '每月重复',
  yearly: '每年重复'
};
const windowModeHints = {
  desktop: '嵌入桌面：始终位于其他窗口下方，按 Win+D 显示桌面时依然可见；点击托盘图标可临时调到最前。',
  floating: '像普通应用窗口一样显示，并出现在任务栏。',
  top: '始终显示在其他窗口上方。'
};
const MONTH_CELL_EVENTS = 2;
const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 4;
const LEAVE_MS = 600;
const updateActions = {
  idle: '检查更新',
  'not-available': '检查更新',
  error: '重试',
  available: '下载并安装',
  downloaded: '重启并安装'
};
// 日程栏展开时窗口向右变宽，日历的宽度不变。这几个数要和主进程里的保持一致
const AGENDA_DEFAULT_WIDTH = 270;
const AGENDA_MAX_WIDTH = 460;
const CALENDAR_MIN_WIDTH = 660;
const CALENDAR_MAX_WIDTH = 2400;
const repeatUnits = {
  daily: '天',
  weekly: '周',
  monthly: '个月',
  yearly: '年'
};
const EVENT_COLORS = ['#7a77ee', '#d9a21b', '#2f9e8f', '#e2543e', '#c2569b', '#4a8fd6'];
const PRESET_REMINDERS = [
  [0, '准时'],
  [5, '提前5分钟'],
  [10, '提前10分钟'],
  [30, '提前30分钟']
];
const MAX_REMINDER_MINUTES = 7 * 1440;
// 没存过值时按“开”处理的开关；其余的默认关
const SETTINGS_DEFAULT_ON = new Set([
  'frostedGlass',
  'sound',
  'showLunar',
  'showTraditionalFestivals',
  'showSolarTerms',
  'showOfficialHolidays',
  'showHolidayBadges',
  'highlightWeekends'
]);

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
}

function startOfWeek(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  result.setHours(12, 0, 0, 0);
  return result;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function monthDayText(key) {
  const date = parseDate(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekdayText(key) {
  return weekdayShort[parseDate(key).getDay()];
}

function activeEvents() {
  return state.events.filter((event) => !event.deletedAt);
}

function calendarById(id) {
  return state.calendars.find((calendar) => calendar.id === id);
}

// 多日历功能已经去掉。旧数据里的日历只用来给没选过颜色的日程提供默认颜色
function defaultEventColor(calendarId) {
  return calendarById(calendarId || 'personal')?.color || '#6750e8';
}

// 在表单里选过颜色的日程用自己的颜色，其余用默认颜色
function eventColor(event) {
  if (event.customColor && event.color) return event.color;
  return defaultEventColor(event.calendarId);
}

function occurrencesForDate(key) {
  const date = parseDate(key);
  return activeEvents()
    .filter((event) => occursOn(event, date))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    })
    .map((event) => ({ event, occurrenceDate: key }));
}

function eventsForDate(key) {
  return occurrencesForDate(key).map((item) => item.event);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatRecurrenceLabel(event) {
  const recurrence = normalizeRecurrence(event);
  if (recurrence.frequency === 'none') return '';
  const base = repeatLabels[recurrence.frequency] || '重复日程';
  const interval =
    recurrence.interval > 1 && repeatUnits[recurrence.frequency]
      ? `每${recurrence.interval}${repeatUnits[recurrence.frequency]}`
      : base;
  const limit = [
    recurrence.until ? `至${recurrence.until}` : '',
    recurrence.count ? `${recurrence.count}次` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return limit ? `${interval} · ${limit}` : interval;
}

function isoWeekNumber(date) {
  const thursday = addDays(startOfWeek(date), 3);
  const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4, 12)), 3);
  return Math.round((thursday - firstThursday) / (7 * 86400000)) + 1;
}

function visibleChineseLabel(info) {
  if (state.settings.showTraditionalFestivals !== false && info.traditionalFestival) {
    return { text: info.traditionalFestival, type: 'festival' };
  }
  if (info.solarFestival) return { text: info.solarFestival, type: 'festival' };
  if (
    state.settings.showOfficialHolidays !== false &&
    info.holiday?.type === 'holiday' &&
    info.holiday.isStart
  ) {
    return { text: `${info.holiday.name}假期`, type: 'festival' };
  }
  if (state.settings.showSolarTerms !== false && info.solarTerm) {
    return { text: info.solarTerm, type: 'solar-term' };
  }
  if (state.settings.showCommemorativeDays && info.commemorativeDay) {
    return { text: info.commemorativeDay, type: 'commemorative' };
  }
  if (state.settings.showLunar !== false) return { text: info.lunarText, type: 'lunar' };
  return { text: '', type: 'none' };
}

// 一天在格子里要用到的全部信息：农历或节日的那行小字、休班印章、是不是休息日
function dayPresentation(date) {
  const info = ChineseCalendar.getDayInfo(date);
  const label = visibleChineseLabel(info);
  const holiday = state.settings.showOfficialHolidays !== false ? info.holiday : null;
  return {
    info,
    holiday,
    labelText: label.text,
    labelClass: label.type === 'festival' ? 'fest' : label.type === 'lunar' || label.type === 'none' ? '' : 'term',
    seal:
      holiday && state.settings.showHolidayBadges !== false
        ? holiday.type === 'holiday'
          ? 'rest'
          : 'work'
        : '',
    isRestDay: holiday ? holiday.type === 'holiday' : info.isWeekend
  };
}

function sealHtml(kind) {
  return kind ? `<span class="seal ${kind}"><span>${kind === 'rest' ? '休' : '班'}</span></span>` : '';
}

// 毛玻璃由系统绘制；系统不支持或用户关掉时窗口是纯透明的，壁纸原样透出来
function windowMaterial() {
  return state.acrylicSupported && state.settings.frostedGlass !== false ? 'acrylic' : 'none';
}

function backgroundOpacity() {
  const value = state.settings.backgroundOpacity;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  // 用户没调过时：没有模糊就把底色放实一些，保证第一眼可读
  return windowMaterial() === 'acrylic' ? 0.3 : 0.7;
}

function applySheetOpacity(opacity) {
  document.documentElement.style.setProperty('--sheet-alpha', String(opacity));
}

// 界面实际用深色还是浅色：手动选过就用选的，否则跟系统
function resolvedMode() {
  const theme = state.settings.theme;
  if (theme === 'light' || theme === 'dark') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const root = document.documentElement;
  const mode = resolvedMode();
  root.dataset.mode = mode;
  root.dataset.windowMode = state.settings.windowMode || 'desktop';
  root.dataset.clickThrough = String(Boolean(state.settings.clickThrough));
  root.dataset.material = windowMaterial();
  $('#win').classList.toggle('we-on', state.settings.highlightWeekends !== false);
  applySheetOpacity(backgroundOpacity());

  // 日月转盘只往顺时针方向累加；第一次摆位不要动画
  const button = $('#themeButton');
  if (button.dataset.mode !== mode) {
    const first = button.dataset.mode === undefined;
    const orbit = button.firstElementChild;
    button.dataset.mode = mode;
    state.themeTurn = first ? (mode === 'dark' ? 180 : 0) : state.themeTurn + 180;
    if (first) {
      orbit.style.transition = 'none';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          orbit.style.transition = '';
        })
      );
    }
    orbit.style.transform = `rotate(${state.themeTurn}deg)`;
    button.title = mode === 'dark' ? '现在是深色，点一下换成浅色' : '现在是浅色，点一下换成深色';
    button.setAttribute('aria-label', button.title);
  }
}

let themeSweeping = false;

// 切换深浅色：整个窗口以日月转盘的圆心为轴，顺时针扫过去换色
function switchTheme() {
  const next = resolvedMode() === 'dark' ? 'light' : 'dark';
  const apply = () => updateSettings({ theme: next });
  const root = document.documentElement;
  if (
    themeSweeping ||
    !document.startViewTransition ||
    // 窗口没在显示时画面不会更新，过渡动画等不到开始
    document.visibilityState !== 'visible' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return apply();
  }
  const button = $('#themeButton').getBoundingClientRect();
  const win = $('#win').getBoundingClientRect();
  root.style.setProperty('--sx', `${Math.round(button.left + button.width / 2 - win.left)}px`);
  // 转盘的圆心在按钮中心正下方 16px
  root.style.setProperty('--sy', `${Math.round(button.top + button.height / 2 + 16 - win.top)}px`);
  root.classList.add('theme-fx');
  themeSweeping = true;
  // 窗口被遮住或隐藏时浏览器不出画面，过渡动画的回调可能迟迟不来：等一小会儿还没换就直接换
  let applied = false;
  const applyOnce = () => {
    if (applied) return undefined;
    applied = true;
    return apply();
  };
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clearTimeout(applyTimer);
    clearTimeout(doneTimer);
    applyOnce();
    themeSweeping = false;
    root.classList.remove('theme-fx');
  };
  const applyTimer = setTimeout(applyOnce, 400);
  const doneTimer = setTimeout(done, 1600);
  try {
    const transition = document.startViewTransition(applyOnce);
    // 过渡被跳过时 ready 会被拒绝，这不算错
    transition.ready.catch(() => {});
    return transition.finished.then(done, done);
  } catch {
    done();
    return undefined;
  }
}

// 按保存的设置切到月历或周历（启动和导入备份后都要做）
function applySavedView() {
  state.viewMode = state.settings.calendarView === 'week' ? 'week' : 'month';
}

function agendaOpen() {
  return state.settings.agendaCollapsed === false;
}

function agendaWidth() {
  const width = Number(state.settings.agendaWidth);
  return width > 0 ? Math.min(AGENDA_MAX_WIDTH, Math.round(width)) : AGENDA_DEFAULT_WIDTH;
}

// 日程栏最窄也要让“全部 / 待办 / 已完成 / 未来七天”排成一行（加粗的那个会宽一点，留 6px 余量）
function agendaMinWidth() {
  const buttons = [...$('#agendaFilters').children];
  const total = buttons.reduce((sum, button) => sum + button.getBoundingClientRect().width, 0);
  return total ? Math.ceil(total - (buttons.length - 1) + 33 + 6) : AGENDA_DEFAULT_WIDTH;
}

function clampAgendaWidth(width) {
  return Math.round(Math.max(agendaMinWidth(), Math.min(AGENDA_MAX_WIDTH, width)));
}

function applyAgendaLayout() {
  const app = $('#app');
  app.classList.toggle('no-side', !agendaOpen());
  app.style.setProperty('--agenda-width', `${agendaWidth()}px`);
  $('#edgeGrip').title = agendaOpen()
    ? '拖动调日程栏宽度，双击收起'
    : '拖动调日历宽度，双击展开日程栏';
}

// 窗口变宽变窄是主进程做的，比页面里的重排晚一点。这期间把日历那一栏的宽度钉住，
// 否则日历会先被挤窄（或先撑满）再弹回去，看起来闪一下
let layoutLocks = 0;

function lockCalendarWidth() {
  if (layoutLocks === 0) {
    const width = $('.cal').getBoundingClientRect().width;
    if (width) $('#app').style.gridTemplateColumns = `${width}px var(--agenda-width, ${AGENDA_DEFAULT_WIDTH}px)`;
  }
  layoutLocks += 1;
}

function unlockCalendarWidth() {
  layoutLocks = Math.max(0, layoutLocks - 1);
  if (layoutLocks === 0) $('#app').style.gridTemplateColumns = '';
}

// 窗口里除了日历和日程栏之外的宽度（没有毛玻璃时四周有一圈留白）
function windowChromeWidth() {
  return window.innerWidth - $('#app').getBoundingClientRect().width;
}

// 等页面的宽度真的变成主进程设好的窗口宽度；等不到（比如窗口被系统限制住了）就不等了
function waitForWindowWidth(expected) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const check = () => {
      if (Math.abs(window.innerWidth - expected) <= 2 || performance.now() - startedAt > 600) {
        requestAnimationFrame(resolve);
      } else {
        setTimeout(check, 16);
      }
    };
    check();
  });
}

// 展开或收起日程栏。页面先改，窗口随后跟上；连着点两下也按顺序各算一次
async function setAgenda(collapsed, width) {
  if (collapsed === !agendaOpen() && !width) return;
  lockCalendarWidth();
  const expected =
    windowChromeWidth() + $('.cal').getBoundingClientRect().width + (collapsed ? 0 : width || agendaWidth());
  state.settings = { ...state.settings, agendaCollapsed: collapsed, ...(width ? { agendaWidth: width } : {}) };
  render();
  try {
    const saved = await window.deskcal.setAgenda({ collapsed, width: width || agendaWidth() });
    await waitForWindowWidth(expected);
    // 这期间又点了一次的话，以最后一次点的为准
    if (layoutLocks === 1) state.settings = saved;
  } finally {
    unlockCalendarWidth();
    if (layoutLocks === 0) render();
  }
}

function toggleAgenda() {
  return setAgenda(agendaOpen());
}

function bindEdgeGrip() {
  const app = $('#app');
  const grip = $('#edgeGrip');
  let drag = null;

  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    grip.setPointerCapture(event.pointerId);
    drag = {
      startX: event.clientX,
      open: agendaOpen(),
      start: agendaOpen() ? agendaWidth() : $('.cal').getBoundingClientRect().width,
      width: 0,
      moved: false
    };
  });
  grip.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      app.classList.add('dragging');
      if (drag.open) lockCalendarWidth();
    }
    if (drag.open) {
      drag.width = clampAgendaWidth(drag.start + delta);
      app.style.setProperty('--agenda-width', `${drag.width}px`);
      window.deskcal.previewAgendaWidth(drag.width);
    } else {
      drag.width = Math.round(
        Math.max(CALENDAR_MIN_WIDTH, Math.min(CALENDAR_MAX_WIDTH, drag.start + delta))
      );
      window.deskcal.setCalendarWidth(drag.width);
    }
  });
  const finishDrag = async () => {
    if (!drag) return;
    const { open, moved, width } = drag;
    drag = null;
    if (!moved) return;
    app.classList.remove('dragging');
    if (!open) return;
    try {
      const expected = windowChromeWidth() + $('.cal').getBoundingClientRect().width + width;
      state.settings = await window.deskcal.setAgenda({ collapsed: false, width });
      await waitForWindowWidth(expected);
    } finally {
      unlockCalendarWidth();
      render();
    }
  };
  grip.addEventListener('pointerup', finishDrag);
  grip.addEventListener('pointercancel', finishDrag);
  // 双击右边缘：收起 / 展开日程栏。按“每逢第二下”算，在同一个位置连着双击可以一直来回切
  grip.addEventListener('click', (event) => {
    if (event.detail % 2 === 0) toggleAgenda();
  });
  $('#tearLine').addEventListener('click', (event) => {
    if (event.detail % 2 === 0) setAgenda(true);
  });
  grip.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[event.key];
    if (!step) return;
    event.preventDefault();
    if (agendaOpen()) setAgenda(false, clampAgendaWidth(agendaWidth() + step));
    else {
      window.deskcal.setCalendarWidth(
        Math.max(CALENDAR_MIN_WIDTH, Math.round($('.cal').getBoundingClientRect().width + step))
      );
    }
  });
}

function ticketHtml(event, key) {
  return `
    <button
      type="button"
      class="ticket ${event.allDay ? 'all' : ''} ${event.completed ? 'done' : ''}"
      style="--c:${escapeHtml(eventColor(event))}"
      draggable="true"
      data-id="${escapeHtml(event.id)}"
      data-occurrence-date="${key}"
      title="${escapeHtml(event.title)}（可以拖到别的日期）"
    >
      <span class="t"><span>${escapeHtml(event.allDay ? '全天' : event.startTime || '--:--')}</span></span>
      <span class="ti">${escapeHtml(event.title)}</span>
    </button>
  `;
}

function dayClasses(key, presentation) {
  return [
    presentation.info.isWeekend ? 'weekend' : '',
    presentation.isRestDay ? 'rest-day' : '',
    key === dateKey(new Date()) ? 'today' : '',
    key === state.selectedDate ? 'sel' : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function dayAriaLabel(date, presentation, count) {
  const { info, holiday } = presentation;
  return `${date.getMonth() + 1}月${date.getDate()}日，${
    state.settings.showLunar !== false ? info.fullLunarText : ''
  }${holiday ? `，${holiday.name}${holiday.type === 'holiday' ? '休息' : '调休上班'}` : ''}，${count}项日程`;
}

function renderWeek(days) {
  const columns = days
    .map((date) => {
      const key = dateKey(date);
      const presentation = dayPresentation(date);
      const events = eventsForDate(key);
      return `
        <div
          class="col day-cell ${dayClasses(key, presentation)}"
          data-date="${key}"
          role="gridcell"
          aria-label="${escapeHtml(dayAriaLabel(date, presentation, events.length))}"
        >
          <div class="head">
            <span class="wd">${weekdayShort[date.getDay()]}</span>
            <span class="num">${date.getDate()}</span>
            <span class="lunar ${presentation.labelClass}">${escapeHtml(presentation.labelText) || '&nbsp;'}</span>
            ${sealHtml(presentation.seal)}
          </div>
          <div class="evs">
            ${events.map((event) => ticketHtml(event, key)).join('')}
            <button type="button" class="ghost-add" data-new="${key}" aria-label="在${monthDayText(key)}新建日程">＋ 新日程</button>
          </div>
        </div>
      `;
    })
    .join('');
  return `<div class="scroller"><div class="week" role="grid">${columns}</div></div>`;
}

function renderMonth(days, month) {
  const headers = weekdayHeaders.map((day) => `<div class="mhead">${day}</div>`).join('');
  const cells = days
    .map((date) => {
      const key = dateKey(date);
      const presentation = dayPresentation(date);
      const events = eventsForDate(key);
      const hidden = events.length - MONTH_CELL_EVENTS;
      return `
        <div
          class="cell day-cell ${date.getMonth() !== month ? 'out' : ''} ${dayClasses(key, presentation)}"
          data-date="${key}"
          role="gridcell"
          aria-label="${escapeHtml(dayAriaLabel(date, presentation, events.length))}"
        >
          <div class="line">
            <span class="num">${date.getDate()}</span>
            <span class="lunar ${presentation.labelClass}">${escapeHtml(presentation.labelText)}</span>
            ${sealHtml(presentation.seal)}
          </div>
          ${events
            .slice(0, MONTH_CELL_EVENTS)
            .map(
              (event) => `
                <button
                  type="button"
                  class="mini ${event.completed ? 'done' : ''}"
                  style="--c:${escapeHtml(eventColor(event))}"
                  draggable="true"
                  data-id="${escapeHtml(event.id)}"
                  data-occurrence-date="${key}"
                  title="${escapeHtml(event.title)}"
                >${escapeHtml(event.title)}</button>
              `
            )
            .join('')}
          ${hidden > 0 ? `<span class="more">还有 ${hidden} 项</span>` : ''}
          <button type="button" class="cell-add" data-new="${key}" aria-label="在${monthDayText(key)}新建日程">＋</button>
        </div>
      `;
    })
    .join('');
  return `<div class="mgrid">${headers}</div><div class="mgrid mbody" role="grid">${cells}</div>`;
}

// 底下那行统计。数的是这段时间里每一天的安排（重复日程每出现一次算一项）
function renderSummary(days, isWeekView) {
  const lists = { done: [], todo: [] };
  for (const date of days) {
    for (const record of occurrencesForDate(dateKey(date))) {
      lists[record.event.completed ? 'done' : 'todo'].push(record);
    }
  }
  const popover = (records, emptyText) => {
    const items = records
      .map(({ event, occurrenceDate }) => {
        const date = parseDate(occurrenceDate);
        const label = event.completed ? '改回待处理' : '标记完成';
        return `
          <span
            class="sitem"
            style="--c:${escapeHtml(eventColor(event))}"
            data-id="${escapeHtml(event.id)}"
            data-occurrence-date="${occurrenceDate}"
          >
            <button type="button" class="go">
              <i>${date.getMonth() + 1}/${date.getDate()} ${escapeHtml(event.allDay ? '全天' : event.startTime || '')}</i>
              <span>${escapeHtml(event.title)}</span>
            </button>
            <button type="button" class="chk" data-complete aria-label="${label}" title="${label}">${
              event.completed ? '✓' : ''
            }</button>
          </span>
        `;
      })
      .join('');
    return `<span class="statpop"><span class="statlist">${items || `<em>${emptyText}</em>`}</span></span>`;
  };
  const stat = (name, text, records, emptyText) => `
    <span class="stat ${state.statKeep === name ? 'keep' : ''}" data-stat="${name}" tabindex="0">
      ${text} <b>${records.length}</b>${popover(records, emptyText)}
    </span>
  `;
  const keptScroll = $('#summary .stat.keep .statlist')?.scrollTop || 0;
  $('#summary').innerHTML = `
    ${isWeekView ? '本周' : '本月'} <b>${lists.done.length + lists.todo.length}</b> 项日程 ·
    ${stat('done', '已完成', lists.done, '还没有完成的日程')} ·
    ${stat('todo', '待处理', lists.todo, '没有待处理的日程')}
  `;
  const kept = $('#summary .stat.keep .statlist');
  if (kept) kept.scrollTop = keptScroll;
}

function renderCalendar() {
  const isWeekView = state.viewMode === 'week';
  const selected = parseDate(state.selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  $('#monthTitle').textContent = month + 1;

  let days;
  let rangeDays;
  if (isWeekView) {
    const start = startOfWeek(selected);
    days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    rangeDays = days;
    const end = days[6];
    const endMonth = end.getMonth() === start.getMonth() ? '' : `${end.getMonth() + 1}月`;
    const parts = [];
    if (year !== new Date().getFullYear()) parts.push(year);
    parts.push(`${start.getDate()}日 – ${endMonth}${end.getDate()}日`, `第 ${isoWeekNumber(start)} 周`);
    $('#todayLabel').textContent = parts.join(' · ');
    $('#calendarGrid').innerHTML = renderWeek(days);
  } else {
    const first = new Date(year, month, 1, 12);
    const start = startOfWeek(first);
    const last = new Date(year, month + 1, 0, 12);
    const count = Math.ceil((daysBetween(start, last) + 1) / 7) * 7;
    days = Array.from({ length: count }, (_, index) => addDays(start, index));
    rangeDays = days.filter((date) => date.getMonth() === month);
    const ganzhi = /农历(\S+年)/.exec(ChineseCalendar.getDayInfo(selected).fullLunarText)?.[1];
    $('#todayLabel').textContent = [
      `${year} 年`,
      state.settings.showLunar !== false && ganzhi ? ganzhi : ''
    ]
      .filter(Boolean)
      .join(' · ');
    $('#calendarGrid').innerHTML = renderMonth(days, month);
  }
  // 换了选中的日子才播荧光笔的书写动画；勾选完成、切换视图这类重画不重播
  if (state.selectedDate !== state.shownSelectedDate) {
    $('#calendarGrid .sel')?.classList.add('fresh');
    state.shownSelectedDate = state.selectedDate;
  }
  $('#calendarGrid').classList.toggle('week-view', isWeekView);
  $all('#calendarViewControl button').forEach((button) => {
    button.classList.toggle('on', button.dataset.view === state.viewMode);
  });
  renderSummary(rangeDays, isWeekView);
}

function selectedDayMeta(selected, count) {
  const { info, holiday } = dayPresentation(selected);
  const label = visibleChineseLabel(info);
  const tags = [];
  if (holiday) {
    tags.push(
      holiday.type === 'workday'
        ? `${holiday.name}调休上班`
        : `${holiday.name}假期 第${holiday.index}/${holiday.total}天`
    );
  }
  if (label.type !== 'lunar' && label.type !== 'none' && label.text !== `${holiday?.name}假期`) {
    tags.push(label.text);
  }
  const lunar =
    state.settings.showLunar !== false
      ? `<span id="selectedLunarMeta">农历${escapeHtml(info.lunarMonthText + info.lunarDayText)}</span><br />`
      : '';
  return `${lunar}${count} 项安排${tags.length ? ` · ${escapeHtml([...new Set(tags)].join(' · '))}` : ''}`;
}

function agendaRowHtml(record, showDate) {
  const { event, occurrenceDate } = record;
  const hasConflict =
    !event.allDay &&
    !event.completed &&
    PlannerCore.conflictsForCandidate(event, activeEvents(), occurrenceDate, event.id).length > 0;
  const timeText = escapeHtml(event.allDay ? '全天' : event.startTime || '--:--');
  const time = showDate
    ? `<b class="cn">${monthDayText(occurrenceDate)}<i>${timeText}</i></b>`
    : event.allDay
      ? '<b class="cn">全天</b>'
      : `<b>${timeText}<i>${escapeHtml(event.endTime || '')}</i></b>`;
  const meta = [event.location, formatRecurrenceLabel(event), event.notes].filter(Boolean).join(' · ');
  return `
    <div
      class="row agenda-item ${event.completed ? 'done' : ''}"
      style="--c:${escapeHtml(eventColor(event))}"
      data-id="${escapeHtml(event.id)}"
      data-occurrence-date="${escapeHtml(occurrenceDate)}"
    >
      ${time}
      <div>
        <strong><span>${escapeHtml(event.title)}</span></strong>
        ${hasConflict ? '<small class="warn">时间冲突</small>' : ''}
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
      </div>
      <button type="button" class="chk complete-button" data-complete aria-label="${
        event.completed ? '标记为未完成' : '标记完成'
      }">${event.completed ? '✓' : ''}</button>
    </div>
  `;
}

// 选中日期之后一周内的安排，接在当天列表后面
function upcomingHtml() {
  const selected = parseDate(state.selectedDate);
  const records = [];
  for (let offset = 1; offset <= UPCOMING_DAYS && records.length < UPCOMING_LIMIT; offset += 1) {
    for (const record of occurrencesForDate(dateKey(addDays(selected, offset)))) {
      if (state.filter === 'all' || !record.event.completed) records.push(record);
    }
  }
  if (!records.length) return '';
  const rows = records
    .slice(0, UPCOMING_LIMIT)
    .map(
      ({ event, occurrenceDate }) => `
        <div
          class="row upcoming-item"
          style="--c:${escapeHtml(eventColor(event))}"
          data-id="${escapeHtml(event.id)}"
          data-occurrence-date="${occurrenceDate}"
        >
          <b class="cn">${weekdayText(occurrenceDate)}<i>${escapeHtml(
            event.allDay ? '全天' : event.startTime || ''
          )}</i></b>
          <div><strong><span>${escapeHtml(event.title)}</span></strong></div>
          <span></span>
        </div>
      `
    )
    .join('');
  return `<div class="label">接下来</div>${rows}`;
}

function renderAgenda() {
  const selected = parseDate(state.selectedDate);
  const selectedRecords = occurrencesForDate(state.selectedDate);
  const query = state.searchQuery.trim().toLowerCase();
  let records;
  let showDate = false;
  let emptyTitle = '这一天没有安排';
  let emptyDescription = '鼠标移到某一天会出现“＋”，也可以点右上角的加号。';

  if (query) {
    records = activeEvents()
      .filter((event) =>
        [event.title, event.notes, event.location].join(' ').toLowerCase().includes(query)
      )
      .map((event) => ({ event, occurrenceDate: event.date }))
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
    showDate = true;
    $('#selectedDateTitle').textContent = '搜索结果';
    $('#selectedDateMeta').textContent = `${records.length} 项匹配“${state.searchQuery.trim()}”`;
    emptyTitle = '没有找到相关日程';
    emptyDescription = '可以试试搜索标题、地点或备注。';
  } else if (state.filter === 'upcoming') {
    const today = parseDate(dateKey(new Date()));
    records = [];
    for (let offset = 0; offset < UPCOMING_DAYS; offset += 1) {
      records.push(...occurrencesForDate(dateKey(addDays(today, offset))));
    }
    showDate = true;
    $('#selectedDateTitle').textContent = '未来七天';
    $('#selectedDateMeta').textContent = `${monthDayText(dateKey(today))} – ${monthDayText(
      dateKey(addDays(today, UPCOMING_DAYS - 1))
    )} · ${records.length} 项安排`;
    emptyTitle = '未来七天没有安排';
    emptyDescription = '给自己留白，也可以添加下一件事。';
  } else {
    records = selectedRecords.filter(({ event }) => {
      if (state.filter === 'completed') return event.completed;
      if (state.filter === 'pending') return !event.completed;
      return true;
    });
    $('#selectedDateTitle').textContent = `${monthDayText(state.selectedDate)} ${weekdayText(
      state.selectedDate
    )}`;
    $('#selectedDateMeta').innerHTML = selectedDayMeta(selected, selectedRecords.length);
    if (state.filter !== 'all' && selectedRecords.length) {
      emptyTitle = '没有符合条件的日程';
      emptyDescription = '换一个筛选看看。';
    }
  }

  const upcoming =
    !query && (state.filter === 'all' || state.filter === 'pending') ? upcomingHtml() : '';
  $('#agendaList').innerHTML =
    (records.length
      ? records.map((record) => agendaRowHtml(record, showDate)).join('')
      : `
        <div class="empty empty-state">
          <b>${escapeHtml(emptyTitle)}</b>
          <span>${escapeHtml(emptyDescription)}</span>
        </div>
      `) + upcoming;
  $all('#agendaFilters button').forEach((button) => {
    button.classList.toggle('on', button.dataset.filter === state.filter);
  });
}

function settingEnabled(key) {
  return SETTINGS_DEFAULT_ON.has(key) ? state.settings[key] !== false : Boolean(state.settings[key]);
}

function renderSettings() {
  $all('#windowModeControl button').forEach((button) => {
    button.classList.toggle('on', button.dataset.mode === state.settings.windowMode);
  });
  $('#windowModeHint').textContent = windowModeHints[state.settings.windowMode] || '';
  $('#minimizeButton').classList.toggle('hidden', state.settings.windowMode === 'desktop');
  $('#frostedGlassRow').classList.toggle('hidden', !state.acrylicSupported);
  const opacity = Math.round(backgroundOpacity() * 100);
  $('#opacityRange').value = opacity;
  $('#opacityValue').textContent = `${opacity}%`;
  $all('[data-setting]').forEach((button) => {
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(settingEnabled(button.dataset.setting)));
    if (!button.children.length) button.innerHTML = '<span>关</span><span>开</span>';
  });
}

function updateStatusText(update) {
  const current = update.currentVersion ? `当前版本 ${update.currentVersion}` : '当前为开发版本';
  switch (update.state) {
    case 'checking':
      return `${current} · 正在检查更新…`;
    case 'not-available':
      return `${current} · 已是最新版本`;
    case 'available':
      return `${current} · 发现新版本 ${update.version}`;
    case 'downloading':
      return `正在下载 ${update.version}… ${update.percent || 0}%`;
    case 'downloaded':
      return `${update.version} 已下载。安装时 DeskCal 会关闭并打开安装程序`;
    case 'error':
      return `${current} · ${update.message}`;
    case 'unsupported':
      return `${current} · 开发模式下不检查更新`;
    default:
      return current;
  }
}

function renderUpdate() {
  const update = state.update;
  const action = updateActions[update.state];
  $('#updateStatus').textContent = updateStatusText(update);
  $('#updateActionButton').textContent =
    action || { checking: '检查中…', downloading: '下载中…' }[update.state] || '检查更新';
  $('#updateActionButton').disabled = !action;
  $('#updateProgress').classList.toggle('hidden', update.state !== 'downloading');
  $('#updateProgress').value = update.percent || 0;
  $('#settingsButton').classList.toggle(
    'has-update',
    update.state === 'available' || update.state === 'downloaded'
  );
}

function runUpdateAction() {
  const { state: step, version } = state.update;
  // 下载失败后重试的是下载，检查失败后重试的是检查
  if (step === 'available' || (step === 'error' && version)) return window.deskcal.downloadUpdate();
  if (step === 'downloaded') return window.deskcal.installUpdate();
  return window.deskcal.checkForUpdates();
}

function render() {
  applyTheme();
  applyAgendaLayout();
  renderCalendar();
  renderAgenda();
  renderSettings();
  renderUpdate();
}

// 用页面内的对话框代替系统的 confirm / prompt：系统对话框关闭后页面会丢失输入焦点，
// 之后下拉框弹不出来、输入框打不了字。
function askConfirm(message, { confirmLabel = '确定', danger = false } = {}) {
  $('#askMessage').textContent = message;
  $('#askConfirmButton').textContent = confirmLabel;
  $('#askConfirmButton').className = `btn big ${danger ? 'danger' : 'primary'}`;
  $('#askDialog').showModal();
  $('#askConfirmButton').focus();
  return new Promise((resolve) => {
    state.askResolver = resolve;
  });
}

function settleAsk(confirmed) {
  const resolve = state.askResolver;
  if (!resolve) return;
  state.askResolver = null;
  if ($('#askDialog').open) $('#askDialog').close();
  resolve(confirmed);
}

function chooseRecurrenceScope(title, message) {
  $('#scopeDialogTitle').textContent = title;
  $('#scopeDialogMessage').textContent = message;
  $('#recurrenceScopeDialog').showModal();
  return new Promise((resolve) => {
    state.scopeResolver = resolve;
  });
}

function rememberUndo(label) {
  state.undoSnapshot = {
    label,
    events: structuredClone(state.events)
  };
}

async function undoLastChange() {
  if (!state.undoSnapshot) return;
  const snapshot = state.undoSnapshot;
  state.undoSnapshot = null;
  state.events = snapshot.events;
  await window.deskcal.saveEvents(state.events);
  render();
  showToast(`已撤销${snapshot.label}`);
}

function applyScopedEventChange(event, occurrenceDate, changes, scope) {
  const result = PlannerCore.applyOccurrenceChange(
    event,
    occurrenceDate,
    changes,
    scope,
    () => crypto.randomUUID()
  );
  const index = state.events.findIndex((item) => item.id === event.id);
  state.events[index] = result.original;
  if (result.detached) state.events.push(result.detached);
}

async function moveOccurrence(eventId, occurrenceDate, targetDate) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event || occurrenceDate === targetDate) return;
  const recurrence = normalizeRecurrence(event);
  let scope = 'series';
  if (recurrence.frequency !== 'none') {
    scope = await chooseRecurrenceScope('移动重复日程', `“${event.title}”要移动哪一部分？`);
    if (scope === 'cancel') return;
  }

  const changes = {
    date:
      recurrence.frequency !== 'none' && scope === 'series'
        ? dateKey(
            addDays(
              parseDate(event.date),
              daysBetween(parseDate(occurrenceDate), parseDate(targetDate))
            )
          )
        : targetDate
  };
  const conflicts = PlannerCore.conflictsForCandidate(
    { ...event, ...changes },
    activeEvents(),
    targetDate,
    event.id
  );
  if (
    conflicts.length &&
    !(await askConfirm(`该时间与“${conflicts[0].title}”冲突，仍然继续移动吗？`))
  ) {
    return;
  }

  rememberUndo('日程移动');
  applyScopedEventChange(event, occurrenceDate, changes, scope);
  state.selectedDate = targetDate;
  await saveEvents(`已移到 ${monthDayText(targetDate)}`, {
    label: '撤销',
    handler: undoLastChange
  });
}

// 勾选或取消勾选一条日程。重复日程只完成当次；搜索结果里看不出是哪一次，交给表单去处理
async function toggleComplete(eventId, occurrenceDate) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  const isRecurring = normalizeRecurrence(event).frequency !== 'none';
  if (isRecurring && !event.completed) {
    if (state.searchQuery.trim()) {
      openEventDialog(event.id, occurrenceDate);
      return;
    }
    rememberUndo('完成日程');
    applyScopedEventChange(event, occurrenceDate, { completed: true }, 'occurrence');
    await saveEvents('已标记为完成', { label: '撤销', handler: undoLastChange });
    return;
  }
  event.completed = !event.completed;
  event.updatedAt = new Date().toISOString();
  await saveEvents(event.completed ? '已标记为完成' : '已恢复为待办');
}

function formatReminderLabel(minutes) {
  if (minutes === 0) return '准时';
  if (minutes % 1440 === 0) return `提前${minutes / 1440}天`;
  if (minutes % 60 === 0) return `提前${minutes / 60}小时`;
  return `提前${minutes}分钟`;
}

function isPresetReminder(minutes) {
  return PRESET_REMINDERS.some(([value]) => value === minutes);
}

// 提醒时间页里的清单：四个预设在前，自定义的排在后面
function setReminderOptions(reminders = []) {
  const values = [
    ...new Set(reminders.map(Number).filter((n) => Number.isFinite(n) && n >= 0))
  ].sort((a, b) => a - b);
  const container = $('#eventReminderOptions');
  const scrollTop = container.scrollTop;
  container.innerHTML =
    PRESET_REMINDERS.map(
      ([value, text]) =>
        `<label><input type="checkbox" value="${value}" ${
          values.includes(value) ? 'checked' : ''
        } />${text}</label>`
    ).join('') +
    values
      .filter((value) => !isPresetReminder(value))
      .map(
        (value) =>
          `<label data-custom-reminder="true" title="点一下取消"><input type="checkbox" value="${value}" checked />${escapeHtml(
            formatReminderLabel(value)
          )}<span class="rm">×</span></label>`
      )
      .join('');
  container.scrollTop = scrollTop;
  syncReminderLine();
}

function pickedReminders() {
  return $all('#eventReminderOptions input:checked')
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
}

// 表单里那一行下拉框：只选了一个预设时直接显示它，否则多一项概括当前选择
function syncReminderLine() {
  const picked = pickedReminders();
  const single = picked.length === 1 && isPresetReminder(picked[0]);
  const on = $('#eventReminderOn').checked;
  const allDay = $('#eventAllDay').checked;
  // 全天日程没有开始时间，只选当天几点提醒，不再选提前多久
  $('#eventReminderLine').classList.toggle('hidden', !on || allDay);
  $('#eventAllDayReminderLine').classList.toggle('hidden', !on || !allDay);
  $('#eventReminderSelect').innerHTML =
    PRESET_REMINDERS.map(([value, text]) => `<option value="${value}">${text}</option>`).join('') +
    (single
      ? ''
      : `<option value="current">${escapeHtml(picked.map(formatReminderLabel).join('、'))}</option>`) +
    '<option value="more">多个或自定义…</option>';
  $('#eventReminderSelect').value = single ? String(picked[0]) : 'current';
}

function addCustomReminder() {
  const amount = Number($('#customReminderAmount').value);
  const minutes = amount * Number($('#customReminderUnit').value);
  if (!Number.isInteger(amount) || amount < 1) {
    showToast('请填写提前多久提醒', '自定义提醒');
    return;
  }
  if (minutes > MAX_REMINDER_MINUTES) {
    showToast('最多提前 7 天提醒', '自定义提醒');
    return;
  }
  setReminderOptions([...pickedReminders(), minutes]);
  $(`#eventReminderOptions input[value="${minutes}"]`)
    ?.closest('label')
    .scrollIntoView({ block: 'nearest' });
  $('#customReminderAmount').value = '';
}

function setEventColor(color) {
  state.formColor = color;
  const preset = EVENT_COLORS.includes(color);
  $('#eventForm').style.setProperty('--c', color);
  $('#eventColors').innerHTML =
    EVENT_COLORS.map(
      (value) =>
        `<button type="button" class="sw-c ${value === color ? 'on' : ''}" style="--c:${value}" data-color="${value}" aria-label="颜色 ${value}"></button>`
    ).join('') +
    `<label class="sw-c pick ${preset ? '' : 'on'}" style="--c:${
      preset ? 'transparent' : escapeHtml(color)
    }" title="自定义颜色"><input type="color" id="eventColor" value="${
      /^#[0-9a-f]{6}$/i.test(color) ? color : EVENT_COLORS[0]
    }" aria-label="自定义颜色" /></label>` +
    `<output class="hex" id="eventColorText">${preset ? '' : escapeHtml(color.toUpperCase())}</output>`;
}

function resetEventForm(date = state.selectedDate) {
  $('#eventForm').reset();
  $('#eventId').value = '';
  $('#eventDate').value = date;
  $('#eventStartTime').value = '09:00';
  $('#eventEndTime').value = '10:00';
  $('#eventAllDayReminderTime').value = '09:00';
  $('#eventReminderOn').checked = true;
  setReminderOptions([0]);
  $('#customReminderAmount').value = '';
  $('#eventRepeat').value = 'none';
  $('#eventRepeatInterval').value = '1';
  $('#eventRepeatUntil').value = '';
  $('#eventRepeatCount').value = '';
  $('#eventEditScope').value = 'occurrence';
  $('#eventEditScopeField').classList.add('hidden');
  setEventColor(EVENT_COLORS[0]);
  $('#eventLocation').value = '';
  $('#deleteEventButton').classList.add('hidden');
  $('#eventConflictWarning').classList.add('hidden');
  $('#eventConflictWarning').textContent = '';
  toggleTimeFields();
  toggleRecurrenceFields();
}

function openEventDialog(eventId = null, date = state.selectedDate) {
  state.editingId = eventId;
  state.editingOccurrenceDate = date;
  resetEventForm(date);
  if (eventId) {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    $('#eventDialogTitle').textContent = '编辑日程';
    $('#eventId').value = event.id;
    $('#eventTitle').value = event.title;
    $('#eventDate').value =
      normalizeRecurrence(event).frequency !== 'none' && date ? date : event.date;
    $('#eventAllDay').checked = Boolean(event.allDay);
    $('#eventStartTime').value = event.startTime || '09:00';
    $('#eventEndTime').value = event.endTime || '10:00';
    $('#eventAllDayReminderTime').value = event.allDayReminderTime || '09:00';
    const reminders = event.reminders || [];
    $('#eventReminderOn').checked = reminders.length > 0;
    setReminderOptions(reminders.length ? reminders : [0]);
    const recurrence = normalizeRecurrence(event);
    $('#eventRepeat').value = recurrence.frequency;
    $('#eventRepeatInterval').value = String(recurrence.interval);
    $('#eventRepeatUntil').value = recurrence.until || '';
    $('#eventRepeatCount').value = recurrence.count ? String(recurrence.count) : '';
    setEventColor(eventColor(event));
    $('#eventLocation').value = event.location || '';
    $('#eventNotes').value = event.notes || '';
    $('#deleteEventButton').classList.remove('hidden');
    if (recurrence.frequency !== 'none' && date && occursOn(event, parseDate(date))) {
      $('#eventEditScopeField').classList.remove('hidden');
    }
  } else {
    $('#eventDialogTitle').textContent = '添加新日程';
  }
  toggleTimeFields();
  toggleRecurrenceFields();
  previewEventConflict();
  $('#eventDialog').showModal();
  requestAnimationFrame(() => $('#eventTitle').focus());
}

function toggleTimeFields() {
  const allDay = $('#eventAllDay').checked;
  $all('.time-field').forEach((field) => field.classList.toggle('hidden', allDay));
  $all('.all-day-time-field').forEach((field) => field.classList.toggle('hidden', !allDay));
  $('#eventStartTime').required = !allDay;
  $('#eventEndTime').required = !allDay;
  syncReminderLine();
}

function toggleRecurrenceFields() {
  const frequency = $('#eventRepeat').value;
  const repeats = frequency !== 'none';
  const supportsInterval = repeats && frequency !== 'weekdays';
  $('#repeatRuleRow').classList.toggle('hidden', !repeats);
  $('#repeatIntervalField').classList.toggle('hidden', !supportsInterval);
  $('#repeatUntilField').classList.toggle('hidden', !repeats);
  $('#repeatIntervalUnit').textContent = repeatUnits[frequency] || '天';
  $('#eventRepeatInterval').disabled = !supportsInterval;
  $('#eventRepeatUntil').disabled = !repeats;
  $('#eventRepeatCount').disabled = !repeats;
}

function previewEventConflict() {
  const warning = $('#eventConflictWarning');
  if ($('#eventAllDay').checked || !$('#eventDate').value) {
    warning.classList.add('hidden');
    return;
  }
  const candidate = {
    id: $('#eventId').value,
    date: $('#eventDate').value,
    allDay: false,
    startTime: $('#eventStartTime').value,
    endTime: $('#eventEndTime').value
  };
  const conflicts = PlannerCore.conflictsForCandidate(
    candidate,
    activeEvents(),
    candidate.date,
    candidate.id || null
  );
  warning.classList.toggle('hidden', !conflicts.length);
  warning.textContent = conflicts.length
    ? `这个时间和“${conflicts.map((item) => item.title).join('”“')}”冲突，仍然可以保存。`
    : '';
}

async function saveEvents(message = '日程已保存', action = null) {
  if (action?.handler !== undoLastChange) {
    state.undoSnapshot = null;
  }
  await window.deskcal.saveEvents(state.events);
  render();
  showToast(message, 'DeskCal', action);
}

async function submitEventForm(event) {
  event.preventDefault();
  // 保存还没返回时再次提交，会把同一条日程新增多次
  if (state.submittingEvent) return;
  state.submittingEvent = true;
  try {
    await saveEventForm();
  } finally {
    state.submittingEvent = false;
  }
}

async function saveEventForm() {
  const existing = state.events.find((item) => item.id === $('#eventId').value);
  const frequency = $('#eventRepeat').value;
  const until = $('#eventRepeatUntil').value || null;
  const count = Number($('#eventRepeatCount').value) || null;
  const value = {
    id: existing?.id || crypto.randomUUID(),
    title: $('#eventTitle').value.trim(),
    date: $('#eventDate').value,
    allDay: $('#eventAllDay').checked,
    startTime: $('#eventAllDay').checked ? '' : $('#eventStartTime').value,
    endTime: $('#eventAllDay').checked ? '' : $('#eventEndTime').value,
    allDayReminderTime: $('#eventAllDayReminderTime').value || '09:00',
    // 全天日程就在选的那个时刻提醒，不带提前量
    reminders: !$('#eventReminderOn').checked ? [] : $('#eventAllDay').checked ? [0] : pickedReminders(),
    recurrence: {
      frequency,
      interval: frequency === 'weekdays' ? 1 : Number($('#eventRepeatInterval').value) || 1,
      until,
      count
    },
    repeat: frequency,
    exceptions: existing?.exceptions || [],
    calendarId: existing?.calendarId || 'personal',
    color: state.formColor,
    customColor: true,
    location: $('#eventLocation').value.trim(),
    notes: $('#eventNotes').value.trim(),
    completed: existing?.completed || false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!value.title) return;
  if (!value.allDay && value.endTime <= value.startTime) {
    showToast('结束时间必须晚于开始时间', '请调整日程时间');
    return;
  }
  if (value.recurrence.until && value.recurrence.until < value.date) {
    showToast('重复截止日期不能早于开始日期', '请调整重复规则');
    return;
  }
  const conflicts = PlannerCore.conflictsForCandidate(
    value,
    activeEvents(),
    value.date,
    existing?.id || null
  );
  if (
    conflicts.length &&
    !(await askConfirm(`该时间与“${conflicts[0].title}”冲突，仍然保存吗？`))
  ) {
    return;
  }

  if (existing) {
    const recurrence = normalizeRecurrence(existing);
    const scope =
      recurrence.frequency === 'none' ? 'series' : $('#eventEditScope').value || 'occurrence';
    const scopedValue =
      scope === 'series' && state.editingOccurrenceDate !== existing.date
        ? {
            ...value,
            date: dateKey(
              addDays(
                parseDate(existing.date),
                daysBetween(parseDate(state.editingOccurrenceDate), parseDate(value.date))
              )
            )
          }
        : value;
    applyScopedEventChange(
      existing,
      state.editingOccurrenceDate || existing.date,
      scopedValue,
      scope
    );
  } else {
    state.events.push(value);
  }
  state.selectedDate = state.editingOccurrenceDate || value.date;
  await saveEvents(existing ? '日程修改已保存' : '新日程已添加');
  $('#eventDialog').close();
}

async function deleteEditingEvent() {
  const id = $('#eventId').value;
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  const recurrence = normalizeRecurrence(event);
  const scope =
    recurrence.frequency === 'none' ? 'series' : $('#eventEditScope').value || 'occurrence';
  const target =
    recurrence.frequency === 'none'
      ? ''
      : scope === 'occurrence'
        ? '的本次安排'
        : scope === 'future'
          ? '的本次及后续安排'
          : '的整个系列';
  if (
    !(await askConfirm(`删除“${event.title}”${target}吗？`, { confirmLabel: '删除', danger: true }))
  ) {
    return;
  }
  await deleteOccurrence(event, state.editingOccurrenceDate || event.date, scope);
  $('#eventDialog').close();
}

async function deleteOccurrence(event, occurrenceDate, scope) {
  rememberUndo('日程删除');
  const updated = PlannerCore.applyOccurrenceDeletion(event, occurrenceDate, scope);
  const index = state.events.findIndex((item) => item.id === event.id);
  if (index !== -1) {
    state.events[index] = updated;
  }
  await saveEvents(updated.deletedAt ? '已移到回收站' : '日程已删除', {
    label: '撤销',
    handler: undoLastChange
  });
}

function renderRecycleBin() {
  const deleted = state.events
    .filter((event) => event.deletedAt)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  if (!deleted.length) {
    $('#recycleBinList').innerHTML = `
      <div class="empty">
        <b>回收站是空的</b>
        <span>删除的日程会先放在这里。</span>
      </div>
    `;
    return;
  }
  $('#recycleBinList').innerHTML = deleted
    .map(
      (event) => `
        <div class="row plain" style="--c:${escapeHtml(eventColor(event))}">
          <div>
            <strong><span>${escapeHtml(event.title)}</span></strong>
            <small>${escapeHtml(event.date)} · 删除于${escapeHtml(
              new Date(event.deletedAt).toLocaleString('zh-CN')
            )}</small>
          </div>
          <span class="chips">
            <button type="button" class="btn" data-restore-id="${escapeHtml(event.id)}">恢复</button>
            <button type="button" class="btn danger" data-purge-id="${escapeHtml(event.id)}">永久删除</button>
          </span>
        </div>
      `
    )
    .join('');
}

async function recycleBinAction(button) {
  const event = state.events.find(
    (item) => item.id === (button.dataset.restoreId || button.dataset.purgeId)
  );
  if (!event) return;
  if (button.dataset.restoreId) {
    event.deletedAt = null;
    event.updatedAt = new Date().toISOString();
    await saveEvents('日程已恢复');
  } else {
    if (
      !(await askConfirm(`永久删除“${event.title}”吗？此操作无法撤销。`, {
        confirmLabel: '永久删除',
        danger: true
      }))
    ) {
      return;
    }
    state.events = state.events.filter((item) => item.id !== event.id);
    await saveEvents('日程已永久删除');
  }
  renderRecycleBin();
}

function openRecycleBin() {
  if ($('#settingsDialog').open) $('#settingsDialog').close();
  renderRecycleBin();
  $('#recycleBinDialog').showModal();
}

async function updateSettings(patch) {
  state.settings = await window.deskcal.updateSettings(patch);
  render();
}

function showToast(message, title = 'DeskCal', action = null) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${title && title !== 'DeskCal' ? `<strong>${escapeHtml(title)}</strong>` : ''}${escapeHtml(
      message
    )}</span>
    ${
      action
        ? `<button type="button" class="toast-action">${escapeHtml(action.label || '撤销')}</button>`
        : ''
    }
  `;
  const region = $('#toastRegion');
  const dismiss = () => {
    toast.remove();
    if (!region.children.length && region.matches(':popover-open')) region.hidePopover();
  };
  if (action) {
    toast.querySelector('.toast-action').addEventListener('click', async () => {
      dismiss();
      await action.handler();
    });
  }
  // 撤销只对最近一次操作有效，旧提示条上的按钮不能留着，否则点它撤销的是另一笔操作
  if (action) {
    region.querySelectorAll('.toast-action').forEach((button) => button.closest('.toast').remove());
  }
  region.appendChild(toast);
  // 顶层里后打开的在上面：有弹窗开着时重新打开一次，把提示条挪到弹窗之上
  if (region.matches(':popover-open') && $('dialog[open]')) region.hidePopover();
  if (!region.matches(':popover-open')) region.showPopover();
  setTimeout(dismiss, action ? 6000 : 3500);
}

function openSettings() {
  renderSettings();
  $('#settingsDialog').showModal();
}

function stepCalendar(direction) {
  const selected = parseDate(state.selectedDate);
  if (state.viewMode === 'week') {
    state.selectedDate = dateKey(addDays(selected, 7 * direction));
  } else {
    // 换月时尽量停在同一天，那个月没有这一天就停在月底
    const day = selected.getDate();
    const target = new Date(selected.getFullYear(), selected.getMonth() + direction, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    state.selectedDate = dateKey(target);
  }
  render();
}

// 日历上的点击：票根和月历里的小条 = 编辑；“＋” = 新建；周历的日期表头和月历的格子 = 查看这一天
// 并展开日程栏，再点一次已选中的那天就收起；周历票根区的空白只选中，不动日程栏
function handleGridClick(event) {
  const add = event.target.closest('[data-new]');
  if (add) {
    openEventDialog(null, add.dataset.new);
    return;
  }
  const item = event.target.closest('[data-id]');
  const day = event.target.closest('[data-date]');
  if (!day) return;
  const key = day.dataset.date;
  const quiet = Boolean(item) || Boolean(event.target.closest('.evs'));
  if (!quiet && agendaOpen() && key === state.selectedDate) {
    setAgenda(true);
    return;
  }
  if (key !== state.selectedDate) {
    state.selectedDate = key;
    if (quiet || agendaOpen()) render();
  }
  if (!quiet && !agendaOpen()) setAgenda(false);
  if (item) openEventDialog(item.dataset.id, item.dataset.occurrenceDate);
}

function bindGridDrag() {
  const grid = $('#calendarGrid');
  let dragging = null;
  const clearTargets = (except) => {
    $all('#calendarGrid .drop').forEach((element) => {
      if (element !== except) element.classList.remove('drop');
    });
  };
  grid.addEventListener('dragstart', (event) => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    dragging = { eventId: item.dataset.id, occurrenceDate: item.dataset.occurrenceDate };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-deskcal-event', JSON.stringify(dragging));
    item.classList.add('dragging');
  });
  grid.addEventListener('dragover', (event) => {
    const day = event.target.closest('[data-date]');
    if (!dragging || !day) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearTargets(day);
    day.classList.add('drop');
  });
  grid.addEventListener('dragend', () => {
    dragging = null;
    clearTargets();
    $all('#calendarGrid .dragging').forEach((element) => element.classList.remove('dragging'));
  });
  grid.addEventListener('drop', async (event) => {
    const day = event.target.closest('[data-date]');
    if (!day) return;
    event.preventDefault();
    let payload = dragging;
    if (!payload) {
      try {
        payload = JSON.parse(event.dataTransfer.getData('application/x-deskcal-event'));
      } catch {
        return;
      }
    }
    dragging = null;
    clearTargets();
    await moveOccurrence(payload.eventId, payload.occurrenceDate, day.dataset.date);
  });
}

function handleAgendaClick(event) {
  const row = event.target.closest('[data-id]');
  if (!row) return;
  const item = state.events.find((entry) => entry.id === row.dataset.id);
  if (!item) return;
  const occurrenceDate = row.dataset.occurrenceDate;
  if (event.target.closest('[data-complete]')) {
    // 勾选后这一条会从当前列表里消失时，先播完消失动画再更新
    const leaves =
      !state.searchQuery.trim() &&
      ((state.filter === 'pending' && !item.completed) ||
        (state.filter === 'completed' && item.completed));
    if (!leaves) {
      toggleComplete(item.id, occurrenceDate);
      return;
    }
    row.querySelector('.chk').textContent = item.completed ? '' : '✓';
    row.classList.add('leaving');
    setTimeout(() => toggleComplete(item.id, occurrenceDate), LEAVE_MS);
    return;
  }
  if (state.searchQuery.trim() || state.filter === 'upcoming') {
    state.selectedDate = occurrenceDate;
    render();
  }
  openEventDialog(item.id, occurrenceDate);
}

function handleSummaryClick(event) {
  const row = event.target.closest('[data-id]');
  if (!row) return;
  const item = state.events.find((entry) => entry.id === row.dataset.id);
  if (!item) return;
  if (event.target.closest('[data-complete]')) {
    // 先划掉淡出，再更新；更新后清单保持打开，直到鼠标移开
    state.statKeep = row.closest('.stat').dataset.stat;
    row.querySelector('.chk').textContent = item.completed ? '' : '✓';
    row.classList.add('leaving');
    setTimeout(() => toggleComplete(item.id, row.dataset.occurrenceDate), LEAVE_MS);
    return;
  }
  state.statKeep = null;
  document.activeElement?.blur();
  openEventDialog(item.id, row.dataset.occurrenceDate);
}

function bindEvents() {
  $('#previousMonth').addEventListener('click', () => stepCalendar(-1));
  $('#nextMonth').addEventListener('click', () => stepCalendar(1));
  $('#todayButton').addEventListener('click', () => {
    state.selectedDate = dateKey(new Date());
    render();
  });
  $all('#calendarViewControl button').forEach((button) => {
    button.addEventListener('click', () => {
      state.viewMode = button.dataset.view;
      render();
      if (state.settings.calendarView !== state.viewMode) {
        updateSettings({ calendarView: state.viewMode });
      }
    });
  });
  $('#calendarGrid').addEventListener('click', handleGridClick);
  bindGridDrag();
  bindEdgeGrip();
  $('#summary').addEventListener('click', handleSummaryClick);
  $('#summary').addEventListener('mouseleave', () => {
    if (!state.statKeep) return;
    state.statKeep = null;
    $all('#summary .stat.keep').forEach((element) => element.classList.remove('keep'));
  });
  $('#agendaList').addEventListener('click', handleAgendaClick);
  $('#addEventButton').addEventListener('click', () => openEventDialog());
  $('#themeButton').addEventListener('click', switchTheme);

  $('#eventForm').addEventListener('submit', submitEventForm);
  $('#eventAllDay').addEventListener('change', () => {
    toggleTimeFields();
    previewEventConflict();
  });
  $all('#eventDate, #eventStartTime, #eventEndTime').forEach((input) => {
    input.addEventListener('change', previewEventConflict);
  });
  $('#eventRepeat').addEventListener('change', toggleRecurrenceFields);
  $('#eventColors').addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color]');
    if (swatch) setEventColor(swatch.dataset.color);
  });
  // 取色器拖动时不能重画色块（会把正在用的取色器换掉），只更新颜色和色号
  $('#eventColors').addEventListener('input', (event) => {
    if (event.target.id !== 'eventColor') return;
    state.formColor = event.target.value;
    $('#eventForm').style.setProperty('--c', state.formColor);
    $all('#eventColors .sw-c').forEach((element) => element.classList.remove('on'));
    const picker = event.target.closest('label');
    picker.classList.add('on');
    picker.style.setProperty('--c', state.formColor);
    $('#eventColors .hex').textContent = state.formColor.toUpperCase();
  });
  $('#eventReminderOn').addEventListener('change', syncReminderLine);
  $('#eventReminderSelect').addEventListener('change', () => {
    const value = $('#eventReminderSelect').value;
    if (value === 'more') {
      $('#customReminderAmount').value = '';
      $('#reminderDialog').showModal();
    } else if (value !== 'current') {
      setReminderOptions([Number(value)]);
    }
  });
  $('#eventReminderOptions').addEventListener('change', (event) => {
    // 取消勾选的自定义时间直接从清单里拿掉
    if (event.target.closest('[data-custom-reminder]') && !event.target.checked) {
      setReminderOptions(pickedReminders());
    } else {
      syncReminderLine();
    }
  });
  // 提醒时间页关掉时（点完成、按 Esc、点外面都算）：一个都没选就等于不提醒
  const settleReminders = () => {
    if (!pickedReminders().length) {
      $('#eventReminderOn').checked = false;
      setReminderOptions([0]);
      showToast('没有选时间，已关闭提醒');
    }
    syncReminderLine();
  };
  $('#reminderDoneButton').addEventListener('click', () => {
    settleReminders();
    $('#reminderDialog').close();
  });
  $('#reminderDialog').addEventListener('close', settleReminders);
  $('#customReminderAdd').addEventListener('click', addCustomReminder);
  $('#customReminderAmount').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addCustomReminder();
  });
  $('#askForm').addEventListener('submit', (event) => {
    event.preventDefault();
    settleAsk(true);
  });
  $('#askCancelButton').addEventListener('click', () => settleAsk(false));
  // close 事件是延后触发的：如果上一个确认框刚关、下一个已经打开，这次事件不该把新的关掉
  $('#askDialog').addEventListener('close', () => {
    if (!$('#askDialog').open) settleAsk(false);
  });
  $('#deleteEventButton').addEventListener('click', deleteEditingEvent);
  $all('[data-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      const resolve = state.scopeResolver;
      state.scopeResolver = null;
      $('#recurrenceScopeDialog').close();
      if (resolve) resolve(button.dataset.scope);
    });
  });
  $('#recycleBinButton').addEventListener('click', openRecycleBin);
  $('#recycleBinList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-restore-id], [data-purge-id]');
    if (button) recycleBinAction(button);
  });
  $('#settingsButton').addEventListener('click', openSettings);
  $('#minimizeButton').addEventListener('click', () => window.deskcal.windowAction('minimize'));
  $('#closeButton').addEventListener('click', () => window.deskcal.windowAction('hide'));

  $all('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close());
  });
  // 设置、回收站、提醒时间这几页点外面就关；表单和确认框不这样，免得误触丢掉填好的内容
  $all('#settingsDialog, #recycleBinDialog, #reminderDialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  // 横撕票的撕口跟着表头高度走
  $all('.tkt').forEach((ticket) => {
    const head = ticket.querySelector('.dhead');
    if (!head) return;
    new ResizeObserver(() => {
      if (head.offsetHeight) ticket.style.setProperty('--tear', `${head.offsetHeight + 6}px`);
    }).observe(head);
  });
  $all('#agendaFilters button').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      state.searchQuery = '';
      $('#searchInput').value = '';
      renderAgenda();
    });
  });
  $('#searchInput').addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderAgenda();
  });
  $all('#windowModeControl button').forEach((button) => {
    button.addEventListener('click', () => updateSettings({ windowMode: button.dataset.mode }));
  });
  $('#settingsDialog').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-setting]');
    if (toggle) updateSettings({ [toggle.dataset.setting]: !settingEnabled(toggle.dataset.setting) });
  });
  $('#opacityRange').addEventListener('input', (event) => {
    $('#opacityValue').textContent = `${event.target.value}%`;
    applySheetOpacity(Number(event.target.value) / 100);
  });
  $('#opacityRange').addEventListener('change', (event) =>
    updateSettings({ backgroundOpacity: Number(event.target.value) / 100 })
  );
  $('#updateActionButton').addEventListener('click', runUpdateAction);
  $('#releasePageButton').addEventListener('click', () => window.deskcal.openReleasePage());
  $('#exportButton').addEventListener('click', async () => {
    const result = await window.deskcal.exportData();
    if (!result.canceled) showToast('备份文件已导出');
  });
  $('#importButton').addEventListener('click', async () => {
    if (!(await askConfirm('导入备份将替换当前数据，是否继续？'))) return;
    try {
      const result = await window.deskcal.importData();
      if (!result.canceled) {
        state.events = result.state.events;
        state.calendars = result.state.calendars || state.calendars;
        state.settings = result.state.settings;
        state.undoSnapshot = null;
        applySavedView();
        render();
        const imported = result.summary?.imported ?? state.events.length;
        const skipped = result.summary?.skipped ?? 0;
        const message =
          skipped > 0
            ? `成功导入 ${imported} 条日程，跳过 ${skipped} 条`
            : `成功导入 ${imported} 条日程`;
        showToast(message);
      }
    } catch {
      showToast('不是有效的 DeskCal 备份文件，当前数据未改动', '导入失败');
    }
  });

  document.addEventListener('keydown', (event) => {
    // 有弹窗开着时不响应全局快捷键，否则 Ctrl+N 会清空正在填写或等待确认的表单
    const shortcut = event.ctrlKey && !$('dialog[open]') ? event.key.toLowerCase() : '';
    if (shortcut === 'n') {
      event.preventDefault();
      openEventDialog();
    }
    if (shortcut === 'f') {
      event.preventDefault();
      const focusSearch = () => {
        $('#searchInput').focus();
        $('#searchInput').select();
      };
      if (agendaOpen()) focusSearch();
      else setAgenda(false).then(focusSearch);
    }
    if (event.key === 'Escape') {
      // 确认框开着时只关它自己，不连带关掉下面的表单
      if (state.askResolver) {
        event.preventDefault();
        settleAsk(false);
        return;
      }
      if (state.scopeResolver) {
        const resolve = state.scopeResolver;
        state.scopeResolver = null;
        resolve('cancel');
      }
      // 提醒时间页是从表单里打开的，按一次只关它
      if ($('#reminderDialog').open) {
        event.preventDefault();
        $('#reminderDialog').close();
        return;
      }
      $all('dialog[open]').forEach((dialog) => dialog.close());
    }
  });
  // 没手动选过主题时跟着系统的深浅色变
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  // 托盘菜单触发时如果已有弹窗开着（比如正在填表单），就不要再打开新的把它冲掉
  window.deskcal.onOpenSettings(() => {
    if (!$('dialog[open]')) openSettings();
  });
  window.deskcal.onSettingsChanged((settings) => {
    state.settings = settings;
    render();
  });
  window.deskcal.onUpdateStatus((update) => {
    state.update = update;
    renderUpdate();
    if (update.state === 'available' && update.source === 'auto') {
      showToast('可以在设置里下载并安装', `发现新版本 ${update.version}`, {
        label: '查看',
        handler: openSettings
      });
    }
  });
  window.deskcal.onReminder((reminder) => {
    showToast(
      `${reminder.date}${reminder.time ? ` ${reminder.time}` : ''}`,
      reminder.late ? `遗漏提醒：${reminder.title}` : reminder.title
    );
  });
  window.deskcal.onReminderOpen(({ eventId, occurrenceDate }) => {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    // 已有弹窗开着（比如正在填另一条日程）时不去覆盖它，只提示一下
    if ($('dialog[open]')) {
      showToast('关闭当前窗口后，可以在日历里找到这条日程', event.title);
      return;
    }
    state.selectedDate = occurrenceDate;
    render();
    openEventDialog(eventId, occurrenceDate);
  });

  // 告诉主进程有没有弹窗开着：鼠标穿透开启时，弹窗期间要暂时恢复鼠标操作
  new MutationObserver(() => window.deskcal.setInteractive(Boolean($('dialog[open]')))).observe(
    document.body,
    { subtree: true, attributes: true, attributeFilter: ['open'] }
  );
}

async function init() {
  bindEvents();
  try {
    const initial = await window.deskcal.getState();
    state.events = initial.events || [];
    state.calendars = initial.calendars || [
      { id: 'personal', name: '个人', color: '#6750e8', visible: true }
    ];
    state.settings = initial.settings || {};
    state.acrylicSupported = Boolean(initial.acrylicSupported);
    state.update = initial.update || state.update;
    applySavedView();
    render();
    if (initial.justUpdated) showToast(`已更新到 ${initial.version}`);
  } catch (error) {
    showToast(error.message || '无法加载本地数据', '启动失败');
  }
}

init();
