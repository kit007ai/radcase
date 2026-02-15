import React, { useCallback } from 'react';
import theme from '../theme';

// Difficulty color mapping
const difficultyColors = {
  1: '#10b981', // green - easy
  2: '#f59e0b', // yellow - medium
  3: '#ef4444', // red - hard
  4: '#8b5cf6', // purple - expert
  5: '#ec4899', // pink - master
};

const getDifficultyAccent = (level) => difficultyColors[level] || theme.colors.border;

const styles = {
  cardGrid: {
    position: 'relative',
    cursor: 'pointer',
    background: theme.colors.bgCard,
    borderRadius: theme.radii.lg,
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    transition: `transform ${theme.transitions.normal}, box-shadow ${theme.transitions.normal}, border-color ${theme.transitions.normal}`,
    minWidth: 0,
    maxWidth: '100%',
  },
  cardGridHover: {
    transform: 'translateY(-4px)',
    boxShadow: `${theme.shadows.glow}, 0 8px 25px rgba(0, 0, 0, 0.3)`,
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
  // Gradient overlay on image area
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  // Image count badge
  imageCountBadge: {
    position: 'absolute',
    bottom: '6px',
    right: '6px',
    zIndex: 2,
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#e2e8f0',
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: theme.radii.sm,
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontFamily: theme.typography.fontFamily,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
    backgroundColor: theme.colors.bgTertiary,
  },
  imageWrapperCompact: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4 / 3',
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
  placeholderCompact: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.8rem',
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
    minWidth: 0,
    overflow: 'hidden',
  },
  contentCompact: {
    padding: theme.spacing.sm,
    minWidth: 0,
    overflow: 'hidden',
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
  titleCompact: {
    margin: 0,
    fontSize: theme.typography.sizes.sm,
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
  metaCompact: {
    display: 'flex',
    gap: '3px',
    marginTop: '3px',
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
  badgeCompact: {
    display: 'inline-block',
    padding: `1px 6px`,
    borderRadius: theme.radii.full,
    fontSize: '0.65rem',
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
  difficultyCompact: {
    display: 'flex',
    gap: '2px',
    marginTop: '3px',
    alignItems: 'center',
  },
  difficultyDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.border,
    transition: `background-color ${theme.transitions.fast}`,
  },
  difficultyDotCompact: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: theme.colors.border,
  },
  difficultyDotActive: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.accent,
  },
  difficultyDotActiveCompact: {
    width: '5px',
    height: '5px',
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
  bookmarkBtnCompact: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    zIndex: 2,
    background: 'rgba(0, 0, 0, 0.5)',
    border: 'none',
    borderRadius: '50%',
    width: '26px',
    height: '26px',
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
  heartSvgCompact: {
    width: '13px',
    height: '13px',
  },
};

export default function CaseCard({ caseData, viewMode = 'grid', isBookmarked, onBookmarkToggle, onClick, compact = false }) {
  const [hovered, setHovered] = React.useState(false);

  const isList = viewMode === 'list';

  const handleBookmarkClick = useCallback((e) => {
    e.stopPropagation();
    if (onBookmarkToggle) onBookmarkToggle(caseData.id);
  }, [caseData.id, onBookmarkToggle]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick) onClick(caseData);
    }
  }, [caseData, onClick]);

  const handleClick = useCallback(() => {
    if (onClick) onClick(caseData);
  }, [caseData, onClick]);

  const handleImageError = useCallback((e) => {
    e.target.style.display = 'none';
  }, []);

  const accentColor = getDifficultyAccent(caseData.difficulty);
  const cardStyle = {
    ...(isList ? styles.cardList : styles.cardGrid),
    ...(hovered ? styles.cardGridHover : {}),
    borderLeft: `3px solid ${accentColor}`,
  };

  // Pick style variants based on compact mode
  const imgWrapperStyle = isList
    ? styles.imageWrapperList
    : compact ? styles.imageWrapperCompact : styles.imageWrapper;
  const placeholderStyle = isList
    ? styles.placeholderList
    : compact ? styles.placeholderCompact : styles.placeholder;
  const contentStyle = isList
    ? styles.contentList
    : compact ? styles.contentCompact : styles.content;
  const titleStyle = compact ? styles.titleCompact : styles.title;
  const metaStyle = compact ? styles.metaCompact : styles.meta;
  const badgeStyle = compact ? styles.badgeCompact : styles.badge;
  const diffStyle = compact ? styles.difficultyCompact : styles.difficulty;
  const dotStyle = compact ? styles.difficultyDotCompact : styles.difficultyDot;
  const dotActiveStyle = compact ? styles.difficultyDotActiveCompact : styles.difficultyDotActive;
  const bmkBtnStyle = compact ? styles.bookmarkBtnCompact : styles.bookmarkBtn;
  const svgStyle = compact ? styles.heartSvgCompact : styles.heartSvg;

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
          ...bmkBtnStyle,
          ...(isBookmarked ? styles.bookmarkBtnBookmarked : {}),
        }}
        onClick={handleBookmarkClick}
        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this case'}
        title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
      >
        <svg viewBox="0 0 24 24" style={svgStyle}>
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill={isBookmarked ? '#ef4444' : 'none'}
            stroke={isBookmarked ? '#ef4444' : '#e2e8f0'}
            strokeWidth="2"
          />
        </svg>
      </button>

      {/* Thumbnail */}
      <div style={imgWrapperStyle}>
        {caseData.thumbnail ? (
          <img
            src={`/thumbnails/${caseData.thumbnail}`}
            alt={caseData.title}
            style={styles.image}
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div style={placeholderStyle} aria-hidden="true">
            {'\u{1FA7B}'}
          </div>
        )}
        {/* Gradient overlay for readability */}
        {!isList && <div style={styles.imageGradient} />}
        {/* Image count badge */}
        {caseData.image_count > 0 && !isList && (
          <div style={styles.imageCountBadge}>
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            {caseData.image_count}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        <h3 style={titleStyle}>{caseData.title}</h3>
        <div style={metaStyle}>
          {caseData.modality && (
            <span style={{ ...badgeStyle, ...styles.badgeModality }}>
              {caseData.modality}
            </span>
          )}
          {caseData.body_part && (
            <span style={{ ...badgeStyle, ...styles.badgeBodypart }}>
              {caseData.body_part}
            </span>
          )}
        </div>
        <div style={diffStyle} aria-label={`Difficulty: ${caseData.difficulty || 0} out of 5`}>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              style={i <= (caseData.difficulty || 0) ? dotActiveStyle : dotStyle}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </article>
  );
}
