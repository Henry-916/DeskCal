const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const DesktopPin = require('../src/desktop-pin');
const Updater = require('../src/updater');

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
      const weekCardText = document.querySelector('[data-drag-event-id]')?.textContent || '';
      const smallestText = Math.min(
        ...[...document.querySelectorAll('.app-shell *')]
          .filter(
            (element) =>
              element.offsetParent &&
              [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())
          )
          .map((element) => parseFloat(getComputedStyle(element).fontSize))
      );

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

      const opacityRange = document.querySelector('#opacityRange');
      opacityRange.value = '0';
      opacityRange.dispatchEvent(new Event('input', { bubbles: true }));
      const clearestSheetAlpha = getComputedStyle(document.documentElement).getPropertyValue('--sheet-alpha').trim();

      // 页面内确认框：点“确定”应返回 true
      const askPromise = askConfirm('冒烟测试确认');
      await wait(20);
      const askOpened = document.querySelector('#askDialog').open;
      document.querySelector('#askConfirmButton').click();
      const askConfirmed = await askPromise;
      const askClosed = !document.querySelector('#askDialog').open;

      const updateStatusText = document.querySelector('#updateStatus').textContent;
      const updateActionDisabled = document.querySelector('#updateActionButton').disabled;
      const dialogsExcludedFromDrag = [...document.querySelectorAll('dialog')].every(
        (dialog) => getComputedStyle(dialog).webkitAppRegion === 'no-drag'
      );

      document.querySelector('#agendaToggle').click();
      await wait(50);
      const agendaCollapsed =
        document.querySelector('.workspace').classList.contains('agenda-collapsed') &&
        document.querySelector('.agenda-panel').offsetWidth === 0;
      document.querySelector('#agendaToggle').click();
      await wait(50);
      const agendaRestored = document.querySelector('.agenda-panel').offsetWidth >= 240;

      return {
        ...initial,
        dialogOpened: dialogWasOpened,
        recurrenceFieldsVisible:
          !document.querySelector('#repeatIntervalField').classList.contains('hidden'),
        agendaItems: agendaItemsAfterCreate,
        agendaText: agendaTextAfterCreate,
        quickEditOpened,
        searchResultCount,
        weekViewCells,
        weekViewIsActive,
        weekCardText,
        smallestText,
        recurrenceScopeOpened,
        dragMovedOccurrence,
        restoredMonthCells,
        quickPreview,
        clearestSheetAlpha,
        askOpened,
        askConfirmed,
        askClosed,
        updateStatusText,
        updateActionDisabled,
        dialogsExcludedFromDrag,
        agendaCollapsed,
        agendaRestored,
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
  assert.equal(result.quickEditOpened, true, 'clicking an agenda item should open quick edit');
  assert.equal(result.searchResultCount, 1, 'search should find the newly created event');
  assert.equal(result.weekViewCells, 7, 'week view should render seven day cells');
  assert.equal(result.weekViewIsActive, true, 'week view should expose its active layout');
  assert.match(result.weekCardText, /Electron 冒烟测试/, '周历的日程块应直接写出标题');
  assert.ok(result.smallestText >= 12, `界面文字不应小于 12px，实际最小 ${result.smallestText}px`);
  assert.equal(result.recurrenceScopeOpened, true, 'dragging a recurring event should ask for scope');
  assert.equal(result.dragMovedOccurrence, true, 'week drag should move the selected occurrence');
  assert.equal(result.restoredMonthCells, 42, 'month view should restore the 42-cell grid');
  assert.match(result.quickPreview, /15:00/, 'quick input should preview the parsed time');
  assert.match(result.quickPreview, /30/, 'quick input should preview the reminder');
  assert.equal(result.clearestSheetAlpha, '0', '背景不透明度应能调到完全透明');
  assert.equal(result.askOpened, true, '确认应使用页面内的对话框');
  assert.equal(result.askConfirmed, true, '点确定后确认框应返回 true');
  assert.equal(result.askClosed, true, '确认后对话框应关闭');
  assert.match(result.updateStatusText, /开发模式下不检查更新/, '未打包时设置页应说明不检查更新');
  assert.equal(result.updateActionDisabled, true, '未打包时检查更新按钮应不可用');
  assert.equal(
    result.dialogsExcludedFromDrag,
    true,
    '弹窗必须声明不可拖动，否则盖在拖动区域上的按钮点不动'
  );
  assert.equal(result.agendaCollapsed, true, '收起按钮应隐藏日程栏并让日历占满宽度');
  assert.equal(result.agendaRestored, true, '再次点击应恢复日程栏');
  assert.equal(result.runtimeError, null, 'renderer should not report runtime errors');

  console.log('Electron renderer smoke test passed:', JSON.stringify(result));

  // 日程颜色：全新加载页面，没选过颜色的日程跟随日历，选过的用自己的颜色
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const colorResult = await window.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);
      const create = async (title, color) => {
        openEventDialog(null, state.selectedDate);
        document.querySelector('#eventTitle').value = title;
        document.querySelector('#eventAllDay').checked = true;
        document.querySelector('#eventAllDay').dispatchEvent(new Event('change', { bubbles: true }));
        if (color) {
          document.querySelector('#eventColor').value = color;
          document.querySelector('#eventColor').dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.querySelector('#eventForm').requestSubmit();
        await wait(100);
        return state.events.find((item) => item.title === title);
      };
      const plain = await create('跟随日历的日程', null);
      const colored = await create('自定义颜色日程', '#ff0000');
      return {
        calendarColor: state.calendars[0].color,
        plainColor: plain ? eventColor(plain) : null,
        customColor: colored ? eventColor(colored) : null,
        shownWithCustomColor: [...document.querySelectorAll('.day-chip, .agenda-item')].some(
          (element) => element.style.getPropertyValue('--event-color') === '#ff0000'
        )
      };
    })()
  `);

  assert.equal(colorResult.plainColor, colorResult.calendarColor, '没选过颜色的日程应使用默认颜色');
  assert.equal(colorResult.customColor, '#ff0000', '选过颜色的日程应使用自己的颜色');
  assert.equal(colorResult.shownWithCustomColor, true, '界面上应显示日程自己的颜色');

  console.log('Event color smoke test passed:', JSON.stringify(colorResult));

  // 弹窗交互：全新加载页面，弹窗开着时快捷键不能清空表单，提示条要显示在弹窗之上
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const dialogResult = await window.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);
      const pressCtrlN = () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));

      pressCtrlN();
      await wait(20);
      const shortcutOpensForm = document.querySelector('#eventDialog').open;

      document.querySelector('#eventTitle').value = '填到一半的日程';
      const pendingAsk = askConfirm('等待确认');
      await wait(20);
      pressCtrlN();
      const titleKeptDuringAsk = document.querySelector('#eventTitle').value;
      showToast('弹窗之上的提示');
      const toastOnTopLayer = document.querySelector('#toastRegion').matches(':popover-open');
      settleAsk(false);
      const askAnswer = await pendingAsk;

      // 连续提交两次只应新增一条日程
      document.querySelector('#eventTitle').value = '连点两次保存';
      document.querySelector('#eventAllDay').checked = true;
      document.querySelector('#eventAllDay').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#eventForm').requestSubmit();
      document.querySelector('#eventForm').requestSubmit();
      await wait(120);
      const doubleSubmitCount = state.events.filter((item) => item.title === '连点两次保存').length;

      // 两条带“撤销”的提示条先后出现时，只保留最新的那个按钮
      showToast('第一笔操作', 'DeskCal', { label: '撤销', handler: () => {} });
      showToast('第二笔操作', 'DeskCal', { label: '撤销', handler: () => {} });
      const undoButtons = document.querySelectorAll('#toastRegion .toast-action').length;

      return {
        shortcutOpensForm,
        titleKeptDuringAsk,
        toastOnTopLayer,
        askAnswer,
        doubleSubmitCount,
        undoButtons
      };
    })()
  `);

  assert.equal(dialogResult.shortcutOpensForm, true, '没有弹窗时 Ctrl+N 应打开新建日程');
  assert.equal(
    dialogResult.titleKeptDuringAsk,
    '填到一半的日程',
    '弹窗开着时按 Ctrl+N 不应清空正在填写的表单'
  );
  assert.equal(dialogResult.toastOnTopLayer, true, '弹窗开着时提示条应放进顶层，显示在弹窗之上');
  assert.equal(dialogResult.askAnswer, false, '取消确认框应返回 false');
  assert.equal(dialogResult.doubleSubmitCount, 1, '连续提交两次只应新增一条日程');
  assert.equal(dialogResult.undoButtons, 1, '只有最近一次操作的“撤销”按钮应保留');

  console.log('Dialog interaction smoke test passed:', JSON.stringify(dialogResult));

  // F06 阶段验收：全新加载页面并在干净状态下验证撤销失效行为
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const f06Result = await window.webContents.executeJavaScript(`
    (async () => {
      window.askConfirm = async () => true;
      window.askText = async () => '测试日历';
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
      window.askConfirm = async () => true;
      window.askText = async () => '测试日历';
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

  // F16 阶段验收：全新加载页面并在干净状态下验证预设外提醒值保留与表单重置
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const f16Result = await window.webContents.executeJavaScript(`
    (async () => {
      window.askConfirm = async () => true;
      window.askText = async () => '测试日历';
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);

      // 用例 1：快速录入「明天下午3点开会 提前2小时」并提交，再提交日程表单；保存下来的日程 reminders 等于 [120]
      openQuickAdd();
      $('#quickAddInput').value = '明天下午3点开会 提前2小时';
      $('#quickAddInput').dispatchEvent(new Event('input', { bubbles: true }));
      await wait(20);

      // 提交快速录入（会打开 eventDialog）
      $('#quickAddForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await wait(20);

      // 提交日程表单
      $('#eventForm').requestSubmit();
      await wait(50);

      const quickAddedEvent = state.events.find((e) => e.title === '开会');
      const scenario1Reminders = quickAddedEvent?.reminders;

      // 用例 2：打开一条 reminders 为 [15, 120] 的现有日程，不做修改直接保存；reminders 仍为 [15, 120]
      const customEvent = {
        id: 'f16-custom-reminders',
        title: 'F16 自定义提醒日程',
        date: state.selectedDate,
        allDay: true,
        startTime: '',
        endTime: '',
        allDayReminderTime: '09:00',
        reminders: [15, 120],
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
      state.events.push(customEvent);
      render();

      openEventDialog(customEvent.id, customEvent.date);
      await wait(20);

      // 不做修改直接保存
      $('#eventForm').requestSubmit();
      await wait(50);

      const savedCustomEvent = state.events.find((e) => e.id === customEvent.id);
      const scenario2Reminders = savedCustomEvent?.reminders;

      // 用例 3：之后新建一条日程，表单里不出现上一次追加的 15 和 120 选项
      openEventDialog(null, state.selectedDate);
      await wait(20);

      const dynamicOptions = [...document.querySelectorAll('#eventReminderOptions [data-custom-reminder]')];
      const allOptionValues = [...document.querySelectorAll('#eventReminderOptions input')].map((i) => Number(i.value));
      const has15Or120 = allOptionValues.includes(15) || allOptionValues.includes(120);

      $('#eventDialog').close();

      return {
        scenario1Reminders,
        scenario2Reminders,
        scenario3DynamicCount: dynamicOptions.length,
        scenario3Has15Or120: has15Or120
      };
    })()
  `);

  assert.deepEqual(f16Result.scenario1Reminders, [120], '快速录入提前2小时保存后的 reminders 应为 [120]');
  assert.deepEqual(f16Result.scenario2Reminders, [15, 120], '已有 [15, 120] 提醒的日程保存后仍应为 [15, 120]');
  assert.equal(f16Result.scenario3DynamicCount, 0, '新建日程时动态选项应被移除');
  assert.equal(f16Result.scenario3Has15Or120, false, '新建日程表单里不应出现 15 和 120 选项');

  console.log('F16 regression smoke test passed:', JSON.stringify(f16Result));

  // F18 阶段验收：全新加载页面并在干净状态下验证标记完成跳过时间冲突确认
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const f18Result = await window.webContents.executeJavaScript(`
    (async () => {
      let confirmCallCount = 0;
      window.askConfirm = async () => {
        confirmCallCount += 1;
        return true;
      };
      window.askText = async () => '测试日历';
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);

      const today = state.selectedDate;

      // 准备两条同一天时间重叠的日程
      const eventA = {
        id: 'f18-event-a',
        title: 'F18 重叠日程 A',
        date: today,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00',
        allDayReminderTime: '09:00',
        reminders: [10],
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

      const eventB = {
        id: 'f18-event-b',
        title: 'F18 重叠日程 B',
        date: today,
        allDay: false,
        startTime: '10:30',
        endTime: '11:30',
        allDayReminderTime: '09:00',
        reminders: [10],
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

      state.events = [eventA, eventB];
      render();

      state.quickEditingId = eventA.id;
      state.quickEditingDate = eventA.date;

      // 对其中一条执行 quickEditAction('complete')
      await quickEditAction('complete');

      const updatedA = state.events.find((e) => e.id === eventA.id);

      return {
        confirmCallCount,
        completedIsTrue: updatedA?.completed === true
      };
    })()
  `);

  assert.equal(f18Result.confirmCallCount, 0, '标记完成时确认函数调用次数应为 0');
  assert.equal(f18Result.completedIsTrue, true, '标记完成后日程 completed 应变为 true');

  console.log('F18 regression smoke test passed:', JSON.stringify(f18Result));

  // R5 阶段验收：全新加载页面并在干净状态下验证已完成重复系列恢复待办（列表与搜索）
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const r5Result = await window.webContents.executeJavaScript(`
    (async () => {
      window.askConfirm = async () => true;
      window.askText = async () => '测试日历';
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(50);

      const today = state.selectedDate;

      const createCompletedSeries = (id) => ({
        id,
        title: 'R5 已完成重复日程',
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
        completed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 场景 1：在列表视图中点击已完成的重复系列 ✓，恢复整个系列
      state.searchQuery = '';
      state.events = [createCompletedSeries('r5-list-series')];
      render();

      const listBtn = document.querySelector('.agenda-item[data-id="r5-list-series"] .complete-button');
      listBtn?.click();
      await wait(50);

      const seriesAfterList = state.events.find((e) => e.id === 'r5-list-series');
      const scenario1 = {
        completedIsFalse: seriesAfterList?.completed === false,
        exceptionsEmpty: (seriesAfterList?.exceptions || []).length === 0,
        eventsCount: state.events.length
      };

      // 场景 2：独立重置干净的已完成日程，在搜索结果中点击 ✓，恢复整个系列且不打开快速编辑卡
      state.events = [createCompletedSeries('r5-search-series')];
      state.searchQuery = '已完成';
      render();

      const searchBtn = document.querySelector('.agenda-item[data-id="r5-search-series"] .complete-button');
      searchBtn?.click();
      await wait(50);

      const quickEditOpened = Boolean(document.querySelector('#quickEditDialog')?.open);
      document.querySelector('#quickEditDialog')?.close();
      const seriesAfterSearch = state.events.find((e) => e.id === 'r5-search-series');
      const scenario2 = {
        quickEditOpened,
        completedIsFalse: seriesAfterSearch?.completed === false,
        exceptionsEmpty: (seriesAfterSearch?.exceptions || []).length === 0,
        eventsCount: state.events.length
      };

      return { scenario1, scenario2 };
    })()
  `);

  console.log('R5 diagnostic output:', JSON.stringify(r5Result));

  // 场景 1 断言
  assert.equal(r5Result.scenario1.completedIsFalse, true, '场景1：列表中原系列的 completed 应恢复为 false');
  assert.equal(r5Result.scenario1.exceptionsEmpty, true, '场景1：列表中原系列的 exceptions 应为空');
  assert.equal(r5Result.scenario1.eventsCount, 1, '场景1：列表中点击后 state.events 仍应只有 1 条日程');

  // 场景 2 断言
  assert.equal(r5Result.scenario2.quickEditOpened, false, '场景2：搜索结果中点击不应打开快速编辑卡');
  assert.equal(r5Result.scenario2.completedIsFalse, true, '场景2：搜索结果中原系列的 completed 应恢复为 false');
  assert.equal(r5Result.scenario2.exceptionsEmpty, true, '场景2：搜索结果中原系列的 exceptions 应为空');
  assert.equal(r5Result.scenario2.eventsCount, 1, '场景2：搜索结果中点击后 state.events 仍应只有 1 条日程');

  console.log('R5 regression smoke test passed:', JSON.stringify(r5Result));

  // 桌面组件模式：系统接口可以加载，启用和停用不会抛错
  if (process.platform === 'win32') {
    const pin = DesktopPin.create(window);
    assert.ok(pin, '桌面嵌入模块应能在 Windows 上加载');
    pin.enable();
    assert.equal(pin.enabled, true, '启用后应处于桌面组件状态');
    pin.disable();
    assert.equal(pin.enabled, false, '停用后应退出桌面组件状态');
    console.log('Desktop pin smoke test passed');
  }

  // 应用内更新：未打包时不发起检查，也不抛错
  assert.equal(Updater.status().state, 'idle', '更新模块初始状态应为空闲');
  Updater.check('manual');
  assert.equal(Updater.status().state, 'unsupported', '未打包时不应发起更新检查');
  console.log('Updater smoke test passed');
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
