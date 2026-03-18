# Order

Order 是一个本地优先的时间管理应用，聚合了时间记录、统计、计划、待办、打卡、日记和桌面/移动小组件能力，面向个人使用与自托管数据管理。

Order is a local-first time management app that combines time tracking, statistics, planning, todos, check-ins, diary workflows, and desktop/mobile widgets for personal use and self-managed data.

## 项目简介 / Overview

Order 使用 Electron 提供桌面端体验，使用 React Native 提供移动端壳层，并共享同一套核心页面与数据结构。

Order uses Electron for the desktop app, React Native for the mobile shell, and a shared set of pages and storage structures across platforms.

## 核心功能 / Core Features

- 时间记录、项目层级、统计图表与热图
- 年 / 月 / 周计划视图，待办与打卡跟踪
- 日记记录与分类管理
- 桌面小组件与 Android 小组件入口
- 本地 JSON 文件、Electron 存储与浏览器/移动端本地存储适配

- Time tracking, project hierarchy, charts, and heatmaps
- Year / month / week planning views, todos, and check-ins
- Diary entries and category management
- Desktop widgets and Android widget entrypoints
- Local JSON storage plus Electron, browser, and mobile storage adapters

## 平台与运行方式 / Platforms And Runtime

- 桌面端：Electron，主要面向 Windows，仓库中也保留 macOS 打包脚本
- 移动端：React Native，当前仓库包含 Android 与 iOS 工程（无ios安装包）
- 浏览器模式：可用于部分页面调试，但完整存储路径管理与桌面小组件能力依赖 Electron 或原生壳层

- Desktop: Electron, primarily used for Windows, with macOS packaging scripts kept in the repo
- Mobile: React Native projects for Android and iOS（no ios for download）
- Browser mode: useful for partial page debugging, but full storage-path management and desktop widget support require Electron or a native shell

## 数据与隐私 / Data And Privacy

- 项目默认是本地优先，不依赖本仓库自带的云端服务
- 数据通常保存在本地 JSON 文件或平台本地存储中
- 你可以自行选择 Syncthing、共享文件夹或第三方云盘做文件同步，但这些不属于本项目托管服务

- The project is local-first by default and does not ship with a hosted backend
- Data is typically stored in a local JSON file or platform-local storage
- You may choose Syncthing, shared folders, or third-party cloud drives for file sync, but those are external choices and not hosted by this project

## 快速开始 / Quick Start

建议使用 **Node.js 20.19.4 或更高版本** 进行完整开发与移动端构建。桌面端旧环境可能仍可运行，但当前 React Native / Metro 工具链已要求更高的 Node 版本。

Use **Node.js 20.19.4 or later** for full development and mobile builds. Older environments may still work for some desktop tasks, but the current React Native / Metro toolchain now expects a newer Node version.

### 桌面端 / Desktop

```bash
npm install
npm start
```

### Windows 打包 / Windows Packaging

```bash
npm run dist:win
```

内部设备免费签名流程见 [docs/internal-signing-guide.md](/f:/code/Order/docs/internal-signing-guide.md)。
如需直接生成自签名安装包，可用 `npm run dist:win:self-signed -- -Password "change-me"`。

### 移动端安装依赖 / Mobile Dependencies

```bash
npm run mobile:install
```

### Android 开发 / Android Development

```bash
npm run mobile:start
npm run mobile:android
```

### Android Release APK

```bash
npm run mobile:apk
```

Android / Windows 内部分发免费签名流程见 [docs/internal-signing-guide.md](/f:/code/Order/docs/internal-signing-guide.md)。
Android release keystore 可用 `npm run cert:android:release -- -StorePassword "change-me"` 生成。

## 开发与构建命令 / Dev And Build Commands

- `npm start`: 启动 Electron 开发环境
- `npm run build`: 运行 Electron Builder
- `npm run dist:win`: 构建 Windows NSIS 安装包
- `npm run mobile:install`: 安装移动端依赖
- `npm run mobile:start`: 启动 React Native Metro
- `npm run mobile:android`: 运行 Android 调试构建
- `npm run mobile:apk`: 构建 Android release APK 并复制产物
- `npm run mobile:ios`: 构建 iOS release

## 开源许可 / Open-Source License

本项目以 [MIT License](./LICENSE) 发布。

This project is released under the [MIT License](./LICENSE).

## 赞助说明 / Sponsors

- 赞助者可获得公开鸣谢或有限支持优先级
- 除非另有书面协议，赞助不附带商业授权、专属功能、所有权转移、服务等级协议或法律担保
- 项目仍按 MIT 许可开放，其他用户依旧可在许可范围内使用、修改和分发

- Sponsors may receive public acknowledgement or limited support priority
- Unless separately agreed in writing, sponsorship does not grant a commercial license, exclusive features, ownership transfer, service-level commitments, or legal guarantees
- The project remains available under MIT, and other users may still use, modify, and redistribute it within that license

## 免责声明 / Disclaimer

本项目按“现状”提供。你需要自行负责数据备份、同步策略和第三方服务选择；导入、同步、设备故障或第三方云盘导致的数据问题，不承诺可恢复或可追偿。详见 [DISCLAIMER.md](./DISCLAIMER.md)。

This project is provided “as is”. You are responsible for your own backups, sync strategy, and third-party service choices; no recovery or compensation is promised for issues caused by imports, sync conflicts, device failures, or third-party cloud drives. See [DISCLAIMER.md](./DISCLAIMER.md).

## 第三方许可说明 / Third-Party Notices

仓库中 vendored 的前端依赖说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

Notices for vendored frontend dependencies shipped in this repository are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
