// Differential Diagnosis Tag-Input Widget
// Tag-based input with autocomplete, ranked ordering, and scoring display

window.differentialInput = {
  container: null,
  differentials: [],
  maxEntries: 5,
  autocompleteData: [],
  onSubmit: null,
  _options: {},
  _boundCloseAC: null,

  init(containerEl, options = {}) {
    this.container = containerEl;
    this.differentials = [];
    this._options = options;
    this.maxEntries = options.maxEntries || 5;
    this.onSubmit = options.onSubmit || null;
    this._boundCloseAC = (e) => this._handleOutsideClick(e);
    document.addEventListener('click', this._boundCloseAC, true);
    this.loadAutocomplete();
    this.render();
  },

  async loadAutocomplete() {
    try {
      const res = await fetch('/api/cases?limit=500');
      const data = await res.json();
      this.autocompleteData = [...new Set(data.cases.map(c => c.diagnosis).filter(Boolean))].sort();
    } catch (e) { this.autocompleteData = []; }
  },

  render() {
    const hint = this._options.hint ? `<p class="differential-hint">${this._options.hint}</p>` : '';
    this.container.innerHTML = `
      <div class="differential-widget">
        <div class="differential-tags" id="diffTags"></div>
        <div class="differential-input-wrap">
          <input type="text" class="differential-text-input" id="diffInput"
                 placeholder="Type a diagnosis..." autocomplete="off">
          <div class="differential-autocomplete" id="diffAutocomplete"></div>
        </div>
        <div class="differential-actions">
          <span class="differential-count">0/${this.maxEntries}</span>
          <button class="btn btn-primary btn-sm differential-submit-btn" id="diffSubmitBtn">Submit &amp; Reveal Answer</button>
        </div>
        ${hint}
      </div>`;
    this.setupListeners();
  },

  setupListeners() {
    const input = document.getElementById('diffInput');
    const submitBtn = document.getElementById('diffSubmitBtn');
    if (!input || !submitBtn) return;

    input.addEventListener('input', () => this.showAutocomplete(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.getElementById('diffAutocomplete')?.querySelector('.differential-ac-item');
        const text = first ? first.textContent : input.value.trim();
        if (text) { this.addDifferential(text); input.value = ''; this.showAutocomplete(''); }
      } else if (e.key === 'Escape') {
        this.showAutocomplete('');
      }
    });
    submitBtn.addEventListener('click', () => {
      if (this.differentials.length > 0 && this.onSubmit) this.onSubmit(this.differentials);
    });
  },

  _handleOutsideClick(e) {
    const wrap = this.container?.querySelector('.differential-input-wrap');
    if (wrap && !wrap.contains(e.target)) {
      const dd = document.getElementById('diffAutocomplete');
      if (dd) dd.style.display = 'none';
    }
  },

  addDifferential(text) {
    const trimmed = text.trim();
    if (!trimmed || this.differentials.length >= this.maxEntries) return;
    if (this.differentials.includes(trimmed)) return;
    this.differentials.push(trimmed);
    this.renderTags();
    const input = document.getElementById('diffInput');
    if (input) { input.value = ''; input.focus(); }
  },

  removeDifferential(index) { this.differentials.splice(index, 1); this.renderTags(); },

  moveDifferential(index, direction) {
    const ni = index + direction;
    if (ni < 0 || ni >= this.differentials.length) return;
    [this.differentials[index], this.differentials[ni]] = [this.differentials[ni], this.differentials[index]];
    this.renderTags();
  },

  _esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },

  renderTags() {
    const el = document.getElementById('diffTags');
    if (!el) return;
    const len = this.differentials.length;
    el.innerHTML = this.differentials.map((d, i) => `
      <div class="differential-tag">
        <span class="differential-rank">${i + 1}.</span>
        <span class="differential-name">${this._esc(d)}</span>
        <button class="differential-move-btn" data-action="up" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&uarr;</button>
        <button class="differential-move-btn" data-action="down" data-index="${i}" ${i === len - 1 ? 'disabled' : ''} aria-label="Move down">&darr;</button>
        <button class="differential-remove-btn" data-index="${i}" aria-label="Remove">&times;</button>
      </div>`).join('');

    el.querySelectorAll('.differential-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.moveDifferential(parseInt(btn.dataset.index, 10), btn.dataset.action === 'up' ? -1 : 1);
      });
    });
    el.querySelectorAll('.differential-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removeDifferential(parseInt(btn.dataset.index, 10)));
    });
    const count = this.container.querySelector('.differential-count');
    if (count) count.textContent = `${len}/${this.maxEntries}`;
  },

  showAutocomplete(query) {
    const dropdown = document.getElementById('diffAutocomplete');
    if (!dropdown || !query) { if (dropdown) dropdown.style.display = 'none'; return; }
    const lq = query.toLowerCase();
    const matches = this.autocompleteData
      .filter(d => d.toLowerCase().includes(lq) && !this.differentials.includes(d))
      .slice(0, 8);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(m =>
      `<div class="differential-ac-item">${this._esc(m)}</div>`
    ).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.differential-ac-item').forEach(item => {
      item.addEventListener('click', () => { this.addDifferential(item.textContent); dropdown.style.display = 'none'; });
    });
  },

  showResults(results) {
    if (!this.container) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="differential-results">
        <div class="differential-score">Score: ${Math.round(results.score * 100)}%</div>
        <div class="differential-xp">+${results.xp_earned} XP</div>
        ${results.matched.map(m => `<div class="diff-result-matched">\u2713 ${m}</div>`).join('')}
        ${results.extra.map(e => `<div class="diff-result-extra">\u2717 ${e}</div>`).join('')}
        ${results.missed.map(m => `<div class="diff-result-missed">\u26A0 Missed: ${m}</div>`).join('')}
      </div>`;
    this.container.appendChild(el);
  },

  destroy() {
    if (this._boundCloseAC) {
      document.removeEventListener('click', this._boundCloseAC, true);
      this._boundCloseAC = null;
    }
    if (this.container) this.container.innerHTML = '';
    this.differentials = [];
    this._options = {};
  }
};

// Listen for study mode events
document.addEventListener('study:show-differential', () => {
  const container = document.getElementById('differentialInputArea');
  if (!container) return;
  const level = localStorage.getItem('radcase-trainee-level') || 'resident';
  differentialInput.init(container, {
    maxEntries: level === 'student' ? 3 : 5,
    hint: level === 'student' ? 'List up to 3 most likely diagnoses' : '',
    onSubmit: (diffs) => {
      document.dispatchEvent(new CustomEvent('study:submit-differential', {
        detail: { differentials: diffs }
      }));
    }
  });
});
