import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { path: '/', label: 'Case Library', icon: '\uD83D\uDCDA', shortLabel: 'Library' },
  { path: '/add', label: 'Add New Case', icon: '\u2795', shortLabel: 'Add' },
  { path: '/quiz', label: 'Quiz Mode', icon: '\uD83C\uDFAF', shortLabel: 'Quiz' },
  { path: '/analytics', label: 'Analytics', icon: '\uD83D\uDCCA', shortLabel: 'Stats' },
];

const settingsItem = { path: '/settings', label: 'Preferences', icon: '\u2699\uFE0F', shortLabel: 'Settings' };

const navbarCSS = `
@keyframes navPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
`;

export function SidebarNav({ onNavigate }) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path) => {
    navigate(path);
    onNavigate?.();
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const buttonStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: active ? theme.colors.accentMuted : 'transparent',
    color: active ? theme.colors.accent : theme.colors.textSecondary,
    border: 'none',
    borderLeft: active ? `3px solid ${theme.colors.accent}` : '3px solid transparent',
    borderRadius: theme.radii.md,
    cursor: 'pointer',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.sm,
    fontWeight: active ? theme.typography.fontWeights.semibold : theme.typography.fontWeights.regular,
    textAlign: 'left',
    transition: `all ${theme.transitions.fast}`,
    minHeight: '40px',
  });

  return (
    <nav role="navigation" aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <style>{navbarCSS}</style>
      {navItems.map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => handleClick(item.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            style={buttonStyle(active)}
          >
            <span aria-hidden="true" style={{
              fontSize: '16px',
              width: '24px',
              textAlign: 'center',
              animation: active ? 'navPulse 2s ease-in-out infinite' : 'none',
            }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
      <div style={{ borderTop: `1px solid ${theme.colors.border}`, margin: `${theme.spacing.sm} 0` }} />
      <button
        onClick={() => handleClick(settingsItem.path)}
        aria-current={isActive(settingsItem.path) ? 'page' : undefined}
        aria-label={settingsItem.label}
        style={buttonStyle(isActive(settingsItem.path))}
      >
        <span aria-hidden="true" style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{settingsItem.icon}</span>
        {settingsItem.label}
      </button>
    </nav>
  );
}

export function BottomNav() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Find active index for pill position
  const activeIndex = useMemo(() => {
    const idx = navItems.findIndex(item => isActive(item.path));
    return idx >= 0 ? idx : 0;
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const pillWidth = 100 / navItems.length;

  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.bgSecondary,
        borderTop: `1px solid ${theme.colors.border}`,
        backdropFilter: theme.colors.glassBackdrop,
        WebkitBackdropFilter: theme.colors.glassBackdrop,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {/* Floating pill indicator */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: `${activeIndex * pillWidth}%`,
        width: `${pillWidth}%`,
        height: '3px',
        display: 'flex',
        justifyContent: 'center',
        transition: 'left 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '60%',
          height: '100%',
          background: theme.colors.gradientPrimary,
          borderRadius: '0 0 4px 4px',
          boxShadow: `0 2px 8px rgba(99, 102, 241, 0.4)`,
        }} />
      </div>

      <div style={{ display: 'flex' }}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                padding: `${theme.spacing.xs} 0`,
                background: 'none',
                border: 'none',
                color: active ? theme.colors.accent : theme.colors.textMuted,
                fontFamily: theme.typography.fontFamily,
                fontSize: '10px',
                fontWeight: active ? theme.typography.fontWeights.semibold : theme.typography.fontWeights.regular,
                cursor: 'pointer',
                minHeight: '56px',
                transition: `color ${theme.transitions.fast}`,
              }}
            >
              <span aria-hidden="true" style={{
                fontSize: '20px',
                transition: 'transform 200ms ease',
                transform: active ? 'scale(1.1)' : 'scale(1)',
              }}>{item.icon}</span>
              {item.shortLabel}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
