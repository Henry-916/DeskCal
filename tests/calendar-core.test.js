const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dateKey,
  isDateKey,
  parseDate,
  daysBetween,
  normalizeRecurrence,
  occursOn,
  remindersDue
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
  assert.equal(due[0].token, 'event-1|2026-07-29|30');
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
