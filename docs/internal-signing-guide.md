# 内部分发免费签名

这份方案适用于你能控制设备的场景，例如自用、测试机、公司内网或手动分发。

## Android APK

### 1. 生成正式 keystore

```powershell
cd F:\code\Order
npm run cert:android:release -- -StorePassword "change-me"
```

默认会生成：

- `ControlerApp/android/release.jks`
- `ControlerApp/android/key.properties`

也可以手动生成 keystore，再按下面方式配置 `key.properties`。

### 2. 配置 `key.properties`

```properties
storeFile=release.jks
storePassword=your-store-password
keyAlias=order
keyPassword=your-key-password
```

当前 Android 构建已经改为优先读取 `key.properties`。如果没有这个文件，会回退到调试签名，避免开发流程中断。

### 3. 构建 APK

```powershell
cd F:\code\Order
npm run mobile:apk
```

产物会输出到：

- `dist/Order-<version>-android.apk`

### 4. 更新要求

- 后续所有 Android 更新都必须使用同一个 `release.jks`
- 如果 keystore 丢失，已有安装包将无法继续覆盖升级

## Windows EXE

### 1. 生成自签名代码签名证书

仓库里已经提供脚本：

```powershell
cd F:\code\Order
npm run cert:win:self-signed -- -Password "change-me"
```

默认会输出：

- `certs/OrderInternal.pfx`
- `certs/OrderInternal.cer`

### 2. 用 `.pfx` 给安装包签名

一条命令直接构建已签名安装包：

```powershell
cd F:\code\Order
npm run dist:win:self-signed -- -Password "change-me"
```

如果你想手动控制环境变量，也可以继续使用下面的方式：

```powershell
cd F:\code\Order
$env:WIN_CSC_LINK="F:\code\Order\certs\OrderInternal.pfx"
$env:WIN_CSC_KEY_PASSWORD="change-me"
npm run dist:win
```

产物会输出到：

- `dist/Order-<version>-win-x64.exe`

### 3. 在内部设备上建立信任

把 `certs/OrderInternal.cer` 导入目标机器。

- 首选导入到 `Trusted Publishers`
- 如果机器仍然不信任该自签证书，再同时导入到 `Trusted Root Certification Authorities`

企业环境建议用组策略统一下发。

### 4. 构建环境说明

如果 `electron-builder` 在签名阶段因为符号链接权限失败：

- 先启用 Windows Developer Mode
- 或者使用具备创建符号链接权限的管理员环境打包

## Git 与密钥管理

仓库已经忽略以下敏感文件，不会默认提交到 Git：

- `ControlerApp/android/key.properties`
- `ControlerApp/android/*.jks`
- `ControlerApp/android/*.keystore`
- `certs/*.pfx`
- `certs/*.cer`

## 适用范围

这套方案只适合内部分发。

- Android: 可长期免费使用
- Windows: 只有导入并信任了你的证书的机器，才会把你的发布者视为可信
- 如果要公开对外分发，Windows 仍然建议使用受信任 CA 的正式代码签名证书
