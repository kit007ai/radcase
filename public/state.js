// RadCase Application State Management

export const API = '/api';

export const state = {
  currentCase: null,
  uploadedFiles: [],
  quizStartTime: null,
  currentQuizCase: null,
  dicomViewer: null,
  currentDicomSeries: [],
  currentUser: null,
  bookmarkedCaseIds: new Set(),
  bookmarkFilterActive: false,
  caseIds: [],
  currentCaseIndex: -1,
  annotationCanvas: null,
  touchGestureHandler: null,
  quizHubLoaded: false,
  // Case library overhaul
  traineeLevel: 'resident',
  viewerMode: 'reference', // 'study' or 'reference'
  studySession: {
    caseId: null,
    currentStep: 0, // 0=history, 1=images, 2=differential, 3=reveal, 4=teaching
    startTime: null,
    differentialScore: null,
    completed: false,
  },
  collectionsLoaded: false,
};

// Preferences
export const PREFS_KEY = 'radcase-preferences';

export const DEFAULT_PREFS = {
  viewMode: 'grid',
  fontSize: 'medium',
  annotationColor: '#ff3b30',
  theme: 'dark'
};
