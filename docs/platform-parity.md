# 平台对齐清单

## 目标

- 正式目标平台固定为 `Android + iOS + Electron macOS`
- 对齐标准是业务结果等价，不要求逐项复刻 Android 交互
- 新增跨端功能前，必须先更新共享契约与本清单，再进入实现

## 单一契约

- 共享契约文件：`shared/platform-contract.js`
- 镜像副本：
  - `pages/platform-contract.js`
  - `ControlerApp/platform-contract.js`
  - `ControlerApp/android/app/src/main/assets/controler-web/platform-contract.js`
  - `ControlerApp/ios/controler-web/platform-contract.js`
- `prepare:web-assets` 会同步契约与 pages 资源
- `verify:parity` 会校验契约镜像、pages/mobile 资源、RN bridge 方法集合、Android widget kind / launch action

## 能力字段

- `capabilities.storageSourceSwitch`
- `capabilities.bundleExportImport`
- `capabilities.nativeReminders`
- `capabilities.widgets`
- `capabilities.widgetKinds`
- `capabilities.launchActions`
- 内部扩展能力：
  - `widgetPinning`
  - `widgetManualAdd`
  - `openHomeScreen`
  - `desktopWidgets`

## Widget Kind

统一注册表只保留一份，当前 8 个 kind：

- `start-timer`
- `write-diary`
- `week-grid`
- `day-pie`
- `todos`
- `checkins`
- `week-view`
- `year-view`

## 平台实现

### Android

- React Native runtime metadata 来自共享契约
- 原生 bridge 方法集合受 `verify:parity` 约束
- 原生提醒继续由 Android 本地存储和调度器负责
- `syncNotificationSchedule` 已接入为兼容入口，当前会回落到 Android 现有原生重排逻辑
- widget pin / launcher action / home screen 返回仍使用 Android 原生实现

### iOS

- React Native runtime metadata 来自共享契约
- 已补齐 bridge 方法集合，并由 `verify:parity` 校验 bridge / WidgetKit / entitlements 资产同时存在
- 已接入：
  - `UIDocumentPicker + security-scoped bookmark`
  - 外部 JSON 文件切换、外部目录 bundle 切换、默认私有 bundle 重置
  - ZIP / 旧整包 JSON / 单分区 JSON 导入
  - `UNUserNotificationCenter` 权限申请
  - JS 生成提醒表后的本地通知重排
  - JSON 导出分享
  - bundle ZIP / partition JSON 导出分享
  - 通知点击 / URL scheme -> pending launch action -> 页面层消费
  - App Group widget snapshot 写入
  - WidgetKit extension（8 个 kind 与共享 kind 清单对齐）
  - `refreshWidgets` 触发 WidgetKit reload
- 当前剩余风险：
  - 当前工作环境无法本地执行 `xcodebuild`，iOS 原生工程改动仅完成代码与静态校验，仍需在 macOS/Xcode 环境做一次真机或模拟器编译确认

### macOS(Electron)

- Electron runtime metadata 来自共享契约
- 桌面小组件元数据改为读取共享契约
- 页面层通过 `electronAPI.runtimeMeta.capabilities` 判断能力
- 提醒改为 Electron main-process 调度：
  - renderer 负责生成未来提醒表
  - preload 暴露 `notificationsRequestPermission` / `notificationsSyncSchedule`
  - main process 持久化提醒表并发送系统通知
  - 通知点击复用 `openMainWindowAction`

## 页面层要求

- 不再用 `isAndroid` 硬编码决定是否支持 widgets / reminders / export-import
- 统一从 runtime capability 判断：
  - `pages/widget-bridge.js`
  - `pages/settings.js`
  - `pages/reminders.js`
  - `pages/widget.js`
  - `pages/widget-android-parity.js`

## 构建准入

- `npm run verify:parity`
- `npm test`
- 下列入口会先执行 `prepare:web-assets + verify:parity`
  - `mobile:apk`
  - `mobile:ios`
  - `dist:mac`
- `verify:parity` 额外覆盖：
  - iOS WidgetKit extension 文件存在
  - iOS 主 App / Widget extension entitlements 挂载
  - iOS URL scheme 存在

## 后续新增功能流程

1. 先更新 `shared/platform-contract.js`
2. 更新本清单的能力定义与平台实现说明
3. 同步 Android / iOS / Electron / 页面层实现
4. 运行 `prepare:web-assets`
5. 运行 `verify:parity`
6. 校验通过后再进入云端打包
