const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shiftTimeRange,
  timeRangesOverlap,
  conflictsForCandidate,
  applyOccurrenceChange
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
