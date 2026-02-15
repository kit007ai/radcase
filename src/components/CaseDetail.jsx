import React, { useState, useEffect, useCallback, useRef } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  modal: {
    position: 'relative',
    background: theme.colors.bgSecondary,
    borderRadius: theme.radii.xl,
    border: `1px solid ${theme.colors.border}`,
    width: '100%',
    maxWidth: '1100px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: theme.shadows.lg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
  },
  title: {
    flex: 1,
    margin: 0,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerBtn: {
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textSecondary,
    padding: theme.spacing.sm,
    cursor: 'pointer',
    fontSize: theme.typography.sizes.base,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: `all ${theme.transitions.fast}`,
    fontFamily: theme.typography.fontFamily,
  },
  headerBtnActive: {
    background: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    color: '#ef4444',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.xl,
    cursor: 'pointer',
    padding: theme.spacing.xs,
    lineHeight: 1,
    transition: `color ${theme.transitions.fast}`,
  },
  tabs: {
    display: 'flex',
    gap: '2px',
    background: theme.colors.glassBg,
    borderRadius: theme.radii.md,
    padding: '2px',
  },
  tabBtn: {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderRadius: theme.radii.sm,
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: `all ${theme.transitions.fast}`,
  },
  tabBtnActive: {
    background: theme.colors.accentMuted,
    color: theme.colors.accent,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing.lg,
  },
  caseView: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.lg,
  },
  caseViewMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  viewerContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  mainImage: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: theme.radii.md,
    background: theme.colors.bgPrimary,
  },
  thumbnailStrip: {
    display: 'flex',
    gap: theme.spacing.xs,
    overflowX: 'auto',
    paddingBottom: theme.spacing.xs,
  },
  thumbnail: {
    width: '60px',
    height: '60px',
    borderRadius: theme.radii.sm,
    border: `2px solid transparent`,
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
    transition: `border-color ${theme.transitions.fast}`,
  },
  thumbnailActive: {
    borderColor: theme.colors.accent,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  noImages: {
    color: theme.colors.textMuted,
    padding: theme.spacing.lg,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  meta: {
    display: 'flex',
    gap: theme.spacing.sm,
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
    alignItems: 'center',
  },
  difficultyDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.border,
  },
  difficultyDotActive: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.accent,
  },
  section: {
    background: theme.colors.glassBg,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.glassBorder}`,
  },
  sectionTitle: {
    margin: `0 0 ${theme.spacing.xs}`,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sectionContent: {
    margin: 0,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  diagnosisContent: {
    color: theme.colors.accent,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  footer: {
    display: 'flex',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderTop: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
  },
  btn: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.radii.md,
    border: 'none',
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.medium,
    cursor: 'pointer',
    transition: `opacity ${theme.transitions.fast}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  btnDanger: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: theme.colors.error,
  },
  btnSecondary: {
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.border}`,
  },
  btnPrimary: {
    background: theme.colors.gradientPrimary,
    color: '#fff',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 1001,
    background: 'rgba(0, 0, 0, 0.6)',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textPrimary,
    fontSize: '1.5rem',
    cursor: 'pointer',
    transition: `background ${theme.transitions.fast}`,
  },
  navBtnPrev: {
    left: theme.spacing.sm,
  },
  navBtnNext: {
    right: theme.spacing.sm,
  },
  dicomPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  dicomSeriesBtn: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    textAlign: 'left',
    transition: `all ${theme.transitions.fast}`,
  },
  dicomSeriesBtnActive: {
    borderColor: theme.colors.accent,
    background: theme.colors.accentMuted,
    color: theme.colors.accent,
  },
  dicomViewerArea: {
    width: '100%',
    height: '400px',
    background: '#000',
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  dicomUploadSection: {
    padding: theme.spacing.md,
    background: theme.colors.glassBg,
    borderRadius: theme.radii.md,
    border: `1px solid ${theme.colors.glassBorder}`,
  },
  dicomUploadInner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  uploadBtn: {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
  },
  fileCount: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
  },
};

export default function CaseDetail({
  caseId,
  caseIds = [],
  onClose,
  onNavigateCase,
  onDelete,
}) {
  const api = useApi();
  const { user } = useAuth();
  const dicomContainerRef = useRef(null);
  const dicomViewerRef = useRef(null);

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('images');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [dicomSeries, setDicomSeries] = useState([]);
  const [activeDicomSeriesId, setActiveDicomSeriesId] = useState(null);
  const [dicomFiles, setDicomFiles] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Responsive check
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load case data
  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    async function loadCase() {
      setLoading(true);
      try {
        const data = await api.get(`/api/cases/${caseId}`);
        if (!cancelled) {
          setCaseData(data);
          setSelectedImageIndex(0);
          setActiveTab('images');
        }
      } catch {
        if (!cancelled) setCaseData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCase();
    return () => { cancelled = true; };
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load DICOM series
  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    async function loadDicom() {
      try {
        const data = await api.get(`/api/cases/${caseId}/dicom`);
        if (!cancelled) {
          const series = data?.series || [];
          setDicomSeries(series);
          setActiveDicomSeriesId(series.length > 0 ? series[0].id : null);
        }
      } catch {
        if (!cancelled) setDicomSeries([]);
      }
    }
    loadDicom();
    return () => { cancelled = true; };
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check bookmark state
  useEffect(() => {
    if (!user || !caseId) return;
    let cancelled = false;
    async function checkBookmark() {
      try {
        const data = await api.get('/api/bookmarks');
        if (!cancelled && data?.bookmarks) {
          setIsBookmarked(data.bookmarks.some(b => b.case_id === caseId));
        }
      } catch {
        // non-critical
      }
    }
    checkBookmark();
    return () => { cancelled = true; };
  }, [user, caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (onClose) onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateCase(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateCase(1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [caseIds, caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize DICOM viewer when switching to DICOM tab
  useEffect(() => {
    if (activeTab !== 'dicom' || !dicomContainerRef.current || dicomSeries.length === 0) return;

    const cs = window.cornerstone;
    const csTools = window.cornerstoneTools;
    if (!cs || !csTools) return;

    // Initialize DICOM viewer on the container
    const element = dicomContainerRef.current;
    try {
      cs.enable(element);
    } catch {
      // already enabled
    }

    if (activeDicomSeriesId) {
      loadDicomSeriesData(activeDicomSeriesId);
    }

    return () => {
      try {
        cs.disable(element);
      } catch {
        // ignore
      }
    };
  }, [activeTab, activeDicomSeriesId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDicomSeriesData = useCallback(async (seriesId) => {
    try {
      const data = await api.get(`/api/dicom/${seriesId}`);
      if (data?.imageIds?.length > 0 && dicomContainerRef.current) {
        const cs = window.cornerstone;
        if (!cs) return;
        const imageId = data.imageIds[0];
        const image = await cs.loadImage(imageId);
        cs.displayImage(dicomContainerRef.current, image);
      }
    } catch {
      // DICOM load failed
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateCase = useCallback((dir) => {
    if (caseIds.length === 0) return;
    const currentIndex = caseIds.indexOf(caseId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= caseIds.length) return;
    if (onNavigateCase) onNavigateCase(caseIds[nextIndex]);
  }, [caseIds, caseId, onNavigateCase]);

  const handleBookmarkToggle = useCallback(async () => {
    if (!user || !caseId) return;
    try {
      if (isBookmarked) {
        await api.del(`/api/bookmarks/${caseId}`);
        setIsBookmarked(false);
      } else {
        await api.post('/api/bookmarks', { case_id: caseId });
        setIsBookmarked(true);
      }
    } catch {
      // failed silently
    }
  }, [user, caseId, isBookmarked]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoiceToggle = useCallback(() => {
    if (typeof window.voiceNarrator === 'undefined') return;
    if (voiceActive) {
      window.voiceNarrator.stop();
      setVoiceActive(false);
    } else if (caseData) {
      setVoiceActive(true);
      window.voiceNarrator.onEnd = () => setVoiceActive(false);
      window.voiceNarrator.onError = () => setVoiceActive(false);
      window.voiceNarrator.readCase(caseData);
    }
  }, [voiceActive, caseData]);

  const handleDelete = useCallback(async () => {
    if (!caseData || !window.confirm('Delete this case? This cannot be undone.')) return;
    try {
      await api.del(`/api/cases/${caseData.id}`);
      if (onDelete) onDelete(caseData.id);
      if (onClose) onClose();
    } catch {
      // delete failed
    }
  }, [caseData, onDelete, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && onClose) onClose();
  }, [onClose]);

  const handleDicomFileChange = useCallback((e) => {
    setDicomFiles(Array.from(e.target.files));
  }, []);

  const handleDicomUpload = useCallback(async () => {
    if (!caseData || dicomFiles.length === 0) return;
    const formData = new FormData();
    dicomFiles.forEach(f => formData.append('files', f));
    try {
      await api.upload(`/api/cases/${caseData.id}/dicom`, formData);
      setDicomFiles([]);
      // Reload DICOM series
      const data = await api.get(`/api/cases/${caseData.id}/dicom`);
      const series = data?.series || [];
      setDicomSeries(series);
      if (series.length > 0) {
        setActiveDicomSeriesId(series[0].id);
        setActiveTab('dicom');
      }
    } catch {
      // upload failed
    }
  }, [caseData, dicomFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch swipe for case navigation
  const touchStartRef = useRef({ x: 0, y: 0 });
  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);
  const handleTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    navigateCase(dx < 0 ? 1 : -1);
  }, [navigateCase]);

  if (!caseId) return null;

  const images = caseData?.images || [];
  const currentImage = images[selectedImageIndex];
  const hasDicom = dicomSeries.length > 0;
  const currentIndex = caseIds.indexOf(caseId);
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < caseIds.length - 1;

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={caseData ? `Case: ${caseData.title}` : 'Case Detail'}
    >
      {/* Navigation arrows */}
      {canPrev && (
        <button
          style={{ ...styles.navBtn, ...styles.navBtnPrev }}
          onClick={() => navigateCase(-1)}
          aria-label="Previous case"
        >
          {'\u{2039}'}
        </button>
      )}
      {canNext && (
        <button
          style={{ ...styles.navBtn, ...styles.navBtnNext }}
          onClick={() => navigateCase(1)}
          aria-label="Next case"
        >
          {'\u{203A}'}
        </button>
      )}

      <div
        style={styles.modal}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>{loading ? 'Loading...' : (caseData?.title || 'Case Details')}</h2>

          {/* Bookmark */}
          <button
            style={{
              ...styles.headerBtn,
              ...(isBookmarked ? styles.headerBtnActive : {}),
            }}
            onClick={handleBookmarkToggle}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this case'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={isBookmarked ? '#ef4444' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>

          {/* Voice narration */}
          <button
            style={{
              ...styles.headerBtn,
              ...(voiceActive ? styles.headerBtnActive : {}),
            }}
            onClick={handleVoiceToggle}
            aria-label="Read case aloud"
            title="Read case aloud"
          >
            {'\u{1F50A}'}
          </button>

          {/* Viewer tabs */}
          {hasDicom && (
            <div style={styles.tabs}>
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'images' ? styles.tabBtnActive : {}),
                }}
                onClick={() => setActiveTab('images')}
              >
                Images
              </button>
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'dicom' ? styles.tabBtnActive : {}),
                }}
                onClick={() => setActiveTab('dicom')}
              >
                DICOM
              </button>
            </div>
          )}

          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            {'\u{2715}'}
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: theme.spacing['2xl'], color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily }}>
              Loading case...
            </div>
          ) : caseData ? (
            <div style={isMobile ? styles.caseViewMobile : styles.caseView}>
              {/* Viewer panel */}
              <div style={styles.viewerContainer}>
                {activeTab === 'images' ? (
                  <>
                    {images.length > 0 ? (
                      <>
                        <img
                          src={`/uploads/${currentImage.filename}`}
                          alt={caseData.title}
                          style={styles.mainImage}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div style={styles.thumbnailStrip} role="listbox" aria-label="Image thumbnails">
                          {images.map((img, i) => (
                            <div
                              key={img.id || i}
                              role="option"
                              aria-selected={i === selectedImageIndex}
                              style={{
                                ...styles.thumbnail,
                                ...(i === selectedImageIndex ? styles.thumbnailActive : {}),
                              }}
                              onClick={() => setSelectedImageIndex(i)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedImageIndex(i);
                                }
                              }}
                            >
                              <img
                                src={`/thumbnails/${img.filename}`}
                                alt={`Thumbnail ${i + 1}`}
                                style={styles.thumbnailImg}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p style={styles.noImages}>No images</p>
                    )}
                  </>
                ) : (
                  /* DICOM panel */
                  <div style={styles.dicomPanel}>
                    {dicomSeries.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                          {dicomSeries.map((s, i) => (
                            <button
                              key={s.id}
                              style={{
                                ...styles.dicomSeriesBtn,
                                ...(activeDicomSeriesId === s.id ? styles.dicomSeriesBtnActive : {}),
                              }}
                              onClick={() => setActiveDicomSeriesId(s.id)}
                            >
                              <strong>{s.modality || 'DICOM'}</strong>{' '}
                              {s.series_description || `Series ${i + 1}`}{' '}
                              <span style={{ color: theme.colors.textMuted }}>({s.num_images} images)</span>
                            </button>
                          ))}
                        </div>
                        <div
                          ref={dicomContainerRef}
                          style={styles.dicomViewerArea}
                          aria-label="DICOM viewer"
                        />
                      </>
                    ) : (
                      <p style={styles.noImages}>No DICOM series uploaded</p>
                    )}
                  </div>
                )}

                {/* DICOM upload */}
                <details style={styles.dicomUploadSection}>
                  <summary style={{ cursor: 'pointer', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.sizes.sm }}>
                    Upload DICOM Series
                  </summary>
                  <div style={styles.dicomUploadInner}>
                    <input
                      type="file"
                      id="dicomFileInputReact"
                      multiple
                      accept=".dcm,application/dicom"
                      style={{ display: 'none' }}
                      onChange={handleDicomFileChange}
                    />
                    <button
                      style={styles.uploadBtn}
                      onClick={() => document.getElementById('dicomFileInputReact')?.click()}
                    >
                      Select Files
                    </button>
                    {dicomFiles.length > 0 && (
                      <>
                        <span style={styles.fileCount}>
                          {dicomFiles.length} file{dicomFiles.length !== 1 ? 's' : ''} selected
                        </span>
                        <button
                          style={{ ...styles.btn, ...styles.btnPrimary }}
                          onClick={handleDicomUpload}
                        >
                          Upload
                        </button>
                      </>
                    )}
                  </div>
                </details>
              </div>

              {/* Case details */}
              <div style={styles.details}>
                <div style={styles.meta}>
                  {caseData.modality && (
                    <span style={{ ...styles.badge, ...styles.badgeModality }}>{caseData.modality}</span>
                  )}
                  {caseData.body_part && (
                    <span style={{ ...styles.badge, ...styles.badgeBodypart }}>{caseData.body_part}</span>
                  )}
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

                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Clinical History</h3>
                  <p style={styles.sectionContent}>{caseData.clinical_history || '-'}</p>
                </div>

                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Diagnosis</h3>
                  <p style={{ ...styles.sectionContent, ...styles.diagnosisContent }}>
                    {caseData.diagnosis || '-'}
                  </p>
                </div>

                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Key Findings</h3>
                  <p style={styles.sectionContent}>{caseData.findings || '-'}</p>
                </div>

                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Teaching Points</h3>
                  <p style={styles.sectionContent}>{caseData.teaching_points || '-'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: theme.spacing['2xl'], color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily }}>
              Failed to load case
            </div>
          )}
        </div>

        {/* Footer */}
        {caseData && (
          <div style={styles.footer}>
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              onClick={handleDelete}
            >
              Delete
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => {
                if (window.annotateCase) window.annotateCase();
              }}
            >
              Annotate
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => {
                if (window.presentation && caseData) {
                  if (onClose) onClose();
                  window.presentation.start(caseData.id);
                }
              }}
            >
              Present
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, marginLeft: 'auto' }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
