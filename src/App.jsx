import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import theme from './theme';

/**
 * Placeholder page component displayed for all routes during
 * the React migration. Will be replaced by real page components
 * in Tasks 3.2 - 3.5.
 */
function Placeholder({ title }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: theme.colors.bgPrimary,
      color: theme.colors.textPrimary,
      fontFamily: theme.typography.fontFamily
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: theme.typography.sizes['3xl'],
          fontWeight: theme.typography.fontWeights.bold,
          background: theme.colors.gradientPrimary,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: theme.spacing.md
        }}>
          RadCase
        </h1>
        <p style={{
          color: theme.colors.textSecondary,
          fontSize: theme.typography.sizes.lg
        }}>
          {title}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder title="Case Library" />} />
        <Route path="/case/:id" element={<Placeholder title="Case Detail" />} />
        <Route path="/add" element={<Placeholder title="Add New Case" />} />
        <Route path="/quiz" element={<Placeholder title="Quiz Mode" />} />
        <Route path="/analytics" element={<Placeholder title="Analytics" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<Placeholder title="Page Not Found" />} />
      </Routes>
    </BrowserRouter>
  );
}
