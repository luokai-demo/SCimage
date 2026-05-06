# SCimage

一个本地运行的通用图像生成工作台，同时支持网页开发态和桌面便携包。

## 项目说明

如果你想先快速了解这个项目，建议按下面顺序看：

- [项目说明](./docs/项目说明.md)
- [发布说明](./docs/发布说明.md)
- [安全说明](./SECURITY.md)

## 开发态启动

前端已经切换为 `Vue 3 + TypeScript + Vite + Pinia`。主要界面已经组件化，业务状态拆分到 Pinia store 与组合式逻辑中。修改 `src/` 后需要先构建静态资源：

```bash
npm install
npm run build
```

在项目根目录运行：

```bash
./启动网页.command start
```

默认会启动一个本地服务，地址是 `http://127.0.0.1:8765/`。

常用命令：

```bash
npm run typecheck
npm run test:browser
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

- 构建 Vue/Vite 前端资源到 `webapp/static`
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

## v1.1.1 重点

- 任务刷新升级为服务端推送，任务状态变化更及时
- 后端路由、任务队列、图像生成链路和提供方配置继续按职责拆分
- 前端运行时、输出参数、图库、任务队列和族谱组件进一步模块化
- 图生图右侧结果区稳定为族谱/图库工作区，左侧任务队列默认收起不遮挡结果
- 修复族谱导航小地图黑屏问题，并补充小地图可见性回归测试
- 补齐发布前校验、隐私扫描、静态产物检查和多组浏览器回归

## v1.1.0 重点

- 前端完成 Vue 组件化与 Pinia 状态管理切换
- 图库支持横向顺序瀑布流，以及按任务、按提示词分组查看
- 分组视图改为左侧文字、右侧图片，并处理长任务名和长提示词
- 提示词库融合已保存提示词和内置中文词组，支持搜索、添加、再次点击取消
- 基础控件统一使用组件库和图标库，弹窗、下拉、设置与排序控件更一致

## 说明

- 桌面版会直接打开独立窗口，不再依赖手动打开浏览器
- Windows 桌面版依赖系统 WebView2 Runtime；如果缺失，启动时会直接提示
- 图像生成链路已改成服务内直接调用 Python 业务函数，不再依赖源码脚本路径
- 工作区状态当前通过后端本地文件持久化，不依赖浏览器本地存储
