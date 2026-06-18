<p align="center">

&#x20; <h1 align="center">🤖 Embodied AI Soft Robotic Hand</h1>

</p>



<p align="center">

A tendon-driven silicone robotic hand controlled by ESP32, Web Interface and AI Voice Commands.

</p>



<p align="center">

English | <a href="./README\_CN.md">中文</a>

</p>



\---



\# 0. 📖 Introduction



This project presents an embodied AI soft robotic hand capable of performing natural finger movements through a tendon-driven actuation system. The robotic hand is controlled by ESP32 microcontrollers and can be operated through a browser-based dashboard or AI-powered voice commands.



The goal of the project is to combine soft robotics, embedded systems, wireless communication and artificial intelligence into a single interactive platform. By integrating a web interface with large language model (LLM) capabilities, users can control the robotic hand using natural language instead of traditional control methods.



\---



\# 1. ✨ Features



\* Real-time finger control

\* Independent control of all five fingers

\* Preset hand gestures

\* AI voice command interaction

\* Natural language understanding

\* BLE communication

\* USB serial communication

\* ESP-NOW wireless transmission

\* Modern web-based dashboard



\---



\# 2. 🏗 System Architecture



```text

Web Interface

&#x20;     │

&#x20;BLE / USB

&#x20;     │

&#x20;     ▼

ESP32 Transmitter

&#x20;     │

&#x20;  ESP-NOW

&#x20;     │

&#x20;     ▼

ESP32 Receiver

&#x20;     │

&#x20;  PCA9685

&#x20;     │

&#x20;Servo Motors

&#x20;     │

Soft Robotic Hand

```



The web dashboard sends control commands to the ESP32 transmitter through either BLE or USB communication. Commands are then transmitted wirelessly via ESP-NOW to the receiver ESP32, which drives the servo motors through a PCA9685 controller to actuate the silicone robotic hand.



\---



\# 3. 🔧 Hardware



\* Seeed Studio XIAO ESP32S3

\* PCA9685 Servo Driver

\* 5 Servo Motors

\* Tendon-driven Mechanism

\* Silicone Soft Robotic Hand

\* USB Type-C Communication



\---



\# 4. 💻 Software Stack



\### Frontend



\* HTML5

\* CSS3

\* JavaScript



\### Embedded Systems



\* Arduino IDE

\* ESP32

\* ESP-NOW

\* BLE



\### AI Integration



\* DeepSeek API



\---



\# 5. 📂 Project Structure



```text

robot-hand/

│

├── README.md

├── README\_CN.md

├── index.html

└── api/

```



\---



\# 6. 📸 Demonstration



The prototype consists of a tendon-driven silicone hand actuated by five servo motors. Through the web interface, users can control each finger individually, execute predefined gestures, and interact with the robotic hand using voice commands.



Project photos, videos and additional demonstrations will be added as development continues.





\---



\# 8. 👨‍💻 Author



Haihui Dong



Temasek Polytechnic



Diploma in Electronics



GitHub:

https://github.com/donghaihui060708



\---



\# 9. 📌 Copyright



© 2026 Haihui Dong



This repository is published for educational and portfolio purposes.



All rights reserved.



