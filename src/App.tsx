import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import InwardEntry from './pages/InwardEntry';
import PlateCutting from './pages/PlateCutting';
import BillaGeneration from './pages/BillaGeneration';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import { Loader2 } from 'lucide-react';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-industrial-accent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}



function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inward" element={<InwardEntry />} />
            <Route path="/cutting" element={<PlateCutting />} />
            <Route path="/billa" element={<BillaGeneration />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
