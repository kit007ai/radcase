import React, { useCallback } from 'react';
import theme from '../theme';

const styles = {
  cardGrid: {
    position: 'relative',
    cursor: 'pointer',
    background: theme.colors.bgCard,
    borderRadius: theme.radii.lg,
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    transition: `transform ${theme.transitions.normal}, box-shadow ${theme.transitions.normal}, border-color ${theme.transitions.normal}`,
  },
  cardGridHover: {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows.glow,
    borderColor: theme.colors.accent,
  },
  cardList: {
    position: 'relative',
    cursor: 'pointer',
    background: theme.colors.bgCard,
    borderRadius: theme.radii.lg,
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    transition: `transform ${theme.transitions.normal}, box-shadow ${theme.transitions.normal}, border-color ${theme.transitions.normal}`,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
    backgroundColor: theme.colors.bgTertiary,
  },
  imageWrapperList: {
    position: 'relative',
    width: '120px',
    minWidth: '120px',
    height: '80px',
    overflow: 'hidden',
    backgroundColor: theme.colors.bgTertiary,
    borderRadius: `${theme.radii.lg} 0 0 ${theme.radii.lg}`,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.bgTertiary,
  },
  placeholderList: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.bgTertiary,
  },
  content: {
    padding: theme.spacing.md,
  },
  contentList: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    display: 'flex',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  badge: {
    display: 'inline-block',
    padding: `2px ${theme.spacing.sm}`,
    borderRadius: theme.radii.full,
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    fontFamily: theme.typography.fontFamily,
  },
  badgeModality: {
    background: theme.colors.accentMuted,
    color: theme.colors.accentHover,
  },
  badgeBodypart: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: theme.colors.success,
  },
  difficulty: {
    display: 'flex',
    gap: '3px',
    marginTop: theme.spacing.xs,
    alignItems: 'center',
  },
  difficultyDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.border,
    transition: `background-color ${theme.transitions.fast}`,
  },
  difficultyDotActive: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.accent,
  },
  bookmarkBtn: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 2,
    background: 'rgba(0, 0, 0, 0.5)',
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    transition: `background ${theme.transitions.fast}`,
  },
  bookmarkBtnBookmarked: {
    background: 'rgba(239, 68, 68, 0.7)',
  },
  heartSvg: {
    width: '16px',
    height: '16px',
  },
};

export default function CaseCard({ caseData, viewMode = 'grid', isBookmarked, onBookmarkToggle, onClick }) {
  const [hovered, setHovered] = React.useState(false);

  const isList = viewMode === 'list';

  const handleBookmarkClick = useCallback((e) => {
    e.stopPropagation();
    if (onBookmarkToggle) onBookmarkToggle(caseData.id);
  }, [caseData.id, onBookmarkToggle]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick) onClick(caseData.id);
    }
  }, [caseData.id, onClick]);

  const handleClick = useCallback(() => {
    if (onClick) onClick(caseData.id);
  }, [caseData.id, onClick]);

  const handleImageError = useCallback((e) => {
    e.target.style.display = 'none';
  }, []);

  const cardStyle = {
    ...(isList ? styles.cardList : styles.cardGrid),
    ...(hovered ? styles.cardGridHover : {}),
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`View case: ${caseData.title}`}
      style={cardStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Bookmark button */}
      <button
        style={{
          ...styles.bookmarkBtn,
          ...(isBookmarked ? styles.bookmarkBtnBookmarked : {}),
        }}
        onClick={handleBookmarkClick}
        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this case'}
        title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
      >
        <svg viewBox="0 0 24 24" style={styles.heartSvg}>
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill={isBookmarked ? '#ef4444' : 'none'}
            stroke={isBookmarked ? '#ef4444' : '#e2e8f0'}
            strokeWidth="2"
          />
        </svg>
      </button>

      {/* Thumbnail */}
      <div style={isList ? styles.imageWrapperList : styles.imageWrapper}>
        {caseData.thumbnail ? (
          <img
            src={`/thumbnails/${caseData.thumbnail}`}
            alt={caseData.title}
            style={styles.image}
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div style={isList ? styles.placeholderList : styles.placeholder} aria-hidden="true">
            {'\u{1FA7B}'}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={isList ? styles.contentList : styles.content}>
        <h3 style={styles.title}>{caseData.title}</h3>
        <div style={styles.meta}>
          {caseData.modality && (
            <span style={{ ...styles.badge, ...styles.badgeModality }}>
              {caseData.modality}
            </span>
          )}
          {caseData.body_part && (
            <span style={{ ...styles.badge, ...styles.badgeBodypart }}>
              {caseData.body_part}
            </span>
          )}
        </div>
        <div style={styles.difficulty} aria-label={`Difficulty: ${caseData.difficulty || 0} out of 5`}>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              style={i <= (caseData.difficulty || 0) ? styles.difficultyDotActive : styles.difficultyDot}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </article>
  );
}
