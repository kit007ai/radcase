window.collectionsManager = {
  collections: [],
  currentCollection: null,
  activeTab: 'my', // 'my', 'curated', 'shared'

  async init() {
    if (!window.radcaseState?.currentUser) {
      this.activeTab = 'curated';
    }
    this.render();
    await this.loadCollections();
  },

  render() {
    const page = document.getElementById('collectionsContent');
    if (!page) return;
    page.innerHTML = `
      <div class="collections-tabs">
        <button class="collections-tab active" data-tab="my" onclick="collectionsManager.switchTab('my')">My Collections</button>
        <button class="collections-tab" data-tab="curated" onclick="collectionsManager.switchTab('curated')">Curated</button>
        <button class="collections-tab" data-tab="shared" onclick="collectionsManager.switchTab('shared')">Shared</button>
      </div>
      <div class="collections-actions">
        <button class="btn btn-primary btn-sm" onclick="collectionsManager.showCreateModal()">+ Create Collection</button>
      </div>
      <div class="collections-grid" id="collectionsGrid"></div>
    `;
  },

  async loadCollections() {
    try {
      const isAuthed = !!(window.radcaseState?.currentUser);
      let url;
      if (this.activeTab === 'curated' || this.activeTab === 'shared') {
        url = '/api/collections/public';
      } else if (isAuthed) {
        url = '/api/collections';
      } else {
        // Not authenticated - show sign-in prompt for My Collections
        this.collections = [];
        this.renderAuthPrompt();
        return;
      }
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 401) {
        this.collections = [];
        this.renderAuthPrompt();
        return;
      }
      const data = await res.json();
      this.collections = data.collections || [];
      this.renderGrid();
    } catch (e) {
      console.error('Failed to load collections:', e);
      this.collections = [];
      this.renderGrid();
    }
  },

  renderAuthPrompt() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;text-align:center;padding:2rem;grid-column:1/-1;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="margin-bottom:0.75rem;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <h3 style="color:#e2e8f0;margin:0 0 0.5rem;">Sign In Required</h3>
        <p style="color:#94a3b8;margin:0 0 1rem;">Sign in to create and manage your personal collections.</p>
        <button onclick="window.showAuthModal && showAuthModal()" style="background:#6366f1;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:0.5rem;cursor:pointer;font-size:0.9rem;">Sign In</button>
      </div>`;
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.collections-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab)
    );
    this.loadCollections();
  },

  renderGrid() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;

    let filtered = this.collections;
    if (this.activeTab === 'my') {
      filtered = this.collections.filter(c => c.collection_type === 'custom' || c.created_by_me);
    } else if (this.activeTab === 'curated') {
      filtered = this.collections.filter(c => c.collection_type === 'curated' || c.visibility === 'public');
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>No collections yet</h3><p>${this.activeTab === 'my' ? 'Create your first collection to organize cases!' : 'No collections available.'}</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(c => `
      <div class="collection-card" onclick="collectionsManager.viewCollection('${c.id}')">
        ${c.cover_image ? `<img class="collection-cover" src="/thumbnails/${c.cover_image}" alt="${c.name}" onerror="this.style.display='none'">` : `<div class="collection-cover-placeholder">📚</div>`}
        <div class="collection-info">
          <h3 class="collection-name">${c.name}</h3>
          <p class="collection-desc">${c.description || ''}</p>
          <div class="collection-meta">
            <span>${c.case_count || 0} cases</span>
            ${c.progress !== undefined ? `<div class="collection-progress-bar"><div class="collection-progress-fill" style="width:${c.progress}%"></div></div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  },

  async viewCollection(id) {
    try {
      const res = await fetch(`/api/collections/${id}`, { credentials: 'include' });
      const data = await res.json();
      this.currentCollection = data;
      this.renderCollectionDetail(data);
    } catch (e) { console.error('Failed to load collection:', e); }
  },

  renderCollectionDetail(collection) {
    const page = document.getElementById('collectionsContent');
    if (!page) return;

    const cases = collection.cases || [];
    const completedCount = cases.filter(c => c.completed).length;
    const progress = cases.length > 0 ? Math.round((completedCount / cases.length) * 100) : 0;

    page.innerHTML = `
      <div class="collection-detail">
        <div class="collection-detail-header">
          <button class="btn btn-secondary btn-sm" onclick="collectionsManager.init()">← Back</button>
          <h2>${collection.name}</h2>
          <p>${collection.description || ''}</p>
          <div class="collection-detail-meta">
            <span>${cases.length} cases</span>
            <span>${completedCount} completed</span>
            <div class="collection-progress-bar"><div class="collection-progress-fill" style="width:${progress}%"></div></div>
            <span>${progress}%</span>
          </div>
          <div class="collection-detail-actions">
            ${collection.share_code ? `<button class="btn btn-secondary btn-sm" onclick="collectionsManager.copyShareLink('${collection.share_code}')">Share</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="collectionsManager.continueCollection('${collection.id}')">Continue</button>
          </div>
        </div>
        <div class="collection-cases-list">
          ${cases.map((c, i) => `
            <div class="collection-case-item ${c.completed ? 'completed' : ''}" onclick="viewCase('${c.id}')">
              <span class="collection-case-num">${i + 1}</span>
              ${c.thumbnail ? `<img class="collection-case-thumb" src="/thumbnails/${c.thumbnail}" alt="" onerror="this.style.display='none'">` : ''}
              <div class="collection-case-info">
                <span class="collection-case-title">${c.title}</span>
                <span class="collection-case-meta">${c.modality || ''} · Difficulty ${c.difficulty || '-'}</span>
              </div>
              ${c.completed ? '<span class="collection-case-check">✓</span>' : ''}
              ${c.score !== undefined && c.score !== null ? `<span class="collection-case-score">${Math.round(c.score * 100)}%</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  async continueCollection(collectionId) {
    if (!this.currentCollection) return;
    const cases = this.currentCollection.cases || [];
    const next = cases.find(c => !c.completed);
    if (next) {
      if (window.viewCase) viewCase(next.id);
    } else {
      if (window.toast) toast('All cases completed!', 'success');
    }
  },

  showCreateModal() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;
    const form = document.createElement('div');
    form.className = 'collection-create-form';
    form.innerHTML = `
      <h3>Create Collection</h3>
      <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="newCollectionName" required></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="newCollectionDesc" rows="2"></textarea></div>
      <div class="form-group"><label class="form-label">Visibility</label><select class="form-select" id="newCollectionVis"><option value="private">Private</option><option value="public">Public</option></select></div>
      <div class="form-actions">
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.collection-create-form').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="collectionsManager.createCollection()">Create</button>
      </div>
    `;
    grid.prepend(form);
  },

  async createCollection() {
    const name = document.getElementById('newCollectionName')?.value?.trim();
    const description = document.getElementById('newCollectionDesc')?.value?.trim();
    const visibility = document.getElementById('newCollectionVis')?.value;
    if (!name) return;
    try {
      await fetch('/api/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, description, visibility })
      });
      if (window.toast) toast('Collection created!', 'success');
      this.loadCollections();
    } catch (e) { console.error('Failed to create collection:', e); }
  },

  async addCaseToCollection(collectionId, caseId) {
    try {
      await fetch(`/api/collections/${collectionId}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ case_id: caseId })
      });
      if (window.toast) toast('Case added to collection', 'success');
    } catch (e) { console.error('Failed to add case:', e); }
  },

  copyShareLink(code) {
    const url = `${window.location.origin}/api/collections/share/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      if (window.toast) toast('Share link copied!', 'success');
    });
  },

  // Show "Add to Collection" picker
  async showAddToCollectionPicker(caseId) {
    try {
      const res = await fetch('/api/collections', { credentials: 'include' });
      const data = await res.json();
      const collections = (data.collections || []).filter(c => c.collection_type === 'custom' || c.created_by_me);

      // Create a small modal/dropdown
      const existing = document.getElementById('addToCollectionPicker');
      if (existing) existing.remove();

      const picker = document.createElement('div');
      picker.id = 'addToCollectionPicker';
      picker.className = 'add-to-collection-picker';
      picker.innerHTML = `
        <h4>Add to Collection</h4>
        ${collections.length > 0 ? collections.map(c => `
          <button class="add-to-collection-item" onclick="collectionsManager.addCaseToCollection('${c.id}', '${caseId}'); document.getElementById('addToCollectionPicker').remove();">
            ${c.name} (${c.case_count || 0} cases)
          </button>
        `).join('') : '<p class="text-muted">No collections. Create one first!</p>'}
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('addToCollectionPicker').remove()">Cancel</button>
      `;
      document.body.appendChild(picker);
    } catch (e) { console.error('Failed to load collections for picker:', e); }
  }
};
