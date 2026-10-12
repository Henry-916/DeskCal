// 应用内更新从这个 GitHub 仓库的 Release 获取，必须和 package.json 里 build.publish 的配置一致
const owner = 'Henry-916';
const repo = 'DeskCal';

module.exports = {
  owner,
  repo,
  releasesUrl: `https://github.com/${owner}/${repo}/releases/latest`
};
