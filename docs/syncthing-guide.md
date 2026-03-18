# SyncThing 同步指南

## 1. 当前适用范围

- 桌面端仍支持通过 `设置 -> 数据管理 -> 更改存储路径` 把 `controler-data.json` 放到可同步目录
- React Native 移动端现在使用应用私有数据目录，不再提供移动端同步目录切换

## 2. 当前数据结构

- 应用会把主要业务数据集中写入单个 JSON 文件：`controler-data.json`
- 数据文件包含：
  - `projects`
  - `records`
  - `plans`
  - `todos`
  - `checkinItems`
  - `dailyCheckins`
  - `yearlyGoals`
  - `diaryEntries`
  - `customThemes`
  - `tableScaleSettings`

## 3. 桌面端推荐做法

1. 打开 `设置`
2. 在 `数据管理` 中点击 `更改存储路径`
3. 选择你准备交给 SyncThing 的文件夹
4. 应用会把当前数据迁移到该文件夹下的 `controler-data.json`
5. 页面会自动刷新，并从新路径重新加载数据

## 4. 验证方式

### 验证 1：确认是不是单文件存储

- 打开 `设置`
- 查看 `当前存储路径`
- 在该目录下确认存在 `controler-data.json`

### 验证 2：确认桌面端路径切换是否生效

- 在应用里执行一次 `更改存储路径`
- 返回 `设置`
- 检查 `当前存储路径` 是否已经更新
- 到新目录确认 `controler-data.json` 的修改时间是否变化

## 5. 说明

- 如果你依赖 SyncThing 跨设备共享，请优先使用桌面端可控目录
- React Native 移动端不再暴露旧的公开文档目录方案
