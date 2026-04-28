# SCimage

`SCimage` 是一个本地运行的图像生成工作台，支持网页开发态与桌面便携包两种形态。

当前仓库采用“上级目录管理 Git / 下级目录承载实际项目”的结构：

- 仓库根目录：`/`
- 实际项目目录：`/SCimage`

## 文档入口

- [项目主说明](./SCimage/README.md)
- [项目说明](./SCimage/docs/项目说明.md)
- [发布说明](./SCimage/docs/发布说明.md)
- [安全说明](./SCimage/SECURITY.md)

## 目录说明

- `.github/`
  GitHub Actions、Dependabot 等仓库级配置
- `SCimage/`
  实际应用代码、脚本、测试、打包入口与产品文档

## 发布说明

GitHub Release、自动打标签与自动桌面发布都由仓库根目录下的 `.github/workflows/` 管理。

实际构建、测试、打包则在 `SCimage/` 子目录执行。
