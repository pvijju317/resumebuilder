import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/app-shell.js';
import { RequireAuth } from './lib/auth.js';
import { AuthCompletePage } from './pages/auth-complete.js';
import { DashboardPage } from './pages/dashboard.js';
import { LoginPage } from './pages/login.js';
import { NotFoundPage } from './pages/not-found.js';
import { SectionPage } from './pages/section.js';
import { StyleguidePage } from './pages/styleguide.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/complete" element={<AuthCompletePage />} />
      <Route path="/styleguide" element={<StyleguidePage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="vault"
          element={
            <SectionPage
              title="Career Vault"
              description="Upload a resume to build your verified career record."
            />
          }
        />
        <Route
          path="jobs"
          element={
            <SectionPage
              title="Jobs"
              description="Paste a job description or URL to score and tailor your resume."
            />
          }
        />
        <Route
          path="tracker"
          element={
            <SectionPage
              title="Tracker"
              description="Track applications and see which resume versions get callbacks."
            />
          }
        />
        <Route
          path="billing"
          element={<SectionPage title="Billing" description="Plans, credits and invoices." />}
        />
        <Route
          path="settings"
          element={
            <SectionPage
              title="Settings"
              description="Profile, region defaults, data export and account deletion."
            />
          }
        />
      </Route>
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
