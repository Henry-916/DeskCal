# 参与贡献

感谢你愿意改进 DeskCal。提交代码前，请先搜索现有 Issue，避免重复工作；较大的功能建议先创建 Issue 讨论交互和兼容性。

## 本地开发

需要 Node.js 22 或更高版本，以及 Windows 10/11。

```powershell
npm ci
npm start
```

提交前请运行：

```powershell
npm run check
npm test
npm run smoke
```

## 提交规范

- 一个 Pull Request 尽量只解决一个问题。
- 保持现有代码风格，并为新增核心逻辑补充测试。
- 不要提交 `release/`、`node_modules/`、用户日历数据或任何密钥。
- 用户可见的变更应同步更新 README 或 CHANGELOG。
- Pull Request 中请说明改动目的、验证方式，以及涉及界面时的截图。

## 发布新版本

用 `npm run dist:win` 打包，产物在 `release/`。GitHub Release 里要同时上传安装包、`latest.yml` 和 `.exe.blockmap`，标签用 `v` 加版本号（如 `v0.9.1`）。应用内更新靠 `latest.yml` 发现新版本并校验安装包，缺了它已安装的用户就收不到更新。

## 报告问题

Bug 报告请包含 DeskCal 版本、Windows 版本、复现步骤、预期结果和实际结果。日志或截图中请先移除个人日程、路径及其他隐私信息。
