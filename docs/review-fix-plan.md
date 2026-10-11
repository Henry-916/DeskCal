# DeskCal 审查问题修复计划

- 基线：`main` 分支，提交 `1f26658`（0.5.0）
- 制定日期：2026-10-11
- 来源：对 0.5.0 做的两轮独立代码审查，合并去重后的结论
- 文中行号均以基线提交为准，改动后会偏移

## 1. 目标

修复审查确认的 20 项问题（F01 到 F20），外加 1 项前置修复（F00）。优先级依次是：不丢数据、提醒可靠、重复日程和快速录入结果正确。

F00 必须最先做：基线上的冒烟测试每逢周日必然失败，不先修好它，后面各阶段就没有可信的验证手段。

本次不改数据格式（`schemaVersion` 保持 2），不新增依赖，不做与这 21 项无关的重构。

## 2. 范围

### 2.1 包含

| 编号 | 问题 | 主要文件 |
|---|---|---|
| F00 | 冒烟测试的结果依赖运行当天的日期 | `tests/electron-smoke.js` |
| F01 | 数据写入不是原子的，`.bak` 每次写入都被覆盖 | `src/data-store.js`（新增）、`src/main.js` |
| F02 | 数据文件损坏时不从备份恢复，还会毁掉备份 | `src/data-store.js`、`src/main.js` |
| F03 | 窗口移动和缩放的每个事件都同步写盘 | `src/main.js` |
| F04 | 没有单实例锁 | `src/main.js` |
| F05 | 导入不校验文件，任意 JSON 都会清空现有数据 | `src/data-model.js`、`src/main.js`、`src/renderer/app.js` |
| F06 | 撤销会连带回滚快照之后的其他改动 | `src/renderer/app.js` |
| F07 | 「工作日重复」的结果受当天时刻影响，首日中午前不提醒 | `src/calendar-core.js` |
| F08 | 列表里的 ✓ 按钮把整个重复系列标记为完成 | `src/renderer/app.js` |
| F09 | 提醒去重有漏发和重发两种错误 | `src/calendar-core.js`、`src/main.js` |
| F10 | 点击通知打开的是系列首日；通知对象可能被回收 | `src/main.js`、`src/preload.js`、`src/renderer/app.js` |
| F11 | 「本次及以后」丢掉重复次数；在首次发生上操作留下无效记录 | `src/planner-core.js`、`src/renderer/app.js` |
| F12 | 月末和闰日的重复次数算错 | `src/calendar-core.js` |
| F13 | 「下周五」「本周一」识别错误 | `src/quick-input.js` |
| F14 | 「每周三…」的标题被截坏 | `src/quick-input.js` |
| F15 | 「晚上12点」、中文数字、时间段、「大后天」解析错误 | `src/quick-input.js` |
| F16 | 六个预设值之外的提醒在编辑表单里被丢弃 | `src/renderer/app.js` |
| F17 | 闰月显示成「闰闰X月」，闰月里重复显示节日 | `src/chinese-calendar.js` |
| F18 | 标记完成时弹出时间冲突确认 | `src/renderer/app.js` |
| F19 | `preload` 把原始 IPC 事件传给页面；页面没有 CSP | `src/preload.js`、`src/renderer/index.html` |
| F20 | 测试脚本清单、CI 和 README 跟进 | `package.json`、`.github/workflows/ci.yml`、`README.md` |

### 2.2 不包含

以下事项本次不做，不要顺手处理：

- 渲染性能优化（每次改动全量重渲染）
- 2027 年节假日数据
- 开发依赖的 `npm audit` 告警
- 让冒烟测试走真实的 `preload` 和主进程
- 按次记录完成状态的数据模型改造
- 版本号、打包配置、发布流程
- 不带时段词的「3点」按 03:00 处理，这是现有行为，保持不变

## 3. 全局约束

1. **不要运行 `npm start`、`npm run dev`、`npm run dist:win`。** 前两个会启动真实应用，读写 `%APPDATA%\deskcal` 下的真实用户数据并常驻托盘；最后一个耗时且本次不需要。`npm run smoke` 是安全的，它不加载 `src/main.js`，使用页面内的内存数据。
2. **测试不得触碰真实用户数据。** 涉及文件读写的测试一律在 `os.tmpdir()` 下用 `fs.mkdtempSync` 创建的临时目录里进行，并在结束时清理。
3. **不新增依赖**，不改 `package-lock.json`。
4. **不改数据格式。** 现有用户的 `deskcal-data.json` 必须能直接加载。
5. **保持现有代码风格**：两空格缩进、单引号、分号、现有命名习惯。
6. **共享模块保持双端可用。** `calendar-core.js`、`planner-core.js`、`quick-input.js`、`chinese-calendar.js` 同时被 Node 和页面的 `<script>` 加载，不能引入 `node:` 模块，要保留现有的 UMD 包装。`data-store.js` 和 `data-model.js` 只在主进程使用。
7. **不修改现有测试的步骤和断言**，例外只有两处：F00 对冒烟测试的两处改动，以及 F09 里明确列出的那一条断言。如果发现别的现有测试必须改才能通过，不要改，按第 6 节的规则记录下来。
8. **按各项的「验收」补测试。** 凡是「验收」里要求测试的修复项，至少要有一个测试在修复前失败、修复后通过。表格里用来防止误伤的用例（修复前后都应通过）不受此限。
9. 新增的源文件要加进 `package.json` 的 `check` 脚本，新增的测试文件要加进 `test` 脚本。

## 4. 修复项

按阶段顺序进行。每个阶段结束时仓库都应处于可用状态：`npm run check`、`npm test`、`npm run smoke` 全部通过。

### 阶段 0：前置

#### F00 冒烟测试不再依赖运行当天的日期

**现状。** `tests/electron-smoke.js` 有两处和日期绑定：

- 第 83 行选拖拽目标时，要求目标格子的日期晚于源日期。测试日程建在今天，而周日是周视图的最后一格，没有更晚的格子，拖拽步骤被整段跳过，随后「拖动重复日程应询问范围」的断言失败。也就是说，这个测试每逢周日必然失败。已在 2026-10-11（周日）复现：把条件改成「不等于源日期」后测试通过。
- 第 56 行把重复截止日期写死为 `2026-12-31`。过了这一天，表单会因为「截止日期早于开始日期」拒绝保存，后续断言全部失败。

**方案。**

- 拖拽目标改为同一周里任意一个日期不同于源日期的格子。
- 截止日期改为相对运行当天计算，例如当天之后 90 天，格式仍为本地时区的 `YYYY-MM-DD`。

只改这两处，其余步骤和断言不动。

**验收。** `npm run smoke` 通过；代码审查确认测试里不再有与星期几相关的比较，也没有写死的未来日期。

### 阶段 1：数据安全

#### F01 数据写入改为原子替换，备份改为按时间间隔刷新

**现状。** `persistData`（`src/main.js:74`）先写 `.tmp`，再用 `copyFileSync` 覆盖主文件，覆盖过程中崩溃会留下半截文件。每次写入前都把主文件复制成 `.bak`，所以 `.bak` 永远只比主文件旧一次写入，起不到保护作用。

**方案。** 新增 `src/data-store.js`（CommonJS，只依赖 `node:fs`、`node:path` 和 `./data-model`，不引入 `electron`），导出 `saveStore` 和 `loadStore`。`main.js` 的 `persistData` 和 `loadData` 改为调用它们。

`saveStore(dataPath, data, options)` 的 `options` 可包含 `now`（`Date`，默认当前时间）、`backupIntervalMs`（默认 10 分钟）、`backup`（默认 `true`）。行为：

1. 先完成序列化，再动磁盘。
2. `backup` 为 `true` 且主文件存在时：仅当 `.bak` 不存在，或 `.bak` 的修改时间距 `now` 不少于 `backupIntervalMs`，才把当前主文件复制为 `.bak`。
3. 写 `${dataPath}.tmp`，再用 `fs.renameSync` 覆盖主文件。`renameSync` 因 `EPERM`、`EBUSY`、`EACCES` 失败时，退回到 `copyFileSync` 加 `unlinkSync`。

**验收**（`tests/data-store.test.js`）：

- 写入后主文件内容等于传入数据，目录里不残留 `.tmp`。
- `.bak` 的修改时间在间隔之内时，连续两次写入不改变 `.bak` 的内容。
- `.bak` 的修改时间早于间隔时（用 `fs.utimesSync` 调旧），写入前的主文件内容进入 `.bak`。
- 传入无法序列化的数据（例如含循环引用）时抛错，主文件和 `.bak` 都保持不变。

#### F02 数据文件损坏时从备份恢复

**现状。** `loadData`（`src/main.js:49`）解析失败时直接重置为空数据并调用 `persistData`，后者又把损坏的主文件复制到 `.bak`。结果是日程清空，原本有效的备份也被毁掉。

**方案。** `loadStore(dataPath, options)` 返回 `{ data, source, corruptPath }`，其中 `data` 已经过 `DataModel.migrateData`。

「损坏」指文件无法解析为 JSON，或解析结果的顶层不是对象（`null`、数组、基本类型都算）。`.bak` 的「可用」用同一标准判断。

| 主文件 | `.bak` | `source` | 行为 |
|---|---|---|---|
| 可解析且顶层是对象 | 不关心 | `main` | 迁移后的内容与磁盘不一致时写回 |
| 不存在 | 可用 | `backup` | 用备份内容写回主文件 |
| 不存在 | 不存在或不可用 | `default` | 写入默认数据 |
| 损坏 | 可用 | `backup` | 先把损坏文件复制为 `${dataPath}.corrupt-<时间戳>`，再用备份内容写回主文件 |
| 损坏 | 不存在或不可用 | `default` | 同样先留存损坏文件，再写入默认数据 |

`source` 不是 `main` 时，写回主文件必须用 `backup: false`。任何情况下，损坏的内容都不得进入 `.bak`。`corruptPath` 是留存文件的路径，没有留存时为 `null`。

`main.js` 侧：当 `corruptPath` 不为空或 `source` 是 `backup` 时，在窗口 `ready-to-show` 之后用 `dialog.showMessageBox` 提示一次，说明数据是从备份恢复的还是已重置为空白，并给出留存文件的路径。首次启动（两个文件都不存在）不提示。

**验收**（`tests/data-store.test.js`）：

- 上表五种情况各有一个测试，断言 `source`、`corruptPath` 是否为空、主文件的最终内容。
- 「损坏 + 备份可用」的测试额外断言：`.bak` 的内容在恢复前后逐字节不变，留存文件的内容等于原损坏内容。
- 主文件内容是 `null` 或 `[]` 时按损坏处理。

#### F03 窗口移动和缩放时不再逐事件写盘

**现状。** `saveBounds`（`src/main.js:167`）绑定在 `move` 和 `resize` 上，拖动窗口时每个事件都同步全量写一次数据文件。

**方案。** 事件回调只更新内存里的 `appData.window`，并启动或重置一个 500 毫秒的定时器，定时器触发时才写盘。`before-quit` 时如果还有未写入的窗口位置，同步写一次并清掉定时器。

**验收。** 代码审查：`move` 和 `resize` 的回调里不再直接调用写盘函数；退出路径有补写。

#### F04 增加单实例锁

**现状。** 没有 `app.requestSingleInstanceLock()`。开机自启后再手动启动一次，两个进程各持一份内存数据，后保存的覆盖先保存的，提醒也会重复。

**方案。** 在 `src/main.js` 启动处申请单实例锁。拿不到锁就直接 `app.quit()`，不进入 `whenReady` 里的初始化。拿到锁的实例监听 `second-instance`，收到时调用 `showWindow()`。

**验收。** 代码审查：未拿到锁的进程不会执行 `loadData`、`createWindow`、`createTray`，也不会启动提醒定时器。

#### F05 导入前校验文件并留底

**现状。** `data:import`（`src/main.js:421`）把任意 JSON 交给 `migrateData`，后者对不认识的内容返回空数据，然后直接替换现有数据，界面还提示成功。

**方案。**

1. 在 `src/data-model.js` 新增并导出 `validateBackup(value)`，返回 `{ ok: true }` 或 `{ ok: false, reason }`。通过条件：`value` 是非空对象、不是数组，并且 `value.events` 是数组。旧版备份没有 `schemaVersion`，不能把它作为必要条件。
2. `data:import` 里，JSON 解析失败或校验不通过时抛出错误，此时不得修改内存数据，不得写盘。
3. 校验通过后、替换数据前，如果主文件存在，把它复制为 `${dataPath}.before-import`（每次导入覆盖上一份）。
4. 返回值增加 `summary: { imported, skipped }`，`imported` 是规范化后的日程数，`skipped` 是原始 `events` 数组长度减去 `imported`。
5. 页面侧：成功提示里带上数量，`skipped` 大于 0 时一并说明；失败提示改为「不是有效的 DeskCal 备份文件，当前数据未改动」。

**验收**（`tests/data-model.test.js`）：

- `validateBackup` 对 `{}`、`null`、`[]`、`'text'`、`{ events: {} }` 返回 `ok: false`。
- 对 `{ events: [] }` 和只含 `events`、`settings` 的旧版结构返回 `ok: true`。
- 主进程和页面部分通过代码审查验收。

#### F06 撤销只对紧接着的那一次保存有效

**现状。** `rememberUndo`（`src/renderer/app.js:344`）保存整个日程数组的快照，`undoLastChange`（`src/renderer/app.js:351`）原样恢复。快照之后如果又有别的改动，点撤销会把它们一起回滚。

**方案。** 快照只在「产生它的那一次保存」之后有效，此后任何一次改动日程数据的操作都要让它失效：

- `saveEvents(message, action)` 里，只有当 `action?.handler === undoLastChange` 时保留快照，否则清空。
- 绕过 `saveEvents`、直接调用 `window.deskcal.saveEvents` 的路径（删除日历）同样清空。
- 导入备份成功后清空。

快照失效后点击残留的撤销按钮不产生任何改动。

**验收**（冒烟测试，见第 5 节）：移动一条日程产生快照，接着新增一条日程，再调用 `undoLastChange()`；新增的日程仍然存在，被移动的日程保持移动后的状态。

### 阶段 2：提醒

#### F07 「工作日重复」按自然日计算

**现状。** `weekdaysThrough`（`src/calendar-core.js:66`）用带时刻的 `Date` 做比较。起始日由 `parseDate` 生成，固定在中午 12:00，而提醒检查传入的是真实当前时间。于是首日中午之前 `occursOn` 返回 `false`，09:00 的日程在首日不会提醒。设了重复次数时，系列结束后的第二天上午还会多算一次。

**方案。** 工作日计数只看日历日，不看时刻。建议用「整周数 × 5 + 不足一周的余数逐日判断」实现，避免从起始日逐日循环到目标日。

**验收**（`tests/calendar-core.test.js`）：

- 日程 `{ date: '2026-10-12', startTime: '09:00', reminders: [10], recurrence: { frequency: 'weekdays', interval: 1 } }`（2026-10-12 是周一）。对 2026-10-12 的 00:00、08:00、12:00、23:59 四个时刻，`occursOn` 都返回 `true`。
- 同一日程，`remindersDue([event], new Date(2026, 9, 12, 8, 50, 30))` 返回 1 条。
- 加上 `count: 3` 后，2026-10-14（周三）08:00 返回 `true`，2026-10-15（周四）08:00 和 15:00 都返回 `false`。
- 对六种频率各取一个日程，断言 `occursOn` 在同一天的 00:00 和 23:59 结果一致。

#### F08 列表里的 ✓ 按钮只完成当次

**现状。** `bindAgendaItems`（`src/renderer/app.js:707`）直接翻转 `event.completed`。对重复日程，这等于把整个系列标记为完成，而 `remindersDue` 会跳过已完成的日程（`src/calendar-core.js:160`），此后所有提醒都停掉。

**方案。**

- 非重复日程：行为不变。
- 重复日程：只完成这一行对应的那一次，效果等同于在快速编辑里选「仅本次」再标记完成，即调用 `applyScopedEventChange(event, occurrenceDate, { completed: true }, 'occurrence')`。操作前调用 `rememberUndo`，提示里带撤销按钮。系列本身的 `completed` 不得被修改。
- 搜索结果里的重复日程：这一行代表的是整个系列而不是某一次，点 ✓ 时改为打开快速编辑卡，由用户选择范围。

**验收**（冒烟测试）：准备一条从今天开始每天重复的日程，在今天的列表里点它的 ✓。断言：原系列的 `completed` 仍为 `false`，`exceptions` 包含今天；`state.events` 里多出一条今天的、不重复的、`completed` 为 `true` 的日程。

#### F09 提醒去重改为按触发时刻识别

**现状。** 去重标识是 `日程id|发生日期|提前分钟数`（`src/calendar-core.js:141`）。保存日程时如果发现「签名」变了，就删掉这条日程的全部发送记录（`src/main.js:323` 起）。这带来两个错误：

- 漏发：签名里没有 `allDayReminderTime`。全天日程 09:00 提醒过之后把提醒时间改成 10:00，发送记录没被清掉，10:00 的标识和旧的相同，被当成已发送。
- 重发：只是跳过明天那一次或改截止日期，签名也会变，全部记录被清空并立刻重新检查，刚发过的提醒在 65 秒窗口内再发一次；之后休眠唤醒做遗漏检查时，24 小时内已发过的提醒也会再发。

**方案。** 把决定触发时刻的信息放进标识，取消「保存时清历史」。

1. `reminderToken(eventId, occurrenceKey, minutes, baseTime)` 改为四段，`baseTime` 是这次发生的基准时刻，格式 `HH:MM`：非全天日程取开始时间，全天日程取全天提醒时间，与 `occurrenceDateTime` 的取值一致。例如 `event-1|2026-07-29|30|10:00`。
2. 新增并导出 `legacyReminderToken(eventId, occurrenceKey, minutes)`，返回旧的三段格式。
3. `remindersDue` 的每条结果同时带 `token`（新格式）和 `legacyToken`（旧格式）。
4. 新增并导出 `unsentReminders(events, sentTokens, now, options)`：返回 `remindersDue` 的结果里，`token` 和 `legacyToken` 都不在 `sentTokens` 中的项。`sentTokens` 是字符串的 `Set`。
5. `checkReminders`（`src/main.js:283`）改用 `unsentReminders`，新记录只存新格式的 `token`。同时认旧格式，是为了升级后的头 24 小时内不把已发过的提醒当成遗漏重发。
6. `events:save` 删掉签名比较和「按变更的 id 清记录」的逻辑，只清理已经不存在的日程的记录。保存后仍然立即调用一次 `checkReminders(false)`。

**允许修改的现有断言。** `tests/calendar-core.test.js` 里 `assert.equal(due[0].token, 'event-1|2026-07-29|30')` 改为 `'event-1|2026-07-29|30|10:00'`。

**验收**（`tests/calendar-core.test.js`，全部通过 `unsentReminders` 验证）：

- 全天日程，提醒时间 09:00，`reminders: [0]`。09:00 取到 1 条，把它的 `token` 放进已发送集合；将提醒时间改为 10:00 后，在 10:00 再查，取到 1 条。
- 每天重复的日程，今天的提醒已发送。给它加上明天的例外日期后立即再查，取到 0 条。
- 已发送集合里只有旧格式标识时，同一条提醒取到 0 条。
- 日程原有 `reminders: [10]` 且已发送，改成 `[10, 30]` 后在同一时刻再查，10 分钟那一档不会再出现。

#### F10 通知带上发生日期，并保留通知对象的引用

**现状。** 点击通知时只发送 `event.id`（`src/main.js:269`），页面用系列的起始日期定位（`src/renderer/app.js:1637`）。对重复日程，打开的是第一天，随后默认的「仅本次」编辑改的也是第一天。另外 `Notification` 对象没有被任何变量持有，被垃圾回收后点击事件可能丢失。

**方案。**

- `reminder:open` 的载荷改为 `{ eventId, occurrenceDate }`，`preload` 原样转给页面。
- 页面用 `occurrenceDate` 设置选中日期和视图，并以它调用 `openEventDialog(eventId, occurrenceDate)`。
- 主进程用一个模块级的 `Set` 持有已显示的通知，在 `click`、`close`、`failed` 时移除，数量超过 50 时移除最早的。

**验收。** 代码审查。

### 阶段 3：重复规则

#### F11 「本次及以后」保留剩余次数，首次发生不拆分

**现状。** `applyOccurrenceChange` 的 `future` 分支（`src/planner-core.js:82`）把新系列的 `count` 强制设为 `null`。「重复 5 次」的系列在第 3 次上修改后，新系列变成无限重复，表单里填的次数也被丢弃。在第一次发生上选「本次及以后」时，原系列的截止日期变成起始日的前一天，成为一条永远不显示、但能被搜到的无效记录。删除路径 `deleteOccurrence`（`src/renderer/app.js:1166`）有同样的问题。

**方案。**

1. `future` 且 `occurrenceDate` 是系列的第一次发生：不拆分，按 `series` 处理，返回 `{ original: 应用改动后的原记录, detached: null }`。
2. `future` 的其他情况，新系列的 `count` 这样确定：
   - `changes.recurrence` 存在，且其中的 `count` 与原系列不同：用 `changes.recurrence.count`，表示用户重新设了次数（清空也算，此时为 `null`）。
   - 否则：原系列没有次数限制则为 `null`；有则为「原次数 −（本次是第几次 − 1）」，第几次用 `CalendarCore.occurrenceNumber` 计算。
3. 新增并导出纯函数 `PlannerCore.applyOccurrenceDeletion(event, occurrenceDate, scope, now)`，返回修改后的新对象，不改动入参。`deleteOccurrence` 改为调用它：
   - 非重复日程，或 `scope` 是 `series`：设置 `deletedAt`。
   - `future` 且是第一次发生：等同于删除整个系列，设置 `deletedAt`。
   - `future` 的其他情况：截止日期设为前一天，`count` 设为 `null`。
   - 其余（仅本次）：把日期加入 `exceptions`。

**验收**（`tests/planner-core.test.js`）：

- 系列：每天重复，起始 2026-10-12，`count: 5`。在 2026-10-14 上做 `future` 修改，且 `changes` 不含 `recurrence`。新系列 `count` 为 3，在 2026-10-16 发生，在 2026-10-17 不发生；原系列截止于 2026-10-13。
- 同上，但 `changes.recurrence` 的 `count` 仍是 5（表单带出的原值）：结果相同，新系列 `count` 为 3。
- 同上，但 `changes.recurrence.count` 为 10：新系列 `count` 为 10。
- 在 2026-10-12（第一次）上做 `future` 修改：`detached` 为 `null`，`original` 包含改动，重复规则不变。
- `applyOccurrenceDeletion` 的四种情况各一个测试；第一次发生上的 `future` 删除，结果带 `deletedAt`。

#### F12 重复次数按实际发生的次数计算

**现状。** `occurrenceNumber` 的每月和每年分支（`src/calendar-core.js:93`）用周期数当作序号。从 1 月 31 日开始每月重复 2 次，2 月没有 31 日但仍占掉一个序号，3 月 31 日成了第 3 次，被次数限制排除，实际只发生 1 次。2 月 29 日开始的每年重复同理。

**方案。** 序号按实际存在的发生日期计数：每月重复只数「有这一天」的月份，每年重复只数「有这一天」的年份。起始日不超过 28 日的每月重复，以及不是 2 月 29 日的每年重复，可以直接沿用现有的算术结果，不必循环。

语义约定：重复次数指实际发生的次数；被单独跳过的例外日期仍然计入。

**验收**（`tests/calendar-core.test.js`）：

- 起始 2026-01-31，每月重复，`count: 2`：2026-01-31 和 2026-03-31 发生，2026-05-31 不发生。
- 起始 2024-02-29，每年重复，`count: 2`：2024-02-29 和 2028-02-29 发生，2032-02-29 不发生。
- 起始 2026-01-15，每月重复，`count: 2`：2026-02-15 发生，2026-03-15 不发生。

### 阶段 4：快速录入与编辑表单

F13 到 F15 都在 `src/quick-input.js`，验收统一写在 F15 后面的表里。

#### F13 正确识别「下周X」「本周X」

**现状。** 正则 `(下周|本周)?(?:周|星期)([一二三四五六日天])`（`src/quick-input.js:66`）在限定词之后又要求一个「周」或「星期」，所以「下周五」只匹配到「周五」，被当成最近的周五，标题里还留下一个「下」。只有「下周星期五」这种写法能得到正确结果。

**方案。**

- 支持「下周X」「下星期X」「本周X」「这周X」「本星期X」「这星期X」，以及现有的「周X」「星期X」。
- 「下周星期五」「下周周五」这类重复写法继续支持。
- 语义：「本周X」是当前自然周（周一到周日）里的那一天，即使已经过去；「下周X」是下一个自然周里的那一天；不带限定词的「周X」保持现有行为，取今天之后最近的那一天。
- 整个短语都要从标题里去掉。

#### F14 重复词和星期重叠时标题不被截坏

**现状。** 「每周三下午3点例会」里，日期识别到「周三」，重复识别到「每周」，两者重叠。标题清理按顺序做字符串替换，先删「周三」，「每周」就找不到了，标题变成「每 例会」。

**方案。** 标题清理要能处理重叠的片段。建议各识别器记录自己在原文里的起止位置，合并重叠区间后一次性删除，而不是逐个做字符串替换。「每周三」应识别为每周重复、日期取最近的周三，整个短语从标题里去掉。

#### F15 时间解析补全

**方案。**

- 「晚上12点」表示午夜，解析为次日 00:00，日期顺延一天。「晚上12点半」为次日 00:30。
- 小时和分钟支持中文数字：小时支持零到二十四（含「两」），分钟支持一到五十九；「半」为 30 分，「一刻」为 15 分，「三刻」为 45 分。
- 支持时间段，连接词为「到」「至」「-」「~」「—」。结束时间没有时段词时沿用开始时间的时段词；这样得到的结束时间不晚于开始时间时，加 12 小时再试；仍不晚于开始时间时，退回到「开始时间加 60 分钟」。整个时间段都从标题里去掉。
- 支持「大后天」，偏移 3 天，且不能被「后天」抢先匹配。

**F13 到 F15 的验收**（`tests/quick-input.test.js`）。未注明时，参考时间为 2026-10-11（周日）10:00。

| 输入 | 参考时间 | 期望 |
|---|---|---|
| 下周五上午9点开会 | 2026-10-07（周三） | 日期 2026-10-16，09:00–10:00，标题「开会」 |
| 下星期五上午9点开会 | 2026-10-07 | 同上 |
| 下周星期五上午9点开会 | 2026-10-07 | 同上 |
| 本周一上午9点开会 | 2026-10-07 | 日期 2026-10-05，标题「开会」 |
| 这周一上午9点开会 | 2026-10-07 | 日期 2026-10-05，标题「开会」 |
| 周五上午9点开会 | 2026-10-07 | 日期 2026-10-09，标题「开会」 |
| 每周三下午3点例会 | 默认 | 日期 2026-10-14，15:00–16:00，每周重复，标题「例会」 |
| 每周五下午3点周会 | 默认 | 日期 2026-10-16，每周重复，标题「周会」 |
| 每周例会 | 默认 | 日期 2026-10-11，全天，每周重复，标题「例会」 |
| 晚上12点跨年 | 默认 | 日期 2026-10-12，00:00–01:00，标题「跨年」 |
| 明天晚上12点半复盘 | 默认 | 日期 2026-10-13，00:30–01:30，标题「复盘」 |
| 中午12点吃饭 | 默认 | 日期 2026-10-11，12:00–13:00，标题「吃饭」 |
| 明天下午三点开会 | 默认 | 日期 2026-10-12，15:00–16:00，标题「开会」 |
| 下午两点半开会 | 默认 | 14:30–15:30，标题「开会」 |
| 晚上十一点半复盘 | 默认 | 23:30–23:59，标题「复盘」 |
| 上午十点一刻站会 | 默认 | 10:15–11:15，标题「站会」 |
| 下午3点到5点评审 | 默认 | 15:00–17:00，标题「评审」 |
| 上午10点到下午2点培训 | 默认 | 10:00–14:00，标题「培训」 |
| 上午11点到1点午餐会 | 默认 | 11:00–13:00，标题「午餐会」 |
| 15:00-17:00 评审 | 默认 | 15:00–17:00，标题「评审」 |
| 大后天交报告 | 默认 | 日期 2026-10-14，全天，标题「交报告」 |
| 后天交报告 | 默认 | 日期 2026-10-13，全天，标题「交报告」 |

`tests/quick-input.test.js` 里现有的测试必须继续通过。

#### F16 编辑表单保留预设之外的提醒值

**现状。** 表单只有六个固定的提醒选项：0、5、10、30、60、1440 分钟（`src/renderer/index.html:212`）。快速录入「提前2小时」解析出 120，预览也正确，但 `submitQuickAdd`（`src/renderer/app.js:1362`）只会勾选已有的选项，120 没有对应项，结果一个都没勾上，保存后变成不提醒。编辑带有自定义提醒值的日程时也会丢失它们。

**方案。** 打开表单时，凡是日程里有、但不在六个预设里的提醒值，都动态追加一个已勾选的选项，标签按数值生成（能被 1440 整除的显示为「提前N天」，能被 60 整除的显示为「提前N小时」，其余显示为「提前N分钟」）。`resetEventForm` 负责移除上一次动态追加的选项。新建、编辑、快速录入三条进入表单的路径都要走这套逻辑。

**验收**（冒烟测试）：

- 快速录入「明天下午3点开会 提前2小时」并提交，再提交日程表单；保存下来的日程 `reminders` 等于 `[120]`。
- 打开一条 `reminders` 为 `[15, 120]` 的现有日程，不做修改直接保存；`reminders` 仍为 `[15, 120]`。
- 之后新建一条日程，表单里不出现上一次追加的 15 和 120 选项。

### 阶段 5：农历、小修和工程

#### F17 修正闰月显示

**现状。** `lunarMonthName`（`src/chinese-calendar.js:108`）给闰月加「闰」字前缀，但库的 `getMonthInChinese()` 返回值已经带「闰」，结果显示成「闰闰五月」。`getTraditionalFestival`（`src/chinese-calendar.js:118`）对月份取绝对值，闰五月初五也被当成端午节。

**方案。** 去掉重复的前缀。闰月不显示任何传统节日；除夕的判断在此之前，保持不变。

**验收**（`tests/chinese-calendar.test.js`）：

| 日期 | 期望 |
|---|---|
| 2028-06-27（闰五月初五） | `traditionalFestival` 为空，`lunarMonthText` 为「闰五月」，`fullLunarText` 为「农历戊申年 闰五月初五」，`isLeapMonth` 为 `true` |
| 2028-05-28（五月初五） | `traditionalFestival` 为「端午节」 |
| 2023-03-23（闰二月初二） | `traditionalFestival` 为空 |
| 2023-02-21（二月初二） | `traditionalFestival` 为「龙抬头」 |
| 2025-07-25（闰六月初一） | `lunarText` 为「闰六月」 |
| 2027-02-05（腊月廿九） | `traditionalFestival` 为「除夕」 |

每个测试开始前调用 `clearCache()`。

#### F18 标记完成时不做冲突确认

**现状。** `quickEditAction`（`src/renderer/app.js:1215`）对所有动作都做时间冲突检查。点「标记完成」时如果日程和别的日程时间重叠，也会弹出冲突确认。

**方案。** 只有改变日期或时间的动作才做冲突检查，`complete` 动作跳过。

**验收**（冒烟测试）：准备两条同一天时间重叠的日程，把 `window.confirm` 替换成计数函数，对其中一条执行 `quickEditAction('complete')`；确认函数的调用次数为 0，日程的 `completed` 变为 `true`。

#### F19 `preload` 回调包装和页面 CSP

**方案。**

- `src/preload.js` 里 `onCreateRequest` 和 `onOpenSettings` 直接把页面的回调注册给 `ipcRenderer.on`，原始的 IPC 事件对象会传进页面。改成和另外三个监听一样的包装写法，不向页面传事件对象。
- `src/renderer/index.html` 的 `<head>` 里加上：

  ```html
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
  />
  ```

  页面里没有内联脚本和内联事件处理器；`style-src` 保留 `'unsafe-inline'` 是因为 `app.js` 生成的 HTML 里有 `style` 属性。

**退出条件。** 加上 CSP 后如果 `npm run smoke` 无法通过，并且原因是 CSP 本身（不是代码问题），就撤掉 CSP 这一处改动，在执行记录里写明现象。不要为了让它通过而放宽成 `'unsafe-eval'` 或删改冒烟测试的断言。

**验收。** 代码审查，加上 `npm run smoke` 通过。

#### F20 测试脚本、CI 和 README 跟进

- `package.json`：`check` 脚本加入 `src/data-store.js`，`test` 脚本加入 `tests/data-store.test.js`。
- `.github/workflows/ci.yml`：在运行测试之后增加一步 `npm run smoke`。
- `README.md`：只更新「数据位置与兼容」一节里关于备份的描述，使其与 F01、F02、F05 的新行为一致（备份的刷新间隔、损坏时自动从备份恢复、导入前留存 `.before-import`）。徽章、版本号和其他章节不要动。

## 5. 冒烟测试的补充说明

F06、F08、F16、F18 的验收写在 `tests/electron-smoke.js` 里。

- 除 F00 的两处改动外，现有的步骤和断言保持不变。新增的步骤放在现有流程之后，建议先重新加载页面（再调用一次 `window.loadFile`），在干净的状态下另起一段脚本执行，避免和前面的数据互相影响。
- 页面里顶层的 `state`、`render()`、`saveEvents()`、`undoLastChange()`、`quickEditAction()` 都是全局可访问的，可以直接用它们准备数据和触发动作。
- 新增步骤开始前把 `window.confirm` 和 `window.prompt` 替换成桩函数。原生对话框会阻塞隐藏窗口，导致测试卡死。

## 6. 提交与异常处理

- 从 `main` 新建分支 `fix/review-findings`，所有改动都在这个分支上。
- 阶段 0 到阶段 5，每个阶段完成、`npm run check`、`npm test`、`npm run smoke` 都通过后提交一次，共 6 次提交。提交信息沿用仓库现有的约定，例如 `fix(data): 原子写入并从备份恢复`。本文件随第一次提交一起提交。
- 第 8 节的执行记录在全部完成后填写，单独再提交一次。
- 不要 `push`，不要改写历史（`amend`、`rebase`、`reset --hard`）。
- 遇到下列情况时，不要自行变通：跳过这一项，在第 8 节的执行记录里写清楚原因，然后继续做其他项。
  - 某一项的方案和代码的实际情况对不上，照做会引入别的问题。
  - 除 F00 和 F09 列出的改动之外，还有现有测试的步骤或断言必须修改才能通过。
  - F19 的退出条件被触发。

## 7. 完成标准与验收方式

**完成标准：**

1. `npm run check`、`npm test`、`npm run smoke` 全部通过。
2. 第 4 节每一项的验收条件都有对应的测试或代码。
3. 工作区干净，所有改动都已提交在 `fix/review-findings` 上。
4. 第 8 节的执行记录已填写。

**验收时会做的事：**

1. 在 `fix/review-findings` 上运行上面三条命令。
2. 把新增的测试拿到基线代码上运行，确认每个要求测试的修复项都至少有一个测试在修复前失败。
3. 逐项对照本文件审查 `git diff main...fix/review-findings`。
4. 用独立编写的脚本重新验证 F07、F09、F11、F12、F13 到 F15、F17 的期望值，并在临时目录里验证 F01、F02。
5. 检查改动范围：没有新增依赖，没有 2.2 节列出的范围外改动，现有测试的步骤和断言除 F00、F09 列出的改动外没有变化。

## 8. 执行记录

由执行人在完成后填写。状态填「完成」「跳过」或「部分完成」；跳过和部分完成必须说明原因。

| 编号 | 状态 | 提交 | 说明 |
|---|---|---|---|
| F00 | 完成 | 1308a60 | 消除运行日期依赖；RED（基线周日拖拽范围断言失败 `false !== true`）-> GREEN（相对当天+90天计算截止日期，拖拽目标改为同周任意非源日期格）。 |
| F01 | 完成 | 8fd574f | 新增 `src/data-store.js`；RED（模块不存在）-> GREEN（实现序列化先行、10分钟间隔增量刷新备份、原子替换与 EPERM/EBUSY 降级安全处理，写入无 `.tmp` 残留，循环引用抛错）。 |
| F02 | 完成 | 8fd574f | RED（模块不存在）-> GREEN（支持5种恢复矩阵状态、非对象/null/数组严格判为损坏并留存 `.corrupt-<timestamp>`、备份逐字节不变，ready-to-show 显示恢复弹窗，首次启动静默）。 |
| F03 | 完成 | 8fd574f | 代码审查通过：窗口 resize/move 回调采用 500ms debounce 防抖写盘，before-quit 同步执行 `flushBounds` 补写，消除逐事件写盘（代码审查，非真实主进程运行）。 |
| F04 | 完成 | 8fd574f | 代码审查通过：`src/main.js` 入口申请 `app.requestSingleInstanceLock()` 单实例锁，未获锁直接退出阻止所有初始化；获锁实例监听 `second-instance` 呼出窗口（代码审查，非真实主进程运行）。 |
| F05 | 完成 | 8fd574f | 后端与页面协作完成；RED（`validateBackup is not a function`）-> GREEN（导出 `validateBackup` 校验对象及 `events` 数组；导入前留存 `.before-import` 并产出 imported/skipped 统计，页面更新提示文案）。 |
| F06 | 完成 | 8fd574f | 冒烟测试验证通过：移动日程产生快照后新增日程，随后撤销，原移动日程保持移动状态且新增日程未被回滚，撤销仅对紧接保存有效。 |
| F07 | 完成 | ae7a9dc | RED（`occursOn` 在首日 00:00 返回 false）-> GREEN（重构 `weekdaysThrough` 为日历日及整周数自然日判定，首日各时刻与 `count: 3` 次数边界均正确判定，六种频率全天结果一致）。 |
| F08 | 完成 | ae7a9dc | 冒烟测试验证通过：列表 ✓ 按钮仅标记当次完成，原系列 `completed` 保持 false 且增加当日例外，独立生成完成记录；搜索列表点击打开快速编辑卡。 |
| F09 | 完成 | ae7a9dc | RED（三段 Token 冲突且 `unsentReminders` 未定义）-> GREEN（按触发时刻生成四段 Token，提供旧格式兼容及 `unsentReminders`；`events:save` 移除破坏性签名清理，仅清理已删除记录）。 |
| F10 | 完成 | ae7a9dc | 代码审查通过：`reminder:open` 传递 `{ eventId, occurrenceDate }` 载荷；主进程使用上限 50 的 `activeNotifications` Set 持有通知引用并在事件回调后释放（代码审查，非真实主进程运行）。 |
| F11 | 完成 | 85063cc | RED（新系列 count 强制为 null 且 `applyOccurrenceDeletion` 未定义）-> GREEN（首日 future 修改不拆分，非首日保留剩余次数或接受自定义覆盖/清空；实现纯函数 `applyOccurrenceDeletion` 处理四种删除）。 |
| F12 | 完成 | 85063cc | RED（月末31日与闰年2月29日因计数偏差在 `count: 2` 时提前不发生）-> GREEN（按实际存在的月份和年份计数，常规日期保留快路径算术结果）。 |
| F13 | 完成 | 2361d53 | RED（「下周五」误匹配为当周五 2026-10-09）-> GREEN（全面支持下周/下星期/本周/这周/本星期/这星期及重复前缀，以 2026-10-07 为基准正确定位下周五 2026-10-16 与本周一 2026-10-05）。 |
| F14 | 完成 | 2361d53 | RED（「每周三...」标题截裂为「每 例会」）-> GREEN（改用起止区间记录并合并删除重叠短语，标题保留为「例会」）。 |
| F15 | 完成 | 2361d53 | RED（晚上12点未顺延次日、数字区间 11:00-01:00 结束时间错误）-> GREEN（晚上12点顺延次日 00:00，中文数字/一刻/半支持，时间段支持 +12h 重试及 +60min 降级，大后天优先匹配）。 |
| F16 | 完成 | 2361d53 | 冒烟测试验证通过：自定义提醒值（120分钟）在表单中动态追加并保存，编辑保留现有非预设值，新建时清理动态项。 |
| F17 | 完成 | 5ab7291 | RED（闰五月显示为「端午节」，月份显示为「闰闰五月」）-> GREEN（移除重复前缀，闰月过滤传统节日并保留除夕；测试显式使用 `clearCache()`）。 |
| F18 | 完成 | 5ab7291 | 冒烟测试验证通过：重叠日程标记完成时 `window.confirm` 调用次数为 0，日程顺利完成且不弹出时间冲突确认。 |
| F19 | 完成 | 5ab7291 | 代码审查通过：`preload` 包装剥离原始 IPC 事件；`index.html` 添加 CSP meta 且冒烟测试全通过（代码审查，非真实主进程运行）。 |
| F20 | 完成 | 5ab7291 | package.json 脚本已在阶段 1 提前登记（commit `8fd574f`），CI 增加 `npm run smoke` 步骤，README.md 更新备份与恢复描述。 |

**命令结果**（填写最后一次运行的结果）：

- `npm run check`：通过（exit code 0，检查 11 个源文件与测试文件语法）
- `npm test`：通过（exit code 0，58 个测试全部通过，耗时 ~380ms）
- `npm run smoke`：通过（exit code 0，运行于 2026-10-12，基线测试及 F06、F08、F16、F18 全部回归断言通过）

**与计划不一致的地方：**

1. `package.json` 中的 `check` 与 `test` 脚本更新提前至阶段 1（commit `8fd574f`）完成，以满足全局约束 9「新增源文件和测试文件加进对应脚本」以及后续阶段的验证要求。F20 其余改动（CI 和 README）在阶段 5（commit `5ab7291`）完成。
2. 修复过程中严格遵照计划，未出现计划方案与代码实际对不上的情况，无跳过（no skips）或部分完成项，F19 的 CSP 策略完全保留且冒烟测试通过。
3. 全程未运行远程 CI 工作流，未运行真实桌面客户端常驻交互（避免触碰真实用户数据 `%APPDATA%\deskcal`），所有验证均在隔离测试和内存/临时目录环境下通过指定命令执行。

