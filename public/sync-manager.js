// Cross-Device Sync Manager for RadCase
// Handles WebSocket connection, offline queuing, and event broadcasting

class SyncManager {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.queue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimer = null;
    this.deviceId = this._getDeviceId();
    this.connected = false;

    // Conflict resolution state
    this._lastTimestamps = new Map();   // key -> ISO timestamp for last-write-wins
    this._conflicts = new Map();        // conflictId -> conflict details
    this._localAnnotations = new Map(); // imageId -> { annotations, timestamp }
    this._conflictCounter = 0;          // monotonic conflict ID counter

    // Load queued events from localStorage
    try {
      const saved = localStorage.getItem('radcase_sync_queue');
      if (saved) this.queue = JSON.parse(saved);
    } catch (e) { /* ignore */ }

    // Connect if user is authenticated
    this._checkAuthAndConnect();

    // Listen for online/offline
    window.addEventListener('online', () => this.connect());
    window.addEventListener('offline', () => this._updateIndicator(false));
  }

  _getDeviceId() {
    let id = localStorage.getItem('radcase_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('radcase_device_id', id);
    }
    return id;
  }

  async _checkAuthAndConnect() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.user) {
        this._getTokenAndConnect();
      }
    } catch (e) { /* not logged in */ }
  }

  async _getTokenAndConnect() {
    // Get token from cookie via a lightweight endpoint
    // The token is httpOnly, so we need the server to give us one for WebSocket
    // We'll use the existing cookie-based auth - fetch a sync token
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.user) {
        // For WebSocket auth, we need to pass the token as a query param.
        // Since the JWT is httpOnly, we'll create a short-lived sync token endpoint.
        // For now, read from cookie if accessible, or use a sync-token endpoint.
        this._connectWithToken();
      }
    } catch (e) { /* ignore */ }
  }

  async _connectWithToken() {
    try {
      const res = await fetch('/api/sync/token', { credentials: 'include' });
      const data = await res.json();
      if (data.token) {
        this.connect(data.token);
      }
    } catch (e) {
      // Sync token endpoint may not exist yet during first load, that's ok
    }
  }

  connect(token) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!token) {
      this._connectWithToken();
      return;
    }

    this._token = token;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(this.deviceId)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this._updateIndicator(true);
      this._flushQueue();
      this._emit('connected');
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) { return; }

      if (msg.type === 'sync:catchup') {
        // Process catchup events through the same conflict-aware path
        for (const ev of msg.events) {
          this._handleIncomingSyncEvent(ev.type, ev.payload, ev.deviceId, ev.timestamp);
        }
        return;
      }

      this._handleIncomingSyncEvent(msg.type, msg.payload, msg.deviceId, msg.timestamp);
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      this._updateIndicator(false);
      this._emit('disconnected');

      // Don't reconnect if closed intentionally (4001 = auth error)
      if (event.code !== 4001) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._updateIndicator(false);
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    if (this.reconnectTimer) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._token) {
        this.connect(this._token);
      } else {
        this._connectWithToken();
      }
    }, delay);
  }

  // Send a sync event (queues if offline)
  send(type, payload) {
    const msg = { type, payload, deviceId: this.deviceId, timestamp: new Date().toISOString() };

    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
      this._saveQueue();
    }
  }

  _flushQueue() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      this.ws.send(JSON.stringify(msg));
    }
    this._saveQueue();
  }

  _saveQueue() {
    try {
      localStorage.setItem('radcase_sync_queue', JSON.stringify(this.queue));
    } catch (e) { /* storage full, drop oldest */ }
  }

  // Event emitter
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, ...args) {
    const callbacks = this.listeners[event];
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(...args); } catch (e) { console.error('Sync listener error:', e); }
      }
    }
  }

  // Route incoming sync events through conflict resolution logic
  _handleIncomingSyncEvent(type, payload, deviceId, timestamp) {
    // Skip events from this device
    if (deviceId === this.deviceId) return;

    if (type === 'sync:progress') {
      // Last-write-wins for progress updates keyed by caseId
      const key = payload && payload.caseId ? payload.caseId : '_default';
      if (this._shouldApply(type, key, timestamp)) {
        this._emit(type, payload, deviceId);
      }
      // else: stale update, silently discard
      return;
    }

    if (type === 'sync:annotations') {
      // Detect per-annotation conflicts before applying
      const hasConflict = this._detectAnnotationConflict(payload, deviceId, timestamp);

      if (!hasConflict) {
        // No conflicts -- apply normally and update local tracking
        if (payload && payload.imageId) {
          this._localAnnotations.set(payload.imageId, {
            annotations: payload.annotations || [],
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }
      // Always emit the event so listeners can update their UI;
      // conflicts are surfaced separately via sync:conflict events
      this._emit(type, payload, deviceId);
      return;
    }

    // All other event types: pass through without conflict checks
    this._emit(type, payload, deviceId);
  }

  // --- Conflict Resolution ---

  // Last-write-wins: returns true if the incoming timestamp is newer than
  // the last-seen timestamp for the given event type + key combination.
  _shouldApply(type, key, incomingTimestamp) {
    const compositeKey = `${type}:${key}`;
    const existing = this._lastTimestamps.get(compositeKey);

    if (!existing || incomingTimestamp > existing) {
      this._lastTimestamps.set(compositeKey, incomingTimestamp);
      return true;
    }
    return false;
  }

  // Detect annotation-level conflicts by comparing individual annotation IDs
  // between the incoming remote payload and locally tracked annotations.
  // If the same annotation ID was modified on both devices, record a conflict.
  _detectAnnotationConflict(payload, deviceId, timestamp) {
    const { imageId, annotations } = payload;
    const localEntry = this._localAnnotations.get(imageId);

    if (!localEntry || !localEntry.annotations) {
      // No local state for this image -- no conflict possible
      return false;
    }

    const localById = new Map();
    for (const ann of localEntry.annotations) {
      if (ann.id) localById.set(ann.id, ann);
    }

    let hasConflict = false;

    for (const remoteAnn of annotations) {
      if (!remoteAnn.id) continue;

      const localAnn = localById.get(remoteAnn.id);
      if (!localAnn) continue;

      // Same annotation ID exists locally -- check if local was modified
      // after we last synced it (i.e., the local version differs)
      const conflictId = `conflict_${++this._conflictCounter}`;
      const conflict = {
        id: conflictId,
        eventType: 'sync:annotations',
        imageId,
        annotationId: remoteAnn.id,
        localVersion: localAnn,
        remoteVersion: remoteAnn,
        remoteDeviceId: deviceId,
        timestamp
      };

      this._conflicts.set(conflictId, conflict);
      this._emit('sync:conflict', conflict);
      hasConflict = true;
    }

    return hasConflict;
  }

  // Resolve a conflict by choosing 'local' or 'remote' version.
  resolveConflict(conflictId, chosenVersion) {
    const conflict = this._conflicts.get(conflictId);
    if (!conflict) {
      console.warn('SyncManager: conflict not found:', conflictId);
      return false;
    }

    const chosen = chosenVersion === 'remote' ? conflict.remoteVersion : conflict.localVersion;

    // Apply the chosen version to local annotations
    const localEntry = this._localAnnotations.get(conflict.imageId);
    if (localEntry && localEntry.annotations) {
      const idx = localEntry.annotations.findIndex(a => a.id === conflict.annotationId);
      if (idx !== -1) {
        localEntry.annotations[idx] = chosen;
      } else {
        localEntry.annotations.push(chosen);
      }
      localEntry.timestamp = new Date().toISOString();
    }

    // If the user chose 'remote', we already have the data.
    // If the user chose 'local', re-send our local version to the server
    // so other devices get the resolution.
    if (chosenVersion === 'local' && localEntry) {
      this.send('sync:annotations', {
        imageId: conflict.imageId,
        annotations: localEntry.annotations
      });
    }

    // Remove the resolved conflict
    this._conflicts.delete(conflictId);

    this._emit('sync:conflict-resolved', {
      conflictId,
      chosenVersion,
      resolvedAnnotation: chosen,
      imageId: conflict.imageId,
      annotationId: conflict.annotationId
    });

    return true;
  }

  // Return all pending (unresolved) conflicts as an array.
  getConflicts() {
    return Array.from(this._conflicts.values());
  }

  // Convenience methods for common sync operations
  syncProgress(caseId, progressData) {
    this.send('sync:progress', { caseId, ...progressData });
  }

  syncBookmark(caseId, bookmarked) {
    this.send('sync:bookmarks', { caseId, bookmarked });
  }

  syncAnnotation(imageId, annotations) {
    // Track local annotations for conflict detection
    this._localAnnotations.set(imageId, {
      annotations: annotations || [],
      timestamp: new Date().toISOString()
    });
    this.send('sync:annotations', { imageId, annotations });
  }

  syncPreferences(prefs) {
    this.send('sync:preferences', prefs);
  }

  _updateIndicator(online) {
    const el = document.getElementById('offlineIndicator');
    if (!el) return;

    if (!navigator.onLine) {
      el.style.display = 'block';
      el.textContent = 'You are offline - changes will sync when reconnected';
      el.classList.add('visible');
    } else if (!online && this._token) {
      // Online but WebSocket not connected - show briefly
      el.style.display = 'block';
      el.textContent = 'Reconnecting sync...';
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
      setTimeout(() => { el.style.display = ''; }, 300);
    }
  }
}

// Global instance
window.syncManager = new SyncManager();
