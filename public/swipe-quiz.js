// RadCase Swipe Quiz - Sprint 2 Advanced Mobile UX
// Tinder-like swipe interface for quick case review

class SwipeQuiz {
  constructor() {
    this.cases = [];
    this.currentIndex = 0;
    this.sessionTimer = null;
    this.sessionDuration = 5 * 60 * 1000; // 5 minutes
    this.sessionStartTime = null;
    this.stats = { correct: 0, incorrect: 0, skipped: 0 };
    this.isActive = false;
    this.container = null;

    // Swipe tracking
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.isDragging = false;
    this.swipeThreshold = 80;
  }

  async start(options = {}) {
    this.stats = { correct: 0, incorrect: 0, skipped: 0 };
    this.currentIndex = 0;
    this.isActive = true;

    // Fetch quiz cases
    const params = new URLSearchParams();
    if (options.modality) params.append('modality', options.modality);
    if (options.body_part) params.append('body_part', options.body_part);
    if (options.difficulty) params.append('difficulty', options.difficulty);
    params.append('limit', '20');

    try {
      const res = await fetch(`/api/cases?${params}`);
      const data = await res.json();
      this.cases = (data.cases || []).filter(c => c.diagnosis);

      if (this.cases.length === 0) {
        this.showNotification('No cases with diagnoses found. Add some cases first!');
        return;
      }

      // Shuffle
      for (let i = this.cases.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.cases[i], this.cases[j]] = [this.cases[j], this.cases[i]];
      }

      this.createUI();
      this.startTimer();
      this.renderCurrentCard();
    } catch (err) {
      console.error('Failed to load swipe quiz cases:', err);
      this.showNotification('Failed to load cases');
    }
  }

  createUI() {
    // Remove existing
    const existing = document.getElementById('swipe-quiz-overlay');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.id = 'swipe-quiz-overlay';
    this.container.className = 'swipe-quiz-overlay';
    this.container.innerHTML = `
      <div class="swipe-quiz-header">
        <button class="swipe-quiz-close" id="swipeQuizClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="swipe-quiz-timer" id="swipeQuizTimer">5:00</div>
        <div class="swipe-quiz-progress">
          <div class="swipe-quiz-progress-fill" id="swipeQuizProgress" style="width: 0%"></div>
        </div>
        <div class="swipe-quiz-stats" id="swipeQuizStats">0 / ${this.cases.length}</div>
      </div>

      <div class="swipe-quiz-hint">
        <span class="hint-left">Incorrect</span>
        <span class="hint-up">Skip</span>
        <span class="hint-right">Correct</span>
      </div>

      <div class="swipe-quiz-card-area" id="swipeCardArea">
        <!-- Cards rendered here -->
      </div>

      <div class="swipe-quiz-actions">
        <button class="swipe-action-btn swipe-action-incorrect" id="swipeLeft" title="Incorrect">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button class="swipe-action-btn swipe-action-skip" id="swipeUp" title="Skip">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
          </svg>
        </button>
        <button class="swipe-action-btn swipe-action-correct" id="swipeRight" title="Correct">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
    `;

    this.injectStyles();
    document.body.appendChild(this.container);
    document.body.style.overflow = 'hidden';

    // Event listeners
    document.getElementById('swipeQuizClose').addEventListener('click', () => this.end());
    document.getElementById('swipeLeft').addEventListener('click', () => this.handleSwipe('left'));
    document.getElementById('swipeUp').addEventListener('click', () => this.handleSwipe('up'));
    document.getElementById('swipeRight').addEventListener('click', () => this.handleSwipe('right'));
  }

  renderCurrentCard() {
    if (this.currentIndex >= this.cases.length) {
      this.end();
      return;
    }

    const c = this.cases[this.currentIndex];
    const cardArea = document.getElementById('swipeCardArea');
    if (!cardArea) return;

    const imgSrc = c.thumbnail
      ? `/thumbnails/${c.thumbnail}`
      : (c.images && c.images.length > 0 ? `/uploads/${c.images[0].filename}` : '');

    cardArea.innerHTML = `
      <div class="swipe-card" id="swipeCard">
        <div class="swipe-card-image">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${c.title}" draggable="false">`
            : `<div class="swipe-card-placeholder">No Image</div>`
          }
          <div class="swipe-card-overlay-left">Incorrect</div>
          <div class="swipe-card-overlay-right">Correct</div>
          <div class="swipe-card-overlay-up">Skip</div>
        </div>
        <div class="swipe-card-body">
          <div class="swipe-card-meta">
            ${c.modality ? `<span class="swipe-badge swipe-badge-modality">${c.modality}</span>` : ''}
            ${c.body_part ? `<span class="swipe-badge swipe-badge-bodypart">${c.body_part}</span>` : ''}
            <span class="swipe-badge swipe-badge-diff">Diff: ${c.difficulty || '?'}</span>
          </div>
          <h3 class="swipe-card-title">${c.title}</h3>
          <p class="swipe-card-history">${c.clinical_history || 'No clinical history provided.'}</p>
          <div class="swipe-card-diagnosis" id="swipeCardDiagnosis">
            <button class="swipe-reveal-btn" onclick="swipeQuiz.revealDiagnosis()">Tap to reveal diagnosis</button>
          </div>
        </div>
      </div>
    `;

    // Update progress
    const progress = ((this.currentIndex) / this.cases.length) * 100;
    const progressEl = document.getElementById('swipeQuizProgress');
    if (progressEl) progressEl.style.width = progress + '%';

    const statsEl = document.getElementById('swipeQuizStats');
    if (statsEl) statsEl.textContent = `${this.currentIndex + 1} / ${this.cases.length}`;

    // Attach swipe gestures to the card
    this.attachSwipeGestures(document.getElementById('swipeCard'));
  }

  revealDiagnosis() {
    const c = this.cases[this.currentIndex];
    if (!c) return;

    const diagEl = document.getElementById('swipeCardDiagnosis');
    if (diagEl) {
      diagEl.innerHTML = `
        <div class="swipe-diagnosis-revealed">
          <strong>Diagnosis:</strong> ${c.diagnosis}
          ${c.findings ? `<p class="swipe-findings"><strong>Findings:</strong> ${c.findings}</p>` : ''}
        </div>
      `;
    }
  }

  attachSwipeGestures(card) {
    if (!card) return;

    card.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      this.isDragging = true;
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.currentX = this.startX;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;
      this.currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = this.currentX - this.startX;
      const dy = currentY - this.startY;

      // Determine dominant direction
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const rotation = dx * 0.05;
      card.style.transform = `translateX(${dx}px) translateY(${Math.min(dy, 0)}px) rotate(${rotation}deg)`;

      // Show swipe overlays
      const leftOverlay = card.querySelector('.swipe-card-overlay-left');
      const rightOverlay = card.querySelector('.swipe-card-overlay-right');
      const upOverlay = card.querySelector('.swipe-card-overlay-up');

      const threshold = this.swipeThreshold;

      if (leftOverlay) leftOverlay.style.opacity = dx < -threshold * 0.5 ? Math.min(1, (-dx - threshold * 0.5) / threshold) : 0;
      if (rightOverlay) rightOverlay.style.opacity = dx > threshold * 0.5 ? Math.min(1, (dx - threshold * 0.5) / threshold) : 0;
      if (upOverlay) upOverlay.style.opacity = dy < -threshold * 0.5 && absDy > absDx ? Math.min(1, (-dy - threshold * 0.5) / threshold) : 0;
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      const dx = this.currentX - this.startX;
      const endY = parseInt(card.style.transform.match(/translateY\(([^p]+)/)?.[1] || '0');

      card.style.transition = 'transform 0.3s ease';

      if (dx > this.swipeThreshold) {
        this.animateSwipe(card, 'right');
      } else if (dx < -this.swipeThreshold) {
        this.animateSwipe(card, 'left');
      } else if (endY < -this.swipeThreshold) {
        this.animateSwipe(card, 'up');
      } else {
        // Snap back
        card.style.transform = 'translateX(0) translateY(0) rotate(0)';
        const leftOverlay = card.querySelector('.swipe-card-overlay-left');
        const rightOverlay = card.querySelector('.swipe-card-overlay-right');
        const upOverlay = card.querySelector('.swipe-card-overlay-up');
        if (leftOverlay) leftOverlay.style.opacity = 0;
        if (rightOverlay) rightOverlay.style.opacity = 0;
        if (upOverlay) upOverlay.style.opacity = 0;
      }
    }, { passive: true });

    // Mouse support for desktop
    card.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      card.style.transition = 'none';
      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const rotation = dx * 0.05;
      card.style.transform = `translateX(${dx}px) translateY(${Math.min(dy, 0)}px) rotate(${rotation}deg)`;

      const leftOverlay = card.querySelector('.swipe-card-overlay-left');
      const rightOverlay = card.querySelector('.swipe-card-overlay-right');
      const upOverlay = card.querySelector('.swipe-card-overlay-up');
      const threshold = this.swipeThreshold;

      if (leftOverlay) leftOverlay.style.opacity = dx < -threshold * 0.5 ? Math.min(1, (-dx - threshold * 0.5) / threshold) : 0;
      if (rightOverlay) rightOverlay.style.opacity = dx > threshold * 0.5 ? Math.min(1, (dx - threshold * 0.5) / threshold) : 0;
      if (upOverlay) upOverlay.style.opacity = dy < -threshold * 0.5 ? Math.min(1, (-dy - threshold * 0.5) / threshold) : 0;
    };

    const onMouseUp = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      card.style.transition = 'transform 0.3s ease';

      if (dx > this.swipeThreshold) {
        this.animateSwipe(card, 'right');
      } else if (dx < -this.swipeThreshold) {
        this.animateSwipe(card, 'left');
      } else if (dy < -this.swipeThreshold) {
        this.animateSwipe(card, 'up');
      } else {
        card.style.transform = 'translateX(0) translateY(0) rotate(0)';
        const leftOverlay = card.querySelector('.swipe-card-overlay-left');
        const rightOverlay = card.querySelector('.swipe-card-overlay-right');
        const upOverlay = card.querySelector('.swipe-card-overlay-up');
        if (leftOverlay) leftOverlay.style.opacity = 0;
        if (rightOverlay) rightOverlay.style.opacity = 0;
        if (upOverlay) upOverlay.style.opacity = 0;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, { once: true });
  }

  animateSwipe(card, direction) {
    const transforms = {
      left: 'translateX(-150%) rotate(-30deg)',
      right: 'translateX(150%) rotate(30deg)',
      up: 'translateY(-150%)'
    };

    card.style.transition = 'transform 0.4s ease';
    card.style.transform = transforms[direction];

    setTimeout(() => {
      this.handleSwipe(direction);
    }, 300);
  }

  handleSwipe(direction) {
    const c = this.cases[this.currentIndex];
    if (!c) return;

    switch (direction) {
      case 'right':
        this.stats.correct++;
        this.recordQuizAttempt(c.id, true);
        break;
      case 'left':
        this.stats.incorrect++;
        this.recordQuizAttempt(c.id, false);
        break;
      case 'up':
        this.stats.skipped++;
        break;
    }

    this.currentIndex++;
    this.renderCurrentCard();
  }

  async recordQuizAttempt(caseId, correct) {
    try {
      await fetch('/api/quiz/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId,
          correct,
          time_spent_ms: 0
        })
      });
    } catch (err) {
      console.error('Failed to record swipe quiz attempt:', err);
    }
  }

  startTimer() {
    this.sessionStartTime = Date.now();
    if (this.sessionTimer) clearInterval(this.sessionTimer);

    this.sessionTimer = setInterval(() => {
      const elapsed = Date.now() - this.sessionStartTime;
      const remaining = Math.max(0, this.sessionDuration - elapsed);
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);

      const timerEl = document.getElementById('swipeQuizTimer');
      if (timerEl) timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;

      if (remaining <= 0) {
        this.end();
      }
    }, 1000);
  }

  end() {
    this.isActive = false;
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }

    this.showResults();
  }

  showResults() {
    if (!this.container) return;

    const total = this.stats.correct + this.stats.incorrect + this.stats.skipped;
    const answered = this.stats.correct + this.stats.incorrect;
    const accuracy = answered > 0 ? Math.round((this.stats.correct / answered) * 100) : 0;

    this.container.innerHTML = `
      <div class="swipe-quiz-results">
        <h2 class="swipe-results-title">Session Complete!</h2>
        <div class="swipe-results-grid">
          <div class="swipe-result-card">
            <div class="swipe-result-number" style="color: #22c55e;">${this.stats.correct}</div>
            <div class="swipe-result-label">Correct</div>
          </div>
          <div class="swipe-result-card">
            <div class="swipe-result-number" style="color: #ef4444;">${this.stats.incorrect}</div>
            <div class="swipe-result-label">Incorrect</div>
          </div>
          <div class="swipe-result-card">
            <div class="swipe-result-number" style="color: #f59e0b;">${this.stats.skipped}</div>
            <div class="swipe-result-label">Skipped</div>
          </div>
          <div class="swipe-result-card">
            <div class="swipe-result-number" style="color: #6366f1;">${accuracy}%</div>
            <div class="swipe-result-label">Accuracy</div>
          </div>
        </div>
        <div class="swipe-results-actions">
          <button class="swipe-results-btn primary" onclick="swipeQuiz.start()">Play Again</button>
          <button class="swipe-results-btn secondary" onclick="swipeQuiz.close()">Close</button>
        </div>
      </div>
    `;
  }

  close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    document.body.style.overflow = '';
    this.isActive = false;
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  showNotification(msg) {
    if (typeof toast === 'function') {
      toast(msg, 'error');
    } else {
      alert(msg);
    }
  }

  injectStyles() {
    if (document.getElementById('swipe-quiz-styles')) return;

    const style = document.createElement('style');
    style.id = 'swipe-quiz-styles';
    style.textContent = `
      .swipe-quiz-overlay {
        position: fixed;
        inset: 0;
        background: #0a0a0f;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .swipe-quiz-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #12121a;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-shrink: 0;
      }

      .swipe-quiz-close {
        width: 40px;
        height: 40px;
        border: none;
        background: rgba(255,255,255,0.05);
        color: #a1a1aa;
        border-radius: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .swipe-quiz-timer {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f4f4f5;
        min-width: 50px;
      }

      .swipe-quiz-progress {
        flex: 1;
        height: 4px;
        background: rgba(255,255,255,0.08);
        border-radius: 2px;
        overflow: hidden;
      }

      .swipe-quiz-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #6366f1, #8b5cf6);
        border-radius: 2px;
        transition: width 0.3s;
      }

      .swipe-quiz-stats {
        font-size: 0.85rem;
        color: #71717a;
        min-width: 60px;
        text-align: right;
      }

      .swipe-quiz-hint {
        display: flex;
        justify-content: space-between;
        padding: 8px 24px;
        font-size: 0.75rem;
        color: #71717a;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      .hint-left { color: #ef4444; }
      .hint-right { color: #22c55e; }
      .hint-up { color: #f59e0b; }

      .swipe-quiz-card-area {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        overflow: hidden;
      }

      .swipe-card {
        width: 100%;
        max-width: 400px;
        background: #12121a;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        overflow: hidden;
        position: relative;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }
      .swipe-card:active { cursor: grabbing; }

      .swipe-card-image {
        position: relative;
        width: 100%;
        height: 280px;
        background: #1a1a25;
        overflow: hidden;
      }
      .swipe-card-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .swipe-card-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #71717a;
        font-size: 1.1rem;
      }

      .swipe-card-overlay-left,
      .swipe-card-overlay-right,
      .swipe-card-overlay-up {
        position: absolute;
        top: 16px;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 1.1rem;
        text-transform: uppercase;
        opacity: 0;
        transition: opacity 0.1s;
        pointer-events: none;
      }
      .swipe-card-overlay-left {
        left: 16px;
        background: rgba(239, 68, 68, 0.9);
        color: #fff;
        border: 2px solid #ef4444;
      }
      .swipe-card-overlay-right {
        right: 16px;
        background: rgba(34, 197, 94, 0.9);
        color: #fff;
        border: 2px solid #22c55e;
      }
      .swipe-card-overlay-up {
        left: 50%;
        transform: translateX(-50%);
        background: rgba(245, 158, 11, 0.9);
        color: #fff;
        border: 2px solid #f59e0b;
      }

      .swipe-card-body {
        padding: 20px;
      }

      .swipe-card-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .swipe-badge {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
      }
      .swipe-badge-modality {
        background: rgba(6, 182, 212, 0.15);
        color: #22d3ee;
      }
      .swipe-badge-bodypart {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
      }
      .swipe-badge-diff {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .swipe-card-title {
        font-size: 1.2rem;
        font-weight: 600;
        color: #f4f4f5;
        margin-bottom: 8px;
      }

      .swipe-card-history {
        font-size: 0.9rem;
        color: #a1a1aa;
        line-height: 1.5;
        margin-bottom: 16px;
        max-height: 80px;
        overflow-y: auto;
      }

      .swipe-card-diagnosis {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 12px;
      }

      .swipe-reveal-btn {
        width: 100%;
        padding: 12px;
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.3);
        color: #818cf8;
        border-radius: 10px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .swipe-reveal-btn:hover {
        background: rgba(99, 102, 241, 0.25);
      }

      .swipe-diagnosis-revealed {
        color: #22c55e;
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .swipe-diagnosis-revealed strong {
        color: #4ade80;
      }
      .swipe-findings {
        margin-top: 8px;
        color: #a1a1aa;
        font-size: 0.85rem;
      }

      .swipe-quiz-actions {
        display: flex;
        justify-content: center;
        gap: 24px;
        padding: 16px;
        flex-shrink: 0;
      }

      .swipe-action-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 2px solid;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .swipe-action-btn:active { transform: scale(0.9); }

      .swipe-action-incorrect {
        border-color: #ef4444;
        color: #ef4444;
      }
      .swipe-action-incorrect:hover {
        background: rgba(239, 68, 68, 0.15);
      }

      .swipe-action-skip {
        border-color: #f59e0b;
        color: #f59e0b;
        width: 48px;
        height: 48px;
      }
      .swipe-action-skip:hover {
        background: rgba(245, 158, 11, 0.15);
      }

      .swipe-action-correct {
        border-color: #22c55e;
        color: #22c55e;
      }
      .swipe-action-correct:hover {
        background: rgba(34, 197, 94, 0.15);
      }

      /* Results */
      .swipe-quiz-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 32px;
        text-align: center;
      }

      .swipe-results-title {
        font-size: 2rem;
        font-weight: 700;
        background: linear-gradient(135deg, #6366f1, #8b5cf6, #d946ef);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 32px;
      }

      .swipe-results-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        width: 100%;
        max-width: 320px;
        margin-bottom: 32px;
      }

      .swipe-result-card {
        background: #12121a;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        padding: 20px;
      }

      .swipe-result-number {
        font-size: 2rem;
        font-weight: 700;
      }

      .swipe-result-label {
        font-size: 0.85rem;
        color: #71717a;
        margin-top: 4px;
      }

      .swipe-results-actions {
        display: flex;
        gap: 12px;
      }

      .swipe-results-btn {
        padding: 14px 28px;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .swipe-results-btn.primary {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
      }
      .swipe-results-btn.secondary {
        background: #1a1a25;
        color: #a1a1aa;
        border: 1px solid rgba(255,255,255,0.08);
      }

      @media (max-height: 600px) {
        .swipe-card-image { height: 180px; }
        .swipe-card-history { max-height: 50px; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Global instance
window.swipeQuiz = new SwipeQuiz();
