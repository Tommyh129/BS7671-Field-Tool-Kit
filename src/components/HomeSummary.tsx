import { useEffect, useState } from 'react';
import { Calculator, ChevronRight, FolderOpen, Crown, Check } from 'lucide-react';
import { readBusiness, subscribeBusiness, syncBusiness } from '../business/store';
import { today, ukDate, type BusinessRecord } from '../business/model';
import { dueProjects, frequentTools, readToolUsage, TOOL_LABELS } from '../services/homeSummary';
import type { AppMode } from '../types';
import { SUBSCRIPTION_PLANS } from '../subscriptions';

export default function HomeSummary({ uid, business, pro, openProject, openTool, openProjects, upgradeBusiness }: {
  uid?: string; business: boolean; pro: boolean; openProject: (id: string) => void;
  openTool: (mode: AppMode) => void; openProjects: () => void;
  upgradeBusiness: () => void;
}) {
  const [records, setRecords] = useState<BusinessRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cloudWarning, setCloudWarning] = useState(false);
  const [usage, setUsage] = useState(() => readToolUsage(uid));
  useEffect(() => {
    const update = () => setUsage(readToolUsage(uid));
    update(); window.addEventListener('sparkys-tool-usage-updated', update);
    return () => window.removeEventListener('sparkys-tool-usage-updated', update);
  }, [uid]);
  useEffect(() => {
    setRecords([]); setError(''); setCloudWarning(false);
    if (!uid || !business) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    const load = async () => {
      try { const rows = await readBusiness(uid); if (live) { setRecords(rows); setError(''); } }
      catch { if (live) setError('Projects could not be read on this device. Open Projects to retry.'); }
      finally { if (live) setLoading(false); }
    };
    void load();
    const unsubscribe = subscribeBusiness(() => void load());
    const failed = () => { if (live) setCloudWarning(true); };
    const complete = (event: Event) => { if (live && (event as CustomEvent).detail === uid) setCloudWarning(false); };
    window.addEventListener('sparkys-business-sync-error', failed);
    window.addEventListener('sparkys-business-sync-complete', complete);
    void syncBusiness(uid).catch(() => { if (live) setCloudWarning(true); });
    return () => { live = false; unsubscribe(); window.removeEventListener('sparkys-business-sync-error', failed); window.removeEventListener('sparkys-business-sync-complete', complete); };
  }, [uid, business]);
  const projects = dueProjects(records);
  return <>
    {business && <section className="sm:col-span-2 min-w-0" aria-label="Upcoming Projects">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-bold text-white">Upcoming Projects</h3>
        <button onClick={openProjects} className="text-sm text-emerald-400 flex items-center gap-1">Projects<ChevronRight size={16}/></button>
      </div>
      {!uid ? <p className="text-sm text-gray-400">Sign in to view your projects.</p>
        : loading ? <p role="status" className="text-sm text-gray-400">Loading projects...</p>
        : error ? <p role="alert" className="text-sm text-amber-400">{error}</p>
        : <>
          {cloudWarning && <p role="status" className="text-sm text-amber-400 mb-3">Cloud sync is unavailable. Showing projects saved on this device.</p>}
          {!projects.length && <p className="text-sm text-gray-400">No projects with a start date are waiting to start.</p>}
          <div className="divide-y divide-white/10">{projects.map(row => <button key={row.id} onClick={() => openProject(row.id)}
            className="w-full text-left py-4 flex items-start gap-3 min-w-0 hover:bg-white/5">
            <FolderOpen size={20} className="text-emerald-400 shrink-0 mt-1"/>
            <span className="min-w-0 flex-1 break-words"><span className="block font-bold">Project {row.payload.number} - {row.payload.customer}</span>
              <span className="block text-sm text-gray-400">{row.payload.title}</span>
              <span className="block text-sm text-emerald-400 mt-1">{ukDate(row.payload.startDate!)}{row.payload.startDate! < today() ? ' - Overdue start' : ''}</span>
              {row.sync !== 'synced' && <span className="block text-xs text-amber-400">Unsynced</span>}
            </span><ChevronRight size={18} className="shrink-0 text-gray-500"/>
          </button>)}</div>
        </>}
    </section>}
    <section className="sm:col-span-2 min-w-0 mt-4" aria-label="Most used tools">
      <h3 className="font-bold text-white mb-3">Most Used Tools</h3>
      <div className="grid grid-cols-2 gap-3">{frequentTools(usage, pro).map(mode => <button key={mode} onClick={() => openTool(mode)}
        className="min-w-0 text-left bg-hardware-card border border-hardware-border rounded-lg p-4 flex items-start gap-3 hover:border-emerald-500/40">
        <Calculator size={20} className="text-emerald-400 shrink-0"/><span className="text-sm font-bold break-words min-w-0">{TOOL_LABELS[mode]}</span>
      </button>)}</div>
    </section>
    {!business && <section aria-label="Upgrade to Business" className="sm:col-span-2 min-w-0 mt-6 py-6 border-t border-emerald-500/30">
      <div className="flex items-center gap-3 mb-2">
        <Crown size={24} className="text-emerald-400 shrink-0"/>
        <h3 className="text-xl font-bold text-white">Upgrade to Business</h3>
      </div>
      <p className="text-lg font-bold text-emerald-400 mb-4">{SUBSCRIPTION_PLANS.business.price}</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 text-sm text-gray-300">
        {['All Pro calculation and design tools', 'Project folders and start-date scheduling',
          'Quotes, estimates and invoices', 'Materials lists and saved calculations',
          'Editable risk assessments and method statements', 'Your business profile and branded PDFs'].map(benefit =>
          <li key={benefit} className="flex items-start gap-2 min-w-0"><Check size={16} className="text-emerald-400 shrink-0 mt-0.5"/><span className="break-words">{benefit}</span></li>)}
      </ul>
      <button onClick={upgradeBusiness} className="min-h-12 w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-5 py-3 font-bold flex items-center justify-center gap-2">
        <Crown size={18}/>Upgrade to Business
      </button>
    </section>}
  </>;
}
