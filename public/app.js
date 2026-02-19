// RadCase Main Application - Initialization, Router, View Manager
import { state } from './state.js';
import * as api from './api.js';
import {
  toast, toggleSidebar, closeSidebar, handleMobileNavigation,
  handleKeyboardNavigation, showPage, updateAuthUI, showAuthModal,
  closeAuthModal, switchAuthTab, showAuthError, closeModal,
  switchViewerTab, selectImage, closeAnnotationModal,
  updateModalBookmarkState, renderCases, loadPreferences,
  applyPreferences, savePreferences, getPreferencesFromModal,
  savePreferencesAndClose, resetPreferences, openPreferencesModal,
  closePreferencesModal
} from './ui.js';
import * as apiModule from './api.js';

// ============ Expose Functions to Global Scope for Inline Event Handlers ============

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.showPage = showPage;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.closeModal = closeModal;
window.switchViewerTab = switchViewerTab;
window.selectImage = selectImage;
window.closeAnnotationModal = closeAnnotationModal;
window.openPreferencesModal = openPreferencesModal;
window.closePreferencesModal = closePreferencesModal;
window.savePreferencesAndClose = savePreferencesAndClose;
window.resetPreferences = resetPreferences;
window.toast = toast;
window.radcaseState = state;

// ============ Authentication ============

async function initAuth() {
  const user = await api.checkAuth();
  updateAuthUI();
  if (user) {
    state.traineeLevel = user.traineeLevel || 'resident';
    localStorage.setItem('radcase-trainee-level', state.traineeLevel);
    // Update preferences dropdown if visible
    const prefLevel = document.getElementById('prefTraineeLevel');
    if (prefLevel) prefLevel.value = state.traineeLevel;
    loadUserProgress();
    await loadBookmarks();
    loadCases();
    if (window.syncManager) {
      window.syncManager._checkAuthAndConnect();
    }
  }
}

async function loadUserProgress() {
  if (!state.currentUser) return;
  try {
    const { progress, due } = await api.fetchUserProgress();
    if (progress) {
      document.getElementById('statStudied').textContent = progress.uniqueCases || 0;
      document.getElementById('statMastered').textContent = progress.masteredCases || 0;
    }
    if (due) {
      const dueCount = due.totalDue || 0;
      document.getElementById('statDue').textContent = dueCount;
      document.getElementById('statDue').style.color = dueCount > 0 ? 'var(--warning)' : 'inherit';
    }
  } catch (err) {
    console.error('Failed to load user progress:', err);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const user = await api.loginUser(form.username.value, form.password.value);
    updateAuthUI();
    closeAuthModal();
    toast(`Welcome back, ${user.displayName || user.username}!`, 'success');
    loadUserProgress();
    loadStats();
    loadAnalytics();
    if (window.syncManager) {
      window.syncManager.disconnect();
      window.syncManager._checkAuthAndConnect();
    }
  } catch (err) {
    showAuthError(err.message || 'Connection failed. Please try again.');
  }
}
window.handleLogin = handleLogin;

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const traineeLevel = form.traineeLevel?.value || 'resident';
    const user = await api.registerUser(
      form.username.value, form.displayName.value,
      form.email.value, form.password.value, traineeLevel
    );
    updateAuthUI();
    closeAuthModal();
    toast(`Welcome to RadCase, ${user.displayName || user.username}!`, 'success');
    loadUserProgress();
    if (window.syncManager) {
      window.syncManager.disconnect();
      window.syncManager._checkAuthAndConnect();
    }
  } catch (err) {
    showAuthError(err.message || 'Connection failed. Please try again.');
  }
}
window.handleRegister = handleRegister;

async function logout() {
  try {
    await api.logoutUser();
    updateAuthUI();
    toast('Signed out', 'success');
    loadStats();
    loadAnalytics();
    if (window.syncManager) window.syncManager.disconnect();
  } catch (err) {
    console.error('Logout failed:', err);
  }
}
window.logout = logout;

// ============ Cases ============

async function loadCases() {
  const search = document.getElementById('searchInput').value;
  const modality = document.getElementById('filterModality').value;
  const body_part = document.getElementById('filterBodyPart').value;
  const difficulty = document.getElementById('filterDifficulty').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (modality) params.append('modality', modality);
  if (body_part) params.append('body_part', body_part);
  if (difficulty) params.append('difficulty', difficulty);

  // Show loading state
  document.getElementById('caseGrid').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p style="color: var(--text-secondary); margin-top: 1rem;">Loading cases...</p></div>';

  try {
    let cases = await api.fetchCases(params);
    if (state.bookmarkFilterActive && state.bookmarkedCaseIds.size > 0) {
      cases = cases.filter(c => state.bookmarkedCaseIds.has(c.id));
    } else if (state.bookmarkFilterActive) {
      cases = [];
    }
    renderCases(cases);
  } catch (err) {
    console.error('Failed to load cases:', err);
    document.getElementById('caseGrid').innerHTML = '<div class="loading-state"><p style="color: var(--text-secondary);">Failed to load cases. Please try again.</p></div>';
  }
}
window.loadCases = loadCases;

async function viewCase(id) {
  // Show loading in modal body
  const modalBody = document.querySelector('#caseModal .modal-body');
  if (modalBody && !document.getElementById('caseModal').classList.contains('active')) {
    document.getElementById('modalTitle').textContent = 'Loading...';
  }
  const caseModalEl = document.getElementById('caseModal');
  caseModalEl.classList.add('active');
  if (window.focusTrap) focusTrap.activate(caseModalEl);

  try {
    if (state.dicomViewer) {
      state.dicomViewer.destroy();
      state.dicomViewer = null;
    }
    state.currentDicomSeries = [];

    state.currentCaseIndex = state.caseIds.indexOf(id);
    const caseData = await api.fetchCase(id);
    state.currentCase = caseData;

    // Update case position indicator
    const indicator = document.getElementById('casePositionIndicator');
    const caseCountPrefix = state.caseIds.length > 1 ? `${state.currentCaseIndex + 1}/${state.caseIds.length}` : '';
    if (indicator && state.caseIds.length > 1) {
      indicator.textContent = caseCountPrefix;
      indicator.style.display = '';
    } else if (indicator) {
      indicator.style.display = 'none';
    }

    // Reset study mode UI
    const studyIndicator = document.getElementById('studyStepIndicator');
    const diffArea = document.getElementById('differentialInputArea');
    const levelNotesSection = document.getElementById('levelNotesSection');
    const imageWrap = document.getElementById('caseViewerImageWrap');
    if (diffArea) diffArea.style.display = 'none';
    if (levelNotesSection) levelNotesSection.style.display = 'none';
    if (imageWrap) imageWrap.classList.remove('study-blurred');

    // Mode toggle UI
    const modeSwitch = document.getElementById('viewerModeSwitch');
    if (modeSwitch) {
      modeSwitch.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.viewerMode);
      });
    }

    // If study mode, use study-view endpoint
    if (state.viewerMode === 'study') {
      studyIndicator.style.display = 'flex';
      state.studySession = { caseId: id, currentStep: 0, startTime: Date.now(), differentialScore: null, completed: false };
      updateStudyStepIndicator(0);

      document.getElementById('modalTitle').textContent = (caseCountPrefix ? caseCountPrefix + '  ' : '') + caseData.title;
      document.getElementById('modalHistory').textContent = caseData.clinical_history || '-';
      document.getElementById('modalDiagnosis').textContent = '[ Complete previous steps to reveal ]';
      document.getElementById('modalFindings').textContent = '[ Complete previous steps to reveal ]';
      document.getElementById('modalTeaching').textContent = '[ Complete previous steps to reveal ]';

      // Blur images initially
      if (imageWrap) imageWrap.classList.add('study-blurred');

      // Show advance button
      showStudyAdvanceButton();
    } else {
      studyIndicator.style.display = 'none';
      document.getElementById('modalTitle').textContent = (caseCountPrefix ? caseCountPrefix + '  ' : '') + caseData.title;
      document.getElementById('modalHistory').textContent = caseData.clinical_history || '-';
      document.getElementById('modalDiagnosis').textContent = caseData.diagnosis || '-';
      document.getElementById('modalFindings').textContent = caseData.findings || '-';
      document.getElementById('modalTeaching').textContent = caseData.teaching_points || '-';
    }

    const meta = document.getElementById('modalMeta');
    meta.innerHTML = `
      ${caseData.modality ? `<span class="badge badge-modality">${caseData.modality}</span>` : ''}
      ${caseData.body_part ? `<span class="badge badge-bodypart">${caseData.body_part}</span>` : ''}
      ${caseData.category ? `<span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;">${caseData.category}</span>` : ''}
      <div class="difficulty">
        ${[1,2,3,4,5].map(i => `<div class="difficulty-dot ${i <= caseData.difficulty ? 'active' : ''}"></div>`).join('')}
      </div>
    `;

    const mainImg = document.getElementById('modalMainImage');
    const thumbs = document.getElementById('modalThumbnails');

    if (caseData.images && caseData.images.length > 0) {
      mainImg.src = `/uploads/${caseData.images[0].filename}`;
      mainImg.onerror = function() { this.style.display = 'none'; };
      thumbs.innerHTML = caseData.images.map((img, i) => `
        <div class="case-thumbnail ${i === 0 ? 'active' : ''}" onclick="selectImage('${img.filename}', this)">
          <img src="/thumbnails/${img.filename}" alt="Thumbnail" onerror="this.style.display='none'">
        </div>
      `).join('');
    } else {
      mainImg.src = '';
      thumbs.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">No images</p>';
    }

    document.getElementById('dicomViewerContainer').innerHTML = '';
    switchViewerTab('images');
    await loadDicomSeries(id);
    document.getElementById('dicomFileInput').onchange = handleDicomFiles;
    document.getElementById('dicomFolderInput').onchange = handleDicomFiles;
    updateModalBookmarkState(id);

    // Initialize new panels (reference mode shows them immediately)
    if (state.viewerMode === 'reference') {
      initCasePanels(id);
    }

    const caseModalEl2 = document.getElementById('caseModal');
    caseModalEl2.classList.add('active');
    if (window.focusTrap) focusTrap.activate(caseModalEl2);
  } catch (err) {
    toast('Failed to load case', 'error');
  }
}
window.viewCase = viewCase;

// ============ Study Mode Helpers ============

function updateStudyStepIndicator(step) {
  document.querySelectorAll('.study-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('completed', s < step);
  });
}

function showStudyAdvanceButton() {
  const step = state.studySession.currentStep;
  const labels = ['View Images', 'Build Your Differential', 'Submit & Reveal Answer', 'View Teaching Points', 'Complete'];
  const existing = document.querySelector('.study-advance-btn');
  if (existing) existing.remove();

  if (step >= 4) return; // All done

  const btn = document.createElement('button');
  btn.className = 'study-advance-btn';
  btn.textContent = labels[step] + ' \u2192';
  btn.onclick = advanceStudyStep;

  const details = document.querySelector('.case-details');
  if (details) details.appendChild(btn);
}

async function advanceStudyStep() {
  if (!state.studySession || !state.currentCase) return;
  const step = state.studySession.currentStep;
  const caseId = state.currentCase.id;

  if (step === 0) {
    // Reveal images
    const imageWrap = document.getElementById('caseViewerImageWrap');
    if (imageWrap) imageWrap.classList.remove('study-blurred');
    state.studySession.currentStep = 1;
    updateStudyStepIndicator(1);
    showStudyAdvanceButton();
  } else if (step === 1) {
    // Show differential input
    const diffArea = document.getElementById('differentialInputArea');
    if (diffArea) {
      diffArea.style.display = 'block';
      const traineeLevel = state.traineeLevel || 'resident';
      if (window.differentialInput) {
        window.differentialInput.init(diffArea, {
          maxEntries: traineeLevel === 'student' ? 3 : 5,
          hint: traineeLevel === 'student' ? 'List up to 3 most likely diagnoses' : '',
          onSubmit: async (diffs) => {
            await submitStudyDifferential(diffs);
          }
        });
      }
    }
    state.studySession.currentStep = 2;
    updateStudyStepIndicator(2);
    showStudyAdvanceButton();
  } else if (step === 2) {
    // Submit differential and reveal
    const diffs = window.differentialInput?.differentials || [];
    if (diffs.length > 0) {
      await submitStudyDifferential(diffs);
    } else {
      // Skip differential, just reveal
      await revealDiagnosis();
    }
  } else if (step === 3) {
    // Show teaching points
    try {
      const data = await apiModule.revealStep(caseId, 'teaching_points');
      document.getElementById('modalTeaching').textContent = data.teaching_points || state.currentCase.teaching_points || '-';
    } catch (e) {
      document.getElementById('modalTeaching').textContent = state.currentCase.teaching_points || '-';
    }
    // Init panels
    initCasePanels(caseId);
    state.studySession.currentStep = 4;
    state.studySession.completed = true;
    updateStudyStepIndicator(4);
    showStudyAdvanceButton();
  }
}

async function submitStudyDifferential(diffs) {
  const caseId = state.currentCase.id;
  const timeSpent = Date.now() - (state.studySession.startTime || Date.now());
  try {
    const result = await apiModule.submitDifferentialAttempt(caseId, diffs, timeSpent);
    state.studySession.differentialScore = result;
    if (window.differentialInput) {
      window.differentialInput.showResults(result);
    }
  } catch (e) {
    console.error('Differential scoring failed:', e);
  }
  await revealDiagnosis();
}

async function revealDiagnosis() {
  const caseId = state.currentCase.id;
  try {
    const diagData = await apiModule.revealStep(caseId, 'diagnosis');
    const diagEl = document.getElementById('modalDiagnosis');
    // Typewriter effect
    const text = diagData.diagnosis || state.currentCase.diagnosis || '-';
    typewriterReveal(diagEl, text);

    const findingsData = await apiModule.revealStep(caseId, 'findings');
    document.getElementById('modalFindings').textContent = findingsData.findings || state.currentCase.findings || '-';
  } catch (e) {
    document.getElementById('modalDiagnosis').textContent = state.currentCase.diagnosis || '-';
    document.getElementById('modalFindings').textContent = state.currentCase.findings || '-';
  }

  // Show key findings overlay
  if (window.keyFindingsOverlay) {
    const container = document.getElementById('caseViewerImageWrap');
    if (container) {
      keyFindingsOverlay.init(container);
      keyFindingsOverlay.loadFindings(caseId);
    }
  }

  state.studySession.currentStep = 3;
  updateStudyStepIndicator(3);
  showStudyAdvanceButton();
}

function typewriterReveal(element, text) {
  element.textContent = '';
  element.classList.add('typewriter-text');
  let i = 0;
  const interval = setInterval(() => {
    element.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      element.classList.remove('typewriter-text');
      element.classList.add('typewriter-text', 'done');
    }
  }, 30);
}

function initCasePanels(caseId) {
  // Key findings overlay (reference mode)
  if (window.keyFindingsOverlay && state.viewerMode === 'reference') {
    const container = document.getElementById('caseViewerImageWrap');
    if (container) {
      keyFindingsOverlay.init(container);
      keyFindingsOverlay.loadFindings(caseId);
    }
  }

  // Related cases
  const relatedArea = document.getElementById('relatedCasesArea');
  if (relatedArea && window.relatedCases) {
    relatedCases.init(relatedArea, caseId);
  }

  // Discussion panel
  const discArea = document.getElementById('discussionArea');
  if (discArea && window.discussionPanel) {
    discussionPanel.init(discArea, caseId);
  }

  // Level-adapted notes
  showLevelNotes();
}

function showLevelNotes() {
  const section = document.getElementById('levelNotesSection');
  const callout = document.getElementById('levelNotesCallout');
  if (!section || !callout || !state.currentCase) return;

  const level = state.traineeLevel || 'resident';
  if (level === 'student' && state.currentCase.student_notes) {
    callout.className = 'level-notes-callout student';
    callout.textContent = state.currentCase.student_notes;
    section.style.display = 'block';
  } else if ((level === 'fellow' || level === 'attending') && state.currentCase.fellow_notes) {
    callout.className = 'level-notes-callout fellow';
    callout.textContent = state.currentCase.fellow_notes;
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

// Mode toggle
function toggleViewerMode(mode) {
  state.viewerMode = mode;
  // Update the new .viewer-mode-switch buttons
  const modeSwitch = document.getElementById('viewerModeSwitch');
  if (modeSwitch) {
    modeSwitch.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }
  // Show/hide step indicator based on mode
  const studyIndicator = document.getElementById('studyStepIndicator');
  if (studyIndicator) {
    studyIndicator.style.display = mode === 'study' ? 'flex' : 'none';
  }
  // Re-open current case in new mode
  if (state.currentCase) {
    viewCase(state.currentCase.id);
  }
}
window.toggleViewerMode = toggleViewerMode;

// Trainee level selector (registration form)
function selectTraineeLevel(btn) {
  btn.closest('.trainee-level-selector').querySelectorAll('.trainee-level-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const hidden = btn.closest('.form-group').querySelector('input[name="traineeLevel"]');
  if (hidden) hidden.value = btn.dataset.level;
}
window.selectTraineeLevel = selectTraineeLevel;

function navigateCase(dir) {
  if (state.caseIds.length === 0 || state.currentCaseIndex < 0) return;
  const next = state.currentCaseIndex + dir;
  if (next < 0 || next >= state.caseIds.length) return;
  state.currentCaseIndex = next;
  viewCase(state.caseIds[next]);
}
window.navigateCase = navigateCase;

// ============ DICOM ============

async function loadDicomSeries(caseId) {
  try {
    state.currentDicomSeries = await api.fetchDicomSeries(caseId);
    const viewerTabs = document.getElementById('viewerTabs');
    const seriesSelector = document.getElementById('dicomSeriesSelector');

    if (state.currentDicomSeries.length > 0) {
      viewerTabs.style.display = 'flex';
      seriesSelector.innerHTML = state.currentDicomSeries.map((s, i) => `
        <button class="dicom-series-btn ${i === 0 ? 'active' : ''}"
                onclick="loadDicomSeriesById('${s.id}', this)"
                data-series-id="${s.id}">
          <span class="series-modality">${s.modality || 'DICOM'}</span>
          <span class="series-desc">${s.series_description || 'Series ' + (i + 1)}</span>
          <span class="series-count">${s.num_images} images</span>
        </button>
      `).join('');
    } else {
      viewerTabs.style.display = 'none';
      seriesSelector.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No DICOM series uploaded</p>';
    }
  } catch (err) {
    console.error('Failed to load DICOM series:', err);
    state.currentDicomSeries = [];
  }
}

function initDicomViewer() {
  if (state.dicomViewer) state.dicomViewer.destroy();
  state.dicomViewer = new DicomViewer('dicomViewerContainer');
  state.dicomViewer.init();

  // Wire annotate/undo/redo callbacks to annotation system
  state.dicomViewer.onAnnotateToggle = function(active) {
    if (active) {
      annotateCase();
    }
  };
  state.dicomViewer.onUndo = function() {
    if (state.annotationCanvas) state.annotationCanvas.undo();
  };
  state.dicomViewer.onRedo = function() {
    if (state.annotationCanvas) state.annotationCanvas.redo();
  };

  // Attach touch gestures after DICOM viewer initializes
  if (state.dicomViewer && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    if (state.touchGestureHandler) state.touchGestureHandler.destroy();
    if (typeof integrateTouchGestures === 'function') {
      state.touchGestureHandler = integrateTouchGestures(state.dicomViewer);
    }
  }
}
window.initDicomViewer = initDicomViewer;

async function loadDicomSeriesById(seriesId, btn) {
  if (!state.dicomViewer) initDicomViewer();
  if (btn) {
    document.querySelectorAll('.dicom-series-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  try {
    const data = await api.fetchDicomSeriesData(seriesId);
    if (data.imageIds && data.imageIds.length > 0) {
      await state.dicomViewer.loadImageIds(data.imageIds, {
        patientName: data.patient_name,
        modality: data.modality,
        seriesDescription: data.series_description,
        windowCenter: data.window_center,
        windowWidth: data.window_width
      });
    }
  } catch (err) {
    console.error('Failed to load DICOM series:', err);
    toast('Failed to load DICOM series', 'error');
  }
}
window.loadDicomSeriesById = loadDicomSeriesById;

function handleDicomFiles(e) {
  const files = e.target.files;
  const count = files.length;
  document.getElementById('dicomFileCount').textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
  document.getElementById('uploadDicomBtn').style.display = count > 0 ? 'inline-flex' : 'none';
}

async function uploadDicomFiles() {
  if (!state.currentCase) return;
  const fileInput = document.getElementById('dicomFileInput');
  const folderInput = document.getElementById('dicomFolderInput');
  const files = fileInput.files.length > 0 ? fileInput.files : folderInput.files;

  if (files.length === 0) { toast('No files selected', 'error'); return; }

  try {
    toast('Uploading DICOM files...', 'info');
    const data = await api.uploadDicomFilesApi(state.currentCase.id, files);
    toast(`Uploaded ${data.numImages} DICOM images`, 'success');
    fileInput.value = '';
    folderInput.value = '';
    document.getElementById('dicomFileCount').textContent = '';
    document.getElementById('uploadDicomBtn').style.display = 'none';
    await loadDicomSeries(state.currentCase.id);
    switchViewerTab('dicom');
  } catch (err) {
    console.error('Upload failed:', err);
    toast('Failed to upload DICOM files', 'error');
  }
}
window.uploadDicomFiles = uploadDicomFiles;

// ============ Case CRUD ============

async function deleteCase() {
  if (!state.currentCase || !confirm('Delete this case? This cannot be undone.')) return;
  try {
    await api.deleteCaseById(state.currentCase.id);
    toast('Case deleted', 'success');
    closeModal();
    loadCases();
    loadStats();
  } catch (err) {
    toast('Failed to delete case', 'error');
  }
}
window.deleteCase = deleteCase;

function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    state.uploadedFiles.push(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const grid = document.getElementById('imagePreviewGrid');
      const div = document.createElement('div');
      div.className = 'image-preview';
      div.innerHTML = `
        <img src="${e.target.result}" alt="Preview">
        <button class="delete-btn" onclick="removeUpload(${state.uploadedFiles.length - 1}, this.parentElement)">\u2715</button>
      `;
      grid.appendChild(div);
    };
    reader.readAsDataURL(file);
  }
}

function removeUpload(index, element) {
  state.uploadedFiles.splice(index, 1);
  element.remove();
}
window.removeUpload = removeUpload;

async function saveCase(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const caseData = {
    title: formData.get('title'),
    diagnosis: formData.get('diagnosis'),
    modality: formData.get('modality'),
    body_part: formData.get('body_part'),
    difficulty: parseInt(formData.get('difficulty')),
    clinical_history: formData.get('clinical_history'),
    findings: formData.get('findings'),
    teaching_points: formData.get('teaching_points'),
    tags: formData.get('tags')?.split(',').map(t => t.trim()).filter(t => t) || []
  };

  try {
    const { id } = await api.createCase(caseData);
    if (state.uploadedFiles.length > 0) {
      await api.uploadCaseImages(id, state.uploadedFiles);
    }
    toast('Case saved!', 'success');
    resetForm();
    loadCases();
    loadStats();
    loadFilters();
    showPage('library');
    document.querySelector('[data-page=library]').click();
  } catch (err) {
    toast('Failed to save case', 'error');
  }
}

function resetForm() {
  document.getElementById('addCaseForm').reset();
  document.getElementById('imagePreviewGrid').innerHTML = '';
  state.uploadedFiles = [];
}
window.resetForm = resetForm;

// ============ Filters & Stats ============

async function loadFilters(prefix = '') {
  try {
    const data = await api.fetchFilters();
    const modalitySelect = document.getElementById(prefix ? `${prefix}Modality` : 'filterModality');
    const bodyPartSelect = document.getElementById(prefix ? `${prefix}BodyPart` : 'filterBodyPart');

    if (modalitySelect) {
      const currentVal = modalitySelect.value;
      modalitySelect.innerHTML = '<option value="">All Modalities</option>' +
        data.modalities.map(m => `<option value="${m}">${m}</option>`).join('');
      modalitySelect.value = currentVal;
    }
    if (bodyPartSelect) {
      const currentVal = bodyPartSelect.value;
      bodyPartSelect.innerHTML = '<option value="">All Body Parts</option>' +
        data.bodyParts.map(b => `<option value="${b}">${b}</option>`).join('');
      bodyPartSelect.value = currentVal;
    }
  } catch (err) {
    console.error('Failed to load filters:', err);
  }
}

async function loadStats() {
  try {
    const { analytics, quiz } = await api.fetchStats();
    document.getElementById('statCases').textContent = analytics.counts.cases;
    document.getElementById('statImages').textContent = analytics.counts.images;
    const accuracy = quiz.overall.total_attempts > 0
      ? Math.round((quiz.overall.correct_count / quiz.overall.total_attempts) * 100) + '%'
      : '-';
    document.getElementById('statAccuracy').textContent = accuracy;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ============ Quiz Hub ============

async function loadQuizHub() {
  if (state.quizHubLoaded) return;
  state.quizHubLoaded = true;

  // Load gamification profile
  if (window.quizGamification) {
    await window.quizGamification.loadProfile();
    window.quizGamification.renderHubHeader(document.getElementById('quizHubHeader'));
    window.quizGamification.renderBadgeShelf(document.getElementById('quizBadgeShelf'));
  }

  // Load study plans
  if (window.quizStudyPlans) {
    await window.quizStudyPlans.loadPlans();
    window.quizStudyPlans.renderPlansList(document.getElementById('quizPlansList'));
  }

  // Quiz engine session end callback
  if (window.quizEngine) {
    window.quizEngine.onSessionEnd = () => {
      state.quizHubLoaded = false;
      loadQuizHub();
      loadStats();
    };
  }

  // Count buttons
  document.querySelectorAll('.quiz-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quiz-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function startCustomQuiz() {
  const modality = document.getElementById('quizModality').value;
  const body_part = document.getElementById('quizBodyPart').value;
  const difficulty = document.getElementById('quizDifficulty').value;
  const countBtn = document.querySelector('.quiz-count-btn.active');
  const count = countBtn ? parseInt(countBtn.dataset.count) : 10;

  window.quizEngine?.startQuickStudy({ modality, body_part, difficulty, count });
}
window.startCustomQuiz = startCustomQuiz;

// ============ Analytics ============

async function loadAnalytics() {
  try {
    const container = document.getElementById('analyticsDashboard');
    if (!container) return;

    if (window.analyticsDashboard) {
      await window.analyticsDashboard.loadData();
      window.analyticsDashboard.render(container);
    } else {
      // Fallback: basic analytics
      const { analytics, quiz } = await api.fetchAnalytics();
      container.innerHTML = `
        <div class="card-grid">
          <div class="card">
            <h3 class="analytics-card-title">Quiz Performance</h3>
            <div class="stat-row"><span>Total Attempts</span><span class="stat-value">${quiz.overall.total_attempts || 0}</span></div>
            <div class="stat-row"><span>Correct</span><span class="stat-value">${quiz.overall.correct_count || 0}</span></div>
            <div class="stat-row"><span>Accuracy</span><span class="stat-value">${quiz.overall.total_attempts > 0 ? Math.round((quiz.overall.correct_count / quiz.overall.total_attempts) * 100) + '%' : '-'}</span></div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load analytics:', err);
  }
}

// ============ Bookmarks ============

async function loadBookmarks() {
  if (!state.currentUser) return;
  try {
    const bookmarks = await api.fetchBookmarks();
    state.bookmarkedCaseIds = new Set(bookmarks.map(b => b.case_id));
    document.querySelectorAll('.case-card[data-case-id]').forEach(card => {
      const caseId = card.dataset.caseId;
      const btn = card.querySelector('.bookmark-btn');
      if (btn) {
        btn.classList.toggle('bookmarked', state.bookmarkedCaseIds.has(caseId));
        btn.setAttribute('aria-label', state.bookmarkedCaseIds.has(caseId) ? 'Remove bookmark' : 'Bookmark this case');
      }
    });
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
  }
}

async function toggleBookmark(caseId, btnElement) {
  if (!state.currentUser) return;
  const isBookmarked = state.bookmarkedCaseIds.has(caseId);
  try {
    if (isBookmarked) {
      await api.removeBookmark(caseId);
      state.bookmarkedCaseIds.delete(caseId);
    } else {
      await api.addBookmark(caseId);
      state.bookmarkedCaseIds.add(caseId);
    }
    if (btnElement) {
      btnElement.classList.toggle('bookmarked', !isBookmarked);
      btnElement.setAttribute('aria-label', !isBookmarked ? 'Remove bookmark' : 'Bookmark this case');
    }
    updateModalBookmarkState(caseId);
    if (state.bookmarkFilterActive && isBookmarked) loadCases();
  } catch (err) {
    console.error('Failed to toggle bookmark:', err);
  }
}
window.toggleBookmark = toggleBookmark;

async function toggleModalBookmark() {
  if (!state.currentCase) return;
  if (!state.currentUser) {
    // Show auth modal or notify user they need to log in
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.classList.add('active');
    return;
  }
  const caseId = state.currentCase.id;
  const btn = document.getElementById('modalBookmarkBtn');

  // Optimistically update UI immediately for responsiveness
  const willBeBookmarked = !state.bookmarkedCaseIds.has(caseId);
  btn.classList.toggle('bookmarked', willBeBookmarked);
  document.getElementById('modalBookmarkLabel').textContent =
    willBeBookmarked ? 'Bookmarked' : 'Bookmark';
  const card = document.querySelector(`.case-card[data-case-id="${caseId}"] .bookmark-btn`);
  if (card) card.classList.toggle('bookmarked', willBeBookmarked);

  // Await the actual bookmark toggle (API call + state update)
  await toggleBookmark(caseId, btn);

  // Sync UI with final server-confirmed state
  const isNowBookmarked = state.bookmarkedCaseIds.has(caseId);
  btn.classList.toggle('bookmarked', isNowBookmarked);
  document.getElementById('modalBookmarkLabel').textContent =
    isNowBookmarked ? 'Bookmarked' : 'Bookmark';
  if (card) card.classList.toggle('bookmarked', isNowBookmarked);
}
window.toggleModalBookmark = toggleModalBookmark;

function toggleBookmarkFilter() {
  state.bookmarkFilterActive = !state.bookmarkFilterActive;
  const btn = document.getElementById('bookmarkFilterBtn');
  btn.classList.toggle('active', state.bookmarkFilterActive);
  loadCases();
}
window.toggleBookmarkFilter = toggleBookmarkFilter;

// ============ Voice Narration ============

function toggleVoiceNarration() {
  const btn = document.getElementById('voiceNarrateBtn');
  if (typeof voiceNarrator === 'undefined') return;

  if (btn.classList.contains('active')) {
    voiceNarrator.stop();
    btn.classList.remove('active');
  } else if (state.currentCase) {
    btn.classList.add('active');
    voiceNarrator.onEnd = () => btn.classList.remove('active');
    voiceNarrator.onError = () => btn.classList.remove('active');
    voiceNarrator.readCase(state.currentCase);
  }
}
window.toggleVoiceNarration = toggleVoiceNarration;

// ============ Annotation ============

function annotateCase() {
  if (!state.currentCase || !state.currentCase.images || state.currentCase.images.length === 0) {
    toast('No images to annotate', 'error');
    return;
  }

  const container = document.getElementById('annotationContainer');
  const imageUrl = `/uploads/${state.currentCase.images[0].filename}`;

  state.annotationCanvas = new AnnotationCanvas(container, imageUrl);
  state.annotationCanvas.imageId = state.currentCase.images[0].id;
  state.annotationCanvas.caseId = state.currentCase.id;
  state.annotationCanvas.onSave = async (annotations) => {
    try {
      await api.saveAnnotations(state.currentCase.images[0].id, annotations);
      toast('Annotations saved!', 'success');
    } catch (err) {
      toast('Failed to save annotations', 'error');
    }
  };

  if (state.currentCase.images[0].annotations) {
    try {
      const existing = JSON.parse(state.currentCase.images[0].annotations);
      state.annotationCanvas.load(existing);
    } catch (e) {}
  }

  const annotModal = document.getElementById('annotationModal');
  annotModal.classList.add('active');
  if (window.focusTrap) focusTrap.activate(annotModal);
}
window.annotateCase = annotateCase;

// ============ Presentation ============

function presentCase() {
  if (!state.currentCase) return;
  closeModal();
  presentation.start(state.currentCase.id);
}
window.presentCase = presentCase;

// ============ Spaced Repetition Stats ============

function updateSRStats() {
  if (typeof spacedRep === 'undefined') return;
  const stats = spacedRep.getStats();
  const srStatsEl = document.getElementById('srStats');
  if (srStatsEl) {
    srStatsEl.innerHTML = `
      <div class="stat-row">
        <span>Due Now</span>
        <span class="stat-value" style="color: ${stats.dueNow > 0 ? 'var(--warning)' : 'inherit'}">${stats.dueNow}</span>
      </div>
      <div class="stat-row">
        <span>Streak</span>
        <span class="stat-value">${stats.streak}</span>
      </div>
      <div class="stat-row">
        <span>Retention</span>
        <span class="stat-value">${stats.avgRetention}%</span>
      </div>
    `;
  }
}

// ============ Touch Gesture <-> Annotation Canvas Bridge ============

function setupTouchAnnotationBridge() {
  const annModal = document.getElementById('annotationModal');
  if (!annModal) return;

  let bridgeHandler = null;

  const observer = new MutationObserver(() => {
    if (annModal.classList.contains('active') && state.annotationCanvas) {
      attachBridge();
    } else {
      detachBridge();
    }
  });
  observer.observe(annModal, { attributes: true, attributeFilter: ['class'] });

  function attachBridge() {
    const ac = state.annotationCanvas;
    if (!ac || !ac.canvas) return;
    if (bridgeHandler) bridgeHandler.destroy();
    if (typeof TouchGestureHandler === 'undefined') return;

    bridgeHandler = new TouchGestureHandler(ac.canvas, {
      onDrawStart: (x, y) => {
        if (!state.annotationCanvas || !state.annotationCanvas.drawingEnabled) return;
        const r = ac.canvas.getBoundingClientRect();
        const sx = ac.canvas.width / r.width;
        const sy = ac.canvas.height / r.height;
        ac.isDrawing = true;
        ac.startX = (x - r.left) * sx;
        ac.startY = (y - r.top) * sy;
        if (ac.currentTool === 'freehand' || ac.currentTool === 'highlighter') {
          ac.currentPath = [{ x: ac.startX, y: ac.startY }];
        }
      },
      onDrawMove: (x, y) => {
        if (!state.annotationCanvas || !ac.isDrawing) return;
        const r = ac.canvas.getBoundingClientRect();
        const sx = ac.canvas.width / r.width;
        const sy = ac.canvas.height / r.height;
        const cx = (x - r.left) * sx;
        const cy = (y - r.top) * sy;
        if ((ac.currentTool === 'freehand' || ac.currentTool === 'highlighter') && ac.currentPath) {
          ac.currentPath.push({ x: cx, y: cy });
        }
        ac.redraw();
        ac.drawPreview(cx, cy, {});
      },
      onDrawEnd: (path) => {
        if (!state.annotationCanvas || !ac.isDrawing) return;
        const r = ac.canvas.getBoundingClientRect();
        const sx = ac.canvas.width / r.width;
        const sy = ac.canvas.height / r.height;
        const last = path[path.length - 1];
        const cx = (last.x - r.left) * sx;
        const cy = (last.y - r.top) * sy;
        ac.isDrawing = false;
        if ((ac.currentTool === 'freehand' || ac.currentTool === 'highlighter') && ac.currentPath) {
          ac.addAnnotation({
            type: ac.currentTool,
            path: ac.currentPath,
            color: ac.currentTool === 'highlighter' ? '#facc15' : ac.color,
            lineWidth: ac.currentTool === 'highlighter' ? ac.lineWidth * 3 : ac.lineWidth
          });
          ac.currentPath = null;
        } else if (ac.currentTool !== 'text') {
          ac.addAnnotation({
            type: ac.currentTool,
            startX: ac.startX, startY: ac.startY,
            endX: cx, endY: cy,
            color: ac.color, lineWidth: ac.lineWidth
          });
        }
      },
      onGestureChange: (mode) => {
        if (!state.annotationCanvas) return;
        state.annotationCanvas.drawingEnabled = (mode === 'annotate');
      }
    });

    bridgeHandler.setMode('annotate');
    ac.drawingEnabled = true;
  }

  function detachBridge() {
    if (bridgeHandler) {
      bridgeHandler.destroy();
      bridgeHandler = null;
    }
  }
}

// ============ Event Listeners ============

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return; // skip preferences button
      showPage(page);
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      handleMobileNavigation();

      if (page === 'analytics') loadAnalytics();
      if (page === 'quiz') {
        loadFilters('quiz');
        loadQuizHub();
      }
      if (page === 'collections') loadCollectionsPage();
      if (page === 'case-builder' && window.caseBuilder) {
        caseBuilder.init(document.getElementById('caseBuilderContainer'));
      }
      if (page === 'oral-boards' && window.oralBoards) {
        oralBoards.init(document.getElementById('oralBoardsContainer'));
      }
      if (page === 'milestones' && window.milestones) {
        milestones.init(document.getElementById('milestonesContainer'));
      }
      if (page === 'program-dashboard' && window.programDashboard) {
        programDashboard.init(document.getElementById('programDashboardContainer'));
      }

      // Sync bottom nav
      document.querySelectorAll('.bottom-nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === page);
      });
    });
  });

  // Search
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadCases(), 300);
  });

  // Filters
  ['filterModality', 'filterBodyPart', 'filterDifficulty'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadCases);
  });

  // Upload zone
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  // Form submit
  document.getElementById('addCaseForm').addEventListener('submit', saveCase);

  // Auth modal backdrop
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('auth-modal')) closeAuthModal();
  });

  // Case modal backdrop
  document.getElementById('caseModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });

  // Annotation modal backdrop
  document.getElementById('annotationModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeAnnotationModal();
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (!document.getElementById('caseModal').classList.contains('active')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigateCase(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigateCase(1); }
  });

  // Preferences
  document.getElementById('preferencesOverlay').addEventListener('click', function(e) {
    if (e.target === this) closePreferencesModal();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('preferencesOverlay').classList.contains('active')) {
      closePreferencesModal();
    }
  });
  document.getElementById('prefColorSwatches').addEventListener('click', function(e) {
    const swatch = e.target.closest('.pref-color-swatch');
    if (!swatch) return;
    this.querySelectorAll('.pref-color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
  });

  // Mobile bottom nav
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      showPage(page);
      document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === page);
      });
      document.querySelectorAll('.bottom-nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === page);
      });

      if (page === 'analytics') loadAnalytics();
      if (page === 'quiz') {
        loadFilters('quiz');
        loadQuizHub();
      }
      if (page === 'collections') loadCollectionsPage();
    });
  });

  // Touch swipe nav on case modal with visual feedback
  (function() {
    let startX = 0, startY = 0, tracking = false, swiping = false;
    const modal = document.getElementById('caseModal');
    const THRESHOLD = 60;

    modal.addEventListener('touchstart', (e) => {
      if (!modal.classList.contains('active')) return;
      if (e.target.closest('.dicom-viewer-wrapper') || e.target.closest('.dicom-element') || e.target.closest('.dicom-canvas-container')) return;
      // Don't track swipes that start on interactive header elements (bookmark, close, tabs, mode switch)
      if (e.target.closest('.modal-bookmark-btn') || e.target.closest('.modal-close') || e.target.closest('.modal-tabs') || e.target.closest('.viewer-mode-switch')) return;
      const dicomPanel = document.getElementById('dicomViewerPanel');
      if (dicomPanel && dicomPanel.style.display !== 'none' && e.target.closest('.viewer-container')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      swiping = false;
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody) {
        modalBody.style.transition = 'none';
      }
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - startX;
      const dy = currentY - startY;

      // If vertical scroll is dominant, stop tracking horizontal swipe
      if (!swiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        tracking = false;
        return;
      }

      if (Math.abs(dx) > 10) {
        swiping = true;
      }

      if (swiping) {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
          const clampedDx = Math.sign(dx) * Math.min(Math.abs(dx) * 0.3, 50);
          modalBody.style.transform = `translateX(${clampedDx}px)`;
          modalBody.style.opacity = String(1 - Math.abs(clampedDx) / 200);
        }
      }
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
      if (!tracking && !swiping) return;
      const modalBody = modal.querySelector('.modal-body');
      const dx = e.changedTouches[0].clientX - startX;
      tracking = false;

      if (!swiping || Math.abs(dx) < THRESHOLD) {
        // Snap back
        if (modalBody && swiping) {
          modalBody.style.transition = 'transform 0.25s ease-out, opacity 0.2s';
          modalBody.style.transform = 'translateX(0)';
          modalBody.style.opacity = '1';
        }
        swiping = false;
        return;
      }

      swiping = false;
      const dir = dx < 0 ? 1 : -1;
      const nextIdx = state.currentCaseIndex + dir;

      // Check bounds before animating
      if (nextIdx < 0 || nextIdx >= state.caseIds.length) {
        if (modalBody) {
          modalBody.style.transition = 'transform 0.25s ease-out, opacity 0.2s';
          modalBody.style.transform = 'translateX(0)';
          modalBody.style.opacity = '1';
        }
        return;
      }

      // Animate out
      if (modalBody) {
        modalBody.style.transition = 'transform 0.25s ease-out, opacity 0.2s';
        modalBody.style.transform = `translateX(${dx < 0 ? -80 : 80}px)`;
        modalBody.style.opacity = '0.3';
      }

      setTimeout(() => {
        navigateCase(dir);
        // After new case loads, animate in from opposite side
        if (modalBody) {
          modalBody.style.transition = 'none';
          modalBody.style.transform = `translateX(${dx < 0 ? 60 : -60}px)`;
          modalBody.style.opacity = '0.3';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              modalBody.style.transition = 'transform 0.3s ease-out, opacity 0.25s';
              modalBody.style.transform = 'translateX(0)';
              modalBody.style.opacity = '1';
            });
          });
        }
      }, 250);
    }, { passive: true });
  })();

  // Mobile header ARIA
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const sidebar = document.querySelector('.sidebar');
  if (hamburgerBtn && sidebar) {
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    sidebar.setAttribute('aria-hidden', window.innerWidth <= 1024 ? 'true' : 'false');
  }
}

// ============ Collections Page ============

async function loadCollectionsPage() {
  if (window.collectionsManager) {
    await collectionsManager.init();
  }
}

// ============ Study Mode Keyboard Shortcuts ============

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('caseModal');
  if (!modal || !modal.classList.contains('active')) return;
  if (state.viewerMode !== 'study') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    advanceStudyStep();
  }
  if (e.key === 'Escape' && state.viewerMode === 'study') {
    toggleViewerMode('reference');
  }
});

// ============ Trainee Level Preferences Save ============

const origSavePrefs = window.savePreferencesAndClose;
window.savePreferencesAndClose = function() {
  // Handle trainee level update
  const levelSelect = document.getElementById('prefTraineeLevel');
  if (levelSelect && state.currentUser) {
    const newLevel = levelSelect.value;
    if (newLevel !== state.traineeLevel) {
      state.traineeLevel = newLevel;
      apiModule.updateTraineeLevel(newLevel).catch(e => console.warn('Failed to update trainee level:', e));
    }
  }
  // Call original
  if (origSavePrefs) origSavePrefs();
};

// ============ Initialize ============

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadCases();
  loadFilters();
  loadStats();
  setupEventListeners();
  setupTouchAnnotationBridge();
  loadPreferences();

  // Periodically update SR stats
  setInterval(updateSRStats, 30000);
  setTimeout(updateSRStats, 1000);
});
