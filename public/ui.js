// RadCase UI - DOM manipulation helpers, toast notifications, modal management
import { state } from './state.js';

// ============ Toast Notifications ============

export function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.innerHTML = `
    <span>${type === 'success' ? '\u2705' : '\u274C'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 3000);
}

// ============ Mobile Navigation ============

export function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.mobile-overlay');
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const isOpen = sidebar.classList.contains('open');

  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('aria-hidden', 'false');
    const firstNavItem = sidebar.querySelector('.nav-item');
    if (firstNavItem) firstNavItem.focus();
  }
}

export function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.mobile-overlay');
  const hamburgerBtn = document.querySelector('.hamburger-btn');

  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  sidebar.setAttribute('aria-hidden', 'true');

  if (window.innerWidth <= 1024) {
    hamburgerBtn.focus();
  }
}

export function handleMobileNavigation() {
  if (window.innerWidth <= 1024) {
    closeSidebar();
  }
}

// ============ Keyboard Navigation ============

export function handleKeyboardNavigation(event) {
  const { key, target } = event;

  if (key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay.active');
    if (openModal) { closeModal(); return; }
    const openAuthModal = document.querySelector('.auth-modal.active');
    if (openAuthModal) { closeAuthModal(); return; }
    const openAnnotationModal = document.querySelector('#annotationModal.active');
    if (openAnnotationModal) { closeAnnotationModal(); return; }
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('open')) { closeSidebar(); return; }
  }

  if (target.closest('.nav')) {
    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const currentIndex = navItems.indexOf(target);
    if (key === 'ArrowDown' && currentIndex < navItems.length - 1) {
      event.preventDefault();
      navItems[currentIndex + 1].focus();
    } else if (key === 'ArrowUp' && currentIndex > 0) {
      event.preventDefault();
      navItems[currentIndex - 1].focus();
    }
  }
}

// ============ Page Navigation ============

export function announcePageChange(pageName) {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = `Navigated to ${pageName} page`;
  document.body.appendChild(announcement);
  setTimeout(() => document.body.removeChild(announcement), 1000);
}

export function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById(`page-${page}`).style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.page === page) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  const pageNames = {
    library: 'Case Library',
    add: 'Add New Case',
    'case-builder': 'AI Case Builder',
    quiz: 'Quiz Mode',
    collections: 'Collections',
    analytics: 'Analytics',
    'oral-boards': 'Oral Board Prep'
  };
  announcePageChange(pageNames[page] || page);

  const pageElement = document.getElementById(`page-${page}`);
  const mainHeading = pageElement.querySelector('h2');
  if (mainHeading) {
    mainHeading.setAttribute('tabindex', '-1');
    mainHeading.focus();
  }
}

// ============ Auth UI ============

export function getAvatarEmoji(role) {
  const emojis = {
    'resident': '\uD83D\uDC68\u200D\u2695\uFE0F',
    'attending': '\uD83D\uDC69\u200D\u2695\uFE0F',
    'fellow': '\uD83E\uDDD1\u200D\u2695\uFE0F',
    'student': '\uD83D\uDCDA',
    'admin': '\u2699\uFE0F'
  };
  return emojis[role] || '\uD83D\uDC64';
}

export function updateAuthUI() {
  const authButtons = document.getElementById('authButtons');
  const userCard = document.getElementById('userCard');
  const progressCard = document.getElementById('progressCard');

  if (state.currentUser) {
    authButtons.style.display = 'none';
    userCard.style.display = 'flex';
    progressCard.style.display = 'block';
    document.getElementById('userName').textContent = state.currentUser.displayName || state.currentUser.username;
    document.getElementById('userRole').textContent = state.currentUser.role || 'resident';
    document.getElementById('userAvatar').textContent = getAvatarEmoji(state.currentUser.role);
  } else {
    authButtons.style.display = 'flex';
    userCard.style.display = 'none';
    progressCard.style.display = 'none';
  }
}

export function showAuthModal(tab = 'login') {
  document.getElementById('authModal').classList.add('active');
  document.getElementById('authError').classList.remove('show');
  switchAuthTab(tab);
}

export function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
  document.getElementById('authError').classList.remove('show');
}

export function switchAuthTab(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  tabs.forEach(t => t.classList.remove('active'));
  forms.forEach(f => f.classList.remove('active'));

  if (tab === 'login') {
    tabs[0].classList.add('active');
    document.getElementById('loginForm').classList.add('active');
  } else {
    tabs[1].classList.add('active');
    document.getElementById('registerForm').classList.add('active');
  }
  document.getElementById('authError').classList.remove('show');
}

export function showAuthError(message) {
  const errorEl = document.getElementById('authError');
  errorEl.textContent = message;
  errorEl.classList.add('show');
}

// ============ Modal Management ============

export function closeModal() {
  document.getElementById('caseModal').classList.remove('active');
  state.currentCase = null;

  // Close annotation modal if open
  document.getElementById('annotationModal')?.classList.remove('active');
  state.annotationCanvas = null;

  // Reset study session
  state.studySession = { caseId: null, currentStep: 0, startTime: null, differentialScore: null, completed: false };

  if (typeof voiceNarrator !== 'undefined') {
    voiceNarrator.stop();
    document.getElementById('voiceNarrateBtn').classList.remove('active');
  }

  if (state.dicomViewer) {
    state.dicomViewer.destroy();
    state.dicomViewer = null;
  }
  state.currentDicomSeries = [];

  document.getElementById('viewerTabs').style.display = 'none';
  switchViewerTab('images');
}

export function switchViewerTab(tab) {
  const imagePanel = document.getElementById('imageViewerPanel');
  const dicomPanel = document.getElementById('dicomViewerPanel');
  const tabBtns = document.querySelectorAll('.modal-tabs .tab-btn');

  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'dicom') {
    imagePanel.style.display = 'none';
    dicomPanel.style.display = 'block';

    if (!state.dicomViewer && state.currentDicomSeries.length > 0) {
      // Will be called via app.js initDicomViewer
      window.initDicomViewer();
      window.loadDicomSeriesById(state.currentDicomSeries[0].id);
    }
  } else {
    imagePanel.style.display = 'block';
    dicomPanel.style.display = 'none';
  }
}

export function selectImage(filename, thumb) {
  document.getElementById('modalMainImage').src = `/uploads/${filename}`;
  document.querySelectorAll('.case-thumbnail').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}

export function closeAnnotationModal() {
  document.getElementById('annotationModal').classList.remove('active');
  state.annotationCanvas = null;
}

// ============ Bookmark UI ============

export function updateModalBookmarkState(caseId) {
  if (!state.currentCase || state.currentCase.id !== caseId) return;
  const btn = document.getElementById('modalBookmarkBtn');
  if (!btn) return;
  const isBookmarked = state.bookmarkedCaseIds.has(caseId);
  btn.classList.toggle('bookmarked', isBookmarked);
  document.getElementById('modalBookmarkLabel').textContent =
    isBookmarked ? 'Bookmarked' : 'Bookmark';
}

// ============ Render Helpers ============

export function renderCases(cases) {
  const grid = document.getElementById('caseGrid');

  if (cases.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="icon">\uD83D\uDCC2</div>
        <h3>No cases found</h3>
        <p>Add your first case to get started!</p>
        <button class="btn btn-primary" onclick="showPage('add'); document.querySelector('[data-page=add]').click();">
          \u2795 Add Case
        </button>
      </div>
    `;
    return;
  }

  state.caseIds = cases.map(c => c.id);
  grid.innerHTML = cases.map(c => `
    <div class="case-card" data-case-id="${c.id}" onclick="viewCase('${c.id}')">
      <button class="bookmark-btn ${state.bookmarkedCaseIds.has(c.id) ? 'bookmarked' : ''}"
              onclick="event.stopPropagation(); toggleBookmark('${c.id}', this)"
              aria-label="${state.bookmarkedCaseIds.has(c.id) ? 'Remove bookmark' : 'Bookmark this case'}"
              title="${state.bookmarkedCaseIds.has(c.id) ? 'Remove bookmark' : 'Bookmark'}">
        <svg viewBox="0 0 24 24"><path class="heart-outline" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
      <button class="offline-download-btn"
              onclick="event.stopPropagation(); pwaManager.toggleOfflineCase('${c.id}', event)"
              aria-label="Save for offline"
              title="Save for offline">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
      </button>
      ${c.thumbnail
        ? `<img class="case-image" src="/thumbnails/${c.thumbnail}" alt="${c.title}" onerror="this.outerHTML='<div class=\\'case-image-placeholder\\'>\\uD83E\\uDE7B</div>'">`
        : `<div class="case-image-placeholder">\uD83E\uDE7B</div>`
      }
      <div class="case-content">
        <h3 class="case-title">${c.title}</h3>
        <div class="case-meta">
          ${c.modality ? `<span class="badge badge-modality">${c.modality}</span>` : ''}
          ${c.body_part ? `<span class="badge badge-bodypart">${c.body_part}</span>` : ''}
        </div>
        <div class="difficulty">
          ${[1,2,3,4,5].map(i => `<div class="difficulty-dot ${i <= c.difficulty ? 'active' : ''}"></div>`).join('')}
        </div>
      </div>
    </div>
  `).join('');

  // Update offline indicators for visible cards
  if (window.pwaManager) {
    pwaManager.getOfflineCaseIds().then(offlineIds => {
      for (const id of offlineIds) {
        pwaManager.updateOfflineIndicator(id, true);
      }
    });
  }
}

// ============ Preferences UI ============

export function loadPreferences() {
  let prefs;
  try {
    const stored = localStorage.getItem('radcase-preferences');
    prefs = stored ? JSON.parse(stored) : { viewMode: 'grid', fontSize: 'medium', annotationColor: '#ff3b30', theme: 'dark' };
  } catch (e) {
    prefs = { viewMode: 'grid', fontSize: 'medium', annotationColor: '#ff3b30', theme: 'dark' };
  }
  applyPreferences(prefs);
  return prefs;
}

export function applyPreferences(prefs) {
  const html = document.documentElement;
  html.classList.remove('font-small', 'font-medium', 'font-large');
  html.classList.add('font-' + (prefs.fontSize || 'medium'));

  const grid = document.getElementById('caseGrid');
  if (grid) {
    grid.classList.remove('view-list');
    if (prefs.viewMode === 'list') grid.classList.add('view-list');
  }

  window.radcaseAnnotationColor = prefs.annotationColor || '#ff3b30';
  html.setAttribute('data-theme', prefs.theme || 'dark');

  const viewSelect = document.getElementById('prefViewMode');
  const fontSelect = document.getElementById('prefFontSize');
  const themeSelect = document.getElementById('prefTheme');

  if (viewSelect) viewSelect.value = prefs.viewMode || 'grid';
  if (fontSelect) fontSelect.value = prefs.fontSize || 'medium';
  if (themeSelect) themeSelect.value = prefs.theme || 'dark';

  const swatches = document.querySelectorAll('.pref-color-swatch');
  swatches.forEach(s => {
    s.classList.toggle('selected', s.dataset.color === (prefs.annotationColor || '#ff3b30'));
  });
}

export function getPreferencesFromModal() {
  const selectedSwatch = document.querySelector('.pref-color-swatch.selected');
  return {
    viewMode: document.getElementById('prefViewMode').value,
    fontSize: document.getElementById('prefFontSize').value,
    annotationColor: selectedSwatch ? selectedSwatch.dataset.color : '#ff3b30',
    theme: document.getElementById('prefTheme').value
  };
}

export function savePreferences(prefs) {
  localStorage.setItem('radcase-preferences', JSON.stringify(prefs));
  applyPreferences(prefs);
  if (window.syncManager && typeof window.syncManager.syncPreferences === 'function') {
    window.syncManager.syncPreferences(prefs);
  }
}

export function savePreferencesAndClose() {
  const prefs = getPreferencesFromModal();
  savePreferences(prefs);
  closePreferencesModal();
  toast('Preferences saved', 'success');
}

export function resetPreferences() {
  savePreferences({ viewMode: 'grid', fontSize: 'medium', annotationColor: '#ff3b30', theme: 'dark' });
  toast('Preferences reset to defaults', 'info');
}

export function openPreferencesModal() {
  const prefs = loadPreferences();
  applyPreferences(prefs);
  document.getElementById('preferencesOverlay').classList.add('active');
}

export function closePreferencesModal() {
  document.getElementById('preferencesOverlay').classList.remove('active');
}
