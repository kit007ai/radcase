import React, { useState, useEffect, useRef } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';
import useIsMobile from '../hooks/useIsMobile';

const analyticsCSS = `
@keyframes analyticsBarGrow {
  from { width: 0%; }
}
@keyframes analyticsFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
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
  grid: {
    display: 'grid',
    gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: mobile ? theme.spacing.md : theme.spacing.lg,
  },
  card: {
    background: theme.colors.glassBg,
    backdropFilter: theme.colors.glassBackdrop,
    WebkitBackdropFilter: theme.colors.glassBackdrop,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: theme.radii.lg,
    padding: mobile ? theme.spacing.md : theme.spacing.lg,
    overflow: 'hidden',
    transition: `box-shadow ${theme.transitions.normal}`,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    margin: 0,
    paddingBottom: theme.spacing.sm,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${theme.spacing.sm} 0`,
    borderBottom: `1px solid rgba(255, 255, 255, 0.03)`,
  },
  statLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  statValue: {
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.base,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
    padding: `${theme.spacing.md} 0`,
  },
  // Performance bar charts
  barContainer: {
    marginTop: theme.spacing.sm,
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  barLabel: {
    minWidth: mobile ? '60px' : '80px',
    fontSize: mobile ? theme.typography.sizes.xs : theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: '20px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: theme.colors.gradientPrimary,
    borderRadius: theme.radii.sm,
    transition: `width ${theme.transitions.slow}`,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: theme.spacing.xs,
  },
  barCount: {
    fontSize: theme.typography.sizes.xs,
    color: '#ffffff',
    fontWeight: theme.typography.fontWeights.medium,
  },
  // Review items
  reviewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${theme.spacing.sm} 0`,
    borderBottom: `1px solid rgba(255, 255, 255, 0.03)`,
    cursor: 'pointer',
    transition: `background ${theme.transitions.fast}`,
  },
  reviewTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.sm,
  },
  reviewMisses: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  // Loading state
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing['2xl'],
    color: theme.colors.textMuted,
  },
  // Summary stats (top row)
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: mobile ? theme.spacing.sm : theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  summaryCard: {
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.glassBorder}`,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    textAlign: 'center',
    animation: 'analyticsFadeIn 400ms ease-out backwards',
  },
  summaryValue: {
    fontSize: theme.typography.sizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    marginBottom: theme.spacing.xs,
  },
  summaryLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
});

export default function Analytics() {
  const api = useApi();
  const mobile = useIsMobile();
  const styles = getStyles(mobile);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger bar animation after data loads
  useEffect(() => {
    if (analyticsData || quizData) {
      const timer = setTimeout(() => setMounted(true), 100);
      return () => clearTimeout(timer);
    }
  }, [analyticsData, quizData]);

  async function loadAnalytics() {
    try {
      const [analytics, quiz] = await Promise.all([
        api.get('/api/analytics'),
        api.get('/api/quiz/stats'),
      ]);
      setAnalyticsData(analytics);
      setQuizData(quiz);
    } catch {
      // failed to load
    }
  }

  if (api.loading && !analyticsData) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading analytics...</div>
      </div>
    );
  }

  const overall = quizData?.overall || {};
  const totalAttempts = overall.total_attempts || 0;
  const correctCount = overall.correct_count || 0;
  const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) + '%' : '-';
  const avgTime = overall.avg_time_ms ? Math.round(overall.avg_time_ms / 1000) + 's' : '-';

  const byModality = analyticsData?.byModality || [];
  const byBodyPart = analyticsData?.byBodyPart || [];
  const recentMisses = quizData?.recentMisses || [];

  const maxModality = Math.max(1, ...byModality.map((m) => m.count));
  const maxBodyPart = Math.max(1, ...byBodyPart.map((b) => b.count));

  // Calculate streak (consecutive correct answers from recent data)
  const streak = quizData?.streak || 0;

  return (
    <div style={styles.container}>
      <style>{analyticsCSS}</style>
      <div style={styles.pageHeader}>
        <h2 style={styles.title}>Analytics</h2>
        <p style={styles.subtitle}>Track your learning progress</p>
      </div>

      {/* Summary stats */}
      <div style={styles.summaryGrid}>
        <div style={{ ...styles.summaryCard, borderTop: `3px solid ${theme.colors.accent}`, animationDelay: '0ms' }}>
          <div style={{ ...styles.summaryValue, color: theme.colors.accent }}>
            {totalAttempts}
          </div>
          <div style={styles.summaryLabel}>Total Attempts</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTop: `3px solid ${theme.colors.success}`, animationDelay: '80ms' }}>
          <div style={{ ...styles.summaryValue, color: theme.colors.success }}>
            {correctCount}
          </div>
          <div style={styles.summaryLabel}>Correct</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTop: `3px solid ${theme.colors.warning}`, animationDelay: '160ms' }}>
          <div style={{ ...styles.summaryValue, color: theme.colors.warning }}>
            {accuracy}
          </div>
          <div style={styles.summaryLabel}>Accuracy</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTop: `3px solid ${theme.colors.info}`, animationDelay: '240ms' }}>
          <div style={{ ...styles.summaryValue, color: theme.colors.info }}>
            {avgTime}
          </div>
          <div style={styles.summaryLabel}>Avg Time</div>
        </div>
      </div>

      {/* Streak visualization */}
      {streak > 0 && (
        <div style={{
          ...styles.summaryCard,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          borderLeft: `3px solid ${theme.colors.warning}`,
        }}>
          <div style={{ fontSize: '1.5rem' }}>&#x1F525;</div>
          <div>
            <div style={{ ...styles.summaryValue, color: theme.colors.warning }}>{streak}</div>
            <div style={styles.summaryLabel}>Current Streak</div>
          </div>
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            {Array.from({ length: Math.min(streak, 10) }, (_, i) => (
              <div key={i} style={{
                width: '8px',
                height: `${12 + i * 2}px`,
                borderRadius: '2px',
                background: `linear-gradient(to top, ${theme.colors.warning}, ${theme.colors.error})`,
                opacity: 0.5 + (i / 10) * 0.5,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Detail cards */}
      <div style={styles.grid}>
        {/* Quiz Performance */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Quiz Performance</h3>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Total Attempts</span>
            <span style={styles.statValue}>{totalAttempts}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Correct</span>
            <span style={styles.statValue}>{correctCount}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Accuracy</span>
            <span style={styles.statValue}>{accuracy}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Avg Time</span>
            <span style={styles.statValue}>{avgTime}</span>
          </div>
        </div>

        {/* Cases by Modality */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cases by Modality</h3>
          {byModality.length > 0 ? (
            <div style={styles.barContainer}>
              {byModality.map((m, idx) => (
                <div key={m.modality} style={styles.barRow}>
                  <span style={styles.barLabel}>{m.modality}</span>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: mounted ? `${(m.count / maxModality) * 100}%` : '0%',
                        transition: `width 600ms ${idx * 100}ms ease-out`,
                      }}
                    >
                      <span style={styles.barCount}>{m.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>No data yet</p>
          )}
        </div>

        {/* Cases by Body Part */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cases by Body Part</h3>
          {byBodyPart.length > 0 ? (
            <div style={styles.barContainer}>
              {byBodyPart.map((b, idx) => (
                <div key={b.body_part} style={styles.barRow}>
                  <span style={styles.barLabel}>{b.body_part}</span>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: mounted ? `${(b.count / maxBodyPart) * 100}%` : '0%',
                        transition: `width 600ms ${idx * 100}ms ease-out`,
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                      }}
                    >
                      <span style={styles.barCount}>{b.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>No data yet</p>
          )}
        </div>

        {/* Cases to Review */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cases to Review</h3>
          {recentMisses.length > 0 ? (
            recentMisses.map((c) => (
              <div key={c.id} style={styles.reviewRow} role="link" tabIndex={0}>
                <span style={styles.reviewTitle}>{c.title}</span>
                <span style={styles.reviewMisses}>{c.miss_count} misses</span>
              </div>
            ))
          ) : (
            <p style={styles.emptyText}>No cases need review yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
