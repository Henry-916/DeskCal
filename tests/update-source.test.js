const test = require('node:test');
const assert = require('node:assert/strict');
const UpdateSource = require('../src/update-source');
const packageJson = require('../package.json');
const fs = require('node:fs');
const path = require('node:path');

test('应用内更新的仓库与打包时写入的发布配置一致', () => {
  const [publish] = packageJson.build.publish;
  assert.equal(publish.provider, 'github');
  assert.equal(publish.owner, UpdateSource.owner);
  assert.equal(publish.repo, UpdateSource.repo);
  assert.equal(
    UpdateSource.releasesUrl,
    `https://github.com/${publish.owner}/${publish.repo}/releases/latest`
  );
});

test('打包脚本只生成安装包，不会自动发布', () => {
  assert.match(packageJson.scripts['dist:win'], /--publish never/);
});

test('安装更新时显示安装程序，不做静默安装', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'updater.js'), 'utf8');
  // 静默安装时进度和失败都看不到，用户只会看到应用退出后没有任何反应
  assert.match(source, /quitAndInstall\(false, true\)/);
  assert.doesNotMatch(source, /quitAndInstall\(true/);
  assert.match(source, /autoInstallOnAppQuit = false/);
});
