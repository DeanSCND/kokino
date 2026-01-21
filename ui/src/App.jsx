import React from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Canvas } from './pages/Canvas';

function App() {
  return (
    <DashboardLayout>
      <Canvas />
    </DashboardLayout>
  );
}

export default App;
