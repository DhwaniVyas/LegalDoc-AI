import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import DocumentPreview from './pages/DocumentPreview'
import Upload from './pages/Upload'
import AiResearch from './pages/AiResearch'
import SemanticSearch from './pages/SemanticSearch'
import AskQuestion from './pages/AskQuestion'
import ChatHistory from './pages/ChatHistory'
import Settings from './pages/Settings'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public-only routes – redirect to dashboard if already logged in */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />

          {/* Protected app routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"                 element={<Dashboard />} />
            <Route path="documents"                 element={<Documents />} />
            <Route path="documents/:id/preview"     element={<DocumentPreview />} />
            <Route path="upload"                    element={<Upload />} />
            <Route path="ask"                       element={<AskQuestion />} />
            <Route path="research"                  element={<AiResearch />} />
            <Route path="search"                    element={<SemanticSearch />} />
            <Route path="chat-history"              element={<ChatHistory />} />
            <Route path="settings"                  element={<Settings />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
