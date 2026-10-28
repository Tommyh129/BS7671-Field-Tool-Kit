import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Ruler, Share2, Activity, AlertTriangle, CheckCircle2, History as HistoryIcon, Check } from 'lucide-react';
import { DeviceType, CableType, InstallationMethod, SupplyType, CircuitType } from '../types';
import { calculateCircuit, CircuitOptions } from '../utils/calculations';
import { calculateMaxLength } from '../utils/maxLength';
import CableDesignControls from './CableDesignControls';
import RecalculateButton from './RecalculateButton';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';
import { getDeviceRatings, getSourceIdsForTool, formatSourceNotes, getCableRows, getInstallationIssue, INSTALLATION_ENTRIES } from '../data/electrical';
import SourceNotes from './SourceNotes';

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
  const sourceIds = getSourceIdsForTool('MAX_LENGTH', cableType);

  const [method, setMethod] = useState(InstallationMethod.METHOD_C);
  const [supply, setSupply] = useState(SupplyType.SINGLE_PHASE);
  const [options, setOptions] = useState<CircuitOptions>({ operatingTemperature:70, cpcArrangement:'separate', autoSizeSeparateCpc:true });
  useEffect(() => { if (getInstallationIssue(cableType,method)) setMethod(InstallationMethod.METHOD_C); },[cableType,method]);
  const rows = getCableRows(cableType,method,supply,options.operatingTemperature);
  const calculation = useMemo(() => calculateMaxLength(
    cableType, Number(cableSize), method, supply, deviceType, rating,
    ze.trim() === '' ? NaN : Number(ze), Number(loadAmps), Number(allowedVD),
    enteredLength.trim() === '' ? undefined : Number(enteredLength), options
  ),[cableType,cableSize,method,supply,deviceType,rating,ze,loadAmps,allowedVD,enteredLength,options]);
  const inputs = { deviceType,rating,cableType,cableSize,ze,allowedVD,loadAmps,enteredLength,method,supply,...options };
  const recalculate = () => {
    if (ze.trim() === '') return;
    const current = Number(loadAmps);
    const kw = current * (supply === SupplyType.SINGLE_PHASE ? 230 : Math.sqrt(3)*400*.9)/1000;
    const design = calculateCircuit(kw,enteredLength.trim() === '' ? 1 : Number(enteredLength),supply,method,cableType,
      allowedVD === '3' ? CircuitType.LIGHTING : CircuitType.OTHER,30,1,Number(ze),deviceType,rating,options);
    if (design?.isCompliant) setCableSize(String(design.cableSize));
  };

  const handleShare = () => {
    if (calculation.error) return;
    const text = `
📏 MAX CABLE LENGTH CALCULATION 📏
-------------------------
Device: ${deviceType} ${rating}A
Cable Type: ${cableType}
Cable Size: ${cableSize}mm²
CPC: ${calculation.cpcSize}mm2 (${calculation.cpcArrangement})
Method: ${INSTALLATION_ENTRIES.find(entry => entry.id === method)?.label}
Supply: ${supply}
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
Calculated via The Sparkys Mate
    `.trim();
    onShare(`${text}\n\n${formatSourceNotes(sourceIds, calculation.assumptions)}`);
  };

  const handleSaveHistory = async () => {
    if (isSavingHistory || calculation.error) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser?.uid,
        'max_length',
        `Max Length: ${deviceType} ${rating}A / ${cableType} ${cableSize}mm²`,
        inputs,
        calculation
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    if (calculation.error || !Number.isFinite(calculation.maxLen) || calculation.maxLen <= 0) return;

    const payload = {
      type: 'max_length' as const,
      title: `Max Length: ${deviceType} ${rating}A / ${cableType} ${cableSize}mm²`,
      inputs,
      results: calculation
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving max length history:', error);
    });
  }, [calculation, deviceType, rating, cableType, cableSize, ze, allowedVD, loadAmps, enteredLength, method, supply, options]);

  return (
    <div className="space-y-6">
      <SourceNotes ids={sourceIds} />
      {calculation.error && <p role="alert" className="text-xs text-red-400">{calculation.error}</p>}
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
                {!getDeviceRatings(deviceType).includes(rating) && <option value={rating} disabled>{rating} A - no recorded limit</option>}
                {getDeviceRatings(deviceType).map(r => (
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
                {!rows.some(c => c.size === Number(cableSize)) && <option value={cableSize} disabled>{cableSize} mm2 - no recorded row</option>}
                {rows.map(c => (
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

          <label className="block text-xs text-gray-500">Supply Phase
            <select aria-label="Supply Phase" value={supply} onChange={e => setSupply(e.target.value as SupplyType)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-2xl p-4 text-white">
              {Object.values(SupplyType).map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-500">Installation Method
            <select aria-label="Installation Method" value={method} onChange={e => setMethod(e.target.value as InstallationMethod)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-2xl p-4 text-white">
              {INSTALLATION_ENTRIES.filter(entry => !getInstallationIssue(cableType,entry.id)).map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <CableDesignControls cable={cableType} value={options} onChange={setOptions} />
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

      <RecalculateButton inputKey={JSON.stringify(inputs)} onRecalculate={recalculate} message={calculation.error ?? (calculation.isCompliant ? `Recalculated: ${cableSize}mm2 line / ${calculation.cpcSize}mm2 CPC; maximum ${calculation.maxLen.toFixed(1)}m.` : `No passing design: ${calculation.limitingFactor}.`)} />
      {!calculation.error && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <SourceNotes ids={sourceIds} assumptions={calculation.assumptions} />
        <p className="text-xs text-gray-400">{cableSize}mm2 line / {calculation.cpcSize}mm2 copper CPC; {calculation.cpcArrangement}; armour not counted.</p>
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
                  The selected circuit fails the recorded {calculation.limitingFactor} check. Review the entered length, conductor, CPC and device rating.
                </p>
              </div>
            </div>
          )}

          {/* Zs & Temperature Correction Info */}
          <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 mb-6 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-hardware-border/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <h4 className="text-[10px] font-extrabold uppercase text-gray-300 tracking-wider">Zs Temperature Correction & 80% Rule</h4>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed font-sans font-medium">
              This design estimate applies a <span className="text-emerald-500 font-bold">{cableType === CableType.XLPE_SWA && options.operatingTemperature === 90 ? '1.28' : '1.2'} multiplier</span> to circuit conductor resistance only, leaving Ze unchanged. This is an approximate temperature allowance, not a complete loop-impedance or fault-withstand assessment.
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed bg-black/20 p-2 rounded-xl border border-hardware-border/20 font-sans">
              * Field testing uses a separate <span className="text-white font-bold">80% design-limit comparison</span> as a quick check. It is not equivalent to the 1.2 resistance estimate. Refer to the source notes and installation-specific detailed calculation.
            </p>
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
      </motion.div>}
    </div>
  );
}
