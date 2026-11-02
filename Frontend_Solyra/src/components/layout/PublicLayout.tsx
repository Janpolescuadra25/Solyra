import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export const PublicLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-white hover:text-indigo-400 transition-colors">
          <span className="text-indigo-500">✦</span> Solyra
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg shadow-sm shadow-indigo-500/20 transition-all"
          >
            Get Started
          </Link>
        </div>
      </header>
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
    </div>
  );
};
