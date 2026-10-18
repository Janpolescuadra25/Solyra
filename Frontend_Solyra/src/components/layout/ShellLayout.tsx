import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Shield, LogOut, LogIn } from 'lucide-react';

export const ShellLayout: React.FC = () => {
  const { isAuthenticated, tier, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-emerald-400" />
          <span>Solyra</span>
          {tier === 'guest' && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Guest</span>}
          {tier === 'member' && <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded">Member</span>}
          {tier === 'owner' && <span className="text-xs bg-purple-950 text-purple-400 px-2 py-0.5 rounded">Owner</span>}
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link to="/" className="hover:text-emerald-400 transition-colors">Chat</Link>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="hover:text-emerald-400 transition-colors">Workspace</Link>
              <Link to="/settings" className="hover:text-emerald-400 transition-colors">Settings</Link>
              {tier === 'owner' && (
                <Link to="/owner" className="hover:text-purple-400 text-purple-300 flex items-center gap-1">
                  <Shield className="w-4 h-4" /> Admin
                </Link>
              )}
              <button onClick={handleLogout} className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors ml-2">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="flex items-center gap-1 text-slate-300 hover:text-emerald-400 transition-colors">
                <LogIn className="w-4 h-4" /> Sign In
              </Link>
              <Link to="/signup" className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors">
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
};
