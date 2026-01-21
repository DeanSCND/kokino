import React from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Canvas } from './pages/Canvas';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <DashboardLayout>
        <Canvas />
      </DashboardLayout>
    </ErrorBoundary>
  );
}

export default App;
