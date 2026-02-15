import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

export default function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = '560px',
}) {
  const theme = useTheme();
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);

  // Focus trap
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement;
      // Focus the dialog after render
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      previousFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const titleId = 'dialog-title';

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width,
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.glassBorder}`,
          borderRadius: theme.radii.lg,
          boxShadow: theme.shadows.lg,
          outline: 'none',
          fontFamily: theme.typography.fontFamily,
          color: theme.colors.textPrimary,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <h2 id={titleId} style={{
            margin: 0,
            fontSize: theme.typography.sizes.xl,
            fontWeight: theme.typography.fontWeights.semibold,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.textSecondary,
              fontSize: '20px',
              cursor: 'pointer',
              padding: theme.spacing.xs,
              lineHeight: 1,
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: theme.spacing.lg,
          overflowY: 'auto',
          flex: 1,
        }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: theme.spacing.sm,
            padding: `${theme.spacing.md} ${theme.spacing.lg}`,
            borderTop: `1px solid ${theme.colors.border}`,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
