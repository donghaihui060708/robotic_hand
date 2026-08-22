import { Capacitor, registerPlugin } from '@capacitor/core';
import { BleClient, ScanMode } from '@capacitor-community/bluetooth-le';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { Camera, Hand, MessageCircle, SlidersHorizontal, createIcons } from 'lucide';

const DEVICE_NAME = 'RobotHand_BLE';
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const CHARACTERISTIC_UUID = 'abcd1234-5678-90ab-cdef-1234567890ab';
const LocalLlm = registerPlugin('LocalLlm');
const MdnsResolver = registerPlugin('MdnsResolver');

let initialized = false;
let connectedDeviceId = null;
let nativeNotificationsActive = false;
let speechListenersReady = false;
let speechSessionActive = false;
let speechLastText = '';
let liveTelemetryTimer = null;

function emitLocalLlmStatus(status) {
  window.dispatchEvent(new CustomEvent('robot-hand-local-llm-status', { detail: status }));
  return status;
}

function formatModelBytes(bytes) {
  if (!bytes || bytes < 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function updateTopLocalModelStatus(status, error = null) {
  const dot = document.getElementById('ollamaStatusDot');
  const text = document.getElementById('ollamaStatusText');
  const localButton = document.getElementById('btnLocalModel');
  if (!dot || !text || !localButton) return;

  const ready = Boolean(status?.loaded);
  const installed = Boolean(status?.installed);
  dot.style.background = ready ? '#39ff14' : installed ? '#d29922' : '#ff3b3b';
  text.textContent = ready ? 'Ready' : installed ? 'Downloaded' : error ? 'Unavailable' : 'Not installed';
  localButton.disabled = !ready;
}

function setupLocalModelManager() {
  const sourceBox = document.querySelector('.model-source-box');
  if (!sourceBox) return;

  const manager = document.createElement('section');
  manager.className = 'app-local-model-manager';
  manager.innerHTML = `
    <div class="app-local-model-heading">
      <div>
        <strong>Offline AI</strong>
        <span>Qwen2.5 1.5B · Q4_K_M · about 1.12 GB</span>
      </div>
      <span class="app-local-model-state" data-model-state>Checking</span>
    </div>
    <div class="app-local-model-progress" data-model-progress hidden>
      <span data-model-progress-bar></span>
    </div>
    <div class="app-local-model-meta" data-model-meta>Checking phone storage...</div>
    <div class="app-local-model-actions">
      <button type="button" data-model-download>Download</button>
      <button type="button" data-model-load hidden>Load model</button>
      <button type="button" data-model-cancel hidden>Cancel</button>
      <button type="button" class="danger" data-model-delete hidden>Delete</button>
    </div>
  `;
  sourceBox.after(manager);

  const stateText = manager.querySelector('[data-model-state]');
  const metaText = manager.querySelector('[data-model-meta]');
  const progress = manager.querySelector('[data-model-progress]');
  const progressBar = manager.querySelector('[data-model-progress-bar]');
  const downloadButton = manager.querySelector('[data-model-download]');
  const loadButton = manager.querySelector('[data-model-load]');
  const cancelButton = manager.querySelector('[data-model-cancel]');
  const deleteButton = manager.querySelector('[data-model-delete]');
  let pollTimer = null;

  function describeLocalLlmError(error) {
    const message = error?.message || error?.errorMessage || String(error || '').trim();
    if (!window.RobotHandNativeLLM?.available) {
      return 'Unavailable: not running inside the Android app.';
    }
    if (/not implemented|not available|plugin/i.test(message)) {
      return 'Unavailable: LocalLlm native plugin is not loaded. Reinstall the app from Android Studio.';
    }
    return message ? `Unavailable: ${message}` : 'Unavailable: no error detail returned by Android.';
  }

  function setBusy(busy) {
    manager.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
  }

  function render(status) {
    const downloading = ['pending', 'downloading', 'paused'].includes(status.status);
    const downloaded = status.downloadedBytes || 0;
    const total = status.totalBytes || 0;
    const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

    progress.hidden = !downloading;
    progressBar.style.width = `${percent}%`;
    downloadButton.hidden = status.installed || downloading;
    loadButton.hidden = downloading || !status.installed || status.loaded;
    cancelButton.hidden = !downloading;
    deleteButton.hidden = !status.installed;

    if (status.loaded) {
      stateText.textContent = 'Ready';
      stateText.dataset.tone = 'ready';
      metaText.textContent = `${formatModelBytes(status.bytes)} on phone · loaded in memory`;
    } else if (downloading) {
      stateText.textContent = status.status === 'paused' ? 'Paused' : `${percent}%`;
      stateText.dataset.tone = 'working';
      metaText.textContent = `${formatModelBytes(downloaded)} / ${total > 0 ? formatModelBytes(total) : 'calculating...'}`;
    } else if (status.installed) {
      stateText.textContent = 'Downloaded';
      stateText.dataset.tone = 'working';
      metaText.textContent = `${formatModelBytes(status.bytes)} on phone · tap Load model`;
    } else if (status.status === 'failed') {
      stateText.textContent = 'Failed';
      stateText.dataset.tone = 'error';
      metaText.textContent = status.error || 'Download failed. Please retry.';
    } else {
      stateText.textContent = 'Not installed';
      stateText.dataset.tone = 'muted';
      metaText.textContent = 'Download once over Wi-Fi, then use AI without internet.';
    }

    if (downloading && !pollTimer) pollTimer = window.setInterval(refresh, 1000);
    if (!downloading && pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    updateTopLocalModelStatus(status);
  }

  async function refresh() {
    try {
      if (!window.RobotHandNativeLLM?.available) {
        throw new Error('Not running inside the Android app.');
      }
      const status = await window.RobotHandNativeLLM.getStatus();
      render(status);
    } catch (error) {
      const detail = describeLocalLlmError(error);
      stateText.textContent = 'Unavailable';
      stateText.dataset.tone = 'error';
      metaText.textContent = detail;
      updateTopLocalModelStatus(null, error);
    }
  }

  async function run(action, busyLabel) {
    setBusy(true);
    stateText.textContent = busyLabel;
    stateText.dataset.tone = 'working';
    try {
      const status = await action();
      render(status);
    } catch (error) {
      stateText.textContent = 'Error';
      stateText.dataset.tone = 'error';
      metaText.textContent = error.message || 'Local model operation failed.';
    } finally {
      setBusy(false);
    }
  }

  downloadButton.addEventListener('click', () => run(
    () => window.RobotHandNativeLLM.downloadModel(),
    'Starting...',
  ));
  loadButton.addEventListener('click', () => run(
    () => window.RobotHandNativeLLM.loadModel(),
    'Loading...',
  ));
  cancelButton.addEventListener('click', () => run(
    () => window.RobotHandNativeLLM.cancelDownload(),
    'Cancelling...',
  ));
  deleteButton.addEventListener('click', () => run(
    () => window.RobotHandNativeLLM.deleteModel(),
    'Deleting...',
  ));

  window.setTimeout(refresh, 600);
}

function overrideDesktopLocalModelProbe() {
  window.checkOllamaAvailability = async () => {
    try {
      if (!window.RobotHandNativeLLM?.available) throw new Error('Not running inside the Android app.');
      updateTopLocalModelStatus(await window.RobotHandNativeLLM.getStatus());
    } catch (error) {
      updateTopLocalModelStatus(null, error);
    }
  };
}

function getText(id, fallback = '-') {
  return document.getElementById(id)?.textContent?.trim() || fallback;
}

function getAppLiveModeText() {
  const status = getText('status', 'Ready');
  const cameraActive = document.documentElement.classList.contains('camera-stream-active')
    || document.body.classList.contains('camera-stream-active');
  const glove = getText('gloveToggleStatus', 'DISABLED');
  const vr = getText('vrToggleStatus', 'DISABLED');
  const depth = getText('depthToggleStatus', 'DISABLED');

  if (/LIVE/i.test(depth)) return 'Depth';
  if (/LIVE/i.test(vr)) return 'VR';
  if (/LIVE/i.test(glove)) return 'Glove';
  if (cameraActive) return 'Camera';
  if (/BLE.*Connected/i.test(status)) return 'BLE';
  return 'Ready';
}

function getAppLiveDetailText() {
  const depth = getText('depthToggleStatus', 'DISABLED');
  if (/LIVE/i.test(depth)) {
    const depthDetail = getText('jsonPreview', '');
    const distance = depthDetail.match(/filtered=([\d.]+)mm/i)?.[1];
    const angle = depthDetail.match(/(?:target|angle)=([\d.]+)(?:deg)?/i)?.[1];
    if (distance && angle) return `${distance}mm -> ${angle}\u00b0`;
    if (distance) return `${distance}mm`;
  }
  return getText('status', 'Ready');
}

function setupLiveTelemetry(container) {
  if (!container || document.querySelector('.app-live-telemetry')) return;

  const telemetry = document.createElement('section');
  telemetry.className = 'app-live-telemetry';
  telemetry.innerHTML = `
    <div class="app-live-mode">
      <span>Status</span>
      <strong data-live-mode>Ready</strong>
    </div>
    <div class="app-live-angles">
      ${['P0', 'P1', 'P2', 'P3', 'P4'].map((label, index) => `
        <div>
          <span>${label}</span>
          <strong data-live-angle="${index}">0°</strong>
        </div>
      `).join('')}
      <div class="app-live-json">
        <span>Link</span>
        <strong data-live-status>Ready</strong>
      </div>
    </div>
  `;
  container.appendChild(telemetry);

  const update = () => {
    const mode = telemetry.querySelector('[data-live-mode]');
    const detailLabel = telemetry.querySelector('.app-live-json span');
    const status = telemetry.querySelector('[data-live-status]');
    const liveMode = getAppLiveModeText();
    if (mode) mode.textContent = liveMode;
    if (detailLabel) detailLabel.textContent = liveMode === 'Depth' ? 'Depth distance' : 'Link';
    if (status) status.textContent = getAppLiveDetailText();
    for (let i = 0; i < 5; i += 1) {
      const value = getText(`lblM${i}`, '0°');
      const target = telemetry.querySelector(`[data-live-angle="${i}"]`);
      if (target) target.textContent = value;
    }
  };

  update();
  if (liveTelemetryTimer) window.clearInterval(liveTelemetryTimer);
  liveTelemetryTimer = window.setInterval(update, 250);
}

function textToDataView(text) {
  const bytes = new TextEncoder().encode(text);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function notifyDisconnected() {
  connectedDeviceId = null;
  nativeNotificationsActive = false;
  window.dispatchEvent(new CustomEvent('robot-hand-ble-disconnected'));
}

async function startNativeBleFeedbackNotifications() {
  if (!connectedDeviceId || nativeNotificationsActive) return;
  await BleClient.startNotifications(
    connectedDeviceId,
    SERVICE_UUID,
    CHARACTERISTIC_UUID,
    (value) => {
      const text = new TextDecoder().decode(value);
      window.dispatchEvent(new CustomEvent('robot-hand-native-ble-feedback', {
        detail: { text },
      }));
    },
  );
  nativeNotificationsActive = true;
}

async function ensureInitialized() {
  if (initialized) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  initialized = true;

  if (!(await BleClient.isEnabled())) {
    await BleClient.requestEnable();
  }
}

function dispatchSpeechEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function numberToEnglishWords(value) {
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return value;
  if (number < 10) return ones[number];
  if (number < 20) return teens[number - 10];
  const ten = Math.floor(number / 10);
  const one = number % 10;
  return one ? `${tens[ten]} ${ones[one]}` : tens[ten];
}

function formatSpeechTextForLanguage(text, language) {
  const raw = String(text || '');
  if (!String(language || '').startsWith('en')) return raw;
  return raw.replace(/\b\d{1,2}\b/g, (match) => numberToEnglishWords(match));
}

async function finishSpeechSession() {
  if (!speechSessionActive) return;
  speechSessionActive = false;

  try {
    const result = await SpeechRecognition.getLastPartialResult();
    if (result.available && result.text) speechLastText = result.text;
  } catch (_) {
    // Keep the last transcript emitted by partialResults.
  }

  dispatchSpeechEvent('robot-hand-speech-finished', { transcript: speechLastText.trim() });
}

async function ensureSpeechListeners() {
  if (speechListenersReady) return;
  speechListenersReady = true;

  await SpeechRecognition.addListener('partialResults', (event) => {
    const transcript = event.accumulatedText || event.matches?.[0] || event.accumulated || '';
    if (!transcript) return;
    speechLastText = transcript;
    dispatchSpeechEvent('robot-hand-speech-partial', { transcript });
  });

  await SpeechRecognition.addListener('listeningState', (event) => {
    if (event.state === 'stopped' || event.status === 'stopped') finishSpeechSession();
  });

  await SpeechRecognition.addListener('error', (event) => {
    speechSessionActive = false;
    dispatchSpeechEvent('robot-hand-speech-error', {
      code: event.code || event.errorCode || '',
      transcript: speechLastText.trim(),
      message: event.message || event.code || 'Speech recognition failed.',
    });
  });
}

function setupMobileLayout() {
  const panels = [...document.querySelectorAll('.main-container > .panel')];
  if (!panels.length) return;

  const panelConfigs = [
    { selector: '#outputCanvas', tab: 'vision', title: 'Camera / 相机' },
    { selector: '#gloveDataToggle, #vrDataToggle, #depthDataToggle', tab: 'control', title: 'Wireless / 无线同步' },
    { selector: '#slideDuration', tab: 'control', title: 'Motion / 运动参数' },
    { selector: '#slideM0', tab: 'control', title: 'Motors / 五指控制' },
    { selector: '#macroRecordBtn', tab: 'control', title: 'Sequences / 动作序列' },
    { selector: '#trainingTemplateSelect, #btnRecordStandard, #btnRecordPresetStandard', tab: 'vision', title: 'Training / 训练' },
    { selector: '#textInput, #recordBtn', tab: 'ai', title: 'AI Assistant / AI 助手' },
    { selector: '.btn-grid .action-btn', tab: 'gestures', title: 'Gestures / 快捷手势' },
  ];

  panels.forEach((panel) => {
    const config = panelConfigs.find((item) => panel.querySelector(item.selector));
    panel.dataset.appTab = config?.tab || 'control';
    panel.classList.add('app-panel');
    const title = panel.querySelector('.panel-title');
    if (title && config?.title) title.textContent = config.title;
  });

  const headerTitle = document.querySelector('.header h2');
  if (headerTitle) headerTitle.textContent = 'ROBOTIC HAND';

  const startCameraButton = document.getElementById('startWebcamBtn');
  const stopCameraButton = document.getElementById('stopWebcamBtn');
  if (startCameraButton) startCameraButton.textContent = 'Open Camera';
  if (stopCameraButton) stopCameraButton.textContent = 'Stop Camera';

  const videoWrapper = document.querySelector('.video-wrapper');
  if (videoWrapper) {
    const cameraEmptyState = document.createElement('div');
    cameraEmptyState.className = 'app-camera-empty';
    cameraEmptyState.innerHTML = `
      <span class="app-camera-corner app-camera-corner-tl"></span>
      <span class="app-camera-corner app-camera-corner-tr"></span>
      <span class="app-camera-corner app-camera-corner-bl"></span>
      <span class="app-camera-corner app-camera-corner-br"></span>
      <i data-lucide="camera" aria-hidden="true"></i>
      <strong>Camera Preview</strong>
      <span>相机预览</span>
    `;
    videoWrapper.appendChild(cameraEmptyState);

  }

  const speechText = document.getElementById('speechText');
  if (speechText) {
    speechText.classList.add('app-bilingual-empty');
    speechText.innerHTML = '<span>Waiting for voice or text input...</span><span>等待语音或文字输入...</span>';
  }

  const voiceToggle = document.getElementById('voiceToggle');
  if (voiceToggle && !voiceToggle.checked) {
    voiceToggle.checked = true;
    window.toggleVoiceAssistant?.();
  }

  const recorderBar = document.querySelector('.rehab-bar');
  const mainContainer = document.querySelector('.main-container');
  if (recorderBar && mainContainer) {
    recorderBar.classList.add('app-global-recorder');
    const recordButton = document.getElementById('macroRecordBtn');
    const resetButton = document.getElementById('stopBtn');
    const indicator = document.getElementById('macroIndicator');
    if (recordButton) recordButton.textContent = 'Start Recording';
    if (indicator) indicator.textContent = 'Ready to record';
    if (resetButton) {
      resetButton.classList.remove('circle-btn');
      resetButton.classList.add('app-global-reset');
      resetButton.textContent = 'RESET';
      recorderBar.insertBefore(resetButton, indicator);
    }
    setupLiveTelemetry(recorderBar);
    mainContainer.before(recorderBar);
  }

  const tabs = [
    { id: 'control', label: 'Control', icon: 'control' },
    { id: 'vision', label: 'Camera', icon: 'camera' },
    { id: 'ai', label: 'AI', icon: 'message' },
    { id: 'gestures', label: 'Gestures', icon: 'hand' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'app-bottom-nav';
  nav.setAttribute('aria-label', 'App sections');
  nav.setAttribute('role', 'tablist');
  nav.innerHTML = tabs.map((tab) => `
    <button type="button" class="app-tab-button" data-tab="${tab.id}" role="tab" aria-label="${tab.label}">
      <i data-lucide="${tab.icon}" aria-hidden="true"></i>
      <span>${tab.label}</span>
    </button>
  `).join('');
  document.body.appendChild(nav);

  createIcons({
    icons: {
      camera: Camera,
      control: SlidersHorizontal,
      message: MessageCircle,
      hand: Hand,
    },
    attrs: { width: 22, height: 22, 'stroke-width': 1.8 },
  });

  const activateTab = (tabId, shouldScroll = true) => {
    panels.forEach((panel) => { panel.hidden = panel.dataset.appTab !== tabId; });
    nav.querySelectorAll('.app-tab-button').forEach((button) => {
      const active = button.dataset.tab === tabId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('.app-tab-button');
    if (button) activateTab(button.dataset.tab);
  });

  activateTab('control', false);
  setupLocalModelManager();
}

window.RobotHandNativeBLE = {
  available: Capacitor.isNativePlatform(),

  async connect() {
    await ensureInitialized();
    let device = null;
    try {
      const bondedDevices = await BleClient.getBondedDevices();
      device = bondedDevices.find((item) => (item.name || '').includes('RobotHand'));
    } catch (_) {
      // Continue with active scanning when the bonded-device list is unavailable.
    }

    if (!device) {
      device = await BleClient.requestDevice({
        optionalServices: [SERVICE_UUID],
        scanMode: ScanMode.SCAN_MODE_LOW_LATENCY,
      });
    }

    try {
      await BleClient.disconnect(device.deviceId);
    } catch (_) {
      // The device may not have an existing connection.
    }

    await BleClient.connect(device.deviceId, notifyDisconnected);
    connectedDeviceId = device.deviceId;
    await startNativeBleFeedbackNotifications();

    let mtu = null;
    try {
      mtu = await BleClient.getMtu(device.deviceId);
    } catch (_) {
      // MTU reporting is informative; writes can still succeed without it.
    }

    return { deviceId: device.deviceId, name: device.name || DEVICE_NAME, mtu };
  },

  async disconnect() {
    if (!connectedDeviceId) return;
    const deviceId = connectedDeviceId;
    connectedDeviceId = null;
    nativeNotificationsActive = false;
    await BleClient.disconnect(deviceId);
  },

  async write(payload) {
    if (!connectedDeviceId) throw new Error('Robot hand BLE is not connected.');
    const value = textToDataView(payload);
    try {
      await BleClient.writeWithoutResponse(
        connectedDeviceId,
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        value,
      );
    } catch (error) {
      if (!/write without response|writewithoutresponse|property|not supported/i.test(String(error?.message || error))) {
        throw error;
      }
      await BleClient.write(
        connectedDeviceId,
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        value,
      );
    }
  },
};

window.RobotHandNativeSpeech = {
  available: Capacitor.isNativePlatform(),

  async start(language) {
    await ensureSpeechListeners();
    await SpeechRecognition.requestPermissions();

    const support = await SpeechRecognition.available();
    if (!support.available) throw new Error('Speech recognition is unavailable on this phone.');

    let useOnDeviceRecognition = false;
    try {
      const onDevice = await SpeechRecognition.isOnDeviceRecognitionAvailable({ language });
      useOnDeviceRecognition = onDevice.available;
    } catch (_) {
      // Older Android speech services can still use the standard recognizer.
    }

    speechLastText = '';
    speechSessionActive = true;
    await SpeechRecognition.start({
      language,
      maxResults: 1,
      partialResults: true,
      popup: false,
      allowForSilence: 1500,
      useOnDeviceRecognition,
    });

    return { onDevice: useOnDeviceRecognition };
  },

  async stop() {
    if (!speechSessionActive) return;
    await SpeechRecognition.forceStop({ timeout: 1000 });
    await finishSpeechSession();
  },

  async speak(text, language) {
    const effectiveLanguage = language || (/[\u4e00-\u9fff]/.test(String(text || '')) ? 'zh-CN' : 'en-US');
    const spokenText = formatSpeechTextForLanguage(text, effectiveLanguage);
    const fallbackLanguages = effectiveLanguage.startsWith('en')
      ? ['en-US', 'en']
      : ['zh-CN', 'zh'];
    await TextToSpeech.stop();
    let lastError = null;
    for (const lang of fallbackLanguages) {
      try {
        await TextToSpeech.speak({
          text: spokenText,
          lang,
          rate: 0.95,
          pitch: 1,
          volume: 1,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    try {
      await TextToSpeech.speak({
        text: spokenText,
        rate: 0.95,
        pitch: 1,
        volume: 1,
      });
    } catch (error) {
      throw lastError || error;
    }
  },

  async stopSpeaking() {
    await TextToSpeech.stop();
  },
};

window.RobotHandNativeLLM = {
  available: Capacitor.isNativePlatform(),

  async getStatus() {
    return emitLocalLlmStatus(await LocalLlm.getStatus());
  },

  async downloadModel() {
    return emitLocalLlmStatus(await LocalLlm.downloadModel());
  },

  async cancelDownload() {
    return emitLocalLlmStatus(await LocalLlm.cancelDownload());
  },

  async loadModel() {
    return emitLocalLlmStatus(await LocalLlm.loadModel());
  },

  async generate(prompt, maxTokens = 384) {
    const result = await LocalLlm.generate({ prompt, maxTokens });
    return result.text || '';
  },

  async deleteModel() {
    return emitLocalLlmStatus(await LocalLlm.deleteModel());
  },
};

window.RobotHandNativeNetwork = {
  available: Capacitor.isNativePlatform(),

  async resolveMdnsHost(host, timeoutMs = 1800) {
    return MdnsResolver.resolve({ host, timeoutMs });
  },
};

document.documentElement.classList.add('capacitor-app');
overrideDesktopLocalModelProbe();
setupMobileLayout();
