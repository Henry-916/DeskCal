(function exposeChineseCalendar(root, factory) {
  const lunarLibrary =
    typeof module !== 'undefined' && module.exports ? require('lunar-javascript') : root;
  const api = factory(lunarLibrary);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DeskCalChineseCalendar = api;
})(typeof window !== 'undefined' ? window : globalThis, function createChineseCalendar(library) {
  const { Solar } = library;
  if (!Solar) throw new Error('Chinese calendar runtime is unavailable');

  const HOLIDAY_SOURCE_2026 =
    'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm';

  const TRADITIONAL_FESTIVALS = {
    '1-1': '春节',
    '1-15': '元宵节',
    '2-2': '龙抬头',
    '5-5': '端午节',
    '7-7': '七夕节',
    '7-15': '中元节',
    '8-15': '中秋节',
    '9-9': '重阳节',
    '10-15': '下元节',
    '12-8': '腊八节',
    '12-23': '小年'
  };

  const SOLAR_FESTIVALS = {
    '01-01': '元旦',
    '05-01': '劳动节',
    '10-01': '国庆节'
  };

  const COMMEMORATIVE_DAYS = {
    '03-08': '妇女节',
    '03-12': '植树节',
    '05-04': '青年节',
    '06-01': '儿童节',
    '07-01': '建党节',
    '08-01': '建军节',
    '09-10': '教师节',
    '12-13': '国家公祭日'
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function keyOf(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function addDaysToSchedule(schedule, start, end, details) {
    const cursor = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    let index = 0;
    const total = Math.round((last - cursor) / 86400000) + 1;
    while (cursor <= last) {
      const key = keyOf(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      schedule[key] = {
        ...details,
        date: key,
        index: index + 1,
        total,
        isStart: index === 0,
        isEnd: index === total - 1
      };
      cursor.setDate(cursor.getDate() + 1);
      index += 1;
    }
  }

  function create2026Schedule() {
    const days = {};
    const holiday = (start, end, name) =>
      addDaysToSchedule(days, start, end, { type: 'holiday', badge: '休', name });
    const workday = (date, name) =>
      addDaysToSchedule(days, date, date, { type: 'workday', badge: '班', name });

    holiday('2026-01-01', '2026-01-03', '元旦');
    workday('2026-01-04', '元旦');
    holiday('2026-02-15', '2026-02-23', '春节');
    workday('2026-02-14', '春节');
    workday('2026-02-28', '春节');
    holiday('2026-04-04', '2026-04-06', '清明节');
    holiday('2026-05-01', '2026-05-05', '劳动节');
    workday('2026-05-09', '劳动节');
    holiday('2026-06-19', '2026-06-21', '端午节');
    holiday('2026-09-25', '2026-09-27', '中秋节');
    holiday('2026-10-01', '2026-10-07', '国庆节');
    workday('2026-09-20', '国庆节');
    workday('2026-10-10', '国庆节');

    return {
      year: 2026,
      publishedAt: '2025-11-04',
      source: HOLIDAY_SOURCE_2026,
      documentNumber: '国办发明电〔2025〕7号',
      days
    };
  }

  const HOLIDAY_SCHEDULES = {
    2026: create2026Schedule()
  };
  const dayInfoCache = new Map();

  function lunarMonthName(lunar) {
    return `${lunar.getMonthInChinese()}月`;
  }

  function isLunarNewYearsEve(lunar) {
    const tomorrow = lunar.next(1);
    return tomorrow.getMonth() === 1 && tomorrow.getDay() === 1;
  }

  function getTraditionalFestival(lunar) {
    if (isLunarNewYearsEve(lunar)) return '除夕';
    if (lunar.getMonth() < 0) return '';
    return TRADITIONAL_FESTIVALS[`${lunar.getMonth()}-${lunar.getDay()}`] || '';
  }

  function getDayInfo(input) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid calendar date');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const key = keyOf(year, month, day);
    if (dayInfoCache.has(key)) return dayInfoCache.get(key);

    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();
    const monthDayKey = `${pad(month)}-${pad(day)}`;
    const lunarMonth = lunarMonthName(lunar);
    const lunarDay = lunar.getDayInChinese();
    const traditionalFestival = getTraditionalFestival(lunar);
    const solarFestival = SOLAR_FESTIVALS[monthDayKey] || '';
    const commemorativeDay = COMMEMORATIVE_DAYS[monthDayKey] || '';
    const solarTerm = lunar.getJieQi() || '';
    const schedule = HOLIDAY_SCHEDULES[year] || null;
    const holiday = schedule?.days[key] || null;
    const festival = traditionalFestival || solarFestival || (solarTerm === '清明' ? '清明节' : '');
    const displayLabel =
      festival ||
      (holiday?.type === 'holiday' && holiday.isStart ? `${holiday.name}假期` : '') ||
      solarTerm ||
      (lunar.getDay() === 1 ? lunarMonth : lunarDay);
    const labelType =
      festival || (holiday?.type === 'holiday' && holiday.isStart)
        ? 'festival'
        : solarTerm
          ? 'solar-term'
          : 'lunar';
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    const info = Object.freeze({
      dateKey: key,
      year,
      month,
      day,
      weekday: date.getDay(),
      isWeekend,
      isRestDay: holiday?.type === 'holiday' || (isWeekend && holiday?.type !== 'workday'),
      isWorkdayOverride: holiday?.type === 'workday',
      lunarYear: lunar.getYear(),
      lunarMonth: Math.abs(lunar.getMonth()),
      lunarDay: lunar.getDay(),
      isLeapMonth: lunar.getMonth() < 0,
      lunarMonthText: lunarMonth,
      lunarDayText: lunarDay,
      lunarText: lunar.getDay() === 1 ? lunarMonth : lunarDay,
      fullLunarText: `农历${lunar.getYearInGanZhi()}年 ${lunarMonth}${lunarDay}`,
      zodiac: lunar.getYearShengXiao(),
      traditionalFestival,
      solarFestival,
      commemorativeDay,
      festival,
      solarTerm,
      holiday,
      holidaySchedule: schedule
        ? {
            year: schedule.year,
            publishedAt: schedule.publishedAt,
            source: schedule.source,
            documentNumber: schedule.documentNumber
          }
        : null,
      displayLabel,
      labelType
    });
    dayInfoCache.set(key, info);
    return info;
  }

  function getHolidaySchedule(year) {
    return HOLIDAY_SCHEDULES[Number(year)] || null;
  }

  function clearCache() {
    dayInfoCache.clear();
  }

  return {
    HOLIDAY_SOURCE_2026,
    TRADITIONAL_FESTIVALS,
    SOLAR_FESTIVALS,
    COMMEMORATIVE_DAYS,
    getDayInfo,
    getHolidaySchedule,
    clearCache
  };
});
