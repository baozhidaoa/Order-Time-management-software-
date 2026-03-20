# 打包指南

## Electron 桌面应用

### 已完成基础

- 主进程入口：`main.js`
- 预加载桥：`preload.js`
- 存储管理类：`storage-manager.js`
- 构建脚本：
  - `npm run build`
  - `npm run dist:win`
  - `npm run dist:mac`

### 说明

- Windows 使用 `nsis`
- macOS 已保留 `dmg` 与 `zip` 目标
- Electron 打包时已排除 `ControlerApp/`，不会把 React Native 移动工程打进桌面安装包
- 内部分发免费签名流程见 [internal-signing-guide.md](/f:/code/Order/docs/internal-signing-guide.md)

## React Native 移动应用

### 项目位置

- 移动端工程：`ControlerApp/`
- Android 原生工程：`ControlerApp/android`
- iOS 原生工程：`ControlerApp/ios`

### 已完成基础

- 运行壳：`ControlerApp/App.tsx`
- WebView 原生桥：`ControlerApp/android/app/src/main/java/com/controlerapp/ControlerBridgeModule.java`
- iOS 原生桥：`ControlerApp/ios/ControlerApp/AppDelegate.mm`
- Android 小组件原生实现：`ControlerApp/android/app/src/main/java/com/controlerapp/widgets`

### 常用命令

- 同步 Web 资源：`npm run prepare:web-assets`
- 安装移动端依赖：`npm run mobile:install`
- 启动 Android 调试：`npm run mobile:android`
- 构建 Android APK：`npm run mobile:apk`
- 生成 Android release keystore：`npm run cert:android:release -- -StorePassword "change-me"`
- 构建 iOS：`npm run mobile:ios`
- 同步最新 `apk/exe` 和本地 `E:\App\Order`：`npm run sync:local:release`

### 平台说明

- Android 通过 React Native 原生工程生成 `apk`
- `npm run mobile:apk` 会在生成 `ControlerApp/android/app/build/outputs/apk/release/app-release.apk` 后，同步复制一份到 `dist/Order-<version>-android.apk`
- Windows 可用 `npm run dist:win:self-signed -- -Password "change-me"` 生成自签名安装包
- `npm run sync:local:release` 会把 `dist` 中当前最新版本同步到 `E:\App\Order`，并清理旧版 `apk / exe / setup / nupkg`
- iOS 工程已经切换为 React Native，但正式生成 `.app/.ipa` 仍需要 macOS + Xcode
- 移动端默认使用应用私有数据目录，不再保留旧的移动端同步目录切换逻辑
- Android / Windows 内部分发免费签名流程见 [internal-signing-guide.md](/f:/code/Order/docs/internal-signing-guide.md)

## 离线资源

- `pages/runtime-assets/chart.runtime.js`
- `pages/runtime-assets/d3.min.js`
- `pages/runtime-assets/cal-heatmap.min.js`
- `pages/runtime-assets/cal-heatmap.css`

这些资源由 `npm run prepare:web-assets` 自动同步，同时会复制到 React Native 移动端的离线资源目录。
