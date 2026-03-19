import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Activity, Zap, AlertTriangle, CheckCircle2, Share2, History as HistoryIcon, Check, LogIn } from 'lucide-react';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface FaultCurrentCalculatorProps {
  onShare: (text: string) => void;
}

export default function FaultCurrentCalculator({ onShare }: FaultCurrentCalculatorProps) {
  const [voltage, setVoltage] = useState<string>('230');
  const [zs, setZs] = useState<string>('');
  const [phaseType, setPhaseType] = useState<'single' | 'three'>('single');
  const [breakingCapacity, setBreakingCapacity] = useState<string>('6000'); // 6kA default
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const calculation = useMemo(() => {
    const vVal = parseFloat(voltage) || 0;
    const zsVal = parseFloat(zs) || 0;
    const capacityVal = parseFloat(breakingCapacity) || 0;

    if (zsVal === 0) return null;

    // For three phase, the PFC is usually taken as 2 * (Uo / Zs)
    // where Uo is the phase-to-neutral voltage (230V).
    const multiplier = phaseType === 'three' ? 2 : 1;
    const calculationVoltage = phaseType === 'three' ? 230 : vVal;
    const faultCurrentAmps = (calculationVoltage / zsVal) * multiplier;
    const faultCurrentKA = faultCurrentAmps / 1000;
    const isAdequate = (faultCurrentAmps <= capacityVal);

    return {
      amps: faultCurrentAmps,
      ka: faultCurrentKA,
      isAdequate
    };
  }, [voltage, zs, phaseType, breakingCapacity]);

  const handleShare = () => {
    if (!calculation) return;
    const text = `
⚡ FAULT CURRENT CALCULATION ⚡
-------------------------
Voltage: ${voltage}V (${phaseType === 'single' ? 'Single Phase' : 'Three Phase'})
Loop Impedance (Zs): ${zs} Ω
Device Breaking Capacity: ${parseFloat(breakingCapacity) / 1000} kA

Fault Current = ${calculation.amps.toFixed(0)} A / ${calculation.ka.toFixed(2)} kA
Protective Device Adequate: ${calculation.isAdequate ? 'YES' : 'NO'}

Summary: The prospective fault current is ${calculation.ka.toFixed(2)}kA. The ${parseFloat(breakingCapacity) / 1000}kA device is ${calculation.isAdequate ? 'adequate' : 'NOT adequate'} for this location.
-------------------------
Calculated via BS7671 Field Toolkit
    `.trim();
    onShare(text);
  };

  const handleSaveHistory = async () => {
    if (!auth.currentUser) {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error('Login failed:', error);
        return;
      }
    }
    
    if (!calculation || isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser!.uid,
        'fault',
        `PFC: ${calculation.ka.toFixed(2)}kA`,
        { voltage, zs, phaseType, breakingCapacity },
        { amps: calculation.amps, ka: calculation.ka, isAdequate: calculation.isAdequate }
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Phase Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setPhaseType('single');
                  setVoltage('230');
                }}
                className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                  phaseType === 'single' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                }`}
              >
                Single Phase
              </button>
              <button
                onClick={() => {
                  setPhaseType('three');
                  setVoltage('400');
                }}
                className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                  phaseType === 'three' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                }`}
              >
                Three Phase
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply Voltage (V)</label>
            <input 
              type="number"
              value={voltage}
              onChange={(e) => setVoltage(e.target.value)}
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Loop Impedance (Zs) Ω</label>
            <input 
              type="number"
              value={zs}
              onChange={(e) => setZs(e.target.value)}
              placeholder="e.g. 0.35"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Device Breaking Capacity (Amps)</label>
            <select 
              value={breakingCapacity}
              onChange={(e) => setBreakingCapacity(e.target.value)}
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
            >
              <option value="3000">3 kA (3000A)</option>
              <option value="6000">6 kA (6000A)</option>
              <option value="10000">10 kA (10000A)</option>
              <option value="15000">15 kA (15000A)</option>
              <option value="25000">25 kA (25000A)</option>
            </select>
          </div>
        </div>
      </div>

      {calculation && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`p-6 rounded-3xl border ${calculation.isAdequate ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className={calculation.isAdequate ? 'text-emerald-500' : 'text-red-500'} />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Fault Current Result</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${calculation.isAdequate ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                {calculation.isAdequate ? 'Adequate' : 'Inadequate'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Fault Current (A)</p>
                <p className="text-2xl font-mono font-bold text-white">{calculation.amps.toFixed(0)}A</p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Fault Current (kA)</p>
                <p className="text-2xl font-mono font-bold text-white">{calculation.ka.toFixed(2)}kA</p>
              </div>
            </div>

            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
              <div className="flex gap-3">
                {calculation.isAdequate ? (
                  <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
                ) : (
                  <AlertTriangle className="text-red-500 shrink-0" size={18} />
                )}
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {calculation.isAdequate 
                      ? `The prospective fault current of ${calculation.ka.toFixed(2)}kA is within the breaking capacity of the ${parseFloat(breakingCapacity) / 1000}kA device.`
                      : `The prospective fault current of ${calculation.ka.toFixed(2)}kA EXCEEDS the breaking capacity of the ${parseFloat(breakingCapacity) / 1000}kA device. This is a critical safety issue.`}
                  </p>
                  <p className="text-[10px] text-gray-500 italic">
                    * Three-phase PFC is calculated as 2 × (Uo / Zs) per standard rule of thumb.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                <Share2 size={14} />
                Share
              </button>
              <button
                onClick={handleSaveHistory}
                disabled={isSavingHistory}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest text-emerald-500 disabled:opacity-50"
              >
                {!auth.currentUser ? (
                  <>
                    <LogIn size={14} />
                    Login to Save
                  </>
                ) : (
                  <>
                    {isSavingHistory ? <Check size={14} /> : <HistoryIcon size={14} />}
                    {isSavingHistory ? 'Saved' : 'Save History'}
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
