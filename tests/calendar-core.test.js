const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dateKey,
  isDateKey,
  parseDate,
  daysBetween,
  normalizeRecurrence,
  occursOn,
  remindersDue,
  reminderToken,
  legacyReminderToken,
  unsentReminders
} = require('../src/calendar-core');

test('日期键使用本地年月日并可往返解析', () => {
  const value = new Date(2026, 6, 29, 23, 45);
  assert.equal(dateKey(value), '2026-07-29');
  assert.equal(isDateKey('2026-07-29'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  const parsed = parseDate('2026-07-29');
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 6);
  assert.equal(parsed.getDate(), 29);
});

test('日期差按自然日计算，不受夏令时小时数影响', () => {
  assert.equal(daysBetween(parseDate('2026-03-01'), parseDate('2026-03-08')), 7);
});

test('兼容旧版 repeat 字段并规范化为重复规则', () => {
  assert.deepEqual(normalizeRecurrence({ repeat: 'weekly' }), {
    frequency: 'weekly',
    interval: 1,
    until: null,
    count: null
  });
});

test('单次日程只在指定日期出现', () => {
  const event = { date: '2026-07-29', repeat: 'none' };
  assert.equal(occursOn(event, parseDate('2026-07-29')), true);
  assert.equal(occursOn(event, parseDate('2026-07-30')), false);
  assert.equal(occursOn(event, parseDate('2026-07-28')), false);
});

test('每两周日程按十四天周期重复', () => {
  const event = {
    date: '2026-07-29',
    recurrence: { frequency: 'weekly', interval: 2 }
  };
  assert.equal(occursOn(event, parseDate('2026-08-05')), false);
  assert.equal(occursOn(event, parseDate('2026-08-12')), true);
});

test('工作日重复跳过周末', () => {
  const event = {
    date: '2026-07-29',
    recurrence: { frequency: 'weekdays', interval: 1 }
  };
  assert.equal(occursOn(event, parseDate('2026-07-31')), true);
  assert.equal(occursOn(event, parseDate('2026-08-01')), false);
  assert.equal(occursOn(event, parseDate('2026-08-03')), true);
});

test('每月日程保持相同日期且不会溢出到短月份', () => {
  const event = { date: '2026-01-31', repeat: 'monthly' };
  assert.equal(occursOn(event, parseDate('2026-03-31')), true);
  assert.equal(occursOn(event, parseDate('2026-02-28')), false);
});

test('每年日程保持相同月日', () => {
  const event = { date: '2024-07-29', repeat: 'yearly' };
  assert.equal(occursOn(event, parseDate('2026-07-29')), true);
  assert.equal(occursOn(event, parseDate('2026-07-30')), false);
});

test('重复规则支持截止日期、次数和单次例外', () => {
  const event = {
    date: '2026-07-01',
    recurrence: { frequency: 'weekly', interval: 1, until: '2026-07-31', count: 3 },
    exceptions: ['2026-07-08']
  };
  assert.equal(occursOn(event, parseDate('2026-07-01')), true);
  assert.equal(occursOn(event, parseDate('2026-07-08')), false);
  assert.equal(occursOn(event, parseDate('2026-07-15')), true);
  assert.equal(occursOn(event, parseDate('2026-07-22')), false);
  assert.equal(occursOn(event, parseDate('2026-08-05')), false);
});

test('提醒计算支持同一日程多个提醒并生成稳定去重标识', () => {
  const event = {
    id: 'event-1',
    title: '评审',
    date: '2026-07-29',
    allDay: false,
    startTime: '10:00',
    reminders: [0, 30],
    recurrence: { frequency: 'none', interval: 1 }
  };
  const due = remindersDue([event], new Date(2026, 6, 29, 9, 30, 30), {
    maxAgeMs: 65000
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].minutes, 30);
  assert.equal(due[0].token, 'event-1|2026-07-29|30|10:00');
});

test('遗漏提醒可跨午夜扫描，已完成日程不会触发', () => {
  const event = {
    id: 'event-2',
    title: '日报',
    date: '2026-07-28',
    allDay: false,
    startTime: '23:55',
    reminders: [0],
    recurrence: { frequency: 'none', interval: 1 }
  };
  const now = new Date(2026, 6, 29, 0, 5);
  assert.equal(remindersDue([event], now, { maxAgeMs: 15 * 60000 }).length, 1);
  assert.equal(remindersDue([{ ...event, completed: true }], now, { maxAgeMs: 15 * 60000 }).length, 0);
});

test('F07 工作日重复按自然日计算且不受当天时刻影响', () => {
  const event = {
    date: '2026-10-12',
    startTime: '09:00',
    reminders: [10],
    recurrence: { frequency: 'weekdays', interval: 1 }
  };

  // 1. 对 2026-10-12 的 00:00、08:00、12:00、23:59 四个时刻，occursOn 都返回 true
  const times = [
    new Date(2026, 9, 12, 0, 0, 0),
    new Date(2026, 9, 12, 8, 0, 0),
    new Date(2026, 9, 12, 12, 0, 0),
    new Date(2026, 9, 12, 23, 59, 59)
  ];
  for (const t of times) {
    assert.equal(occursOn(event, t), true, `occursOn 应在时刻 ${t.toTimeString()} 返回 true`);
  }

  // 2. remindersDue([event], new Date(2026, 9, 12, 8, 50, 30)) 返回 1 条
  const due = remindersDue([event], new Date(2026, 9, 12, 8, 50, 30));
  assert.equal(due.length, 1);

  // 3. 加上 count: 3 后，2026-10-14 08:00 返回 true，2026-10-15 08:00 和 15:00 返回 false
  const eventWithCount = {
    ...event,
    recurrence: { frequency: 'weekdays', interval: 1, count: 3 }
  };
  assert.equal(occursOn(eventWithCount, new Date(2026, 9, 14, 8, 0, 0)), true);
  assert.equal(occursOn(eventWithCount, new Date(2026, 9, 15, 8, 0, 0)), false);
  assert.equal(occursOn(eventWithCount, new Date(2026, 9, 15, 15, 0, 0)), false);

  // 4. 对六种频率各取一个日程，断言 occursOn 在同一天的 00:00 和 23:59 结果一致
  const frequencies = [
    { frequency: 'none', interval: 1 },
    { frequency: 'daily', interval: 1 },
    { frequency: 'weekdays', interval: 1 },
    { frequency: 'weekly', interval: 1 },
    { frequency: 'monthly', interval: 1 },
    { frequency: 'yearly', interval: 1 }
  ];
  const testDateDay = new Date(2026, 9, 12, 0, 0, 0);
  const testDateNight = new Date(2026, 9, 12, 23, 59, 59);
  for (const rec of frequencies) {
    const e = { date: '2026-10-12', recurrence: rec };
    assert.equal(
      occursOn(e, testDateDay),
      occursOn(e, testDateNight),
      `频率 ${rec.frequency} 在 00:00 与 23:59 结果应一致`
    );
  }
});

test('F09 提醒去重按触发时刻识别并通过 unsentReminders 过滤', () => {
  // 1. 全天日程，提醒时间 09:00，reminders: [0]。09:00 取到 1 条，把它的 token 放进已发送集合；将提醒时间改为 10:00 后，在 10:00 再查，取到 1 条。
  const allDayEvent = {
    id: 'allday-1',
    title: '全天活动',
    date: '2026-10-12',
    allDay: true,
    allDayReminderTime: '09:00',
    reminders: [0],
    recurrence: { frequency: 'none', interval: 1 }
  };
  const sentTokens = new Set();
  const due9am = unsentReminders([allDayEvent], sentTokens, new Date(2026, 9, 12, 9, 0, 30));
  assert.equal(due9am.length, 1);
  assert.equal(due9am[0].token, 'allday-1|2026-10-12|0|09:00');
  assert.equal(due9am[0].legacyToken, 'allday-1|2026-10-12|0');
  sentTokens.add(due9am[0].token);

  // 改为 10:00 提醒
  const modifiedAllDayEvent = {
    ...allDayEvent,
    allDayReminderTime: '10:00'
  };
  const due10am = unsentReminders([modifiedAllDayEvent], sentTokens, new Date(2026, 9, 12, 10, 0, 30));
  assert.equal(due10am.length, 1);
  assert.equal(due10am[0].token, 'allday-1|2026-10-12|0|10:00');

  // 2. 每天重复的日程，今天的提醒已发送。给它加上明天的例外日期后立即再查，取到 0 条。
  const dailyEvent = {
    id: 'daily-1',
    title: '每日站会',
    date: '2026-10-12',
    allDay: false,
    startTime: '09:30',
    reminders: [10],
    recurrence: { frequency: 'daily', interval: 1 }
  };
  const dailySentTokens = new Set();
  const dailyDue = unsentReminders([dailyEvent], dailySentTokens, new Date(2026, 9, 12, 9, 20, 30));
  assert.equal(dailyDue.length, 1);
  dailySentTokens.add(dailyDue[0].token);

  const dailyWithException = {
    ...dailyEvent,
    exceptions: ['2026-10-13']
  };
  const dailyDueAfterException = unsentReminders(
    [dailyWithException],
    dailySentTokens,
    new Date(2026, 9, 12, 9, 20, 30)
  );
  assert.equal(dailyDueAfterException.length, 0);

  // 3. 已发送集合里只有旧格式标识时，同一条提醒取到 0 条。
  const legacySentTokens = new Set([legacyReminderToken('allday-1', '2026-10-12', 0)]);
  const legacyDue = unsentReminders([allDayEvent], legacySentTokens, new Date(2026, 9, 12, 9, 0, 30));
  assert.equal(legacyDue.length, 0);

  // 4. 日程原有 reminders: [10] 且已发送，改成 [10, 30] 后在同一时刻再查，10 分钟那一档不会再出现。
  const multiEvent = {
    id: 'multi-1',
    title: '项目讨论',
    date: '2026-10-12',
    allDay: false,
    startTime: '10:00',
    reminders: [10],
    recurrence: { frequency: 'none', interval: 1 }
  };
  const multiSentTokens = new Set();
  const multiDueFirst = unsentReminders([multiEvent], multiSentTokens, new Date(2026, 9, 12, 9, 50, 30), {
    maxAgeMs: 35 * 60000
  });
  assert.equal(multiDueFirst.length, 1);
  assert.equal(multiDueFirst[0].minutes, 10);
  multiSentTokens.add(multiDueFirst[0].token);

  const multiEventUpdated = {
    ...multiEvent,
    reminders: [10, 30]
  };
  const multiDueSecond = unsentReminders(
    [multiEventUpdated],
    multiSentTokens,
    new Date(2026, 9, 12, 9, 50, 30),
    { maxAgeMs: 35 * 60000 }
  );
  assert.equal(multiDueSecond.length, 1);
  assert.equal(multiDueSecond[0].minutes, 30);
});
