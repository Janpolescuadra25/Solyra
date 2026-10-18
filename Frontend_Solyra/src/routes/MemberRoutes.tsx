import React from 'react';

export const DashboardPage: React.FC = () => (
  <div className="max-w-6xl mx-auto py-8">
    <h1 className="text-3xl font-bold text-white mb-4">Member Workspace</h1>
    <p className="text-slate-400">Authenticated conversational session workspace (Step 6 target).</p>
  </div>
);

export const SettingsPage: React.FC = () => (
  <div className="max-w-4xl mx-auto py-8">
    <h1 className="text-3xl font-bold text-white mb-4">Account Settings</h1>
    <p className="text-slate-400">Member profile, session revocation, and security controls.</p>
  </div>
);

export const OnboardingPage: React.FC = () => (
  <div className="max-w-2xl mx-auto py-8">
    <h1 className="text-3xl font-bold text-white mb-4">Account Onboarding</h1>
    <p className="text-slate-400">Resumable member onboarding sequence.</p>
  </div>
);
