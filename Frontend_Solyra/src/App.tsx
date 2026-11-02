import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { ShellLayout } from './components/layout/ShellLayout';
import { AuthGuard } from './components/guards/AuthGuard';
import { OwnerGuard } from './components/guards/OwnerGuard';
import {
  LandingPage,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './routes/PublicRoutes';
import {
  DashboardPage,
  OnboardingPage,
  ProfilePage,
  SettingsPage,
  ChatWorkspacePage,
} from './routes/MemberRoutes';
import { OwnerDashboardPage } from './routes/OwnerRoutes';
import { OrganizationsListPage, OrganizationDetailPage } from './routes/OrganizationRoutes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Route>

        <Route path="/chat" element={<AuthGuard><ChatWorkspacePage /></AuthGuard>} />

        <Route element={<AuthGuard><ShellLayout /></AuthGuard>}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/organizations" element={<OrganizationsListPage />} />
          <Route path="/organizations/:orgId" element={<OrganizationDetailPage />} />

          <Route path="/admin" element={<OwnerGuard><OwnerDashboardPage /></OwnerGuard>} />
          <Route path="/owner" element={<Navigate to="/admin" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
