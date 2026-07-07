<h1 align="center">🤖 Embodied AI 机器人硅胶手</h1>

<p align="center">
基于 ESP32、网页控制界面与 AI 语音指令的线驱动硅胶机器人手系统
</p>

<p align="center">
<a href="./README.md">English</a> | 中文
</p>

<hr>


<h1>0. 📖 项目简介</h1>



本项目是一套基于 ESP32 的软体机器人手控制系统，通过拉绳驱动机构实现五根手指的运动控制。用户可以通过网页控制界面或 AI 语音指令与机器人手进行实时交互。



项目融合了软体机器人、嵌入式系统、无线通信以及人工智能等技术，旨在探索更加自然和直观的人机交互方式。通过将大语言模型与网页控制平台结合，用户能够使用自然语言直接控制机器人手完成指定动作。





<h1>1. ✨ 主要功能</h1>



* 五指独立控制
* 实时动作控制
* 预设手势执行
* AI 语音控制
* 自然语言指令解析
* BLE 蓝牙通信
* USB 串口通信
* ESP-NOW 无线传输
* 网页可视化控制界面



<h1>2. 🏗 系统架构</h1>



网页控制界面通过 BLE 或 USB 向 ESP32 发送控制指令，随后利用 ESP-NOW 无线通信将数据传输至接收端 ESP32。接收端通过 PCA9685 驱动多个舵机，从而实现硅胶机器人手的运动控制。





<h1>3. 🔧 硬件组成</h1>



* Seeed Studio XIAO ESP32S3
* PCA9685 舵机驱动板
* 5 个舵机
* 拉绳驱动机构
* 硅胶机器人手
* USB Type-C 通信





<h1> 4. 💻 软件技术</h1>



* 前端开发: HTML5, CSS3, JavaScript



* 嵌入式开发: Arduino IDE, ESP32, ESP-NOW, BLE



* AI 功能: DeepSeek API





<h1>5. 📂 项目结构</h1>



```text

robot-hand/

│

├── README.md

├── README_CN.md

├── index.html

└── api/

```



<h1>6. 📸 项目展示 </h1>



该系统采用五个舵机驱动的拉绳机构控制硅胶机器人手，实现多种基础手势和动作。用户可以通过网页实时控制各个手指，也可以利用 AI 语音指令直接驱动机器人手完成对应动作。



随着项目持续开发，后续将补充更多项目照片、演示视频以及实验成果展示。



<h1>7. 👨‍💻 作者</h1>



Dong Haihui



Temasek Polytechnic



Diploma in Electronics



GitHub：

https://github.com/donghaihui060708



<h1>8. 📌 版权声明</h1>



© 2026 Dong Haihui



本项目仅用于学习交流与个人作品展示用途。



保留所有权利。

<h1>9. Android 离线 AI</h1>

Android App 使用 llama.cpp 在手机本地运行 Qwen2.5 1.5B Instruct Q4_K_M。模型不会打包进 APK；首次在 App 的 AI 页面下载约 1.12 GB，下载并加载后可断网推理。

首次编译前运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-llm.ps1
npm.cmd run android:sync
```

随后在 Android Studio 中构建并安装 App。网页版本仍使用原来的 Cloud/Ollama 接口，不受 Android 本地模型影响。



