import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..', '..');
const mobileRoot = resolve(projectRoot, 'mobile');
const webRoot = resolve(mobileRoot, 'web-src');
const publicRoot = resolve(webRoot, 'public');

await rm(webRoot, { recursive: true, force: true });
await mkdir(resolve(webRoot, 'src'), { recursive: true });
await mkdir(resolve(publicRoot, 'vendor', 'camera_utils'), { recursive: true });
await mkdir(resolve(publicRoot, 'vendor', 'hands'), { recursive: true });

let html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
html = html
  .replace(
    'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
    'vendor/camera_utils/camera_utils.js',
  )
  .replace(
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
    'vendor/hands/hands.js',
  )
  .replace(
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}',
    'vendor/hands/${file}',
  )
  .replace(
    '<script src="js/robot-hand-rules.js"></script>',
    '<link rel="stylesheet" href="mobile-app.css">\n<script type="module" src="/src/mobile-bridge.js"></script>\n<script src="js/robot-hand-rules.js"></script>',
  );

const postDepthModeHelper = [
  '',
  '',
  'async function postDepthMode(mode) {',
  '    const url = `${getDepthHttpUrl()}/mode`;',
  '    const nativeHttp = window.Capacitor?.Plugins?.CapacitorHttp;',
  '    if (window.Capacitor?.isNativePlatform?.() && nativeHttp?.post) {',
  '        const response = await nativeHttp.post({',
  '            url,',
  '            headers: { "Content-Type": "application/json" },',
  '            data: { mode }',
  '        });',
  '        if (response.status < 200 || response.status >= 300) {',
  '            throw new Error(`HTTP ${response.status}`);',
  '        }',
  '        return response;',
  '    }',
  '    const response = await fetch(url, {',
  '        method: "POST",',
  '        headers: { "Content-Type": "application/json" },',
  '        body: JSON.stringify({ mode })',
  '    });',
  '    if (!response.ok) throw new Error(`HTTP ${response.status}`);',
  '    return response;',
  '}',
  '',
].join('\n');

const nativeSpeechEvents = [
  '',
  'window.addEventListener("robot-hand-speech-partial", (event) => {',
  '    const transcript = event.detail?.transcript || "";',
  '    if (elderModeActive || elderVoiceListening) {',
  '        if (transcript) updateElderRestStatus(`Heard / 听到：${transcript}`);',
  '        if (elderTranscriptRequestsRest(transcript)) {',
  '            handleElderRestRequest("voice");',
  '            return;',
  '        }',
  '        return;',
  '    }',
  '    if (transcript) document.getElementById("speechText").textContent = `"${transcript}"`;',
  '});',
  '',
  'window.addEventListener("robot-hand-speech-finished", (event) => {',
  '    const recordButton = document.getElementById("recordBtn");',
  '    if (recordButton) recordButton.classList.remove("recording");',
  '    isRecording = false;',
  '    const transcript = (event.detail?.transcript || "").trim();',
  '    if (elderModeActive || elderVoiceListening) {',
  '        elderVoiceListening = false;',
  '        if (transcript && elderTranscriptRequestsRest(transcript)) handleElderRestRequest("voice");',
  '        if (Date.now() - elderRestTriggeredAt < 8000) return;',
  '        setTimeout(() => {',
  '            try { startElderVoicePause(); } catch (_) {}',
  '        }, 600);',
  '        return;',
  '    }',
  '    if (transcript) askLLM(transcript, currentSTTLanguage);',
  '});',
  '',
  'window.addEventListener("robot-hand-speech-error", (event) => {',
  '    const recordButton = document.getElementById("recordBtn");',
  '    if (recordButton) recordButton.classList.remove("recording");',
  '    isRecording = false;',
  '    if (elderModeActive || elderVoiceListening) {',
  '        const code = String(event.detail?.code || event.detail?.message || "").toUpperCase();',
  '        if (code.includes("NO_MATCH") || code.includes("SPEECH_TIMEOUT")) {',
  '            elderVoiceListening = false;',
  '            updateElderRestStatus("正在等待语音：可以说“暂停 / pause”“休息一下 / rest”。");',
  '            if (elderModeActive) {',
  '                setTimeout(() => {',
  '                    try { startElderVoicePause(); } catch (_) {}',
  '                }, 600);',
  '            }',
  '            return;',
  '        }',
  '        elderVoiceListening = false;',
  '        updateElderRestStatus("语音暂停暂时不可用：" + (event.detail?.message || "可以点击“休息一下”。"));',
  '        return;',
  '    }',
  '    const code = String(event.detail?.code || event.detail?.message || "").toUpperCase();',
  '    if (code.includes("NO_MATCH") || code.includes("SPEECH_TIMEOUT")) {',
  '        const transcript = (event.detail?.transcript || "").trim();',
  '        if (transcript) {',
  '            askLLM(transcript, currentSTTLanguage);',
  '            return;',
  '        }',
  '        setStatus("No voice detected. Please tap Speak and try again.");',
  '        return;',
  '    }',
  '    setStatus("Speech error: " + (event.detail?.message || "Native speech failed."));',
  '});',
  '',
].join('\n');

const mobilePiHostConfig = '';

html = html
  .replace(
    'const ELDER_REST_KEYWORDS = ["不舒服", "疼", "痛", "暂停", "停一下", "休息", "休息一下", "太快", "慢一点", "受不了", "累"];',
    'const ELDER_REST_KEYWORDS = ["不舒服", "疼", "痛", "暂停", "停一下", "休息", "休息一下", "太快", "慢一点", "受不了", "累", "pause", "stop", "rest", "take a break", "break", "slow down", "too fast", "pain", "hurt", "hurts", "tired", "uncomfortable"];',
  )
  .replace(
    /function elderTranscriptRequestsRest\(text\) \{\r?\n    const normalized = String\(text \|\| ""\)\.replace\(\/\\s\+\/g, ""\);\r?\n    return ELDER_REST_KEYWORDS\.some\(keyword => normalized\.includes\(keyword\)\);\r?\n\}/,
    `function elderTranscriptRequestsRest(text) {
    const normalized = String(text || "").toLowerCase().replace(/\\s+/g, "");
    return ELDER_REST_KEYWORDS.some(keyword => normalized.includes(String(keyword).toLowerCase().replace(/\\s+/g, "")));
}`,
  )
  .replace(
    /            <div class="pi-host-config">[\s\S]*?                <div id="piHostHint" class="pi-host-hint">Current Orbbec gateway host: handpi\.local<\/div>\r?\n            <\/div>/,
    mobilePiHostConfig,
  )
  .replace(
    'let PI_HOST = localStorage.getItem("pi_host") || "handpi.local";',
    'let PI_HOST = "handpi.local";',
  )
  .replace(
    'hint.textContent = `Current Orbbec gateway host: ${PI_HOST}${saved ? " (saved for this browser)" : " (default)"}`;',
    'hint.textContent = `Gateway: ${PI_HOST}${saved ? " (saved)" : " (default)"}`;',
  )
  .replace(
    /(async function resolveDepthGatewayHost\(\) \{[\s\S]*?    return depthRuntimeHost;\r?\n\})(\r?\n\r?\nfunction getStreamRecordInterval)/,
    `$1${postDepthModeHelper}$2`,
  )
  .replace(
    /        await resolveDepthGatewayHost\(\);\r?\n        const resp = await fetch\(`\$\{getDepthHttpUrl\(\)\}\/mode`, \{\r?\n            method: "POST",\r?\n            headers: \{ "Content-Type": "application\/json" \},\r?\n            body: JSON\.stringify\(\{ mode: "depth" \}\)\r?\n        \}\);\r?\n        if \(!resp\.ok\) throw new Error\(`HTTP \$\{resp\.status\}`\);\r?\n        connectDepthWebSocket\(\);/,
    `        await resolveDepthGatewayHost();
        await postDepthMode("depth");
        connectDepthWebSocket();`,
  )
  .replace(
    /        fetch\(`\$\{getDepthHttpUrl\(\)\}\/mode`, \{\r?\n            method: "POST",\r?\n            headers: \{ "Content-Type": "application\/json" \},\r?\n            body: JSON\.stringify\(\{ mode: "none" \}\)\r?\n        \}\)\.catch\(\(\) => \{\}\);/,
    `        postDepthMode("none").catch(() => {});`,
  )
  .replace(
    /function initRecognition\(\)\{\r?\n    const SpeechRecognition = window\.SpeechRecognition \|\| window\.webkitSpeechRecognition;/,
    `function initRecognition(){
    if (window.RobotHandNativeSpeech?.available) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;`,
  )
  .replace(
    /function startElderVoicePause\(\) \{\r?\n    const SpeechRecognition = window\.SpeechRecognition \|\| window\.webkitSpeechRecognition;/,
    `async function startElderVoicePause() {
    if (window.RobotHandNativeSpeech?.available) {
        if (elderVoiceListening) return;
        if (isRecording) {
            isRecording = false;
            finalTranscript = "";
            document.getElementById("recordBtn")?.classList.remove("recording");
            try { await window.RobotHandNativeSpeech.stop(); } catch (_) {}
        }
        elderVoiceListening = true;
        updateElderRestStatus("语音暂停已开启：可以说“暂停 / pause”“休息一下 / rest”“不舒服 / uncomfortable”。");
        try {
            await window.RobotHandNativeSpeech.start(currentSTTLanguage);
        } catch (err) {
            elderVoiceListening = false;
            updateElderRestStatus(\`语音暂停启动失败：\${err.message || err}\`);
        }
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;`,
  )
  .replace(
    /function stopElderVoicePause\(\) \{\r?\n    elderVoiceListening = false;/,
    `function stopElderVoicePause() {
    if (window.RobotHandNativeSpeech?.available) {
        window.RobotHandNativeSpeech.stop().finally(() => {
            elderVoiceListening = false;
        }).catch(() => {});
        return;
    }`,
  )
  .replace(
    /function handleElderRestRequest\(source = "button"\) \{[\s\S]*?    executeHardwarePipeline\("5"\);\r?\n\}/,
    `function handleElderRestRequest(source = "button") {
    const now = Date.now();
    if (now - elderRestTriggeredAt < 8000) return;
    elderRestTriggeredAt = now;
    elderVoiceListening = false;
    if (window.RobotHandNativeSpeech?.available) {
        window.RobotHandNativeSpeech.stop().catch(() => {});
    }
    pauseElderTraining();
    document.getElementById("trainingDifficulty").value = "easy";
    const statusText = source === "voice"
        ? "已听到休息指令：训练已暂停。Rest command heard: training paused."
        : "训练已暂停。Training paused.";
    const zhText = "训练已暂停，可以休息一下。稍后从简单模式继续。";
    const enText = "Training paused. You can rest now. Continue later in easy mode.";
    updateElderRestStatus(statusText);
    if (window.RobotHandNativeSpeech?.available && voiceEnabled) {
        window.RobotHandNativeSpeech.speak(zhText, "zh-CN")
            .then(() => window.RobotHandNativeSpeech.speak(enText, "en-US"))
            .catch((err) => setStatus("Speech playback failed: " + (err.message || err)));
    } else {
        speakReply(zhText + " " + enText, "zh-CN");
    }
    executeHardwarePipeline("5");
}`,
  )
  .replace(
    /\}\);\r?\n\r?\nasync function callCloudLLM/,
    `});
${nativeSpeechEvents}
async function callCloudLLM`,
  )
  .replace(
    /    clearAllTimers\(\);\r?\n    finalTranscript = "";\r?\n    initRecognition\(\);\r?\n    try \{ if \(recognition\) recognition\.start\(\); \} catch\(e\) \{ setStatus\("Speech start failed: " \+ e\.message\); \}/,
    `    clearAllTimers();
    finalTranscript = "";
    if (window.RobotHandNativeSpeech?.available) {
        elderVoiceListening = false;
        isRecording = true;
        document.getElementById("recordBtn").classList.add("recording");
        setStatus("Listening...");
        try {
            await window.RobotHandNativeSpeech.start(currentSTTLanguage);
        } catch(e) {
            isRecording = false;
            document.getElementById("recordBtn").classList.remove("recording");
            setStatus("Speech start failed: " + e.message);
        }
        return;
    }
    initRecognition();
    try { if (recognition) recognition.start(); } catch(e) { setStatus("Speech start failed: " + e.message); }`,
  )
  .replace(
    /        if \(recognition\) recognition\.stop\(\);\r?\n        return;/,
    `        if (window.RobotHandNativeSpeech?.available) {
            try { await window.RobotHandNativeSpeech.stop(); } catch(e) { setStatus("Speech stop failed: " + e.message); }
        } else if (recognition) recognition.stop();
        return;`,
  )
  .replace(
    /function speakReply\(text, langOverride = null\) \{[\s\S]*?window\.speechSynthesis\.speak\(utterance\);\r?\n\}/,
    `function speakReply(text, langOverride = null) {
    if (!voiceEnabled || !text) return;
    const hasChinese = /[\\u4e00-\\u9fff]/.test(String(text));
    const lang = hasChinese ? "zh-CN" : "en-US";
    if (window.RobotHandNativeSpeech?.available) {
        window.RobotHandNativeSpeech.speak(text, lang).catch((err) => {
            setStatus("Speech playback failed: " + (err.message || err));
        });
        return;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
}`,
  );

await writeFile(resolve(webRoot, 'index.html'), html, 'utf8');
await copyFile(resolve(mobileRoot, 'src', 'mobile-bridge.js'), resolve(webRoot, 'src', 'mobile-bridge.js'));
await copyFile(resolve(mobileRoot, 'src', 'mobile-app.css'), resolve(publicRoot, 'mobile-app.css'));
await cp(resolve(projectRoot, 'js'), resolve(publicRoot, 'js'), { recursive: true });
await cp(resolve(projectRoot, 'prompts'), resolve(publicRoot, 'prompts'), { recursive: true });

await copyFile(
  resolve(projectRoot, 'node_modules', '@mediapipe', 'camera_utils', 'camera_utils.js'),
  resolve(publicRoot, 'vendor', 'camera_utils', 'camera_utils.js'),
);
await cp(
  resolve(projectRoot, 'node_modules', '@mediapipe', 'hands'),
  resolve(publicRoot, 'vendor', 'hands'),
  { recursive: true },
);

console.log('Prepared offline mobile web assets in mobile/web-src.');
