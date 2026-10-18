import React from 'react';

export const LandingChatPage: React.FC = () => (
  <div className="max-w-4xl mx-auto py-12 text-center">
    <h1 className="text-4xl font-extrabold text-white mb-4">Solyra Neural Chat</h1>
    <p className="text-slate-400 text-lg mb-8">Instant conversational reasoning without mandatory registration.</p>
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-left text-slate-300">
      <p className="text-emerald-400 font-semibold mb-2">Guest Conversation Session Active</p>
      <p className="text-sm text-slate-400">Guest chat vertical slice foundation ready. Full session persistence available upon sign-up.</p>
    </div>
  </div>
);

export const LoginPage: React.FC = () => (
  <div className="max-w-md mx-auto py-12">
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Member Sign In</h2>
      <p className="text-sm text-slate-400">Step 5 will connect form inputs to the verified <span className="font-mono text-emerald-400">/auth/login</span> backend API.</p>
    </div>
  </div>
);

export const SignupPage: React.FC = () => (
  <div className="max-w-md mx-auto py-12">
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Create Account</h2>
      <p className="text-sm text-slate-400">Step 5 will connect form inputs to the verified <span className="font-mono text-emerald-400">/auth/signup</span> backend API.</p>
    </div>
  </div>
);

export const ForgotPasswordPage: React.FC = () => (
  <div className="max-w-md mx-auto py-12">
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Reset Password</h2>
      <p className="text-sm text-slate-400">Step 5 will connect recovery requests to <span className="font-mono text-emerald-400">/auth/forgot-password</span>.</p>
    </div>
  </div>
);

export const ResetPasswordPage: React.FC = () => (
  <div className="max-w-md mx-auto py-12">
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Set New Password</h2>
      <p className="text-sm text-slate-400">Step 5 will connect password updates to <span className="font-mono text-emerald-400">/auth/reset-password</span>.</p>
    </div>
  </div>
);
