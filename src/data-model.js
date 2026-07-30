const { randomUUID } = require('node:crypto');
const CalendarCore = require('./calendar-core');

const SCHEMA_VERSION = 2;
const DEFAULT_CALENDAR_ID = 'personal';

const DEFAULT_DATA = {
  schemaVersion: SCHEMA_VERSION,
  events: [],
  calendars: [
    {
      id: DEFAULT_CALENDAR_ID,
      name: '个人',
      color: '#6750e8',
      visible: true,
      createdAt: null
    }
  ],
  notifications: [],
  settings: {
    theme: 'system',
    windowMode: 'desktop',
    opacity: 0.96,
    clickThrough: false,
    startOnBoot: false,
    showCompleted: true,
    sound: true,
    firstDayOfWeek: 1,
    showLunar: true,
    showTraditionalFestivals: true,
    showCommemorativeDays: false,
    showSolarTerms: true,
    showOfficialHolidays: true,
    showHolidayBadges: true,
    highlightWeekends: true
  },
  window: {
    width: 920,
    height: 650,
    x: null,
    y: null
  }
};

function clone(value) {
  return structuredClone(value);
}

function validIso(value, fallback) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function cleanText(value, maximum = 500) {
  return String(value ?? '').trim().slice(0, maximum);
}

function cleanTime(value, fallback = '') {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback;
}

function cleanColor(value, fallback = '#6750e8') {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
}

function normalizeEvent(value, now = new Date()) {
  if (!value || typeof value !== 'object') return null;
  const title = cleanText(value.title, 100);
  if (!title || !CalendarCore.isDateKey(value.date)) return null;

  const timestamp = now.toISOString();
  const allDay = Boolean(value.allDay);
  const recurrence = CalendarCore.normalizeRecurrence(value);
  const reminders = [
    ...new Set(
      (Array.isArray(value.reminders) ? value.reminders : [])
        .map(Number)
        .filter((minutes) => Number.isFinite(minutes) && minutes >= 0 && minutes <= 10080)
        .map((minutes) => Math.trunc(minutes))
    )
  ].sort((a, b) => a - b);

  return {
    id: cleanText(value.id, 100) || randomUUID(),
    title,
    date: value.date,
    allDay,
    startTime: allDay ? '' : cleanTime(value.startTime, '09:00'),
    endTime: allDay ? '' : cleanTime(value.endTime, '10:00'),
    allDayReminderTime: cleanTime(value.allDayReminderTime, '09:00'),
    reminders,
    recurrence,
    repeat: recurrence.frequency,
    exceptions: (Array.isArray(value.exceptions) ? value.exceptions : []).filter(
      CalendarCore.isDateKey
    ),
    calendarId: cleanText(value.calendarId, 100) || DEFAULT_CALENDAR_ID,
    category: cleanText(value.category, 50) || 'work',
    color: cleanColor(value.color),
    location: cleanText(value.location, 200),
    notes: cleanText(value.notes, 2000),
    completed: Boolean(value.completed),
    cancelled: Boolean(value.cancelled),
    createdAt: validIso(value.createdAt, timestamp),
    updatedAt: validIso(value.updatedAt, timestamp),
    deletedAt: value.deletedAt ? validIso(value.deletedAt, null) : null
  };
}

function normalizeEvents(events, now = new Date()) {
  const seen = new Set();
  const normalized = [];
  for (const rawEvent of Array.isArray(events) ? events.slice(0, 20000) : []) {
    const event = normalizeEvent(rawEvent, now);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    normalized.push(event);
  }
  return normalized;
}

function normalizeCalendar(value, now = new Date()) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id, 100);
  const name = cleanText(value.name, 50);
  if (!id || !name) return null;
  return {
    id,
    name,
    color: cleanColor(value.color),
    visible: value.visible !== false,
    createdAt: validIso(value.createdAt, now.toISOString())
  };
}

function normalizeCalendars(calendars, now = new Date()) {
  const seen = new Set();
  const normalized = [];
  for (const value of Array.isArray(calendars) ? calendars.slice(0, 100) : []) {
    const calendar = normalizeCalendar(value, now);
    if (!calendar || seen.has(calendar.id)) continue;
    seen.add(calendar.id);
    normalized.push(calendar);
  }
  if (!seen.has(DEFAULT_CALENDAR_ID)) {
    normalized.unshift({
      ...clone(DEFAULT_DATA.calendars[0]),
      createdAt: now.toISOString()
    });
  }
  return normalized;
}

function migrateData(value, now = new Date()) {
  const source = value && typeof value === 'object' ? value : {};
  const calendars = normalizeCalendars(source.calendars, now);

  return {
    schemaVersion: SCHEMA_VERSION,
    events: normalizeEvents(source.events, now),
    calendars,
    notifications: (Array.isArray(source.notifications) ? source.notifications : [])
      .filter((item) => item && typeof item.token === 'string')
      .slice(-1000),
    settings: { ...clone(DEFAULT_DATA.settings), ...(source.settings || {}) },
    window: { ...clone(DEFAULT_DATA.window), ...(source.window || {}) }
  };
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_CALENDAR_ID,
  DEFAULT_DATA,
  normalizeEvent,
  normalizeEvents,
  normalizeCalendar,
  normalizeCalendars,
  migrateData
};
