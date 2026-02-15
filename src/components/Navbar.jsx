import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { path: '/', label: 'Case Library', icon: '\uD83D\uDCDA', shortLabel: 'Library' },
  { path: '/add', label: 'Add New Case', icon: '\u2795', shortLabel: 'Add' },
  { path: '/quiz', label: 'Quiz Mode', icon: '\uD83C\uDFAF', shortLabel: 'Quiz' },
  { path: '/analytics', label: 'Analytics', icon: '\uD83D\uDCCA', shortLabel: 'Stats' },
];

const settingsItem = { path: '/settings', label: 'Preferences', icon: '\u2699\uFE0F', shortLabel: 'Settings' };

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
            <span aria-hidden="true" style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
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
        background: theme.colors.bgSecondary,
        borderTop: `1px solid ${theme.colors.border}`,
        backdropFilter: theme.colors.glassBackdrop,
        WebkitBackdropFilter: theme.colors.glassBackdrop,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
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
            <span aria-hidden="true" style={{ fontSize: '20px' }}>{item.icon}</span>
            {item.shortLabel}
          </button>
        );
      })}
    </nav>
  );
}
