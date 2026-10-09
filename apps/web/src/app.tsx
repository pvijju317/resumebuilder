import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/app-shell.js';
import { RequireAuth } from './lib/auth.js';
import { AuthCompletePage } from './pages/auth-complete.js';
import { DashboardPage } from './pages/dashboard.js';
import { LandingPage } from './pages/landing.js';
import { LegalPage } from './pages/legal.js';
import { LoginPage } from './pages/login.js';
import { NotFoundPage } from './pages/not-found.js';
import { SectionPage } from './pages/section.js';
import { StyleguidePage } from './pages/styleguide.js';
import { StrengthenPage } from './vault/strengthen.js';
import { WelcomePage } from './pages/welcome.js';
import { CheckResultPage } from './check/check-result.js';
import { JobPage, JobsPage } from './jobs/jobs-pages.js';
import { VaultPage } from './vault/vault-page.js';

export function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/complete" element={<AuthCompletePage />} />
      <Route path="/legal/:doc" element={<LegalPage />} />
      <Route path="/check/:id" element={<CheckResultPage />} />
      <Route path="/styleguide" element={<StyleguidePage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="welcome" element={<WelcomePage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="vault/strengthen" element={<StrengthenPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobPage />} />
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
      <Route path="/home" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
