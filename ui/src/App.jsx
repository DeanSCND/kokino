import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Canvas } from './pages/Canvas';
import { GitHubCallback } from './pages/GitHubCallback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';

function App() {
  const [headerControls, setHeaderControls] = useState(null);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* GitHub OAuth Callback */}
            <Route path="/auth/github/callback" element={<GitHubCallback />} />

            {/* Main Canvas */}
            <Route
              path="/"
              element={
                <DashboardLayout headerControls={headerControls}>
                  <Canvas setHeaderControls={setHeaderControls} />
                </DashboardLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
