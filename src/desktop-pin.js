// “桌面组件”模式：把窗口钉在桌面层——位于桌面图标之上、所有应用窗口之下，
// 并在“显示桌面”（Win+D）期间保持可见。思路与 Rainmeter 的 On Desktop 相同：
// 窗口仍是独立的顶层窗口，只由这里管理它的 z 序。
// 不使用 SetParent 或 owner 挂到桌面窗口上：实测那样会让系统把激活转交给本窗口，
// 导致再按一次 Win+D 无法恢复其他窗口。

const WM_WINDOWPOSCHANGING = 0x0046;
const WINDOWPOS_FLAGS_OFFSET = 32;
const GW_HWNDNEXT = 2;
const GW_HWNDPREV = 3;
const GW_OWNER = 4;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_POPUP_DISABLED = 0x88000000;
const HWND_BOTTOM = 1;
const HWND_NOTOPMOST = -2;
const SWP_NOZORDER = 0x4;
const SWP_Z_ONLY = 0x1 | 0x2 | 0x10;
const POLL_INTERVAL_MS = 120;
const PEEK_SETTLE_MS = 800;
const PEEK_TOGGLE_GRACE_MS = 500;

let native;

function loadNative() {
  if (native !== undefined) return native;
  native = null;
  if (process.platform !== 'win32' || process.arch === 'ia32') return native;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    native = {
      koffi,
      GetShellWindow: user32.func('intptr_t GetShellWindow()'),
      GetForegroundWindow: user32.func('intptr_t GetForegroundWindow()'),
      FindWindowExW: user32.func(
        'intptr_t FindWindowExW(intptr_t parent, intptr_t after, str16 className, str16 title)'
      ),
      GetWindow: user32.func('intptr_t GetWindow(intptr_t hwnd, uint32_t command)'),
      IsWindow: user32.func('bool IsWindow(intptr_t hwnd)'),
      GetWindowLongPtrW: user32.func('intptr_t GetWindowLongPtrW(intptr_t hwnd, int index)'),
      SetWindowLongPtrW: user32.func(
        'intptr_t SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'
      ),
      SetWindowPos: user32.func(
        'bool SetWindowPos(intptr_t hwnd, intptr_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)'
      ),
      CreateWindowExW: user32.func(
        'intptr_t CreateWindowExW(uint32_t exStyle, str16 className, str16 name, uint32_t style, int x, int y, int width, int height, intptr_t parent, intptr_t menu, intptr_t instance, intptr_t param)'
      ),
      DestroyWindow: user32.func('bool DestroyWindow(intptr_t hwnd)')
    };
  } catch (error) {
    console.error('DeskCal 无法加载桌面嵌入所需的系统接口，桌面组件模式将退回普通窗口：', error);
  }
  return native;
}

function create(win) {
  const api = loadNative();
  if (!api) return null;

  const hwnd = Number(win.getNativeWindowHandle().readBigInt64LE(0));
  let enabled = false;
  let raised = false;
  let peeking = false;
  let peekStartedAt = 0;
  let peekEndedAt = 0;
  let ownMove = false;
  let host = 0;
  let probe = 0;
  let timer = null;

  const exStyle = (target) => Number(api.GetWindowLongPtrW(target, GWL_EXSTYLE));

  // Windows 11 24H2 起桌面图标直接挂在 Progman 下，更早的版本挂在某个 WorkerW 下
  function findHost() {
    const shell = Number(api.GetShellWindow());
    if (shell && Number(api.FindWindowExW(shell, 0, 'SHELLDLL_DefView', null))) return shell;
    let worker = 0;
    for (let index = 0; index < 256; index += 1) {
      worker = Number(api.FindWindowExW(0, worker, 'WorkerW', null));
      if (!worker) break;
      if (Number(api.FindWindowExW(worker, 0, 'SHELLDLL_DefView', null))) return worker;
    }
    return 0;
  }

  // “显示桌面”时系统把桌面宿主窗口抬到所有普通窗口之上。探针窗口始终沉在最底，
  // 平时宿主在它下面；从探针往下找不到宿主，就说明桌面被抬起了。
  function isDesktopRaised() {
    if (!probe) return false;
    if (!host || !api.IsWindow(host)) host = findHost();
    if (!host) return false;
    let current = probe;
    for (let index = 0; index < 4096; index += 1) {
      current = Number(api.GetWindow(current, GW_HWNDNEXT));
      if (!current) return true;
      if (current === host) return false;
    }
    return false;
  }

  function setZ(insertAfter) {
    ownMove = true;
    api.SetWindowPos(hwnd, insertAfter, 0, 0, 0, 0, SWP_Z_ONLY);
    ownMove = false;
  }

  // 桌面被抬起时插到宿主窗口的正上方：既在桌面之上，又不盖住任何其他窗口。
  // 不用 HWND_TOPMOST：窗口获得过焦点后会拥有输入法窗口，此后置顶请求会被系统静默忽略。
  function settle() {
    if (!raised) {
      setZ(HWND_BOTTOM);
      return;
    }
    const above = Number(api.GetWindow(host, GW_HWNDPREV));
    if (above && above !== hwnd) setZ(above);
  }

  function isAboveHost() {
    let current = hwnd;
    for (let index = 0; index < 4096; index += 1) {
      current = Number(api.GetWindow(current, GW_HWNDNEXT));
      if (!current) return false;
      if (current === host) return true;
    }
    return true;
  }

  // 以系统的前台窗口为准（Electron 的 isFocused 在抢焦点被系统拒绝时会误报）；
  // 本窗口弹出的系统对话框（确认框、文件选择）拿到焦点时不算离开
  function holdsFocus() {
    const foreground = Number(api.GetForegroundWindow());
    if (!foreground) return false;
    return foreground === hwnd || Number(api.GetWindow(foreground, GW_OWNER)) === hwnd;
  }

  function endPeek() {
    if (!peeking) return;
    peeking = false;
    peekEndedAt = Date.now();
    sync(true);
  }

  function sync(force = false) {
    if (!enabled || win.isDestroyed() || !win.isVisible()) return;
    if (peeking) {
      if (Date.now() - peekStartedAt > PEEK_SETTLE_MS && !holdsFocus()) endPeek();
      return;
    }
    const next = isDesktopRaised();
    // 抬起期间逐次确认窗口确实在桌面之上，被系统拒绝过的调整会在下一轮重试
    if (next === raised && !force && !(raised && !isAboveHost())) return;
    raised = next;
    settle();
  }

  // 除了这里自己发起的调整，一律不允许改变 z 序，点击窗口也不会浮到其他窗口上面
  function lockZOrder(_wParam, lParam) {
    if (ownMove || peeking) return;
    const position = lParam.readBigUInt64LE(0);
    const flags = api.koffi.decode(position, WINDOWPOS_FLAGS_OFFSET, 'uint32_t');
    if (flags & SWP_NOZORDER) return;
    api.koffi.encode(position, WINDOWPOS_FLAGS_OFFSET, 'uint32_t', (flags | SWP_NOZORDER) >>> 0);
  }

  function startPeek() {
    peeking = true;
    peekStartedAt = Date.now();
  }

  function enable() {
    if (enabled || win.isDestroyed()) return;
    enabled = true;
    probe = Number(
      api.CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        'Static',
        'DeskCalDesktopProbe',
        WS_POPUP_DISABLED,
        0, 0, 0, 0, 0, 0, 0, 0
      )
    );
    if (probe) api.SetWindowPos(probe, HWND_BOTTOM, 0, 0, 0, 0, SWP_Z_ONLY);
    // 工具窗口不进 Alt+Tab，被激活时也不会让系统结束“显示桌面”状态
    api.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle(hwnd) | WS_EX_TOOLWINDOW);
    win.hookWindowMessage(WM_WINDOWPOSCHANGING, lockZOrder);
    // 用户正在操作窗口时（比如刚在设置里切到桌面组件）先留在前面，离开后再沉到桌面
    if (holdsFocus()) startPeek();
    timer = setInterval(sync, POLL_INTERVAL_MS);
    sync(true);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    raised = false;
    peeking = false;
    clearInterval(timer);
    timer = null;
    if (probe) api.DestroyWindow(probe);
    probe = 0;
    if (win.isDestroyed()) return;
    win.unhookWindowMessage(WM_WINDOWPOSCHANGING);
    api.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle(hwnd) & ~WS_EX_TOOLWINDOW);
    api.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_Z_ONLY);
    if (win.isVisible()) win.moveTop();
  }

  // 临时调到最前；失去焦点后自动沉回桌面
  function peek() {
    if (!enabled || win.isDestroyed()) return;
    startPeek();
    win.show();
    win.focus();
    if (!raised) win.moveTop();
  }

  // 托盘图标用：点击托盘会先让窗口失焦并沉回桌面，这时不应再把它调出来
  function togglePeek() {
    if (Date.now() - peekEndedAt < PEEK_TOGGLE_GRACE_MS) return;
    peek();
  }

  win.on('blur', () => {
    if (peeking && !holdsFocus()) endPeek();
  });
  win.on('show', () => sync(true));

  return {
    enable,
    disable,
    peek,
    togglePeek,
    get enabled() {
      return enabled;
    }
  };
}

module.exports = { create };
