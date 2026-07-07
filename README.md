<h1 align="center">🤖 Embodied AI Soft Robotic Hand</h1>

<p align="center">
A tendon-driven silicone robotic hand controlled by ESP32, Web Interface and AI Voice Commands.
</p>

<p align="center">
English | <a href="./README_CN.md">中文</a>
</p>
<hr>



<h1>0. 📖 Introduction</h1>



This project presents an embodied AI soft robotic hand capable of performing natural finger movements through a tendon-driven actuation system. The robotic hand is controlled by ESP32 microcontrollers and can be operated through a browser-based dashboard or AI-powered voice commands.



The goal of the project is to combine soft robotics, embedded systems, wireless communication and artificial intelligence into a single interactive platform. By integrating a web interface with large language model (LLM) capabilities, users can control the robotic hand using natural language instead of traditional control methods.





<h1>1. ✨ Features</h1>



* Real-time finger control
* Independent control of all five fingers
* Preset hand gestures
* AI voice command interaction
* Natural language understanding
* BLE communication
* USB serial communication
* ESP-NOW wireless transmission
* Modern web-based dashboard





<h1>2. 🏗 System Architecture</h1>



The web dashboard sends control commands to the ESP32 transmitter through either BLE or USB communication. Commands are then transmitted wirelessly via ESP-NOW to the receiver ESP32, which drives the servo motors through a PCA9685 controller to actuate the silicone robotic hand.





<h1>3. 🔧 Hardware</h1>

&#x20;Hardware



* Seeed Studio XIAO ESP32S3
* PCA9685 Servo Driver
* 5 Servo Motors
* Tendon-driven Mechanism
* Silicone Soft Robotic Hand
* USB Type-C Communication





<h1>4. 💻 Software Stack</h1>





* Frontend: HTML5, CSS3 and JavaScript



* Embedded Systems: Arduino IDE, ESP32, ESP-NOW and BLE



* AI Integration: DeepSeek API



<h1>5. 📂 Project Structure</h1>



```text

robot-hand/

│

├── README.md

├── README_CN.md

├── index.html

└── api/

```



<h1>6. 📸 Demonstration</h1>



The prototype consists of a tendon-driven silicone hand actuated by five servo motors. Through the web interface, users can control each finger individually, execute predefined gestures, and interact with the robotic hand using voice commands.



Project photos, videos and additional demonstrations will be added as development continues.





<h1>7. 👨‍💻 Author</h1>



Dong Haihui 



Temasek Polytechnic



Diploma in Electronics



GitHub:

https://github.com/donghaihui060708



<h1>8. 📌 Copyright</h1>



© 2026 Haihui Dong



This repository is published for educational and portfolio purposes.



All rights reserved.

<h1>9. Android Offline AI</h1>

The Android app runs Qwen2.5 1.5B Instruct Q4_K_M locally through llama.cpp. The model is not bundled in the APK; download the approximately 1.12 GB model once from the app's AI screen, load it, and inference can then run offline.

Before the first Android build, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-android-llm.ps1
npm.cmd run android:sync
```

Then build and install the app from Android Studio. The browser version retains its existing Cloud/Ollama path.



