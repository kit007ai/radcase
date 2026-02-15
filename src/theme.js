/**
 * RadCase Dark HUD Theme
 *
 * Design tokens for the RadIntel dark HUD aesthetic.
 * These mirror the CSS custom properties in public/styles/base.css
 * for use in React components and inline styles.
 */

const theme = {
  colors: {
    // Backgrounds
    bgPrimary: '#0a0a0f',
    bgSecondary: '#12121a',
    bgTertiary: '#1a1a2e',
    bgCard: '#12121a',

    // Glass / surface effects
    glassBg: 'rgba(255, 255, 255, 0.05)',
    glassBackdrop: 'blur(12px)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',

    // Text
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',

    // Accents
    accent: '#6366f1',
    accentHover: '#818cf8',
    accentMuted: 'rgba(99, 102, 241, 0.15)',

    // Borders
    border: '#1e293b',
    borderLight: '#334155',

    // Status
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',

    // Gradients
    gradientPrimary: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    gradientDark: 'linear-gradient(180deg, #0a0a0f 0%, #12121a 100%)',
    gradientGlow: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)'
  },

  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeights: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem'
    }
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px'
  },

  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px'
  },

  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(99, 102, 241, 0.3)',
    glowStrong: '0 0 40px rgba(99, 102, 241, 0.4)'
  },

  transitions: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease'
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px'
  }
};

export default theme;
