const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HOLIDAY_SOURCE_2026,
  getDayInfo,
  getHolidaySchedule
} = require('../src/chinese-calendar');

test('普通日期返回农历、干支和生肖信息', () => {
  const info = getDayInfo('2026-07-29');
  assert.equal(info.lunarMonthText, '六月');
  assert.equal(info.lunarDayText, '十六');
  assert.equal(info.fullLunarText, '农历丙午年 六月十六');
  assert.equal(info.zodiac, '马');
  assert.equal(info.displayLabel, '十六');
});

test('春节、中秋等传统节日优先于普通农历日期', () => {
  const springFestival = getDayInfo('2026-02-17');
  assert.equal(springFestival.traditionalFestival, '春节');
  assert.equal(springFestival.displayLabel, '春节');
  assert.equal(springFestival.lunarMonthText, '正月');
  assert.equal(springFestival.lunarDayText, '初一');

  const midAutumn = getDayInfo('2026-09-25');
  assert.equal(midAutumn.traditionalFestival, '中秋节');
  assert.equal(midAutumn.lunarMonthText, '八月');
  assert.equal(midAutumn.lunarDayText, '十五');
});

test('二十四节气能够识别清明并显示为清明节', () => {
  const info = getDayInfo('2026-04-05');
  assert.equal(info.solarTerm, '清明');
  assert.equal(info.festival, '清明节');
  assert.equal(info.displayLabel, '清明节');
});

test('2026年法定假日按国务院通知标记休息日', () => {
  const newYear = getDayInfo('2026-01-01');
  assert.equal(newYear.holiday.type, 'holiday');
  assert.equal(newYear.holiday.badge, '休');
  assert.equal(newYear.holiday.name, '元旦');
  assert.equal(newYear.holiday.total, 3);

  const springHoliday = getDayInfo('2026-02-23');
  assert.equal(springHoliday.holiday.type, 'holiday');
  assert.equal(springHoliday.holiday.index, 9);
  assert.equal(springHoliday.holiday.total, 9);
});

test('周末调休工作日标记为班且不再视为休息日', () => {
  for (const date of [
    '2026-01-04',
    '2026-02-14',
    '2026-02-28',
    '2026-05-09',
    '2026-09-20',
    '2026-10-10'
  ]) {
    const info = getDayInfo(date);
    assert.equal(info.isWeekend, true, date);
    assert.equal(info.isWorkdayOverride, true, date);
    assert.equal(info.isRestDay, false, date);
    assert.equal(info.holiday.badge, '班', date);
    assert.doesNotMatch(info.holiday.name, /调休/, date);
    assert.equal(info.displayLabel, info.lunarText, date);
  }
});

test('年度休班数据保留官方来源和发文字号', () => {
  const schedule = getHolidaySchedule(2026);
  assert.equal(schedule.documentNumber, '国办发明电〔2025〕7号');
  assert.equal(schedule.source, HOLIDAY_SOURCE_2026);
  assert.equal(getHolidaySchedule(2027), null);
});
