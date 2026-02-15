import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';
import useIsMobile from '../hooks/useIsMobile';

// Progress Ring SVG component
function ProgressRing({ progress, size = 56, stroke = 4 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={theme.colors.accent}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 500ms ease' }}
      />
    </svg>
  );
}

// CSS-only confetti keyframes
const confettiCSS = `
@keyframes quizConfettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
}
@keyframes quizRevealSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes quizScorePop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
`;

const getStyles = (mobile) => ({
  container: {
    minHeight: '100vh',
    background: theme.colors.bgPrimary,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
    padding: mobile ? theme.spacing.md : theme.spacing.lg,
  },
  pageHeader: {
    marginBottom: mobile ? theme.spacing.md : theme.spacing.xl,
  },
  title: {
    fontSize: mobile ? theme.typography.sizes['2xl'] : theme.typography.sizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  filtersBar: {
    display: mobile ? 'grid' : 'flex',
    gridTemplateColumns: mobile ? '1fr 1fr' : undefined,
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
    padding: theme.spacing.md,
    background: theme.colors.glassBg,
    backdropFilter: theme.colors.glassBackdrop,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: theme.radii.lg,
    marginBottom: theme.spacing.lg,
  },
  select: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.bgTertiary,
    color: theme.colors.textPrimary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: '16px', // Prevents iOS zoom
    minHeight: '44px',
    cursor: 'pointer',
    flex: mobile ? undefined : '1 1 140px',
    width: mobile ? '100%' : undefined,
  },
  startBtn: {
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    background: theme.colors.gradientPrimary,
    color: '#ffffff',
    border: 'none',
    borderRadius: theme.radii.md,
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.medium,
    fontSize: theme.typography.sizes.base,
    cursor: 'pointer',
    minHeight: '44px',
    whiteSpace: 'nowrap',
    transition: `opacity ${theme.transitions.fast}`,
    gridColumn: mobile ? '1 / -1' : undefined,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing['2xl'],
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  quizArea: {
    maxWidth: '720px',
    margin: '0 auto',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    background: '#000',
    marginBottom: theme.spacing.lg,
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizImage: {
    maxWidth: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    display: 'block',
  },
  card: {
    background: theme.colors.glassBg,
    backdropFilter: theme.colors.glassBackdrop,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    margin: 0,
  },
  historyText: {
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  answerRow: {
    display: 'flex',
    flexDirection: mobile ? 'column' : 'row',
    gap: theme.spacing.sm,
    alignItems: mobile ? 'stretch' : 'center',
  },
  input: {
    flex: 1,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.bgTertiary,
    color: theme.colors.textPrimary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: '16px', // Prevents iOS zoom
    minHeight: '44px',
    outline: 'none',
  },
  revealSection: {
    background: theme.colors.glassBg,
    backdropFilter: theme.colors.glassBackdrop,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  revealSub: {
    marginBottom: theme.spacing.md,
  },
  revealLabel: {
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  revealText: {
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  revealActions: {
    display: 'flex',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  btnDanger: {
    flex: 1,
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    background: theme.colors.error,
    color: '#ffffff',
    border: 'none',
    borderRadius: theme.radii.md,
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.medium,
    fontSize: theme.typography.sizes.base,
    cursor: 'pointer',
    minHeight: '48px',
    transition: `opacity ${theme.transitions.fast}`,
  },
  btnSuccess: {
    flex: 1,
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    background: theme.colors.success,
    color: '#ffffff',
    border: 'none',
    borderRadius: theme.radii.md,
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.medium,
    fontSize: theme.typography.sizes.base,
    cursor: 'pointer',
    minHeight: '48px',
    transition: `opacity ${theme.transitions.fast}`,
  },
  scoreBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.md,
    background: theme.colors.glassBg,
    borderRadius: theme.radii.lg,
    marginBottom: theme.spacing.lg,
    border: `1px solid ${theme.colors.glassBorder}`,
  },
  scoreStat: {
    textAlign: 'center',
  },
  scoreValue: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
  },
  scoreLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  noImage: {
    color: theme.colors.textMuted,
    padding: theme.spacing.xl,
    fontStyle: 'italic',
  },
  formLabel: {
    display: 'block',
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
});

export default function Quiz() {
  const api = useApi();
  const mobile = useIsMobile();
  const styles = getStyles(mobile);

  // Filters
  const [modality, setModality] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [difficulty, setDifficulty] = useState('');

  // Filter options
  const [modalities, setModalities] = useState([]);
  const [bodyParts, setBodyParts] = useState([]);

  // Quiz state
  const [currentCase, setCurrentCase] = useState(null);
  const [quizActive, setQuizActive] = useState(false);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const quizStartTimeRef = useRef(null);

  // Timer state
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false);

  // Score tracking
  const [score, setScore] = useState({ correct: 0, incorrect: 0, total: 0 });

  // Score animation key (triggers pop animation)
  const [scoreAnimKey, setScoreAnimKey] = useState(0);

  // Load filter options
  useEffect(() => {
    api.get('/api/filters').then((data) => {
      if (data) {
        setModalities(data.modalities || []);
        setBodyParts(data.bodyParts || []);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer effect
  useEffect(() => {
    if (quizActive && !revealed) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [quizActive, revealed, currentCase]);

  const startQuiz = useCallback(async () => {
    const params = new URLSearchParams();
    if (modality) params.append('modality', modality);
    if (bodyPart) params.append('body_part', bodyPart);
    if (difficulty) params.append('difficulty', difficulty);

    try {
      const data = await api.get(`/api/quiz/random?${params}`);
      setCurrentCase(data);
      setQuizActive(true);
      setRevealed(false);
      setAnswer('');
      quizStartTimeRef.current = Date.now();
    } catch {
      // No cases match
    }
  }, [api, modality, bodyPart, difficulty]);

  const revealAnswer = useCallback(() => {
    if (!currentCase) return;
    setRevealed(true);
  }, [currentCase]);

  const recordAttempt = useCallback(async (correct) => {
    if (!currentCase) return;
    const timeSpent = Date.now() - (quizStartTimeRef.current || Date.now());

    try {
      await api.post('/api/quiz/attempt', {
        case_id: currentCase.id,
        correct,
        time_spent_ms: timeSpent,
      });
    } catch {
      // silently fail
    }

    // Trigger confetti on correct answer
    if (correct) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1500);
    }

    setScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      incorrect: prev.incorrect + (correct ? 0 : 1),
      total: prev.total + 1,
    }));
    setScoreAnimKey(prev => prev + 1);

    // Load next case
    startQuiz();
  }, [currentCase, api, startQuiz]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !revealed) {
      revealAnswer();
    }
  }, [revealed, revealAnswer]);

  const imageSrc = currentCase?.images?.[0]
    ? `/uploads/${currentCase.images[0].filename}`
    : null;

  // Format elapsed time
  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress percentage
  const sessionTarget = 10; // target questions per session
  const progressPct = Math.min(100, Math.round((score.total / sessionTarget) * 100));

  // Generate confetti pieces
  const confettiPieces = useMemo(() => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'];
    return Array.from({ length: 24 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.5}s`,
      duration: `${0.8 + Math.random() * 0.7}s`,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 4,
    }));
  }, []);

  return (
    <div style={styles.container}>
      <style>{confettiCSS}</style>

      {/* Confetti overlay */}
      {showConfetti && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '50vh', pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
          {confettiPieces.map((p, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: '-10px',
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              borderRadius: i % 3 === 0 ? '50%' : '2px',
              animation: `quizConfettiFall ${p.duration} ${p.delay} ease-in forwards`,
            }} />
          ))}
        </div>
      )}

      <div style={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <div>
            <h2 style={styles.title}>Quiz Mode</h2>
            <p style={styles.subtitle}>Test your diagnostic skills</p>
          </div>
          {/* Progress ring */}
          {score.total > 0 && (
            <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ProgressRing progress={progressPct} />
              <div style={{
                position: 'absolute',
                fontSize: theme.typography.sizes.xs,
                fontWeight: theme.typography.fontWeights.bold,
                color: theme.colors.textPrimary,
              }}>
                {score.total}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filtersBar} role="search" aria-label="Quiz filters">
        <select
          style={styles.select}
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          aria-label="Filter by modality"
        >
          <option value="">All Modalities</option>
          {modalities.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          style={styles.select}
          value={bodyPart}
          onChange={(e) => setBodyPart(e.target.value)}
          aria-label="Filter by body part"
        >
          <option value="">All Body Parts</option>
          {bodyParts.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          style={styles.select}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          aria-label="Filter by difficulty"
        >
          <option value="">All Difficulties</option>
          <option value="1">Easy</option>
          <option value="2">Medium</option>
          <option value="3">Hard</option>
          <option value="4">Expert</option>
          <option value="5">Master</option>
        </select>

        <button
          style={styles.startBtn}
          onClick={startQuiz}
          disabled={api.loading}
          aria-label="Start quiz"
        >
          Start Quiz
        </button>
      </div>

      {/* Score bar */}
      {score.total > 0 && (
        <div style={styles.scoreBar} aria-label="Quiz score">
          <div style={styles.scoreStat}>
            <div key={`c-${scoreAnimKey}`} style={{ ...styles.scoreValue, color: theme.colors.success, animation: 'quizScorePop 300ms ease' }}>{score.correct}</div>
            <div style={styles.scoreLabel}>Correct</div>
          </div>
          <div style={styles.scoreStat}>
            <div key={`i-${scoreAnimKey}`} style={{ ...styles.scoreValue, color: theme.colors.error, animation: 'quizScorePop 300ms ease' }}>{score.incorrect}</div>
            <div style={styles.scoreLabel}>Missed</div>
          </div>
          <div style={styles.scoreStat}>
            <div key={`a-${scoreAnimKey}`} style={{ ...styles.scoreValue, color: theme.colors.accent, animation: 'quizScorePop 300ms ease' }}>
              {score.total > 0 ? Math.round((score.correct / score.total) * 100) + '%' : '-'}
            </div>
            <div style={styles.scoreLabel}>Accuracy</div>
          </div>
          {/* Timer */}
          {quizActive && (
            <div style={styles.scoreStat}>
              <div style={{ ...styles.scoreValue, color: theme.colors.info, fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(elapsed)}
              </div>
              <div style={styles.scoreLabel}>Time</div>
            </div>
          )}
        </div>
      )}

      {/* Timer (when no score bar yet) */}
      {quizActive && score.total === 0 && (
        <div style={{ ...styles.scoreBar, justifyContent: 'center' }}>
          <div style={styles.scoreStat}>
            <div style={{ ...styles.scoreValue, color: theme.colors.info, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(elapsed)}
            </div>
            <div style={styles.scoreLabel}>Time</div>
          </div>
        </div>
      )}

      {/* Quiz area */}
      {quizActive && currentCase ? (
        <div style={styles.quizArea}>
          {/* Case image */}
          <div style={styles.imageContainer}>
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="Quiz case"
                style={styles.quizImage}
              />
            ) : (
              <span style={styles.noImage}>No image available</span>
            )}
          </div>

          {/* Clinical history */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Clinical History</h3>
            <p style={styles.historyText}>
              {currentCase.clinical_history || 'No history provided'}
            </p>
          </div>

          {/* Answer input */}
          <div style={styles.card}>
            <label style={styles.formLabel} htmlFor="quizAnswer">
              What is your diagnosis?
            </label>
            <div style={styles.answerRow}>
              <input
                id="quizAnswer"
                type="text"
                style={styles.input}
                placeholder="Enter your diagnosis..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={revealed}
                aria-label="Your diagnosis"
              />
              <button
                style={styles.startBtn}
                onClick={revealAnswer}
                disabled={revealed}
              >
                Reveal
              </button>
            </div>
          </div>

          {/* Reveal section */}
          {revealed && (
            <div style={{ ...styles.revealSection, animation: 'quizRevealSlideUp 300ms ease-out' }}>
              <h3 style={{ ...styles.cardTitle, marginBottom: theme.spacing.md }}>
                Answer
              </h3>

              <div style={styles.revealSub}>
                <div style={styles.revealLabel}>Diagnosis:</div>
                <p style={styles.revealText}>{currentCase.diagnosis || '-'}</p>
              </div>

              <div style={styles.revealSub}>
                <div style={styles.revealLabel}>Key Findings:</div>
                <p style={styles.revealText}>{currentCase.findings || '-'}</p>
              </div>

              <div style={styles.revealSub}>
                <div style={styles.revealLabel}>Teaching Points:</div>
                <p style={styles.revealText}>{currentCase.teaching_points || '-'}</p>
              </div>

              <div style={styles.revealActions}>
                <button
                  style={styles.btnDanger}
                  onClick={() => recordAttempt(false)}
                  aria-label="Mark as missed"
                >
                  Missed it
                </button>
                <button
                  style={styles.btnSuccess}
                  onClick={() => recordAttempt(true)}
                  aria-label="Mark as correct"
                >
                  Got it!
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty state */
        !api.loading && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon} aria-hidden="true">&#x1F3AF;</div>
            <h3 style={styles.emptyTitle}>Ready to test your skills?</h3>
            <p>Select filters above and click Start Quiz to begin</p>
          </div>
        )
      )}

      {api.loading && (
        <div style={styles.emptyState}>
          <p style={{ color: theme.colors.textSecondary }}>Loading...</p>
        </div>
      )}

      {api.error && !currentCase && (
        <div style={styles.emptyState}>
          <p style={{ color: theme.colors.warning }}>
            No cases match your filters. Try different options.
          </p>
        </div>
      )}
    </div>
  );
}
