// RadCase Micro-Learning System - Sprint 2 Advanced Mobile UX
// 5-minute learning sessions optimized for mobile

class MicroLearningSession {
  constructor() {
    this.sessionDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.currentSession = null;
    this.sessionStartTime = null;
    this.completedSessions = this.loadCompletedSessions();
    this.preferences = this.loadPreferences();
    this.contextData = this.getContextData();

    // Listen for session sync events from other devices
    this.setupSyncListener();
  }

  // Start a new micro-learning session
  async startSession(specialty = null, difficulty = null) {
    // Check for a resumable session from this device (localStorage)
    let resumable = this.checkForResumableSession();
    // If nothing local, check the server for a session from another device
    if (!resumable) {
      resumable = await this.checkServerForResumableSession();
    }
    if (resumable && !this.currentSession) {
      this.showResumePrompt(resumable);
      return;
    }

    const sessionId = this.generateSessionId();

    this.currentSession = {
      id: sessionId,
      specialty: specialty || this.preferences.preferredSpecialty || 'General',
      difficulty: difficulty || this.calculateOptimalDifficulty(),
      startTime: Date.now(),
      cases: [],
      progress: {
        casesViewed: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        timeSpent: 0
      },
      contextAware: this.contextData
    };

    // Get optimized case selection for mobile session
    const cases = await this.selectCasesForSession();
    this.currentSession.cases = cases;

    // Start session timer
    this.sessionStartTime = Date.now();
    this.startSessionTimer();

    // Initialize mobile-optimized UI
    this.renderMobileSession();

    // Persist session state for cross-device resumption
    this.persistActiveSession();

    return this.currentSession;
  }

  // Context-aware case selection
  async selectCasesForSession() {
    const params = new URLSearchParams({
      timeAvailable: Math.floor(this.sessionDuration / 60000), // minutes
      mobileOptimized: 'true',
      contextAware: 'true'
    });

    // Only filter by specialty/difficulty if they aren't "all" defaults
    const spec = this.currentSession.specialty;
    if (spec && spec !== 'General' && spec !== 'All') {
      params.set('specialty', spec);
    }
    const diff = this.currentSession.difficulty;
    if (diff && diff !== 'All') {
      params.set('difficulty', diff);
    }

    // Pass last reviewed timestamp for spaced repetition weighting
    const lastReviewed = this.getLastReviewedTimestamp();
    if (lastReviewed) {
      params.append('lastReviewed', lastReviewed.toString());
    }

    try {
      const response = await fetch(`/api/cases/micro-learning?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch cases');

      const data = await response.json();
      return data.cases || [];
    } catch (error) {
      console.error('Failed to load micro-learning cases:', error);
      return this.getFallbackCases();
    }
  }

  getLastReviewedTimestamp() {
    const sessions = this.completedSessions;
    if (sessions.length === 0) return null;
    const lastSession = sessions[sessions.length - 1];
    return lastSession.completedAt || null;
  }

  // Mobile-optimized session UI
  renderMobileSession() {
    const container = document.getElementById('micro-learning-container') || this.createContainer();
    
    container.innerHTML = `
      <div class="micro-session-wrapper">
        <div class="session-header">
          <div class="session-progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
          <div class="session-info">
            <span class="session-timer">5:00</span>
            <span class="session-specialty">${this.currentSession.specialty}</span>
          </div>
          <button class="session-close-btn" onclick="microLearning.pauseSession()">⏸️</button>
        </div>
        
        <div class="session-content" id="session-content">
          ${this.renderCurrentCase()}
        </div>
        
        <div class="session-controls">
          <button class="session-btn secondary" onclick="microLearning.previousCase()">◀️ Previous</button>
          <button class="session-btn primary" onclick="microLearning.nextCase()">Next ▶️</button>
        </div>
        
        <div class="quick-actions">
          <button class="quick-action-btn" onclick="microLearning.bookmarkCase()" title="Bookmark">
            🔖
          </button>
          <button class="quick-action-btn" onclick="microLearning.flagDifficult()" title="Flag as Difficult">
            🚩
          </button>
          <button class="quick-action-btn" onclick="microLearning.requestHint()" title="Get Hint">
            💡
          </button>
        </div>
      </div>
    `;

    // Add mobile-specific event listeners
    this.addMobileGestures(container);
  }

  // Add swipe gestures for mobile navigation
  addMobileGestures(container) {
    let startX, startY, startTime;
    let isSwipingHorizontally = false;

    const sessionContent = container.querySelector('#session-content');

    sessionContent.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      isSwipingHorizontally = false;
    }, { passive: true });

    sessionContent.addEventListener('touchmove', (e) => {
      if (!startX || !startY) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 30) {
        isSwipingHorizontally = true;
        e.preventDefault(); // Prevent scrolling
      }
    }, { passive: false });

    sessionContent.addEventListener('touchend', (e) => {
      if (!startX || !startY || !isSwipingHorizontally) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaTime = Date.now() - startTime;

      // Check for valid swipe (minimum distance and speed)
      if (Math.abs(deltaX) > 100 && deltaTime < 300) {
        if (deltaX > 0) {
          // Swipe right - previous case
          this.previousCase();
        } else {
          // Swipe left - next case
          this.nextCase();
        }
      }

      // Reset
      startX = startY = null;
      isSwipingHorizontally = false;
    }, { passive: true });
  }

  // Session timer management
  startSessionTimer() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);

    this.sessionTimer = setInterval(() => {
      const elapsed = Date.now() - this.sessionStartTime;
      const remaining = Math.max(0, this.sessionDuration - elapsed);
      
      this.updateSessionTimer(remaining);
      
      if (remaining === 0) {
        this.completeSession();
      }
    }, 1000);
  }

  updateSessionTimer(remainingMs) {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timerDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const timerElement = document.querySelector('.session-timer');
    if (timerElement) {
      timerElement.textContent = timerDisplay;
    }

    // Update progress bar
    const elapsed = this.sessionDuration - remainingMs;
    const progressPercent = (elapsed / this.sessionDuration) * 100;
    const progressBar = document.querySelector('.progress-fill');
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }
  }

  // Case navigation
  nextCase() {
    if (!this.currentSession) return;

    const currentIndex = this.currentSession.currentCaseIndex || 0;
    if (currentIndex < this.currentSession.cases.length - 1) {
      this.currentSession.currentCaseIndex = currentIndex + 1;
      this.updateCaseContent();
      this.trackProgress('case_viewed');
      this.persistActiveSession();
    } else {
      // Last case — complete the session
      this.completeSession();
    }
  }

  previousCase() {
    if (!this.currentSession) return;

    const currentIndex = this.currentSession.currentCaseIndex || 0;
    if (currentIndex > 0) {
      this.currentSession.currentCaseIndex = currentIndex - 1;
      this.updateCaseContent();
      this.persistActiveSession();
    }
  }

  // Update the session-content element with the current case HTML
  updateCaseContent() {
    const contentEl = document.getElementById('session-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderCurrentCase();
    }
  }

  // Render current case in mobile-optimized format
  renderCurrentCase() {
    if (!this.currentSession || !this.currentSession.cases.length) {
      return '<div class="no-cases">No cases available for this session.</div>';
    }

    const currentIndex = this.currentSession.currentCaseIndex || 0;
    const currentCase = this.currentSession.cases[currentIndex];

    return `
      <div class="case-container">
        <div class="case-header">
          <h3 class="case-title">${currentCase.title}</h3>
          <div class="case-meta">
            <span class="case-difficulty">${currentCase.difficulty}</span>
            <span class="case-specialty">${currentCase.specialty}</span>
          </div>
        </div>
        
        <div class="case-image-container">
          <img src="${currentCase.imageUrl}" alt="${currentCase.title}" 
               class="case-image mobile-optimized"
               loading="lazy">
          <div class="zoom-hint">📱 Pinch to zoom</div>
        </div>
        
        <div class="case-question">
          <p>${currentCase.question}</p>
        </div>
        
        <div class="case-options">
          ${this.renderCaseOptions(currentCase)}
        </div>
        
        <div class="case-navigation">
          <span class="case-counter">
            ${currentIndex + 1} of ${this.currentSession.cases.length}
          </span>
        </div>
      </div>
    `;
  }

  renderCaseOptions(caseData) {
    if (!caseData.options) return '';

    return caseData.options.map((option, index) => `
      <button class="case-option-btn"
              onclick="microLearning.selectAnswer(${index})"
              data-option="${index}">
        ${option}
      </button>
    `).join('');
  }

  // Answer selection
  selectAnswer(optionIndex) {
    if (!this.currentSession) return;

    const currentIndex = this.currentSession.currentCaseIndex || 0;
    const currentCase = this.currentSession.cases[currentIndex];

    const isCorrect = optionIndex === currentCase.correctAnswer;
    this.trackProgress('answer_submitted', { correct: isCorrect });

    // Show immediate feedback
    this.showAnswerFeedback(isCorrect, currentCase, optionIndex);

    // Auto-advance after feedback
    setTimeout(() => {
      this.nextCase();
    }, 2000);
  }

  showAnswerFeedback(isCorrect, caseData, selectedIndex) {
    const optionButtons = document.querySelectorAll('.case-option-btn');
    optionButtons.forEach((btn, index) => {
      btn.disabled = true;
      if (index === caseData.correctAnswer) {
        btn.classList.add('correct');
      } else if (index === selectedIndex) {
        btn.classList.add('incorrect');
      }
    });

    // Show explanation if available
    if (caseData.explanation) {
      const explanationEl = document.createElement('div');
      explanationEl.className = 'answer-explanation';
      explanationEl.innerHTML = `
        <div class="explanation-header ${isCorrect ? 'correct' : 'incorrect'}">
          ${isCorrect ? 'Correct!' : 'Incorrect'}
        </div>
        <div class="explanation-text">${caseData.explanation}</div>
      `;

      const questionContainer = document.querySelector('.case-question');
      if (questionContainer) {
        questionContainer.appendChild(explanationEl);
      }
    }
  }

  // Session completion
  completeSession() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }

    if (!this.currentSession) return;

    // Clear persisted active session (it's now complete)
    this.clearPersistedSession();

    // Calculate session statistics
    const sessionStats = this.calculateSessionStats();
    
    // Save to local storage and sync
    this.saveCompletedSession(sessionStats);
    
    // Show completion screen
    this.showCompletionScreen(sessionStats);
    
    // Schedule background sync if service worker available
    this.scheduleSync('session-completed');
  }

  calculateSessionStats() {
    if (!this.currentSession) return null;

    const totalTime = Date.now() - this.sessionStartTime;
    const progress = this.currentSession.progress;

    return {
      sessionId: this.currentSession.id,
      completedAt: Date.now(),
      duration: totalTime,
      specialty: this.currentSession.specialty,
      difficulty: this.currentSession.difficulty,
      casesViewed: progress.casesViewed,
      questionsAnswered: progress.questionsAnswered,
      correctAnswers: progress.correctAnswers,
      accuracy: progress.questionsAnswered > 0 ? 
                (progress.correctAnswers / progress.questionsAnswered) * 100 : 0,
      contextData: this.currentSession.contextAware
    };
  }

  // Context awareness
  getContextData() {
    return {
      timeOfDay: this.getTimeOfDay(),
      deviceType: this.getDeviceType(),
      connectionType: this.getConnectionType(),
      availableTime: this.estimateAvailableTime(),
      location: this.getLocationContext()
    };
  }

  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 6) return 'early-morning';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  getDeviceType() {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|android/i.test(userAgent)) return 'phone';
    return 'desktop';
  }

  getConnectionType() {
    if ('connection' in navigator) {
      return navigator.connection.effectiveType || 'unknown';
    }
    return 'unknown';
  }

  estimateAvailableTime() {
    // Default to 5 minutes for mobile micro-learning sessions
    return 5;
  }

  getLocationContext() {
    return 'unknown';
  }

  pauseSession() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    this.persistActiveSession();
    // Remove overlay
    const container = document.getElementById('micro-learning-container');
    if (container) container.remove();
    this.currentSession = null;
  }

  bookmarkCase() {
    if (!this.currentSession) return;
    const idx = this.currentSession.currentCaseIndex || 0;
    const c = this.currentSession.cases[idx];
    if (!c) return;
    // Toggle bookmark via API
    fetch(`/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ case_id: c.id })
    }).catch(() => {});
    // Visual feedback
    const btn = document.querySelector('.quick-action-btn[title="Bookmark"]');
    if (btn) { btn.style.background = 'rgba(99, 102, 241, 0.3)'; setTimeout(() => { btn.style.background = ''; }, 600); }
  }

  flagDifficult() {
    if (!this.currentSession) return;
    const idx = this.currentSession.currentCaseIndex || 0;
    const c = this.currentSession.cases[idx];
    if (!c) return;
    // Store flagged case locally
    const flagged = JSON.parse(localStorage.getItem('radcase_flagged_cases') || '[]');
    if (!flagged.includes(c.id)) { flagged.push(c.id); localStorage.setItem('radcase_flagged_cases', JSON.stringify(flagged)); }
    const btn = document.querySelector('.quick-action-btn[title="Flag as Difficult"]');
    if (btn) { btn.style.background = 'rgba(239, 68, 68, 0.3)'; setTimeout(() => { btn.style.background = ''; }, 600); }
  }

  requestHint() {
    if (!this.currentSession) return;
    const idx = this.currentSession.currentCaseIndex || 0;
    const c = this.currentSession.cases[idx];
    if (!c || !c.explanation) return;
    // Show a partial hint
    const hint = c.explanation.split('\n')[0] || 'No hint available.';
    const contentEl = document.getElementById('session-content');
    if (!contentEl) return;
    let hintEl = contentEl.querySelector('.hint-box');
    if (hintEl) return; // Already showing
    hintEl = document.createElement('div');
    hintEl.className = 'hint-box';
    hintEl.style.cssText = 'margin-top:12px;padding:12px;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#818cf8;font-size:0.85rem;';
    hintEl.textContent = hint;
    contentEl.appendChild(hintEl);
  }

  // ============ Cross-Device Session Resumption ============

  persistActiveSession() {
    if (!this.currentSession) {
      localStorage.removeItem('radcase_active_session');
      return;
    }
    const state = {
      session: this.currentSession,
      sessionStartTime: this.sessionStartTime,
      savedAt: Date.now()
    };
    localStorage.setItem('radcase_active_session', JSON.stringify(state));

    // Sync to other devices via SyncManager (WebSocket)
    if (window.syncManager && typeof window.syncManager.send === 'function') {
      window.syncManager.send('sync:session', state);
    }

    // Persist to server for cross-device resumption via REST
    fetch('/api/session/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        state,
        deviceId: window.syncManager?.deviceId || 'unknown'
      })
    }).catch(() => { /* offline — WebSocket sync will cover it */ });
  }

  clearPersistedSession() {
    localStorage.removeItem('radcase_active_session');
    if (window.syncManager && typeof window.syncManager.send === 'function') {
      window.syncManager.send('sync:session', { session: null });
    }
    // Clear server-side state
    fetch('/api/session/active', {
      method: 'DELETE',
      credentials: 'include'
    }).catch(() => {});
  }

  checkForResumableSession() {
    // Check localStorage first (same-device fast path)
    try {
      const saved = localStorage.getItem('radcase_active_session');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.session && state.savedAt &&
            Date.now() - state.savedAt < 30 * 60 * 1000) {
          const elapsed = state.savedAt - state.sessionStartTime;
          const remaining = this.sessionDuration - elapsed;
          if (remaining > 0) return state;
        }
        localStorage.removeItem('radcase_active_session');
      }
    } catch { /* ignore */ }
    return null;
  }

  // Check server for an active session from another device
  async checkServerForResumableSession() {
    try {
      const res = await fetch('/api/session/active', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.session) return null;
      const state = data.session;
      if (!state.session || !state.savedAt) return null;
      // Validate remaining time
      const elapsed = state.savedAt - state.sessionStartTime;
      const remaining = this.sessionDuration - elapsed;
      if (remaining <= 0) return null;
      return state;
    } catch {
      return null;
    }
  }

  async resumeSession(state) {
    this.currentSession = state.session;
    // Adjust session start so the remaining time is accurate
    const elapsed = state.savedAt - state.sessionStartTime;
    this.sessionStartTime = Date.now() - elapsed;

    this.renderMobileSession();
    this.startSessionTimer();
  }

  showResumePrompt(state) {
    const container = this.createContainer();
    const session = state.session;
    const elapsed = state.savedAt - state.sessionStartTime;
    const remainingSec = Math.max(0, Math.floor((this.sessionDuration - elapsed) / 1000));
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;

    container.innerHTML = `
      <div class="micro-session-wrapper" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:32px;">
        <h2 style="color:#818cf8;margin-bottom:8px;">Resume Session?</h2>
        <p style="color:#a1a1aa;margin-bottom:8px;">${session.specialty || 'General'} &middot; ${session.progress.casesViewed} cases viewed</p>
        <p style="color:#71717a;margin-bottom:24px;">${mins}:${secs.toString().padStart(2, '0')} remaining</p>
        <div style="display:flex;gap:12px;">
          <button class="btn btn-primary" id="resumeSessionBtn">Resume</button>
          <button class="btn btn-secondary" id="newSessionBtn">New Session</button>
        </div>
      </div>
    `;

    document.getElementById('resumeSessionBtn').addEventListener('click', () => {
      container.innerHTML = '';
      this.resumeSession(state);
    });

    document.getElementById('newSessionBtn').addEventListener('click', () => {
      this.clearPersistedSession();
      container.remove();
      this.startSession();
    });
  }

  setupSyncListener() {
    if (!window.syncManager) return;
    window.syncManager.on('sync:session', (payload) => {
      if (!payload) return;
      // Another device sent a session update
      if (payload.session) {
        localStorage.setItem('radcase_active_session', JSON.stringify(payload));
      } else {
        localStorage.removeItem('radcase_active_session');
      }
    });
  }

  showCompletionScreen(sessionStats) {
    if (!sessionStats) return;
    const container = document.getElementById('micro-learning-container');
    if (!container) return;

    const accuracy = sessionStats.accuracy ? Math.round(sessionStats.accuracy) : 0;
    container.innerHTML = `
      <div class="micro-session-wrapper" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:32px;">
        <h2 style="color:#818cf8;margin-bottom:16px;">Session Complete!</h2>
        <p style="color:#a1a1aa;margin-bottom:24px;">Cases: ${sessionStats.casesViewed} | Accuracy: ${accuracy}%</p>
        <button class="btn btn-primary" onclick="document.getElementById('micro-learning-container')?.remove()">Close</button>
      </div>
    `;
  }

  calculateOptimalDifficulty() {
    return this.preferences.lastDifficulty || 'All';
  }

  // Utility methods
  createContainer() {
    const container = document.createElement('div');
    container.id = 'micro-learning-container';
    container.className = 'micro-learning-overlay';
    document.body.appendChild(container);
    return container;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  trackProgress(event, data = {}) {
    if (!this.currentSession) return;

    switch (event) {
      case 'case_viewed':
        this.currentSession.progress.casesViewed++;
        break;
      case 'answer_submitted':
        this.currentSession.progress.questionsAnswered++;
        if (data.correct) {
          this.currentSession.progress.correctAnswers++;
        }
        break;
    }

    // Store progress locally for sync
    this.storeProgressUpdate({
      sessionId: this.currentSession.id,
      event,
      data,
      timestamp: Date.now()
    });
  }

  // Storage methods
  loadCompletedSessions() {
    try {
      return JSON.parse(localStorage.getItem('radcase_completed_sessions') || '[]');
    } catch {
      return [];
    }
  }

  saveCompletedSession(sessionStats) {
    this.completedSessions.push(sessionStats);
    localStorage.setItem('radcase_completed_sessions', JSON.stringify(this.completedSessions));
  }

  loadPreferences() {
    try {
      return JSON.parse(localStorage.getItem('radcase_learning_preferences') || '{}');
    } catch {
      return {};
    }
  }

  storeProgressUpdate(update) {
    const pending = JSON.parse(localStorage.getItem('radcase_pending_progress') || '[]');
    pending.push(update);
    localStorage.setItem('radcase_pending_progress', JSON.stringify(pending));
  }

  // Background sync
  scheduleSync(tag) {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((swRegistration) => {
        return swRegistration.sync.register(tag);
      }).catch(console.error);
    }
  }

  // Fallback cases for offline
  getFallbackCases() {
    return [
      {
        id: 'fallback_1',
        title: 'Chest X-Ray - Pneumothorax',
        imageUrl: '/dicom/sample-chest-1.jpg',
        question: 'What abnormality do you observe in this chest X-ray?',
        options: [
          'Normal chest X-ray',
          'Left pneumothorax',
          'Right pneumothorax',
          'Bilateral pleural effusion'
        ],
        correctAnswer: 2,
        explanation: 'This shows a right-sided pneumothorax with visible pleural line and absent lung markings.',
        difficulty: 'Intermediate',
        specialty: 'Chest'
      }
    ];
  }
}

// Global instance
window.microLearning = new MicroLearningSession();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MicroLearningSession;
}