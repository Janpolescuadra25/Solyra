import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OrganizationSwitcher: React.FC = () => {
  const { organizations, currentOrganization, switchOrganization, isLoadingOrgs } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div ref={ref} className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">
      <Building2 className="w-4 h-4" /><span className="max-w-[140px] truncate">{isLoadingOrgs ? 'Loading...' : currentOrganization?.name ?? 'Select organization'}</span><ChevronDown className="w-3.5 h-3.5" />
    </button>
    {open && <div className="absolute right-0 mt-2 w-60 rounded-lg bg-slate-900 border border-slate-700 shadow-xl z-50 p-1">
      {organizations.map((org) => <button key={org.id} type="button" onClick={() => { void switchOrganization(org.id); setOpen(false); }} className="w-full flex justify-between px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 rounded">
        <span className="truncate">{org.name}</span>{currentOrganization?.id === org.id && <Check className="w-4 h-4 text-indigo-400" />}
      </button>)}
      <button type="button" onClick={() => { setOpen(false); navigate('/organizations'); }} className="w-full flex gap-2 px-3 py-2 text-left text-xs text-indigo-300 hover:bg-slate-800 rounded border-t border-slate-700 mt-1"><Plus className="w-3.5 h-3.5" />Manage organizations</button>
    </div>}
  </div>;
};
