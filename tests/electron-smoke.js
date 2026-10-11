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
      const untilDate = new Date();
      untilDate.setDate(untilDate.getDate() + 90);
      const pad = (value) => String(value).padStart(2, '0');
      until.value = \`\${untilDate.getFullYear()}-\${pad(untilDate.getMonth() + 1)}-\${pad(untilDate.getDate())}\`;
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
        (cell) => cell.dataset.date !== dragSourceDate
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

  // F06 阶段验收：全新加载页面并在干净状态下验证撤销失效行为
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const f06Result = await window.webContents.executeJavaScript(`
    (async () => {
      window.confirm = () => true;
      window.prompt = () => '测试日历';
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);

      // 准备初始日程
      const initialEvent = {
        id: 'f06-move-event',
        title: 'F06 待移动日程',
        date: state.selectedDate,
        allDay: true,
        startTime: '',
        endTime: '',
        allDayReminderTime: '09:00',
        reminders: [],
        recurrence: { frequency: 'none', interval: 1, until: null, count: null },
        repeat: 'none',
        exceptions: [],
        calendarId: 'personal',
        category: 'work',
        color: '#6750e8',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.events = [initialEvent];
      render();

      // 移动一条日程产生快照
      const sourceDate = initialEvent.date;
      const targetDate = DeskCalCore.dateKey(DeskCalCore.addDays(DeskCalCore.parseDate(sourceDate), 1));
      await moveOccurrence(initialEvent.id, sourceDate, targetDate);

      const hadSnapshotAfterMove = Boolean(state.undoSnapshot);

      // 接着新增一条日程
      const newEvent = {
        id: 'f06-new-event',
        title: 'F06 后续新增日程',
        date: sourceDate,
        allDay: true,
        startTime: '',
        endTime: '',
        allDayReminderTime: '09:00',
        reminders: [],
        recurrence: { frequency: 'none', interval: 1, until: null, count: null },
        repeat: 'none',
        exceptions: [],
        calendarId: 'personal',
        category: 'work',
        color: '#6750e8',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.events.push(newEvent);
      await saveEvents('新增日程');

      // 再调用 undoLastChange()
      await undoLastChange();

      const newEventStillExists = state.events.some((e) => e.id === 'f06-new-event');
      const movedEvent = state.events.find((e) => e.id === 'f06-move-event');
      const movedEventRemainsMoved = movedEvent?.date === targetDate;

      return {
        hadSnapshotAfterMove,
        newEventStillExists,
        movedEventRemainsMoved
      };
    })()
  `);

  assert.equal(f06Result.hadSnapshotAfterMove, true, '移动日程后应产生撤销快照');
  assert.equal(f06Result.newEventStillExists, true, '新增的日程仍然存在');
  assert.equal(f06Result.movedEventRemainsMoved, true, '被移动的日程保持移动后的状态');

  console.log('F06 regression smoke test passed:', JSON.stringify(f06Result));

  // F08 阶段验收：全新加载页面并在干净状态下验证重复日程完成当次、搜索行为及单次日程
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const f08Result = await window.webContents.executeJavaScript(`
    (async () => {
      window.confirm = () => true;
      window.prompt = () => '测试日历';
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);

      const today = state.selectedDate;

      // 1. 准备一条从今天开始每天重复的日程
      const dailySeries = {
        id: 'f08-daily-series',
        title: 'F08 每日重复日程',
        date: today,
        allDay: true,
        startTime: '',
        endTime: '',
        allDayReminderTime: '09:00',
        reminders: [],
        recurrence: { frequency: 'daily', interval: 1, until: null, count: null },
        repeat: 'daily',
        exceptions: [],
        calendarId: 'personal',
        category: 'work',
        color: '#6750e8',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.events = [dailySeries];
      render();

      // 在今天的列表里点它的 ✓
      const completeBtn = document.querySelector(\`.agenda-item[data-id="\${dailySeries.id}"] .complete-button\`);
      completeBtn?.click();
      await wait(100);

      const seriesAfterComplete = state.events.find((e) => e.id === dailySeries.id);
      const detachedEvent = state.events.find((e) => e.id !== dailySeries.id);

      const seriesCompletedIsFalse = seriesAfterComplete?.completed === false;
      const exceptionsIncludeToday = Array.isArray(seriesAfterComplete?.exceptions) && seriesAfterComplete.exceptions.includes(today);
      const detachedCompletedIsTrue = detachedEvent?.completed === true;
      const detachedIsSingle = detachedEvent?.recurrence?.frequency === 'none';
      const detachedDateIsToday = detachedEvent?.date === today;

      // 验证撤销功能 (undo action)
      const hadUndoSnapshot = Boolean(state.undoSnapshot);
      await undoLastChange();
      const seriesAfterUndo = state.events.find((e) => e.id === dailySeries.id);
      const undoRestored = state.events.length === 1 && (seriesAfterUndo?.exceptions || []).length === 0;

      // 2. 搜索结果里的重复日程：点 ✓ 应打开快速编辑卡，而不是直接完成系列
      state.events = [structuredClone(dailySeries)];
      state.searchQuery = '每日';
      render();
      const searchItemBtn = document.querySelector(\`.agenda-item[data-id="\${dailySeries.id}"] .complete-button\`);
      searchItemBtn?.click();
      await wait(50);
      const quickEditOpenedFromSearch = Boolean(document.querySelector('#quickEditDialog')?.open);
      document.querySelector('#quickEditDialog')?.close();
      const seriesStillNotCompletedInSearch = state.events.find((e) => e.id === dailySeries.id)?.completed === false;

      // 3. 非重复日程：行为不变（直接翻转 completed）
      state.searchQuery = '';
      const nonrecEvent = {
        id: 'f08-nonrec',
        title: 'F08 单次日程',
        date: today,
        allDay: true,
        startTime: '',
        endTime: '',
        allDayReminderTime: '09:00',
        reminders: [],
        recurrence: { frequency: 'none', interval: 1, until: null, count: null },
        repeat: 'none',
        exceptions: [],
        calendarId: 'personal',
        category: 'work',
        color: '#6750e8',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.events = [nonrecEvent];
      render();
      const nonrecBtn = document.querySelector(\`.agenda-item[data-id="\${nonrecEvent.id}"] .complete-button\`);
      nonrecBtn?.click();
      await wait(50);
      const nonrecCompletedFlipped = state.events.find((e) => e.id === nonrecEvent.id)?.completed === true;

      return {
        seriesCompletedIsFalse,
        exceptionsIncludeToday,
        detachedCompletedIsTrue,
        detachedIsSingle,
        detachedDateIsToday,
        hadUndoSnapshot,
        undoRestored,
        quickEditOpenedFromSearch,
        seriesStillNotCompletedInSearch,
        nonrecCompletedFlipped
      };
    })()
  `);

  assert.equal(f08Result.seriesCompletedIsFalse, true, '原系列的 completed 仍为 false');
  assert.equal(f08Result.exceptionsIncludeToday, true, '原系列的 exceptions 应包含今天');
  assert.equal(f08Result.detachedCompletedIsTrue, true, '独立出来的当次日程 completed 应为 true');
  assert.equal(f08Result.detachedIsSingle, true, '独立出来的当次日程应为单次不重复日程');
  assert.equal(f08Result.detachedDateIsToday, true, '独立出来的当次日程日期应为今天');
  assert.equal(f08Result.hadUndoSnapshot, true, '完成当次操作前应生成撤销快照');
  assert.equal(f08Result.undoRestored, true, '撤销后应恢复原系列并移除分离日程');
  assert.equal(f08Result.quickEditOpenedFromSearch, true, '搜索模式下点击重复日程 ✓ 应打开快速编辑卡');
  assert.equal(f08Result.seriesStillNotCompletedInSearch, true, '搜索模式下点击重复日程 ✓ 不得直接修改系列 completed');
  assert.equal(f08Result.nonrecCompletedFlipped, true, '非重复日程点击 ✓ 应正常翻转完成状态');

  console.log('F08 regression smoke test passed:', JSON.stringify(f08Result));
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
