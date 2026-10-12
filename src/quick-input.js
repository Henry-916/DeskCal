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

  const CHINESE_NUM_MAP = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
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

  function upcomingWeekday(base, weekday) {
    const current = base.getDay();
    let delta = (weekday - current + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(base, delta);
  }

  function parseNumberToken(val) {
    if (!val) return null;
    val = String(val).trim();
    if (/^\d+$/.test(val)) return Number(val);
    if (CHINESE_NUM_MAP[val] !== undefined) return CHINESE_NUM_MAP[val];
    if (val.startsWith('十')) {
      const d = CHINESE_NUM_MAP[val.slice(1)];
      return d !== undefined ? 10 + d : null;
    }
    if (val.endsWith('十') && val.length === 2) {
      const d = CHINESE_NUM_MAP[val[0]];
      return d !== undefined ? d * 10 : null;
    }
    if (val.length === 3 && val[1] === '十') {
      const tens = CHINESE_NUM_MAP[val[0]];
      const ones = CHINESE_NUM_MAP[val[2]];
      if (tens !== undefined && ones !== undefined) return tens * 10 + ones;
    }
    const prefixes = [
      ['二十', 20],
      ['三十', 30],
      ['四十', 40],
      ['五十', 50]
    ];
    for (const [pfx, baseVal] of prefixes) {
      if (val.startsWith(pfx)) {
        if (val.length === pfx.length) return baseVal;
        const d = CHINESE_NUM_MAP[val.slice(pfx.length)];
        if (d !== undefined) return baseVal + d;
      }
    }
    return null;
  }

  function parseDateToken(text, now) {
    const absolute = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/.exec(text);
    if (absolute) {
      const year = Number(absolute[1]) || now.getFullYear();
      return {
        date: setCalendarDate(now, year, Number(absolute[2]), Number(absolute[3])),
        token: absolute[0],
        span: [absolute.index, absolute.index + absolute[0].length]
      };
    }

    const relative = /(今天|明天|大后天|后天)/.exec(text);
    if (relative) {
      const offsets = { 今天: 0, 明天: 1, 大后天: 3, 后天: 2 };
      return {
        date: addDays(now, offsets[relative[1]]),
        token: relative[0],
        span: [relative.index, relative.index + relative[0].length]
      };
    }

    const weekdayRegex =
      /(?:(下周|下星期|这周|本周|这星期|本星期)(?:周|星期)?|(?:周|星期))([一二三四五六日天])/;
    const weekday = weekdayRegex.exec(text);
    if (weekday) {
      const modifier = weekday[1];
      const target = WEEKDAY_INDEX[weekday[2]];
      const mondayOffset = (now.getDay() + 6) % 7;
      const currentMonday = addDays(now, -mondayOffset);

      if (modifier === '本周' || modifier === '这周' || modifier === '本星期' || modifier === '这星期') {
        const dayOffset = target === 0 ? 6 : target - 1;
        return {
          date: addDays(currentMonday, dayOffset),
          token: weekday[0],
          span: [weekday.index, weekday.index + weekday[0].length]
        };
      }

      if (modifier === '下周' || modifier === '下星期') {
        const nextMonday = addDays(currentMonday, 7);
        const dayOffset = target === 0 ? 6 : target - 1;
        return {
          date: addDays(nextMonday, dayOffset),
          token: weekday[0],
          span: [weekday.index, weekday.index + weekday[0].length]
        };
      }

      return {
        date: upcomingWeekday(now, target),
        token: weekday[0],
        span: [weekday.index, weekday.index + weekday[0].length]
      };
    }

    return { date: new Date(now), token: '', span: null };
  }

  function normalizeHour(hour, period) {
    let value = Math.max(0, Math.min(23, Number(hour)));
    if (period === '晚上') {
      if (value === 12) return 0;
      if (value < 12) return value + 12;
      return value;
    }
    if (period === '下午') {
      if (value < 12) return value + 12;
      return value;
    }
    if (period === '中午') {
      if (value < 11) return value + 12;
      return value;
    }
    if (period === '凌晨' || period === '早上' || period === '上午') {
      if (value === 12) return 0;
      return value;
    }
    return value;
  }

  function endTimeFor(hour, minute) {
    const total = Math.min(23 * 60 + 59, hour * 60 + minute + 60);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function parseChineseTimePoint(text, startIndex, defaultPeriod = null, isEnd = false) {
    const sub = text.slice(startIndex);
    const re =
      /^(?:(凌晨|早上|上午|中午|下午|晚上)\s*)?(\d{1,2}|[零一二两三四五六七八九十]+)点(?:(半|一刻|三刻)|(\d{1,2}|[零一二两三四五六七八九十]+)(分?))?/;
    const match = re.exec(sub);
    if (!match) return null;

    const period = match[1] || defaultPeriod || null;
    const rawHour = parseNumberToken(match[2]);
    if (rawHour === null) return null;

    const isChineseHour = !/^\d+$/.test(match[2]);
    if (isChineseHour && !period) {
      // R3: Chinese hour without period is not treated as a time
      return null;
    }

    let minute = 0;
    let matchedLength = match[0].length;

    if (match[3]) {
      if (match[3] === '半') minute = 30;
      else if (match[3] === '一刻') minute = 15;
      else if (match[3] === '三刻') minute = 45;
    } else if (match[4]) {
      const isArabicMin = /^\d+$/.test(match[4]);
      const hasFen = match[5] === '分';
      if (isArabicMin) {
        minute = Math.min(59, Math.max(0, Number(match[4])));
      } else {
        const minStr = match[4];
        if (hasFen) {
          if (minStr.startsWith('零')) {
            minute = parseNumberToken(minStr.slice(1)) || 0;
          } else {
            minute = parseNumberToken(minStr) || 0;
          }
        } else {
          if (minStr.startsWith('零')) {
            minute = parseNumberToken(minStr.slice(1)) || 0;
          } else {
            const val = parseNumberToken(minStr);
            if (val !== null && val >= 10) {
              minute = val;
            } else {
              // R2: single Chinese digit without 分 is not a minute
              minute = 0;
              const dianIdx = match[0].indexOf('点');
              matchedLength = dianIdx + 1;
            }
          }
        }
      }
    }

    let hour;
    let rolloverDay = 0;
    if (period === '晚上' && rawHour === 12) {
      hour = 0;
      rolloverDay = 1;
    } else if (period) {
      hour = normalizeHour(rawHour, period);
    } else {
      hour = Math.max(0, Math.min(23, rawHour));
    }

    return {
      hour,
      minute,
      period,
      rawHour,
      rolloverDay,
      matchedLength,
      span: [startIndex, startIndex + matchedLength]
    };
  }

  function parseTimeToken(text) {
    // 1. Digital range: e.g. 15:00-17:00, 下午3:00-5:00, 上午10:00到下午2:00, 11:00-01:00
    const digitalRangeRegex =
      /(?:(凌晨|早上|上午|中午|下午|晚上)\s*)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:到|至|-|~|—)\s*(?:(凌晨|早上|上午|中午|下午|晚上)\s*)?([01]?\d|2[0-3]):([0-5]\d)/;
    const digitalRangeMatch = digitalRangeRegex.exec(text);
    if (digitalRangeMatch) {
      const period1 = digitalRangeMatch[1] || null;
      const rawStartHour = Number(digitalRangeMatch[2]);
      const startMinute = Number(digitalRangeMatch[3]);
      const period2 = digitalRangeMatch[4] || period1;
      const rawEndHour = Number(digitalRangeMatch[5]);
      let endMinute = Number(digitalRangeMatch[6]);

      let rolloverDay = 0;
      let startHour;
      if (period1 === '晚上' && rawStartHour === 12) {
        startHour = 0;
        rolloverDay = 1;
      } else if (period1) {
        startHour = normalizeHour(rawStartHour, period1);
      } else {
        startHour = rawStartHour;
      }

      let endHour;
      if (period2) {
        endHour = normalizeHour(rawEndHour, period2);
      } else {
        endHour = rawEndHour;
      }

      const startTotal = startHour * 60 + startMinute;
      let endTotal = endHour * 60 + endMinute;

      if (endTotal <= startTotal) {
        const retryHour = endHour + 12;
        const retryTotal = retryHour * 60 + endMinute;
        if (retryHour < 24 && retryTotal > startTotal) {
          endHour = retryHour;
          endTotal = retryTotal;
        } else {
          endTotal = Math.min(23 * 60 + 59, startTotal + 60);
          endHour = Math.floor(endTotal / 60);
          endMinute = endTotal % 60;
        }
      }

      return {
        startTime: `${pad(startHour)}:${pad(startMinute)}`,
        endTime: `${pad(endHour)}:${pad(endMinute)}`,
        rolloverDay,
        span: [digitalRangeMatch.index, digitalRangeMatch.index + digitalRangeMatch[0].length]
      };
    }

    // 2. Chinese time: ranges or single
    for (let i = 0; i < text.length; i += 1) {
      const point1 = parseChineseTimePoint(text, i, null, false);
      if (!point1) continue;

      const after1 = text.slice(point1.span[1]);
      const connMatch = /^\s*(到|至|-|~|—)\s*/.exec(after1);
      if (connMatch) {
        const idx2 = point1.span[1] + connMatch[0].length;
        const point2 = parseChineseTimePoint(text, idx2, point1.period, true);
        if (point2) {
          let endHour = point2.hour;
          let endMinute = point2.minute;
          const startTotal = point1.hour * 60 + point1.minute;
          let endTotal = endHour * 60 + endMinute;

          if (endTotal <= startTotal) {
            const retryHour = endHour + 12;
            const retryTotal = retryHour * 60 + endMinute;
            if (retryHour < 24 && retryTotal > startTotal) {
              endHour = retryHour;
              endTotal = retryTotal;
            } else {
              endTotal = Math.min(23 * 60 + 59, startTotal + 60);
              endHour = Math.floor(endTotal / 60);
              endMinute = endTotal % 60;
            }
          }

          return {
            startTime: `${pad(point1.hour)}:${pad(point1.minute)}`,
            endTime: `${pad(endHour)}:${pad(endMinute)}`,
            rolloverDay: point1.rolloverDay,
            span: [point1.span[0], point2.span[1]]
          };
        }
      }

      return {
        startTime: `${pad(point1.hour)}:${pad(point1.minute)}`,
        endTime: endTimeFor(point1.hour, point1.minute),
        rolloverDay: point1.rolloverDay,
        span: point1.span
      };
    }

    // 3. Digital single: e.g. 下午3:30, 晚上12:30, 15:30
    const digitalSingleRegex =
      /(?:(凌晨|早上|上午|中午|下午|晚上)\s*)?([01]?\d|2[0-3]):([0-5]\d)/g;
    let dsMatch;
    while ((dsMatch = digitalSingleRegex.exec(text)) !== null) {
      if (!dsMatch[1] && dsMatch.index > 0 && /\d/.test(text[dsMatch.index - 1])) {
        continue;
      }
      const period = dsMatch[1] || null;
      const rawHour = Number(dsMatch[2]);
      const minute = Number(dsMatch[3]);
      let hour;
      let rolloverDay = 0;
      if (period === '晚上' && rawHour === 12) {
        hour = 0;
        rolloverDay = 1;
      } else if (period) {
        hour = normalizeHour(rawHour, period);
      } else {
        hour = rawHour;
      }

      return {
        startTime: `${pad(hour)}:${pad(minute)}`,
        endTime: endTimeFor(hour, minute),
        rolloverDay,
        span: [dsMatch.index, dsMatch.index + dsMatch[0].length]
      };
    }

    return null;
  }

  function parseReminder(text) {
    const noRemind = /不提醒/.exec(text);
    if (noRemind) {
      return {
        reminders: [],
        token: '不提醒',
        span: [noRemind.index, noRemind.index + noRemind[0].length]
      };
    }
    const match = /提前\s*(\d+)\s*(分钟|小时|天)(?:提醒)?/.exec(text);
    if (!match) return { reminders: [10], token: '', span: null };
    const factors = { 分钟: 1, 小时: 60, 天: 1440 };
    return {
      reminders: [Number(match[1]) * factors[match[2]]],
      token: match[0],
      span: [match.index, match.index + match[0].length]
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
      if (match) {
        return {
          frequency,
          token: match[0],
          span: [match.index, match.index + match[0].length]
        };
      }
    }
    return { frequency: 'none', token: '', span: null };
  }

  function inferCategory(text) {
    if (/重要|紧急|截止/.test(text)) return 'important';
    if (/学习|课程|上课|考试|复习|作业/.test(text)) return 'study';
    if (/生日|家庭|家人|生活|买菜|健身|医院/.test(text)) return 'life';
    return 'work';
  }

  function mergeSpans(spans) {
    if (!spans.length) return [];
    const sorted = spans.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const prev = merged[merged.length - 1];
      if (current[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], current[1]);
      } else {
        merged.push(current.slice());
      }
    }
    return merged;
  }

  function removeSpans(text, spans) {
    const merged = mergeSpans(spans);
    let result = '';
    let lastIndex = 0;
    for (const [start, end] of merged) {
      result += text.slice(lastIndex, start) + ' ';
      lastIndex = end;
    }
    result += text.slice(lastIndex);
    return result;
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

    if (timeResult?.rolloverDay) {
      dateResult.date = addDays(dateResult.date, timeResult.rolloverDay);
    }

    const spans = [];
    if (dateResult.span) spans.push(dateResult.span);
    if (timeResult?.span) spans.push(timeResult.span);
    if (reminderResult.span) spans.push(reminderResult.span);
    if (recurrenceResult.span) spans.push(recurrenceResult.span);

    let title = removeSpans(original, spans);
    title = title
      .replace(/提醒我|请提醒|提醒/g, ' ')
      .replace(/[，,。；;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) title = '新日程';

    const allDay = !timeResult;
    const startTime = timeResult ? timeResult.startTime : '';
    const endTime = timeResult ? timeResult.endTime : '';

    return {
      ok: true,
      original,
      title,
      date: dateKey(dateResult.date),
      allDay,
      startTime,
      endTime,
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
