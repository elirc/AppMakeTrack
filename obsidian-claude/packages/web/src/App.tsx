/**
 * Main Application Component
 *
 * This component:
 * 1. Sets up routing
 * 2. Provides the layout structure
 * 3. Renders the appropriate page based on URL
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Daily } from './pages/Daily';
import { Notes } from './pages/Notes';
import { NoteDetail } from './pages/NoteDetail';
import { Growth } from './pages/Growth';
import { Projects } from './pages/Projects';

function App() {
  return (
    <Layout>
      <Routes>
        {/* Dashboard - main landing page */}
        <Route path="/" element={<Dashboard />} />

        {/* Daily note for today */}
        <Route path="/daily" element={<Daily />} />
        <Route path="/daily/:date" element={<Daily />} />

        {/* Notes browser and detail */}
        <Route path="/notes" element={<Notes />} />
        <Route path="/notes/*" element={<NoteDetail />} />

        {/* Growth tracking */}
        <Route path="/growth" element={<Growth />} />

        {/* Projects */}
        <Route path="/projects" element={<Projects />} />

        {/* Fallback - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
