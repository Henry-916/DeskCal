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

const WED_OCT7 = new Date(2026, 9, 7, 10, 0); // 2026-10-07 (Wed)
const SUN_OCT11 = new Date(2026, 9, 11, 10, 0); // 2026-10-11 (Sun)

test('F13 正确识别「下周X」「本周X」及其变体', () => {
  // 下周五上午9点开会 (参考时间 2026-10-07)
  const r1 = parseQuickInput('下周五上午9点开会', WED_OCT7);
  assert.equal(r1.date, '2026-10-16');
  assert.equal(r1.startTime, '09:00');
  assert.equal(r1.endTime, '10:00');
  assert.equal(r1.title, '开会');

  // 下星期五上午9点开会
  const r2 = parseQuickInput('下星期五上午9点开会', WED_OCT7);
  assert.equal(r2.date, '2026-10-16');
  assert.equal(r2.title, '开会');

  // 下周星期五上午9点开会
  const r3 = parseQuickInput('下周星期五上午9点开会', WED_OCT7);
  assert.equal(r3.date, '2026-10-16');
  assert.equal(r3.title, '开会');

  // 下周周五上午9点开会
  const r3b = parseQuickInput('下周周五上午9点开会', WED_OCT7);
  assert.equal(r3b.date, '2026-10-16');
  assert.equal(r3b.title, '开会');

  // 本周一上午9点开会
  const r4 = parseQuickInput('本周一上午9点开会', WED_OCT7);
  assert.equal(r4.date, '2026-10-05');
  assert.equal(r4.title, '开会');

  // 这周一上午9点开会
  const r5 = parseQuickInput('这周一上午9点开会', WED_OCT7);
  assert.equal(r5.date, '2026-10-05');
  assert.equal(r5.title, '开会');

  // 周五上午9点开会
  const r6 = parseQuickInput('周五上午9点开会', WED_OCT7);
  assert.equal(r6.date, '2026-10-09');
  assert.equal(r6.title, '开会');
});

test('F14 重复词和星期重叠时标题不被截坏', () => {
  const r1 = parseQuickInput('每周三下午3点例会', SUN_OCT11);
  assert.equal(r1.date, '2026-10-14');
  assert.equal(r1.startTime, '15:00');
  assert.equal(r1.endTime, '16:00');
  assert.equal(r1.recurrence.frequency, 'weekly');
  assert.equal(r1.title, '例会');

  const r2 = parseQuickInput('每周五下午3点周会', SUN_OCT11);
  assert.equal(r2.date, '2026-10-16');
  assert.equal(r2.startTime, '15:00');
  assert.equal(r2.recurrence.frequency, 'weekly');
  assert.equal(r2.title, '周会');

  const r3 = parseQuickInput('每周例会', SUN_OCT11);
  assert.equal(r3.date, '2026-10-11');
  assert.equal(r3.allDay, true);
  assert.equal(r3.recurrence.frequency, 'weekly');
  assert.equal(r3.title, '例会');
});

test('F15 时间解析补全（午夜顺延、中文数字、时间段、大后天）', () => {
  // 晚上12点跨年
  const r1 = parseQuickInput('晚上12点跨年', SUN_OCT11);
  assert.equal(r1.date, '2026-10-12');
  assert.equal(r1.startTime, '00:00');
  assert.equal(r1.endTime, '01:00');
  assert.equal(r1.title, '跨年');

  // 明天晚上12点半复盘
  const r2 = parseQuickInput('明天晚上12点半复盘', SUN_OCT11);
  assert.equal(r2.date, '2026-10-13');
  assert.equal(r2.startTime, '00:30');
  assert.equal(r2.endTime, '01:30');
  assert.equal(r2.title, '复盘');

  // 中午12点吃饭
  const r3 = parseQuickInput('中午12点吃饭', SUN_OCT11);
  assert.equal(r3.date, '2026-10-11');
  assert.equal(r3.startTime, '12:00');
  assert.equal(r3.endTime, '13:00');
  assert.equal(r3.title, '吃饭');

  // 明天下午三点开会
  const r4 = parseQuickInput('明天下午三点开会', SUN_OCT11);
  assert.equal(r4.date, '2026-10-12');
  assert.equal(r4.startTime, '15:00');
  assert.equal(r4.endTime, '16:00');
  assert.equal(r4.title, '开会');

  // 下午两点半开会
  const r5 = parseQuickInput('下午两点半开会', SUN_OCT11);
  assert.equal(r5.startTime, '14:30');
  assert.equal(r5.endTime, '15:30');
  assert.equal(r5.title, '开会');

  // 晚上十一点半复盘 (23:30-23:59)
  const r6 = parseQuickInput('晚上十一点半复盘', SUN_OCT11);
  assert.equal(r6.startTime, '23:30');
  assert.equal(r6.endTime, '23:59');
  assert.equal(r6.title, '复盘');

  // 上午十点一刻站会
  const r7 = parseQuickInput('上午十点一刻站会', SUN_OCT11);
  assert.equal(r7.startTime, '10:15');
  assert.equal(r7.endTime, '11:15');
  assert.equal(r7.title, '站会');

  // 下午3点到5点评审
  const r8 = parseQuickInput('下午3点到5点评审', SUN_OCT11);
  assert.equal(r8.startTime, '15:00');
  assert.equal(r8.endTime, '17:00');
  assert.equal(r8.title, '评审');

  // 上午10点到下午2点培训
  const r9 = parseQuickInput('上午10点到下午2点培训', SUN_OCT11);
  assert.equal(r9.startTime, '10:00');
  assert.equal(r9.endTime, '14:00');
  assert.equal(r9.title, '培训');

  // 上午11点到1点午餐会
  const r10 = parseQuickInput('上午11点到1点午餐会', SUN_OCT11);
  assert.equal(r10.startTime, '11:00');
  assert.equal(r10.endTime, '13:00');
  assert.equal(r10.title, '午餐会');

  // 15:00-17:00 评审
  const r11 = parseQuickInput('15:00-17:00 评审', SUN_OCT11);
  assert.equal(r11.startTime, '15:00');
  assert.equal(r11.endTime, '17:00');
  assert.equal(r11.title, '评审');

  // 数字时间段跨午后重试与降级
  const rDigitalRetry = parseQuickInput('11:00-01:00 会议', SUN_OCT11);
  assert.equal(rDigitalRetry.startTime, '11:00');
  assert.equal(rDigitalRetry.endTime, '13:00');
  assert.equal(rDigitalRetry.title, '会议');

  const rDigitalFallback = parseQuickInput('15:00-02:00 研讨', SUN_OCT11);
  assert.equal(rDigitalFallback.startTime, '15:00');
  assert.equal(rDigitalFallback.endTime, '16:00');
  assert.equal(rDigitalFallback.title, '研讨');

  // 大后天交报告
  const r12 = parseQuickInput('大后天交报告', SUN_OCT11);
  assert.equal(r12.date, '2026-10-14');
  assert.equal(r12.allDay, true);
  assert.equal(r12.title, '交报告');

  // 后天交报告
  const r13 = parseQuickInput('后天交报告', SUN_OCT11);
  assert.equal(r13.date, '2026-10-13');
  assert.equal(r13.allDay, true);
  assert.equal(r13.title, '交报告');

  // 约束：不带时段词的「3点」按 03:00 处理
  const r14 = parseQuickInput('3点开会', SUN_OCT11);
  assert.equal(r14.startTime, '03:00');
});
