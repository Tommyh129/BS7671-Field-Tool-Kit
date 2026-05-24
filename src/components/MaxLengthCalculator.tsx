import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Ruler, Share2, Activity, AlertTriangle, CheckCircle2, History as HistoryIcon, Check } from 'lucide-react';
import { DeviceType, CableType } from '../types';
import { DEVICE_LIMITS, CABLE_DATABASE, VOLTAGES } from '../constants';
import { getCircuitR1R2MilliOhmsPerMetre } from '../utils/resistance';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface MaxLengthCalculatorProps {
  onShare: (text: string) => void;
}

export default function MaxLengthCalculator({ onShare }: MaxLengthCalculatorProps) {
  const [deviceType, setDeviceType] = useState<DeviceType>(DeviceType.MCB_B);
  const [cableType, setCableType] = useState<CableType>(CableType.PVC_PVC);
  const [rating, setRating] = useState<number>(32);
  const [cableSize, setCableSize] = useState<string>('2.5');
  const [ze, setZe] = useState<string>('0.35');
  const [allowedVD, setAllowedVD] = useState<string>('5');
  const [loadAmps, setLoadAmps] = useState<string>('20');
  const [enteredLength, setEnteredLength] = useState<string>('');
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const lastSavedHistoryRef = React.useRef<string | null>(null);

  const calculation = useMemo(() => {
    const zeVal = parseFloat(ze) || 0;
    const sizeVal = parseFloat(cableSize);
    const vdLimit = parseFloat(allowedVD) || 5;
    const loadVal = parseFloat(loadAmps) || 0;
    const lengthVal = parseFloat(enteredLength) || 0;

    // Find mV/A/m for the cable size
    const cableData = CABLE_DATABASE[cableType]?.find(c => c.size === sizeVal);
    const mvAm = cableData?.mvAm || 18; // Default to 2.5mm2 value if not found

    // Find Zs limit
    const zsLimit = DEVICE_LIMITS[deviceType][rating] || 0;

    const r1r2PerMetre = getCircuitR1R2MilliOhmsPerMetre(cableType, sizeVal);
    const designR1R2PerMetre = r1r2PerMetre ? r1r2PerMetre * 1.2 : Number.POSITIVE_INFINITY;

    // Max length for Zs
    const maxLenZs = Math.max(0, (zsLimit - zeVal) / (designR1R2PerMetre / 1000));

    // Max length for Voltage Drop
    // VD = (mV/A/m * I * L) / 1000
    // L = (VD_limit * 1000) / (mV/A/m * I)
    const vdLimitVolts = (vdLimit / 100) * VOLTAGES.SINGLE_PHASE;
    const maxLenVD = loadVal > 0 && mvAm > 0
      ? (vdLimitVolts * 1000) / (mvAm * loadVal)
      : Number.POSITIVE_INFINITY;

    const maxLen = Math.min(maxLenZs, maxLenVD);
    const isCompliant = lengthVal > 0 ? lengthVal <= maxLen : true;

    return {
      maxLen,
      maxLenZs,
      maxLenVD,
      isCompliant,
      limitingFactor: maxLenZs < maxLenVD ? 'Zs Limit' : 'Voltage Drop'
    };
  }, [deviceType, rating, cableType, cableSize, ze, allowedVD, loadAmps, enteredLength]);

  const handleShare = () => {
    const text = `
📏 MAX CABLE LENGTH CALCULATION 📏
-------------------------
Device: ${deviceType} ${rating}A
Cable Type: ${cableType}
Cable Size: ${cableSize}mm²
Ze: ${ze} Ω
Load: ${loadAmps} A
Allowed VD: ${allowedVD}%

Max Length (Zs): ${calculation.maxLenZs.toFixed(1)}m
Max Length (VD): ${calculation.maxLenVD.toFixed(1)}m
Overall Max Length = ${calculation.maxLen.toFixed(1)}m
Limiting Factor: ${calculation.limitingFactor}

Entered Length: ${enteredLength}m
Status: ${calculation.isCompliant ? '✅ PASS' : '❌ FAIL'}

Summary: The maximum cable length for this circuit is ${calculation.maxLen.toFixed(1)}m, limited by ${calculation.limitingFactor}.
-------------------------
Calculated via BS7671 Field Toolkit
    `.trim();
    onShare(text);
  };

  const handleSaveHistory = async () => {
    if (isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser?.uid,
        'max_length',
        `Max Length: ${deviceType} ${rating}A / ${cableType} ${cableSize}mm²`,
        { deviceType, cableType, rating, cableSize, ze, allowedVD, loadAmps, enteredLength },
        { maxLen: calculation.maxLen, limitingFactor: calculation.limitingFactor, isCompliant: calculation.isCompliant }
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(calculation.maxLen) || calculation.maxLen <= 0) return;

    const payload = {
      type: 'max_length' as const,
      title: `Max Length: ${deviceType} ${rating}A / ${cableType} ${cableSize}mm²`,
      inputs: { deviceType, cableType, rating, cableSize, ze, allowedVD, loadAmps, enteredLength },
      results: { maxLen: calculation.maxLen, limitingFactor: calculation.limitingFactor, isCompliant: calculation.isCompliant }
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving max length history:', error);
    });
  }, [calculation, deviceType, rating, cableType, cableSize, ze, allowedVD, loadAmps, enteredLength]);

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Type</label>
              <select 
                value={cableType}
                onChange={(e) => setCableType(e.target.value as CableType)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.values(CableType).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Device Type</label>
              <select 
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.values(DeviceType).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Rating (A)</label>
              <select 
                value={rating}
                onChange={(e) => setRating(parseInt(e.target.value))}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.keys(DEVICE_LIMITS[deviceType]).map(Number).sort((a, b) => a - b).map(r => (
                  <option key={r} value={r}>{r}A</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Size (mm²)</label>
              <select 
                value={cableSize}
                onChange={(e) => setCableSize(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {[...CABLE_DATABASE[cableType]].sort((a, b) => a.size - b.size).map(c => (
                  <option key={c.size} value={c.size}>{c.size}mm²</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Ze (Ω)</label>
              <input 
                type="number"
                value={ze}
                onChange={(e) => setZe(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Load (Amps)</label>
              <input 
                type="number"
                value={loadAmps}
                onChange={(e) => setLoadAmps(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Allowed VD (%)</label>
              <select 
                value={allowedVD}
                onChange={(e) => setAllowedVD(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                <option value="3">3% (Lighting)</option>
                <option value="5">5% (Other)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Circuit Length (m) - Optional</label>
            <input 
              type="number"
              value={enteredLength}
              onChange={(e) => setEnteredLength(e.target.value)}
              placeholder="Check against max length"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className={`p-6 rounded-3xl border ${calculation.isCompliant ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Activity size={18} className={calculation.isCompliant ? 'text-emerald-500' : 'text-red-500'} />
              <h3 className="font-bold text-white uppercase tracking-wider text-sm">Max Length Result</h3>
            </div>
            {enteredLength && (
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${calculation.isCompliant ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                {calculation.isCompliant ? 'Pass' : 'Fail'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Max Permitted Length</p>
              <p className="text-3xl font-mono font-bold text-emerald-500">{calculation.maxLen.toFixed(1)}m</p>
              <p className="text-[10px] text-gray-500 mt-2 uppercase font-bold tracking-widest">Limited by: {calculation.limitingFactor}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-black/20 rounded-2xl border border-hardware-border/30">
                <p className="text-gray-500 text-[8px] font-bold uppercase tracking-widest mb-1">Zs Limit</p>
                <p className="text-sm font-mono font-bold text-white">{calculation.maxLenZs.toFixed(1)}m</p>
              </div>
              <div className="p-4 bg-black/20 rounded-2xl border border-hardware-border/30">
                <p className="text-gray-500 text-[8px] font-bold uppercase tracking-widest mb-1">VD Limit</p>
                <p className="text-sm font-mono font-bold text-white">{calculation.maxLenVD.toFixed(1)}m</p>
              </div>
            </div>
          </div>

          {!calculation.isCompliant && (
            <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 mb-6">
              <div className="flex gap-3">
                <AlertTriangle className="text-red-500 shrink-0" size={18} />
                <p className="text-xs text-red-200 leading-relaxed">
                  The entered length of {enteredLength}m exceeds the maximum permitted length of {calculation.maxLen.toFixed(1)}m.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest"
            >
              <Share2 size={14} />
              Share
            </button>
            <button
              onClick={handleSaveHistory}
              disabled={isSavingHistory}
              className="flex items-center justify-center gap-2 py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest text-emerald-500 disabled:opacity-50"
            >
              {isSavingHistory ? <Check size={14} /> : <HistoryIcon size={14} />}
              {isSavingHistory ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
