// =========================================================
// ScreenHub Client - Service Worker de Cache Inteligente Signage
// Almacena recursos multimedia de pantallas remotas (audio, video, imágenes)
// EXCLUYE archivos de la propia interfaz local (index.html, app.js, style.css)
// =========================================================

const CACHE_NAME = 'screenhub-media-cache-v2';

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalado e inicializando sistema de caché Signage v2.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activado. Eliminando cachés obsoletas.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[ServiceWorker] Borrando caché previa:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo interceptar peticiones GET
  if (req.method !== 'GET') return;

  // Ignorar websockets / HMR
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // EXCLUIR archivos locales de la app cliente (NO guardar en caché index.html, app.js, style.css)
  const isLocalApp = url.origin === location.origin ||
                     url.hostname === 'tauri.localhost' ||
                     url.pathname.endsWith('index.html') ||
                     url.pathname.endsWith('app.js') ||
                     url.pathname.endsWith('style.css') ||
                     url.pathname.endsWith('sw.js');

  if (isLocalApp) {
    // Servir directamente desde la app/red nativa sin interceptar
    return;
  }

  // EXCLUIR servicios de streaming externos (YouTube, Vimeo, Google Video)
  // Las peticiones de YouTube usan HTTP 206 Partial Content (no soportado por Cache API)
  const isExternalStream = url.hostname.includes('youtube.com') ||
                           url.hostname.includes('youtube-nocookie.com') ||
                           url.hostname.includes('googlevideo.com') ||
                           url.hostname.includes('ytimg.com') ||
                           url.hostname.includes('vimeo.com') ||
                           url.hostname.includes('vimeocdn.com');

  if (isExternalStream) {
    return;
  }

  // Interceptar solo recursos multimedia o contenido de pantallas remotas
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(req);

      const fetchPromise = fetch(req).then(async (networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[ServiceWorker] Modo Offline activo para:', req.url);
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
