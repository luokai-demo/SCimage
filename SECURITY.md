# 安全说明

## 仓库默认策略

`SCimage` 建议默认使用私有仓库管理。

原因很简单：

- 项目包含本地图片生成工作流
- 未来容易接触提供方配置、模型信息、工作流细节
- 发布流水线需要远端构建权限，公开前最好先把仓库级安全设置打满

## 已准备好的仓库安全能力

仓库内已经准备好这些与公开发布相关的内容：

- GitHub Actions 自动打 tag、自动构建、自动发布
- `Dependabot` 依赖更新配置
- 仓库安全配置脚本：
  - `scripts/configure_github_repo.py`

## 建议启用的 GitHub 仓库设置

如果仓库需要托管到 GitHub，建议至少启用这些设置：

1. 仓库可见性设为私有
2. 打开 `Dependabot alerts`
3. 打开 `Dependabot security updates`
4. 打开 `Secret scanning`
5. 打开 `Push protection`
6. 打开 `Immutable releases`
7. 保护默认分支，禁止强推和直接删除
8. 合并后自动删除分支
9. 关闭不必要的 fork / wiki

如果仓库后续必须公开，再额外打开：

1. `Private vulnerability reporting`
2. 继续保留 `Secret scanning` 与 `Push protection`
3. 确保发布包只来自 GitHub Actions 的受控构建

## 一键配置命令

在已经满足下面两个前提后：

- 本机已执行 `gh auth login`
- GitHub 上已经存在目标仓库

可以直接执行：

```bash
python3 scripts/configure_github_repo.py owner/repo --visibility private
```

如果仓库已经决定公开，可执行：

```bash
python3 scripts/configure_github_repo.py owner/repo --visibility public
```

## 密钥与本地数据

- 不要把真实 API Key 写入版本库
- 本地生成目录、配置文件、任务记录都应继续保留在本地数据目录
- 推送前优先检查：
  - `.local/`
  - `generated/`
  - 测试样本
  - 截图、日志、导出文件

## 漏洞反馈

在仓库公开前，优先使用私下渠道处理安全问题，不建议直接公开提 issue。
