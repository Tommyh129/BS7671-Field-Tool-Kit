import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Ruler, Share2, Activity, History as HistoryIcon, Check } from 'lucide-react';
import { CONDUCTOR_RESISTANCE, getResistanceSizes, formatSourceNotes } from '../data/electrical';
import SourceNotes from './SourceNotes';
import { InspectionCpcControl } from './CableDesignControls';
import RecalculateButton from './RecalculateButton';
import { InspectionCpcModel, resolveInspectionCpcSize } from '../utils/resistance';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface CableResistanceCalculatorProps {
  onShare: (text: string) => void;
}

export default function CableResistanceCalculator({ onShare }: CableResistanceCalculatorProps) {
  const [cableSize, setCableSize] = useState<string>('2.5');
  const [manualCpcSize, setCpcSize] = useState<string>('1.5');
  const [cpcModel, setCpcModel] = useState<InspectionCpcModel>('manual');
  const [length, setLength] = useState<string>('');
  const [material, setMaterial] = useState<'copper' | 'aluminium'>('copper');
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const lastSavedHistoryRef = React.useRef<string | null>(null);
  const sourceIds = material === 'copper' ? ['resistance-copper','cpc'] : ['resistance-aluminium'];
  const cableSizes = getResistanceSizes(material);
  const cpcSize = material === 'copper' && cpcModel !== 'manual'
    ? String(resolveInspectionCpcSize(cpcModel,Number(cableSize),Number(manualCpcSize)) ?? '') : manualCpcSize;

  const calculation = useMemo(() => {
    const sizeVal = parseFloat(cableSize);
    const cpcVal = parseFloat(cpcSize);
    const lengthVal = parseFloat(length) || 0;
    
    const r1_per_m = CONDUCTOR_RESISTANCE[material][sizeVal];
    const r2_per_m = CONDUCTOR_RESISTANCE[material][cpcVal];
    const isValid = !!r1_per_m && !!r2_per_m && Number.isFinite(lengthVal) && lengthVal > 0;
    const r1 = isValid ? (r1_per_m * lengthVal) / 1000 : 0;
    const r2 = isValid ? (r2_per_m * lengthVal) / 1000 : 0;
    const totalR = r1 + r2;

    return {
      isValid,
      r1,
      r2,
      totalR
    };
  }, [cableSize, cpcSize, length, material]);

  const handleShare = () => {
    if (!calculation.isValid) return;
    const text = `
📏 CABLE RESISTANCE CALCULATION 📏
-------------------------
Material: ${material.toUpperCase()}
Cable Size: ${cableSize}mm²
CPC Size: ${cpcSize}mm²
CPC Model: ${material === 'copper' ? cpcModel : 'manual installed aluminium conductors'}
Length: ${length}m

R1 (Line) = ${calculation.r1.toFixed(3)} Ω
R2 (CPC) = ${calculation.r2.toFixed(3)} Ω
Total R1+R2 = ${calculation.totalR.toFixed(3)} Ω

Summary: For a ${length}m run of ${cableSize}/${cpcSize}mm² ${material} cable, the total resistance is ${calculation.totalR.toFixed(3)}Ω.
-------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(`${text}\n\n${formatSourceNotes(sourceIds, ['Both conductors use the selected material; recorded resistance at assumed 20 deg C; no armour model.'])}`);
  };

  const handleSaveHistory = async () => {
    if (isSavingHistory || !calculation.isValid) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser?.uid,
        'cable_resistance',
        `Resistance: ${cableSize}/${cpcSize}mm² ${length}m`,
        { cableSize, cpcSize, length, material, cpcModel: material === 'copper' ? cpcModel : 'manual' },
        { r1: calculation.r1, r2: calculation.r2, totalR: calculation.totalR }
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    if (!calculation.isValid) return;

    const payload = {
      type: 'cable_resistance' as const,
      title: `Resistance: ${cableSize}/${cpcSize}mm² ${length}m`,
      inputs: { cableSize, cpcSize, length, material, cpcModel: material === 'copper' ? cpcModel : 'manual' },
      results: { r1: calculation.r1, r2: calculation.r2, totalR: calculation.totalR }
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving cable resistance history:', error);
    });
  }, [calculation, cableSize, cpcSize, length, material, cpcModel]);

  return (
    <div className="space-y-6">
      <SourceNotes ids={sourceIds} />
      {!calculation.isValid && length && <p role="alert" className="text-xs text-red-400">Select recorded sizes for both {material} conductors and a positive length. No copper-to-aluminium scaling or missing-row substitution is applied.</p>}
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Material</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMaterial('copper')}
                className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                  material === 'copper' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                }`}
              >
                Copper
              </button>
              <button
                onClick={() => setMaterial('aluminium')}
                className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                  material === 'aluminium' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                }`}
              >
                Aluminium
              </button>
            </div>
          </div>

          {material === 'copper' && <InspectionCpcControl value={cpcModel} onChange={setCpcModel} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Line Size (mm²)</label>
              <select 
                value={cableSize}
                onChange={(e) => setCableSize(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {!cableSizes.includes(Number(cableSize)) && <option value={cableSize} disabled>{cableSize} mm2 - no recorded row</option>}
                {cableSizes.map(size => (
                  <option key={size} value={size}>{size}mm²</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">CPC Size (mm²)</label>
              <select 
                value={cpcSize}
                disabled={material === 'copper' && cpcModel !== 'manual'}
                onChange={(e) => setCpcSize(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {!cableSizes.includes(Number(cpcSize)) && <option value={cpcSize} disabled>{cpcSize || 'Unsupported pairing'} - no recorded row</option>}
                {cableSizes.map(size => (
                  <option key={size} value={size}>{size}mm²</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Length (m)</label>
            <div className="flex items-center gap-4 bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 focus-within:border-emerald-500/50 transition-colors">
              <Ruler size={20} className="text-gray-500" />
              <input 
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="Enter length"
                className="w-full bg-transparent text-white font-mono font-bold outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <RecalculateButton inputKey={JSON.stringify([cableSize,cpcSize,length,material,cpcModel])} message={calculation.isValid ? `Recalculated R1+R2: ${calculation.totalR.toFixed(3)} ohm. Resistance only; no fault-protection assessment.` : 'No result: select recorded conductor sizes and a positive length.'} />
      {length && calculation.isValid && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
            <div className="flex items-center gap-2 mb-6">
              <Activity size={18} className="text-emerald-500" />
              <h3 className="font-bold text-white uppercase tracking-wider text-sm">Resistance Results</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-6">
              <div className="flex justify-between items-center p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">R1 (Line)</span>
                <span className="text-lg font-mono font-bold text-white">{calculation.r1.toFixed(3)} Ω</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">R2 (CPC)</span>
                <span className="text-lg font-mono font-bold text-white">{calculation.r2.toFixed(3)} Ω</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Total R1+R2</span>
                <span className="text-xl font-mono font-bold text-emerald-500">{calculation.totalR.toFixed(3)} Ω</span>
              </div>
            </div>

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
      )}
    </div>
  );
}
