# Robot Hand Android App

Android App 使用 Capacitor 封装现有网页。根目录的 `index.html` 仍然是网页版入口，App 构建不会替换它。

## 当前结构

- 网页版继续使用 Web Bluetooth 和 Web Serial。
- Android App 使用原生 BLE 插件连接 `RobotHand_BLE`。
- BLE Service UUID 和 Characteristic UUID 与现有 ESP32 程序一致。
- App 内置 MediaPipe、动作规则和 Prompt，页面与摄像头手势识别资源可以离线加载。
- ESP32 协议保持 `{p0,p1,p2,p3,p4}`，贝塞尔插值仍由前端计算。

## 环境要求

- Node.js 22 或更高版本
- Android Studio
- JDK 21
- Android SDK 36
- 一台支持 BLE 的 Android 真机

## 构建命令

```powershell
npm.cmd install
npm.cmd run android:sync
npm.cmd run android:open
```

在 Android Studio 中连接手机后运行 `app`，或使用 **Build > Build APK(s)** 生成 APK。

每次修改根目录的 `index.html`、`js/` 或 `prompts/` 后，重新执行：

```powershell
npm.cmd run android:sync
```

## 离线范围

以下功能不需要互联网：

- App 页面
- BLE 连接和机械手控制
- 五指滑块、预设手势和贝塞尔动作
- 本地动作判断规则
- MediaPipe 摄像头手部追踪

Cloud AI 仍需要互联网。Android 系统语音识别是否离线取决于手机安装的语言包；完全离线 STT 和手机端大模型需要后续单独集成。
