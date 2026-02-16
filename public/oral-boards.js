// RadCase Oral Board Simulator - AI-powered ABR oral board simulation
// Exposes window.oralBoards global

(function() {
  'use strict';

  const API = '/api';

  // ============ State ============

  const ob = {
    container: null,
    initialized: false,
    currentView: 'hub', // 'hub' | 'session' | 'review'
    sessions: [],
    stats: null,
    activeSession: null,
    timer: null,
    timerInterval: null,
    elapsedMs: 0,
    recognition: null,
    isListening: false,
    ttsEnabled: true,
    speechSupported: false,
    recognitionSupported: false,
    liveTranscript: '',
    speechPauseTimer: null,
    cases: [],
  };

  // ============ Helpers ============

  function esc(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function formatTimerDisplay(ms, timeLimit) {
    if (!timeLimit) return formatTime(ms);
    const remainMs = Math.max(0, timeLimit - ms);
    return formatTime(remainMs);
  }

  function scoreColor(score) {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  }

  function modeBadgeClass(mode) {
    return mode === 'timed' ? 'ob-badge-timed' : 'ob-badge-practice';
  }

  // ============ API Functions ============

  async function apiCreateSession(caseId, mode, difficulty) {
    const body = { mode: mode || 'practice' };
    if (caseId) body.caseId = caseId;
    if (difficulty) body.difficulty = difficulty;
    const res = await fetch(`${API}/oral-boards/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create oral board session');
    }
    return await res.json();
  }

  async function apiSubmitResponse(sessionId, message, isVoiceTranscript) {
    const res = await fetch(`${API}/oral-boards/sessions/${sessionId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message, isVoiceTranscript: !!isVoiceTranscript })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit response');
    }
    return await res.json();
  }

  async function apiEndSession(sessionId, reason) {
    const res = await fetch(`${API}/oral-boards/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason: reason || 'user_ended' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to end session');
    }
    return await res.json();
  }

  async function apiFetchSessions(status, limit, offset) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    const res = await fetch(`${API}/oral-boards/sessions?${params}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch sessions');
    }
    return await res.json();
  }

  async function apiFetchSession(sessionId) {
    const res = await fetch(`${API}/oral-boards/sessions/${sessionId}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch session');
    }
    return await res.json();
  }

  async function apiFetchReplay(sessionId) {
    const res = await fetch(`${API}/oral-boards/sessions/${sessionId}/replay`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch session replay');
    }
    return await res.json();
  }

  async function apiDeleteSession(sessionId) {
    const res = await fetch(`${API}/oral-boards/sessions/${sessionId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete session');
    }
  }

  async function apiFetchStats() {
    const res = await fetch(`${API}/oral-boards/stats`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch oral board stats');
    }
    return await res.json();
  }

  // ============ Speech APIs ============

  function initSpeech() {
    // Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      ob.recognitionSupported = true;
      ob.recognition = new SpeechRecognition();
      ob.recognition.continuous = true;
      ob.recognition.interimResults = true;
      ob.recognition.lang = 'en-US';

      ob.recognition.onresult = function(e) {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          ob.liveTranscript += (ob.liveTranscript ? ' ' : '') + final;
        }

        // Update the live transcript UI
        updateLiveTranscript(ob.liveTranscript + (interim ? ' ' + interim : ''));

        // Reset pause timer on any result
        clearTimeout(ob.speechPauseTimer);
        if (ob.liveTranscript) {
          ob.speechPauseTimer = setTimeout(function() {
            if (ob.isListening && ob.liveTranscript.trim()) {
              // Auto-submit after 1.5s silence
              stopListening();
              submitVoiceTranscript();
            }
          }, 1500);
        }
      };

      ob.recognition.onerror = function(e) {
        console.warn('Speech recognition error:', e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          if (window.toast) window.toast('Microphone access denied', 'error');
        }
        ob.isListening = false;
        updateMicButton();
      };

      ob.recognition.onend = function() {
        // If we are still in listening mode, restart (continuous mode)
        if (ob.isListening) {
          try {
            ob.recognition.start();
          } catch (e) {
            ob.isListening = false;
            updateMicButton();
          }
        }
      };
    }

    // Speech Synthesis
    ob.speechSupported = 'speechSynthesis' in window;
  }

  function startListening() {
    if (!ob.recognitionSupported || !ob.recognition) {
      if (window.toast) window.toast('Speech recognition not supported in this browser', 'error');
      return;
    }
    ob.liveTranscript = '';
    ob.isListening = true;
    updateLiveTranscript('');
    try {
      ob.recognition.start();
    } catch (e) {
      // Already started
    }
    updateMicButton();
    showLiveTranscriptArea();
  }

  function stopListening() {
    ob.isListening = false;
    clearTimeout(ob.speechPauseTimer);
    if (ob.recognition) {
      try {
        ob.recognition.stop();
      } catch (e) {}
    }
    updateMicButton();
  }

  function toggleListening() {
    if (ob.isListening) {
      stopListening();
      if (ob.liveTranscript.trim()) {
        submitVoiceTranscript();
      }
    } else {
      startListening();
    }
  }

  function submitVoiceTranscript() {
    const text = ob.liveTranscript.trim();
    if (!text) return;
    ob.liveTranscript = '';
    hideLiveTranscriptArea();
    sendUserMessage(text, true);
  }

  function updateMicButton() {
    const btn = ob.container?.querySelector('.ob-mic-btn');
    if (!btn) return;
    btn.classList.toggle('ob-mic-listening', ob.isListening);
    btn.setAttribute('aria-label', ob.isListening ? 'Stop listening' : 'Start voice input');
    btn.title = ob.isListening ? 'Stop listening' : 'Start voice input';
  }

  function showLiveTranscriptArea() {
    const area = ob.container?.querySelector('.ob-live-transcript');
    if (area) {
      area.classList.add('ob-live-transcript-active');
      area.textContent = 'Listening...';
    }
  }

  function hideLiveTranscriptArea() {
    const area = ob.container?.querySelector('.ob-live-transcript');
    if (area) {
      area.classList.remove('ob-live-transcript-active');
      area.textContent = '';
    }
  }

  function updateLiveTranscript(text) {
    const area = ob.container?.querySelector('.ob-live-transcript');
    if (area) {
      area.textContent = text || 'Listening...';
    }
  }

  function speakText(text) {
    if (!ob.speechSupported || !ob.ttsEnabled) return;
    // Cancel any current speech
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    // Try to pick a clear voice
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(function(v) { return v.lang.startsWith('en') && v.name.includes('Google'); })
      || voices.find(function(v) { return v.lang.startsWith('en-US'); })
      || voices[0];
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  }

  function toggleTTS() {
    ob.ttsEnabled = !ob.ttsEnabled;
    const btn = ob.container?.querySelector('.ob-tts-btn');
    if (btn) {
      btn.classList.toggle('ob-tts-off', !ob.ttsEnabled);
      btn.setAttribute('aria-label', ob.ttsEnabled ? 'Mute examiner voice' : 'Unmute examiner voice');
      btn.title = ob.ttsEnabled ? 'Mute examiner voice' : 'Unmute examiner voice';
    }
    if (!ob.ttsEnabled) {
      speechSynthesis.cancel();
    }
  }

  // ============ Timer ============

  function startTimer(timeLimit) {
    ob.elapsedMs = 0;
    ob.timer = timeLimit || null;
    updateTimerDisplay();
    ob.timerInterval = setInterval(function() {
      ob.elapsedMs += 1000;
      updateTimerDisplay();
      // Auto-end if timed mode and time is up
      if (ob.timer && ob.elapsedMs >= ob.timer) {
        clearInterval(ob.timerInterval);
        endSession('time_expired');
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(ob.timerInterval);
    ob.timerInterval = null;
  }

  function updateTimerDisplay() {
    const el = ob.container?.querySelector('.ob-timer-value');
    if (!el) return;
    if (ob.timer) {
      const remainMs = Math.max(0, ob.timer - ob.elapsedMs);
      el.textContent = formatTime(remainMs);
      const timerWrap = ob.container.querySelector('.ob-timer');
      if (timerWrap) {
        timerWrap.classList.toggle('ob-timer-danger', remainMs < 120000);
      }
    } else {
      el.textContent = formatTime(ob.elapsedMs);
    }
  }

  // ============ Session Management ============

  async function startNewSession(mode, caseId) {
    try {
      const data = await apiCreateSession(caseId, mode);
      ob.activeSession = {
        id: data.sessionId,
        caseId: data.caseId,
        mode: mode,
        timeLimit: data.timeLimit || (mode === 'timed' ? 900000 : null), // 15 min default
        transcript: [],
        turnNumber: 0,
        topicsCovered: [],
        isComplete: false,
      };

      // Add examiner's opening message
      if (data.examinerMessage) {
        ob.activeSession.transcript.push({
          role: 'examiner',
          text: data.examinerMessage,
          timestamp: Date.now()
        });
      }

      ob.currentView = 'session';
      renderSession();
      startTimer(ob.activeSession.timeLimit);

      // Speak the opening message
      if (data.examinerMessage) {
        speakText(data.examinerMessage);
      }

      // Scroll to bottom
      scrollChatToBottom();
    } catch (err) {
      console.error('Failed to start session:', err);
      if (window.toast) window.toast(err.message || 'Failed to start session', 'error');
    }
  }

  async function sendUserMessage(text, isVoice) {
    if (!ob.activeSession || ob.activeSession.isComplete || !text.trim()) return;

    const userMsg = {
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
      isVoice: !!isVoice
    };
    ob.activeSession.transcript.push(userMsg);
    ob.activeSession.turnNumber++;

    // Render user message and show typing indicator
    appendChatMessage(userMsg);
    showTypingIndicator();
    clearInput();

    try {
      const data = await apiSubmitResponse(ob.activeSession.id, text.trim(), isVoice);

      hideTypingIndicator();

      if (data.examinerMessage) {
        const examinerMsg = {
          role: 'examiner',
          text: data.examinerMessage,
          timestamp: Date.now(),
          turnNumber: data.turnNumber
        };
        ob.activeSession.transcript.push(examinerMsg);
        appendChatMessage(examinerMsg);
        speakText(data.examinerMessage);
      }

      // Update topics
      if (data.topicsCovered) {
        ob.activeSession.topicsCovered = data.topicsCovered;
        updateTopicsIndicator();
      }

      // Check if session is complete
      if (data.isComplete) {
        ob.activeSession.isComplete = true;
        stopTimer();
        appendSystemMessage('The examiner has concluded this session. Click "End Session" to see your evaluation.');
      }

      scrollChatToBottom();
    } catch (err) {
      hideTypingIndicator();
      console.error('Failed to submit response:', err);
      appendSystemMessage('Failed to send message. Please try again.');
      // Remove the failed user message from transcript
      ob.activeSession.transcript.pop();
      ob.activeSession.turnNumber--;
    }
  }

  async function endSession(reason) {
    if (!ob.activeSession) return;

    // Confirmation if user-initiated
    if (reason !== 'time_expired' && !ob.activeSession.isComplete) {
      if (!confirm('End this session? Your responses will be evaluated.')) return;
    }

    stopTimer();
    stopListening();
    speechSynthesis.cancel();

    try {
      showTypingIndicator();
      const data = await apiEndSession(ob.activeSession.id, reason || 'user_ended');
      hideTypingIndicator();

      // Store evaluation data
      ob.activeSession.evaluation = data.evaluation || {};
      ob.activeSession.score = data.score;
      ob.activeSession.strongPoints = data.strongPoints || [];
      ob.activeSession.weakPoints = data.weakPoints || [];
      ob.activeSession.missedFindings = data.missedFindings || [];
      ob.activeSession.recommendations = data.recommendations || [];
      ob.activeSession.rubric = data.rubric || {};
      ob.activeSession.isComplete = true;

      // Show review
      ob.currentView = 'review';
      renderReview(ob.activeSession);
    } catch (err) {
      hideTypingIndicator();
      console.error('Failed to end session:', err);
      if (window.toast) window.toast('Failed to end session', 'error');
    }
  }

  async function viewSessionReview(sessionId) {
    try {
      const data = await apiFetchSession(sessionId);
      ob.currentView = 'review';
      renderReview(data);
    } catch (err) {
      console.error('Failed to load session:', err);
      if (window.toast) window.toast('Failed to load session', 'error');
    }
  }

  async function deleteSession(sessionId) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await apiDeleteSession(sessionId);
      if (window.toast) window.toast('Session deleted', 'success');
      await loadHub();
    } catch (err) {
      console.error('Failed to delete session:', err);
      if (window.toast) window.toast('Failed to delete session', 'error');
    }
  }

  // ============ Hub View ============

  async function loadHub() {
    ob.currentView = 'hub';
    try {
      const [sessionsData, statsData] = await Promise.all([
        apiFetchSessions(null, 20, 0).catch(function() { return { sessions: [] }; }),
        apiFetchStats().catch(function() { return null; })
      ]);
      ob.sessions = sessionsData.sessions || [];
      ob.stats = statsData;
    } catch (err) {
      console.error('Failed to load hub data:', err);
      ob.sessions = [];
      ob.stats = null;
    }
    renderHub();
  }

  function renderHub() {
    if (!ob.container) return;

    const stats = ob.stats || {};
    const totalSessions = stats.totalSessions || 0;
    const avgScore = stats.averageScore != null ? Math.round(stats.averageScore) : '--';
    const trend = stats.improvementTrend || 0;
    const trendIcon = trend > 0 ? '&#x2191;' : (trend < 0 ? '&#x2193;' : '&#x2192;');
    const trendClass = trend > 0 ? 'ob-trend-up' : (trend < 0 ? 'ob-trend-down' : 'ob-trend-flat');

    let html = '';

    // Stats Card
    html += '<div class="ob-stats-card">';
    html += '  <div class="ob-stats-grid">';
    html += '    <div class="ob-stat-item">';
    html += '      <div class="ob-stat-value">' + totalSessions + '</div>';
    html += '      <div class="ob-stat-label">Sessions</div>';
    html += '    </div>';
    html += '    <div class="ob-stat-item">';
    html += '      <div class="ob-stat-value">' + avgScore + '</div>';
    html += '      <div class="ob-stat-label">Avg Score</div>';
    html += '    </div>';
    html += '    <div class="ob-stat-item">';
    html += '      <div class="ob-stat-value ' + trendClass + '">' + trendIcon + ' ' + Math.abs(trend) + '%</div>';
    html += '      <div class="ob-stat-label">Trend</div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Start New Session
    html += '<div class="ob-new-session-card">';
    html += '  <h3>Start New Session</h3>';
    html += '  <div class="ob-mode-options">';
    html += '    <button class="ob-mode-btn ob-mode-practice" data-mode="practice">';
    html += '      <span class="ob-mode-icon">&#x1F4D6;</span>';
    html += '      <span class="ob-mode-name">Practice Mode</span>';
    html += '      <span class="ob-mode-desc">Unlimited time, more guidance</span>';
    html += '    </button>';
    html += '    <button class="ob-mode-btn ob-mode-timed" data-mode="timed">';
    html += '      <span class="ob-mode-icon">&#x23F1;</span>';
    html += '      <span class="ob-mode-name">Timed Mode</span>';
    html += '      <span class="ob-mode-desc">15 min, simulates real exam</span>';
    html += '    </button>';
    html += '  </div>';
    html += '  <div class="ob-case-select">';
    html += '    <label class="ob-case-label" for="obCaseSelect">Case Selection</label>';
    html += '    <select class="ob-case-dropdown" id="obCaseSelect">';
    html += '      <option value="">AI chooses a case</option>';
    html += '    </select>';
    html += '  </div>';
    html += '</div>';

    // Past Sessions List
    html += '<div class="ob-sessions-list">';
    html += '  <h3>Past Sessions</h3>';

    if (ob.sessions.length === 0) {
      html += '  <div class="ob-empty-state">';
      html += '    <div class="ob-empty-icon">&#x1F399;</div>';
      html += '    <p>No sessions yet. Start your first oral board simulation above!</p>';
      html += '  </div>';
    } else {
      html += '  <div class="ob-session-items">';
      for (var i = 0; i < ob.sessions.length; i++) {
        var s = ob.sessions[i];
        var score = s.score != null ? s.score : '--';
        var scoreStyle = s.score != null ? 'color:' + scoreColor(s.score) : '';
        html += '<div class="ob-session-item" data-session-id="' + esc(s.id) + '">';
        html += '  <div class="ob-session-info">';
        html += '    <div class="ob-session-title">' + esc(s.caseTitle || 'Oral Board Session') + '</div>';
        html += '    <div class="ob-session-meta">';
        html += '      <span class="ob-session-date">' + formatDate(s.createdAt || s.created_at) + '</span>';
        html += '      <span class="ob-mode-badge ' + modeBadgeClass(s.mode) + '">' + esc(s.mode || 'practice') + '</span>';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="ob-session-score" style="' + scoreStyle + '">' + score + '</div>';
        html += '  <div class="ob-session-actions">';
        html += '    <button class="ob-btn-icon ob-view-btn" data-action="view" title="View Review" aria-label="View session review">';
        html += '      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        html += '    </button>';
        html += '    <button class="ob-btn-icon ob-delete-btn" data-action="delete" title="Delete Session" aria-label="Delete session">';
        html += '      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        html += '    </button>';
        html += '  </div>';
        html += '</div>';
      }
      html += '  </div>';
    }

    html += '</div>';

    ob.container.innerHTML = html;

    // Attach event listeners
    attachHubListeners();
    loadCaseOptions();
  }

  function attachHubListeners() {
    // Mode buttons
    var modeBtns = ob.container.querySelectorAll('.ob-mode-btn');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', function() {
        var mode = this.dataset.mode;
        var caseSelect = document.getElementById('obCaseSelect');
        var caseId = caseSelect ? caseSelect.value : '';
        startNewSession(mode, caseId || null);
      });
    }

    // Session items
    var sessionItems = ob.container.querySelectorAll('.ob-session-item');
    for (var j = 0; j < sessionItems.length; j++) {
      sessionItems[j].addEventListener('click', function(e) {
        var sessionId = this.dataset.sessionId;
        var action = e.target.closest('[data-action]');
        if (action && action.dataset.action === 'delete') {
          e.stopPropagation();
          deleteSession(sessionId);
        } else {
          viewSessionReview(sessionId);
        }
      });
    }
  }

  async function loadCaseOptions() {
    try {
      var res = await fetch(API + '/cases?limit=100', { credentials: 'include' });
      if (!res.ok) return;
      var data = await res.json();
      var cases = data.cases || [];
      var select = document.getElementById('obCaseSelect');
      if (!select) return;
      for (var i = 0; i < cases.length; i++) {
        var opt = document.createElement('option');
        opt.value = cases[i].id;
        opt.textContent = cases[i].title + (cases[i].modality ? ' (' + cases[i].modality + ')' : '');
        select.appendChild(opt);
      }
    } catch (e) {
      console.warn('Could not load case options:', e);
    }
  }

  // ============ Session View ============

  function renderSession() {
    if (!ob.container || !ob.activeSession) return;

    var session = ob.activeSession;
    var isTimedMode = session.mode === 'timed';

    var html = '';
    html += '<div class="ob-session-overlay">';

    // Header
    html += '<div class="ob-session-header">';
    html += '  <div class="ob-header-left">';
    html += '    <span class="ob-mode-badge ' + modeBadgeClass(session.mode) + '">' + esc(session.mode) + '</span>';
    html += '    <span class="ob-turn-counter">Turn: <span class="ob-turn-value">' + session.turnNumber + '</span></span>';
    html += '  </div>';
    html += '  <div class="ob-timer' + (isTimedMode ? '' : ' ob-timer-practice') + '">';
    html += '    <span class="ob-timer-icon">&#x23F1;</span>';
    html += '    <span class="ob-timer-value">' + (isTimedMode ? formatTime(session.timeLimit) : '0:00') + '</span>';
    html += '  </div>';
    html += '  <div class="ob-header-right">';
    if (ob.speechSupported) {
      html += '  <button class="ob-tts-btn' + (ob.ttsEnabled ? '' : ' ob-tts-off') + '" title="' + (ob.ttsEnabled ? 'Mute examiner voice' : 'Unmute examiner voice') + '" aria-label="Toggle examiner voice">';
      html += '    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
      html += '  </button>';
    }
    html += '    <button class="ob-end-btn" title="End Session" aria-label="End session">End Session</button>';
    html += '  </div>';
    html += '</div>';

    // Topics progress
    html += '<div class="ob-topics-bar">';
    html += '  <div class="ob-topics-label">Topics Covered</div>';
    html += '  <div class="ob-topics-chips" id="obTopicsChips"></div>';
    html += '</div>';

    // Chat area
    html += '<div class="ob-chat-area" id="obChatArea">';
    // Render existing transcript
    for (var i = 0; i < session.transcript.length; i++) {
      html += renderChatBubble(session.transcript[i]);
    }
    html += '</div>';

    // Typing indicator (hidden by default)
    html += '<div class="ob-typing-indicator" id="obTypingIndicator" style="display:none;">';
    html += '  <span class="ob-typing-dot"></span>';
    html += '  <span class="ob-typing-dot"></span>';
    html += '  <span class="ob-typing-dot"></span>';
    html += '  <span class="ob-typing-label">Examiner is thinking...</span>';
    html += '</div>';

    // Live transcript area (for voice input)
    html += '<div class="ob-live-transcript" id="obLiveTranscript"></div>';

    // Input area
    html += '<div class="ob-input-area">';
    if (ob.recognitionSupported) {
      html += '<button class="ob-mic-btn" title="Start voice input" aria-label="Start voice input">';
      html += '  <span class="ob-mic-pulse"></span>';
      html += '  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      html += '</button>';
    }
    html += '  <div class="ob-text-input-wrap">';
    html += '    <textarea class="ob-text-input" id="obTextInput" placeholder="Type your response..." rows="1" aria-label="Type your response"></textarea>';
    html += '  </div>';
    html += '  <button class="ob-send-btn" title="Send" aria-label="Send response">';
    html += '    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    html += '  </button>';
    html += '</div>';

    html += '</div>'; // session-overlay

    ob.container.innerHTML = html;

    // Attach session event listeners
    attachSessionListeners();
    scrollChatToBottom();
  }

  function renderChatBubble(msg) {
    var isExaminer = msg.role === 'examiner';
    var cls = isExaminer ? 'ob-bubble-examiner' : 'ob-bubble-user';
    var label = isExaminer ? 'Examiner' : 'You';
    var voiceTag = msg.isVoice ? ' <span class="ob-voice-tag">&#x1F399; voice</span>' : '';

    var html = '<div class="ob-chat-bubble ' + cls + '">';
    html += '  <div class="ob-bubble-header">';
    html += '    <span class="ob-bubble-role">' + label + '</span>';
    html += voiceTag;
    html += '  </div>';
    html += '  <div class="ob-bubble-text">' + esc(msg.text) + '</div>';
    html += '</div>';
    return html;
  }

  function appendChatMessage(msg) {
    var chatArea = ob.container?.querySelector('#obChatArea');
    if (!chatArea) return;
    var div = document.createElement('div');
    div.innerHTML = renderChatBubble(msg);
    chatArea.appendChild(div.firstElementChild);
    scrollChatToBottom();
  }

  function appendSystemMessage(text) {
    var chatArea = ob.container?.querySelector('#obChatArea');
    if (!chatArea) return;
    var div = document.createElement('div');
    div.className = 'ob-system-message';
    div.textContent = text;
    chatArea.appendChild(div);
    scrollChatToBottom();
  }

  function showTypingIndicator() {
    var el = ob.container?.querySelector('#obTypingIndicator');
    if (el) el.style.display = 'flex';
    scrollChatToBottom();
  }

  function hideTypingIndicator() {
    var el = ob.container?.querySelector('#obTypingIndicator');
    if (el) el.style.display = 'none';
  }

  function scrollChatToBottom() {
    var chatArea = ob.container?.querySelector('#obChatArea');
    if (chatArea) {
      requestAnimationFrame(function() {
        chatArea.scrollTop = chatArea.scrollHeight;
      });
    }
  }

  function clearInput() {
    var input = ob.container?.querySelector('#obTextInput');
    if (input) {
      input.value = '';
      autoResizeTextarea(input);
    }
  }

  function updateTopicsIndicator() {
    var chips = ob.container?.querySelector('#obTopicsChips');
    if (!chips || !ob.activeSession) return;
    var topics = ob.activeSession.topicsCovered || [];
    if (topics.length === 0) {
      chips.innerHTML = '<span class="ob-topics-empty">None yet</span>';
      return;
    }
    chips.innerHTML = topics.map(function(t) {
      return '<span class="ob-topic-chip">' + esc(t) + '</span>';
    }).join('');
  }

  function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function attachSessionListeners() {
    // End session button
    var endBtn = ob.container.querySelector('.ob-end-btn');
    if (endBtn) {
      endBtn.addEventListener('click', function() { endSession('user_ended'); });
    }

    // TTS toggle
    var ttsBtn = ob.container.querySelector('.ob-tts-btn');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', toggleTTS);
    }

    // Mic button
    var micBtn = ob.container.querySelector('.ob-mic-btn');
    if (micBtn) {
      micBtn.addEventListener('click', toggleListening);
    }

    // Send button
    var sendBtn = ob.container.querySelector('.ob-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        var input = document.getElementById('obTextInput');
        if (input && input.value.trim()) {
          sendUserMessage(input.value, false);
        }
      });
    }

    // Text input
    var textInput = document.getElementById('obTextInput');
    if (textInput) {
      textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.value.trim()) {
            sendUserMessage(this.value, false);
          }
        }
      });
      textInput.addEventListener('input', function() {
        autoResizeTextarea(this);
      });
    }
  }

  // ============ Review View ============

  function renderReview(sessionData) {
    if (!ob.container) return;

    // Normalize data shape (active session vs fetched session)
    var session = sessionData.session || sessionData;
    var transcript = sessionData.transcript || session.transcript || [];
    var evaluation = sessionData.evaluation || session.evaluation || {};
    var rubric = evaluation.rubric || session.rubric || {};
    var score = evaluation.score != null ? evaluation.score : (session.score != null ? session.score : '--');
    var strongPoints = evaluation.strongPoints || session.strongPoints || [];
    var weakPoints = evaluation.weakPoints || session.weakPoints || [];
    var missedFindings = evaluation.missedFindings || session.missedFindings || [];
    var recommendations = evaluation.recommendations || session.recommendations || [];
    var caseInfo = sessionData.case || {};

    var html = '';
    html += '<div class="ob-review">';

    // Back button
    html += '<button class="ob-back-btn" aria-label="Back to hub">';
    html += '  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
    html += '  Back to Sessions';
    html += '</button>';

    // Case info
    html += '<div class="ob-review-header">';
    html += '  <h3>' + esc(caseInfo.title || session.caseTitle || 'Oral Board Session') + '</h3>';
    html += '  <div class="ob-review-meta">';
    html += '    <span class="ob-mode-badge ' + modeBadgeClass(session.mode) + '">' + esc(session.mode || 'practice') + '</span>';
    html += '    <span class="ob-review-date">' + formatDate(session.createdAt || session.created_at) + '</span>';
    html += '  </div>';
    html += '</div>';

    // Score Card
    html += '<div class="ob-scorecard">';
    html += '  <div class="ob-score-total">';
    html += '    <div class="ob-score-number" style="color:' + (score !== '--' ? scoreColor(score) : 'var(--text-secondary)') + '">' + score + '</div>';
    html += '    <div class="ob-score-label">Overall Score</div>';
    html += '  </div>';
    html += '  <div class="ob-rubric-grid">';

    // Rubric categories
    var rubricCategories = [
      { key: 'findings', label: 'Findings Identification', max: 25 },
      { key: 'differential', label: 'Differential Diagnosis', max: 25 },
      { key: 'workup', label: 'Workup & Management', max: 25 },
      { key: 'communication', label: 'Communication', max: 25 }
    ];

    for (var i = 0; i < rubricCategories.length; i++) {
      var cat = rubricCategories[i];
      var catScore = rubric[cat.key] != null ? rubric[cat.key] : '--';
      var catPct = catScore !== '--' ? (catScore / cat.max) * 100 : 0;
      html += '<div class="ob-rubric-item">';
      html += '  <div class="ob-rubric-label">' + cat.label + '</div>';
      html += '  <div class="ob-rubric-bar">';
      html += '    <div class="ob-rubric-fill" style="width:' + catPct + '%;background:' + (catScore !== '--' ? scoreColor(catPct) : 'var(--text-muted)') + '"></div>';
      html += '  </div>';
      html += '  <div class="ob-rubric-value">' + catScore + '/' + cat.max + '</div>';
      html += '</div>';
    }

    html += '  </div>';
    html += '</div>';

    // Strong Points
    if (strongPoints.length > 0) {
      html += '<div class="ob-feedback-section ob-feedback-strong">';
      html += '  <h4>&#x2705; Strong Points</h4>';
      html += '  <ul>';
      for (var s = 0; s < strongPoints.length; s++) {
        html += '<li>' + esc(strongPoints[s]) + '</li>';
      }
      html += '  </ul>';
      html += '</div>';
    }

    // Weak Points
    if (weakPoints.length > 0) {
      html += '<div class="ob-feedback-section ob-feedback-weak">';
      html += '  <h4>&#x26A0; Areas for Improvement</h4>';
      html += '  <ul>';
      for (var w = 0; w < weakPoints.length; w++) {
        html += '<li>' + esc(weakPoints[w]) + '</li>';
      }
      html += '  </ul>';
      html += '</div>';
    }

    // Missed Findings
    if (missedFindings.length > 0) {
      html += '<div class="ob-feedback-section ob-feedback-missed">';
      html += '  <h4>&#x1F50D; Missed Findings</h4>';
      html += '  <ul>';
      for (var m = 0; m < missedFindings.length; m++) {
        html += '<li>' + esc(missedFindings[m]) + '</li>';
      }
      html += '  </ul>';
      html += '</div>';
    }

    // Recommendations
    if (recommendations.length > 0) {
      html += '<div class="ob-feedback-section ob-feedback-recs">';
      html += '  <h4>&#x1F4CB; Recommendations</h4>';
      html += '  <ul>';
      for (var r = 0; r < recommendations.length; r++) {
        html += '<li>' + esc(recommendations[r]) + '</li>';
      }
      html += '  </ul>';
      html += '</div>';
    }

    // Transcript
    html += '<div class="ob-transcript-section">';
    html += '  <h4>Full Transcript</h4>';
    html += '  <div class="ob-transcript-list">';

    for (var t = 0; t < transcript.length; t++) {
      var turn = transcript[t];
      var annotation = turn.annotation || turn.quality || 'neutral';
      var annotClass = 'ob-turn-' + annotation;
      var roleLabel = turn.role === 'examiner' ? 'Examiner' : 'You';
      html += '<div class="ob-transcript-turn ' + annotClass + '">';
      html += '  <div class="ob-transcript-role">' + roleLabel + '</div>';
      html += '  <div class="ob-transcript-text">' + esc(turn.text || turn.message || '') + '</div>';
      if (turn.annotation && turn.annotation !== 'neutral') {
        html += '  <div class="ob-transcript-annotation">' + esc(turn.annotation) + '</div>';
      }
      html += '</div>';
    }

    html += '  </div>';
    html += '</div>';

    // Actions
    html += '<div class="ob-review-actions">';
    html += '  <button class="ob-action-btn ob-btn-secondary" data-action="back">Back to Sessions</button>';
    html += '  <button class="ob-action-btn ob-btn-primary" data-action="similar">Start Similar Session</button>';
    html += '</div>';

    html += '</div>'; // ob-review

    ob.container.innerHTML = html;

    // Attach review listeners
    attachReviewListeners(session);
  }

  function attachReviewListeners(session) {
    // Back button (top)
    var backBtn = ob.container.querySelector('.ob-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() { loadHub(); });
    }

    // Bottom action buttons
    var actionBtns = ob.container.querySelectorAll('.ob-action-btn');
    for (var i = 0; i < actionBtns.length; i++) {
      actionBtns[i].addEventListener('click', function() {
        var action = this.dataset.action;
        if (action === 'back') {
          loadHub();
        } else if (action === 'similar') {
          startNewSession(session.mode || 'practice', session.caseId || null);
        }
      });
    }
  }

  // ============ Init ============

  function init(container) {
    if (!container) return;
    ob.container = container;
    ob.initialized = true;

    if (!window.radcaseState?.currentUser) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:2rem;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="margin-bottom:1rem;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <h3 style="color:#e2e8f0;margin:0 0 0.5rem;">Sign In Required</h3>
          <p style="color:#94a3b8;margin:0 0 1rem;">Sign in to access the AI-powered oral board simulator, practice sessions, and performance tracking.</p>
          <button onclick="window.showAuthModal && showAuthModal()" style="background:#6366f1;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:0.5rem;cursor:pointer;font-size:0.9rem;">Sign In</button>
        </div>`;
      return;
    }

    initSpeech();
    loadHub();
  }

  // ============ Cleanup ============

  function destroy() {
    stopTimer();
    stopListening();
    if (ob.speechSupported) {
      speechSynthesis.cancel();
    }
    ob.container = null;
    ob.initialized = false;
    ob.activeSession = null;
    ob.currentView = 'hub';
  }

  // ============ Expose Global ============

  window.oralBoards = {
    init: init,
    destroy: destroy
  };

})();
