// RadCase Study AI Overlay - Chat widget for study mode
// Exposes window.studyAIOverlay globally

(function () {
  'use strict';

  const STEP_PROMPTS = {
    0: 'You are viewing the clinical history. I can help you think through a systematic approach.',
    1: 'Now reviewing the images. What findings do you notice? I can guide your search pattern.',
    2: 'Time to build your differential. Need a hint or want to discuss your reasoning?',
    3: 'The diagnosis has been revealed. Want me to explain why this diagnosis fits the findings?',
    4: 'Review the teaching points. I can answer follow-up questions to deepen your understanding.'
  };

  const STEP_QUICK_ACTIONS = {
    0: [
      { label: 'Systematic approach', message: 'What systematic approach should I use for this case?' },
      { label: 'Key history clues', message: 'What key clinical history clues should I focus on?' }
    ],
    1: [
      { label: 'Search pattern', message: 'What search pattern should I use for these images?' },
      { label: 'Get a hint', action: 'hint' }
    ],
    2: [
      { label: 'Check my differential', message: 'Can you evaluate my differential diagnosis list so far?' },
      { label: 'Get a hint', action: 'hint' },
      { label: 'Narrow it down', message: 'Help me narrow down my differential. What features should I focus on?' }
    ],
    3: [
      { label: 'Explain the diagnosis', message: 'Can you explain why this is the correct diagnosis based on the findings?' },
      { label: 'What did I miss?', message: 'What findings might I have missed that point to this diagnosis?' }
    ],
    4: [
      { label: 'Test my understanding', message: 'Ask me a follow-up question to test my understanding of this case.' },
      { label: 'Similar cases', message: 'What similar cases or differential diagnoses should I study next?' }
    ]
  };

  function esc(str) {
    if (!str) return '';
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatAIText(text) {
    if (!text) return '';
    // Simple markdown-ish formatting: bold, italic, line breaks, lists
    let html = esc(text);
    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Numbered lists
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>');
    // Bullet lists
    html = html.replace(/^[-]\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
    // Paragraphs from double newlines
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newlines to <br>
    html = html.replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  window.studyAIOverlay = {
    _panel: null,
    _messageList: null,
    _input: null,
    _toggleBtn: null,
    _isOpen: false,
    _currentCaseId: null,
    _currentStep: 0,
    _loading: false,

    // ======================== Initialization ========================

    init() {
      this._createToggleButton();
      this._createPanel();
      this._bindEvents();
    },

    _createToggleButton() {
      if (this._toggleBtn) return;

      const btn = document.createElement('button');
      btn.className = 'ai-tutor-toggle';
      btn.id = 'aiTutorToggle';
      btn.setAttribute('aria-label', 'Toggle AI Tutor');
      btn.title = 'AI Tutor';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>' +
        '<line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="23" x2="14" y2="23"/>' +
        '</svg>';
      btn.addEventListener('click', () => this.toggle());

      this._toggleBtn = btn;
      // Insert into case modal header
      const modalHeader = document.querySelector('#caseModal .modal-header');
      if (modalHeader) {
        const closeBtn = modalHeader.querySelector('.modal-close');
        if (closeBtn) {
          modalHeader.insertBefore(btn, closeBtn);
        } else {
          modalHeader.appendChild(btn);
        }
      }
    },

    _createPanel() {
      if (this._panel) return;

      const panel = document.createElement('div');
      panel.className = 'ai-chat-panel';
      panel.id = 'aiChatPanel';
      panel.setAttribute('role', 'complementary');
      panel.setAttribute('aria-label', 'AI Tutor Chat');

      panel.innerHTML =
        '<div class="ai-chat-header">' +
          '<div class="ai-chat-header-left">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
              '<path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>' +
            '</svg>' +
            '<span class="ai-chat-title">AI Tutor</span>' +
          '</div>' +
          '<button class="ai-chat-close" aria-label="Close AI Tutor">&times;</button>' +
        '</div>' +
        '<div class="ai-chat-step-context" id="aiStepContext"></div>' +
        '<div class="ai-chat-messages" id="aiChatMessages"></div>' +
        '<div class="ai-chat-quick-actions" id="aiQuickActions"></div>' +
        '<div class="ai-chat-input-area">' +
          '<textarea class="ai-chat-input" id="aiChatInput" placeholder="Ask the AI tutor..." rows="1"></textarea>' +
          '<button class="ai-chat-send" id="aiChatSend" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      // Place panel inside the case modal
      const caseModal = document.querySelector('#caseModal .modal.modal-case');
      if (caseModal) {
        caseModal.appendChild(panel);
      } else {
        document.body.appendChild(panel);
      }

      this._panel = panel;
      this._messageList = panel.querySelector('#aiChatMessages');
      this._input = panel.querySelector('#aiChatInput');

      // Event listeners
      panel.querySelector('.ai-chat-close').addEventListener('click', () => this.close());
      panel.querySelector('#aiChatSend').addEventListener('click', () => this._sendMessage());
      this._input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendMessage();
        }
      });

      // Auto-resize textarea
      this._input.addEventListener('input', () => {
        this._input.style.height = 'auto';
        this._input.style.height = Math.min(this._input.scrollHeight, 120) + 'px';
      });
    },

    _bindEvents() {
      // Listen for study step changes from case-viewer
      document.addEventListener('study:step-changed', (e) => {
        if (e.detail && e.detail.step !== undefined) {
          this._onStepChanged(e.detail.step, e.detail.caseId);
        }
      });

      // Listen for case opened in study mode
      document.addEventListener('caseviewer:study-loaded', (e) => {
        if (e.detail) {
          this._onCaseLoaded(e.detail.caseId, e.detail.caseData);
        }
      });

      // Listen for case modal close
      document.addEventListener('modal:closed', () => {
        this.close();
        this._reset();
      });
    },

    // ======================== Open / Close / Toggle ========================

    toggle() {
      if (this._isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

    open() {
      if (!window.aiTutor?.isConfigured) {
        if (window.toast) window.toast('AI Tutor is not configured. Set up an AI provider in settings.', 'error');
        return;
      }

      this._ensureCreated();
      this._isOpen = true;
      this._panel.classList.add('ai-chat-panel-open');
      if (this._toggleBtn) this._toggleBtn.classList.add('active');

      // Add class to modal for layout adjustment
      const caseModal = document.querySelector('#caseModal .modal.modal-case');
      if (caseModal) caseModal.classList.add('ai-panel-active');

      // Show step context
      this._updateStepContext(this._currentStep);
      this._updateQuickActions(this._currentStep);

      // Focus input
      setTimeout(() => {
        if (this._input) this._input.focus();
      }, 300);
    },

    close() {
      this._isOpen = false;
      if (this._panel) this._panel.classList.remove('ai-chat-panel-open');
      if (this._toggleBtn) this._toggleBtn.classList.remove('active');

      const caseModal = document.querySelector('#caseModal .modal.modal-case');
      if (caseModal) caseModal.classList.remove('ai-panel-active');
    },

    _ensureCreated() {
      if (!this._panel) this._createPanel();
      if (!this._toggleBtn) this._createToggleButton();
    },

    _reset() {
      this._currentCaseId = null;
      this._currentStep = 0;
      this._loading = false;
      if (this._messageList) this._messageList.innerHTML = '';
      if (window.aiTutor) {
        window.aiTutor.clearHistory();
      }
    },

    // ======================== Event Handlers ========================

    _onCaseLoaded(caseId, caseData) {
      this._currentCaseId = caseId;
      this._currentStep = 0;
      if (this._messageList) this._messageList.innerHTML = '';

      if (window.aiTutor) {
        window.aiTutor.setCase(caseData);
        window.aiTutor.setStudyStep(0);
      }

      // Show toggle button visibility
      this._showToggle(true);
    },

    _onStepChanged(step, caseId) {
      this._currentStep = step;
      if (window.aiTutor) {
        window.aiTutor.setStudyStep(step);
      }
      if (this._isOpen) {
        this._updateStepContext(step);
        this._updateQuickActions(step);
        this._addStepTransitionMessage(step);
      }
    },

    _showToggle(visible) {
      if (this._toggleBtn) {
        this._toggleBtn.style.display = visible ? '' : 'none';
      }
    },

    // ======================== Step Context ========================

    _updateStepContext(step) {
      const ctx = document.getElementById('aiStepContext');
      if (!ctx) return;

      const prompt = STEP_PROMPTS[step] || '';
      ctx.innerHTML = '<div class="ai-step-badge">Step ' + (step + 1) + '</div>' +
        '<span>' + esc(prompt) + '</span>';
    },

    _updateQuickActions(step) {
      const container = document.getElementById('aiQuickActions');
      if (!container) return;

      const actions = STEP_QUICK_ACTIONS[step] || [];
      container.innerHTML = '';

      actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.className = 'ai-quick-action-btn';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          if (action.action === 'hint') {
            this._requestHint();
          } else if (action.message) {
            this._input.value = action.message;
            this._sendMessage();
          }
        });
        container.appendChild(btn);
      });
    },

    _addStepTransitionMessage(step) {
      const prompt = STEP_PROMPTS[step];
      if (prompt) {
        this._appendMessage('assistant', prompt, 'step-transition');
      }
    },

    // ======================== Messaging ========================

    async _sendMessage() {
      const text = this._input.value.trim();
      if (!text || this._loading) return;

      this._input.value = '';
      this._input.style.height = 'auto';

      this._appendMessage('user', text);
      this._showLoading(true);

      const result = await window.aiTutor.chat(text);

      this._showLoading(false);

      if (result.error) {
        this._appendMessage('error', result.message);
      } else {
        this._appendMessage('assistant', result.message);
      }
    },

    async _requestHint() {
      if (this._loading) return;
      if (!window.aiTutor?.currentCase) return;

      const currentLevel = window.aiTutor.getHintLevel();
      if (currentLevel >= 4) {
        this._appendMessage('assistant', 'You have used all 4 hint levels for this case. Try reviewing the images more carefully or ask a specific question.');
        return;
      }

      this._appendMessage('user', 'Give me a hint (Level ' + (currentLevel + 1) + '/4)');
      this._showLoading(true);

      const result = await window.aiTutor.getHint(window.aiTutor.currentCase);

      this._showLoading(false);

      if (result.error) {
        this._appendMessage('error', result.hint);
      } else {
        this._appendMessage('assistant', result.hint, 'hint hint-level-' + result.hintLevel);
        this._updateQuickActions(this._currentStep);
      }
    },

    _appendMessage(role, text, extraClass) {
      if (!this._messageList) return;

      const msg = document.createElement('div');
      let className = 'ai-message ai-message-' + role;
      if (extraClass) className += ' ' + extraClass;
      msg.className = className;

      if (role === 'assistant' || role === 'error') {
        msg.innerHTML = formatAIText(text);
      } else {
        msg.textContent = text;
      }

      this._messageList.appendChild(msg);
      this._messageList.scrollTop = this._messageList.scrollHeight;
    },

    _showLoading(show) {
      this._loading = show;
      const existing = this._messageList?.querySelector('.ai-loading');
      if (show && !existing) {
        const loader = document.createElement('div');
        loader.className = 'ai-message ai-message-assistant ai-loading';
        loader.innerHTML = '<div class="ai-typing-indicator">' +
          '<span></span><span></span><span></span>' +
          '</div>';
        if (this._messageList) {
          this._messageList.appendChild(loader);
          this._messageList.scrollTop = this._messageList.scrollHeight;
        }
      } else if (!show && existing) {
        existing.remove();
      }

      // Disable/enable send button
      const sendBtn = document.getElementById('aiChatSend');
      if (sendBtn) sendBtn.disabled = show;
    },

    // ======================== Public API ========================

    // Called by case-viewer hooks to send automatic guidance
    async sendGuidance(caseId, step, userInput) {
      if (!this._isOpen || !window.aiTutor?.isConfigured) return;

      this._showLoading(true);
      const result = await window.aiTutor.getGuidance(caseId, step, userInput);
      this._showLoading(false);

      if (!result.error) {
        this._appendMessage('assistant', result.guidance, 'guidance');
        if (result.questions && result.questions.length > 0) {
          const questionsHtml = result.questions.map(q => esc(q)).join('<br>');
          this._appendMessage('assistant', questionsHtml, 'guidance-questions');
        }
      }
    },

    // Allow external code to push a message
    addSystemMessage(text) {
      this._appendMessage('assistant', text, 'system-message');
    },

    isOpen() {
      return this._isOpen;
    },

    setStep(step) {
      this._onStepChanged(step, this._currentCaseId);
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.studyAIOverlay.init());
  } else {
    window.studyAIOverlay.init();
  }
})();
