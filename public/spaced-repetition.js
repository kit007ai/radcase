// RadCase Spaced Repetition System
// SM-2 algorithm implementation for optimal learning

class SpacedRepetition {
  constructor() {
    this.storageKey = 'radcase_sr_data';
    this.data = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : { cards: {}, stats: { totalReviews: 0, streak: 0, lastReview: null } };
    } catch {
      return { cards: {}, stats: { totalReviews: 0, streak: 0, lastReview: null } };
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }

  // Get or create card data for a case
  getCard(caseId) {
    if (!this.data.cards[caseId]) {
      this.data.cards[caseId] = {
        easeFactor: 2.5,  // Initial ease factor
        interval: 0,      // Days until next review
        repetitions: 0,   // Number of successful reviews
        nextReview: Date.now(),
        lastReview: null,
        history: []
      };
    }
    return this.data.cards[caseId];
  }

  // SM-2 Algorithm implementation
  // quality: 0-2 = incorrect (again), 3 = hard, 4 = good, 5 = easy
  review(caseId, quality) {
    const card = this.getCard(caseId);
    const now = Date.now();

    // Record history
    card.history.push({
      date: now,
      quality,
      interval: card.interval
    });

    if (quality < 3) {
      // Failed - reset
      card.repetitions = 0;
      card.interval = 0;
    } else {
      // Passed
      if (card.repetitions === 0) {
        card.interval = 1;
      } else if (card.repetitions === 1) {
        card.interval = 6;
      } else {
        card.interval = Math.round(card.interval * card.easeFactor);
      }
      card.repetitions++;
    }

    // Update ease factor
    card.easeFactor = Math.max(1.3, card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    // Calculate next review date
    card.nextReview = now + (card.interval * 24 * 60 * 60 * 1000);
    card.lastReview = now;

    // Update global stats
    this.data.stats.totalReviews++;
    this.updateStreak();

    this.save();
    return card;
  }

  updateStreak() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastReview = this.data.stats.lastReview;

    if (!lastReview) {
      this.data.stats.streak = 1;
    } else {
      const lastDate = new Date(lastReview);
      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
      const dayDiff = (today - lastDay) / (24 * 60 * 60 * 1000);

      if (dayDiff === 0) {
        // Same day, streak unchanged
      } else if (dayDiff === 1) {
        // Consecutive day
        this.data.stats.streak++;
      } else {
        // Streak broken
        this.data.stats.streak = 1;
      }
    }

    this.data.stats.lastReview = Date.now();
  }

  // Get cases due for review
  getDueCards() {
    const now = Date.now();
    const due = [];

    for (const [caseId, card] of Object.entries(this.data.cards)) {
      if (card.nextReview <= now) {
        due.push({
          caseId,
          ...card,
          overdueDays: Math.floor((now - card.nextReview) / (24 * 60 * 60 * 1000))
        });
      }
    }

    // Sort by most overdue first
    due.sort((a, b) => a.nextReview - b.nextReview);
    return due;
  }

  // Get upcoming reviews
  getUpcoming(days = 7) {
    const now = Date.now();
    const endDate = now + (days * 24 * 60 * 60 * 1000);
    const upcoming = [];

    for (const [caseId, card] of Object.entries(this.data.cards)) {
      if (card.nextReview > now && card.nextReview <= endDate) {
        upcoming.push({
          caseId,
          ...card,
          daysUntil: Math.ceil((card.nextReview - now) / (24 * 60 * 60 * 1000))
        });
      }
    }

    upcoming.sort((a, b) => a.nextReview - b.nextReview);
    return upcoming;
  }

  // Get case strength (0-100)
  getStrength(caseId) {
    const card = this.data.cards[caseId];
    if (!card) return 0;

    // Factors: ease factor, interval, recent history
    const easeFactor = Math.min(100, (card.easeFactor - 1.3) / (2.5 - 1.3) * 40);
    const intervalFactor = Math.min(100, Math.log10(card.interval + 1) * 30);
    
    // Recent history (last 5 reviews)
    const recentHistory = card.history.slice(-5);
    const avgQuality = recentHistory.length > 0
      ? recentHistory.reduce((sum, h) => sum + h.quality, 0) / recentHistory.length
      : 2.5;
    const historyFactor = (avgQuality / 5) * 30;

    return Math.round(easeFactor + intervalFactor + historyFactor);
  }

  // Get statistics
  getStats() {
    const cards = Object.values(this.data.cards);
    const now = Date.now();

    const dueNow = cards.filter(c => c.nextReview <= now).length;
    const mastered = cards.filter(c => c.interval >= 21).length;
    const learning = cards.filter(c => c.interval > 0 && c.interval < 21).length;
    const newCards = cards.filter(c => c.repetitions === 0).length;

    // Calculate average retention
    const totalWithHistory = cards.filter(c => c.history.length > 0);
    const avgRetention = totalWithHistory.length > 0
      ? totalWithHistory.reduce((sum, c) => {
          const passed = c.history.filter(h => h.quality >= 3).length;
          return sum + (passed / c.history.length);
        }, 0) / totalWithHistory.length
      : 0;

    return {
      totalCards: cards.length,
      dueNow,
      mastered,
      learning,
      newCards,
      totalReviews: this.data.stats.totalReviews,
      streak: this.data.stats.streak,
      avgRetention: Math.round(avgRetention * 100)
    };
  }

  // Get review forecast for the next N days
  getForecast(days = 14) {
    const forecast = [];
    const now = Date.now();

    for (let i = 0; i < days; i++) {
      const dayStart = now + (i * 24 * 60 * 60 * 1000);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      
      const dueCount = Object.values(this.data.cards).filter(c => 
        c.nextReview >= dayStart && c.nextReview < dayEnd
      ).length;

      forecast.push({
        date: new Date(dayStart).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        count: dueCount
      });
    }

    return forecast;
  }

  // Reset all data
  reset() {
    if (confirm('Reset all spaced repetition data? This cannot be undone.')) {
      this.data = { cards: {}, stats: { totalReviews: 0, streak: 0, lastReview: null } };
      this.save();
    }
  }
}

// Initialize
const spacedRep = new SpacedRepetition();
window.spacedRep = spacedRep;

// Quality ratings for UI
window.SR_QUALITY = {
  AGAIN: 0,      // Complete blackout
  HARD: 3,       // Correct but difficult
  GOOD: 4,       // Correct with some effort
  EASY: 5        // Effortless recall
};
