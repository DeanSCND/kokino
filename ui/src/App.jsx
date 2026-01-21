import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Canvas } from './pages/Canvas';
import { GitHubCallback } from './pages/GitHubCallback';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* GitHub OAuth Callback */}
          <Route path="/auth/github/callback" element={<GitHubCallback />} />

          {/* Main Canvas */}
          <Route
            path="/"
            element={
              <DashboardLayout>
                <Canvas />
              </DashboardLayout>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
