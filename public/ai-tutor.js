// RadCase AI Tutor Module
// AI-powered learning assistant for radiology education
// Exposes window.aiTutor globally

(function () {
  'use strict';

  class AITutor {
    constructor() {
      this.apiEndpoint = '/api/ai';
      this.conversationHistory = [];
      this.conversationId = null;
      this.currentCase = null;
      this.isConfigured = false;
      this.provider = null;
      this.traineeLevel = localStorage.getItem('radcase-trainee-level') || 'resident';
      this.currentStudyStep = null;
      this.hintLevel = 0;
      this.onResponse = null; // callback for streaming-like updates

      this.checkConfiguration();
    }

    // ======================== Configuration ========================

    async checkConfiguration() {
      try {
        const res = await fetch(`${this.apiEndpoint}/status`, { credentials: 'include' });
        if (!res.ok) {
          this.isConfigured = false;
          return { configured: false };
        }
        const data = await res.json();
        this.isConfigured = data.configured || false;
        this.provider = data.provider || null;
        return data;
      } catch {
        this.isConfigured = false;
        return { configured: false };
      }
    }

    // ======================== Setters ========================

    setTraineeLevel(level) {
      const valid = ['student', 'resident', 'fellow', 'attending'];
      if (valid.includes(level)) {
        this.traineeLevel = level;
        localStorage.setItem('radcase-trainee-level', level);
      }
    }

    setStudyStep(step) {
      this.currentStudyStep = step;
    }

    // Set the current case context for the AI
    setCase(caseData) {
      this.currentCase = caseData;
      this.conversationHistory = [];
      this.conversationId = null;
      this.hintLevel = 0;
    }

    // ======================== Chat ========================

    async chat(message) {
      if (!this.isConfigured) {
        return {
          error: true,
          message: 'AI is not configured. Please set up an AI provider in settings.'
        };
      }

      // Track locally for UI display
      this.conversationHistory.push({ role: 'user', content: message });

      if (this.onResponse) {
        this.onResponse({ type: 'loading', message: '' });
      }

      try {
        const body = {
          message,
          traineeLevel: this.traineeLevel
        };

        if (this.conversationId) {
          body.conversationId = this.conversationId;
        }

        if (this.currentCase) {
          body.caseId = this.currentCase.id;
        }

        if (this.currentStudyStep !== null) {
          body.step = this.currentStudyStep;
        }

        const res = await fetch(`${this.apiEndpoint}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || 'AI request failed';
          return { error: true, message: errMsg };
        }

        const data = await res.json();

        if (data.error) {
          return { error: true, message: data.error };
        }

        // Persist conversation ID
        if (data.conversationId) {
          this.conversationId = data.conversationId;
        }

        this.conversationHistory.push({ role: 'assistant', content: data.response });

        if (this.onResponse) {
          this.onResponse({ type: 'message', message: data.response, role: 'assistant' });
        }

        return { error: false, message: data.response, conversationId: this.conversationId };
      } catch (err) {
        console.error('[AITutor] chat error:', err);
        return { error: true, message: 'Failed to connect to AI service' };
      }
    }

    // ======================== Progressive Hints ========================

    async getHint(caseData, hintLevel) {
      if (!this.isConfigured) {
        return { error: true, hint: 'AI is not configured.' };
      }

      const level = hintLevel || (this.hintLevel + 1);
      this.hintLevel = Math.min(level, 4);

      try {
        const res = await fetch(`${this.apiEndpoint}/hint/${caseData.id || caseData.case_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            hintLevel: this.hintLevel,
            step: this.currentStudyStep,
            traineeLevel: this.traineeLevel
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { error: true, hint: errData.error || 'Unable to generate hint' };
        }

        const data = await res.json();
        if (data.error) {
          return { error: true, hint: data.error };
        }

        return {
          error: false,
          hint: data.hint,
          hintLevel: data.hintLevel || this.hintLevel
        };
      } catch (err) {
        console.error('[AITutor] getHint error:', err);
        return { error: true, hint: 'AI service unavailable' };
      }
    }

    // ======================== Step-Specific Guidance ========================

    async getGuidance(caseId, step, userInput) {
      if (!this.isConfigured) {
        return { error: true, guidance: 'AI is not configured.' };
      }

      try {
        const res = await fetch(`${this.apiEndpoint}/guidance/${caseId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            step,
            userInput: userInput || '',
            traineeLevel: this.traineeLevel
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { error: true, guidance: errData.error || 'Unable to get guidance' };
        }

        const data = await res.json();
        if (data.error) {
          return { error: true, guidance: data.error };
        }

        return {
          error: false,
          guidance: data.guidance,
          questions: data.questions || []
        };
      } catch (err) {
        console.error('[AITutor] getGuidance error:', err);
        return { error: true, guidance: 'AI service unavailable' };
      }
    }

    // ======================== Report Evaluation ========================

    async evaluateReport(caseId, traineeReport) {
      if (!this.isConfigured) {
        return { error: true, feedback: 'AI is not configured.' };
      }

      try {
        const res = await fetch(`${this.apiEndpoint}/evaluate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            caseId,
            traineeReport,
            traineeLevel: this.traineeLevel
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { error: true, feedback: errData.error || 'Unable to evaluate report' };
        }

        const data = await res.json();
        if (data.error) {
          return { error: true, feedback: data.error };
        }

        return {
          error: false,
          feedback: data.feedback,
          missedFindings: data.missedFindings || [],
          overcalls: data.overcalls || [],
          score: data.score,
          suggestions: data.suggestions || []
        };
      } catch (err) {
        console.error('[AITutor] evaluateReport error:', err);
        return { error: true, feedback: 'AI service unavailable' };
      }
    }

    // ======================== Weakness Analysis ========================

    async getWeaknessAnalysis() {
      if (!this.isConfigured) {
        return { error: true, message: 'AI is not configured.' };
      }

      try {
        const res = await fetch(`${this.apiEndpoint}/weakness-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            traineeLevel: this.traineeLevel
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { error: true, message: errData.error || 'Unable to get weakness analysis' };
        }

        const data = await res.json();
        if (data.error) {
          return { error: true, message: data.error };
        }

        return {
          error: false,
          weaknesses: data.weaknesses || [],
          recommendations: data.recommendations || [],
          focusAreas: data.focusAreas || []
        };
      } catch (err) {
        console.error('[AITutor] getWeaknessAnalysis error:', err);
        return { error: true, message: 'AI service unavailable' };
      }
    }

    // ======================== Practice Recommendations ========================

    async getPracticeRecommendations() {
      if (!this.isConfigured) {
        return { error: true, message: 'AI is not configured.' };
      }

      try {
        const res = await fetch(`${this.apiEndpoint}/practice-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            traineeLevel: this.traineeLevel
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { error: true, message: errData.error || 'Unable to get recommendations' };
        }

        const data = await res.json();
        if (data.error) {
          return { error: true, message: data.error };
        }

        return {
          error: false,
          cases: data.cases || [],
          reason: data.reason || ''
        };
      } catch (err) {
        console.error('[AITutor] getPracticeRecommendations error:', err);
        return { error: true, message: 'AI service unavailable' };
      }
    }

    // ======================== Conversation Management ========================

    clearHistory() {
      this.conversationHistory = [];
      this.conversationId = null;
      this.hintLevel = 0;
    }

    getHistory() {
      return [...this.conversationHistory];
    }

    getHintLevel() {
      return this.hintLevel;
    }

    resetHintLevel() {
      this.hintLevel = 0;
    }
  }

  // Initialize global instance
  const aiTutor = new AITutor();
  window.aiTutor = aiTutor;
})();
