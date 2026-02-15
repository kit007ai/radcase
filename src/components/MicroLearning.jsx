import React, { useState, useEffect, useCallback, useRef } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';

const SESSION_DURATION = 5 * 60 * 1000; // 5 minutes
const SWIPE_THRESHOLD = 80;

const styles = {
  // Floating action button
  fab: {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: theme.colors.gradientPrimary,
    color: '#ffffff',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    boxShadow: theme.shadows.glowStrong,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `transform ${theme.transitions.fast}`,
  },

  // Full-screen overlay
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.bgPrimary,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: theme.typography.fontFamily,
    color: theme.colors.textPrimary,
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.glassBorder}`,
    flexShrink: 0,
  },
  closeBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    borderRadius: theme.radii.md,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
  },
  timer: {
    fontSize: '1.1rem',
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    minWidth: '50px',
  },
  progressBar: {
    flex: 1,
    height: '4px',
    background: theme.colors.glassBg,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: theme.colors.gradientPrimary,
    borderRadius: '2px',
    transition: `width 0.3s`,
  },
  statsCount: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    minWidth: '60px',
    textAlign: 'right',
  },

  // Hints bar
  hints: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 24px',
    fontSize: theme.typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    flexShrink: 0,
  },

  // Card area
  cardArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    overflow: 'hidden',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: '20px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'grab',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
  },
  cardImage: {
    position: 'relative',
    width: '100%',
    height: '280px',
    background: theme.colors.bgTertiary,
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: theme.colors.textMuted,
    fontSize: '1.1rem',
  },
  cardBody: {
    padding: '20px',
  },
  cardMeta: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  badgeModality: {
    background: 'rgba(6, 182, 212, 0.15)',
    color: '#22d3ee',
  },
  badgeBodyPart: {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#c084fc',
  },
  badgeDiff: {
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#fbbf24',
  },
  cardTitle: {
    fontSize: '1.2rem',
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: '8px',
  },
  cardHistory: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: '16px',
    maxHeight: '80px',
    overflowY: 'auto',
  },
  diagnosisSection: {
    borderTop: `1px solid ${theme.colors.glassBorder}`,
    paddingTop: '12px',
  },
  revealBtn: {
    width: '100%',
    padding: '12px',
    background: theme.colors.accentMuted,
    border: `1px solid rgba(99, 102, 241, 0.3)`,
    color: theme.colors.accentHover,
    borderRadius: theme.radii.md,
    fontSize: theme.typography.sizes.sm,
    cursor: 'pointer',
    fontFamily: theme.typography.fontFamily,
    transition: `background ${theme.transitions.fast}`,
  },
  diagnosisRevealed: {
    color: theme.colors.success,
    fontSize: theme.typography.sizes.sm,
    lineHeight: 1.5,
  },
  findings: {
    marginTop: '8px',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.xs,
  },

  // Swipe overlay labels
  swipeOverlay: {
    position: 'absolute',
    top: '16px',
    padding: '8px 16px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '1.1rem',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transition: 'opacity 0.1s',
  },
  overlayLeft: {
    left: '16px',
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#fff',
    border: '2px solid #ef4444',
  },
  overlayRight: {
    right: '16px',
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: '2px solid #22c55e',
  },
  overlayUp: {
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(245, 158, 11, 0.9)',
    color: '#fff',
    border: '2px solid #f59e0b',
  },

  // Action buttons
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    padding: '16px',
    flexShrink: 0,
  },
  actionBtn: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.4rem',
    transition: `all ${theme.transitions.fast}`,
  },

  // Results screen
  results: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '32px',
    textAlign: 'center',
  },
  resultsTitle: {
    fontSize: '2rem',
    fontWeight: theme.typography.fontWeights.bold,
    background: theme.colors.gradientPrimary,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '32px',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
    width: '100%',
    maxWidth: '320px',
    marginBottom: '32px',
  },
  resultCard: {
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: '16px',
    padding: '20px',
  },
  resultNumber: {
    fontSize: '2rem',
    fontWeight: theme.typography.fontWeights.bold,
  },
  resultLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textMuted,
    marginTop: '4px',
  },
  resultsActions: {
    display: 'flex',
    gap: '12px',
  },
  resultsBtnPrimary: {
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.fontWeights.medium,
    cursor: 'pointer',
    border: 'none',
    background: theme.colors.gradientPrimary,
    color: '#ffffff',
    fontFamily: theme.typography.fontFamily,
    transition: `all ${theme.transitions.fast}`,
  },
  resultsBtnSecondary: {
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.fontWeights.medium,
    cursor: 'pointer',
    background: theme.colors.bgTertiary,
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.glassBorder}`,
    fontFamily: theme.typography.fontFamily,
    transition: `all ${theme.transitions.fast}`,
  },
};

export default function MicroLearning() {
  const api = useApi();
  const [active, setActive] = useState(false);
  const [cases, setCases] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, skipped: 0 });
  const [timeRemaining, setTimeRemaining] = useState(SESSION_DURATION);
  const [showResults, setShowResults] = useState(false);
  const [diagnosisRevealed, setDiagnosisRevealed] = useState(false);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef(null);

  // Timer
  const sessionStartRef = useRef(null);
  const timerRef = useRef(null);

  const startSession = useCallback(async () => {
    try {
      const data = await api.get('/api/cases/micro-learning?limit=10');
      const sessionCases = data.cases || data || [];
      if (sessionCases.length === 0) return;

      // Shuffle cases
      for (let i = sessionCases.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sessionCases[i], sessionCases[j]] = [sessionCases[j], sessionCases[i]];
      }

      setCases(sessionCases);
      setCurrentIndex(0);
      setStats({ correct: 0, incorrect: 0, skipped: 0 });
      setTimeRemaining(SESSION_DURATION);
      setShowResults(false);
      setDiagnosisRevealed(false);
      setActive(true);
      sessionStartRef.current = Date.now();
    } catch {
      // Failed to load
    }
  }, [api]);

  // Timer effect
  useEffect(() => {
    if (!active || showResults) return;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - sessionStartRef.current;
      const remaining = Math.max(0, SESSION_DURATION - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setShowResults(true);
        clearInterval(timerRef.current);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [active, showResults]);

  const endSession = useCallback(() => {
    clearInterval(timerRef.current);
    setShowResults(true);
  }, []);

  const closeSession = useCallback(() => {
    clearInterval(timerRef.current);
    setActive(false);
    setShowResults(false);
  }, []);

  const handleSwipe = useCallback(async (direction) => {
    const currentCase = cases[currentIndex];
    if (!currentCase) return;

    if (direction === 'right') {
      setStats((s) => ({ ...s, correct: s.correct + 1 }));
      try {
        await api.post('/api/quiz/attempt', {
          case_id: currentCase.id,
          correct: true,
          time_spent_ms: 0,
        });
      } catch { /* silent */ }
    } else if (direction === 'left') {
      setStats((s) => ({ ...s, incorrect: s.incorrect + 1 }));
      try {
        await api.post('/api/quiz/attempt', {
          case_id: currentCase.id,
          correct: false,
          time_spent_ms: 0,
        });
      } catch { /* silent */ }
    } else {
      setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    }

    setSwipeOffset({ x: 0, y: 0 });
    setDiagnosisRevealed(false);

    if (currentIndex + 1 >= cases.length) {
      endSession();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [cases, currentIndex, api, endSession]);

  // Pointer event handlers for swipe
  const onPointerDown = useCallback((e) => {
    isDraggingRef.current = true;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    if (cardRef.current) cardRef.current.style.transition = 'none';
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    setSwipeOffset({ x: dx, y: Math.min(dy, 0) });
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;

    if (cardRef.current) cardRef.current.style.transition = 'transform 0.3s ease';

    if (dx > SWIPE_THRESHOLD) {
      handleSwipe('right');
    } else if (dx < -SWIPE_THRESHOLD) {
      handleSwipe('left');
    } else if (dy < -SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      handleSwipe('up');
    } else {
      setSwipeOffset({ x: 0, y: 0 });
    }
  }, [handleSwipe]);

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentCase = cases[currentIndex];
  const imgSrc = currentCase?.imageUrl
    ? currentCase.imageUrl
    : currentCase?.thumbnail
      ? `/thumbnails/${currentCase.thumbnail}`
      : currentCase?.images?.[0]
        ? `/uploads/${currentCase.images[0].filename}`
        : null;

  const progressPercent = cases.length > 0 ? (currentIndex / cases.length) * 100 : 0;

  // Swipe overlay opacities
  const leftOpacity = swipeOffset.x < -SWIPE_THRESHOLD * 0.5
    ? Math.min(1, (-swipeOffset.x - SWIPE_THRESHOLD * 0.5) / SWIPE_THRESHOLD)
    : 0;
  const rightOpacity = swipeOffset.x > SWIPE_THRESHOLD * 0.5
    ? Math.min(1, (swipeOffset.x - SWIPE_THRESHOLD * 0.5) / SWIPE_THRESHOLD)
    : 0;
  const upOpacity = swipeOffset.y < -SWIPE_THRESHOLD * 0.5 && Math.abs(swipeOffset.y) > Math.abs(swipeOffset.x)
    ? Math.min(1, (-swipeOffset.y - SWIPE_THRESHOLD * 0.5) / SWIPE_THRESHOLD)
    : 0;

  const rotation = swipeOffset.x * 0.05;

  // FAB only (session not active)
  if (!active) {
    return (
      <button
        style={styles.fab}
        onClick={startSession}
        aria-label="Start 5-min learning session"
        title="Start 5-min Learning Session"
      >
        &#x26A1;
      </button>
    );
  }

  // Results screen
  if (showResults) {
    const answered = stats.correct + stats.incorrect;
    const accuracy = answered > 0 ? Math.round((stats.correct / answered) * 100) : 0;

    return (
      <div style={styles.overlay}>
        <div style={styles.results}>
          <h2 style={styles.resultsTitle}>Session Complete!</h2>
          <div style={styles.resultsGrid}>
            <div style={styles.resultCard}>
              <div style={{ ...styles.resultNumber, color: theme.colors.success }}>{stats.correct}</div>
              <div style={styles.resultLabel}>Correct</div>
            </div>
            <div style={styles.resultCard}>
              <div style={{ ...styles.resultNumber, color: theme.colors.error }}>{stats.incorrect}</div>
              <div style={styles.resultLabel}>Incorrect</div>
            </div>
            <div style={styles.resultCard}>
              <div style={{ ...styles.resultNumber, color: theme.colors.warning }}>{stats.skipped}</div>
              <div style={styles.resultLabel}>Skipped</div>
            </div>
            <div style={styles.resultCard}>
              <div style={{ ...styles.resultNumber, color: theme.colors.accent }}>{accuracy}%</div>
              <div style={styles.resultLabel}>Accuracy</div>
            </div>
          </div>
          <div style={styles.resultsActions}>
            <button style={styles.resultsBtnPrimary} onClick={startSession}>
              Play Again
            </button>
            <button style={styles.resultsBtnSecondary} onClick={closeSession}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active session
  return (
    <div style={styles.overlay}>
      {/* Header */}
      <div style={styles.header}>
        <button
          style={styles.closeBtn}
          onClick={closeSession}
          aria-label="Close session"
        >
          &#x2715;
        </button>
        <div style={styles.timer}>{formatTime(timeRemaining)}</div>
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
        </div>
        <div style={styles.statsCount}>
          {currentIndex + 1} / {cases.length}
        </div>
      </div>

      {/* Hint labels */}
      <div style={styles.hints}>
        <span style={{ color: theme.colors.error }}>Incorrect</span>
        <span style={{ color: theme.colors.warning }}>Skip</span>
        <span style={{ color: theme.colors.success }}>Correct</span>
      </div>

      {/* Card area */}
      <div style={styles.cardArea}>
        {currentCase && (
          <div
            ref={cardRef}
            style={{
              ...styles.card,
              transform: `translateX(${swipeOffset.x}px) translateY(${swipeOffset.y}px) rotate(${rotation}deg)`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="article"
            aria-label={`Case: ${currentCase.title}`}
          >
            {/* Image */}
            <div style={styles.cardImage}>
              {imgSrc ? (
                <img src={imgSrc} alt={currentCase.title} style={styles.cardImg} draggable={false} />
              ) : (
                <div style={styles.cardPlaceholder}>No Image</div>
              )}
              {/* Swipe overlays */}
              <div style={{ ...styles.swipeOverlay, ...styles.overlayLeft, opacity: leftOpacity }}>
                Incorrect
              </div>
              <div style={{ ...styles.swipeOverlay, ...styles.overlayRight, opacity: rightOpacity }}>
                Correct
              </div>
              <div style={{ ...styles.swipeOverlay, ...styles.overlayUp, opacity: upOpacity }}>
                Skip
              </div>
            </div>

            {/* Body */}
            <div style={styles.cardBody}>
              <div style={styles.cardMeta}>
                {currentCase.modality && (
                  <span style={{ ...styles.badge, ...styles.badgeModality }}>{currentCase.modality}</span>
                )}
                {(currentCase.specialty || currentCase.body_part) && (
                  <span style={{ ...styles.badge, ...styles.badgeBodyPart }}>{currentCase.specialty || currentCase.body_part}</span>
                )}
                <span style={{ ...styles.badge, ...styles.badgeDiff }}>
                  Diff: {currentCase.difficulty || '?'}
                </span>
              </div>
              <h3 style={styles.cardTitle}>{currentCase.title}</h3>
              <p style={styles.cardHistory}>
                {currentCase.clinical_history || 'No clinical history provided.'}
              </p>

              <div style={styles.diagnosisSection}>
                {!diagnosisRevealed ? (
                  <button
                    style={styles.revealBtn}
                    onClick={() => setDiagnosisRevealed(true)}
                  >
                    Tap to reveal diagnosis
                  </button>
                ) : (
                  <div style={styles.diagnosisRevealed}>
                    <strong>Diagnosis:</strong> {currentCase.diagnosis || '-'}
                    {currentCase.findings && (
                      <p style={styles.findings}>
                        <strong>Findings:</strong> {currentCase.findings}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <button
          style={{ ...styles.actionBtn, borderColor: theme.colors.error, color: theme.colors.error }}
          onClick={() => handleSwipe('left')}
          aria-label="Mark incorrect"
        >
          &#x2715;
        </button>
        <button
          style={{
            ...styles.actionBtn,
            borderColor: theme.colors.warning,
            color: theme.colors.warning,
            width: '48px',
            height: '48px',
          }}
          onClick={() => handleSwipe('up')}
          aria-label="Skip"
        >
          &#x00BB;
        </button>
        <button
          style={{ ...styles.actionBtn, borderColor: theme.colors.success, color: theme.colors.success }}
          onClick={() => handleSwipe('right')}
          aria-label="Mark correct"
        >
          &#x2713;
        </button>
      </div>
    </div>
  );
}
