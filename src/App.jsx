import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/Layout';
import CaseLibrary from './components/CaseLibrary';
import CaseDetail from './components/CaseDetail';
import AddCase from './components/AddCase';
import Quiz from './components/Quiz';
import Analytics from './components/Analytics';
import MicroLearning from './components/MicroLearning';

function CaseLibraryPage() {
  const navigate = useNavigate();
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseIds, setCaseIds] = useState([]);

  const handleViewCase = useCallback((caseData, allIds) => {
    setSelectedCaseId(caseData.id);
    if (allIds) setCaseIds(allIds);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCaseId(null);
  }, []);

  const handleNavigateCase = useCallback((id) => {
    setSelectedCaseId(id);
  }, []);

  return (
    <>
      <CaseLibrary
        onViewCase={handleViewCase}
        onNavigateAdd={() => navigate('/add')}
      />
      {selectedCaseId && (
        <CaseDetail
          caseId={selectedCaseId}
          caseIds={caseIds}
          onClose={handleCloseDetail}
          onNavigate={handleNavigateCase}
        />
      )}
    </>
  );
}

function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <CaseDetail
      caseId={Number(id)}
      onClose={() => navigate('/')}
      onNavigate={(newId) => navigate(`/case/${newId}`)}
    />
  );
}

function AddCasePage() {
  const navigate = useNavigate();
  return <AddCase onCaseSaved={() => navigate('/')} />;
}

function NotFound() {
  const theme = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', color: theme.colors.textSecondary,
      fontFamily: theme.typography.fontFamily, textAlign: 'center',
    }}>
      <div>
        <h2 style={{ fontSize: theme.typography.sizes['2xl'], marginBottom: theme.spacing.md }}>
          404 — Page Not Found
        </h2>
        <p>The page you're looking for doesn't exist.</p>
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
                <Route path="/" element={<CaseLibraryPage />} />
                <Route path="/case/:id" element={<CaseDetailPage />} />
                <Route path="/add" element={<AddCasePage />} />
                <Route path="/quiz" element={<Quiz />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
            <MicroLearning />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
