const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  DEFAULT_CALENDAR_ID,
  normalizeEvent,
  normalizeEvents,
  normalizeCalendars,
  migrateData,
  validateBackup
} = require('../src/data-model');

const NOW = new Date('2026-07-29T08:00:00.000Z');

test('旧版数据自动迁移到当前结构且保留原日程', () => {
  const migrated = migrateData(
    {
      events: [
        {
          id: 'legacy-1',
          title: '旧日程',
          date: '2026-07-29',
          startTime: '09:00',
          endTime: '10:00',
          repeat: 'weekly',
          reminders: [10]
        }
      ],
      settings: { theme: 'dark' }
    },
    NOW
  );
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.events.length, 1);
  assert.equal(migrated.events[0].recurrence.frequency, 'weekly');
  assert.equal(migrated.events[0].calendarId, DEFAULT_CALENDAR_ID);
  assert.equal(migrated.settings.theme, 'dark');
  assert.equal(migrated.settings.showLunar, true);
  assert.equal(migrated.settings.showOfficialHolidays, true);
  assert.equal(migrated.settings.highlightWeekends, true);
  assert.ok(migrated.calendars.some((calendar) => calendar.id === DEFAULT_CALENDAR_ID));
});

test('日历规范化会去重并确保默认个人日历存在', () => {
  const calendars = normalizeCalendars(
    [
      { id: 'work', name: '工作', color: '#123456', visible: true },
      { id: 'work', name: '重复工作', color: '#ffffff' },
      { id: '', name: '无效' }
    ],
    NOW
  );
  assert.equal(calendars.filter((calendar) => calendar.id === 'work').length, 1);
  assert.ok(calendars.some((calendar) => calendar.id === DEFAULT_CALENDAR_ID));
});

test('日程规范化会清理非法值并保留多个提醒', () => {
  const event = normalizeEvent(
    {
      id: 'event-1',
      title: '  项目复盘  ',
      date: '2026-07-29',
      startTime: '25:99',
      endTime: '10:00',
      reminders: [30, '10', 30, -1, 'bad'],
      recurrence: { frequency: 'daily', interval: 0, until: 'bad-date' },
      color: 'red'
    },
    NOW
  );
  assert.equal(event.title, '项目复盘');
  assert.equal(event.startTime, '09:00');
  assert.deepEqual(event.reminders, [10, 30]);
  assert.deepEqual(event.recurrence, {
    frequency: 'daily',
    interval: 1,
    until: null,
    count: null
  });
  assert.equal(event.color, '#6750e8');
});

test('无效日程和重复 ID 不会进入存储', () => {
  const events = normalizeEvents(
    [
      { id: 'same', title: '有效', date: '2026-07-29' },
      { id: 'same', title: '重复', date: '2026-07-30' },
      { id: 'invalid', title: '', date: '2026-07-29' },
      { id: 'bad-date', title: '坏日期', date: '2026-02-30' }
    ],
    NOW
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].title, '有效');
});

test('F05 导入备份数据校验验证有效与无效结构', () => {
  const invalidCases = [{}, null, [], 'text', { events: {} }];
  for (const input of invalidCases) {
    const result = validateBackup(input);
    assert.equal(result.ok, false, `Input should be invalid: ${JSON.stringify(input)}`);
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
  }

  const validEmptyEvents = validateBackup({ events: [] });
  assert.equal(validEmptyEvents.ok, true);

  const validLegacyStructure = validateBackup({
    events: [{ id: 'e1', title: '日程', date: '2026-10-12' }],
    settings: { theme: 'dark' }
  });
  assert.equal(validLegacyStructure.ok, true);
});
