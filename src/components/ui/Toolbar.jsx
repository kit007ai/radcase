import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export default function Toolbar({ children, collapsible = true, label = 'Toolbar' }) {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      role="toolbar"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        background: theme.colors.glassBg,
        backdropFilter: theme.colors.glassBackdrop,
        WebkitBackdropFilter: theme.colors.glassBackdrop,
        border: `1px solid ${theme.colors.glassBorder}`,
        borderRadius: theme.radii.md,
        flexWrap: 'wrap',
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {collapsible && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
          style={{
            display: 'none', // hidden on desktop, shown via media query below
            background: 'none',
            border: 'none',
            color: theme.colors.textSecondary,
            cursor: 'pointer',
            padding: theme.spacing.xs,
            fontSize: '18px',
            minWidth: '48px',
            minHeight: '48px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="toolbar-toggle"
        >
          {collapsed ? '\u2630' : '\u2715'}
        </button>
      )}
      <div
        style={{
          display: collapsed ? 'none' : 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
          flex: 1,
        }}
      >
        {React.Children.map(children, (child) => {
          if (!child) return null;
          return (
            <div style={{ minWidth: '48px', minHeight: '48px', display: 'flex', alignItems: 'center' }}>
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}
