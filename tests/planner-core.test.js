const test = require('node:test');
const assert = require('node:assert/strict');
const CalendarCore = require('../src/calendar-core');
const {
  shiftTimeRange,
  timeRangesOverlap,
  conflictsForCandidate,
  applyOccurrenceChange,
  applyOccurrenceDeletion
} = require('../src/planner-core');

test('时间段相交检测允许首尾相接但阻止重叠', () => {
  assert.equal(
    timeRangesOverlap(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '09:30', endTime: '10:30' }
    ),
    true
  );
  assert.equal(
    timeRangesOverlap(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' }
    ),
    false
  );
});

test('全天日程不参与时间冲突', () => {
  assert.equal(
    timeRangesOverlap(
      { allDay: true, startTime: '', endTime: '' },
      { startTime: '09:00', endTime: '10:00' }
    ),
    false
  );
});

test('冲突检测支持重复日程并排除自身', () => {
  const events = [
    {
      id: 'weekly',
      date: '2026-07-29',
      startTime: '10:00',
      endTime: '11:00',
      recurrence: { frequency: 'weekly', interval: 1 }
    }
  ];
  const candidate = {
    id: 'candidate',
    date: '2026-08-05',
    startTime: '10:30',
    endTime: '11:30'
  };
  assert.equal(conflictsForCandidate(candidate, events, candidate.date).length, 1);
  assert.equal(conflictsForCandidate(candidate, events, candidate.date, 'weekly').length, 0);
});

test('时间位移保留时长并限制在当天', () => {
  assert.deepEqual(shiftTimeRange('09:00', '10:30', 30), {
    startTime: '09:30',
    endTime: '11:00'
  });
  assert.deepEqual(shiftTimeRange('23:00', '23:45', 120), {
    startTime: '23:14',
    endTime: '23:59'
  });
});

test('仅修改本次会生成独立日程并在原系列增加例外', () => {
  const event = {
    id: 'series',
    title: '周会',
    date: '2026-07-29',
    recurrence: { frequency: 'weekly', interval: 1, until: null, count: null },
    exceptions: []
  };
  const result = applyOccurrenceChange(
    event,
    '2026-08-05',
    { title: '临时周会', startTime: '11:00' },
    'occurrence',
    () => 'detached',
    new Date('2026-07-29T08:00:00.000Z')
  );
  assert.deepEqual(result.original.exceptions, ['2026-08-05']);
  assert.equal(result.detached.id, 'detached');
  assert.equal(result.detached.date, '2026-08-05');
  assert.equal(result.detached.recurrence.frequency, 'none');
});

test('修改本次及以后会截断原系列并创建新系列', () => {
  const event = {
    id: 'series',
    title: '周会',
    date: '2026-07-29',
    recurrence: { frequency: 'weekly', interval: 1, until: null, count: null },
    exceptions: []
  };
  const result = applyOccurrenceChange(
    event,
    '2026-08-12',
    { startTime: '14:00', endTime: '15:00' },
    'future',
    () => 'future-series'
  );
  assert.equal(result.original.recurrence.until, '2026-08-11');
  assert.equal(result.detached.id, 'future-series');
  assert.equal(result.detached.date, '2026-08-12');
  assert.equal(result.detached.recurrence.frequency, 'weekly');
});

test('F11 future修改保留剩余次数与次数覆盖规则', () => {
  const baseEvent = {
    id: 'series-5',
    title: '每日计划',
    date: '2026-10-12',
    recurrence: { frequency: 'daily', interval: 1, until: null, count: 5 },
    repeat: 'daily',
    exceptions: []
  };

  // 1. changes 不含 recurrence：新系列 count 为 3，在 2026-10-16 发生，2026-10-17 不发生，原系列截止于 2026-10-13
  const res1 = applyOccurrenceChange(
    baseEvent,
    '2026-10-14',
    { title: '调整后计划' },
    'future',
    () => 'detached-1'
  );
  assert.equal(res1.detached.recurrence.count, 3);
  assert.equal(CalendarCore.occursOn(res1.detached, CalendarCore.parseDate('2026-10-16')), true);
  assert.equal(CalendarCore.occursOn(res1.detached, CalendarCore.parseDate('2026-10-17')), false);
  assert.equal(res1.original.recurrence.until, '2026-10-13');

  // 2. changes.recurrence 的 count 仍是 5（表单带出的原值）：新系列 count 为 3
  const res2 = applyOccurrenceChange(
    baseEvent,
    '2026-10-14',
    { recurrence: { frequency: 'daily', interval: 1, count: 5 } },
    'future',
    () => 'detached-2'
  );
  assert.equal(res2.detached.recurrence.count, 3);

  // 3. changes.recurrence.count 为 10：新系列 count 为 10
  const res3 = applyOccurrenceChange(
    baseEvent,
    '2026-10-14',
    { recurrence: { frequency: 'daily', interval: 1, count: 10 } },
    'future',
    () => 'detached-3'
  );
  assert.equal(res3.detached.recurrence.count, 10);

  // 4. changes.recurrence.count 为 null（显式清空次数）：新系列 count 为 null
  const res4 = applyOccurrenceChange(
    baseEvent,
    '2026-10-14',
    { recurrence: { frequency: 'daily', interval: 1, count: null } },
    'future',
    () => 'detached-4'
  );
  assert.equal(res4.detached.recurrence.count, null);

  // 5. 在 2026-10-12（第一次）上做 future 修改：detached 为 null，original 包含改动，重复规则不变
  const res5 = applyOccurrenceChange(
    baseEvent,
    '2026-10-12',
    { title: '首日修改' },
    'future',
    () => 'detached-5'
  );
  assert.equal(res5.detached, null);
  assert.equal(res5.original.title, '首日修改');
  assert.equal(res5.original.recurrence.count, 5);
  assert.equal(res5.original.recurrence.until, null);
});

test('F11 applyOccurrenceDeletion 纯函数处理四种情况并保持入参不变', () => {
  const recurringEvent = {
    id: 'rec-event',
    title: '例会',
    date: '2026-10-12',
    recurrence: { frequency: 'weekly', interval: 1, count: 4 },
    exceptions: []
  };

  const snapshot = structuredClone(recurringEvent);
  const now = new Date('2026-10-11T12:00:00Z');

  // 情况 1: 非重复日程或 scope 是 series
  const delSeries = applyOccurrenceDeletion(recurringEvent, '2026-10-19', 'series', now);
  assert.ok(delSeries.deletedAt);
  assert.equal(delSeries.updatedAt, now.toISOString());

  const nonRecEvent = { id: 'single', title: '单次', date: '2026-10-12', recurrence: { frequency: 'none' } };
  const delSingle = applyOccurrenceDeletion(nonRecEvent, '2026-10-12', 'occurrence', now);
  assert.ok(delSingle.deletedAt);

  // 情况 2: future 且是第一次发生 (2026-10-12) -> 等同于删除整个系列，带 deletedAt
  const delFutureFirst = applyOccurrenceDeletion(recurringEvent, '2026-10-12', 'future', now);
  assert.ok(delFutureFirst.deletedAt);

  // 情况 3: future 其他情况 -> until 设为前一天，count 设为 null
  const delFutureOther = applyOccurrenceDeletion(recurringEvent, '2026-10-19', 'future', now);
  assert.equal(delFutureOther.recurrence.until, '2026-10-18');
  assert.equal(delFutureOther.recurrence.count, null);
  assert.equal(delFutureOther.deletedAt, undefined);

  // 情况 4: 其余 (仅本次 occurrence) -> 把日期加入 exceptions
  const delOcc = applyOccurrenceDeletion(recurringEvent, '2026-10-19', 'occurrence', now);
  assert.deepEqual(delOcc.exceptions, ['2026-10-19']);
  assert.equal(delOcc.deletedAt, undefined);

  // 保证入参没有被修改
  assert.deepEqual(recurringEvent, snapshot);
});

test('移动整个重复系列时，已跳过的日期跟着平移', () => {
  const event = {
    id: 'daily',
    title: '晨会',
    date: '2026-10-12',
    recurrence: { frequency: 'daily', interval: 1, until: null, count: null },
    exceptions: ['2026-10-13']
  };
  const result = applyOccurrenceChange(event, '2026-10-12', { date: '2026-10-13' }, 'series', () => 'x');
  assert.equal(result.original.date, '2026-10-13');
  // 原来跳过的是第 2 次，系列延后一天后仍应跳过第 2 次
  assert.deepEqual(result.original.exceptions, ['2026-10-14']);
  assert.deepEqual(event.exceptions, ['2026-10-13'], '入参不应被修改');
});

test('移动本次及以后时，后半段已跳过的日期跟着平移，前半段不动', () => {
  const event = {
    id: 'daily',
    title: '晨会',
    date: '2026-10-12',
    recurrence: { frequency: 'daily', interval: 1, until: null, count: null },
    exceptions: ['2026-10-13', '2026-10-16']
  };
  const result = applyOccurrenceChange(event, '2026-10-15', { date: '2026-10-17' }, 'future', () => 'tail');
  assert.deepEqual(result.original.exceptions, ['2026-10-13']);
  assert.equal(result.detached.date, '2026-10-17');
  assert.deepEqual(result.detached.exceptions, ['2026-10-18']);
});

test('只改时间不改日期时，已跳过的日期保持不变', () => {
  const event = {
    id: 'daily',
    title: '晨会',
    date: '2026-10-12',
    recurrence: { frequency: 'daily', interval: 1, until: null, count: null },
    exceptions: ['2026-10-13']
  };
  const result = applyOccurrenceChange(event, '2026-10-12', { startTime: '10:00' }, 'series', () => 'x');
  assert.deepEqual(result.original.exceptions, ['2026-10-13']);
});
