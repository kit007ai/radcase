(function() {
  'use strict';

  const API = window.location.origin + '/api';
  let container = null;
  let programId = null;
  let programs = [];
  let dashboardData = null;
  let selectedResident = null;
  let residentDetail = null;
  let milestoneReport = null;
  let atRiskData = null;
  let cohortStats = null;
  let currentTab = 'cohort';
  let sortField = 'name';
  let sortDir = 'asc';
  let filterPGY = '';
  let facultyNotes = {};

  const DOMAINS = window.milestones?.DOMAINS || [
    { code: 'PC', name: 'Patient Care' },
    { code: 'MK', name: 'Medical Knowledge' },
    { code: 'SBP', name: 'Systems-Based Practice' },
    { code: 'PBLI', name: 'Practice-Based Learning' },
    { code: 'PROF', name: 'Professionalism' },
    { code: 'ICS', name: 'Interpersonal & Communication' }
  ];
  const DOMAIN_COLORS = window.milestones?.DOMAIN_COLORS || ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const PGY_EXPECTED = window.milestones?.PGY_EXPECTED || { 1: 1.5, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0 };

  async function init(el) {
    container = el;
    renderLoading();
    await loadPrograms();
  }

  function renderLoading() {
    if (!container) return;
    container.innerHTML = '<div class="pd-loading"><div class="loading-spinner"></div><p>Loading program dashboard...</p></div>';
  }

  async function loadPrograms() {
    try {
      const data = await fetchJSON(`${API}/programs`);
      programs = data.programs || data || [];
    } catch (e) {
      programs = [];
    }

    if (programs.length === 0) {
      renderNoProgram();
      return;
    }

    programId = programs[0].id;
    await loadDashboard();
  }

  function renderNoProgram() {
    container.innerHTML = `
      <div class="pd-empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--text-muted)">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <h3>No Programs Available</h3>
        <p>You are not associated with any residency program, or you don't have program director access.</p>
      </div>
    `;
  }

  async function loadDashboard() {
    try {
      const [dData, rData, arData, csData] = await Promise.all([
        fetchJSON(`${API}/programs/${programId}/dashboard`),
        fetchJSON(`${API}/programs/${programId}/milestone-report`),
        fetchJSON(`${API}/programs/${programId}/at-risk`),
        fetchJSON(`${API}/programs/${programId}/cohort-stats`)
      ]);
      dashboardData = dData;
      milestoneReport = rData;
      atRiskData = arData;
      cohortStats = csData;
    } catch (e) {
      console.error('Failed to load program dashboard:', e);
      dashboardData = dashboardData || { program: {}, residents: [] };
      milestoneReport = milestoneReport || { residents: [], milestones: [] };
      atRiskData = atRiskData || { residents: [] };
      cohortStats = cohortStats || {};
    }
    render();
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Fetch failed');
    return await res.json();
  }

  function render() {
    if (!container) return;

    const program = dashboardData?.program || {};
    const residents = dashboardData?.residents || [];

    container.innerHTML = `
      <div class="pd-page">
        ${programs.length > 1 ? `
          <div class="pd-program-selector">
            <select class="pd-program-select" id="pdProgramSelect">
              ${programs.map(p => `<option value="${p.id}" ${p.id === programId ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <div class="pd-header">
          <div class="pd-header-info">
            <h3 class="pd-program-name">${program.name || 'Program Dashboard'}</h3>
            <p class="pd-institution">${program.institutionName || program.institution_name || ''}</p>
          </div>
          <div class="pd-header-stats">
            <div class="pd-stat"><span class="pd-stat-value">${residents.length}</span><span class="pd-stat-label">Residents</span></div>
            <div class="pd-stat"><span class="pd-stat-value">${countActive(residents)}</span><span class="pd-stat-label">Active (7d)</span></div>
            <div class="pd-stat"><span class="pd-stat-value">${(atRiskData?.residents || []).length}</span><span class="pd-stat-label">At Risk</span></div>
          </div>
        </div>

        <div class="pd-tabs">
          <button class="pd-tab ${currentTab === 'cohort' ? 'active' : ''}" data-tab="cohort">Cohort Overview</button>
          <button class="pd-tab ${currentTab === 'report' ? 'active' : ''}" data-tab="report">Milestone Report</button>
          <button class="pd-tab ${currentTab === 'at-risk' ? 'active' : ''}" data-tab="at-risk">At-Risk</button>
          <button class="pd-tab ${currentTab === 'stats' ? 'active' : ''}" data-tab="stats">Statistics</button>
        </div>

        <div id="pdTabContent">
          ${renderTabContent()}
        </div>
      </div>

      ${selectedResident ? renderResidentModal() : ''}
    `;

    attachEvents();
  }

  function renderTabContent() {
    switch (currentTab) {
      case 'cohort': return renderCohortOverview();
      case 'report': return renderMilestoneReport();
      case 'at-risk': return renderAtRisk();
      case 'stats': return renderCohortStats();
      default: return renderCohortOverview();
    }
  }

  function renderCohortOverview() {
    let residents = dashboardData?.residents || [];

    // Filter
    if (filterPGY) {
      residents = residents.filter(r => String(r.pgyYear || r.pgy_year) === filterPGY);
    }

    // Sort
    residents = [...residents].sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'name': va = (a.displayName || a.display_name || a.username || '').toLowerCase(); vb = (b.displayName || b.display_name || b.username || '').toLowerCase(); break;
        case 'pgy': va = a.pgyYear || a.pgy_year || 0; vb = b.pgyYear || b.pgy_year || 0; break;
        case 'level': va = a.overallLevel || a.overall_level || 0; vb = b.overallLevel || b.overall_level || 0; break;
        case 'activity': va = a.lastActive || a.last_active || ''; vb = b.lastActive || b.last_active || ''; break;
        default: va = 0; vb = 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return `
      <div class="pd-cohort-controls">
        <div class="pd-sort-group">
          <label>Sort:</label>
          <select class="pd-sort-select" id="pdSortSelect">
            <option value="name" ${sortField === 'name' ? 'selected' : ''}>Name</option>
            <option value="pgy" ${sortField === 'pgy' ? 'selected' : ''}>PGY Year</option>
            <option value="level" ${sortField === 'level' ? 'selected' : ''}>Milestone Level</option>
            <option value="activity" ${sortField === 'activity' ? 'selected' : ''}>Recent Activity</option>
          </select>
          <button class="pd-sort-dir-btn" id="pdSortDirBtn" title="Toggle sort direction">${sortDir === 'asc' ? '&#x25B2;' : '&#x25BC;'}</button>
        </div>
        <div class="pd-filter-group">
          <label>PGY:</label>
          <select class="pd-filter-select" id="pdFilterPGY">
            <option value="">All Years</option>
            ${[1,2,3,4,5].map(y => `<option value="${y}" ${filterPGY === String(y) ? 'selected' : ''}>PGY-${y}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="pd-resident-grid">
        ${residents.length === 0 ? '<div class="pd-no-data">No residents found</div>' : residents.map(r => renderResidentCard(r)).join('')}
      </div>
    `;
  }

  function renderResidentCard(r) {
    const name = r.displayName || r.display_name || r.username || 'Unknown';
    const pgy = r.pgyYear || r.pgy_year || '?';
    const level = r.overallLevel || r.overall_level || 0;
    const isActive = isRecentlyActive(r.lastActive || r.last_active);
    const levelColor = level >= 4 ? 'var(--success)' : level >= 2.5 ? 'var(--accent)' : level >= 1.5 ? 'var(--warning)' : 'var(--danger)';
    const activityData = r.activityTrend || r.activity_trend || [];

    return `
      <div class="pd-resident-card" data-user-id="${r.userId || r.user_id || r.id}">
        <div class="pd-resident-top">
          <div class="pd-resident-avatar">${name.charAt(0).toUpperCase()}</div>
          <div class="pd-resident-info">
            <div class="pd-resident-name">${escapeHTML(name)}</div>
            <div class="pd-resident-pgy">PGY-${pgy}</div>
          </div>
          ${isActive ? '<div class="pd-active-dot" title="Active in last 7 days"></div>' : ''}
        </div>
        <div class="pd-resident-level" style="color:${levelColor}">
          <span class="pd-level-number">${level.toFixed(1)}</span>
          <span class="pd-level-label">Overall Level</span>
        </div>
        <div class="pd-resident-sparkline">
          ${renderSparkline(activityData)}
        </div>
      </div>
    `;
  }

  function renderSparkline(data) {
    if (!data || data.length === 0) {
      data = [0, 0, 0, 0, 0, 0, 0];
    }
    const w = 50, h = 20;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="pd-sparkline-svg">
        <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    `;
  }

  function renderResidentModal() {
    if (!selectedResident) return '';
    const r = selectedResident;
    const detail = residentDetail || {};
    const name = r.displayName || r.display_name || r.username || 'Unknown';
    const pgy = r.pgyYear || r.pgy_year || 2;
    const expected = PGY_EXPECTED[pgy] || 2.5;
    const milestones = detail.milestones || [];
    const activities = detail.activities || detail.recentActivity || [];
    const strengths = detail.strengths || [];
    const weaknesses = detail.weaknesses || [];
    const userId = r.userId || r.user_id || r.id;

    return `
      <div class="pd-modal-overlay" id="pdResidentModal">
        <div class="pd-modal">
          <div class="pd-modal-header">
            <div class="pd-modal-title">
              <div class="pd-modal-avatar">${name.charAt(0).toUpperCase()}</div>
              <div>
                <h3>${escapeHTML(name)}</h3>
                <span>PGY-${pgy}</span>
              </div>
            </div>
            <button class="pd-modal-close" id="pdModalClose">&times;</button>
          </div>

          <div class="pd-modal-body">
            <div class="pd-modal-section">
              <h4>Milestone Radar</h4>
              <div class="pd-modal-radar">
                <svg id="pdResidentRadar" class="ms-radar-svg" viewBox="0 0 400 400"></svg>
              </div>
            </div>

            <div class="pd-modal-section">
              <h4>All Milestones</h4>
              <div class="pd-milestone-list">
                ${milestones.length === 0 ? '<p class="pd-no-data">No milestone data available</p>' :
                  milestones.map(m => {
                    const lvl = m.level || 0;
                    const color = lvl >= 4 ? 'var(--success)' : lvl >= 2.5 ? 'var(--accent)' : lvl >= 1.5 ? 'var(--warning)' : 'var(--danger)';
                    return `
                      <div class="pd-ms-row">
                        <span class="pd-ms-code">${m.code || '---'}</span>
                        <span class="pd-ms-name">${m.name || 'Unknown'}</span>
                        <span class="pd-ms-level" style="color:${color}">${lvl.toFixed(1)}</span>
                      </div>
                    `;
                  }).join('')
                }
              </div>
            </div>

            ${strengths.length > 0 || weaknesses.length > 0 ? `
              <div class="pd-modal-section pd-sw-section">
                ${strengths.length > 0 ? `
                  <div class="pd-sw-col">
                    <h4 class="pd-sw-title pd-strength-title">Strengths</h4>
                    <ul class="pd-sw-list">${strengths.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>
                  </div>
                ` : ''}
                ${weaknesses.length > 0 ? `
                  <div class="pd-sw-col">
                    <h4 class="pd-sw-title pd-weakness-title">Areas for Improvement</h4>
                    <ul class="pd-sw-list">${weaknesses.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <div class="pd-modal-section">
              <h4>Recent Activity</h4>
              <div class="pd-activity-timeline">
                ${activities.length === 0 ? '<p class="pd-no-data">No recent activity</p>' :
                  activities.slice(0, 15).map(a => `
                    <div class="pd-activity-item">
                      <div class="pd-activity-dot"></div>
                      <div class="pd-activity-content">
                        <span class="pd-activity-type">${a.type || a.activity_type || 'Activity'}</span>
                        <span class="pd-activity-desc">${escapeHTML(a.title || a.description || '')}</span>
                        <span class="pd-activity-date">${a.date ? formatDate(a.date) : a.created_at ? formatDate(a.created_at) : ''}</span>
                      </div>
                    </div>
                  `).join('')
                }
              </div>
            </div>

            <div class="pd-modal-section">
              <h4>Faculty Notes</h4>
              <textarea class="pd-faculty-notes" id="pdFacultyNotes" placeholder="Add notes about this resident...">${facultyNotes[userId] || ''}</textarea>
            </div>

            <div class="pd-modal-section">
              <h4>Assess Milestone</h4>
              <div class="pd-assess-form">
                <select class="pd-assess-select" id="pdAssessMilestone">
                  <option value="">Select milestone...</option>
                  ${milestones.map(m => `<option value="${m.id || m.milestoneId || m.milestone_id}">${m.code}: ${m.name}</option>`).join('')}
                </select>
                <select class="pd-assess-select" id="pdAssessLevel">
                  ${[1,1.5,2,2.5,3,3.5,4,4.5,5].map(l => `<option value="${l}">Level ${l}</option>`).join('')}
                </select>
                <input type="text" class="pd-assess-input" id="pdAssessNotes" placeholder="Assessment notes...">
                <button class="pd-assess-btn" id="pdAssessBtn">Submit Assessment</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMilestoneReport() {
    const report = milestoneReport || {};
    const residents = report.residents || [];
    const msColumns = report.milestones || [];

    return `
      <div class="pd-report-header">
        <h3>Milestone Matrix</h3>
        <button class="pd-export-btn" id="pdExportCSV">Export CSV</button>
      </div>
      <div class="pd-report-table-wrap">
        <table class="pd-report-table">
          <thead>
            <tr>
              <th class="pd-th-sticky">Resident</th>
              <th class="pd-th-sticky">PGY</th>
              ${msColumns.map(m => `<th class="pd-th-ms" title="${m.name || ''}">${m.code || '---'}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${residents.length === 0 ? `<tr><td colspan="${msColumns.length + 2}" class="pd-no-data">No data available</td></tr>` :
              residents.map(r => {
                const name = r.displayName || r.display_name || r.username || 'Unknown';
                const pgy = r.pgyYear || r.pgy_year || '?';
                const levels = r.levels || {};
                return `
                  <tr>
                    <td class="pd-td-name">${escapeHTML(name)}</td>
                    <td class="pd-td-pgy">${pgy}</td>
                    ${msColumns.map(m => {
                      const lv = levels[m.code] || levels[m.id] || 0;
                      const cls = lv >= 4 ? 'pd-level-high' : lv >= 2.5 ? 'pd-level-mid' : lv >= 1 ? 'pd-level-low' : 'pd-level-none';
                      return `<td class="pd-td-level ${cls}">${lv > 0 ? lv.toFixed(1) : '-'}</td>`;
                    }).join('')}
                  </tr>
                `;
              }).join('')
            }
          </tbody>
        </table>
      </div>

      ${renderReportSummary(residents, msColumns)}
    `;
  }

  function renderReportSummary(residents, msColumns) {
    if (residents.length === 0 || msColumns.length === 0) return '';

    return `
      <div class="pd-report-summary">
        <h4>Summary Statistics</h4>
        <div class="pd-summary-grid">
          ${msColumns.map(m => {
            const values = residents.map(r => (r.levels || {})[m.code] || (r.levels || {})[m.id] || 0).filter(v => v > 0);
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            const min = values.length > 0 ? Math.min(...values) : 0;
            const max = values.length > 0 ? Math.max(...values) : 0;
            return `
              <div class="pd-summary-item">
                <span class="pd-summary-code">${m.code}</span>
                <span class="pd-summary-avg">${avg.toFixed(1)}</span>
                <span class="pd-summary-range">${min.toFixed(1)} - ${max.toFixed(1)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderAtRisk() {
    const residents = atRiskData?.residents || [];

    return `
      <div class="pd-at-risk">
        ${residents.length === 0 ?
          '<div class="pd-no-data pd-at-risk-empty"><svg viewBox="0 0 24 24" width="36" height="36" fill="var(--success)"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg><h3>No at-risk residents</h3><p>All residents are progressing within expected ranges.</p></div>' :
          residents.map(r => {
            const name = r.displayName || r.display_name || r.username || 'Unknown';
            const pgy = r.pgyYear || r.pgy_year || '?';
            const behindCount = r.behindCount || r.behind_count || 0;
            const badgeClass = behindCount >= 3 ? 'pd-badge-atrisk' : 'pd-badge-attention';
            const badgeText = behindCount >= 3 ? 'At Risk' : 'Needs Attention';
            const gapMilestones = r.gapMilestones || r.gap_milestones || [];

            return `
              <div class="pd-at-risk-card">
                <div class="pd-at-risk-header">
                  <div class="pd-at-risk-info">
                    <span class="pd-at-risk-name">${escapeHTML(name)}</span>
                    <span class="pd-at-risk-pgy">PGY-${pgy}</span>
                  </div>
                  <span class="pd-at-risk-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="pd-at-risk-detail">
                  <span class="pd-at-risk-count">${behindCount} milestone${behindCount !== 1 ? 's' : ''} behind</span>
                  ${gapMilestones.length > 0 ? `
                    <div class="pd-at-risk-gaps">
                      ${gapMilestones.map(g => `
                        <div class="pd-at-risk-gap">
                          <span class="pd-gap-code">${g.code || '---'}</span>
                          <span class="pd-gap-current">${(g.currentLevel || g.current_level || 0).toFixed(1)}</span>
                          <span class="pd-gap-arrow">&rarr;</span>
                          <span class="pd-gap-expected">${(g.expectedLevel || g.expected_level || 0).toFixed(1)}</span>
                          ${g.intervention ? `<span class="pd-gap-intervention">${escapeHTML(g.intervention)}</span>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
                <button class="pd-view-resident-btn" data-user-id="${r.userId || r.user_id || r.id}">View Details</button>
              </div>
            `;
          }).join('')
        }
      </div>
    `;
  }

  function renderCohortStats() {
    const stats = cohortStats || {};
    const comparison = stats.comparison || {};
    const distributions = stats.distributions || {};

    return `
      <div class="pd-stats">
        <div class="pd-stats-section">
          <h4>Cohort Average vs Expected Progression</h4>
          <div class="pd-comparison-grid">
            ${DOMAINS.map((d, i) => {
              const avg = (comparison[d.code]?.average || 0);
              const exp = (comparison[d.code]?.expected || PGY_EXPECTED[2]);
              const pct = (avg / 5) * 100;
              const expPct = (exp / 5) * 100;
              return `
                <div class="pd-comparison-row">
                  <span class="pd-comp-label" style="color:${DOMAIN_COLORS[i]}">${d.code}</span>
                  <div class="pd-comp-bar-container">
                    <div class="pd-comp-bar-avg" style="width:${pct}%;background:${DOMAIN_COLORS[i]}"></div>
                    <div class="pd-comp-bar-expected" style="left:${expPct}%"></div>
                  </div>
                  <span class="pd-comp-values">${avg.toFixed(1)} / ${exp.toFixed(1)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pd-stats-section">
          <h4>Percentile Distribution</h4>
          <div class="pd-distribution-grid">
            ${DOMAINS.map((d, i) => {
              const dist = distributions[d.code] || {};
              const p25 = dist.p25 || 0;
              const p50 = dist.p50 || 0;
              const p75 = dist.p75 || 0;
              return `
                <div class="pd-dist-item">
                  <span class="pd-dist-label" style="color:${DOMAIN_COLORS[i]}">${d.code}</span>
                  <div class="pd-dist-values">
                    <span>25th: ${p25.toFixed(1)}</span>
                    <span>50th: ${p50.toFixed(1)}</span>
                    <span>75th: ${p75.toFixed(1)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        ${stats.trends ? `
          <div class="pd-stats-section">
            <h4>Trend Over Time</h4>
            <p class="pd-no-data">Trend data requires multiple cohort snapshots. Use "Generate Snapshot" to begin tracking.</p>
            <button class="pd-snapshot-btn" id="pdSnapshotBtn">Generate Snapshot</button>
          </div>
        ` : `
          <div class="pd-stats-section">
            <h4>Trend Over Time</h4>
            <p class="pd-no-data">Generate periodic snapshots to track cohort progression over time.</p>
            <button class="pd-snapshot-btn" id="pdSnapshotBtn">Generate Snapshot</button>
          </div>
        `}
      </div>
    `;
  }

  function attachEvents() {
    // Tab switching
    container.querySelectorAll('.pd-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        render();
      });
    });

    // Program selector
    const progSelect = container.querySelector('#pdProgramSelect');
    if (progSelect) {
      progSelect.addEventListener('change', async () => {
        programId = parseInt(progSelect.value);
        renderLoading();
        await loadDashboard();
      });
    }

    // Sort controls
    const sortSelect = container.querySelector('#pdSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => { sortField = sortSelect.value; render(); });
    }
    const sortDirBtn = container.querySelector('#pdSortDirBtn');
    if (sortDirBtn) {
      sortDirBtn.addEventListener('click', () => { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; render(); });
    }

    // Filter
    const filterSelect = container.querySelector('#pdFilterPGY');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => { filterPGY = filterSelect.value; render(); });
    }

    // Resident card clicks
    container.querySelectorAll('.pd-resident-card').forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.dataset.userId;
        openResidentDetail(userId);
      });
    });

    // View resident buttons (at-risk section)
    container.querySelectorAll('.pd-view-resident-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openResidentDetail(btn.dataset.userId);
      });
    });

    // Modal close
    const modalClose = container.querySelector('#pdModalClose');
    if (modalClose) {
      modalClose.addEventListener('click', () => { selectedResident = null; residentDetail = null; render(); });
    }
    const overlay = container.querySelector('#pdResidentModal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { selectedResident = null; residentDetail = null; render(); }
      });
    }

    // Assessment submit
    const assessBtn = container.querySelector('#pdAssessBtn');
    if (assessBtn) {
      assessBtn.addEventListener('click', submitAssessment);
    }

    // Faculty notes save on blur
    const notesEl = container.querySelector('#pdFacultyNotes');
    if (notesEl && selectedResident) {
      const userId = selectedResident.userId || selectedResident.user_id || selectedResident.id;
      notesEl.addEventListener('blur', () => { facultyNotes[userId] = notesEl.value; });
    }

    // CSV export
    const exportBtn = container.querySelector('#pdExportCSV');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCSV);
    }

    // Snapshot
    const snapshotBtn = container.querySelector('#pdSnapshotBtn');
    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', async () => {
        snapshotBtn.disabled = true;
        snapshotBtn.textContent = 'Generating...';
        try {
          await fetch(`${API}/programs/${programId}/cohort-snapshot`, { method: 'POST', credentials: 'include' });
          if (window.toast) window.toast('Snapshot generated', 'success');
        } catch (e) {
          if (window.toast) window.toast('Failed to generate snapshot', 'error');
        }
        snapshotBtn.disabled = false;
        snapshotBtn.textContent = 'Generate Snapshot';
      });
    }

    // Render radar chart in resident modal
    const radarEl = container.querySelector('#pdResidentRadar');
    if (radarEl && residentDetail && window.milestones) {
      const ms = residentDetail.milestones || [];
      const levels = DOMAINS.map(d => {
        const found = ms.filter(m => m.domain === d.code || (m.code && m.code.startsWith('DR-' + d.code)));
        return found.length > 0 ? found.reduce((s, f) => s + (f.level || 0), 0) / found.length : 0;
      });
      const pgy = selectedResident.pgyYear || selectedResident.pgy_year || 2;
      const expected = PGY_EXPECTED[pgy] || 2.5;
      window.milestones.renderRadarChart(radarEl, DOMAINS.map(d => d.code), levels, DOMAINS.map(() => expected));
    }
  }

  async function openResidentDetail(userId) {
    const residents = dashboardData?.residents || [];
    selectedResident = residents.find(r => String(r.userId || r.user_id || r.id) === String(userId));
    if (!selectedResident) return;

    try {
      residentDetail = await fetchJSON(`${API}/programs/${programId}/residents/${userId}`);
    } catch (e) {
      residentDetail = { milestones: [], activities: [], strengths: [], weaknesses: [] };
    }
    render();
  }

  async function submitAssessment() {
    if (!selectedResident) return;
    const milestoneEl = container.querySelector('#pdAssessMilestone');
    const levelEl = container.querySelector('#pdAssessLevel');
    const notesEl = container.querySelector('#pdAssessNotes');
    if (!milestoneEl || !milestoneEl.value) {
      if (window.toast) window.toast('Select a milestone first', 'error');
      return;
    }

    const userId = selectedResident.userId || selectedResident.user_id || selectedResident.id;
    try {
      await fetch(`${API}/milestones/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: userId,
          milestoneId: milestoneEl.value,
          level: parseFloat(levelEl.value),
          evidenceType: 'faculty_assessment',
          notes: notesEl.value
        })
      });
      if (window.toast) window.toast('Assessment submitted', 'success');
      notesEl.value = '';
      await openResidentDetail(userId);
    } catch (e) {
      if (window.toast) window.toast('Failed to submit assessment', 'error');
    }
  }

  function exportCSV() {
    const report = milestoneReport || {};
    const residents = report.residents || [];
    const msColumns = report.milestones || [];

    const headers = ['Resident', 'PGY', ...msColumns.map(m => m.code || '---')];
    const rows = residents.map(r => {
      const name = r.displayName || r.display_name || r.username || 'Unknown';
      const pgy = r.pgyYear || r.pgy_year || '';
      const levels = r.levels || {};
      return [name, pgy, ...msColumns.map(m => {
        const lv = levels[m.code] || levels[m.id] || '';
        return lv ? lv.toFixed(1) : '';
      })];
    });

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `milestone-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function countActive(residents) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return residents.filter(r => {
      const la = r.lastActive || r.last_active;
      return la && new Date(la).getTime() > weekAgo;
    }).length;
  }

  function isRecentlyActive(dateStr) {
    if (!dateStr) return false;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(dateStr).getTime() > weekAgo;
  }

  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return dateStr; }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.programDashboard = { init };
})();
