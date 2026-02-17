// RadCase Service Worker - PWA Offline Functionality
// Version 1.0.0 - Sprint 2 Advanced Mobile UX

const CACHE_NAME = 'radcase-v4.0.0';
const STATIC_CACHE = 'radcase-static-v4';
const API_CACHE = 'radcase-api-v4';
const DICOM_CACHE = 'radcase-dicom-v4';

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/critical.css',
  '/mobile.css',
  '/styles/design-tokens.css',
  '/styles/base.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/views.css',
  '/styles/quiz.css',
  '/styles/case-library.css',
  '/styles/case-builder.css',
  '/styles/ai-tutor.css',
  '/styles/oral-boards.css',
  '/styles/milestones.css',
  '/cornerstone-init.js',
  '/escape-html.js',
  '/focus-trap.js',
  '/lazy-loader.js',
  '/performance-optimizer.js',
  '/pwa-manager.js',
  '/annotate.js',
  '/presentation.js',
  '/spaced-repetition.js',
  '/dicom-viewer.js',
  '/sync-manager.js',
  '/touch-gestures.js',
  '/voice-narrator.js',
  '/quiz-engine.js',
  '/quiz-cards.js',
  '/quiz-gamification.js',
  '/quiz-study-plans.js',
  '/analytics-dashboard.js',
  '/finding-quiz.js',
  '/case-viewer.js',
  '/differential-input.js',
  '/key-findings-overlay.js',
  '/discussions.js',
  '/related-cases.js',
  '/collections.js',
  '/case-builder.js',
  '/ai-tutor.js',
  '/study-ai-overlay.js',
  '/weakness-coach.js',
  '/oral-boards.js',
  '/milestones.js',
  '/program-dashboard.js',
  '/state.js',
  '/api.js',
  '/ui.js',
  '/app.js'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('RadCase SW: Installing service worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('RadCase SW: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        // Force activation of new service worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('RadCase SW: Failed to cache static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('RadCase SW: Activating service worker');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE && cacheName !== DICOM_CACHE) {
              console.log('RadCase SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all clients
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method !== 'GET') {
    return; // Only cache GET requests
  }

  // API requests - network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Intercept /api/cases/:id - serve from IndexedDB if offline
    const caseMatch = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (caseMatch) {
      event.respondWith(
        fetch(request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(async () => {
            // Try API cache first
            const cache = await caches.open(API_CACHE);
            const cached = await cache.match(request);
            if (cached) return cached;

            // Fall back to IndexedDB offline-cases store
            const caseId = decodeURIComponent(caseMatch[1]);
            try {
              const offlineCase = await getStoredCaseById(caseId);
              if (offlineCase) {
                return new Response(JSON.stringify(offlineCase.data), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            } catch (e) {
              console.error('RadCase SW: IndexedDB lookup failed:', e);
            }

            return new Response(JSON.stringify({ error: 'Offline - case not available' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
      return;
    }

    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // DICOM files - cache first (large files, rarely change)
  if (url.pathname.includes('/dicom/') || url.pathname.includes('.dcm')) {
    event.respondWith(cacheFirstStrategy(request, DICOM_CACHE));
    return;
  }

  // Navigation requests (SPA routes) - network first, offline fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigation responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Offline: serve cached index.html as fallback for all navigation
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match('/index.html');
          return cached || new Response('Offline - RadCase', {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // HTML and JS files - network first to ensure freshness
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/') {
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Other static files (CSS, images, fonts) - cache first with network fallback
  event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
});

// Cache-first strategy (good for static resources)
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('RadCase SW: Serving from cache:', request.url);
      return cachedResponse;
    }

    console.log('RadCase SW: Fetching from network:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('RadCase SW: Cache-first failed:', error);
    
    // Return offline fallback if available
    if (request.url.includes('.html')) {
      const cache = await caches.open(STATIC_CACHE);
      return cache.match('/index.html');
    }
    
    throw error;
  }
}

// Network-first strategy (good for API calls) with timeout to prevent hanging on slow networks
async function networkFirstStrategy(request, cacheName) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    console.log('RadCase SW: Trying network first:', request.url);
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('RadCase SW: Network failed/timed out, trying cache:', request.url);

    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('RadCase SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncUserProgress());
  }
  
  if (event.tag === 'sync-annotations') {
    event.waitUntil(syncAnnotations());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('RadCase SW: Push notification received');
  
  const options = {
    body: 'Time for your daily radiology review!',
    icon: '/icon-192.png',
    badge: '/icon-badge-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    },
    actions: [
      {
        action: 'study-now',
        title: 'Study Now',
        icon: '/icon-study-32.png'
      },
      {
        action: 'remind-later',
        title: 'Remind Later',
        icon: '/icon-clock-32.png'
      }
    ]
  };

  if (event.data) {
    const payload = event.data.json();
    options.body = payload.body || options.body;
    options.data = payload.data || options.data;
  }

  event.waitUntil(
    self.registration.showNotification('RadCase', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('RadCase SW: Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'study-now') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'remind-later') {
    // Schedule another notification later
    console.log('RadCase SW: Remind later requested');
  } else {
    // Default action - open app
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Sync user progress when back online
async function syncUserProgress() {
  try {
    // Get pending progress updates from IndexedDB
    const pendingUpdates = await getStoredData('pending-progress');
    
    if (pendingUpdates && pendingUpdates.length > 0) {
      for (const update of pendingUpdates) {
        try {
          await fetch('/api/progress', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(update)
          });
          
          // Remove from pending updates
          await removeStoredData('pending-progress', update.id);
        } catch (error) {
          console.error('RadCase SW: Failed to sync progress:', error);
        }
      }
    }
  } catch (error) {
    console.error('RadCase SW: Sync progress failed:', error);
  }
}

// Sync annotations when back online
async function syncAnnotations() {
  try {
    // Get pending annotation updates from IndexedDB
    const pendingAnnotations = await getStoredData('pending-annotations');
    
    if (pendingAnnotations && pendingAnnotations.length > 0) {
      for (const annotation of pendingAnnotations) {
        try {
          await fetch('/api/annotations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotation)
          });
          
          // Remove from pending annotations
          await removeStoredData('pending-annotations', annotation.id);
        } catch (error) {
          console.error('RadCase SW: Failed to sync annotation:', error);
        }
      }
    }
  } catch (error) {
    console.error('RadCase SW: Sync annotations failed:', error);
  }
}

// IndexedDB helpers for offline data persistence
const DB_NAME = 'radcase-offline';
const DB_VERSION = 1;
const STORE_NAMES = ['pending-progress', 'pending-annotations', 'offline-cases'];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getStoredData(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function removeStoredData(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function storeData(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getStoredCaseById(caseId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-cases', 'readonly');
    const store = tx.objectStore('offline-cases');
    const request = store.get(caseId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

console.log('RadCase SW: Service worker loaded');