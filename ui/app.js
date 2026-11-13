// =========================================================
// ScreenHub Client - Lógica Principal, Configuración SQLite & Atajos
// =========================================================

// Variables globales de estado
let currentConfig = {
  url: 'http://localhost:3000/screens/sala-1',
  check_interval_seconds: 5,
  kiosk: true,
  fullscreen: true,
  pin_code: ''
};

let retryTimerId = null;
let healthCheckTimerId = null;

// Elementos DOM principales
const iframe = document.getElementById('kiosk-frame');
const offlineScreen = document.getElementById('offline-screen');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const targetUrlDisplay = document.getElementById('target-url-display');
const countdownEl = document.getElementById('countdown');

// Elementos DOM del Modal de Configuración
const configModal = document.getElementById('config-modal');
const pinModal = document.getElementById('pin-modal');
const pinInput = document.getElementById('pin-input');
const pinError = document.getElementById('pin-error');
const configAlert = document.getElementById('config-alert');

const inputUrl = document.getElementById('cfg-url');
const inputKiosk = document.getElementById('cfg-kiosk');
const kioskStatusText = document.getElementById('kiosk-status-text');
const inputShowSource = document.getElementById('cfg-show-source');
const sourceStatusText = document.getElementById('source-status-text');
const sourceBadge = document.getElementById('source-indicator-badge');
const sourceBadgeIcon = document.getElementById('source-badge-icon');
const sourceBadgeText = document.getElementById('source-badge-text');
const inputInterval = document.getElementById('cfg-interval');
const inputPin = document.getElementById('cfg-pin');

// Helper para obtener la API de Tauri v2 de forma robusta
function getTauriAPI() {
  if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
    return window.__TAURI__.core;
  }
  if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
    return { invoke: window.__TAURI_INTERNALS__.invoke };
  }
  return null;
}

// =========================================================
// 1. Manejo de Atajo de Teclado ÚNICO: Ctrl + Shift + M
// =========================================================

function handleGlobalKeydown(e) {
  // Detección robusta de Ctrl + Shift + M (usando key y code === 'KeyM')
  const isMKey = (e.key === 'M' || e.key === 'm' || e.code === 'KeyM');
  const isCtrlShiftM = (e.ctrlKey && (e.shiftKey || e.metaKey) && isMKey) || (e.ctrlKey && isMKey);

  if (isCtrlShiftM) {
    e.preventDefault();
    e.stopPropagation();
    toggleConfigMode();
    return false;
  }

  // Si el modal de configuración o de PIN está abierto, permitir escritura en inputs
  if (!configModal.classList.contains('hidden') || !pinModal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      closeAllModals();
    }
    return true;
  }

  // Bloqueo estricto de atajos de sistema SOLO si el modo Kiosco está habilitado
  if (currentConfig.kiosk !== false && currentConfig.mode !== 'window') {
    const forbiddenKeys = ['F11', 'F5', 'F12', 'Escape'];
    
    if (
      forbiddenKeys.includes(e.key) ||
      (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'w' || e.key === 'W' || e.key === 'i' || e.key === 'I')) ||
      (e.altKey && e.key === 'F4')
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }
}

window.addEventListener('keydown', handleGlobalKeydown, true);
document.addEventListener('keydown', handleGlobalKeydown, true);

// Recuperar el foco del teclado para asegurar captura de atajos
function ensureWindowFocus() {
  if (configModal && configModal.classList.contains('hidden') && pinModal && pinModal.classList.contains('hidden')) {
    window.focus();
  }
}

// Escuchar cuando el foco de entrada se desplaza hacia el iframe remoto
window.addEventListener('blur', () => {
  setTimeout(ensureWindowFocus, 150);
});

// Re-enfocar la ventana cuando el cursor se desplaza cerca de la barra superior
document.addEventListener('mousemove', (e) => {
  if (e.clientY < 35) {
    ensureWindowFocus();
  }
});

// Bloquear menú contextual (clic derecho) si no hay modales abiertos
window.addEventListener('contextmenu', (e) => {
  if (configModal.classList.contains('hidden') && pinModal.classList.contains('hidden')) {
    e.preventDefault();
  }
});

// =========================================================
// 2. Comunicación SQLite Backend via Tauri IPC o Fallback
// =========================================================

async function loadSQLiteConfig() {
  const tauri = getTauriAPI();
  if (tauri) {
    try {
      const config = await tauri.invoke('load_config');
      if (config && config.url) {
        currentConfig = config;
        try {
          localStorage.setItem('screenhub_sqlite_config', JSON.stringify(config));
        } catch (e) {}
        return currentConfig;
      }
    } catch (err) {
      console.warn('Tauri IPC load_config error:', err);
    }
  }

  try {
    const saved = localStorage.getItem('screenhub_sqlite_config');
    if (saved) {
      currentConfig = JSON.parse(saved);
    }
  } catch (e) {}

  return currentConfig;
}

async function saveSQLiteConfig(newConfig) {
  currentConfig = newConfig;

  // 1. Guardar en SQLite nativo vía Tauri IPC
  const tauri = getTauriAPI();
  if (tauri) {
    try {
      const savedConfig = await tauri.invoke('save_config', { config: newConfig });
      if (savedConfig && savedConfig.url) {
        currentConfig = savedConfig;
      }
    } catch (err) {
      console.error('Error guardando en SQLite via IPC:', err);
    }
  }

  // 2. Guardar en localStorage para respaldo local
  try {
    localStorage.setItem('screenhub_sqlite_config', JSON.stringify(currentConfig));
  } catch (e) {}

  return true;
}

// =========================================================
// 3. Control del Modal de Configuración y PIN
// =========================================================

function toggleConfigMode() {
  if (!configModal.classList.contains('hidden')) {
    closeAllModals();
    return;
  }
  
  if (!pinModal.classList.contains('hidden')) {
    closeAllModals();
    return;
  }

  // Si requiere PIN de seguridad
  if (currentConfig.pin_code && currentConfig.pin_code.trim() !== '') {
    showPinModal();
  } else {
    showConfigModal();
  }
}

function showPinModal() {
  pinInput.value = '';
  pinError.classList.add('hidden');
  pinModal.classList.remove('hidden');
  setTimeout(() => pinInput.focus(), 100);
}

function verifyPin() {
  if (pinInput.value === currentConfig.pin_code) {
    pinModal.classList.add('hidden');
    showConfigModal();
  } else {
    pinError.classList.remove('hidden');
    pinInput.value = '';
    pinInput.focus();
  }
}

function showConfigModal() {
  syncFormFromConfig();
  hideAlert();
  updateCacheUsageProgressBar();
  configModal.classList.remove('hidden');
  setTimeout(() => inputUrl.focus(), 100);
}

function closeAllModals() {
  configModal.classList.add('hidden');
  pinModal.classList.add('hidden');
}

function syncFormFromConfig() {
  inputUrl.value = currentConfig.url || 'http://localhost:3000/screens/sala-1';
  inputInterval.value = currentConfig.check_interval_seconds || 5;
  inputPin.value = currentConfig.pin_code || '';

  const isKioskOn = currentConfig.kiosk !== false && currentConfig.mode !== 'window';
  if (inputKiosk) {
    inputKiosk.checked = isKioskOn;
    updateKioskToggleLabel(isKioskOn);
  }

  const isShowSourceOn = !!currentConfig.show_source_indicator;
  if (inputShowSource) {
    inputShowSource.checked = isShowSourceOn;
    updateSourceToggleLabel(isShowSourceOn);
  }
}

function updateKioskToggleLabel(enabled) {
  if (kioskStatusText) {
    kioskStatusText.textContent = enabled
      ? 'Habilitado (Pantalla completa sin bordes)'
      : 'Deshabilitado (Ventana con marco y barra de título)';
  }
}

function updateSourceToggleLabel(enabled) {
  if (sourceStatusText) {
    sourceStatusText.textContent = enabled
      ? 'Mostrar indicador flotante en pantalla (Internet vs Caché)'
      : 'Ocultar indicador en pantalla';
  }
}

let lastKnownServerOnline = true;
let currentMediaSourceIsCache = false;
let mediaLoadedCount = 0;

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCREENHUB_RESOURCE_STATUS') {
    currentMediaSourceIsCache = !!event.data.isCache;
    mediaLoadedCount++;
    updateSourceIndicatorBadge(lastKnownServerOnline);
  }
});

function detectMediaSourceType(isServerOnline) {
  lastKnownServerOnline = isServerOnline;

  // 1. Si no hay conexión de red/servidor, definitivamente se lee de CACHÉ LOCAL
  if (!isServerOnline || !navigator.onLine) {
    return 'cache';
  }

  // 2. Si el mensaje desde el script inyectado o iframe confirmó lectura de caché (transferSize === 0)
  if (currentMediaSourceIsCache) {
    return 'cache';
  }

  // 3. Evaluar recursos directos de rendimiento en la ventana
  try {
    if (window.performance) {
      const entries = window.performance.getEntriesByType('resource');
      if (entries && entries.length > 0) {
        const mediaEntries = entries.filter(e => 
          e.initiatorType === 'video' ||
          e.initiatorType === 'audio' ||
          e.initiatorType === 'img' ||
          e.initiatorType === 'media' ||
          e.initiatorType === 'fetch' ||
          e.initiatorType === 'xmlhttprequest' ||
          /\.(mp4|webm|ogv|mp3|wav|ogg|png|jpg|jpeg|webp)/i.test(e.name)
        );

        if (mediaEntries.length > 0) {
          const lastEntry = mediaEntries[mediaEntries.length - 1];
          if (lastEntry.transferSize === 0 || (lastEntry.decodedBodySize > 0 && lastEntry.transferSize < lastEntry.decodedBodySize * 0.4)) {
            return 'cache';
          }
        }
      }
    }
  } catch (e) {}

  return 'network';
}

function updateSourceIndicatorBadge(isServerOnline = lastKnownServerOnline) {
  if (!sourceBadge) return;

  if (!currentConfig || !currentConfig.show_source_indicator) {
    sourceBadge.classList.add('hidden');
    return;
  }

  sourceBadge.classList.remove('hidden');
  sourceBadge.style.pointerEvents = 'auto';
  sourceBadge.style.cursor = 'pointer';
  sourceBadge.title = 'Haz clic o presiona Ctrl+Shift+M para abrir Configuración';

  if (!sourceBadge.getAttribute('data-listener')) {
    sourceBadge.setAttribute('data-listener', 'true');
    sourceBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleConfigMode();
    });
  }

  const sourceType = detectMediaSourceType(isServerOnline);

  if (sourceType === 'cache') {
    sourceBadge.className = 'source-badge badge-cache';
    if (sourceBadgeIcon) sourceBadgeIcon.textContent = '⚡';
    if (sourceBadgeText) sourceBadgeText.textContent = 'CACHÉ LOCAL';
  } else {
    sourceBadge.className = 'source-badge badge-online';
    if (sourceBadgeIcon) sourceBadgeIcon.textContent = '🌐';
    if (sourceBadgeText) sourceBadgeText.textContent = 'INTERNET (RED)';
  }
}

// Monitoreo periódico del origen de recursos multimedia para actualizar el indicador en tiempo real
setInterval(() => {
  if (currentConfig && currentConfig.show_source_indicator) {
    updateSourceIndicatorBadge(lastKnownServerOnline);
  }
}, 2500);

function showAlert(message, isError = false) {
  configAlert.textContent = message;
  configAlert.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
  configAlert.classList.remove('hidden');
}

function hideAlert() {
  configAlert.classList.add('hidden');
}

// =========================================================
// 4. Acciones de Configuración (Guardar, Probar URL, Restablecer)
// =========================================================

async function handleSaveConfig() {
  const urlVal = inputUrl.value.trim();
  if (!urlVal) {
    showAlert('La URL de la pantalla no puede estar vacía.', true);
    return;
  }

  const intervalVal = parseInt(inputInterval.value, 10) || 5;
  const pinVal = inputPin.value.trim();
  const isKioskVal = inputKiosk ? inputKiosk.checked : true;
  const isShowSourceVal = inputShowSource ? inputShowSource.checked : false;

  const updatedConfig = {
    url: urlVal,
    mode: isKioskVal ? 'kiosk' : 'window',
    check_interval_seconds: intervalVal,
    kiosk: isKioskVal,
    fullscreen: isKioskVal,
    window_width: 1920,
    window_height: 1080,
    pin_code: pinVal,
    show_source_indicator: isShowSourceVal
  };

  showAlert('Guardando configuración en la base de datos SQLite...');

  const success = await saveSQLiteConfig(updatedConfig);
  if (success) {
    showAlert('Configuración guardada correctamente en SQLite.');
    targetUrlDisplay.textContent = currentConfig.url;

    setTimeout(() => {
      closeAllModals();
      attemptConnection();
    }, 800);
  } else {
    showAlert('Error guardando en la base de datos SQLite.', true);
  }
}

async function handleTestUrl() {
  const testUrl = inputUrl.value.trim();
  if (!testUrl) {
    showAlert('Ingresa una URL para probar.', true);
    return;
  }

  showAlert('⚡ Probando conectividad con la URL...');
  const isOnline = await checkServerConnection(testUrl);
  if (isOnline) {
    showAlert('✅ La URL respondió correctamente. Conexión establecida.');
  } else {
    showAlert('❌ No se pudo conectar a la URL especificada.', true);
  }
}

function handleResetConfig() {
  if (confirm('¿Deseas restablecer la configuración a los valores predeterminados en SQLite?')) {
    const defaultConfig = {
      url: 'http://localhost:3000/screens/sala-1',
      mode: 'kiosk',
      check_interval_seconds: 5,
      kiosk: true,
      fullscreen: true,
      window_width: 1920,
      window_height: 1080,
      pin_code: ''
    };
    saveSQLiteConfig(defaultConfig).then(() => {
      syncFormFromConfig();
      showAlert('Valores predeterminados restablecidos.');
      updateCacheUsageProgressBar();
    });
  }
}

async function updateCacheUsageProgressBar() {
  const usageTextEl = document.getElementById('cache-usage-text');
  const progressFillEl = document.getElementById('cache-progress-fill');

  if (!usageTextEl || !progressFillEl) return;

  const MAX_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2.0 GB en bytes

  try {
    let usedBytes = 0;

    // 1. Consultar la API StorageManager si está disponible
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate && typeof estimate.usage === 'number') {
        usedBytes = estimate.usage;
      }
    }

    // 2. Si no reporta bytes o es 0, consultar el CacheStorage de ServiceWorker
    if (usedBytes === 0 && window.caches) {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          const cache = await caches.open(key);
          const requests = await cache.keys();
          for (const req of requests) {
            const res = await cache.match(req);
            if (res) {
              const blob = await res.blob();
              usedBytes += blob.size || 0;
            }
          }
        }
      } catch (e) {}
    }

    const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
    const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
    const percentage = Math.min(100, Math.max(0, (usedBytes / MAX_QUOTA_BYTES) * 100)).toFixed(1);

    const displayText = usedBytes >= 1024 * 1024 * 1024 
      ? `${usedGB} GB / 2.0 GB (${percentage}%)`
      : `${usedMB} MB / 2.0 GB (${percentage}%)`;

    usageTextEl.textContent = displayText;
    progressFillEl.style.width = `${Math.max(percentage, 3)}%`;

    if (parseFloat(percentage) > 80) {
      progressFillEl.classList.add('warning');
    } else {
      progressFillEl.classList.remove('warning');
    }
  } catch (err) {
    console.warn('Error calculando espacio de caché:', err);
    usageTextEl.textContent = '0.0 MB / 2.0 GB (0%)';
    progressFillEl.style.width = '3%';
  }
}

async function handleClearCache() {
  if (confirm('¿Deseas vaciar toda la caché local de la aplicación?')) {
    showAlert('Vaciando la caché local...');
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      const tauri = getTauriAPI();
      if (tauri) {
        await tauri.invoke('clear_cache').catch(() => {});
      }
      showAlert('Caché vaciada correctamente.');
      updateCacheUsageProgressBar();
    } catch (e) {
      showAlert('Error al vaciar la caché.', true);
    }
  }
}

// =========================================================
// 5. Monitoreo de Red & Carga del Kiosco
// =========================================================

async function checkServerConnection(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch (err) {
    return false;
  }
}

function applyBrowserKioskMode(isKiosk) {
  try {
    if (!isKiosk) {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } else {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      }
    }
  } catch (e) {
    console.warn('HTML5 Fullscreen API error:', e);
  }
}

async function startKiosk() {
  await loadSQLiteConfig();
  targetUrlDisplay.textContent = currentConfig.url;
  applyBrowserKioskMode(currentConfig.kiosk !== false);
  attemptConnection();
}

// Prevenir que errores de red o excepciones no capturadas cierren la ventana nativa
window.addEventListener('error', (e) => {
  console.warn('[ScreenHub Client] Excepción de red/JS interceptada (previniendo cierre):', e.message);
  e.preventDefault();
  return true;
});

window.addEventListener('unhandledrejection', (e) => {
  console.warn('[ScreenHub Client] Promesa de red rechazada interceptada:', e.reason);
  e.preventDefault();
});

let hasLoadedScreenOnce = false;

async function attemptConnection() {
  if (retryTimerId) clearInterval(retryTimerId);
  if (healthCheckTimerId) clearTimeout(healthCheckTimerId);

  applyBrowserKioskMode(currentConfig.kiosk !== false);

  try {
    const online = await checkServerConnection(currentConfig.url);

    if (online) {
      if (iframe) {
        if (!hasLoadedScreenOnce || iframe.src !== currentConfig.url || iframe.src === 'about:blank') {
          iframe.src = currentConfig.url;
          hasLoadedScreenOnce = true;
        }
        offlineScreen.classList.add('hidden');
      }
      updateSourceIndicatorBadge(true);
      healthCheckTimerId = setTimeout(monitorHealth, currentConfig.check_interval_seconds * 1000);
    } else {
      // Si el contenido multimedia ya se está reproduciendo fluidamente desde Caché Local de disco
      if (hasLoadedScreenOnce && currentMediaSourceIsCache) {
        offlineScreen.classList.add('hidden');
        updateSourceIndicatorBadge(false);
        healthCheckTimerId = setTimeout(monitorHealth, currentConfig.check_interval_seconds * 1000);
      } else {
        // En cualquier otro caso de fallo de red, MOSTRAR SIEMPRE la Pantalla Fuera de Línea
        showOfflineMode();
      }
    }
  } catch (err) {
    console.warn('[ScreenHub Client] Fallo en intento de conexión:', err);
    showOfflineMode();
  }
}

async function monitorHealth() {
  try {
    const online = await checkServerConnection(currentConfig.url);

    if (!online) {
      if (hasLoadedScreenOnce && currentMediaSourceIsCache) {
        offlineScreen.classList.add('hidden');
        updateSourceIndicatorBadge(false);
        healthCheckTimerId = setTimeout(monitorHealth, currentConfig.check_interval_seconds * 1000);
        return;
      } else {
        showOfflineMode();
        return;
      }
    }

    updateSourceIndicatorBadge(true);
    healthCheckTimerId = setTimeout(monitorHealth, currentConfig.check_interval_seconds * 1000);
  } catch (err) {
    console.warn('[ScreenHub Client] Fallo en monitoreo de salud de red:', err);
    showOfflineMode();
  }
}

function showOfflineMode() {
  // Si la fuente detectada es Caché Local de disco (reproduciendo bien offline)
  if (hasLoadedScreenOnce && currentMediaSourceIsCache) {
    offlineScreen.classList.add('hidden');
    updateSourceIndicatorBadge(false);
    return;
  }

  // Ocultar cualquier página de error limpiando la URL del iframe si no responde el servidor
  if (iframe) {
    iframe.src = 'about:blank';
  }

  statusTitle.textContent = "🌐 Pantalla fuera de línea";
  statusDesc.textContent = `Sin conexión con ${currentConfig.url}. Reintentando automáticamente en...`;
  offlineScreen.classList.remove('hidden');
  updateSourceIndicatorBadge(false);
  
  startCountdown(currentConfig.check_interval_seconds);
}

function startCountdown(seconds) {
  if (retryTimerId) clearInterval(retryTimerId);
  
  let remaining = seconds;
  countdownEl.textContent = remaining;

  retryTimerId = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(retryTimerId);
      attemptConnection();
    } else {
      countdownEl.textContent = remaining;
    }
  }, 1000);
}

async function handleClearCache() {
  if (confirm('¿Deseas eliminar todo el contenido guardado en caché (videos, audios y páginas)?')) {
    showAlert('🧹 Eliminando caché local y archivos de medios...');

    // 1. Limpiar Service Worker Cache Storage
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        console.log('[Cache] ServiceWorker Cache Storage purgado.');
      } catch (err) {
        console.warn('Error borrando Service Worker Cache:', err);
      }
    }

    // 2. Invocar comando IPC de Tauri si existe
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        await window.__TAURI__.core.invoke('clear_cache');
      }
    } catch (err) {
      console.warn('IPC clear_cache no disponible:', err);
    }

    showAlert('✅ Caché multimedia borrada correctamente. Recargando...');
    setTimeout(() => {
      closeAllModals();
      attemptConnection();
    }, 1000);
  }
}

// =========================================================
// 6. Inicialización de Eventos DOM
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Listeners del modal de configuración
  document.getElementById('btn-close-config').addEventListener('click', closeAllModals);
  document.getElementById('btn-x-close').addEventListener('click', closeAllModals);
  document.getElementById('btn-save-config').addEventListener('click', handleSaveConfig);
  document.getElementById('btn-test-url').addEventListener('click', handleTestUrl);
  document.getElementById('btn-reset-config').addEventListener('click', handleResetConfig);
  
  const btnClearCache = document.getElementById('btn-clear-cache');
  if (btnClearCache) btnClearCache.addEventListener('click', handleClearCache);

  if (inputKiosk) {
    inputKiosk.addEventListener('change', () => updateKioskToggleLabel(inputKiosk.checked));
  }

  if (inputShowSource) {
    inputShowSource.addEventListener('change', () => updateSourceToggleLabel(inputShowSource.checked));
  }

  // Listeners del modal PIN
  document.getElementById('btn-submit-pin').addEventListener('click', verifyPin);
  document.getElementById('btn-cancel-pin').addEventListener('click', closeAllModals);
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyPin();
  });

  // Registrar Service Worker para almacenamiento en caché persistente de audio/video
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => console.log('[ServiceWorker] Registrado correctamente para caché de audio/video:', reg.scope))
      .catch((err) => console.warn('[ServiceWorker] No se pudo registrar ServiceWorker:', err));
  }

  // Iniciar cliente
  startKiosk();
});
