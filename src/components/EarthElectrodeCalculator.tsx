import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Activity, Share2, AlertTriangle, CheckCircle2, History as HistoryIcon, Check, LogIn } from 'lucide-react';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface EarthElectrodeCalculatorProps {
  onShare: (text: string) => void;
}

export default function EarthElectrodeCalculator({ onShare }: EarthElectrodeCalculatorProps) {
  const [measuredResistance, setMeasuredResistance] = useState<string>('');
  const [rcdRating, setRcdRating] = useState<string>('30'); // mA
  const [voltage, setVoltage] = useState<string>('230');
  const [disconnectionTime, setDisconnectionTime] = useState<string>('200'); // ms for TT
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const calculation = useMemo(() => {
    const measuredVal = parseFloat(measuredResistance) || 0;
    const rcdVal = parseFloat(rcdRating) || 30;
    
    // Max Ra = 50V / I_delta_n
    const maxRa = 50 / (rcdVal / 1000);
    
    // BS 7671 Note: Ra should be as low as possible, values above 200 ohms may be unstable.
    const isCompliant = measuredVal > 0 && measuredVal <= maxRa;
    const isStable = measuredVal <= 200;

    return {
      maxRa,
      isCompliant,
      isStable
    };
  }, [measuredResistance, rcdRating]);

  const handleShare = () => {
    const text = `
⚡ EARTH ELECTRODE CALCULATION (TT) ⚡
-------------------------
Measured Resistance: ${measuredResistance} Ω
RCD Rating: ${rcdRating} mA
Supply Voltage: ${voltage} V
Required Disconnection Time: ${disconnectionTime} ms

Max Permitted Ra = ${calculation.maxRa.toFixed(0)} Ω
Status: ${calculation.isCompliant ? '✅ PASS' : '❌ FAIL'}
Stability Check: ${calculation.isStable ? 'STABLE' : 'UNSTABLE (>200Ω)'}

Summary: The measured electrode resistance of ${measuredResistance}Ω is ${calculation.isCompliant ? 'compliant' : 'NOT compliant'} with the ${rcdRating}mA RCD.
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
        'electrode',
        `Electrode: ${measuredResistance}Ω`,
        { measuredResistance, rcdRating, voltage, disconnectionTime },
        { maxRa: calculation.maxRa, isCompliant: calculation.isCompliant, isStable: calculation.isStable }
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
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Measured Resistance (Ω)</label>
            <input 
              type="number"
              value={measuredResistance}
              onChange={(e) => setMeasuredResistance(e.target.value)}
              placeholder="e.g. 45"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">RCD Rating (mA)</label>
            <select 
              value={rcdRating}
              onChange={(e) => setRcdRating(e.target.value)}
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
            >
              <option value="30">30 mA</option>
              <option value="100">100 mA</option>
              <option value="300">300 mA</option>
              <option value="500">500 mA</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Voltage (V)</label>
              <input 
                type="number"
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Disc. Time (ms)</label>
              <input 
                type="number"
                value={disconnectionTime}
                onChange={(e) => setDisconnectionTime(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {measuredResistance && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`p-6 rounded-3xl border ${calculation.isCompliant ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className={calculation.isCompliant ? 'text-emerald-500' : 'text-red-500'} />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Electrode Result</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${calculation.isCompliant ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                {calculation.isCompliant ? 'Pass' : 'Fail'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Max Permitted Ra</p>
                <p className="text-2xl font-mono font-bold text-white">{calculation.maxRa.toFixed(0)} Ω</p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Stability</p>
                <p className={`text-2xl font-mono font-bold ${calculation.isStable ? 'text-emerald-500' : 'text-orange-500'}`}>
                  {calculation.isStable ? 'Stable' : 'Unstable'}
                </p>
              </div>
            </div>

            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
              <div className="flex gap-3">
                {calculation.isCompliant ? (
                  <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
                ) : (
                  <AlertTriangle className="text-red-500 shrink-0" size={18} />
                )}
                <p className="text-xs text-gray-400 leading-relaxed">
                  {calculation.isCompliant 
                    ? `The measured resistance of ${measuredResistance}Ω is within the maximum limit of ${calculation.maxRa.toFixed(0)}Ω for a ${rcdRating}mA RCD.`
                    : `The measured resistance of ${measuredResistance}Ω exceeds the maximum limit of ${calculation.maxRa.toFixed(0)}Ω. The RCD may not provide adequate protection.`}
                  {!calculation.isStable && " Note: Values above 200Ω are considered unstable by BS 7671."}
                </p>
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
