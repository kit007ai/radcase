import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { SidebarNav, BottomNav } from './Navbar';

const SIDEBAR_WIDTH = '260px';
const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export default function Layout({ children }) {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: theme.colors.bgPrimary,
      fontFamily: theme.typography.fontFamily,
      color: theme.colors.textPrimary,
    }}>
      {/* Mobile header */}
      {isMobile && (
        <header style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${theme.spacing.md}`,
          background: theme.colors.bgSecondary,
          borderBottom: `1px solid ${theme.colors.border}`,
          zIndex: 999,
          gap: theme.spacing.sm,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.textPrimary,
              fontSize: '24px',
              cursor: 'pointer',
              padding: theme.spacing.xs,
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &#x2630;
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            <span style={{ fontSize: '20px' }}>&#x1F3E5;</span>
            <h1 style={{
              margin: 0,
              fontSize: theme.typography.sizes.lg,
              fontWeight: theme.typography.fontWeights.bold,
              background: theme.colors.gradientPrimary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              RadCase
            </h1>
          </div>
        </header>
      )}

      {/* Overlay (mobile) */}
      {isMobile && sidebarOpen && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          onClick={closeSidebar}
          onKeyDown={(e) => { if (e.key === 'Escape') closeSidebar(); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        role="complementary"
        aria-label="Navigation sidebar"
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          left: 0,
          height: '100vh',
          width: SIDEBAR_WIDTH,
          background: theme.colors.bgSecondary,
          borderRight: `1px solid ${theme.colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          transform: isMobile && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: `transform ${theme.transitions.normal}`,
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: theme.spacing.lg,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          <span style={{ fontSize: '28px' }}>&#x1F3E5;</span>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: theme.typography.sizes.xl,
              fontWeight: theme.typography.fontWeights.bold,
              background: theme.colors.gradientPrimary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              RadCase
            </h1>
            <span style={{
              fontSize: theme.typography.sizes.xs,
              color: theme.colors.textMuted,
            }}>
              Teaching Case Library
            </span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: theme.spacing.sm, flex: 1 }}>
          <SidebarNav onNavigate={closeSidebar} />
        </div>

        {/* User section */}
        <div style={{
          padding: theme.spacing.md,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          {user ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: theme.radii.full,
                background: theme.colors.accentMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.colors.accent,
                fontSize: theme.typography.sizes.sm,
                fontWeight: theme.typography.fontWeights.semibold,
                flexShrink: 0,
              }}>
                {(user.displayName || user.username || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: theme.typography.sizes.sm,
                  fontWeight: theme.typography.fontWeights.medium,
                  color: theme.colors.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user.displayName || user.username}
                </div>
                <div style={{
                  fontSize: theme.typography.sizes.xs,
                  color: theme.colors.textMuted,
                }}>
                  {user.role || 'Student'}
                </div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                aria-label="Sign out"
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.colors.textMuted,
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: theme.spacing.xs,
                }}
              >
                &#x1F6AA;
              </button>
            </div>
          ) : (
            <div style={{
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textMuted,
              textAlign: 'center',
            }}>
              Guest mode
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main
        role="main"
        aria-label="Main content"
        style={{
          flex: 1,
          minWidth: 0,
          paddingTop: isMobile ? '56px' : 0,
          paddingBottom: isMobile ? '64px' : 0,
        }}
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      {isMobile && <BottomNav />}
    </div>
  );
}
