const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDirectory = path.join(__dirname, '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(rendererDirectory, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(rendererDirectory, 'app.js'), 'utf8');

test('渲染脚本引用的固定ID均存在于页面', () => {
  const referencedIds = [...script.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map(
    (match) => match[1]
  );
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const missing = [...new Set(referencedIds)].filter((id) => !htmlIds.has(id));
  assert.deepEqual(missing, []);
});

test('渲染脚本不使用系统的 confirm / prompt / alert', () => {
  // 系统对话框关闭后页面会丢失输入焦点，必须用页面内的 askConfirm / askText
  const calls = script.match(/(?<![\w.])(?:window\.)?(?:confirm|prompt|alert)\(/g) || [];
  assert.deepEqual(calls, []);
});

test('页面先加载共享日期逻辑再加载应用脚本', () => {
  const lunarRuntimePosition = html.indexOf('lunar-javascript/lunar.js');
  const chineseCalendarPosition = html.indexOf('../chinese-calendar.js');
  const corePosition = html.indexOf('../calendar-core.js');
  const plannerCorePosition = html.indexOf('../planner-core.js');
  const appPosition = html.indexOf('./app.js');
  assert.ok(lunarRuntimePosition >= 0);
  assert.ok(chineseCalendarPosition > lunarRuntimePosition);
  assert.ok(corePosition >= 0);
  assert.ok(plannerCorePosition >= 0);
  assert.ok(appPosition > chineseCalendarPosition);
  assert.ok(appPosition > corePosition);
  assert.ok(appPosition > plannerCorePosition);
});

test('渲染脚本先绑定日期工具再创建初始状态', () => {
  const bindingPosition = script.indexOf('const { dateKey, parseDate');
  const statePosition = script.indexOf('const state =');
  assert.ok(bindingPosition >= 0);
  assert.ok(statePosition > bindingPosition);
});
