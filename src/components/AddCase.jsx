import React, { useState, useCallback, useRef } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';
import useIsMobile from '../hooks/useIsMobile';

const MODALITIES = [
  'X-Ray', 'CT', 'MRI', 'Ultrasound',
  'Nuclear Medicine', 'Fluoroscopy', 'Mammography', 'Angiography',
];

const BODY_PARTS = [
  'Chest', 'Abdomen', 'Pelvis', 'Head', 'Neck', 'Spine',
  'Upper Extremity', 'Lower Extremity', 'Cardiac', 'Breast', 'MSK',
];

const getStyles = (mobile) => ({
  page: {
    padding: mobile ? theme.spacing.md : theme.spacing.lg,
    maxWidth: '900px',
    margin: '0 auto',
  },
  pageHeader: {
    marginBottom: mobile ? theme.spacing.md : theme.spacing.lg,
  },
  pageTitle: {
    margin: 0,
    fontSize: mobile ? theme.typography.sizes.xl : theme.typography.sizes['2xl'],
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
  card: {
    background: theme.colors.bgCard,
    borderRadius: mobile ? theme.radii.md : theme.radii.lg,
    border: `1px solid ${theme.colors.border}`,
    padding: mobile ? theme.spacing.md : theme.spacing.lg,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
  },
  input: {
    padding: mobile ? '12px' : '10px 12px',
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    fontSize: '16px', // Prevents iOS zoom
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    transition: `border-color ${theme.transitions.fast}`,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: mobile ? '44px' : undefined,
  },
  select: {
    padding: mobile ? '12px' : '10px 12px',
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    fontSize: '16px', // Prevents iOS zoom
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: mobile ? '44px' : undefined,
  },
  textarea: {
    padding: mobile ? '12px' : '10px 12px',
    background: theme.colors.glassBg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    fontSize: '16px', // Prevents iOS zoom
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    transition: `border-color ${theme.transitions.fast}`,
    width: '100%',
    boxSizing: 'border-box',
  },
  uploadZone: {
    border: `2px dashed ${theme.colors.border}`,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    textAlign: 'center',
    cursor: 'pointer',
    transition: `all ${theme.transitions.fast}`,
    background: theme.colors.glassBg,
  },
  uploadZoneActive: {
    borderColor: theme.colors.accent,
    background: theme.colors.accentMuted,
  },
  uploadIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing.xs,
  },
  uploadTitle: {
    margin: 0,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
  },
  uploadHint: {
    margin: `${theme.spacing.xs} 0 0`,
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.fontFamily,
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: mobile
      ? 'repeat(auto-fill, minmax(70px, 1fr))'
      : 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  previewItem: {
    position: 'relative',
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    aspectRatio: '1',
    background: theme.colors.bgTertiary,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  previewDeleteBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    background: 'rgba(239, 68, 68, 0.8)',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding: 0,
  },
  formActions: {
    display: 'flex',
    flexDirection: mobile ? 'column' : 'row',
    justifyContent: mobile ? undefined : 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTop: `1px solid ${theme.colors.border}`,
  },
  btn: {
    padding: mobile ? '12px' : `10px ${theme.spacing.lg}`,
    borderRadius: theme.radii.md,
    border: 'none',
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: `opacity ${theme.transitions.fast}`,
    minHeight: mobile ? '44px' : undefined,
    textAlign: 'center',
  },
  btnPrimary: {
    background: theme.colors.gradientPrimary,
    color: '#fff',
  },
  btnSecondary: {
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.border}`,
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
    marginTop: theme.spacing.xs,
  },
});

export default function AddCase({ onCaseSaved }) {
  const api = useApi();
  const mobile = useIsMobile();
  const styles = getStyles(mobile);
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [modality, setModality] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [difficulty, setDifficulty] = useState('2');
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [findings, setFindings] = useState('');
  const [teachingPoints, setTeachingPoints] = useState('');
  const [tags, setTags] = useState('');

  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleFocus = useCallback((e) => {
    e.target.style.borderColor = theme.colors.accent;
  }, []);
  const handleBlur = useCallback((e) => {
    e.target.style.borderColor = theme.colors.border;
  }, []);

  const addFiles = useCallback((files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploadedFiles(prev => [...prev, ...imageFiles]);

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews(prev => [...prev, { dataUrl: e.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeFile = useCallback((index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDiagnosis('');
    setModality('');
    setBodyPart('');
    setDifficulty('2');
    setClinicalHistory('');
    setFindings('');
    setTeachingPoints('');
    setTags('');
    setUploadedFiles([]);
    setPreviews([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Case title is required');
      return;
    }
    if (!diagnosis.trim()) {
      setError('Diagnosis is required');
      return;
    }

    setSubmitting(true);
    try {
      const caseData = {
        title: title.trim(),
        diagnosis: diagnosis.trim(),
        modality,
        body_part: bodyPart,
        difficulty: parseInt(difficulty, 10),
        clinical_history: clinicalHistory.trim(),
        findings: findings.trim(),
        teaching_points: teachingPoints.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      };

      const result = await api.post('/api/cases', caseData);
      const caseId = result?.id;

      if (caseId && uploadedFiles.length > 0) {
        const formData = new FormData();
        uploadedFiles.forEach(f => formData.append('images', f));
        await api.upload(`/api/cases/${caseId}/images`, formData);
      }

      resetForm();
      if (onCaseSaved) onCaseSaved(caseId);
    } catch (err) {
      setError(err.message || 'Failed to save case');
    } finally {
      setSubmitting(false);
    }
  }, [title, diagnosis, modality, bodyPart, difficulty, clinicalHistory, findings, teachingPoints, tags, uploadedFiles, resetForm, onCaseSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section style={styles.page} aria-label="Add New Case">
      <div style={styles.pageHeader}>
        <h2 style={styles.pageTitle} tabIndex={-1}>Add New Case</h2>
        <p style={styles.pageSubtitle}>Create a new teaching case for your library</p>
      </div>

      <div style={styles.card}>
        <form onSubmit={handleSubmit} noValidate>
          {/* Title and Diagnosis */}
          <div style={styles.formRow}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <label style={styles.label} htmlFor="addcase-title">Case Title *</label>
              <input
                id="addcase-title"
                style={styles.input}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="e.g., Classic Pneumothorax"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <label style={styles.label} htmlFor="addcase-diagnosis">Diagnosis *</label>
              <input
                id="addcase-diagnosis"
                style={styles.input}
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="e.g., Right-sided pneumothorax"
                required
              />
            </div>
          </div>

          {/* Modality, Body Part, Difficulty */}
          <div style={{ ...styles.formRow, gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <label style={styles.label} htmlFor="addcase-modality">Modality</label>
              <select
                id="addcase-modality"
                style={styles.select}
                value={modality}
                onChange={(e) => setModality(e.target.value)}
              >
                <option value="">Select modality...</option>
                {MODALITIES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <label style={styles.label} htmlFor="addcase-bodypart">Body Part</label>
              <select
                id="addcase-bodypart"
                style={styles.select}
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
              >
                <option value="">Select body part...</option>
                {BODY_PARTS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <label style={styles.label} htmlFor="addcase-difficulty">Difficulty (1-5)</label>
              <select
                id="addcase-difficulty"
                style={styles.select}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="1">1 - Easy</option>
                <option value="2">2 - Medium</option>
                <option value="3">3 - Hard</option>
                <option value="4">4 - Expert</option>
                <option value="5">5 - Master</option>
              </select>
            </div>
          </div>

          {/* Clinical History */}
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="addcase-history">Clinical History</label>
            <textarea
              id="addcase-history"
              style={styles.textarea}
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Patient presentation, symptoms, relevant history..."
            />
          </div>

          {/* Key Findings */}
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="addcase-findings">Key Findings</label>
            <textarea
              id="addcase-findings"
              style={styles.textarea}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Describe the radiological findings..."
            />
          </div>

          {/* Teaching Points */}
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="addcase-teaching">Teaching Points</label>
            <textarea
              id="addcase-teaching"
              style={styles.textarea}
              value={teachingPoints}
              onChange={(e) => setTeachingPoints(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Important learning points for this case..."
            />
          </div>

          {/* Tags */}
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="addcase-tags">Tags (comma separated)</label>
            <input
              id="addcase-tags"
              style={styles.input}
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="e.g., emergency, classic, must-know"
            />
          </div>

          {/* Image Upload */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Images</label>
            <div
              style={{
                ...styles.uploadZone,
                ...(dragActive ? styles.uploadZoneActive : {}),
              }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              tabIndex={0}
              role="button"
              aria-label="Upload images - click or drop files"
            >
              <div style={styles.uploadIcon} aria-hidden="true">{'\u{1F4C1}'}</div>
              <h3 style={styles.uploadTitle}>Drop images here</h3>
              <p style={styles.uploadHint}>or click to browse - JPEG, PNG up to 50MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => addFiles(e.target.files)}
            />

            {previews.length > 0 && (
              <div style={styles.previewGrid}>
                {previews.map((p, i) => (
                  <div key={i} style={styles.previewItem}>
                    <img src={p.dataUrl} alt={`Preview ${i + 1}`} style={styles.previewImage} />
                    <button
                      type="button"
                      style={styles.previewDeleteBtn}
                      onClick={() => removeFile(i)}
                      aria-label={`Remove image ${i + 1}`}
                    >
                      {'\u{2715}'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <p style={styles.errorText} role="alert">{error}</p>
          )}

          {/* Actions */}
          <div style={styles.formActions}>
            <button
              type="button"
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={resetForm}
            >
              Clear
            </button>
            <button
              type="submit"
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                ...(submitting ? styles.btnDisabled : {}),
              }}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save Case'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
