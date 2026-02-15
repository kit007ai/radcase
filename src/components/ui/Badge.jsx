import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const colorMap = {
  default: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8' },
  success: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
  info: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  // Modality-specific
  xray: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  ct: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
  mri: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  ultrasound: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
};

export default function Badge({
  children,
  color = 'default',
  size = 'small',
  style,
  ...props
}) {
  const theme = useTheme();
  const c = colorMap[color] || colorMap.default;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'medium'
          ? `${theme.spacing.xs} ${theme.spacing.sm}`
          : `2px ${theme.spacing.xs}`,
        fontSize: size === 'medium' ? theme.typography.sizes.sm : theme.typography.sizes.xs,
        fontFamily: theme.typography.fontFamily,
        fontWeight: theme.typography.fontWeights.medium,
        borderRadius: theme.radii.full,
        background: c.bg,
        color: c.text,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
