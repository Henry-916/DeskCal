(function exposePlannerCore(root, factory) {
  const core =
    typeof module !== 'undefined' && module.exports
      ? require('./calendar-core')
      : root.DeskCalCore;
  const api = factory(core);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DeskCalPlannerCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPlannerCore(CalendarCore) {
  const { dateKey, parseDate, addDays, occursOn, normalizeRecurrence } = CalendarCore;

  function minutesFromTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function timeFromMinutes(value) {
    const minutes = Math.max(0, Math.min(1439, Math.round(Number(value) || 0)));
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(
      2,
      '0'
    )}`;
  }

  function shiftTimeRange(startTime, endTime, amount) {
    const start = minutesFromTime(startTime);
    const end = minutesFromTime(endTime);
    if (start === null || end === null || end <= start) return null;
    const duration = end - start;
    const nextStart = Math.max(0, Math.min(1439 - duration, start + Number(amount || 0)));
    return {
      startTime: timeFromMinutes(nextStart),
      endTime: timeFromMinutes(nextStart + duration)
    };
  }

  function timeRangesOverlap(first, second) {
    if (first.allDay || second.allDay) return false;
    const firstStart = minutesFromTime(first.startTime);
    const firstEnd = minutesFromTime(first.endTime);
    const secondStart = minutesFromTime(second.startTime);
    const secondEnd = minutesFromTime(second.endTime);
    if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => value === null)) {
      return false;
    }
    return firstStart < secondEnd && secondStart < firstEnd;
  }

  function conflictsForCandidate(candidate, events, occurrenceDate = candidate.date, excludeId = null) {
    if (!candidate || candidate.allDay) return [];
    const date = parseDate(occurrenceDate);
    if (Number.isNaN(date.getTime())) return [];
    return (Array.isArray(events) ? events : []).filter(
      (event) =>
        event.id !== excludeId &&
        !event.deletedAt &&
        !event.cancelled &&
        !event.completed &&
        occursOn(event, date) &&
        timeRangesOverlap(candidate, event)
    );
  }

  function previousDateKey(value) {
    return dateKey(addDays(parseDate(value), -1));
  }

  function applyOccurrenceChange(event, occurrenceDate, changes, scope, createId, now = new Date()) {
    const recurrence = normalizeRecurrence(event);
    const timestamp = now.toISOString();
    if (recurrence.frequency === 'none' || scope === 'series') {
      return {
        original: {
          ...event,
          ...changes,
          updatedAt: timestamp
        },
        detached: null
      };
    }

    if (scope === 'future') {
      const nextRecurrence = normalizeRecurrence({
        recurrence: changes.recurrence || recurrence
      });
      const original = {
        ...event,
        recurrence: {
          ...recurrence,
          until: previousDateKey(occurrenceDate),
          count: null
        },
        exceptions: (event.exceptions || []).filter((value) => value < occurrenceDate),
        updatedAt: timestamp
      };
      const detached = {
        ...event,
        ...changes,
        id: createId(),
        date: changes.date || occurrenceDate,
        recurrence: { ...nextRecurrence, count: null },
        repeat: nextRecurrence.frequency,
        exceptions: (event.exceptions || []).filter((value) => value >= occurrenceDate),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return { original, detached };
    }

    const original = {
      ...event,
      exceptions: [...new Set([...(event.exceptions || []), occurrenceDate])].sort(),
      updatedAt: timestamp
    };
    const detached = {
      ...event,
      ...changes,
      id: createId(),
      date: changes.date || occurrenceDate,
      recurrence: { frequency: 'none', interval: 1, until: null, count: null },
      repeat: 'none',
      exceptions: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return { original, detached };
  }

  return {
    minutesFromTime,
    timeFromMinutes,
    shiftTimeRange,
    timeRangesOverlap,
    conflictsForCandidate,
    previousDateKey,
    applyOccurrenceChange
  };
});
