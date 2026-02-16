// RadCase AI Case Builder - Admin interface for AI-assisted case generation
(function() {
  'use strict';

  window.caseBuilder = {
    currentDraft: null,
    drafts: [],
    isGenerating: false,
    expandedSections: new Set(['title_metadata', 'clinical_history', 'findings', 'diagnosis']),

    async init(container) {
      if (!container) return;
      try {
        const res = await fetch('/api/case-builder/status');
        if (!res.ok) throw new Error('Failed to check status');
        const status = await res.json();
        if (!status.configured) {
          this.renderNotConfigured(container);
          return;
        }
        this.renderBuilderPage(container);
      } catch (err) {
        this.renderNotConfigured(container);
      }
    },

    renderNotConfigured(container) {
      container.innerHTML = `
        <div class="cb-not-configured">
          <svg class="cb-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          <h3>AI Not Configured</h3>
          <p>The AI case builder requires an AI provider to be configured. Set the <code>AI_PROVIDER</code> and corresponding API key environment variables on the server to enable AI-powered case generation.</p>
        </div>
      `;
    },

    async renderBuilderPage(container) {
      container.innerHTML = `
        <div class="case-builder-page">
          <div class="cb-sidebar">
            <div class="cb-sidebar-header">
              <h3>Drafts</h3>
              <button class="cb-new-btn" onclick="caseBuilder.showGenerateForm()">+ New</button>
            </div>
            <div class="cb-draft-list" id="cbDraftList"></div>
          </div>
          <div class="cb-main" id="cbMain">
            <div class="cb-empty-state">
              <svg class="cb-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <h3>AI Case Builder</h3>
              <p>Paste a radiology report and let AI generate a complete teaching case with references, MCQ questions, and structured content.</p>
              <button class="cb-generate-btn" onclick="caseBuilder.showGenerateForm()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                Generate New Case
              </button>
            </div>
          </div>
        </div>
      `;
      await this.loadDrafts();
    },

    async loadDrafts() {
      try {
        const res = await fetch('/api/case-builder/drafts');
        if (!res.ok) throw new Error('Failed to load drafts');
        const data = await res.json();
        this.drafts = data.drafts || [];
        this.renderDraftList();
      } catch (err) {
        console.error('Failed to load drafts:', err);
        this.drafts = [];
        this.renderDraftList();
      }
    },

    renderDraftList() {
      const list = document.getElementById('cbDraftList');
      if (!list) return;

      if (this.drafts.length === 0) {
        list.innerHTML = `
          <div class="cb-draft-empty">
            No drafts yet
            <p>Generate a case to get started.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = this.drafts.map(draft => {
        const title = draft.title || draft.generated_content?.title || 'Untitled Draft';
        const status = draft.status || 'review';
        const date = draft.created_at ? new Date(draft.created_at).toLocaleDateString() : '';
        const isActive = this.currentDraft && this.currentDraft.id === draft.id;

        return `
          <div class="cb-draft-item ${isActive ? 'active' : ''}" onclick="caseBuilder.selectDraft('${draft.id}')">
            <span class="cb-draft-title">${this.escapeHtml(title)}</span>
            <div class="cb-draft-meta">
              <span class="cb-status-badge ${status}">${status}</span>
              <span>${date}</span>
            </div>
          </div>
        `;
      }).join('');
    },

    showGenerateForm() {
      this.currentDraft = null;
      this.renderDraftList();
      const main = document.getElementById('cbMain');
      if (!main) return;

      main.innerHTML = `
        <div class="cb-generate-form">
          <h3>Generate Teaching Case</h3>
          <div class="cb-form-group">
            <label class="cb-form-label">Radiology Report *</label>
            <span class="cb-form-sublabel">Paste the full radiology report text below.</span>
            <textarea class="cb-report-textarea" id="cbReportText" placeholder="FINDINGS:
The lungs are clear bilaterally. No focal consolidation, pleural effusion, or pneumothorax. The cardiomediastinal silhouette is within normal limits. No acute osseous abnormality.

IMPRESSION:
Normal chest radiograph."></textarea>
          </div>
          <div class="cb-metadata-row">
            <div class="cb-form-group">
              <label class="cb-form-label">Modality (optional)</label>
              <select class="cb-form-select" id="cbModality">
                <option value="">Auto-detect</option>
                <option value="X-Ray">X-Ray</option>
                <option value="CT">CT</option>
                <option value="MRI">MRI</option>
                <option value="Ultrasound">Ultrasound</option>
                <option value="Nuclear Medicine">Nuclear Medicine</option>
                <option value="Fluoroscopy">Fluoroscopy</option>
                <option value="Mammography">Mammography</option>
                <option value="Angiography">Angiography</option>
              </select>
            </div>
            <div class="cb-form-group">
              <label class="cb-form-label">Body Part (optional)</label>
              <select class="cb-form-select" id="cbBodyPart">
                <option value="">Auto-detect</option>
                <option value="Chest">Chest</option>
                <option value="Abdomen">Abdomen</option>
                <option value="Pelvis">Pelvis</option>
                <option value="Head">Head</option>
                <option value="Neck">Neck</option>
                <option value="Spine">Spine</option>
                <option value="Upper Extremity">Upper Extremity</option>
                <option value="Lower Extremity">Lower Extremity</option>
                <option value="Cardiac">Cardiac</option>
                <option value="Breast">Breast</option>
                <option value="MSK">MSK</option>
              </select>
            </div>
          </div>
          <button class="cb-generate-btn" id="cbGenerateBtn" onclick="caseBuilder.generateCase()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Generate Teaching Case
          </button>
        </div>
      `;
    },

    async generateCase() {
      const reportText = document.getElementById('cbReportText')?.value?.trim();
      if (!reportText) {
        if (window.toast) window.toast('Please paste a radiology report', 'error');
        return;
      }

      const modality = document.getElementById('cbModality')?.value || undefined;
      const bodyPart = document.getElementById('cbBodyPart')?.value || undefined;
      const dicomMetadata = {};
      if (modality) dicomMetadata.modality = modality;
      if (bodyPart) dicomMetadata.body_part = bodyPart;

      this.isGenerating = true;
      this.showProgress();

      try {
        const body = { reportText };
        if (Object.keys(dicomMetadata).length > 0) body.dicomMetadata = dicomMetadata;

        const res = await fetch('/api/case-builder/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Generation failed');
        }

        const draft = await res.json();
        this.isGenerating = false;
        this.currentDraft = draft;
        await this.loadDrafts();
        this.renderReviewInterface(draft);
      } catch (err) {
        this.isGenerating = false;
        if (window.toast) window.toast(err.message || 'Generation failed', 'error');
        this.showGenerateForm();
      }
    },

    showProgress() {
      const main = document.getElementById('cbMain');
      if (!main) return;

      const steps = [
        'Parsing radiology report...',
        'Generating case content...',
        'Finding references...',
        'Building MCQ questions...'
      ];

      main.innerHTML = `
        <div class="cb-progress">
          <h3>Generating Teaching Case</h3>
          <div class="cb-progress-steps">
            ${steps.map((label, i) => `
              <div class="cb-progress-step ${i === 0 ? 'active' : ''}" id="cbProgressStep${i}">
                <span class="cb-progress-step-icon"></span>
                <span class="cb-progress-step-label">${label}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // Animate through steps
      let current = 0;
      this._progressInterval = setInterval(() => {
        if (!this.isGenerating) {
          clearInterval(this._progressInterval);
          return;
        }
        const prev = document.getElementById(`cbProgressStep${current}`);
        if (prev) {
          prev.classList.remove('active');
          prev.classList.add('completed');
          prev.querySelector('.cb-progress-step-icon').textContent = '\u2713';
        }
        current++;
        if (current < steps.length) {
          const next = document.getElementById(`cbProgressStep${current}`);
          if (next) next.classList.add('active');
        }
      }, 2500);
    },

    async selectDraft(draftId) {
      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}`);
        if (!res.ok) throw new Error('Failed to load draft');
        const draft = await res.json();
        this.currentDraft = draft;
        this.renderDraftList();
        this.renderReviewInterface(draft);
      } catch (err) {
        if (window.toast) window.toast('Failed to load draft', 'error');
      }
    },

    renderReviewInterface(draft) {
      const main = document.getElementById('cbMain');
      if (!main) return;

      const content = draft.generated_content || draft.content || {};
      const refs = draft.references || [];
      const status = draft.status || 'review';

      // Build action buttons based on status
      let actionsHtml = '';
      if (status === 'review' || status === 'generated') {
        actionsHtml = `
          <button class="btn cb-action-approve" onclick="caseBuilder.approveDraft('${draft.id}')">Approve</button>
          <button class="btn cb-action-reject" onclick="caseBuilder.rejectDraft('${draft.id}')">Reject</button>
          <button class="btn cb-action-delete" onclick="caseBuilder.deleteDraft('${draft.id}')">Delete</button>
        `;
      } else if (status === 'approved') {
        actionsHtml = `
          <button class="btn cb-action-publish" onclick="caseBuilder.publishDraft('${draft.id}')">Publish to Library</button>
          <button class="btn cb-action-delete" onclick="caseBuilder.deleteDraft('${draft.id}')">Delete</button>
        `;
      } else if (status === 'published') {
        actionsHtml = `<span class="cb-status-badge published">Published</span>`;
      } else if (status === 'rejected') {
        actionsHtml = `
          <span class="cb-status-badge rejected">Rejected</span>
          <button class="btn cb-action-delete" onclick="caseBuilder.deleteDraft('${draft.id}')">Delete</button>
        `;
      }

      // Build sections
      const sections = [];

      // 1. Title & Metadata
      sections.push(this.buildSection('title_metadata', 'Title & Metadata', this.renderTitleMetadata(content), draft.id));

      // 2. Clinical History
      if (content.clinical_history) {
        sections.push(this.buildSection('clinical_history', 'Clinical History', `<div class="cb-section-text">${this.escapeHtml(content.clinical_history)}</div>`, draft.id));
      }

      // 3. Findings
      if (content.findings) {
        sections.push(this.buildSection('findings', 'Findings', `<div class="cb-section-text">${this.escapeHtml(content.findings)}</div>`, draft.id));
      }

      // 4. Diagnosis
      if (content.diagnosis) {
        sections.push(this.buildSection('diagnosis', 'Diagnosis', `<div class="cb-section-text">${this.escapeHtml(content.diagnosis)}</div>`, draft.id));
      }

      // 5. Teaching Points
      if (content.teaching_points) {
        sections.push(this.buildSection('teaching_points', 'Teaching Points', `<div class="cb-section-text">${this.escapeHtml(content.teaching_points)}</div>`, draft.id));
      }

      // 6. Differentials
      if (content.differentials && content.differentials.length > 0) {
        sections.push(this.buildSection('differentials', 'Differentials', this.renderDifferentials(content.differentials), draft.id, false));
      }

      // 7. Teaching Pearls
      if (content.teaching_pearls && content.teaching_pearls.length > 0) {
        sections.push(this.buildSection('teaching_pearls', 'Teaching Pearls', this.renderPearls(content.teaching_pearls), draft.id, false));
      }

      // 8. Student Version
      if (content.student_version) {
        sections.push(this.buildSection('student_version', 'Student Version', this.renderStudentVersion(content.student_version), draft.id, false));
      }

      // 9. Fellow Notes
      if (content.fellow_notes) {
        sections.push(this.buildSection('fellow_notes', 'Fellow Notes', `<div class="cb-section-text">${this.escapeHtml(content.fellow_notes)}</div>`, draft.id));
      }

      // 10. MCQ Questions
      if (content.mcq_questions && content.mcq_questions.length > 0) {
        sections.push(this.buildSection('mcq_questions', 'MCQ Questions', this.renderMCQs(content.mcq_questions), draft.id, false));
      }

      // 11. Key Findings Annotations
      if (content.key_findings_annotations && content.key_findings_annotations.length > 0) {
        sections.push(this.buildSection('key_findings_annotations', 'Key Findings Annotations', this.renderAnnotations(content.key_findings_annotations), draft.id, false));
      }

      main.innerHTML = `
        <div class="cb-review">
          <div class="cb-review-header">
            <h2 class="cb-review-title">${this.escapeHtml(content.title || 'Untitled Draft')}</h2>
            <span class="cb-status-badge ${status}">${status}</span>
            <div class="cb-actions">${actionsHtml}</div>
          </div>
          ${sections.join('')}
          ${refs.length > 0 ? this.renderReferences(refs) : ''}
          ${this.renderMetadata(draft)}
        </div>
      `;
    },

    buildSection(key, title, contentHtml, draftId, editable = true) {
      const isExpanded = this.expandedSections.has(key);
      const editBtn = editable ? `
        <button class="cb-section-btn" onclick="event.stopPropagation(); caseBuilder.startEdit('${draftId}', '${key}')" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      ` : '';
      const regenBtn = `
        <button class="cb-section-btn" onclick="event.stopPropagation(); caseBuilder.regenerateSection('${draftId}', '${key}')" title="Regenerate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          Regen
        </button>
      `;

      return `
        <div class="cb-section-card ${isExpanded ? 'expanded' : ''}" data-section="${key}">
          <div class="cb-section-header" onclick="caseBuilder.toggleSection('${key}')">
            <span class="cb-section-chevron">\u25B6</span>
            <span class="cb-section-title">${title}</span>
            <div class="cb-section-actions">
              ${editBtn}
              ${regenBtn}
            </div>
          </div>
          <div class="cb-section-content">
            <div class="cb-section-display" id="cbDisplay_${key}">
              ${contentHtml}
            </div>
            <div class="cb-section-edit" id="cbEdit_${key}">
              <textarea id="cbEditTextarea_${key}"></textarea>
              <div class="cb-section-edit-actions">
                <button class="cb-edit-cancel" onclick="caseBuilder.cancelEdit('${key}')">Cancel</button>
                <button class="cb-edit-save" onclick="caseBuilder.saveEdit('${draftId}', '${key}')">Save</button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    toggleSection(key) {
      if (this.expandedSections.has(key)) {
        this.expandedSections.delete(key);
      } else {
        this.expandedSections.add(key);
      }
      const card = document.querySelector(`.cb-section-card[data-section="${key}"]`);
      if (card) card.classList.toggle('expanded');
    },

    startEdit(draftId, key) {
      if (!this.currentDraft) return;
      const content = this.currentDraft.generated_content || this.currentDraft.content || {};
      let value = '';

      if (key === 'title_metadata') {
        value = content.title || '';
      } else if (key === 'differentials' || key === 'teaching_pearls' || key === 'mcq_questions' || key === 'key_findings_annotations' || key === 'student_version') {
        value = JSON.stringify(content[key], null, 2);
      } else {
        value = content[key] || '';
      }

      const textarea = document.getElementById(`cbEditTextarea_${key}`);
      if (textarea) textarea.value = value;

      const display = document.getElementById(`cbDisplay_${key}`);
      const edit = document.getElementById(`cbEdit_${key}`);
      if (display) display.style.display = 'none';
      if (edit) edit.classList.add('active');

      // Expand if collapsed
      if (!this.expandedSections.has(key)) {
        this.expandedSections.add(key);
        const card = document.querySelector(`.cb-section-card[data-section="${key}"]`);
        if (card) card.classList.add('expanded');
      }
    },

    cancelEdit(key) {
      const display = document.getElementById(`cbDisplay_${key}`);
      const edit = document.getElementById(`cbEdit_${key}`);
      if (display) display.style.display = '';
      if (edit) edit.classList.remove('active');
    },

    async saveEdit(draftId, key) {
      const textarea = document.getElementById(`cbEditTextarea_${key}`);
      if (!textarea) return;

      const content = this.currentDraft.generated_content || this.currentDraft.content || {};
      let newValue = textarea.value;

      if (key === 'title_metadata') {
        content.title = newValue;
      } else if (key === 'differentials' || key === 'teaching_pearls' || key === 'mcq_questions' || key === 'key_findings_annotations' || key === 'student_version') {
        try {
          content[key] = JSON.parse(newValue);
        } catch (e) {
          if (window.toast) window.toast('Invalid JSON format', 'error');
          return;
        }
      } else {
        content[key] = newValue;
      }

      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Failed to save');

        this.currentDraft.generated_content = content;
        this.currentDraft.content = content;
        this.cancelEdit(key);
        this.renderReviewInterface(this.currentDraft);
        if (window.toast) window.toast('Section updated', 'success');
      } catch (err) {
        if (window.toast) window.toast('Failed to save changes', 'error');
      }
    },

    async regenerateSection(draftId, section) {
      // Show regeneration dialog
      const overlay = document.createElement('div');
      overlay.className = 'cb-regen-overlay';
      overlay.innerHTML = `
        <div class="cb-regen-dialog">
          <h4>Regenerate: ${section.replace(/_/g, ' ')}</h4>
          <textarea id="cbRegenInstructions" placeholder="Optional: Add specific instructions for regeneration (e.g., 'Make it more concise', 'Add more detail about pathophysiology')"></textarea>
          <div class="cb-regen-actions">
            <button class="cb-edit-cancel" onclick="this.closest('.cb-regen-overlay').remove()">Cancel</button>
            <button class="cb-edit-save" id="cbRegenSubmit">Regenerate</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });

      document.getElementById('cbRegenSubmit').onclick = async () => {
        const instructions = document.getElementById('cbRegenInstructions')?.value || '';
        overlay.remove();

        try {
          const res = await fetch(`/api/case-builder/drafts/${draftId}/regenerate-section`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, instructions })
          });
          if (!res.ok) throw new Error('Regeneration failed');

          const data = await res.json();
          // Update local draft content
          const content = this.currentDraft.generated_content || this.currentDraft.content || {};
          content[section] = data.content;
          this.currentDraft.generated_content = content;
          this.currentDraft.content = content;
          this.renderReviewInterface(this.currentDraft);
          if (window.toast) window.toast('Section regenerated', 'success');
        } catch (err) {
          if (window.toast) window.toast('Regeneration failed', 'error');
        }
      };
    },

    async approveDraft(draftId) {
      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Approval failed');

        this.currentDraft.status = 'approved';
        await this.loadDrafts();
        this.renderReviewInterface(this.currentDraft);
        if (window.toast) window.toast('Draft approved', 'success');
      } catch (err) {
        if (window.toast) window.toast('Approval failed', 'error');
      }
    },

    async rejectDraft(draftId) {
      const reason = prompt('Reason for rejection (optional):');
      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || '' })
        });
        if (!res.ok) throw new Error('Rejection failed');

        this.currentDraft.status = 'rejected';
        await this.loadDrafts();
        this.renderReviewInterface(this.currentDraft);
        if (window.toast) window.toast('Draft rejected', 'success');
      } catch (err) {
        if (window.toast) window.toast('Rejection failed', 'error');
      }
    },

    async publishDraft(draftId) {
      if (!confirm('Publish this draft to the case library?')) return;
      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Publish failed');

        const data = await res.json();
        this.currentDraft.status = 'published';
        await this.loadDrafts();
        this.renderReviewInterface(this.currentDraft);
        if (window.toast) window.toast(`Case published: ${data.title || 'Success'}`, 'success');
      } catch (err) {
        if (window.toast) window.toast('Publish failed', 'error');
      }
    },

    async deleteDraft(draftId) {
      if (!confirm('Delete this draft? This cannot be undone.')) return;
      try {
        const res = await fetch(`/api/case-builder/drafts/${draftId}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed');

        this.currentDraft = null;
        await this.loadDrafts();
        const main = document.getElementById('cbMain');
        if (main) {
          main.innerHTML = `
            <div class="cb-empty-state">
              <svg class="cb-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <h3>Draft deleted</h3>
              <p>Select a draft from the sidebar or generate a new case.</p>
            </div>
          `;
        }
        if (window.toast) window.toast('Draft deleted', 'success');
      } catch (err) {
        if (window.toast) window.toast('Delete failed', 'error');
      }
    },

    // Render helpers for content sections

    renderTitleMetadata(content) {
      const difficulty = content.difficulty || '-';
      const category = content.category || '-';
      const diffDots = typeof difficulty === 'number'
        ? [1,2,3,4,5].map(i => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:2px;background:${i <= difficulty ? 'var(--accent)' : 'var(--border)'}"></span>`).join('')
        : difficulty;

      return `
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
          <div>
            <div class="cb-form-label" style="margin-bottom:4px;">Title</div>
            <div class="cb-section-text" style="font-weight:600;font-size:var(--text-base);">${this.escapeHtml(content.title || '-')}</div>
          </div>
          <div>
            <div class="cb-form-label" style="margin-bottom:4px;">Category</div>
            <span class="cb-status-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;">${this.escapeHtml(category)}</span>
          </div>
          <div>
            <div class="cb-form-label" style="margin-bottom:4px;">Difficulty</div>
            <div>${diffDots}</div>
          </div>
        </div>
      `;
    },

    renderDifferentials(differentials) {
      if (!differentials || differentials.length === 0) return '<div class="cb-section-text">No differentials</div>';
      return `
        <table class="cb-diff-table">
          <thead><tr><th>Diagnosis</th><th>Likelihood</th><th>Key Features</th></tr></thead>
          <tbody>
            ${differentials.map(d => `
              <tr>
                <td>${this.escapeHtml(d.diagnosis || '')}</td>
                <td><span class="cb-diff-likelihood ${d.likelihood || ''}">${this.escapeHtml(d.likelihood || '-')}</span></td>
                <td>${this.escapeHtml(d.key_features || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    },

    renderPearls(pearls) {
      if (!pearls || pearls.length === 0) return '<div class="cb-section-text">No teaching pearls</div>';
      return `
        <ul class="cb-pearls-list">
          ${pearls.map(p => `
            <li>
              <span class="cb-pearl-bullet">\u2736</span>
              <span>${this.escapeHtml(p)}</span>
            </li>
          `).join('')}
        </ul>
      `;
    },

    renderStudentVersion(sv) {
      if (!sv) return '<div class="cb-section-text">No student version</div>';
      let html = '';
      if (sv.clinical_history) {
        html += `<div class="cb-student-subsection"><h5>Clinical History</h5><div class="cb-section-text">${this.escapeHtml(sv.clinical_history)}</div></div>`;
      }
      if (sv.findings) {
        html += `<div class="cb-student-subsection"><h5>Findings</h5><div class="cb-section-text">${this.escapeHtml(sv.findings)}</div></div>`;
      }
      if (sv.teaching_points) {
        html += `<div class="cb-student-subsection"><h5>Teaching Points</h5><div class="cb-section-text">${this.escapeHtml(sv.teaching_points)}</div></div>`;
      }
      return html || '<div class="cb-section-text">No student version content</div>';
    },

    renderMCQs(questions) {
      if (!questions || questions.length === 0) return '<div class="cb-section-text">No MCQ questions</div>';
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      return questions.map((q, qi) => `
        <div class="cb-mcq-card">
          <div class="cb-mcq-difficulty">Question ${qi + 1} ${q.difficulty ? '| Difficulty: ' + q.difficulty : ''}</div>
          <div class="cb-mcq-question">${this.escapeHtml(q.question || '')}</div>
          <ul class="cb-mcq-options">
            ${(q.options || []).map((opt, oi) => `
              <li class="cb-mcq-option ${oi === q.correct_index ? 'correct' : ''}">
                <span class="cb-mcq-option-letter">${letters[oi] || oi + 1}.</span>
                <span>${this.escapeHtml(opt)}</span>
                ${oi === q.correct_index ? '<span style="margin-left:auto;font-size:0.75rem;color:var(--success);">\u2713 Correct</span>' : ''}
              </li>
            `).join('')}
          </ul>
          ${q.explanation ? `<div class="cb-mcq-explanation">${this.escapeHtml(q.explanation)}</div>` : ''}
        </div>
      `).join('');
    },

    renderAnnotations(annotations) {
      if (!annotations || annotations.length === 0) return '<div class="cb-section-text">No annotations</div>';
      return `
        <div class="cb-annotations-list">
          ${annotations.map(a => `
            <div class="cb-annotation-item">
              <span class="cb-annotation-type">${this.escapeHtml(a.finding_type || 'annotation')}</span>
              <div class="cb-annotation-info">
                <div class="cb-annotation-label">${this.escapeHtml(a.label || '')}</div>
                <div class="cb-annotation-desc">${this.escapeHtml(a.description || '')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    },

    renderReferences(refs) {
      if (!refs || refs.length === 0) return '';
      return `
        <div class="cb-references">
          <h3>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            References (${refs.length})
          </h3>
          <div class="cb-ref-list">
            ${refs.map(r => `
              <div class="cb-ref-item">
                <span class="cb-ref-badge ${r.quality_tier || 'silver'}">${r.quality_tier || 'standard'}</span>
                <div class="cb-ref-info">
                  <div class="cb-ref-source">
                    ${r.source_url ? `<a href="${this.escapeHtml(r.source_url)}" target="_blank" rel="noopener">${this.escapeHtml(r.source_name || 'Source')}</a>` : this.escapeHtml(r.source_name || 'Source')}
                  </div>
                  ${r.citation_text ? `<div class="cb-ref-citation">${this.escapeHtml(r.citation_text)}</div>` : ''}
                </div>
                ${typeof r.quality_score === 'number' ? `
                  <div class="cb-ref-score">
                    ${[1,2,3,4,5].map(i => `<span class="cb-ref-score-dot ${i <= r.quality_score ? 'filled' : ''}"></span>`).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    },

    renderMetadata(draft) {
      const items = [];
      if (draft.ai_provider) items.push({ label: 'Provider', value: draft.ai_provider });
      if (draft.ai_model) items.push({ label: 'Model', value: draft.ai_model });
      if (draft.generation_time) items.push({ label: 'Generation Time', value: `${(draft.generation_time / 1000).toFixed(1)}s` });
      if (draft.generationTime) items.push({ label: 'Generation Time', value: `${(draft.generationTime / 1000).toFixed(1)}s` });
      if (draft.created_at) items.push({ label: 'Created', value: new Date(draft.created_at).toLocaleString() });

      if (items.length === 0) return '';
      return `
        <div class="cb-metadata">
          ${items.map(i => `
            <div class="cb-metadata-item">
              <span class="cb-metadata-label">${i.label}:</span>
              <span class="cb-metadata-value">${this.escapeHtml(i.value)}</span>
            </div>
          `).join('')}
        </div>
      `;
    },

    escapeHtml(str) {
      if (!str) return '';
      const s = String(str);
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }
  };
})();
