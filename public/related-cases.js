window.relatedCases = {
  container: null,
  caseId: null,
  related: [],
  patternGroups: [],

  init(containerEl, caseId) {
    this.container = containerEl;
    this.caseId = caseId;
    this.related = [];
    this.patternGroups = [];
    this.render();
    this.load();
  },

  async load() {
    try {
      const res = await fetch(`/api/patterns/cases/${this.caseId}/related`);
      const data = await res.json();
      this.related = data.related || [];
      this.patternGroups = data.patternGroups || [];
      this.renderContent();
    } catch (e) { console.error('Failed to load related cases:', e); }
  },

  render() {
    this.container.innerHTML = `
      <div class="related-cases-panel">
        <h4 class="related-cases-title">Related Cases</h4>
        <div class="related-cases-content" id="relatedCasesContent">
          <p class="text-muted">Loading...</p>
        </div>
        <div class="pattern-groups-links" id="patternGroupsLinks"></div>
      </div>
    `;
  },

  renderContent() {
    const content = this.container.querySelector('#relatedCasesContent');
    const groupLinks = this.container.querySelector('#patternGroupsLinks');

    if (this.related.length === 0 && this.patternGroups.length === 0) {
      content.innerHTML = '<p class="text-muted">No related cases found</p>';
      return;
    }

    if (this.related.length > 0) {
      content.innerHTML = `
        <div class="related-cases-strip">
          ${this.related.map(c => `
            <div class="related-case-card" onclick="viewCase('${c.id}')">
              ${c.thumbnail
                ? `<img class="related-case-thumb" src="/thumbnails/${c.thumbnail}" alt="${c.title}" onerror="this.style.display='none'">`
                : `<div class="related-case-thumb-placeholder">\u{1FA7B}</div>`
              }
              <div class="related-case-info">
                <span class="related-case-title">${c.title}</span>
                <span class="related-case-badge">${this.getRelationshipLabel(c.relationship_type)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      content.innerHTML = '<p class="text-muted">No directly related cases</p>';
    }

    if (this.patternGroups.length > 0) {
      groupLinks.innerHTML = `
        <div class="pattern-group-links">
          ${this.patternGroups.map(g => `
            <a href="#" class="pattern-group-link" onclick="relatedCases.viewPatternGroup('${g.id}'); return false;">
              View all in "${g.name}" \u2192
            </a>
          `).join('')}
        </div>
      `;
    }
  },

  getRelationshipLabel(type) {
    const labels = {
      similar: 'Similar',
      variant: 'Variant',
      compare_normal: 'Compare Normal',
      differential: 'Differential'
    };
    return labels[type] || type || 'Related';
  },

  async viewPatternGroup(groupId) {
    try {
      const res = await fetch(`/api/patterns/groups/${groupId}`);
      const data = await res.json();
      this.renderPatternGroup(data);
    } catch (e) { console.error('Failed to load pattern group:', e); }
  },

  renderPatternGroup(group) {
    const content = this.container.querySelector('#relatedCasesContent');
    if (!content) return;
    content.innerHTML = `
      <div class="pattern-group-view">
        <div class="pattern-group-header">
          <button class="btn btn-secondary btn-sm" onclick="relatedCases.renderContent()">\u2190 Back</button>
          <h4>${group.name}</h4>
          <p>${group.description || ''}</p>
        </div>
        <div class="pattern-group-cases">
          ${(group.cases || []).map(c => `
            <div class="related-case-card" onclick="viewCase('${c.id}')">
              ${c.thumbnail
                ? `<img class="related-case-thumb" src="/thumbnails/${c.thumbnail}" alt="${c.title}" onerror="this.style.display='none'">`
                : `<div class="related-case-thumb-placeholder">\u{1FA7B}</div>`
              }
              <div class="related-case-info">
                <span class="related-case-title">${c.title}</span>
                <span class="related-case-meta">${c.modality || ''} ${c.body_part || ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this.related = [];
    this.patternGroups = [];
  }
};
