// Quiz Engine - Unified session manager: card queue, scoring, session lifecycle, mode routing
// Replaces the fragmented swipe-quiz.js and micro-learning.js

// Shared HTML escaping utility
window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

class QuizEngine {
  constructor() {
    this.session = null;
    this.cards = [];
    this.currentIndex = 0;
    this.sessionCorrectStreak = 0;
    this.cardComponent = null;
    this.gamification = null;
    this.onSessionEnd = null;
  }

  setCardComponent(cardComponent) { this.cardComponent = cardComponent; }
  setGamification(gamification) { this.gamification = gamification; }

  // ========== Session Modes ==========

  async startQuickStudy(options = {}) {
    const params = new URLSearchParams();
    if (options.modality) params.append('modality', options.modality);
    if (options.body_part) params.append('body_part', options.body_part);
    if (options.difficulty) params.append('difficulty', options.difficulty);
    const limit = options.count || 10;
    params.append('limit', limit);

    const res = await fetch(`/api/cases/micro-learning?${params}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.cases || data.cases.length === 0) {
      window.toast?.('No cases match your filters', 'error');
      return false;
    }
    return this._startSession('quick', data.cases);
  }

  async startDailyChallenge() {
    const res = await fetch('/api/quiz/daily-challenge', { credentials: 'include' });
    const data = await res.json();
    if (!data.available) {
      window.toast?.('No daily challenge available', 'error');
      return false;
    }
    if (data.completed) {
      window.toast?.('Already completed today\'s challenge!', 'info');
      return false;
    }

    // Convert raw cases to MCQ format
    const mcqCases = await this._buildMcqCards(data.cases);
    return this._startSession('daily', mcqCases);
  }

  async startReviewDue() {
    const res = await fetch('/api/quiz/review/due?limit=20', { credentials: 'include' });
    if (!res.ok) {
      window.toast?.('Sign in to review due cases', 'error');
      return false;
    }
    const data = await res.json();
    const allCases = [...(data.dueCases || []), ...(data.newCases || [])];
    if (allCases.length === 0) {
      window.toast?.('No cases due for review!', 'info');
      return false;
    }
    const mcqCases = await this._buildMcqCards(allCases);
    return this._startSession('review', mcqCases);
  }

  async startStudyPlan(planId) {
    const res = await fetch(`/api/study-plans/${planId}/next-session`, { credentials: 'include' });
    if (!res.ok) {
      window.toast?.('Failed to load study plan session', 'error');
      return false;
    }
    const data = await res.json();
    if (!data.cases || data.cases.length === 0) {
      window.toast?.('Milestone complete! Advancing to next.', 'success');
      return false;
    }
    const mcqCases = await this._buildMcqCards(data.cases);
    this._planId = planId;
    this._milestoneIndex = data.milestoneIndex;
    return this._startSession('plan', mcqCases);
  }

  async startWeaknessDrill() {
    const res = await fetch('/api/analytics/deep', { credentials: 'include' });
    const data = await res.json();
    if (!data.authenticated) {
      window.toast?.('Sign in for weakness drill', 'error');
      return false;
    }
    // Find weakest body parts
    const weak = (data.weakestCases || []).slice(0, 10);
    if (weak.length === 0) {
      window.toast?.('Not enough data for weakness drill yet', 'info');
      return false;
    }
    // Fetch full case data for weak cases
    const cases = [];
    for (const w of weak) {
      try {
        const r = await fetch(`/api/cases/${w.id}`);
        if (r.ok) cases.push(await r.json());
      } catch (e) {}
    }
    if (cases.length === 0) {
      window.toast?.('No weak cases found', 'info');
      return false;
    }
    const mcqCases = await this._buildMcqCards(cases);
    return this._startSession('weakness', mcqCases);
  }

  // ========== Core Session Lifecycle ==========

  async _startSession(mode, cards) {
    // Create server-side session
    let sessionId = 'guest-' + Date.now();
    try {
      const res = await fetch('/api/quiz/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode, planId: this._planId || null })
      });
      const data = await res.json();
      sessionId = data.sessionId;
    } catch (e) {}

    this.session = {
      id: sessionId,
      mode,
      startedAt: Date.now(),
      totalQuestions: cards.length,
      correctCount: 0,
      xpEarned: 0,
      answers: [],
    };
    this.cards = cards;
    this.currentIndex = 0;
    this.sessionCorrectStreak = 0;

    // Show session UI
    this._showSessionUI();
    this._showCurrentCard();
    return true;
  }

  async _buildMcqCards(rawCases) {
    const mcqCards = [];
    for (const c of rawCases) {
      // If already in MCQ format (from micro-learning endpoint)
      if (c.options && c.correctAnswer !== undefined) {
        mcqCards.push(c);
        continue;
      }
      // Build MCQ from raw case
      try {
        const res = await fetch(`/api/quiz/mcq-options/${c.id}`);
        const data = await res.json();
        mcqCards.push({
          id: c.id,
          title: c.title,
          imageUrl: c.thumbnail ? `/thumbnails/${c.thumbnail}` : (c.images?.[0] ? `/uploads/${c.images[0].filename}` : ''),
          question: `What is the most likely diagnosis?`,
          options: data.options,
          correctAnswer: data.correctIndex,
          explanation: c.teaching_points || c.findings || '',
          difficulty: c.difficulty,
          specialty: c.body_part || c.modality || 'General',
          modality: c.modality,
          body_part: c.body_part,
          clinical_history: c.clinical_history,
          findings: c.findings,
          teaching_points: c.teaching_points,
        });
      } catch (e) {
        // Skip cases where MCQ generation fails
      }
    }
    return mcqCards;
  }

  _showSessionUI() {
    // Remove any existing session overlay
    document.querySelector('.quiz-session-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'quiz-session-overlay';
    overlay.innerHTML = `
      <div class="quiz-session-header">
        <button class="quiz-session-close" aria-label="Close session">&times;</button>
        <div class="quiz-session-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width: 0%"></div></div>
          <span class="quiz-progress-text">1 / ${this.cards.length}</span>
        </div>
        <div class="quiz-session-xp">
          <span class="quiz-xp-value">0</span> XP
        </div>
      </div>
      <div class="quiz-card-container"></div>
    `;

    overlay.querySelector('.quiz-session-close').addEventListener('click', () => {
      if (confirm('End this session?')) this.endSession();
    });

    document.body.appendChild(overlay);
    // Keyboard shortcuts
    this._keyHandler = (e) => this._handleKeydown(e);
    document.addEventListener('keydown', this._keyHandler);
  }

  _showCurrentCard() {
    if (this.currentIndex >= this.cards.length) {
      this.endSession();
      return;
    }

    const container = document.querySelector('.quiz-card-container');
    if (!container) return;

    const card = this.cards[this.currentIndex];
    const xpPreview = 10 + ((card.difficulty || 2) * 2);

    container.innerHTML = '';
    if (this.cardComponent) {
      this.cardComponent.render(container, card, xpPreview, (answerIndex) => {
        this._handleAnswer(answerIndex);
      }, () => {
        this._advanceCard();
      });
    }

    // Update progress
    this._updateProgress();
  }

  _handleAnswer(answerIndex) {
    const card = this.cards[this.currentIndex];
    const correct = answerIndex === card.correctAnswer;

    if (correct) {
      this.session.correctCount++;
      this.sessionCorrectStreak++;
    } else {
      this.sessionCorrectStreak = 0;
    }

    // Record attempt server-side
    const timeSpent = Date.now() - (this._cardShownAt || Date.now());
    this._recordAttempt(card, correct, answerIndex, timeSpent);

    this.session.answers.push({
      caseId: card.id,
      answerIndex,
      correctIndex: card.correctAnswer,
      correct,
      timeSpent,
    });
  }

  async _recordAttempt(card, correct, answerIndex, timeSpent) {
    try {
      const res = await fetch('/api/quiz/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          case_id: card.id,
          correct,
          time_spent_ms: timeSpent,
          session_id: this.session.id,
          answer_index: answerIndex,
          correct_index: card.correctAnswer,
        }),
      });
      const data = await res.json();

      // Update XP
      if (data.xpEarned) {
        this.session.xpEarned += data.xpEarned;
        this._updateXpDisplay(data.xpEarned);
      }
      if (data.levelUp && this.gamification) {
        this.gamification.showLevelUp();
      }
      if (data.newBadges?.length > 0 && this.gamification) {
        for (const badge of data.newBadges) {
          this.gamification.showBadgeEarned(badge);
        }
      }

      // Study plan progress
      if (this.session.mode === 'plan' && this._planId) {
        fetch(`/api/study-plans/${this._planId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ caseId: card.id, correct, milestoneIndex: this._milestoneIndex }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to record attempt:', e);
    }
  }

  _advanceCard() {
    this.currentIndex++;
    if (this.currentIndex >= this.cards.length) {
      this.endSession();
    } else {
      this._cardShownAt = Date.now();
      this._showCurrentCard();
    }
  }

  _updateProgress() {
    const fill = document.querySelector('.quiz-progress-fill');
    const text = document.querySelector('.quiz-progress-text');
    if (fill) fill.style.width = `${((this.currentIndex + 1) / this.cards.length) * 100}%`;
    if (text) text.textContent = `${this.currentIndex + 1} / ${this.cards.length}`;
    this._cardShownAt = Date.now();
  }

  _updateXpDisplay(earned) {
    const el = document.querySelector('.quiz-xp-value');
    if (el) {
      el.textContent = this.session.xpEarned;
      el.classList.add('quiz-xp-pulse');
      setTimeout(() => el.classList.remove('quiz-xp-pulse'), 600);
    }
    // Float +XP indicator
    const container = document.querySelector('.quiz-session-xp');
    if (container && earned > 0) {
      const float = document.createElement('span');
      float.className = 'quiz-xp-float';
      float.textContent = `+${earned}`;
      container.appendChild(float);
      setTimeout(() => float.remove(), 1200);
    }
  }

  async endSession() {
    // Complete session server-side
    try {
      const res = await fetch(`/api/quiz/session/${this.session.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.bonusXp) {
        this.session.xpEarned += data.bonusXp;
      }
      if (data.newBadges?.length > 0 && this.gamification) {
        for (const badge of data.newBadges) {
          this.gamification.showBadgeEarned(badge);
        }
      }
    } catch (e) {}

    // Daily challenge result
    if (this.session.mode === 'daily') {
      try {
        await fetch('/api/quiz/daily-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ score: this.session.correctCount, total: this.session.answers.length }),
        });
      } catch (e) {}
    }

    this._showResults();
    document.removeEventListener('keydown', this._keyHandler);
  }

  _showResults() {
    const overlay = document.querySelector('.quiz-session-overlay');
    if (!overlay) return;

    const accuracy = this.session.answers.length > 0
      ? Math.round((this.session.correctCount / this.session.answers.length) * 100)
      : 0;
    const duration = Math.round((Date.now() - this.session.startedAt) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    overlay.innerHTML = `
      <div class="quiz-results">
        <h2 class="quiz-results-title">Session Complete!</h2>
        <div class="quiz-results-accuracy">
          <div class="quiz-results-circle" style="--accuracy: ${accuracy}">
            <span>${accuracy}%</span>
          </div>
        </div>
        <div class="quiz-results-stats">
          <div class="quiz-results-stat">
            <span class="quiz-results-stat-value">${this.session.correctCount}/${this.session.answers.length}</span>
            <span class="quiz-results-stat-label">Correct</span>
          </div>
          <div class="quiz-results-stat">
            <span class="quiz-results-stat-value">${this.session.xpEarned}</span>
            <span class="quiz-results-stat-label">XP Earned</span>
          </div>
          <div class="quiz-results-stat">
            <span class="quiz-results-stat-value">${minutes}:${seconds.toString().padStart(2, '0')}</span>
            <span class="quiz-results-stat-label">Time</span>
          </div>
        </div>
        <div class="quiz-results-actions">
          <button class="btn btn-secondary quiz-results-btn" data-action="review">Review Missed</button>
          <button class="btn btn-primary quiz-results-btn" data-action="close">Done</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="review"]')?.addEventListener('click', () => {
      this._showMissedReview(overlay);
    });
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      overlay.remove();
      this.session = null;
      this._planId = null;
      this._milestoneIndex = null;
      if (this.onSessionEnd) this.onSessionEnd();
    });
  }

  _showMissedReview(overlay) {
    const missed = this.session.answers.filter(a => !a.correct);
    if (missed.length === 0) {
      window.toast?.('No missed questions!', 'success');
      return;
    }

    let html = `
      <div class="quiz-results">
        <h2 class="quiz-results-title">Missed Questions</h2>
        <div class="quiz-missed-list">
    `;
    for (const m of missed) {
      const card = this.cards.find(c => c.id === m.caseId);
      if (!card) continue;
      html += `
        <div class="quiz-missed-item">
          <div class="quiz-missed-q">${card.question}</div>
          <div class="quiz-missed-your">Your answer: <span class="quiz-missed-wrong">${card.options[m.answerIndex] || '?'}</span></div>
          <div class="quiz-missed-correct">Correct: <span class="quiz-missed-right">${card.options[m.correctIndex]}</span></div>
          ${card.explanation ? `<div class="quiz-missed-explanation">${card.explanation}</div>` : ''}
        </div>
      `;
    }
    html += `
        </div>
        <div class="quiz-results-actions">
          <button class="btn btn-primary quiz-results-btn" data-action="close-review">Close</button>
        </div>
      </div>
    `;
    overlay.innerHTML = html;
    overlay.querySelector('[data-action="close-review"]')?.addEventListener('click', () => {
      overlay.remove();
      this.session = null;
      if (this.onSessionEnd) this.onSessionEnd();
    });
  }

  _handleKeydown(e) {
    if (!this.session) return;
    const card = document.querySelector('.quiz-mcq-card');
    if (!card) return;

    // A/B/C/D to select answer
    const keyMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
    const idx = keyMap[e.key.toLowerCase()];
    if (idx !== undefined && !card.dataset.answered) {
      const btn = card.querySelectorAll('.quiz-option-btn')[idx];
      if (btn) btn.click();
      return;
    }

    // Space or ArrowRight to advance
    if ((e.key === ' ' || e.key === 'ArrowRight') && card.dataset.answered) {
      e.preventDefault();
      const nextBtn = card.querySelector('.quiz-next-btn');
      if (nextBtn) nextBtn.click();
    }
  }
}

// Singleton
window.quizEngine = new QuizEngine();
