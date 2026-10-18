import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
} from './routes/MemberRoutes';
import { OwnerDashboardPage } from './routes/OwnerRoutes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/chat" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          <Route path="/app" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          <Route path="/profile" element={<AuthGuard><ProfilePage /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
          <Route path="/onboarding" element={<AuthGuard><OnboardingPage /></AuthGuard>} />

          <Route path="/admin" element={<AuthGuard><OwnerGuard><OwnerDashboardPage /></OwnerGuard></AuthGuard>} />
          <Route path="/owner" element={<Navigate to="/admin" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
