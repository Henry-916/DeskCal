(function exposeQuickInput(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DeskCalQuickInput = api;
})(typeof window !== 'undefined' ? window : globalThis, function createQuickInput() {
  const WEEKDAY_INDEX = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function setCalendarDate(base, year, month, day) {
    const result = new Date(base);
    result.setFullYear(year, month - 1, day);
    result.setHours(12, 0, 0, 0);
    return result;
  }

  function upcomingWeekday(base, weekday, nextWeek) {
    if (nextWeek) {
      const mondayOffset = (base.getDay() + 6) % 7;
      const nextMonday = addDays(base, 7 - mondayOffset);
      return addDays(nextMonday, weekday === 0 ? 6 : weekday - 1);
    }
    const current = base.getDay();
    let delta = (weekday - current + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(base, delta);
  }

  function parseDateToken(text, now) {
    const absolute = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/.exec(text);
    if (absolute) {
      const year = Number(absolute[1]) || now.getFullYear();
      return {
        date: setCalendarDate(now, year, Number(absolute[2]), Number(absolute[3])),
        token: absolute[0]
      };
    }

    const relative = /(今天|明天|后天)/.exec(text);
    if (relative) {
      const offsets = { 今天: 0, 明天: 1, 后天: 2 };
      return { date: addDays(now, offsets[relative[1]]), token: relative[0] };
    }

    const weekday = /(下周|本周)?(?:周|星期)([一二三四五六日天])/.exec(text);
    if (weekday) {
      const target = WEEKDAY_INDEX[weekday[2]];
      if (weekday[1] === '本周') {
        const mondayOffset = (now.getDay() + 6) % 7;
        const weekStart = addDays(now, -mondayOffset);
        const mondayBasedTarget = target === 0 ? 6 : target - 1;
        return { date: addDays(weekStart, mondayBasedTarget), token: weekday[0] };
      }
      return {
        date: upcomingWeekday(now, target, weekday[1] === '下周'),
        token: weekday[0]
      };
    }

    return { date: new Date(now), token: '' };
  }

  function normalizeHour(hour, period) {
    let value = Math.max(0, Math.min(23, Number(hour)));
    if ((period === '下午' || period === '晚上') && value < 12) value += 12;
    if (period === '中午' && value < 11) value += 12;
    if ((period === '凌晨' || period === '早上' || period === '上午') && value === 12) value = 0;
    return value;
  }

  function parseTimeToken(text) {
    const clock = /(?:^|\s|，|,)([01]?\d|2[0-3]):([0-5]\d)(?=$|\s|，|,)/.exec(text);
    if (clock) {
      return {
        hour: Number(clock[1]),
        minute: Number(clock[2]),
        token: clock[0].trim()
      };
    }

    const chinese = /(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})点(?:(半)|(\d{1,2})分?)?/.exec(
      text
    );
    if (chinese) {
      return {
        hour: normalizeHour(chinese[2], chinese[1]),
        minute: chinese[3] ? 30 : Math.min(59, Number(chinese[4]) || 0),
        token: chinese[0]
      };
    }
    return null;
  }

  function endTimeFor(hour, minute) {
    const total = Math.min(23 * 60 + 59, hour * 60 + minute + 60);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function parseReminder(text) {
    if (/不提醒/.test(text)) return { reminders: [], token: '不提醒' };
    const match = /提前\s*(\d+)\s*(分钟|小时|天)(?:提醒)?/.exec(text);
    if (!match) return { reminders: [10], token: '' };
    const factors = { 分钟: 1, 小时: 60, 天: 1440 };
    return {
      reminders: [Number(match[1]) * factors[match[2]]],
      token: match[0]
    };
  }

  function parseRecurrence(text) {
    const options = [
      [/每个?工作日/, 'weekdays'],
      [/每天/, 'daily'],
      [/每周/, 'weekly'],
      [/每月/, 'monthly'],
      [/每年/, 'yearly']
    ];
    for (const [pattern, frequency] of options) {
      const match = pattern.exec(text);
      if (match) return { frequency, token: match[0] };
    }
    return { frequency: 'none', token: '' };
  }

  function inferCategory(text) {
    if (/重要|紧急|截止/.test(text)) return 'important';
    if (/学习|课程|上课|考试|复习|作业/.test(text)) return 'study';
    if (/生日|家庭|家人|生活|买菜|健身|医院/.test(text)) return 'life';
    return 'work';
  }

  function removeOnce(text, token) {
    return token ? text.replace(token, ' ') : text;
  }

  function parseQuickInput(value, now = new Date()) {
    const original = String(value ?? '').trim();
    if (!original) return { ok: false, error: '请输入日程内容' };

    const base = new Date(now);
    base.setHours(12, 0, 0, 0);
    const dateResult = parseDateToken(original, base);
    const timeResult = parseTimeToken(original);
    const reminderResult = parseReminder(original);
    const recurrenceResult = parseRecurrence(original);

    let title = original;
    for (const token of [
      dateResult.token,
      timeResult?.token,
      reminderResult.token,
      recurrenceResult.token
    ]) {
      title = removeOnce(title, token);
    }
    title = title
      .replace(/提醒我|请提醒|提醒/g, ' ')
      .replace(/[，,。；;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) title = '新日程';

    const allDay = !timeResult;
    const startTime = timeResult ? `${pad(timeResult.hour)}:${pad(timeResult.minute)}` : '';
    return {
      ok: true,
      original,
      title,
      date: dateKey(dateResult.date),
      allDay,
      startTime,
      endTime: timeResult ? endTimeFor(timeResult.hour, timeResult.minute) : '',
      reminders: reminderResult.reminders,
      recurrence: {
        frequency: recurrenceResult.frequency,
        interval: 1,
        until: null,
        count: null
      },
      category: inferCategory(original)
    };
  }

  function formatQuickPreview(parsed) {
    if (!parsed?.ok) return parsed?.error || '无法解析';
    const time = parsed.allDay ? '全天' : `${parsed.startTime}–${parsed.endTime}`;
    const repeat = {
      none: '',
      daily: '每天',
      weekdays: '每个工作日',
      weekly: '每周',
      monthly: '每月',
      yearly: '每年'
    }[parsed.recurrence.frequency];
    const reminder = parsed.reminders.length
      ? `提前${parsed.reminders[0] >= 1440 ? `${parsed.reminders[0] / 1440}天` : parsed.reminders[0] >= 60 ? `${parsed.reminders[0] / 60}小时` : `${parsed.reminders[0]}分钟`}`
      : '不提醒';
    return [parsed.date, time, repeat, reminder].filter(Boolean).join(' · ');
  }

  return { parseQuickInput, formatQuickPreview };
});
