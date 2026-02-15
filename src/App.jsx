import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/Layout';

/**
 * Placeholder page component displayed for all routes during
 * the React migration. Will be replaced by real page components
 * in Tasks 3.3 - 3.4.
 */
function Placeholder({ title }) {
  const theme = useTheme();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: theme.colors.textPrimary,
      fontFamily: theme.typography.fontFamily,
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontSize: theme.typography.sizes['2xl'],
          fontWeight: theme.typography.fontWeights.bold,
          background: theme.colors.gradientPrimary,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: theme.spacing.md,
        }}>
          {title}
        </h2>
        <p style={{
          color: theme.colors.textSecondary,
          fontSize: theme.typography.sizes.sm,
        }}>
          Component migration in progress
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Placeholder title="Case Library" />} />
                <Route path="/case/:id" element={<Placeholder title="Case Detail" />} />
                <Route path="/add" element={<Placeholder title="Add New Case" />} />
                <Route path="/quiz" element={<Placeholder title="Quiz Mode" />} />
                <Route path="/analytics" element={<Placeholder title="Analytics" />} />
                <Route path="/settings" element={<Placeholder title="Preferences" />} />
                <Route path="*" element={<Placeholder title="Page Not Found" />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
