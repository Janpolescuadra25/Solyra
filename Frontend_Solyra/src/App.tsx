import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShellLayout } from './components/layout/ShellLayout';
import { AuthGuard } from './components/guards/AuthGuard';
import { OwnerGuard } from './components/guards/OwnerGuard';
import {
  LandingChatPage,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from './routes/PublicRoutes';
import {
  DashboardPage,
  SettingsPage,
  OnboardingPage,
} from './routes/MemberRoutes';
import { OwnerDashboardPage } from './routes/OwnerRoutes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route path="/" element={<LandingChatPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
          <Route path="/onboarding" element={<AuthGuard><OnboardingPage /></AuthGuard>} />

          <Route path="/owner" element={<AuthGuard><OwnerGuard><OwnerDashboardPage /></OwnerGuard></AuthGuard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
