// RadCase Case Viewer - Study Mode / Reference Mode with Progressive Reveal
// Exposes window.caseViewer for use by other script-tag modules

(function () {
  'use strict';

  const STEPS = ['HISTORY', 'IMAGES', 'DIFFERENTIAL', 'REVEAL', 'TEACHING'];
  const STEP_LABELS = ['History', 'Images', 'Differential', 'Reveal', 'Teaching'];

  const LOCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  function getState() {
    return window._radcaseState || window.state || {};
  }

  window.caseViewer = {
    currentStep: 0,
    caseId: null,
    caseData: null,
    startTime: null,
    stepTimes: [],
    mode: 'reference',
    _container: null,

    // Initialize viewer for a case
    async init(caseId, mode) {
      this.caseId = caseId;
      this.mode = mode || 'reference';
      this.currentStep = 0;
      this.startTime = Date.now();
      this.stepTimes = [Date.now()];

      try {
        if (mode === 'study') {
          const res = await fetch(`/api/cases/${caseId}/study-view`, { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to load study view');
          this.caseData = await res.json();
          this.renderStudyMode();
        } else {
          const traineeLevel = localStorage.getItem('radcase-trainee-level') || 'resident';
          const res = await fetch(`/api/cases/${caseId}/reference-view?trainee_level=${encodeURIComponent(traineeLevel)}`, { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to load reference view');
          this.caseData = await res.json();
          this.renderReferenceMode();
        }
      } catch (err) {
        console.error('[CaseViewer] init error:', err);
        if (window.toast) window.toast('Failed to load case viewer', 'error');
      }
    },

    // Ensure we have a container to render into
    _ensureContainer() {
      if (this._container && document.body.contains(this._container)) return this._container;
      this._container = document.getElementById('caseViewerRoot');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'caseViewerRoot';
        // Try inserting into the case modal content area, fallback to body
        const modalContent = document.querySelector('#caseModal .modal-content') ||
                             document.querySelector('#caseModal .modal-body') ||
                             document.body;
        modalContent.appendChild(this._container);
      }
      return this._container;
    },

    // ======================== Study Mode ========================

    renderStudyMode() {
      const container = this._ensureContainer();
      const d = this.caseData;
      container.innerHTML = '';

      // Step indicator
      container.appendChild(this.renderStepIndicator());

      // Clinical history (always visible in study mode)
      const historySection = this._section('Clinical History', d.clinical_history || 'No clinical history provided.');
      container.appendChild(historySection);

      // Images container (blurred at step 0)
      const imgContainer = document.createElement('div');
      imgContainer.className = 'cv-images-container' + (this.currentStep < 1 ? ' study-blurred' : '');
      imgContainer.id = 'cvImagesContainer';
      if (d.images && d.images.length > 0) {
        d.images.forEach(img => {
          const el = document.createElement('img');
          el.src = '/uploads/' + img.filename;
          el.alt = 'Case image';
          el.className = 'cv-case-image';
          el.onerror = function () { this.style.display = 'none'; };
          imgContainer.appendChild(el);
        });
      } else {
        imgContainer.innerHTML = '<p class="cv-muted">No images available.</p>';
      }
      container.appendChild(imgContainer);

      // Locked sections
      container.appendChild(this._lockedSection('cvDifferentialSection', 'Differential Diagnosis', this.currentStep >= 2));
      container.appendChild(this._lockedSection('cvDiagnosisSection', 'Diagnosis & Findings', this.currentStep >= 3));
      container.appendChild(this._lockedSection('cvTeachingSection', 'Teaching Points', this.currentStep >= 4));

      // Advance button
      const btnWrap = document.createElement('div');
      btnWrap.className = 'cv-action-bar';
      btnWrap.id = 'cvActionBar';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary cv-advance-btn';
      btn.id = 'cvAdvanceBtn';
      btn.textContent = this._advanceLabel();
      btn.addEventListener('click', () => this.advanceStep());
      btnWrap.appendChild(btn);
      container.appendChild(btnWrap);

      // Keyboard support
      this._keyHandler = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.advanceStep();
        }
      };
      document.addEventListener('keydown', this._keyHandler);

      // AI Tutor: notify overlay that study mode loaded
      this._notifyAIStudyLoaded();
      // AI Tutor: offer initial guidance for step 0 (History)
      this._triggerAIStepHook(0);
    },

    // ======================== Reference Mode ========================

    renderReferenceMode() {
      const container = this._ensureContainer();
      const d = this.caseData;
      container.innerHTML = '';

      container.appendChild(this._section('Clinical History', d.clinical_history));

      // Images (no blur)
      const imgContainer = document.createElement('div');
      imgContainer.className = 'cv-images-container';
      if (d.images && d.images.length > 0) {
        d.images.forEach(img => {
          const el = document.createElement('img');
          el.src = '/uploads/' + img.filename;
          el.alt = 'Case image';
          el.className = 'cv-case-image';
          el.onerror = function () { this.style.display = 'none'; };
          imgContainer.appendChild(el);
        });
      }
      container.appendChild(imgContainer);

      container.appendChild(this._section('Diagnosis', d.diagnosis));
      container.appendChild(this._section('Findings', d.findings));
      container.appendChild(this._section('Teaching Points', d.teaching_points));

      // Key findings overlay
      if (d.key_findings && d.key_findings.length > 0) {
        const kfSection = document.createElement('div');
        kfSection.className = 'cv-section cv-key-findings';
        kfSection.innerHTML = '<h3 class="cv-section-title">Key Findings</h3>';
        d.key_findings.forEach(kf => {
          const item = document.createElement('div');
          item.className = 'cv-key-finding-item';
          item.innerHTML = '<strong>' + this._esc(kf.label) + '</strong>' +
            (kf.description ? '<p>' + this._esc(kf.description) + '</p>' : '');
          kfSection.appendChild(item);
        });
        container.appendChild(kfSection);
      }

      // Dispatch event so related-cases / discussion components can render
      document.dispatchEvent(new CustomEvent('caseviewer:reference-loaded', {
        detail: { caseId: this.caseId, caseData: d }
      }));
    },

    // ======================== Step Advancement ========================

    async advanceStep() {
      if (this.currentStep >= STEPS.length - 1) return;

      const prevStep = this.currentStep;
      this.currentStep++;
      this.stepTimes.push(Date.now());

      try {
        switch (this.currentStep) {
          case 1: // IMAGES - remove blur
            this._revealImages();
            break;

          case 2: // DIFFERENTIAL - show input widget
            this._showDifferentialInput();
            document.dispatchEvent(new CustomEvent('study:show-differential', {
              detail: { caseId: this.caseId }
            }));
            break;

          case 3: // REVEAL - submit differential, show diagnosis + findings
            document.dispatchEvent(new CustomEvent('study:submit-differential', {
              detail: { caseId: this.caseId }
            }));
            await this._revealDiagnosis();
            break;

          case 4: // TEACHING - show teaching points + related cases
            await this._revealTeaching();
            break;
        }
      } catch (err) {
        console.error('[CaseViewer] advanceStep error:', err);
        this.currentStep = prevStep;
        this.stepTimes.pop();
        if (window.toast) window.toast('Failed to advance step', 'error');
        return;
      }

      this._updateStepIndicator();
      this._updateAdvanceButton();

      // AI Tutor: notify step change and trigger step-specific hook
      this._notifyAIStepChanged(this.currentStep);
      this._triggerAIStepHook(this.currentStep);
    },

    _revealImages() {
      const imgContainer = document.getElementById('cvImagesContainer');
      if (imgContainer) imgContainer.classList.remove('study-blurred');
    },

    _showDifferentialInput() {
      const section = document.getElementById('cvDifferentialSection');
      if (!section) return;
      section.innerHTML = '';
      const title = document.createElement('h3');
      title.className = 'cv-section-title';
      title.textContent = 'Build Your Differential';
      section.appendChild(title);

      const inputWrap = document.createElement('div');
      inputWrap.className = 'cv-differential-input';
      inputWrap.innerHTML =
        '<textarea id="cvDifferentialTextarea" class="form-textarea" rows="3" ' +
        'placeholder="Enter your differential diagnoses, one per line..."></textarea>';
      section.appendChild(inputWrap);
      section.classList.remove('cv-locked');
    },

    async _revealDiagnosis() {
      // Fetch diagnosis + findings from reveal endpoint
      const [diagRes, findRes, kfRes] = await Promise.all([
        fetch(`/api/cases/${this.caseId}/reveal`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'diagnosis' })
        }),
        fetch(`/api/cases/${this.caseId}/reveal`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'findings' })
        }),
        fetch(`/api/cases/${this.caseId}/reveal`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'key_findings' })
        })
      ]);

      const diagData = await diagRes.json();
      const findData = await findRes.json();
      const kfData = await kfRes.json();

      const section = document.getElementById('cvDiagnosisSection');
      if (!section) return;
      section.innerHTML = '';
      section.classList.remove('cv-locked');

      // Diagnosis with typewriter effect
      const diagTitle = document.createElement('h3');
      diagTitle.className = 'cv-section-title';
      diagTitle.textContent = 'Diagnosis';
      section.appendChild(diagTitle);

      const diagText = document.createElement('p');
      diagText.className = 'cv-diagnosis-text';
      section.appendChild(diagText);
      await this.renderTypewriter(diagText, diagData.diagnosis || 'No diagnosis available.');

      // Findings
      if (findData.findings) {
        section.appendChild(this._contentBlock('Findings', findData.findings));
      }

      // Key findings
      if (kfData.key_findings && kfData.key_findings.length > 0) {
        const kfBlock = document.createElement('div');
        kfBlock.className = 'cv-key-findings';
        kfBlock.innerHTML = '<h4>Key Findings</h4>';
        kfData.key_findings.forEach(kf => {
          const item = document.createElement('div');
          item.className = 'cv-key-finding-item';
          item.innerHTML = '<strong>' + this._esc(kf.label) + '</strong>' +
            (kf.description ? ' - ' + this._esc(kf.description) : '');
          kfBlock.appendChild(item);
        });
        section.appendChild(kfBlock);
      }

      document.dispatchEvent(new CustomEvent('study:show-findings', {
        detail: { caseId: this.caseId, diagnosis: diagData.diagnosis, findings: findData.findings, keyFindings: kfData.key_findings }
      }));
    },

    async _revealTeaching() {
      const res = await fetch(`/api/cases/${this.caseId}/reveal`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'teaching_points' })
      });
      const data = await res.json();

      const section = document.getElementById('cvTeachingSection');
      if (!section) return;
      section.innerHTML = '';
      section.classList.remove('cv-locked');

      if (data.teaching_points) {
        section.appendChild(this._contentBlock('Teaching Points', data.teaching_points));
      } else {
        section.innerHTML = '<p class="cv-muted">No teaching points available.</p>';
      }

      document.dispatchEvent(new CustomEvent('study:show-teaching', {
        detail: { caseId: this.caseId, teachingPoints: data.teaching_points, timeSummary: this.getTimeSummary() }
      }));
    },

    // ======================== Step Indicator ========================

    renderStepIndicator() {
      const wrap = document.createElement('div');
      wrap.className = 'cv-step-indicator';
      wrap.id = 'cvStepIndicator';

      STEP_LABELS.forEach((label, i) => {
        const dot = document.createElement('div');
        dot.className = 'cv-step' + (i === this.currentStep ? ' cv-step-active' : '') + (i < this.currentStep ? ' cv-step-done' : '');
        dot.innerHTML = '<span class="cv-step-dot"></span><span class="cv-step-label">' + label + '</span>';
        wrap.appendChild(dot);
      });

      return wrap;
    },

    _updateStepIndicator() {
      const wrap = document.getElementById('cvStepIndicator');
      if (!wrap) return;
      const steps = wrap.querySelectorAll('.cv-step');
      steps.forEach((el, i) => {
        el.classList.toggle('cv-step-active', i === this.currentStep);
        el.classList.toggle('cv-step-done', i < this.currentStep);
      });
    },

    // ======================== Typewriter Animation ========================

    renderTypewriter(element, text) {
      return new Promise(resolve => {
        element.textContent = '';
        let i = 0;
        const interval = setInterval(() => {
          if (i < text.length) {
            element.textContent += text[i];
            i++;
          } else {
            clearInterval(interval);
            resolve();
          }
        }, 18);
      });
    },

    // ======================== Mode Toggle ========================

    toggleMode() {
      this.destroy();
      const newMode = this.mode === 'study' ? 'reference' : 'study';
      this.init(this.caseId, newMode);
    },

    // ======================== Time Summary ========================

    getTimeSummary() {
      const now = Date.now();
      const totalTime = now - (this.startTime || now);
      const stepDurations = [];
      for (let i = 1; i < this.stepTimes.length; i++) {
        stepDurations.push(this.stepTimes[i] - this.stepTimes[i - 1]);
      }
      return { totalTime, stepTimes: stepDurations };
    },

    // ======================== Cleanup ========================

    destroy() {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
      const container = this._container;
      if (container) container.innerHTML = '';
    },

    // ======================== Helpers ========================

    _advanceLabel() {
      switch (this.currentStep) {
        case 0: return 'View Images \u2192';
        case 1: return 'Build Your Differential \u2192';
        case 2: return 'Reveal Diagnosis \u2192';
        case 3: return 'Show Teaching Points \u2192';
        default: return 'Complete';
      }
    },

    _updateAdvanceButton() {
      const btn = document.getElementById('cvAdvanceBtn');
      if (!btn) return;
      if (this.currentStep >= STEPS.length - 1) {
        btn.textContent = 'Study Complete';
        btn.disabled = true;
        btn.classList.add('cv-complete');
      } else {
        btn.textContent = this._advanceLabel();
      }
    },

    _section(title, content) {
      const section = document.createElement('div');
      section.className = 'cv-section';
      const h3 = document.createElement('h3');
      h3.className = 'cv-section-title';
      h3.textContent = title;
      section.appendChild(h3);
      const p = document.createElement('p');
      p.textContent = content || '-';
      section.appendChild(p);
      return section;
    },

    _contentBlock(title, text) {
      const block = document.createElement('div');
      block.className = 'cv-content-block';
      const h4 = document.createElement('h4');
      h4.textContent = title;
      block.appendChild(h4);
      const p = document.createElement('p');
      p.textContent = text;
      block.appendChild(p);
      return block;
    },

    _lockedSection(id, title, unlocked) {
      const section = document.createElement('div');
      section.className = 'cv-section' + (unlocked ? '' : ' cv-locked');
      section.id = id;
      if (unlocked) {
        const h3 = document.createElement('h3');
        h3.className = 'cv-section-title';
        h3.textContent = title;
        section.appendChild(h3);
      } else {
        section.innerHTML =
          '<div class="cv-lock-message">' + LOCK_SVG +
          '<span>' + this._esc(title) + ' &mdash; Complete previous steps to reveal.</span></div>';
      }
      return section;
    },

    _esc(str) {
      if (!str) return '';
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    },

    // ======================== AI Tutor Integration ========================

    _isAIAvailable() {
      return !!(window.aiTutor && window.aiTutor.isConfigured);
    },

    _notifyAIStudyLoaded() {
      if (!this._isAIAvailable()) return;

      // Set case data on AI tutor
      window.aiTutor.setCase(this.caseData);
      window.aiTutor.setStudyStep(0);

      // Show the AI toggle button
      const caseModal = document.querySelector('#caseModal .modal.modal-case');
      if (caseModal) caseModal.classList.add('ai-available');

      // Dispatch event for study-ai-overlay
      document.dispatchEvent(new CustomEvent('caseviewer:study-loaded', {
        detail: { caseId: this.caseId, caseData: this.caseData }
      }));
    },

    _notifyAIStepChanged(step) {
      document.dispatchEvent(new CustomEvent('study:step-changed', {
        detail: { step: step, caseId: this.caseId }
      }));
    },

    _triggerAIStepHook(step) {
      // Non-blocking AI guidance at each step. Does nothing if AI not configured.
      if (!this._isAIAvailable()) return;

      // Insert a guidance card into the current step section (optional, non-blocking)
      switch (step) {
        case 0: // HISTORY - offer systematic approach guidance
          this._insertAIGuidanceCard(
            'cvActionBar',
            'Review the clinical history carefully.',
            'What systematic approach should I take?',
            step
          );
          break;

        case 1: // IMAGES - Socratic: "What do you notice?"
          this._insertAIGuidanceCard(
            'cvActionBar',
            'Study the images before building your differential.',
            'What search pattern should I use?',
            step
          );
          break;

        case 2: { // DIFFERENTIAL submitted - AI evaluates
          const textarea = document.getElementById('cvDifferentialTextarea');
          if (textarea) {
            // Only fire evaluation if user typed something
            const checkDifferential = () => {
              const text = textarea.value.trim();
              if (text && window.studyAIOverlay && window.studyAIOverlay.isOpen()) {
                window.studyAIOverlay.sendGuidance(this.caseId, 'differential', text);
              }
            };
            // Listen for when user advances from differential step
            textarea.addEventListener('blur', checkDifferential, { once: true });
          }
          this._insertAIGuidanceCard(
            'cvDifferentialSection',
            'Build your differential. The AI can help if you get stuck.',
            'Give me a hint',
            step,
            true // append after section content
          );
          break;
        }

        case 3: // REVEAL - explain diagnosis
          this._insertAIGuidanceCard(
            'cvDiagnosisSection',
            'Compare your differential to the actual diagnosis.',
            'Why does this diagnosis fit?',
            step,
            true
          );
          break;

        case 4: // TEACHING - follow-up questions
          this._insertAIGuidanceCard(
            'cvTeachingSection',
            'Deepen your understanding with follow-up questions.',
            'Test my understanding',
            step,
            true
          );
          break;
      }
    },

    _insertAIGuidanceCard(anchorId, contextText, actionLabel, step, appendAfter) {
      // Remove any existing guidance card
      const existing = document.querySelector('.ai-step-guidance');
      if (existing) existing.remove();

      const card = document.createElement('div');
      card.className = 'ai-step-guidance';
      card.innerHTML =
        '<div class="ai-step-guidance-header">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>' +
          '</svg>' +
          '<span>AI Tutor</span>' +
        '</div>' +
        '<div class="ai-step-guidance-text">' + this._esc(contextText) + '</div>' +
        '<div class="ai-step-guidance-actions">' +
          '<button class="ai-step-guidance-btn ai-guidance-ask">' + this._esc(actionLabel) + '</button>' +
          '<button class="ai-step-guidance-btn ai-guidance-open">Open AI Chat</button>' +
        '</div>';

      // Wire buttons
      const askBtn = card.querySelector('.ai-guidance-ask');
      const openBtn = card.querySelector('.ai-guidance-open');

      askBtn.addEventListener('click', () => {
        if (window.studyAIOverlay) {
          window.studyAIOverlay.open();
          // If it's a hint action, request hint
          if (actionLabel.toLowerCase().includes('hint')) {
            window.studyAIOverlay._requestHint();
          } else {
            // Send the action label as a message
            if (window.studyAIOverlay._input) {
              window.studyAIOverlay._input.value = actionLabel;
              window.studyAIOverlay._sendMessage();
            }
          }
        }
        card.remove();
      });

      openBtn.addEventListener('click', () => {
        if (window.studyAIOverlay) {
          window.studyAIOverlay.open();
        }
        card.remove();
      });

      // Insert into DOM
      const anchor = document.getElementById(anchorId);
      if (anchor) {
        if (appendAfter) {
          anchor.appendChild(card);
        } else {
          anchor.parentNode.insertBefore(card, anchor);
        }
      }
    }
  };
})();
