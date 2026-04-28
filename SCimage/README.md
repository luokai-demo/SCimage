# SCimage

一个本地运行的通用图像生成工作台，同时支持网页开发态和桌面便携包。

## 项目说明

如果你想先快速了解这个项目，建议按下面顺序看：

- [项目说明](./docs/项目说明.md)
- [发布说明](./docs/发布说明.md)
- [安全说明](./SECURITY.md)

## 开发态启动

在项目根目录运行：

```bash
./启动网页.command start
```

默认会启动一个本地服务，地址是 `http://127.0.0.1:8765/`。

常用命令：

```bash
./启动网页.command status
./启动网页.command stop
./启动网页.command restart
```

开发态仍然使用项目内本地数据目录：

```text
generated/
.local/provider-profiles.json
.local/job-records.json
.local/workspace-state.json
```

## 桌面打包

项目根目录提供双击式一键打包入口：

- macOS：`一键打包.command`
- Windows：`一键打包.bat`

平台限制固定如下：

- Windows 包只能在 Windows 上构建
- macOS 包只能在 macOS 上构建

打包成功后的产物目录：

- Windows：`dist/windows/SCimage/SCimage.exe`
- macOS：`dist/macos/SCimage.app`

打包脚本会自动：

- 创建独立构建虚拟环境
- 安装 `pyinstaller`、`pywebview`、`openai`、`Pillow`
- 收集 `webapp/static` 资源
- 生成桌面图标与版本信息
- 清理旧的 `build/`、`dist/`

## GitHub 自动发布

仓库内已经加入 GitHub Actions 自动打包与发布：

- 推送到 `main` 后，会自动创建一个新 tag
- 自动 tag 格式为 `v<版本号>-r<4位流水号>`
- 如果同一流水号需要重发，则会追加 `-retry.<序号>`
- 新 tag 会自动触发桌面打包工作流
- 打包工作流会分别在 `Windows` 和 `macOS` runner 上构建
- 构建完成后会自动创建 GitHub Release，并上传：
  - `SCimage-windows.zip`
  - `SCimage-macos.zip`

版本号统一来自项目根目录的 `VERSION` 文件。

如果只是想手动试跑打包流程，也可以在 GitHub Actions 页面手动触发 `SCimage 桌面版发布`。

## 打包态数据目录

桌面包运行时，资源目录和用户数据目录已经拆开：

- Windows
  - 优先使用 `D:\SCimage`
  - 如果没有 `D:`，回退到 `SCimage.exe` 同级目录下的 `SCimage/`
- macOS
  - 固定使用 `~/Documents/SCimage`

打包态沿用同一份业务目录结构：

```text
generated/
.local/provider-profiles.json
.local/job-records.json
.local/workspace-state.json
```

## 提供方配置

页面左侧“提供方配置”支持：

- 保存当前配置
- 另存为新配置
- 下拉切换已保存配置
- 拉取模型并严格校验模型是否属于当前 API 支持列表

这些配置属于本地私有状态，不应该提交到版本库。

## 发布说明

每次 release 的重点更新，建议同时看两处：

- GitHub Release 页面：看桌面包产物和当次摘要
- [发布说明](./docs/发布说明.md)：看持续维护的中文更新记录

## 说明

- 桌面版会直接打开独立窗口，不再依赖手动打开浏览器
- Windows 桌面版依赖系统 WebView2 Runtime；如果缺失，启动时会直接提示
- 图像生成链路已改成服务内直接调用 Python 业务函数，不再依赖源码脚本路径
- 工作区状态当前通过后端本地文件持久化，不依赖浏览器本地存储
