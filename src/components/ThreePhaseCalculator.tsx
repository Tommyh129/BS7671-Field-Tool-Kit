import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Zap, Share2, Activity, ArrowRightLeft, History as HistoryIcon, Check } from 'lucide-react';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface ThreePhaseCalculatorProps {
  onShare: (text: string) => void;
}

export default function ThreePhaseCalculator({ onShare }: ThreePhaseCalculatorProps) {
  const [voltage, setVoltage] = useState<string>('400');
  const [phaseType, setPhaseType] = useState<'single' | 'three'>('three');
  const [current, setCurrent] = useState<string>('');
  const [power, setPower] = useState<string>('');
  const [pf, setPf] = useState<string>('0.85');
  const [calcDirection, setCalcDirection] = useState<'toPower' | 'toCurrent'>('toPower');
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const lastSavedHistoryRef = React.useRef<string | null>(null);

  const calculation = useMemo(() => {
    const vVal = parseFloat(voltage) || 400;
    const iVal = parseFloat(current) || 0;
    const pVal = parseFloat(power) || 0;
    const pfVal = parseFloat(pf) || 1;
    const multiplier = phaseType === 'three' ? Math.sqrt(3) : 1;

    if (calcDirection === 'toPower') {
      const calculatedPowerWatts = multiplier * vVal * iVal * pfVal;
      const calculatedPowerKW = calculatedPowerWatts / 1000;
      return {
        power: calculatedPowerKW,
        current: iVal,
        voltage: vVal,
        pf: pfVal,
        phaseType
      };
    } else {
      const calculatedCurrent = (pVal * 1000) / (multiplier * vVal * pfVal);
      return {
        power: pVal,
        current: calculatedCurrent,
        voltage: vVal,
        pf: pfVal,
        phaseType
      };
    }
  }, [voltage, current, power, pf, calcDirection, phaseType]);

  const handleShare = () => {
    const text = `
⚡ ${phaseType === 'three' ? 'THREE-PHASE' : 'SINGLE-PHASE'} POWER CALCULATION ⚡
-------------------------
Phase: ${phaseType === 'three' ? '3-Phase' : '1-Phase'}
Voltage: ${voltage} V
Power Factor: ${pf}
${calcDirection === 'toPower' ? `Current: ${current} A` : `Power: ${power} kW`}

Resulting ${calcDirection === 'toPower' ? 'Power' : 'Current'}:
Voltage = ${calculation.voltage} V
Current = ${calculation.current.toFixed(2)} A
Power = ${calculation.power.toFixed(2)} kW
Power Factor = ${calculation.pf}

Formula: ${calcDirection === 'toPower' 
  ? `P = ${phaseType === 'three' ? '√3 × ' : ''}V × I × PF` 
  : `I = P / (${phaseType === 'three' ? '√3 × ' : ''}V × PF)`}
-------------------------
Calculated via BS7671 Field Toolkit
    `.trim();
    onShare(text);
  };

  const handleSaveHistory = async () => {
    if (!calculation || isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser?.uid,
        'three-phase',
        `${phaseType === 'three' ? '3-Phase' : '1-Phase'}: ${calcDirection === 'toPower' ? calculation.power.toFixed(2) + 'kW' : calculation.current.toFixed(2) + 'A'}`,
        { voltage, current, power, pf, calcDirection, phaseType },
        { power: calculation.power, current: calculation.current, voltage: calculation.voltage, pf: calculation.pf, phaseType }
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    const hasInput = calcDirection === 'toPower' ? (parseFloat(current) || 0) > 0 : (parseFloat(power) || 0) > 0;
    if (!hasInput || !calculation) return;

    const payload = {
      type: 'three-phase' as const,
      title: `${phaseType === 'three' ? '3-Phase' : '1-Phase'}: ${calcDirection === 'toPower' ? calculation.power.toFixed(2) + 'kW' : calculation.current.toFixed(2) + 'A'}`,
      inputs: { voltage, current, power, pf, calcDirection, phaseType },
      results: { power: calculation.power, current: calculation.current, voltage: calculation.voltage, pf: calculation.pf, phaseType }
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving power calculator history:', error);
    });
  }, [calculation, voltage, current, power, pf, calcDirection, phaseType]);

  const togglePhase = () => {
    const newPhase = phaseType === 'three' ? 'single' : 'three';
    setPhaseType(newPhase);
    setVoltage(newPhase === 'three' ? '400' : '230');
  };

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Phase Type</label>
              <button
                onClick={togglePhase}
                className={`w-full py-4 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest ${
                  phaseType === 'three' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                    : 'bg-orange-500/10 border-orange-500/20 text-orange-500'
                }`}
              >
                {phaseType === 'three' ? 'Three Phase' : 'Single Phase'}
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Calculation Mode</label>
              <button
                onClick={() => setCalcDirection(calcDirection === 'toPower' ? 'toCurrent' : 'toPower')}
                className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-white hover:bg-white/10 transition-all group"
              >
                <ArrowRightLeft size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {calcDirection === 'toPower' ? 'To Power' : 'To Current'}
                </span>
              </button>
            </div>
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
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Power Factor</label>
              <input 
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={pf}
                onChange={(e) => setPf(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
          </div>

          {calcDirection === 'toPower' ? (
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Current (Amps)</label>
              <div className="flex items-center gap-4 bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 focus-within:border-emerald-500/50 transition-colors">
                <Zap size={20} className="text-orange-500" />
                <input 
                  type="number"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Enter Amps"
                  className="w-full bg-transparent text-white font-mono font-bold outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Power (kW)</label>
              <div className="flex items-center gap-4 bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 focus-within:border-emerald-500/50 transition-colors">
                <Zap size={20} className="text-emerald-500" />
                <input 
                  type="number"
                  value={power}
                  onChange={(e) => setPower(e.target.value)}
                  placeholder="Enter kW"
                  className="w-full bg-transparent text-white font-mono font-bold outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {(current || power) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
            <div className="flex items-center gap-2 mb-6">
              <Activity size={18} className="text-emerald-500" />
              <h3 className="font-bold text-white uppercase tracking-wider text-sm">Calculation Results</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Voltage</p>
                <p className="text-xl font-mono font-bold text-white">{calculation.voltage}V</p>
              </div>
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Power Factor</p>
                <p className="text-xl font-mono font-bold text-white">{calculation.pf}</p>
              </div>
              <div className={`p-4 rounded-2xl border ${calcDirection === 'toPower' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-black/40 border-hardware-border/50'}`}>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Power (kW)</p>
                <p className={`text-xl font-mono font-bold ${calcDirection === 'toPower' ? 'text-emerald-500' : 'text-white'}`}>
                  {calculation.power.toFixed(2)} kW
                </p>
              </div>
              <div className={`p-4 rounded-2xl border ${calcDirection === 'toCurrent' ? 'bg-orange-500/10 border-orange-500/20' : 'bg-black/40 border-hardware-border/50'}`}>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Current (A)</p>
                <p className={`text-xl font-mono font-bold ${calcDirection === 'toCurrent' ? 'text-orange-500' : 'text-white'}`}>
                  {calculation.current.toFixed(2)} A
                </p>
              </div>
            </div>

            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 mb-6">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Calculation Steps</p>
              <p className="text-xs font-mono text-gray-400">
                {calcDirection === 'toPower' 
                  ? `P = ${phaseType === 'three' ? '√3 × ' : ''}${calculation.voltage}V × ${calculation.current.toFixed(2)}A × ${calculation.pf} = ${(calculation.power * 1000).toFixed(0)}W`
                  : `I = (${calculation.power}kW × 1000) / (${phaseType === 'three' ? '√3 × ' : ''}${calculation.voltage}V × ${calculation.pf}) = ${calculation.current.toFixed(2)}A`}
              </p>
            </div>

            <div className="flex gap-4">
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
                {isSavingHistory ? <Check size={14} /> : <HistoryIcon size={14} />}
                {isSavingHistory ? 'Saved' : 'Save History'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
