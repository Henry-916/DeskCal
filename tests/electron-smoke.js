const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

async function run() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      await wait(50);

      const initial = {
        brandIconLoaded:
          document.querySelector('.brand-mark')?.complete &&
          document.querySelector('.brand-mark')?.naturalWidth > 0,
        dayCells: document.querySelectorAll('.day-cell').length,
        weekLabels: document.querySelectorAll('#weekHeader span').length,
        weekendHeaders: document.querySelectorAll('#weekHeader .weekend').length,
        weekendCells: document.querySelectorAll('.day-cell.weekend').length,
        lunarLabels: [...document.querySelectorAll('.chinese-day-label')].filter(
          (element) => element.textContent.trim()
        ).length,
        lunarMeta: document.querySelector('#selectedLunarMeta')?.textContent,
        chineseSettingToggles: document.querySelectorAll(
          '#lunarToggle, #traditionalFestivalToggle, #solarTermToggle, #officialHolidayToggle, #holidayBadgeToggle, #weekendHighlightToggle'
        ).length,
        calendarChips: document.querySelectorAll('#calendarStrip .calendar-chip').length,
        emptyState: document.querySelector('.empty-state strong')?.textContent
      };

      document.querySelector('#addEventButton').click();
      const dialog = document.querySelector('#eventDialog');
      const dialogWasOpened = dialog.open;
      const title = document.querySelector('#eventTitle');
      const location = document.querySelector('#eventLocation');
      const repeat = document.querySelector('#eventRepeat');
      const interval = document.querySelector('#eventRepeatInterval');
      const until = document.querySelector('#eventRepeatUntil');
      const reminders = [...document.querySelectorAll('#eventReminderOptions input')];
      const eventCalendarOptions = document.querySelectorAll('#eventCalendar option').length;

      title.value = 'Electron 冒烟测试';
      location.value = '测试会议室';
      repeat.value = 'weekly';
      repeat.dispatchEvent(new Event('change', { bubbles: true }));
      interval.value = '2';
      until.value = '2026-12-31';
      reminders.forEach((input) => {
        input.checked = input.value === '10' || input.value === '30';
      });

      document.querySelector('#eventForm').requestSubmit();
      await wait(100);

      const agendaItemsAfterCreate = document.querySelectorAll('.agenda-item').length;
      const agendaTextAfterCreate = document.querySelector('#agendaList').textContent;
      document.querySelector('.agenda-item').click();
      await wait(30);
      const quickEditOpened = document.querySelector('#quickEditDialog').open;
      document.querySelector('#quickEditDialog').close();

      document.querySelector('#searchInput').value = 'Electron';
      document.querySelector('#searchInput').dispatchEvent(new Event('input', { bubbles: true }));
      await wait(30);
      const searchResultCount = document.querySelectorAll('.agenda-item').length;

      document.querySelector('#calendarViewControl [data-view="week"]').click();
      await wait(30);
      const weekViewCells = document.querySelectorAll('.day-cell').length;
      const weekViewIsActive = document.querySelector('#calendarGrid').classList.contains('week-view');

      const dragPreview = document.querySelector('[data-drag-event-id]');
      const dragSourceDate = dragPreview?.dataset.occurrenceDate;
      const dragTarget = [...document.querySelectorAll('.day-cell.week-cell')].find(
        (cell) => cell.dataset.date > dragSourceDate
      );
      let recurrenceScopeOpened = false;
      let dragMovedOccurrence = false;
      if (dragPreview && dragTarget) {
        const transfer = new DataTransfer();
        dragPreview.dispatchEvent(
          new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer })
        );
        const rect = dragTarget.getBoundingClientRect();
        dragTarget.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientY: rect.top + 130
          })
        );
        await wait(30);
        recurrenceScopeOpened = document.querySelector('#recurrenceScopeDialog').open;
        document.querySelector('[data-scope="occurrence"]')?.click();
        await wait(100);
        dragMovedOccurrence = Boolean(
          document.querySelector(
            \`[data-occurrence-date="\${dragTarget.dataset.date}"][data-drag-event-id]\`
          )
        );
      }

      document.querySelector('#calendarViewControl [data-view="month"]').click();
      await wait(30);
      const restoredMonthCells = document.querySelectorAll('.day-cell').length;

      document.querySelector('#quickAddButton').click();
      const quickAddDialog = document.querySelector('#quickAddDialog');
      const quickInput = document.querySelector('#quickAddInput');
      quickInput.value = '\\u660e\\u5929\\u4e0b\\u53483\\u70b9\\u5f00\\u9879\\u76ee\\u4f1a\\uff0c\\u63d0\\u524d30\\u5206\\u949f\\u63d0\\u9192';
      quickInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(30);
      const quickPreview = document.querySelector('#quickAddPreview').textContent;
      quickAddDialog.close();

      return {
        ...initial,
        dialogOpened: dialogWasOpened,
        recurrenceFieldsVisible:
          !document.querySelector('#repeatIntervalField').classList.contains('hidden'),
        agendaItems: agendaItemsAfterCreate,
        agendaText: agendaTextAfterCreate,
        eventCalendarOptions,
        quickEditOpened,
        searchResultCount,
        weekViewCells,
        weekViewIsActive,
        recurrenceScopeOpened,
        dragMovedOccurrence,
        restoredMonthCells,
        quickPreview,
        runtimeError: window.__deskcalSmokeError || null
      };
    })()
  `);

  assert.equal(result.dayCells, 42, '月视图应渲染 42 个日期格');
  assert.equal(result.weekLabels, 7, '周标题应渲染 7 天');
  assert.equal(result.weekendHeaders, 2, '周六周日标题应突出显示');
  assert.ok(result.weekendCells >= 12, '月视图应突出周末日期格');
  assert.equal(result.lunarLabels, 42, '每个日期格都应显示农历或节日');
  assert.match(result.lunarMeta, /^农历/);
  assert.equal(result.chineseSettingToggles, 6, '中国日历设置项应完整渲染');
  assert.equal(result.emptyState, '今天留有余白');
  assert.equal(result.dialogOpened, true, '新建日程弹窗应打开');
  assert.equal(result.recurrenceFieldsVisible, true, '选择重复后应展示详细规则');
  assert.equal(result.agendaItems, 1, '保存后应渲染一条日程');
  assert.match(result.agendaText, /Electron 冒烟测试/);
  assert.match(result.agendaText, /测试会议室/);

  assert.equal(result.brandIconLoaded, true, 'brand icon asset should load');
  assert.equal(result.calendarChips, 1, 'default calendar filter should be rendered');
  assert.equal(result.eventCalendarOptions, 1, 'event form should expose the default calendar');
  assert.equal(result.quickEditOpened, true, 'clicking an agenda item should open quick edit');
  assert.equal(result.searchResultCount, 1, 'search should find the newly created event');
  assert.equal(result.weekViewCells, 7, 'week view should render seven day cells');
  assert.equal(result.weekViewIsActive, true, 'week view should expose its active layout');
  assert.equal(result.recurrenceScopeOpened, true, 'dragging a recurring event should ask for scope');
  assert.equal(result.dragMovedOccurrence, true, 'week drag should move the selected occurrence');
  assert.equal(result.restoredMonthCells, 42, 'month view should restore the 42-cell grid');
  assert.match(result.quickPreview, /15:00/, 'quick input should preview the parsed time');
  assert.match(result.quickPreview, /30/, 'quick input should preview the reminder');
  assert.equal(result.runtimeError, null, 'renderer should not report runtime errors');

  console.log('Electron renderer smoke test passed:', JSON.stringify(result));
  window.destroy();
}

app.whenReady().then(async () => {
  try {
    await run();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
