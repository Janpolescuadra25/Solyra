import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, ArrowRight, UserCheck, Settings } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, tier } = useAuth();
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-slate-100">Welcome, {user?.fullName || 'User'}</h1>
        <p className="text-slate-400 text-sm mt-1">Tier: <span className="capitalize font-semibold text-indigo-400">{tier}</span></p>
      </div>
    </div>
  );
};

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const STORAGE_KEY = 'solyra_onboarding_draft';

  const [step, setStep] = useState<number>(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.step || 1;
      } catch {
        return 1;
      }
    }
    return 1;
  });

  const [formData, setFormData] = useState<{ displayName: string; roleIntent: string; notificationOptIn: boolean }>(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          displayName: parsed.displayName || user?.fullName || '',
          roleIntent: parsed.roleIntent || 'developer',
          notificationOptIn: parsed.notificationOptIn ?? true,
        };
      } catch {
        // Fallback
      }
    }
    return {
      displayName: user?.fullName || '',
      roleIntent: 'developer',
      notificationOptIn: true,
    };
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...formData, step }));
  }, [formData, step]);

  const handleComplete = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    navigate('/app');
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Workspace Onboarding</h1>
            <p className="text-xs text-slate-400 mt-0.5">Step {step} of 3</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-6 h-1.5 rounded-full transition-colors ${
                  s === step ? 'bg-indigo-500' : s < step ? 'bg-indigo-400/40' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Confirm Your Identity</h2>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Primary Objective</h2>
            <div className="space-y-2">
              {[
                { id: 'developer', title: 'Developer & Engineering', desc: 'Building integrations and managing APIs' },
                { id: 'operator', title: 'Operational Manager', desc: 'Monitoring autonomous systems and logs' },
                { id: 'architect', title: 'Enterprise Architect', desc: 'Overseeing contracts, models, and council' },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    formData.roleIntent === item.id
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="roleIntent"
                    value={item.id}
                    checked={formData.roleIntent === item.id}
                    onChange={() => setFormData({ ...formData, roleIntent: item.id })}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Setup Complete</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Your profile configuration is saved. You are ready to start collaborating inside Solyra.
              </p>
            </div>
            <button
              onClick={handleComplete}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow"
            >
              Enter Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, tier } = useAuth();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-400" /> Account Profile
        </h1>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Full Name</span>
            <span className="text-slate-200 font-medium">{user?.fullName || 'N/A'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Email Address</span>
            <span className="text-slate-200 font-medium">{user?.email || 'N/A'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Role Tier</span>
            <span className="text-indigo-400 font-semibold uppercase">{tier}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" /> Preferences & Settings
        </h1>
        <p className="text-xs text-slate-400">Solyra workspace configuration and security settings.</p>
      </div>
    </div>
  );
};
