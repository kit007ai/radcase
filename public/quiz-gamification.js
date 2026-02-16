// Quiz Gamification - Client-side XP bar, level-up animations, badge popups, streak display

class QuizGamification {
  constructor() {
    this.profile = null;
  }

  clearProfile() {
    this.profile = null;
  }

  async loadProfile() {
    try {
      const res = await fetch('/api/gamification/profile', { credentials: 'include' });
      if (!res.ok) return null;
      this.profile = await res.json();
      return this.profile;
    } catch (e) {
      return null;
    }
  }

  renderHubHeader(container) {
    if (!this.profile) {
      container.innerHTML = `
        <div class="quiz-hub-header">
          <div class="quiz-hub-title">
            <h2>Quiz Hub</h2>
            <p>Sign in to track your progress</p>
          </div>
        </div>
      `;
      return;
    }

    const p = this.profile;
    const progressPct = p.xpNeeded > 0 ? Math.round((p.xpProgress / p.xpNeeded) * 100) : 100;

    container.innerHTML = `
      <div class="quiz-hub-header">
        <div class="quiz-hub-title">
          <h2>Quiz Hub</h2>
          <span class="quiz-hub-level">Level ${p.level} &middot; ${p.levelTitle}</span>
        </div>
        <div class="quiz-hub-xp-row">
          <span class="quiz-hub-xp-text">${p.totalXp.toLocaleString()} XP</span>
          <div class="quiz-hub-xp-bar">
            <div class="quiz-hub-xp-fill" style="width: ${progressPct}%"></div>
          </div>
          <span class="quiz-hub-xp-next">${p.nextLevelXp.toLocaleString()} XP</span>
        </div>
        <div class="quiz-hub-streak">
          <span class="quiz-hub-streak-fire">${p.currentStreak > 0 ? '&#x1F525;' : ''}</span>
          <span>${p.currentStreak}-day streak</span>
          ${p.longestStreak > p.currentStreak ? `<span class="quiz-hub-streak-best">(best: ${p.longestStreak})</span>` : ''}
        </div>
      </div>
    `;
  }

  renderBadgeShelf(container) {
    if (!this.profile || !this.profile.badges || this.profile.badges.length === 0) {
      container.innerHTML = '<p class="quiz-hub-empty">No badges earned yet. Start quizzing!</p>';
      return;
    }
    container.innerHTML = `
      <div class="quiz-badge-shelf">
        ${this.profile.badges.slice(0, 8).map(b => `
          <div class="quiz-badge ${b.rarity}" title="${b.name}: ${b.description}">
            <span class="quiz-badge-icon">${b.icon}</span>
            <span class="quiz-badge-name">${b.name}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  showLevelUp() {
    if (!this.profile) return;
    const toast = document.createElement('div');
    toast.className = 'quiz-level-up-toast';
    toast.innerHTML = `
      <div class="quiz-level-up-burst"></div>
      <div class="quiz-level-up-content">
        <span class="quiz-level-up-icon">&#x2B50;</span>
        <span class="quiz-level-up-text">Level Up! Level ${this.profile.level + 1}</span>
      </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
    // Don't mutate cache - reload fresh profile
    this.loadProfile();
  }

  showBadgeEarned(badge) {
    const toast = document.createElement('div');
    toast.className = 'quiz-badge-toast';
    toast.innerHTML = `
      <div class="quiz-badge-toast-content">
        <span class="quiz-badge-toast-icon">${badge.icon}</span>
        <div>
          <strong>Badge Earned!</strong>
          <span>${badge.name}</span>
        </div>
      </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  async renderLeaderboard(container) {
    try {
      const res = await fetch('/api/gamification/leaderboard?period=weekly');
      const data = await res.json();

      if (!data.leaderboard || data.leaderboard.length === 0) {
        container.innerHTML = '<p class="quiz-hub-empty">No leaderboard data yet</p>';
        return;
      }

      container.innerHTML = `
        <div class="quiz-leaderboard">
          <div class="quiz-leaderboard-header">
            <span>Rank</span><span>Name</span><span>XP This Week</span>
          </div>
          ${data.leaderboard.slice(0, 10).map(e => `
            <div class="quiz-leaderboard-row">
              <span class="quiz-leaderboard-rank">${e.rank <= 3 ? ['&#x1F947;','&#x1F948;','&#x1F949;'][e.rank-1] : '#' + e.rank}</span>
              <span class="quiz-leaderboard-name">${escapeHtml(e.displayName)}</span>
              <span class="quiz-leaderboard-xp">${e.periodXp.toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      container.innerHTML = '<p class="quiz-hub-empty">Failed to load leaderboard</p>';
    }
  }
}

window.quizGamification = new QuizGamification();
if (window.quizEngine) {
  window.quizEngine.setGamification(window.quizGamification);
}
