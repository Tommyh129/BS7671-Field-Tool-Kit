import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function RecalculateButton({ inputKey, message, onRecalculate }: { inputKey: string; message: string; onRecalculate?: () => void }) {
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [pending, setPending] = useState(false);
  useEffect(() => { if (pending) { setLastKey(inputKey); setPending(false); } },[pending,inputKey]);
  return <div className="space-y-2">
    <button type="button" onClick={() => { onRecalculate?.(); setPending(true); setRun(value => value + 1); }} className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl text-[10px] font-bold uppercase text-emerald-500">
      <RefreshCw size={16} /> Recalculate
    </button>
    {lastKey === inputKey && <p key={run} role="status" className="text-xs text-gray-400 break-words">{message}</p>}
  </div>;
}
