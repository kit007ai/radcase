// RadCase PWA Manager - Sprint 2 Advanced Mobile UX
// Progressive Web App lifecycle, offline capabilities, and app-like experience

class PWAManager {
  constructor() {
    this.isStandalone = this.isRunningStandalone();
    this.installPromptEvent = null;
    this.subscription = null;
    this.offlineQueue = [];
    this.syncTasks = new Map();
    
    this.init();
  }

  async init() {
    // PWA installation handling
    this.setupInstallPrompt();
    
    // Offline functionality
    this.setupOfflineHandling();
    
    // Push notifications
    await this.setupPushNotifications();
    
    // Background sync
    this.setupBackgroundSync();
    
    // App lifecycle management
    this.setupAppLifecycle();
    
    console.log('📱 PWA Manager initialized:', {
      standalone: this.isStandalone,
      notifications: 'Notification' in window,
      serviceWorker: 'serviceWorker' in navigator
    });
  }

  // Installation and app-like experience
  isRunningStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone ||
      document.referrer.includes('android-app://')
    );
  }

  setupInstallPrompt() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPromptEvent = event;
      this.showInstallPrompt();
    });

    // Handle successful installation
    window.addEventListener('appinstalled', () => {
      console.log('📲 RadCase installed successfully');
      this.hideInstallPrompt();
      this.onAppInstalled();
    });

    // Check if already installed
    if (this.isStandalone) {
      this.onAppInstalled();
    }
  }

  showInstallPrompt() {
    // Create install banner
    const installBanner = document.createElement('div');
    installBanner.id = 'install-prompt';
    installBanner.className = 'install-banner';
    installBanner.innerHTML = `
      <div class="install-content">
        <div class="install-icon">📱</div>
        <div class="install-text">
          <h4>Install RadCase</h4>
          <p>Get the full mobile experience with offline access</p>
        </div>
        <div class="install-actions">
          <button class="install-btn primary" onclick="pwaManager.installApp()">Install</button>
          <button class="install-btn secondary" onclick="pwaManager.dismissInstallPrompt()">Not now</button>
        </div>
      </div>
    `;

    // Add styles
    installBanner.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(10px);
      animation: slideUp 0.3s ease-out;
    `;

    // Only show if not dismissed recently
    const dismissed = localStorage.getItem('install-prompt-dismissed');
    const now = Date.now();
    
    if (!dismissed || (now - parseInt(dismissed)) > 24 * 60 * 60 * 1000) { // 24 hours
      document.body.appendChild(installBanner);
    }
  }

  async installApp() {
    if (!this.installPromptEvent) return;

    try {
      const result = await this.installPromptEvent.prompt();
      console.log('📲 Install prompt result:', result.outcome);
      
      if (result.outcome === 'accepted') {
        this.trackEvent('pwa_install_accepted');
      } else {
        this.trackEvent('pwa_install_dismissed');
      }
      
      this.installPromptEvent = null;
      this.hideInstallPrompt();
    } catch (error) {
      console.error('Install error:', error);
    }
  }

  dismissInstallPrompt() {
    this.hideInstallPrompt();
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
    this.trackEvent('pwa_install_dismissed_manually');
  }

  hideInstallPrompt() {
    const banner = document.getElementById('install-prompt');
    if (banner) {
      banner.style.animation = 'slideDown 0.3s ease-out';
      setTimeout(() => banner.remove(), 300);
    }
  }

  onAppInstalled() {
    // Configure app-like behavior
    this.setupAppBehavior();
    
    // Track installation
    this.trackEvent('pwa_installed');
    
    // Welcome message for new installation
    if (!localStorage.getItem('pwa-welcome-shown')) {
      this.showWelcomeMessage();
      localStorage.setItem('pwa-welcome-shown', 'true');
    }
  }

  setupAppBehavior() {
    // Full-screen experience
    document.documentElement.classList.add('standalone-app');
    
    // Disable pull-to-refresh on mobile
    document.body.style.overscrollBehavior = 'none';
    
    // Prevent context menu on touch devices
    if ('ontouchstart' in window) {
      document.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // Handle back button behavior
    this.setupBackButtonHandling();
  }

  setupBackButtonHandling() {
    // Add navigation state management
    let navigationStack = [];
    
    // Track navigation
    const pushState = history.pushState;
    history.pushState = function(state, title, url) {
      navigationStack.push({ state, title, url });
      return pushState.apply(history, arguments);
    };
    
    // Handle back button
    window.addEventListener('popstate', (event) => {
      navigationStack.pop();
      
      // If at root and user tries to go back, show exit confirmation
      if (navigationStack.length === 0 && this.isStandalone) {
        this.showExitConfirmation();
      }
    });
  }

  showExitConfirmation() {
    const confirmed = confirm('Exit RadCase?');
    if (confirmed) {
      // Close app (limited support)
      if (window.close) {
        window.close();
      }
    } else {
      // Stay in app
      history.pushState({}, '', window.location.href);
    }
  }

  showWelcomeMessage() {
    const welcome = document.createElement('div');
    welcome.className = 'pwa-welcome';
    welcome.innerHTML = `
      <div class="welcome-content">
        <div class="welcome-icon">🎉</div>
        <h3>Welcome to RadCase!</h3>
        <p>You can now use RadCase offline and get notifications for new cases.</p>
        <button class="welcome-btn" onclick="this.parentElement.parentElement.remove()">Get Started</button>
      </div>
    `;
    
    welcome.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 10001;
      max-width: 320px;
      backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(welcome);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (welcome.parentElement) {
        welcome.remove();
      }
    }, 5000);
  }

  // Push Notifications
  async setupPushNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('📵 Push notifications not supported');
      return;
    }

    // Check current permission
    const permission = Notification.permission;
    console.log('🔔 Notification permission:', permission);

    if (permission === 'default') {
      // Show notification prompt after user interaction
      this.setupNotificationPrompt();
    } else if (permission === 'granted') {
      await this.subscribeToPush();
    }
  }

  setupNotificationPrompt() {
    // Wait for user interaction before prompting
    const promptForNotifications = () => {
      setTimeout(() => {
        this.showNotificationPrompt();
      }, 2000); // Wait 2 seconds after interaction
    };

    // Listen for first meaningful interaction
    ['click', 'touchstart', 'scroll'].forEach(event => {
      document.addEventListener(event, promptForNotifications, { once: true });
    });
  }

  showNotificationPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'notification-prompt';
    prompt.innerHTML = `
      <div class="prompt-content">
        <div class="prompt-icon">🔔</div>
        <h4>Stay Updated</h4>
        <p>Get notified about new radiology cases and study reminders</p>
        <div class="prompt-actions">
          <button class="prompt-btn primary" onclick="pwaManager.requestNotificationPermission()">Allow Notifications</button>
          <button class="prompt-btn secondary" onclick="pwaManager.dismissNotificationPrompt()">Maybe Later</button>
        </div>
      </div>
    `;

    prompt.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      z-index: 10000;
      text-align: center;
      backdrop-filter: blur(10px);
      animation: slideDown 0.3s ease-out;
    `;

    document.body.appendChild(prompt);
  }

  async requestNotificationPermission() {
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        await this.subscribeToPush();
        this.showNotificationSuccess();
      } else {
        this.trackEvent('notification_permission_denied');
      }
      
      this.dismissNotificationPrompt();
    } catch (error) {
      console.error('Notification permission error:', error);
    }
  }

  dismissNotificationPrompt() {
    const prompt = document.querySelector('.notification-prompt');
    if (prompt) {
      prompt.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => prompt.remove(), 300);
    }
  }

  showNotificationSuccess() {
    this.showToast('🔔 Notifications enabled! You\'ll get study reminders and updates.', 'success');
  }

  async subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Create new subscription
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.getVapidPublicKey())
        });
      }
      
      this.subscription = subscription;
      
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      
      console.log('📲 Push subscription active');
    } catch (error) {
      console.error('Push subscription error:', error);
    }
  }

  getVapidPublicKey() {
    // This should be your VAPID public key
    // For demo purposes, using a placeholder
    return 'BEl62iUYgUivxIkv69yViEuiBIa40HI6YUKBxaE2X-NjSUR-d2GZVnl3Ga8RGC6V3Ye_6HZ_sNaNVYLxW2hE2dA';
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async sendSubscriptionToServer(subscription) {
    try {
      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
      // Store locally for later retry
      this.storeSubscriptionLocally(subscription);
    }
  }

  storeSubscriptionLocally(subscription) {
    localStorage.setItem('push-subscription', JSON.stringify(subscription.toJSON()));
  }

  // ============ Offline Case Storage (IndexedDB) ============

  async openOfflineDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('radcase-offline', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const name of ['pending-progress', 'pending-annotations', 'offline-cases']) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async downloadCaseForOffline(caseId) {
    try {
      // Fetch case data with images
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch case');
      const caseData = await res.json();

      // Fetch and store thumbnail/image blobs
      const imageBlobs = {};
      if (caseData.images && caseData.images.length > 0) {
        for (const img of caseData.images) {
          try {
            const imgRes = await fetch(`/thumbnails/${img.filename}`);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              // Convert blob to base64 for IndexedDB storage
              imageBlobs[img.filename] = await this.blobToBase64(blob);
            }
          } catch (e) {
            console.warn(`Failed to cache image ${img.filename}:`, e);
          }
        }
      }

      // Store in IndexedDB
      const db = await this.openOfflineDB();
      const tx = db.transaction('offline-cases', 'readwrite');
      const store = tx.objectStore('offline-cases');
      store.put({
        id: caseId,
        data: caseData,
        imageBlobs,
        savedAt: Date.now()
      });

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });

      // Update UI indicator
      this.updateOfflineIndicator(caseId, true);
      this.showToast('Case saved for offline viewing', 'success');
      this.trackEvent('case_downloaded_offline', { caseId });
    } catch (err) {
      console.error('Failed to download case for offline:', err);
      this.showToast('Failed to save case offline', 'error');
      throw err;
    }
  }

  async removeCaseFromOffline(caseId) {
    try {
      const db = await this.openOfflineDB();
      const tx = db.transaction('offline-cases', 'readwrite');
      tx.objectStore('offline-cases').delete(caseId);
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
      this.updateOfflineIndicator(caseId, false);
      this.showToast('Removed offline case', 'info');
    } catch (err) {
      console.error('Failed to remove offline case:', err);
    }
  }

  async isOfflineAvailable(caseId) {
    try {
      const db = await this.openOfflineDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('offline-cases', 'readonly');
        const request = tx.objectStore('offline-cases').get(caseId);
        request.onsuccess = () => { db.close(); resolve(!!request.result); };
        request.onerror = () => { db.close(); resolve(false); };
      });
    } catch {
      return false;
    }
  }

  async getOfflineCaseIds() {
    try {
      const db = await this.openOfflineDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('offline-cases', 'readonly');
        const request = tx.objectStore('offline-cases').getAllKeys();
        request.onsuccess = () => { db.close(); resolve(request.result || []); };
        request.onerror = () => { db.close(); resolve([]); };
      });
    } catch {
      return [];
    }
  }

  updateOfflineIndicator(caseId, available) {
    const card = document.querySelector(`.case-card[data-case-id="${caseId}"]`);
    if (!card) return;

    let badge = card.querySelector('.offline-badge');
    const btn = card.querySelector('.offline-download-btn');

    if (available) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'offline-badge';
        badge.title = 'Available offline';
        badge.textContent = '\u2713';
        card.appendChild(badge);
      }
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
        btn.title = 'Remove offline copy';
      }
    } else {
      if (badge) badge.remove();
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>';
        btn.title = 'Save for offline';
      }
    }
  }

  async toggleOfflineCase(caseId, event) {
    if (event) event.stopPropagation();
    const available = await this.isOfflineAvailable(caseId);
    if (available) {
      await this.removeCaseFromOffline(caseId);
    } else {
      await this.downloadCaseForOffline(caseId);
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Offline functionality
  setupOfflineHandling() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.onOnline());
    window.addEventListener('offline', () => this.onOffline());
    
    // Check initial state
    if (!navigator.onLine) {
      this.onOffline();
    }
  }

  onOffline() {
    document.body.classList.add('offline');
    this.showOfflineBanner();
    console.log('📴 App is offline');
  }

  onOnline() {
    document.body.classList.remove('offline');
    this.hideOfflineBanner();
    this.syncOfflineData();
    console.log('📶 App is online');
  }

  showOfflineBanner() {
    if (document.getElementById('offline-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.innerHTML = `
      <div class="offline-content">
        <span>📴 You're offline. Some features may be limited.</span>
        <button onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: var(--warning);
      color: white;
      padding: 8px 16px;
      text-align: center;
      font-size: 14px;
      z-index: 10000;
    `;
    
    document.body.appendChild(banner);
  }

  hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) {
      banner.remove();
    }
  }

  // Background Sync
  setupBackgroundSync() {
    // Register sync events when data needs to be synced
    this.registerSyncTask('user-progress');
    this.registerSyncTask('annotations');
    this.registerSyncTask('preferences');
  }

  async registerSyncTask(tag) {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
        console.log(`🔄 Background sync registered: ${tag}`);
      } catch (error) {
        console.error(`Background sync registration failed: ${tag}`, error);
      }
    }
  }

  async syncOfflineData() {
    // Sync stored offline actions
    const offlineActions = this.getOfflineActions();
    
    for (const action of offlineActions) {
      try {
        await this.syncAction(action);
        this.removeOfflineAction(action.id);
      } catch (error) {
        console.error('Sync failed for action:', action, error);
      }
    }
  }

  getOfflineActions() {
    return JSON.parse(localStorage.getItem('offline-actions') || '[]');
  }

  storeOfflineAction(action) {
    const actions = this.getOfflineActions();
    actions.push({
      id: Date.now() + Math.random(),
      ...action,
      timestamp: Date.now()
    });
    localStorage.setItem('offline-actions', JSON.stringify(actions));
  }

  removeOfflineAction(id) {
    const actions = this.getOfflineActions();
    const filtered = actions.filter(action => action.id !== id);
    localStorage.setItem('offline-actions', JSON.stringify(filtered));
  }

  async syncAction(action) {
    const response = await fetch(action.url, {
      method: action.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...action.headers
      },
      body: JSON.stringify(action.data)
    });
    
    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }
    
    return response.json();
  }

  // App lifecycle
  setupAppLifecycle() {
    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.onAppBackground();
      } else {
        this.onAppForeground();
      }
    });
    
    // Beforeunload for data persistence
    window.addEventListener('beforeunload', () => {
      this.onAppClose();
    });
  }

  onAppBackground() {
    console.log('📱 App backgrounded');
    this.trackEvent('app_backgrounded');
  }

  onAppForeground() {
    console.log('📱 App foregrounded');
    this.trackEvent('app_foregrounded');
    
    // Check for updates
    this.checkForAppUpdates();
  }

  onAppClose() {
    console.log('📱 App closing');
    this.trackEvent('app_closed');
    
    // Save any pending data
    this.savePendingData();
  }

  async checkForAppUpdates() {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        registration.update();
      }
    }
  }

  savePendingData() {
    // Save any unsaved user progress, preferences, etc.
    const pendingData = this.collectPendingData();
    if (pendingData.length > 0) {
      localStorage.setItem('pending-data', JSON.stringify(pendingData));
    }
  }

  collectPendingData() {
    // Collect any unsaved data from the app
    return [];
  }

  // Utility methods
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-card);
      color: var(--text-primary);
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10001;
      backdrop-filter: blur(10px);
      animation: toastSlide 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'toastSlide 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  trackEvent(event, data = {}) {
    console.log('📊 Event:', event, data);
    
    // Store events locally for later sync
    const events = JSON.parse(localStorage.getItem('analytics-events') || '[]');
    events.push({
      event,
      data,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      standalone: this.isStandalone
    });
    localStorage.setItem('analytics-events', JSON.stringify(events));
  }
}

// Global instance
window.pwaManager = new PWAManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAManager;
}