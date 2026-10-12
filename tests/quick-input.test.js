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

function assertQuickCase(input, expected, now = SUN_OCT11) {
  const res = parseQuickInput(input, now);
  assert.equal(res.ok, true, `解析应成功: ${input}`);
  if (expected.date) {
    assert.equal(res.date, expected.date, `${input} 日期不匹配`);
  } else {
    assert.equal(res.date, '2026-10-11', `${input} 默认日期应为 2026-10-11`);
  }
  if (expected.allDay) {
    assert.equal(res.allDay, true, `${input} 应为全天日程`);
    assert.equal(res.startTime, '', `${input} 全天开始时间应为空`);
    assert.equal(res.endTime, '', `${input} 全天结束时间应为空`);
  } else {
    assert.equal(res.allDay, false, `${input} 应为定时日程`);
    assert.equal(res.startTime, expected.startTime, `${input} 开始时间不匹配`);
    assert.equal(res.endTime, expected.endTime, `${input} 结束时间不匹配`);
  }
  assert.equal(res.title, expected.title, `${input} 标题不匹配`);
}

test('R2 单个中文数字必须带「分」才算分钟（验收表 10 条）', () => {
  // 1. 明天下午3点一起吃饭
  assertQuickCase('明天下午3点一起吃饭', { date: '2026-10-12', startTime: '15:00', endTime: '16:00', title: '一起吃饭' });
  // 7. 下午三点五分出发
  assertQuickCase('下午三点五分出发', { startTime: '15:05', endTime: '16:05', title: '出发' });
  // 8. 下午三点十分开会
  assertQuickCase('下午三点十分开会', { startTime: '15:10', endTime: '16:10', title: '开会' });
  // 9. 下午三点二十出发
  assertQuickCase('下午三点二十出发', { startTime: '15:20', endTime: '16:20', title: '出发' });
  // 10. 上午九点四十五分晨会
  assertQuickCase('上午九点四十五分晨会', { startTime: '09:45', endTime: '10:45', title: '晨会' });
  // 11. 下午三点零五出发
  assertQuickCase('下午三点零五出发', { startTime: '15:05', endTime: '16:05', title: '出发' });
  // 12. 下午3点零五分出发
  assertQuickCase('下午3点零五分出发', { startTime: '15:05', endTime: '16:05', title: '出发' });
  // 13. 下午3点15开会
  assertQuickCase('下午3点15开会', { startTime: '15:15', endTime: '16:15', title: '开会' });
  // 14. 下午3点15分开会
  assertQuickCase('下午3点15分开会', { startTime: '15:15', endTime: '16:15', title: '开会' });
  // 15. 下午三点半到五点一起评审
  assertQuickCase('下午三点半到五点一起评审', { startTime: '15:30', endTime: '17:00', title: '一起评审' });
});

test('R3 中文数字小时必须带时段词（验收表 17 条）', () => {
  // 2. 下午3点一对一沟通
  assertQuickCase('下午3点一对一沟通', { startTime: '15:00', endTime: '16:00', title: '一对一沟通' });
  // 3. 下午三点一对一沟通
  assertQuickCase('下午三点一对一沟通', { startTime: '15:00', endTime: '16:00', title: '一对一沟通' });
  // 4. 明天上午10点三方会议
  assertQuickCase('明天上午10点三方会议', { date: '2026-10-12', startTime: '10:00', endTime: '11:00', title: '三方会议' });
  // 5. 晚上8点两个人看电影
  assertQuickCase('晚上8点两个人看电影', { startTime: '20:00', endTime: '21:00', title: '两个人看电影' });
  // 6. 晚上九点一起跑步
  assertQuickCase('晚上九点一起跑步', { startTime: '21:00', endTime: '22:00', title: '一起跑步' });
  // 16. 讨论一点小事
  assertQuickCase('讨论一点小事', { allDay: true, title: '讨论一点小事' });
  // 17. 提两点建议
  assertQuickCase('提两点建议', { allDay: true, title: '提两点建议' });
  // 18. 整理三点结论
  assertQuickCase('整理三点结论', { allDay: true, title: '整理三点结论' });
  // 19. 明天早一点去公司
  assertQuickCase('明天早一点去公司', { allDay: true, date: '2026-10-12', title: '早一点去公司' });
  // 20. 一点点进步
  assertQuickCase('一点点进步', { allDay: true, title: '一点点进步' });
  // 21. 明天十点开会
  assertQuickCase('明天十点开会', { allDay: true, date: '2026-10-12', title: '十点开会' });
  // 22. 明天一点半午休
  assertQuickCase('明天一点半午休', { allDay: true, date: '2026-10-12', title: '一点半午休' });
  // 23. 明天上午讨论三点建议
  assertQuickCase('明天上午讨论三点建议', { allDay: true, date: '2026-10-12', title: '上午讨论三点建议' });
  // 24. 明天下午三点开会
  assertQuickCase('明天下午三点开会', { date: '2026-10-12', startTime: '15:00', endTime: '16:00', title: '开会' });
  // 25. 下午一点一刻出发
  assertQuickCase('下午一点一刻出发', { startTime: '13:15', endTime: '14:15', title: '出发' });
  // 26. 下午三点到五点评审
  assertQuickCase('下午三点到五点评审', { startTime: '15:00', endTime: '17:00', title: '评审' });
  // 27. 3点开会
  assertQuickCase('3点开会', { startTime: '03:00', endTime: '04:00', title: '开会' });
});

test('R4 时段词对冒号写法生效及时间段（验收表 11 条）', () => {
  // 28. 下午3:30开会
  assertQuickCase('下午3:30开会', { startTime: '15:30', endTime: '16:30', title: '开会' });
  // 29. 晚上8:30看电影
  assertQuickCase('晚上8:30看电影', { startTime: '20:30', endTime: '21:30', title: '看电影' });
  // 30. 明天上午9:30站会
  assertQuickCase('明天上午9:30站会', { date: '2026-10-12', startTime: '09:30', endTime: '10:30', title: '站会' });
  // 31. 明天 下午 3:30 开会
  assertQuickCase('明天 下午 3:30 开会', { date: '2026-10-12', startTime: '15:30', endTime: '16:30', title: '开会' });
  // 32. 下午3:00-5:00 评审
  assertQuickCase('下午3:00-5:00 评审', { startTime: '15:00', endTime: '17:00', title: '评审' });
  // 33. 上午10:00到下午2:00 培训
  assertQuickCase('上午10:00到下午2:00 培训', { startTime: '10:00', endTime: '14:00', title: '培训' });
  // 34. 晚上12:30对账
  assertQuickCase('晚上12:30对账', { date: '2026-10-12', startTime: '00:30', endTime: '01:30', title: '对账' });
  // 35. 15:30 面试
  assertQuickCase('15:30 面试', { startTime: '15:30', endTime: '16:30', title: '面试' });
  // 36. 明天 15:30 面试
  assertQuickCase('明天 15:30 面试', { date: '2026-10-12', startTime: '15:30', endTime: '16:30', title: '面试' });
  // 37. 15:00-17:00 评审
  assertQuickCase('15:00-17:00 评审', { startTime: '15:00', endTime: '17:00', title: '评审' });
  // 38. 11:00-01:00 会议
  assertQuickCase('11:00-01:00 会议', { startTime: '11:00', endTime: '13:00', title: '会议' });
});

test('R8 中文分钟后面紧跟以数字开头的标题时不吞字', () => {
  assertQuickCase('下午3点零五一起吃饭', { startTime: '15:05', endTime: '16:05', title: '一起吃饭' });
  assertQuickCase('下午三点十五一起吃饭', { startTime: '15:15', endTime: '16:15', title: '一起吃饭' });
  assertQuickCase('下午三点四十五一对一沟通', { startTime: '15:45', endTime: '16:45', title: '一对一沟通' });
  assertQuickCase('晚上8点二十两个人看电影', { startTime: '20:20', endTime: '21:20', title: '两个人看电影' });
});

test('R9 超过五十九的中文数字不算分钟', () => {
  assertQuickCase('下午三点六十分开会', { startTime: '15:00', endTime: '16:00', title: '六十分开会' });
  assertQuickCase('下午三点九十分钟讲座', { startTime: '15:00', endTime: '16:00', title: '九十分钟讲座' });
});

test('R9 各种写法组合出的时间都是合法的 HH:MM，且结束晚于开始', () => {
  const periods = ['', '上午', '下午', '晚上'];
  const hours = ['3', '12', '三', '十二'];
  const minutes = ['', '半', '一刻', '15', '五分', '十五', '零五', '六十分', '九十'];
  const endings = ['', '到5点', '到五点半', '-17:00'];
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const period of periods) {
    for (const hour of hours) {
      for (const minute of minutes) {
        for (const ending of endings) {
          const input = `${period}${hour}点${minute}${ending}开会`;
          const parsed = parseQuickInput(input, SUN_OCT11);
          if (parsed.allDay) continue;
          assert.match(parsed.startTime, valid, `${input} 开始时间不合法`);
          assert.match(parsed.endTime, valid, `${input} 结束时间不合法`);
          assert.ok(parsed.endTime > parsed.startTime, `${input} 结束时间应晚于开始时间`);
        }
      }
    }
  }
});

test('R10 冒号写法的时间优先于标题里的「N点」', () => {
  assertQuickCase('明天 15:30 讨论3点建议', {
    date: '2026-10-12',
    startTime: '15:30',
    endTime: '16:30',
    title: '讨论3点建议'
  });
  assertQuickCase('14:00 评审5点问题', { startTime: '14:00', endTime: '15:00', title: '评审5点问题' });
});

test('R10 时间段两端可以混用冒号写法和「点」写法', () => {
  assertQuickCase('下午3点到5:30评审', { startTime: '15:00', endTime: '17:30', title: '评审' });
  assertQuickCase('下午3:30到5点评审', { startTime: '15:30', endTime: '17:00', title: '评审' });
});

test('提醒超过 7 天时直接报错，而不是保存后被悄悄丢掉', () => {
  const tooEarly = parseQuickInput('明天下午3点开会，提前8天提醒', NOW);
  assert.equal(tooEarly.ok, false);
  assert.match(tooEarly.error, /7 天/);

  const allowed = parseQuickInput('明天下午3点开会，提前7天提醒', NOW);
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.reminders, [10080]);
});
