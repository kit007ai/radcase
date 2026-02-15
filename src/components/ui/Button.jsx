import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const variantStyles = (theme) => ({
  primary: {
    background: theme.colors.gradientPrimary,
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    background: theme.colors.glassBg,
    color: theme.colors.textPrimary,
    border: `1px solid ${theme.colors.border}`,
  },
  ghost: {
    background: 'transparent',
    color: theme.colors.textSecondary,
    border: '1px solid transparent',
  },
  danger: {
    background: theme.colors.error,
    color: '#ffffff',
    border: 'none',
  },
});

const sizeStyles = (theme) => ({
  sm: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: theme.typography.sizes.sm,
    minHeight: '32px',
  },
  md: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    fontSize: theme.typography.sizes.base,
    minHeight: '40px',
  },
  lg: {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    fontSize: theme.typography.sizes.lg,
    minHeight: '48px',
  },
});

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  ...props
}) {
  const theme = useTheme();
  const vStyles = variantStyles(theme)[variant] || variantStyles(theme).primary;
  const sStyles = sizeStyles(theme)[size] || sizeStyles(theme).md;

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        borderRadius: theme.radii.md,
        fontFamily: theme.typography.fontFamily,
        fontWeight: theme.typography.fontWeights.medium,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: `all ${theme.transitions.fast}`,
        whiteSpace: 'nowrap',
        ...vStyles,
        ...sStyles,
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}
