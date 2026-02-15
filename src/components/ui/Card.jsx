import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export default function Card({ children, header, footer, style, hoverable = false, ...props }) {
  const theme = useTheme();

  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={hoverable ? () => setHovered(true) : undefined}
      onMouseLeave={hoverable ? () => setHovered(false) : undefined}
      style={{
        background: theme.colors.glassBg,
        backdropFilter: theme.colors.glassBackdrop,
        WebkitBackdropFilter: theme.colors.glassBackdrop,
        border: `1px solid ${theme.colors.glassBorder}`,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        transition: `all ${theme.transitions.normal}`,
        boxShadow: hovered ? theme.shadows.glow : theme.shadows.sm,
        ...style,
      }}
      {...props}
    >
      {header && (
        <div style={{
          padding: `${theme.spacing.md} ${theme.spacing.md}`,
          borderBottom: `1px solid ${theme.colors.border}`,
          fontFamily: theme.typography.fontFamily,
          fontWeight: theme.typography.fontWeights.semibold,
          color: theme.colors.textPrimary,
          fontSize: theme.typography.sizes.base,
        }}>
          {header}
        </div>
      )}
      <div style={{ padding: theme.spacing.md }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}
