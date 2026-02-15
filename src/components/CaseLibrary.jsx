import React, { useState, useEffect, useCallback, useRef } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import CaseCard from './CaseCard';

const styles = {
  page: {
    padding: theme.spacing.lg,
    maxWidth: '1400px',
    margin: '0 auto',
  },
  pageHeader: {
    marginBottom: theme.spacing.lg,
  },
  pageTitle: {
    margin: 0,
    fontSize: theme.typography.sizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
  },
  pageSubtitle: {
    margin: `${theme.spacing.xs} 0 0`,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
  },
  searchBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  searchInputWrapper: {
    position: 'relative',
    flex: '1 1 280px',
    minWidth: '200px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: theme.typography.sizes.base,
    color: theme.colors.textMuted,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: `10px 12px 10px 36px`,
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    boxSizing: 'border-box',
    transition: `border-color ${theme.transitions.fast}`,
  },
  filterGroup: {
    display: 'flex',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  filterSelect: {
    padding: '10px 12px',
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  },
  bookmarkFilterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: `8px ${theme.spacing.md}`,
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: `all ${theme.transitions.fast}`,
  },
  bookmarkFilterBtnActive: {
    background: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    color: '#ef4444',
  },
  viewToggle: {
    display: 'flex',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    padding: '8px 12px',
    background: theme.colors.glassBg,
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    transition: `all ${theme.transitions.fast}`,
  },
  viewToggleBtnActive: {
    background: theme.colors.accentMuted,
    color: theme.colors.accent,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: theme.spacing.md,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: theme.spacing['2xl'],
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    margin: 0,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
  },
  emptyText: {
    margin: `${theme.spacing.sm} 0 ${theme.spacing.md}`,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
  },
  addBtn: {
    padding: `10px ${theme.spacing.lg}`,
    background: theme.colors.gradientPrimary,
    border: 'none',
    borderRadius: theme.radii.md,
    color: '#fff',
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: `opacity ${theme.transitions.fast}`,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  pageBtn: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: `all ${theme.transitions.fast}`,
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  pageInfo: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
  },
  loadingText: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: theme.spacing['2xl'],
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
  },
};

const ITEMS_PER_PAGE = 20;

export default function CaseLibrary({ onViewCase, onNavigateAdd }) {
  const api = useApi();
  const { user } = useAuth();

  const [cases, setCases] = useState([]);
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [bookmarkFilter, setBookmarkFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCases, setTotalCases] = useState(0);
  const [loading, setLoading] = useState(false);

  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [filters, setFilters] = useState({ modalities: [], bodyParts: [] });

  const searchTimeout = useRef(null);

  // Load filter options
  useEffect(() => {
    async function loadFilters() {
      try {
        const data = await api.get('/api/filters');
        if (data) {
          setFilters({
            modalities: data.modalities || [],
            bodyParts: data.bodyParts || [],
          });
        }
      } catch {
        // filters are non-critical
      }
    }
    loadFilters();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load bookmarks
  useEffect(() => {
    async function loadBookmarks() {
      if (!user) {
        setBookmarkedIds(new Set());
        return;
      }
      try {
        const data = await api.get('/api/bookmarks');
        if (data && data.bookmarks) {
          setBookmarkedIds(new Set(data.bookmarks.map(b => b.case_id)));
        }
      } catch {
        // bookmarks are non-critical
      }
    }
    loadBookmarks();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load cases
  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (modality) params.append('modality', modality);
      if (bodyPart) params.append('body_part', bodyPart);
      if (difficulty) params.append('difficulty', difficulty);
      params.append('page', page);
      params.append('limit', ITEMS_PER_PAGE);

      const data = await api.get(`/api/cases?${params}`);
      let fetchedCases = data?.cases || data || [];

      if (bookmarkFilter && bookmarkedIds.size > 0) {
        fetchedCases = fetchedCases.filter(c => bookmarkedIds.has(c.id));
      } else if (bookmarkFilter) {
        fetchedCases = [];
      }

      setCases(fetchedCases);
      setTotalCases(data?.total || fetchedCases.length);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [search, modality, bodyPart, difficulty, page, bookmarkFilter, bookmarkedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Debounced search
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Bookmark toggle
  const handleBookmarkToggle = useCallback(async (caseId) => {
    if (!user) return;
    const isBookmarked = bookmarkedIds.has(caseId);
    try {
      if (isBookmarked) {
        await api.del(`/api/bookmarks/${caseId}`);
        setBookmarkedIds(prev => {
          const next = new Set(prev);
          next.delete(caseId);
          return next;
        });
      } else {
        await api.post('/api/bookmarks', { case_id: caseId });
        setBookmarkedIds(prev => new Set(prev).add(caseId));
      }
    } catch {
      // failed silently
    }
  }, [user, bookmarkedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(totalCases / ITEMS_PER_PAGE));

  return (
    <section style={styles.page} aria-label="Case Library">
      <div style={styles.pageHeader}>
        <h2 style={styles.pageTitle} tabIndex={-1}>Case Library</h2>
        <p style={styles.pageSubtitle}>Browse and search your radiology teaching cases</p>
      </div>

      {/* Search and Filter Bar */}
      <div style={styles.searchBar} role="search" aria-label="Search and filter cases">
        <div style={styles.searchInputWrapper}>
          <span style={styles.searchIcon} aria-hidden="true">{'\u{1F50D}'}</span>
          <input
            type="text"
            style={styles.searchInput}
            placeholder="Search cases..."
            aria-label="Search radiology cases"
            autoComplete="off"
            onChange={handleSearchChange}
            onFocus={(e) => { e.target.style.borderColor = theme.colors.accent; }}
            onBlur={(e) => { e.target.style.borderColor = theme.colors.border; }}
          />
        </div>

        <div style={styles.filterGroup}>
          <select
            style={styles.filterSelect}
            aria-label="Filter by modality"
            value={modality}
            onChange={(e) => { setModality(e.target.value); setPage(1); }}
          >
            <option value="">All Modalities</option>
            {filters.modalities.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            style={styles.filterSelect}
            aria-label="Filter by body part"
            value={bodyPart}
            onChange={(e) => { setBodyPart(e.target.value); setPage(1); }}
          >
            <option value="">All Body Parts</option>
            {filters.bodyParts.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            style={styles.filterSelect}
            aria-label="Filter by difficulty level"
            value={difficulty}
            onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}
          >
            <option value="">All Difficulties</option>
            <option value="1">Easy</option>
            <option value="2">Medium</option>
            <option value="3">Hard</option>
            <option value="4">Expert</option>
            <option value="5">Master</option>
          </select>

          <button
            style={{
              ...styles.bookmarkFilterBtn,
              ...(bookmarkFilter ? styles.bookmarkFilterBtnActive : {}),
            }}
            onClick={() => { setBookmarkFilter(prev => !prev); setPage(1); }}
            aria-label="Show bookmarked cases only"
            aria-pressed={bookmarkFilter}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={bookmarkFilter ? '#ef4444' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            Bookmarks
          </button>

          {/* View mode toggle */}
          <div style={styles.viewToggle} role="radiogroup" aria-label="View mode">
            <button
              style={{
                ...styles.viewToggleBtn,
                ...(viewMode === 'grid' ? styles.viewToggleBtnActive : {}),
              }}
              onClick={() => setViewMode('grid')}
              role="radio"
              aria-checked={viewMode === 'grid'}
              aria-label="Grid view"
              title="Grid view"
            >
              {'\u{25A6}'}
            </button>
            <button
              style={{
                ...styles.viewToggleBtn,
                ...(viewMode === 'list' ? styles.viewToggleBtnActive : {}),
              }}
              onClick={() => setViewMode('list')}
              role="radio"
              aria-checked={viewMode === 'list'}
              aria-label="List view"
              title="List view"
            >
              {'\u{2630}'}
            </button>
          </div>
        </div>
      </div>

      {/* Case Grid / List */}
      <div style={viewMode === 'grid' ? styles.grid : styles.list} role="list" aria-label="Case list">
        {loading ? (
          <div style={styles.loadingText} role="status" aria-live="polite">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon} aria-hidden="true">{'\u{1F4C2}'}</div>
            <h3 style={styles.emptyTitle}>No cases found</h3>
            <p style={styles.emptyText}>Add your first case to get started!</p>
            {onNavigateAdd && (
              <button style={styles.addBtn} onClick={onNavigateAdd}>
                + Add Case
              </button>
            )}
          </div>
        ) : (
          cases.map(c => (
            <div key={c.id} role="listitem">
              <CaseCard
                caseData={c}
                viewMode={viewMode}
                isBookmarked={bookmarkedIds.has(c.id)}
                onBookmarkToggle={handleBookmarkToggle}
                onClick={onViewCase}
              />
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && cases.length > 0 && totalPages > 1 && (
        <nav style={styles.pagination} aria-label="Pagination">
          <button
            style={{
              ...styles.pageBtn,
              ...(page <= 1 ? styles.pageBtnDisabled : {}),
            }}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            style={{
              ...styles.pageBtn,
              ...(page >= totalPages ? styles.pageBtnDisabled : {}),
            }}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
