(function exposeCalendarCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DeskCalCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCalendarCore() {
  const VALID_FREQUENCIES = new Set([
    'none',
    'daily',
    'weekdays',
    'weekly',
    'monthly',
    'yearly'
  ]);

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const parsed = parseDate(value);
    return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
  }

  function parseDate(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!match) return new Date(Number.NaN);
    const [, year, month, day] = match.map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function utcDayNumber(date) {
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }

  function daysBetween(first, second) {
    return utcDayNumber(second) - utcDayNumber(first);
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function normalizeRecurrence(event) {
    const source =
      event?.recurrence && typeof event.recurrence === 'object' ? event.recurrence : {};
    const legacyFrequency = typeof event?.repeat === 'string' ? event.repeat : 'none';
    const frequency = VALID_FREQUENCIES.has(source.frequency)
      ? source.frequency
      : VALID_FREQUENCIES.has(legacyFrequency)
        ? legacyFrequency
        : 'none';
    const interval = Math.min(365, Math.max(1, Math.trunc(Number(source.interval) || 1)));
    const until = isDateKey(source.until) ? source.until : null;
    const countValue = Math.trunc(Number(source.count));
    const count = Number.isFinite(countValue) && countValue > 0 ? countValue : null;
    return { frequency, interval, until, count };
  }

  function weekdaysThrough(start, target) {
    const diff = daysBetween(start, target);
    if (diff < 0) return 0;
    const startDayOfWeek = start.getDay();
    const fullWeeks = Math.floor(diff / 7);
    let count = fullWeeks * 5;
    const remainder = diff % 7;
    for (let i = 0; i <= remainder; i += 1) {
      const day = (startDayOfWeek + i) % 7;
      if (day !== 0 && day !== 6) count += 1;
    }
    return count;
  }

  function occurrenceNumber(event, targetDate) {
    const start = parseDate(event.date);
    const recurrence = normalizeRecurrence(event);
    const diff = daysBetween(start, targetDate);
    if (diff < 0) return 0;

    switch (recurrence.frequency) {
      case 'daily':
        return diff % recurrence.interval === 0 ? diff / recurrence.interval + 1 : 0;
      case 'weekdays': {
        if (targetDate.getDay() === 0 || targetDate.getDay() === 6) return 0;
        const weekDistance = Math.floor(diff / 7);
        if (weekDistance % recurrence.interval !== 0) return 0;
        return weekdaysThrough(start, targetDate);
      }
      case 'weekly':
        return diff % (7 * recurrence.interval) === 0
          ? diff / (7 * recurrence.interval) + 1
          : 0;
      case 'monthly': {
        const monthDistance =
          (targetDate.getFullYear() - start.getFullYear()) * 12 +
          targetDate.getMonth() -
          start.getMonth();
        return monthDistance >= 0 &&
          monthDistance % recurrence.interval === 0 &&
          targetDate.getDate() === start.getDate()
          ? monthDistance / recurrence.interval + 1
          : 0;
      }
      case 'yearly': {
        const yearDistance = targetDate.getFullYear() - start.getFullYear();
        return yearDistance >= 0 &&
          yearDistance % recurrence.interval === 0 &&
          targetDate.getMonth() === start.getMonth() &&
          targetDate.getDate() === start.getDate()
          ? yearDistance / recurrence.interval + 1
          : 0;
      }
      default:
        return diff === 0 ? 1 : 0;
    }
  }

  function occursOn(event, targetDate) {
    if (!event || !isDateKey(event.date) || Number.isNaN(targetDate?.getTime?.())) return false;
    if (event.cancelled || event.deletedAt) return false;

    const targetKey = dateKey(targetDate);
    if (Array.isArray(event.exceptions) && event.exceptions.includes(targetKey)) return false;

    const recurrence = normalizeRecurrence(event);
    if (recurrence.until && targetKey > recurrence.until) return false;

    const number = occurrenceNumber(event, targetDate);
    if (!number) return false;
    return !recurrence.count || number <= recurrence.count;
  }

  function occurrenceTime(event) {
    const time = event.allDay ? event.allDayReminderTime || '09:00' : event.startTime || '09:00';
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    const hour = match ? Math.min(23, Number(match[1])) : 9;
    const minute = match ? Math.min(59, Number(match[2])) : 0;
    return `${pad(hour)}:${pad(minute)}`;
  }

  function occurrenceDateTime(event, date) {
    const time = occurrenceTime(event);
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  }

  function legacyReminderToken(eventId, occurrenceKey, minutes) {
    return `${eventId}|${occurrenceKey}|${minutes}`;
  }

  function reminderToken(eventId, occurrenceKey, minutes, baseTime) {
    return `${eventId}|${occurrenceKey}|${minutes}|${baseTime}`;
  }

  function remindersDue(events, now = new Date(), options = {}) {
    const maxAgeMs = Math.max(0, Number(options.maxAgeMs) || 65000);
    const activeEvents = Array.isArray(events) ? events : [];
    const reminderValues = activeEvents.flatMap((event) =>
      Array.isArray(event.reminders) ? event.reminders.map(Number).filter(Number.isFinite) : []
    );
    const maxReminderMinutes = Math.max(0, ...reminderValues);
    const lookBehindDays = Math.ceil(maxAgeMs / 86400000) + 1;
    const lookAheadDays = Math.min(8, Math.ceil(maxReminderMinutes / 1440) + 1);
    const due = [];

    for (let offset = -lookBehindDays; offset <= lookAheadDays; offset += 1) {
      const occurrenceDate = addDays(now, offset);
      const occurrenceKey = dateKey(occurrenceDate);
      for (const event of activeEvents) {
        if (event.completed || event.cancelled || event.deletedAt) continue;
        if (!occursOn(event, occurrenceDate)) continue;
        const baseTime = occurrenceTime(event);
        const start = occurrenceDateTime(event, occurrenceDate);
        const reminders = Array.isArray(event.reminders) ? event.reminders : [];
        for (const rawMinutes of reminders) {
          const minutes = Number(rawMinutes);
          if (!Number.isFinite(minutes) || minutes < 0) continue;
          const triggerAt = new Date(start.getTime() - minutes * 60000);
          const ageMs = now.getTime() - triggerAt.getTime();
          if (ageMs < 0 || ageMs > maxAgeMs) continue;
          due.push({
            event,
            occurrenceDate,
            occurrenceKey,
            minutes,
            triggerAt,
            ageMs,
            token: reminderToken(event.id, occurrenceKey, minutes, baseTime),
            legacyToken: legacyReminderToken(event.id, occurrenceKey, minutes)
          });
        }
      }
    }
    return due.sort((a, b) => a.triggerAt - b.triggerAt);
  }

  function unsentReminders(events, sentTokens = new Set(), now = new Date(), options = {}) {
    const due = remindersDue(events, now, options);
    const sent = sentTokens instanceof Set ? sentTokens : new Set(sentTokens || []);
    return due.filter((item) => !sent.has(item.token) && !sent.has(item.legacyToken));
  }

  return {
    VALID_FREQUENCIES,
    dateKey,
    isDateKey,
    parseDate,
    daysBetween,
    addDays,
    normalizeRecurrence,
    occurrenceNumber,
    occursOn,
    occurrenceDateTime,
    reminderToken,
    legacyReminderToken,
    remindersDue,
    unsentReminders
  };
});
