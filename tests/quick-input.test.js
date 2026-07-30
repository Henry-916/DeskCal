const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuickInput, formatQuickPreview } = require('../src/quick-input');

const NOW = new Date(2026, 6, 29, 9, 0);

test('解析明天下午时间和分钟提醒', () => {
  const value = parseQuickInput('明天下午3点开项目会，提前30分钟提醒', NOW);
  assert.equal(value.ok, true);
  assert.equal(value.title, '开项目会');
  assert.equal(value.date, '2026-07-30');
  assert.equal(value.startTime, '15:00');
  assert.equal(value.endTime, '16:00');
  assert.deepEqual(value.reminders, [30]);
});

test('解析每周日程和半点时间', () => {
  const value = parseQuickInput('每周周一上午10点半团队例会', NOW);
  assert.equal(value.title, '团队例会');
  assert.equal(value.date, '2026-08-03');
  assert.equal(value.startTime, '10:30');
  assert.equal(value.recurrence.frequency, 'weekly');
});

test('解析工作日全天日程和不提醒', () => {
  const value = parseQuickInput('每个工作日写日报 不提醒', NOW);
  assert.equal(value.title, '写日报');
  assert.equal(value.date, '2026-07-29');
  assert.equal(value.allDay, true);
  assert.deepEqual(value.reminders, []);
  assert.equal(value.recurrence.frequency, 'weekdays');
});

test('解析绝对日期、24小时制和分类', () => {
  const value = parseQuickInput('8月3日 15:30 复习考试', NOW);
  assert.equal(value.date, '2026-08-03');
  assert.equal(value.startTime, '15:30');
  assert.equal(value.category, 'study');
});

test('下周日期落在紧接着的自然周', () => {
  const value = parseQuickInput('下周一上午9点交周报', NOW);
  assert.equal(value.date, '2026-08-03');
});

test('空输入返回可读错误', () => {
  assert.deepEqual(parseQuickInput('  ', NOW), { ok: false, error: '请输入日程内容' });
});

test('生成快速确认摘要', () => {
  const value = parseQuickInput('后天上午9点体检 提前1小时', NOW);
  assert.equal(
    formatQuickPreview(value),
    '2026-07-31 · 09:00–10:00 · 提前1小时'
  );
});
