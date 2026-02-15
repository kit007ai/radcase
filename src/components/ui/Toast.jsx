import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import theme from '../../theme';

const ToastContext = createContext(null);

let toastId = 0;

const variantColors = {
  success: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', icon: '\u2713' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', icon: '\u2717' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', icon: '\u26A0' },
  info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', icon: '\u2139' },
};

function ToastItem({ toast, onDismiss }) {
  const vc = variantColors[toast.variant] || variantColors.info;
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        background: theme.colors.bgSecondary,
        border: `1px solid ${vc.border}`,
        borderLeft: `4px solid ${vc.border}`,
        borderRadius: theme.radii.md,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.sizes.sm,
        color: theme.colors.textPrimary,
        boxShadow: theme.shadows.md,
        maxWidth: '400px',
        width: '100%',
        animation: 'slideIn 0.2s ease-out',
      }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{vc.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.textMuted,
          cursor: 'pointer',
          padding: '2px',
          fontSize: '14px',
          lineHeight: 1,
        }}
      >
        &#x2715;
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, variant = 'info', duration = 3000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const toast = useCallback((message, variant, duration) => addToast(message, variant, duration), [addToast]);
  toast.success = (msg, dur) => addToast(msg, 'success', dur);
  toast.error = (msg, dur) => addToast(msg, 'error', dur);
  toast.warning = (msg, dur) => addToast(msg, 'warning', dur);
  toast.info = (msg, dur) => addToast(msg, 'info', dur);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-label="Notifications"
          style={{
            position: 'fixed',
            top: theme.spacing.lg,
            right: theme.spacing.lg,
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((t) => (
            <div key={t.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
