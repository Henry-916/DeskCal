// 应用内更新：从 GitHub Release 检查、下载并安装新版本。
// 只在安装版里工作；检查和下载都可能因为网络失败，失败时把状态如实报给界面。

const { app } = require('electron');
const UpdateSource = require('./update-source');

const CHECK_TIMEOUT_MS = 20000;

let autoUpdater = null;
let listener = () => {};
let status = { state: 'idle' };
let checkSource = 'manual';
let checkTimer = null;

// 开发模式下 electron-updater 默认不工作。未打包时可以用 DESKCAL_UPDATE_FEED 指定一个测试用的更新源：
// 填 github 表示正式的发布仓库，其他值当作普通 HTTP 地址。安装版不读这个变量。
function devFeed() {
  const value = app.isPackaged ? '' : process.env.DESKCAL_UPDATE_FEED || '';
  if (!value) return null;
  return value === 'github'
    ? { provider: 'github', owner: UpdateSource.owner, repo: UpdateSource.repo }
    : { provider: 'generic', url: value };
}

function supported() {
  return app.isPackaged || Boolean(devFeed());
}

function setStatus(next) {
  status = { ...next, currentVersion: app.getVersion() };
  listener(status);
}

function describeError(error) {
  const text = String(error?.message || error || '');
  if (/sha512|checksum/i.test(text)) return '下载的文件校验失败，请重试';
  if (/ERR_|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket|network/i.test(text)) {
    return '无法连接 GitHub，请检查网络后重试';
  }
  if (/404|latest\.yml|Cannot find/i.test(text)) return '没有找到可用的更新信息';
  return '更新没有成功';
}

function clearCheckTimer() {
  clearTimeout(checkTimer);
  checkTimer = null;
}

// 启动时的自动检查失败了不打扰用户；手动检查和下载失败要告诉用户
function fail(message) {
  clearCheckTimer();
  if (status.state === 'checking' && checkSource === 'auto') {
    setStatus({ state: 'idle' });
    return;
  }
  setStatus({ state: 'error', message, version: status.version });
}

function load() {
  if (autoUpdater) return autoUpdater;
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;
  const feed = devFeed();
  if (feed) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL(feed);
  }

  autoUpdater.on('update-available', (info) => {
    clearCheckTimer();
    setStatus({ state: 'available', version: info.version, source: checkSource });
  });
  autoUpdater.on('update-not-available', () => {
    clearCheckTimer();
    setStatus({ state: 'not-available', source: checkSource });
  });
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      version: status.version,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (error) => {
    console.error('DeskCal 更新失败：', error);
    fail(describeError(error));
  });
  return autoUpdater;
}

function check(source = 'manual') {
  if (!supported()) {
    setStatus({ state: 'unsupported' });
    return;
  }
  if (['checking', 'downloading', 'downloaded'].includes(status.state)) return;
  checkSource = source;
  setStatus({ state: 'checking', source });
  checkTimer = setTimeout(() => {
    if (status.state === 'checking') fail('连接 GitHub 超时，请稍后重试');
  }, CHECK_TIMEOUT_MS);
  // 失败会通过 error 事件上报，这里只是避免未处理的 Promise 拒绝
  load().checkForUpdates().catch(() => {});
}

function download() {
  if (!status.version || !['available', 'error'].includes(status.state)) return;
  setStatus({ state: 'downloading', version: status.version, percent: 0 });
  load().downloadUpdate().catch(() => {});
}

// 静默安装，装完自动重新打开
function install() {
  if (status.state !== 'downloaded') return;
  load().quitAndInstall(true, true);
}

module.exports = {
  check,
  download,
  install,
  status: () => ({ ...status, currentVersion: app.getVersion() }),
  onStatus: (callback) => {
    listener = callback;
  },
  releasesUrl: UpdateSource.releasesUrl
};
