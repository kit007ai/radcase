// RadCase Weakness Coach - Weakness analysis and practice recommendations UI
// Exposes window.weaknessCoach globally

(function () {
  'use strict';

  function esc(str) {
    if (!str) return '';
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getStrengthColor(score) {
    // score 0-100: 0-40 = red (critical), 40-70 = yellow (moderate), 70+ = green (strong)
    if (score >= 70) return 'var(--success, #22c55e)';
    if (score >= 40) return 'var(--warning, #f59e0b)';
    return 'var(--danger, #ef4444)';
  }

  function getStrengthLabel(score) {
    if (score >= 70) return 'Strong';
    if (score >= 40) return 'Moderate';
    return 'Needs Work';
  }

  window.weaknessCoach = {
    _overlay: null,
    _data: null,
    _recommendations: null,
    _loading: false,

    // ======================== Open / Close ========================

    async open() {
      if (!window.aiTutor?.isConfigured) {
        if (window.toast) window.toast('AI Tutor is not configured. Set up an AI provider to use the Weakness Coach.', 'error');
        return;
      }

      this._createOverlay();
      this._overlay.classList.add('weakness-coach-open');
      document.body.style.overflow = 'hidden';

      await this._loadData();
    },

    close() {
      if (this._overlay) {
        this._overlay.classList.remove('weakness-coach-open');
      }
      document.body.style.overflow = '';
    },

    // ======================== Overlay Creation ========================

    _createOverlay() {
      if (this._overlay) return;

      const overlay = document.createElement('div');
      overlay.className = 'weakness-coach';
      overlay.id = 'weaknessCoach';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Weakness Coach');

      overlay.innerHTML =
        '<div class="weakness-coach-backdrop"></div>' +
        '<div class="weakness-coach-modal">' +
          '<div class="weakness-coach-header">' +
            '<div class="weakness-coach-header-left">' +
              '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>' +
                '<line x1="9" y1="21" x2="15" y2="21"/>' +
              '</svg>' +
              '<h2>Weakness Coach</h2>' +
            '</div>' +
            '<button class="weakness-coach-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="weakness-coach-body" id="weaknessCoachBody">' +
            '<div class="weakness-coach-loading">' +
              '<div class="ai-typing-indicator"><span></span><span></span><span></span></div>' +
              '<p>Analyzing your performance...</p>' +
            '</div>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      this._overlay = overlay;

      // Close events
      overlay.querySelector('.weakness-coach-close').addEventListener('click', () => this.close());
      overlay.querySelector('.weakness-coach-backdrop').addEventListener('click', () => this.close());

      // Escape key
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    },

    // ======================== Data Loading ========================

    async _loadData() {
      const body = document.getElementById('weaknessCoachBody');
      if (!body) return;

      body.innerHTML =
        '<div class="weakness-coach-loading">' +
          '<div class="ai-typing-indicator"><span></span><span></span><span></span></div>' +
          '<p>Analyzing your performance...</p>' +
        '</div>';

      try {
        const [analysisResult, recsResult] = await Promise.all([
          window.aiTutor.getWeaknessAnalysis(),
          window.aiTutor.getPracticeRecommendations()
        ]);

        this._data = analysisResult;
        this._recommendations = recsResult;

        if (analysisResult.error && recsResult.error) {
          body.innerHTML =
            '<div class="weakness-coach-empty">' +
              '<p>Unable to analyze your performance. Make sure you have completed some quiz sessions first.</p>' +
              '<p class="weakness-coach-error-detail">' + esc(analysisResult.message || '') + '</p>' +
              '<button class="btn btn-primary" onclick="window.weaknessCoach._loadData()">Try Again</button>' +
            '</div>';
          return;
        }

        this._render(body, analysisResult, recsResult);
      } catch (err) {
        console.error('[WeaknessCoach] load error:', err);
        body.innerHTML =
          '<div class="weakness-coach-empty">' +
            '<p>Failed to load weakness analysis.</p>' +
            '<button class="btn btn-primary" onclick="window.weaknessCoach._loadData()">Try Again</button>' +
          '</div>';
      }
    },

    // ======================== Rendering ========================

    _render(container, analysis, recommendations) {
      let html = '';

      // Focus Areas Summary
      if (analysis.focusAreas && analysis.focusAreas.length > 0) {
        html += '<div class="weakness-section">' +
          '<h3 class="weakness-section-title">Focus Areas</h3>' +
          '<div class="weakness-focus-areas">';
        analysis.focusAreas.forEach((area) => {
          const color = getStrengthColor(area.score || 0);
          const label = getStrengthLabel(area.score || 0);
          html += '<div class="weakness-focus-card">' +
            '<div class="weakness-focus-label">' + esc(area.name || area.area || '') + '</div>' +
            '<div class="weakness-focus-detail">' + esc(area.detail || '') + '</div>' +
            '<div class="weakness-focus-badge" style="background:' + color + '20;color:' + color + ';">' + label + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // Weakness Bars
      if (analysis.weaknesses && analysis.weaknesses.length > 0) {
        html += '<div class="weakness-section">' +
          '<h3 class="weakness-section-title">Performance by Area</h3>';

        // Group by category if available
        const byBodyPart = [];
        const byModality = [];
        const byDiagnosis = [];

        analysis.weaknesses.forEach((w) => {
          const cat = (w.category || 'general').toLowerCase();
          if (cat === 'body_part' || cat === 'bodypart' || cat === 'body part') {
            byBodyPart.push(w);
          } else if (cat === 'modality') {
            byModality.push(w);
          } else if (cat === 'diagnosis') {
            byDiagnosis.push(w);
          } else {
            byBodyPart.push(w); // default
          }
        });

        if (byBodyPart.length > 0) {
          html += '<h4 class="weakness-subsection-title">By Body Part</h4>';
          html += this._renderBars(byBodyPart);
        }

        if (byModality.length > 0) {
          html += '<h4 class="weakness-subsection-title">By Modality</h4>';
          html += this._renderBars(byModality);
        }

        if (byDiagnosis.length > 0) {
          html += '<h4 class="weakness-subsection-title">Most-Missed Diagnoses</h4>';
          html += this._renderBars(byDiagnosis);
        }

        html += '</div>';
      }

      // AI Analysis Text
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        html += '<div class="weakness-section">' +
          '<h3 class="weakness-section-title">AI Analysis</h3>' +
          '<div class="weakness-ai-analysis">';
        analysis.recommendations.forEach((rec) => {
          html += '<div class="weakness-recommendation">' +
            '<p>' + esc(typeof rec === 'string' ? rec : rec.text || rec.recommendation || '') + '</p>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // Practice Recommendations
      if (!recommendations.error && recommendations.cases && recommendations.cases.length > 0) {
        html += '<div class="weakness-section">' +
          '<h3 class="weakness-section-title">Recommended Practice Cases</h3>';

        if (recommendations.reason) {
          html += '<p class="weakness-rec-reason">' + esc(recommendations.reason) + '</p>';
        }

        html += '<div class="practice-cards-grid">';
        recommendations.cases.forEach((c) => {
          const diffStars = this._difficultyStars(c.difficulty || 2);
          html += '<div class="practice-card" data-case-id="' + (c.id || '') + '">' +
            '<div class="practice-card-header">' +
              '<span class="practice-card-modality">' + esc(c.modality || '') + '</span>' +
              '<span class="practice-card-difficulty">' + diffStars + '</span>' +
            '</div>' +
            '<div class="practice-card-title">' + esc(c.title || c.diagnosis || 'Untitled') + '</div>' +
            '<div class="practice-card-body-part">' + esc(c.body_part || '') + '</div>' +
            (c.reason ? '<div class="practice-card-reason">' + esc(c.reason) + '</div>' : '') +
            '<button class="btn btn-primary btn-sm practice-card-btn" onclick="window.weaknessCoach._openCase(' + (c.id || 0) + ')">Study This Case</button>' +
          '</div>';
        });
        html += '</div>';

        html += '<div class="weakness-practice-action">' +
          '<button class="btn btn-primary" onclick="window.weaknessCoach._startPracticeSession()">Start Practice Session</button>' +
        '</div>';

        html += '</div>';
      }

      // Empty state
      if (!html) {
        html = '<div class="weakness-coach-empty">' +
          '<p>Not enough data to analyze your weaknesses yet. Complete more quiz sessions to get personalized insights.</p>' +
        '</div>';
      }

      container.innerHTML = html;
    },

    _renderBars(items) {
      let html = '<div class="weakness-bars">';
      items.forEach((item) => {
        const score = item.score !== undefined ? item.score : (item.accuracy !== undefined ? item.accuracy : 50);
        const color = getStrengthColor(score);
        const pct = Math.max(0, Math.min(100, score));
        html += '<div class="weakness-bar-row">' +
          '<div class="weakness-bar-label">' + esc(item.name || item.area || '') + '</div>' +
          '<div class="weakness-bar-track">' +
            '<div class="weakness-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div>' +
          '</div>' +
          '<div class="weakness-bar-value" style="color:' + color + ';">' + Math.round(pct) + '%</div>' +
        '</div>';
      });
      html += '</div>';
      return html;
    },

    _difficultyStars(level) {
      const filled = Math.min(5, Math.max(1, parseInt(level) || 2));
      let stars = '';
      for (let i = 0; i < filled; i++) stars += '<span class="difficulty-star filled">&#9733;</span>';
      for (let i = filled; i < 5; i++) stars += '<span class="difficulty-star">&#9733;</span>';
      return stars;
    },

    // ======================== Actions ========================

    _openCase(caseId) {
      if (!caseId) return;
      this.close();
      // Trigger case open - the app uses window.openCase or similar
      if (typeof window.openCase === 'function') {
        window.openCase(caseId);
      } else {
        // Fallback: dispatch event
        document.dispatchEvent(new CustomEvent('open-case', { detail: { caseId } }));
      }
    },

    _startPracticeSession() {
      if (!this._recommendations || !this._recommendations.cases || this._recommendations.cases.length === 0) {
        if (window.toast) window.toast('No practice cases available', 'error');
        return;
      }

      this.close();

      // Start a quiz-like session with the recommended cases
      const caseIds = this._recommendations.cases.map(c => c.id).filter(Boolean);
      if (caseIds.length > 0 && typeof window.quizEngine !== 'undefined' && window.quizEngine.startCustomSession) {
        window.quizEngine.startCustomSession(caseIds);
      } else if (caseIds.length > 0) {
        // Fallback: open the first case in study mode
        this._openCase(caseIds[0]);
      }
    },

    // ======================== Public trigger helpers ========================

    // Can be called from analytics page or sidebar button
    trigger() {
      this.open();
    }
  };
})();
