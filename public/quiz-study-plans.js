// Quiz Study Plans - plan list, detail, creation UI

class QuizStudyPlans {
  constructor() {
    this.plans = [];
    this.templates = [];
  }

  async loadPlans() {
    try {
      const res = await fetch('/api/study-plans', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      this.plans = data.plans || [];
      return this.plans;
    } catch (e) {
      return [];
    }
  }

  async loadTemplates() {
    try {
      const res = await fetch('/api/study-plans/templates');
      const data = await res.json();
      this.templates = data.templates || [];
      return this.templates;
    } catch (e) {
      return [];
    }
  }

  renderPlansList(container) {
    if (this.plans.length === 0) {
      container.innerHTML = `
        <div class="quiz-plans-empty">
          <p>No active study plans.</p>
          <button class="btn btn-secondary btn-sm quiz-plan-create-btn">+ New Study Plan</button>
        </div>
      `;
      container.querySelector('.quiz-plan-create-btn')?.addEventListener('click', () => this.showCreateDialog(container));
      return;
    }

    let html = '<div class="quiz-plans-list">';
    for (const plan of this.plans) {
      html += `
        <div class="quiz-plan-item" data-plan-id="${plan.id}">
          <div class="quiz-plan-info">
            <span class="quiz-plan-name">${this._escapeHtml(plan.name)}</span>
            <span class="quiz-plan-milestone">Milestone ${plan.currentMilestone + 1}/${plan.totalMilestones}</span>
          </div>
          <div class="quiz-plan-progress-row">
            <div class="quiz-plan-progress-bar">
              <div class="quiz-plan-progress-fill" style="width: ${plan.progress}%"></div>
            </div>
            <span class="quiz-plan-progress-text">${plan.progress}%</span>
          </div>
          <button class="btn btn-primary btn-sm quiz-plan-continue-btn" data-plan-id="${plan.id}">Continue</button>
        </div>
      `;
    }
    html += '<button class="btn btn-secondary btn-sm quiz-plan-create-btn" style="margin-top:12px;">+ New Study Plan</button>';
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.quiz-plan-continue-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.quizEngine?.startStudyPlan(btn.dataset.planId);
      });
    });
    container.querySelector('.quiz-plan-create-btn')?.addEventListener('click', () => this.showCreateDialog(container));
  }

  async showCreateDialog(parentContainer) {
    if (this.templates.length === 0) await this.loadTemplates();

    const dialog = document.createElement('div');
    dialog.className = 'quiz-plan-dialog';
    dialog.innerHTML = `
      <div class="quiz-plan-dialog-content">
        <h3>Create Study Plan</h3>
        <div class="quiz-plan-template-list">
          ${this.templates.map(t => `
            <div class="quiz-plan-template" data-template-id="${t.id}">
              <div class="quiz-plan-template-name">${this._escapeHtml(t.name)}</div>
              <div class="quiz-plan-template-desc">${this._escapeHtml(t.description)}</div>
              <div class="quiz-plan-template-meta">${t.milestones.length} milestones &middot; ${t.category}</div>
            </div>
          `).join('')}
        </div>
        <div class="quiz-plan-dialog-actions">
          <button class="btn btn-secondary btn-sm quiz-plan-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    dialog.querySelector('.quiz-plan-cancel-btn').addEventListener('click', () => dialog.remove());
    dialog.querySelectorAll('.quiz-plan-template').forEach(el => {
      el.addEventListener('click', async () => {
        const templateId = el.dataset.templateId;
        try {
          const res = await fetch('/api/study-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ templateId }),
          });
          if (res.ok) {
            window.toast?.('Study plan created!', 'success');
            dialog.remove();
            await this.loadPlans();
            this.renderPlansList(parentContainer);
          } else {
            const data = await res.json();
            window.toast?.(data.error || 'Failed to create plan', 'error');
          }
        } catch (e) {
          window.toast?.('Failed to create plan', 'error');
        }
      });
    });

    document.body.appendChild(dialog);
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

window.quizStudyPlans = new QuizStudyPlans();
