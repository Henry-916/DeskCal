const test = require('node:test');
const assert = require('node:assert/strict');
const UpdateSource = require('../src/update-source');
const packageJson = require('../package.json');

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
