// Analytics Dashboard - SVG charts, anatomy heat map, board-readiness gauge, trend lines

class AnalyticsDashboard {
  constructor() {
    this.data = null;
  }

  _getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      accent: style.getPropertyValue('--accent').trim() || '#6366f1',
      success: style.getPropertyValue('--success').trim() || '#22c55e',
      danger: style.getPropertyValue('--danger').trim() || '#ef4444',
      warning: style.getPropertyValue('--warning').trim() || '#f59e0b',
    };
  }

  async loadData() {
    try {
      const res = await fetch('/api/analytics/deep', { credentials: 'include' });
      this.data = await res.json();
      return this.data;
    } catch (e) {
      return null;
    }
  }

  render(container) {
    if (!this.data || !this.data.authenticated) {
      container.innerHTML = `
        <div class="analytics-empty">
          <p>Sign in to view your analytics dashboard</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="analytics-grid">
        <div class="analytics-card analytics-readiness">
          <h3>Board Readiness</h3>
          <div class="analytics-readiness-gauge" id="readinessGauge"></div>
          <div class="analytics-readiness-breakdown" id="readinessBreakdown"></div>
        </div>
        <div class="analytics-card analytics-streak-card">
          <h3>Study Activity</h3>
          <div class="analytics-streak-heatmap" id="streakHeatmap"></div>
        </div>
        <div class="analytics-card analytics-trends-card" style="grid-column: 1 / -1;">
          <div class="analytics-trends-header">
            <h3>Performance Trends</h3>
            <div class="analytics-trends-tabs">
              <button class="analytics-trend-tab active" data-period="daily">Daily</button>
              <button class="analytics-trend-tab" data-period="weekly">Weekly</button>
              <button class="analytics-trend-tab" data-period="monthly">Monthly</button>
            </div>
          </div>
          <div class="analytics-trends-chart" id="trendsChart"></div>
        </div>
        <div class="analytics-card">
          <h3>Anatomy Performance</h3>
          <div class="analytics-anatomy-map" id="anatomyMap"></div>
        </div>
        <div class="analytics-card">
          <h3>Modality Performance</h3>
          <div class="analytics-modality-bars" id="modalityBars"></div>
        </div>
        <div class="analytics-card" style="grid-column: 1 / -1;">
          <h3>Focus Areas (Weakest Cases)</h3>
          <div class="analytics-weakness-list" id="weaknessList"></div>
        </div>
      </div>
    `;

    this._renderReadinessGauge();
    this._renderStreakHeatmap();
    this._renderTrendsChart(this.data.performanceTrends);
    this._renderAnatomyMap();
    this._renderModalityBars();
    this._renderWeaknessList();

    // Trend period tabs
    container.querySelectorAll('.analytics-trend-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        container.querySelectorAll('.analytics-trend-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const period = tab.dataset.period;
        if (period === 'daily') {
          this._renderTrendsChart(this.data.performanceTrends);
        } else {
          try {
            const res = await fetch(`/api/analytics/trends?period=${period}`, { credentials: 'include' });
            const trendData = await res.json();
            this._renderTrendsChart(trendData.trends);
          } catch (e) {}
        }
      });
    });
  }

  _renderReadinessGauge() {
    const el = document.getElementById('readinessGauge');
    const bd = document.getElementById('readinessBreakdown');
    if (!el || !this.data.boardReadiness) return;

    const colors = this._getThemeColors();
    const score = this.data.boardReadiness.score;
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score < 40 ? colors.danger : score < 70 ? colors.warning : colors.success;

    el.innerHTML = `
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--bg-tertiary)" stroke-width="12"/>
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${color}" stroke-width="12"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 80 80)"
                style="transition: stroke-dashoffset 1s ease"/>
        <text x="80" y="75" text-anchor="middle" fill="var(--text-primary)" font-size="28" font-weight="700">${score}</text>
        <text x="80" y="95" text-anchor="middle" fill="var(--text-muted)" font-size="12">/ 100</text>
      </svg>
    `;

    if (bd && this.data.boardReadiness.breakdown) {
      const b = this.data.boardReadiness.breakdown;
      bd.innerHTML = Object.entries(b).map(([key, val]) => `
        <div class="analytics-readiness-item">
          <span class="analytics-readiness-label">${this._formatKey(key)}</span>
          <div class="analytics-readiness-bar-wrap">
            <div class="analytics-readiness-bar" style="width: ${(val.score / val.max) * 100}%"></div>
          </div>
          <span class="analytics-readiness-score">${val.score}/${val.max}</span>
        </div>
      `).join('');
    }
  }

  _renderStreakHeatmap() {
    const el = document.getElementById('streakHeatmap');
    if (!el) return;

    const streakMap = {};
    for (const s of (this.data.streakData || [])) {
      streakMap[s.date] = s.count;
    }

    const cells = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = streakMap[dateStr] || 0;
      const level = count === 0 ? 0 : count <= 3 ? 1 : count <= 8 ? 2 : count <= 15 ? 3 : 4;
      cells.push({ date: dateStr, count, level, dayLabel: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) });
    }

    el.innerHTML = `
      <div class="streak-grid">
        ${cells.map(c => `
          <div class="streak-cell streak-level-${c.level}" title="${c.dayLabel}: ${c.count} attempts"></div>
        `).join('')}
      </div>
      <div class="streak-legend">
        <span>Less</span>
        <div class="streak-cell streak-level-0"></div>
        <div class="streak-cell streak-level-1"></div>
        <div class="streak-cell streak-level-2"></div>
        <div class="streak-cell streak-level-3"></div>
        <div class="streak-cell streak-level-4"></div>
        <span>More</span>
      </div>
    `;
  }

  _renderTrendsChart(trends) {
    const el = document.getElementById('trendsChart');
    if (!el || !trends || trends.length === 0) {
      if (el) el.innerHTML = '<p class="analytics-empty-text">Not enough data for trends</p>';
      return;
    }

    const colors = this._getThemeColors();
    const width = 600, height = 200, padding = 40;
    const chartW = width - padding * 2, chartH = height - padding * 2;
    const maxAcc = 100;

    const points = trends.map((t, i) => ({
      x: padding + (i / Math.max(trends.length - 1, 1)) * chartW,
      y: padding + chartH - ((t.accuracy || 0) / maxAcc) * chartH,
      accuracy: t.accuracy || 0,
      date: t.date || t.period,
      attempts: t.attempts,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = linePath + ` L ${points[points.length - 1].x} ${padding + chartH} L ${points[0].x} ${padding + chartH} Z`;

    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" class="analytics-trend-svg">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- Grid lines -->
        ${[0, 25, 50, 75, 100].map(v => {
          const y = padding + chartH - (v / maxAcc) * chartH;
          return `<line x1="${padding}" y1="${y}" x2="${padding + chartW}" y2="${y}" stroke="var(--border-color)" stroke-opacity="0.3"/>
                  <text x="${padding - 5}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${v}%</text>`;
        }).join('')}
        <!-- Area -->
        <path d="${areaPath}" fill="url(#areaGrad)"/>
        <!-- Line -->
        <path d="${linePath}" fill="none" stroke="${colors.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Points -->
        ${points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="4" fill="${colors.accent}" stroke="var(--bg-secondary)" stroke-width="2">
            <title>${p.date}: ${p.accuracy}% (${p.attempts} attempts)</title>
          </circle>
        `).join('')}
      </svg>
    `;
  }

  _renderAnatomyMap() {
    const el = document.getElementById('anatomyMap');
    if (!el) return;

    const colors = this._getThemeColors();
    const bodyParts = this.data.performanceByBodyPart || [];
    const partMap = {};
    for (const p of bodyParts) {
      partMap[p.body_part] = p;
    }

    const regions = [
      { name: 'Head', x: 45, y: 5, w: 30, h: 15 },
      { name: 'Neck', x: 48, y: 20, w: 24, h: 8 },
      { name: 'Chest', x: 35, y: 28, w: 50, h: 22 },
      { name: 'Cardiac', x: 42, y: 32, w: 18, h: 15 },
      { name: 'Abdomen', x: 37, y: 50, w: 46, h: 18 },
      { name: 'Pelvis', x: 37, y: 68, w: 46, h: 12 },
      { name: 'Spine', x: 55, y: 20, w: 10, h: 60 },
      { name: 'Upper Extremity', x: 15, y: 28, w: 20, h: 35 },
      { name: 'Lower Extremity', x: 30, y: 80, w: 60, h: 20 },
      { name: 'MSK', x: 80, y: 28, w: 18, h: 35 },
    ];

    const getColor = (accuracy) => {
      if (accuracy === undefined) return 'var(--bg-tertiary)';
      if (accuracy < 50) return colors.danger;
      if (accuracy < 70) return colors.warning;
      if (accuracy < 85) return colors.accent;
      return colors.success;
    };

    let html = '<div class="anatomy-region-list">';
    for (const r of regions) {
      const data = partMap[r.name];
      const accuracy = data?.accuracy;
      const color = getColor(accuracy);
      html += `
        <div class="anatomy-region-item" style="border-left: 4px solid ${color}">
          <span class="anatomy-region-name">${r.name}</span>
          <span class="anatomy-region-accuracy" style="color: ${color}">${accuracy !== undefined ? accuracy + '%' : '-'}</span>
          <span class="anatomy-region-count">${data?.attempts || 0} attempts</span>
        </div>
      `;
    }
    html += '</div>';
    el.innerHTML = html;
  }

  _renderModalityBars() {
    const el = document.getElementById('modalityBars');
    if (!el) return;

    const colors = this._getThemeColors();
    const modalities = this.data.performanceByModality || [];
    if (modalities.length === 0) {
      el.innerHTML = '<p class="analytics-empty-text">No modality data yet</p>';
      return;
    }

    const maxAttempts = Math.max(...modalities.map(m => m.attempts), 1);

    el.innerHTML = modalities.map(m => {
      const barColor = m.accuracy < 50 ? colors.danger : m.accuracy < 70 ? colors.warning : m.accuracy < 85 ? colors.accent : colors.success;
      return `
        <div class="modality-bar-row">
          <span class="modality-bar-label">${m.modality}</span>
          <div class="modality-bar-wrap">
            <div class="modality-bar" style="width: ${(m.attempts / maxAttempts) * 100}%; background: ${barColor}">
              <span class="modality-bar-text">${m.accuracy}%</span>
            </div>
          </div>
          <span class="modality-bar-count">${m.attempts}</span>
        </div>
      `;
    }).join('');
  }

  _renderWeaknessList() {
    const el = document.getElementById('weaknessList');
    if (!el) return;

    const colors = this._getThemeColors();
    const weak = this.data.weakestCases || [];
    if (weak.length === 0) {
      el.innerHTML = '<p class="analytics-empty-text">Complete more quizzes to see weak areas</p>';
      return;
    }

    el.innerHTML = weak.map(c => `
      <div class="weakness-item" onclick="viewCase('${c.id}')" style="cursor:pointer">
        <div class="weakness-info">
          <span class="weakness-title">${(typeof window.escapeHtml === 'function' ? window.escapeHtml : (s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }))(c.title || c.diagnosis)}</span>
          <span class="weakness-meta">${c.body_part || ''} ${c.modality ? '&middot; ' + c.modality : ''}</span>
        </div>
        <div class="weakness-stats">
          <span class="weakness-accuracy" style="color: ${c.accuracy < 50 ? colors.danger : colors.warning}">${c.accuracy}%</span>
          <span class="weakness-attempts">${c.attempts} attempts</span>
        </div>
      </div>
    `).join('');
  }

  _formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }
}

window.analyticsDashboard = new AnalyticsDashboard();
