// RadCase API - All fetch/API calls centralized
import { API, state } from './state.js';

// ============ Authentication API ============

export async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
    const data = await res.json();
    state.currentUser = data.user;
    return state.currentUser;
  } catch (err) {
    console.error('Auth check failed:', err);
    state.currentUser = null;
    return null;
  }
}

export async function loginUser(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  state.currentUser = data.user;
  return data.user;
}

export async function registerUser(username, displayName, email, password, traineeLevel) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, displayName, email, password, traineeLevel })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  state.currentUser = data.user;
  return data.user;
}

export async function logoutUser() {
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  state.currentUser = null;
}

// ============ User Progress API ============

export async function fetchUserProgress() {
  const [progressRes, dueRes] = await Promise.all([
    fetch(`${API}/progress`, { credentials: 'include' }),
    fetch(`${API}/review/due?limit=5`, { credentials: 'include' })
  ]);
  const progress = progressRes.ok ? await progressRes.json() : null;
  const due = dueRes.ok ? await dueRes.json() : null;
  return { progress, due };
}

// ============ Cases API ============

export async function fetchCases(params) {
  const res = await fetch(`${API}/cases?${params}`);
  const data = await res.json();
  return data.cases;
}

export async function fetchCase(id) {
  const res = await fetch(`${API}/cases/${id}`);
  return await res.json();
}

export async function createCase(caseData) {
  const res = await fetch(`${API}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(caseData)
  });
  return await res.json();
}

export async function uploadCaseImages(caseId, files) {
  const imageData = new FormData();
  files.forEach(f => imageData.append('images', f));
  await fetch(`${API}/cases/${caseId}/images`, {
    method: 'POST',
    body: imageData
  });
}

export async function deleteCaseById(id) {
  await fetch(`${API}/cases/${id}`, { method: 'DELETE' });
}

// ============ Filters API ============

export async function fetchFilters() {
  const res = await fetch(`${API}/filters`);
  return await res.json();
}

// ============ Stats & Analytics API ============

export async function fetchStats() {
  const [analyticsRes, quizRes] = await Promise.all([
    fetch(`${API}/analytics`),
    fetch(`${API}/quiz/stats`)
  ]);
  const analytics = await analyticsRes.json();
  const quiz = await quizRes.json();
  return { analytics, quiz };
}

export async function fetchAnalytics() {
  const [analyticsRes, quizRes] = await Promise.all([
    fetch(`${API}/analytics`),
    fetch(`${API}/quiz/stats`)
  ]);
  return {
    analytics: await analyticsRes.json(),
    quiz: await quizRes.json()
  };
}

// ============ Quiz API ============

export async function fetchRandomQuiz(params) {
  const res = await fetch(`${API}/quiz/random?${params}`);
  if (!res.ok) throw new Error('No cases match filters');
  return await res.json();
}

export async function submitQuizAttempt(caseId, correct, timeSpentMs) {
  await fetch(`${API}/quiz/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_id: caseId,
      correct,
      time_spent_ms: timeSpentMs
    })
  });
}

// ============ Bookmarks API ============

export async function fetchBookmarks() {
  const res = await fetch(`${API}/bookmarks`, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.bookmarks || [];
}

export async function addBookmark(caseId) {
  await fetch(`${API}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ case_id: caseId })
  });
}

export async function removeBookmark(caseId) {
  await fetch(`${API}/bookmarks/${caseId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
}

// ============ DICOM API ============

export async function fetchDicomSeries(caseId) {
  const res = await fetch(`${API}/cases/${caseId}/dicom`);
  const data = await res.json();
  return data.series || [];
}

export async function fetchDicomSeriesData(seriesId) {
  const res = await fetch(`${API}/dicom/${seriesId}`);
  return await res.json();
}

export async function uploadDicomFilesApi(caseId, files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`${API}/cases/${caseId}/dicom`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============ Annotations API ============

export async function saveAnnotations(imageId, annotations) {
  await fetch(`/api/images/${imageId}/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations })
  });
}

// ============ Gamification API ============

export async function fetchGamificationProfile() {
  const res = await fetch(`${API}/gamification/profile`, { credentials: 'include' });
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchLeaderboard(period = 'weekly') {
  const res = await fetch(`${API}/gamification/leaderboard?period=${period}`);
  return await res.json();
}

export async function fetchAllBadges() {
  const res = await fetch(`${API}/gamification/badges`, { credentials: 'include' });
  return await res.json();
}

export async function checkBadges() {
  const res = await fetch(`${API}/gamification/check-badges`, {
    method: 'POST',
    credentials: 'include',
  });
  return await res.json();
}

// ============ Study Plans API ============

export async function fetchStudyPlanTemplates() {
  const res = await fetch(`${API}/study-plans/templates`);
  return await res.json();
}

export async function createStudyPlan(templateId, name, targetDate) {
  const res = await fetch(`${API}/study-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ templateId, name, targetDate }),
  });
  return await res.json();
}

export async function fetchStudyPlans() {
  const res = await fetch(`${API}/study-plans`, { credentials: 'include' });
  if (!res.ok) return { plans: [] };
  return await res.json();
}

export async function fetchStudyPlanDetail(planId) {
  const res = await fetch(`${API}/study-plans/${planId}`, { credentials: 'include' });
  return await res.json();
}

export async function fetchStudyPlanNextSession(planId) {
  const res = await fetch(`${API}/study-plans/${planId}/next-session`, { credentials: 'include' });
  return await res.json();
}

export async function recordStudyPlanProgress(planId, caseId, correct, milestoneIndex) {
  const res = await fetch(`${API}/study-plans/${planId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ caseId, correct, milestoneIndex }),
  });
  return await res.json();
}

// ============ Deep Analytics API ============

export async function fetchDeepAnalytics() {
  const res = await fetch(`${API}/analytics/deep`, { credentials: 'include' });
  return await res.json();
}

export async function fetchAnalyticsTrends(period = 'daily') {
  const res = await fetch(`${API}/analytics/trends?period=${period}`, { credentials: 'include' });
  return await res.json();
}

export async function fetchBoardReadiness() {
  const res = await fetch(`${API}/analytics/board-readiness`, { credentials: 'include' });
  return await res.json();
}

// ============ Quiz Session API ============

export async function createQuizSession(mode, planId) {
  const res = await fetch(`${API}/quiz/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mode, planId }),
  });
  return await res.json();
}

export async function completeQuizSession(sessionId) {
  const res = await fetch(`${API}/quiz/session/${sessionId}/complete`, {
    method: 'POST',
    credentials: 'include',
  });
  return await res.json();
}

export async function fetchDailyChallenge() {
  const res = await fetch(`${API}/quiz/daily-challenge`, { credentials: 'include' });
  return await res.json();
}

export async function submitDailyChallenge(score, total) {
  const res = await fetch(`${API}/quiz/daily-challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ score, total }),
  });
  return await res.json();
}

export async function submitFindingAttempt(caseId, imageId, clickX, clickY) {
  const res = await fetch(`${API}/quiz/finding-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ case_id: caseId, image_id: imageId, click_x: clickX, click_y: clickY }),
  });
  return await res.json();
}

export async function fetchMcqOptions(caseId) {
  const res = await fetch(`${API}/quiz/mcq-options/${caseId}`);
  return await res.json();
}

// ============ Case Viewer API (Study/Reference Mode) ============

export async function fetchStudyView(caseId) {
  const res = await fetch(`${API}/cases/${caseId}/study-view`);
  return await res.json();
}

export async function fetchReferenceView(caseId, traineeLevel) {
  const res = await fetch(`${API}/cases/${caseId}/reference-view?trainee_level=${traineeLevel || 'resident'}`);
  return await res.json();
}

export async function revealStep(caseId, step) {
  const res = await fetch(`${API}/cases/${caseId}/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step })
  });
  return await res.json();
}

export async function submitDifferentialAttempt(caseId, differentials, timeSpentMs) {
  const res = await fetch(`${API}/cases/${caseId}/differential-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ differentials, time_spent_ms: timeSpentMs })
  });
  return await res.json();
}

// ============ Key Findings API ============

export async function fetchKeyFindings(caseId) {
  const res = await fetch(`${API}/cases/${caseId}/key-findings`);
  return await res.json();
}

export async function addKeyFinding(caseId, finding) {
  const res = await fetch(`${API}/cases/${caseId}/key-findings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(finding)
  });
  return await res.json();
}

export async function deleteKeyFinding(caseId, findingId) {
  await fetch(`${API}/cases/${caseId}/key-findings/${findingId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
}

// ============ Discussions API ============

export async function fetchDiscussions(caseId, sort) {
  const params = sort ? `?sort=${sort}` : '';
  const res = await fetch(`${API}/discussions/case/${caseId}${params}`, { credentials: 'include' });
  return await res.json();
}

export async function postDiscussion(caseId, content, discussionType, parentId) {
  const res = await fetch(`${API}/discussions/case/${caseId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content, discussion_type: discussionType, parent_id: parentId })
  });
  return await res.json();
}

export async function updateDiscussion(id, data) {
  const res = await fetch(`${API}/discussions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return await res.json();
}

export async function deleteDiscussion(id) {
  await fetch(`${API}/discussions/${id}`, { method: 'DELETE', credentials: 'include' });
}

export async function toggleDiscussionUpvote(id) {
  const res = await fetch(`${API}/discussions/${id}/upvote`, { method: 'POST', credentials: 'include' });
  return await res.json();
}

// ============ Collections API ============

export async function fetchCollections() {
  const res = await fetch(`${API}/collections`, { credentials: 'include' });
  return await res.json();
}

export async function fetchPublicCollections() {
  const res = await fetch(`${API}/collections/public`);
  return await res.json();
}

export async function fetchCollection(id) {
  const res = await fetch(`${API}/collections/${id}`, { credentials: 'include' });
  return await res.json();
}

export async function createCollection(data) {
  const res = await fetch(`${API}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return await res.json();
}

export async function updateCollection(id, data) {
  const res = await fetch(`${API}/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return await res.json();
}

export async function deleteCollection(id) {
  await fetch(`${API}/collections/${id}`, { method: 'DELETE', credentials: 'include' });
}

export async function addCaseToCollection(collectionId, caseId) {
  const res = await fetch(`${API}/collections/${collectionId}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ case_id: caseId })
  });
  return await res.json();
}

export async function removeCaseFromCollection(collectionId, caseId) {
  await fetch(`${API}/collections/${collectionId}/cases/${caseId}`, { method: 'DELETE', credentials: 'include' });
}

export async function recordCollectionProgress(collectionId, caseId, completed, score) {
  const res = await fetch(`${API}/collections/${collectionId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ case_id: caseId, completed, score })
  });
  return await res.json();
}

export async function fetchSharedCollection(code) {
  const res = await fetch(`${API}/collections/share/${code}`);
  return await res.json();
}

export async function cloneSharedCollection(code) {
  const res = await fetch(`${API}/collections/share/${code}/clone`, { method: 'POST', credentials: 'include' });
  return await res.json();
}

// ============ Patterns API ============

export async function fetchRelatedCases(caseId) {
  const res = await fetch(`${API}/patterns/cases/${caseId}/related`);
  return await res.json();
}

export async function linkRelatedCases(caseId, relatedCaseId, relationshipType, description) {
  const res = await fetch(`${API}/patterns/cases/${caseId}/related`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ related_case_id: relatedCaseId, relationship_type: relationshipType, description })
  });
  return await res.json();
}

export async function fetchPatternGroups() {
  const res = await fetch(`${API}/patterns/groups`);
  return await res.json();
}

export async function fetchPatternGroup(id) {
  const res = await fetch(`${API}/patterns/groups/${id}`);
  return await res.json();
}

export async function createPatternGroup(data) {
  const res = await fetch(`${API}/patterns/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return await res.json();
}

export async function autoGeneratePatternGroups() {
  const res = await fetch(`${API}/patterns/groups/auto-generate`, { method: 'POST', credentials: 'include' });
  return await res.json();
}

// ============ Trainee Level API ============

export async function updateTraineeLevel(traineeLevel) {
  const res = await fetch(`${API}/auth/trainee-level`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ traineeLevel })
  });
  return await res.json();
}
