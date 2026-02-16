(function() {
  'use strict';

  const API = window.location.origin + '/api';
  let container = null;
  let milestoneData = null;
  let gapData = null;
  let cmeData = null;
  let cmeSummary = null;
  let currentView = 'overview';
  let expandedDomain = null;
  let pgyYear = 2;

  const DOMAINS = [
    { code: 'PC', name: 'Patient Care', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
    { code: 'MK', name: 'Medical Knowledge', icon: 'M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z' },
    { code: 'SBP', name: 'Systems-Based Practice', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
    { code: 'PBLI', name: 'Practice-Based Learning', icon: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z' },
    { code: 'PROF', name: 'Professionalism', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
    { code: 'ICS', name: 'Interpersonal & Communication', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z' }
  ];

  const DOMAIN_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const PGY_EXPECTED = { 1: 1.5, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0 };

  async function init(el) {
    container = el;
    detectPGY();
    render();
    await loadData();
  }

  function detectPGY() {
    try {
      const user = window.state?.currentUser;
      if (user && user.pgyYear) {
        pgyYear = user.pgyYear;
      }
    } catch (e) {}
  }

  async function loadData() {
    try {
      const [mData, gData, cData, csData] = await Promise.all([
        fetchJSON(`${API}/milestones`),
        fetchJSON(`${API}/milestones/gaps`),
        fetchJSON(`${API}/cme`),
        fetchJSON(`${API}/cme/summary`)
      ]);
      milestoneData = mData;
      gapData = gData;
      cmeData = cData;
      cmeSummary = csData;
    } catch (e) {
      console.error('Failed to load milestone data:', e);
      milestoneData = milestoneData || getFallbackData();
      gapData = gapData || { gaps: [] };
      cmeData = cmeData || { credits: [] };
      cmeSummary = cmeSummary || { totals: {}, yearToDate: {} };
    }
    render();
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Fetch failed');
    return await res.json();
  }

  function getFallbackData() {
    return {
      domains: DOMAINS.map((d, i) => ({
        code: d.code,
        name: d.name,
        avgLevel: 0,
        milestones: [
          { code: `DR-${d.code}1`, name: `${d.name} Sub-competency 1`, level: 0, assessmentCount: 0, lastAssessed: null },
          { code: `DR-${d.code}2`, name: `${d.name} Sub-competency 2`, level: 0, assessmentCount: 0, lastAssessed: null },
          { code: `DR-${d.code}3`, name: `${d.name} Sub-competency 3`, level: 0, assessmentCount: 0, lastAssessed: null }
        ]
      }))
    };
  }

  function render() {
    if (!container) return;

    const domains = milestoneData?.domains || getFallbackData().domains;
    const levels = domains.map(d => d.avgLevel || 0);
    const expected = PGY_EXPECTED[pgyYear] || 2.5;
    const expectedLevels = DOMAINS.map(() => expected);

    container.innerHTML = `
      <div class="milestones-page">
        <div class="milestones-top-bar">
          <div class="milestones-pgy-selector">
            <label>PGY Year:</label>
            <select class="ms-pgy-select" id="msPgySelect">
              ${[1,2,3,4,5].map(y => `<option value="${y}" ${y === pgyYear ? 'selected' : ''}>PGY-${y}</option>`).join('')}
            </select>
          </div>
          <div class="milestones-view-toggle">
            <button class="ms-view-btn ${currentView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>
            <button class="ms-view-btn ${currentView === 'gaps' ? 'active' : ''}" data-view="gaps">Gap Analysis</button>
          </div>
          <button class="ms-recalc-btn" id="msRecalcBtn">Recalculate Progress</button>
        </div>

        <div class="milestones-radar-section">
          <div class="ms-radar-container">
            <svg id="msRadarChart" class="ms-radar-svg" viewBox="0 0 400 400"></svg>
            <div class="ms-radar-tooltip" id="msRadarTooltip" style="display:none;"></div>
          </div>
          <div class="ms-radar-legend">
            ${DOMAINS.map((d, i) => `
              <div class="ms-legend-item">
                <span class="ms-legend-dot" style="background:${DOMAIN_COLORS[i]}"></span>
                <span class="ms-legend-label">${d.code}: ${d.name}</span>
                <span class="ms-legend-value">${(levels[i] || 0).toFixed(1)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div id="msMainContent">
          ${currentView === 'overview' ? renderOverview(domains) : renderGapAnalysis()}
        </div>

        <div class="ms-cme-section">
          <details class="ms-cme-details">
            <summary class="ms-cme-summary">CME Credits</summary>
            <div class="ms-cme-content" id="msCmeContent">
              ${renderCMEPanel()}
            </div>
          </details>
        </div>
      </div>
    `;

    renderRadarChart(
      container.querySelector('#msRadarChart'),
      DOMAINS.map(d => d.code),
      levels,
      expectedLevels
    );

    attachEvents();
  }

  function renderOverview(domains) {
    return `
      <div class="ms-domain-grid">
        ${domains.map((domain, i) => `
          <div class="ms-domain-card ${expandedDomain === i ? 'expanded' : ''}" data-domain="${i}">
            <div class="ms-domain-card-header">
              <div class="ms-domain-icon" style="color:${DOMAIN_COLORS[i]}">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="${DOMAIN_COLORS[i]}"><path d="${DOMAINS[i].icon}"/></svg>
              </div>
              <div class="ms-domain-info">
                <h3 class="ms-domain-name">${domain.name}</h3>
                <div class="ms-domain-avg">Level ${(domain.avgLevel || 0).toFixed(1)} / 5.0</div>
              </div>
              <div class="ms-domain-gauge">
                ${renderLevelGauge(domain.avgLevel || 0, DOMAIN_COLORS[i])}
              </div>
            </div>
            <div class="ms-domain-progress-bar">
              <div class="ms-domain-progress-fill" style="width:${((domain.avgLevel || 0) / 5) * 100}%;background:${DOMAIN_COLORS[i]}"></div>
            </div>
            ${expandedDomain === i ? renderDomainMilestones(domain, i) : ''}
            <button class="ms-domain-expand-btn" data-domain="${i}">
              ${expandedDomain === i ? 'Collapse' : 'View Milestones'}
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderDomainMilestones(domain, domainIdx) {
    const ms = domain.milestones || [];
    if (ms.length === 0) return '<div class="ms-no-data">No milestones tracked yet</div>';

    return `
      <div class="ms-milestones-list">
        ${ms.map(m => `
          <div class="ms-milestone-row">
            <div class="ms-milestone-code">${m.code || '---'}</div>
            <div class="ms-milestone-name">${m.name || 'Unknown'}</div>
            <div class="ms-milestone-gauge-sm">
              ${renderLevelGauge(m.level || 0, DOMAIN_COLORS[domainIdx], 36)}
            </div>
            <div class="ms-milestone-meta">
              <span class="ms-assessment-count">${m.assessmentCount || 0} assessments</span>
              <span class="ms-last-assessed">${m.lastAssessed ? formatDate(m.lastAssessed) : 'Never'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderGapAnalysis() {
    const gaps = gapData?.gaps || [];
    const expected = PGY_EXPECTED[pgyYear] || 2.5;

    if (gaps.length === 0) {
      return `
        <div class="ms-gap-empty">
          <div class="ms-gap-empty-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--success)"><path d="${DOMAINS[4].icon}"/></svg>
          </div>
          <h3>All milestones on track!</h3>
          <p>No milestones are below expected level for PGY-${pgyYear} (expected: ${expected.toFixed(1)})</p>
        </div>
      `;
    }

    return `
      <div class="ms-gap-list">
        <div class="ms-gap-header">
          <h3>Milestones Below Expected for PGY-${pgyYear}</h3>
          <p>Expected level: ${expected.toFixed(1)}</p>
        </div>
        ${gaps.map(gap => {
          const delta = (gap.expectedLevel || expected) - (gap.currentLevel || 0);
          const status = delta <= 0 ? 'green' : delta <= 0.5 ? 'yellow' : 'red';
          return `
            <div class="ms-gap-item ms-gap-${status}">
              <div class="ms-gap-info">
                <div class="ms-gap-code">${gap.milestoneCode || gap.code || '---'}</div>
                <div class="ms-gap-name">${gap.milestoneName || gap.name || 'Unknown'}</div>
              </div>
              <div class="ms-gap-levels">
                <div class="ms-gap-bar-container">
                  <div class="ms-gap-bar-current" style="width:${((gap.currentLevel || 0) / 5) * 100}%"></div>
                  <div class="ms-gap-bar-expected" style="left:${((gap.expectedLevel || expected) / 5) * 100}%"></div>
                </div>
                <div class="ms-gap-numbers">
                  <span>Current: ${(gap.currentLevel || 0).toFixed(1)}</span>
                  <span>Expected: ${(gap.expectedLevel || expected).toFixed(1)}</span>
                  <span class="ms-gap-delta">Gap: -${delta.toFixed(1)}</span>
                </div>
              </div>
              <div class="ms-gap-actions">
                ${gap.recommendedActivities ? `<div class="ms-gap-recommended">${gap.recommendedActivities}</div>` : ''}
                <button class="ms-practice-btn" data-milestone="${gap.milestoneCode || gap.code || ''}">Practice Now</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCMEPanel() {
    const summary = cmeSummary || {};
    const totals = summary.totals || {};
    const ytd = summary.yearToDate || {};
    const credits = cmeData?.credits || [];

    return `
      <div class="ms-cme-grid">
        <div class="ms-cme-stat-card">
          <div class="ms-cme-stat-label">SA-CME</div>
          <div class="ms-cme-stat-value">${totals.saCme || 0}</div>
          <div class="ms-cme-stat-sub">YTD: ${ytd.saCme || 0}</div>
        </div>
        <div class="ms-cme-stat-card">
          <div class="ms-cme-stat-label">CME</div>
          <div class="ms-cme-stat-value">${totals.cme || 0}</div>
          <div class="ms-cme-stat-sub">YTD: ${ytd.cme || 0}</div>
        </div>
        <div class="ms-cme-stat-card">
          <div class="ms-cme-stat-label">MOC</div>
          <div class="ms-cme-stat-value">${totals.moc || 0}</div>
          <div class="ms-cme-stat-sub">YTD: ${ytd.moc || 0}</div>
        </div>
        <div class="ms-cme-stat-card">
          <div class="ms-cme-stat-label">Lifetime Total</div>
          <div class="ms-cme-stat-value">${(totals.saCme || 0) + (totals.cme || 0) + (totals.moc || 0)}</div>
        </div>
      </div>
      <div class="ms-cme-recent">
        <h4>Recent Credits</h4>
        ${credits.length === 0 ? '<p class="ms-no-data">No credits recorded yet</p>' : `
          <table class="ms-cme-table">
            <thead><tr><th>Activity</th><th>Title</th><th>Credits</th><th>Date</th></tr></thead>
            <tbody>
              ${credits.slice(0, 10).map(c => `
                <tr>
                  <td><span class="ms-cme-type-badge">${c.activityType || c.activity_type || '-'}</span></td>
                  <td>${c.title || '-'}</td>
                  <td>${c.credits || 0}</td>
                  <td>${c.date ? formatDate(c.date) : c.created_at ? formatDate(c.created_at) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  function renderLevelGauge(level, color, size) {
    size = size || 52;
    const r = (size - 6) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const pct = Math.min(level / 5, 1);
    const offset = circumference * (1 - pct);
    const gaugeColor = level >= 4 ? 'var(--success)' : level >= 2.5 ? color : level >= 1.5 ? 'var(--warning)' : 'var(--danger)';

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ms-gauge">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${gaugeColor}" stroke-width="4"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" class="ms-gauge-fill"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          fill="var(--text-primary)" font-size="${size * 0.3}" font-weight="600">${level.toFixed(1)}</text>
      </svg>
    `;
  }

  function renderRadarChart(svgEl, labels, levels, expectedLevels) {
    if (!svgEl) return;
    const cx = 200, cy = 200, maxR = 150;
    const n = labels.length;
    const angleStep = (2 * Math.PI) / n;

    // Build grid
    let gridHTML = '';
    for (let ring = 1; ring <= 5; ring++) {
      const r = (ring / 5) * maxR;
      const points = [];
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      gridHTML += `<polygon points="${points.join(' ')}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    }

    // Axis lines and labels
    let axesHTML = '';
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + i * angleStep;
      const x2 = cx + maxR * Math.cos(angle);
      const y2 = cy + maxR * Math.sin(angle);
      const lx = cx + (maxR + 25) * Math.cos(angle);
      const ly = cy + (maxR + 25) * Math.sin(angle);
      axesHTML += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
      axesHTML += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="var(--text-secondary)" font-size="11" font-weight="500">${labels[i]}</text>`;
    }

    // Expected polygon
    const expPoints = expectedLevels.map((lv, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (lv / 5) * maxR;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');

    // Current polygon
    const curPoints = levels.map((lv, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (lv / 5) * maxR;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');

    // Hover dots
    let dotsHTML = '';
    levels.forEach((lv, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (lv / 5) * maxR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      dotsHTML += `<circle cx="${x}" cy="${y}" r="5" fill="${DOMAIN_COLORS[i]}" stroke="var(--bg-primary)" stroke-width="2" class="ms-radar-dot" data-domain="${i}" data-level="${lv.toFixed(1)}" data-name="${DOMAINS[i].name}"/>`;
    });

    svgEl.innerHTML = `
      ${gridHTML}
      ${axesHTML}
      <polygon points="${expPoints}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-dasharray="6 4" class="ms-radar-expected"/>
      <polygon points="${curPoints}" fill="rgba(99,102,241,0.15)" stroke="var(--accent)" stroke-width="2.5" class="ms-radar-current"/>
      ${dotsHTML}
    `;

    // Animate current polygon
    const currentPoly = svgEl.querySelector('.ms-radar-current');
    if (currentPoly) {
      currentPoly.style.opacity = '0';
      currentPoly.style.transition = 'opacity 0.6s ease';
      requestAnimationFrame(() => {
        currentPoly.style.opacity = '1';
      });
    }

    // Tooltip on hover
    const tooltip = container.querySelector('#msRadarTooltip');
    svgEl.querySelectorAll('.ms-radar-dot').forEach(dot => {
      dot.addEventListener('mouseenter', (e) => {
        if (!tooltip) return;
        tooltip.textContent = `${dot.dataset.name}: Level ${dot.dataset.level}`;
        tooltip.style.display = 'block';
        const rect = svgEl.getBoundingClientRect();
        const cx2 = parseFloat(dot.getAttribute('cx'));
        const cy2 = parseFloat(dot.getAttribute('cy'));
        const svgW = rect.width;
        const svgH = rect.height;
        tooltip.style.left = ((cx2 / 400) * svgW) + 'px';
        tooltip.style.top = ((cy2 / 400) * svgH - 30) + 'px';
      });
      dot.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.style.display = 'none';
      });
    });
  }

  function attachEvents() {
    // View toggle
    container.querySelectorAll('.ms-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        render();
      });
    });

    // PGY selector
    const pgySelect = container.querySelector('#msPgySelect');
    if (pgySelect) {
      pgySelect.addEventListener('change', () => {
        pgyYear = parseInt(pgySelect.value);
        render();
      });
    }

    // Recalculate
    const recalcBtn = container.querySelector('#msRecalcBtn');
    if (recalcBtn) {
      recalcBtn.addEventListener('click', async () => {
        recalcBtn.disabled = true;
        recalcBtn.textContent = 'Recalculating...';
        try {
          await fetch(`${API}/milestones/recalculate`, { method: 'POST', credentials: 'include' });
          await loadData();
          if (window.toast) window.toast('Milestones recalculated', 'success');
        } catch (e) {
          if (window.toast) window.toast('Failed to recalculate', 'error');
        }
        recalcBtn.disabled = false;
        recalcBtn.textContent = 'Recalculate Progress';
      });
    }

    // Domain expand
    container.querySelectorAll('.ms-domain-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.domain);
        expandedDomain = expandedDomain === idx ? null : idx;
        render();
      });
    });

    container.querySelectorAll('.ms-domain-card-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.ms-domain-card');
        const idx = parseInt(card.dataset.domain);
        expandedDomain = expandedDomain === idx ? null : idx;
        render();
      });
    });

    // Practice buttons
    container.querySelectorAll('.ms-practice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.showPage) window.showPage('quiz');
        const navItem = document.querySelector('.nav-item[data-page="quiz"]');
        if (navItem) navItem.click();
      });
    });
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  // Public API for radar chart reuse by program-dashboard.js
  function renderRadarChartPublic(svgEl, labels, levels, expectedLevels) {
    renderRadarChart(svgEl, labels, levels, expectedLevels);
  }

  window.milestones = {
    init,
    renderRadarChart: renderRadarChartPublic,
    DOMAINS,
    DOMAIN_COLORS,
    PGY_EXPECTED
  };
})();
