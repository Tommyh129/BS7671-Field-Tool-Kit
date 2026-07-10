import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Zap, Ruler, Settings2, CheckCircle2, AlertTriangle, Share2, History as HistoryIcon, Check, ArrowRightLeft } from 'lucide-react';
import { SupplyType, InstallationMethod, SupplySystem, DeviceType, CircuitType, CableType } from '../types';
import { calculateCircuit, suggestDeviceType } from '../utils/calculations';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';
import { DEVICE_LIMITS } from '../constants';

interface SmartCircuitDesignerProps {
  onShare: (text: string) => void;
}

export default function SmartCircuitDesigner({ onShare }: SmartCircuitDesignerProps) {
  const [loadValue, setLoadValue] = useState<string>('');
  const [loadUnit, setLoadUnit] = useState<'kW' | 'Amps'>('kW');
  const [length, setLength] = useState<string>('');
  const [method, setMethod] = useState<InstallationMethod>(InstallationMethod.METHOD_C);
  const [cableType, setCableType] = useState<CableType>(CableType.PVC_PVC);
  const [supplyType, setSupplyType] = useState<SupplyType>(SupplyType.SINGLE_PHASE);
  const [deviceTypeOverride, setDeviceTypeOverride] = useState<DeviceType | null>(null);
  const [circuitType, setCircuitType] = useState<CircuitType>(CircuitType.OTHER);
  const [supplySystem, setSupplySystem] = useState<SupplySystem>(SupplySystem.TN_C_S);
  const [zeValue, setZeValue] = useState<string>('0.35');
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const lastSavedHistoryRef = React.useRef<string | null>(null);

  const [protectiveDeviceRatingOverride, setProtectiveDeviceRatingOverride] = useState<number | null>(null);

  const suggestedDeviceType = useMemo(() => {
    const load = parseFloat(loadValue) || 0;
    const ze = parseFloat(zeValue) || 0;
    let loadCurrent = load;
    if (loadUnit === 'kW') {
      if (supplyType === SupplyType.SINGLE_PHASE) {
        loadCurrent = (load * 1000) / 230;
      } else {
        loadCurrent = (load * 1000) / (1.732 * 400 * 0.9);
      }
    }
    return suggestDeviceType(loadCurrent, supplyType, circuitType, ze);
  }, [loadValue, loadUnit, supplyType, circuitType, zeValue]);

  const activeDeviceType = deviceTypeOverride || suggestedDeviceType;

  const availableRatings = useMemo(() => {
    return Object.keys(DEVICE_LIMITS[activeDeviceType]).map(Number).sort((a, b) => a - b);
  }, [activeDeviceType]);

  const zeMap: Record<SupplySystem, number> = {
    [SupplySystem.TN_C_S]: 0.35,
    [SupplySystem.TN_S]: 0.8,
    [SupplySystem.TT]: 21,
  };

  const handleSupplySystemChange = (s: SupplySystem) => {
    setSupplySystem(s);
    setZeValue(zeMap[s].toString());
  };

  useEffect(() => {
    setProtectiveDeviceRatingOverride(null);
  }, [loadValue, loadUnit, supplyType, activeDeviceType]);

  useEffect(() => {
    setDeviceTypeOverride(null);
  }, [loadValue, loadUnit, supplyType, circuitType, zeValue]);

  const result = useMemo(() => {
    const load = parseFloat(loadValue) || 0;
    const len = parseFloat(length) || 0;
    const ze = parseFloat(zeValue) || 0;
    if (load <= 0 || len <= 0) return null;

    let loadKw = load;
    if (loadUnit === 'Amps') {
      if (supplyType === SupplyType.SINGLE_PHASE) {
        loadKw = (load * 230) / 1000;
      } else {
        // Three phase: P = I * V * sqrt(3) * PF
        loadKw = (load * 400 * 1.732 * 0.9) / 1000;
      }
    }

    return calculateCircuit(
      loadKw,
      len,
      supplyType,
      method,
      cableType,
      circuitType,
      30, // Ambient temp
      1,  // Grouping
      ze,
      activeDeviceType,
      protectiveDeviceRatingOverride || undefined
    );
  }, [loadValue, loadUnit, length, method, cableType, zeValue, supplyType, activeDeviceType, circuitType, protectiveDeviceRatingOverride]);

  const handleShare = () => {
    if (!result) return;
    const text = `
⚡ CIRCUIT DESIGN RESULT ⚡
-------------------------
Purpose: BS 7671 Compliant Design
Load: ${loadValue}${loadUnit}
Length: ${length}m
Method: ${method}
Cable: ${cableType}
Supply: ${supplySystem} (Ze: ${zeValue}Ω)

RESULTS:
- Cable Size: ${result.cableSize}mm²${result.cpcSize ? ` (Line) / ${result.cpcSize}mm² (CPC)` : ''}
- Protective Device: ${result.protectiveDevice}A (${activeDeviceType})
- Voltage Drop: ${result.voltageDropPercentage.toFixed(2)}% (${result.isCompliant ? 'PASS' : 'FAIL'})
- Zs: ${result.zs?.toFixed(2)}Ω (${result.zsCompliant ? 'PASS' : 'FAIL'})

OVERALL COMPLIANCE: ${result.isCompliant ? 'PASS' : 'FAIL'}
-------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(text);
  };

  const handleSaveHistory = async () => {
    if (!result || isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser?.uid,
        'circuit',
        `Design: ${result.cableSize}mm² / ${result.protectiveDevice}A`,
        { loadValue, loadUnit, length, method, cableType, supplySystem, zeValue, deviceTypeOverride, protectiveDeviceRatingOverride },
        result
      );
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  useEffect(() => {
    if (!result) return;

    const payload = {
      type: 'circuit' as const,
      title: `Design: ${result.cableSize}mm² / ${result.protectiveDevice}A`,
      inputs: { loadValue, loadUnit, length, method, cableType, supplySystem, zeValue, deviceTypeOverride, protectiveDeviceRatingOverride },
      results: result
    };
    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving smart circuit history:', error);
    });
  }, [result, loadValue, loadUnit, length, method, cableType, supplySystem, zeValue, deviceTypeOverride, protectiveDeviceRatingOverride]);

  return (
    <div className="space-y-6">
      {/* Purpose Header */}
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <h3 className="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-2">Purpose</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Automatically design a compliant electrical circuit based on minimal user input using UK BS 7671 principles.
        </p>
      </div>

      {/* Input Section */}
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Load</label>
            <div className="flex items-center gap-2 bg-black/40 border border-hardware-border rounded-2xl px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
              <input 
                type="number"
                value={loadValue}
                onChange={(e) => setLoadValue(e.target.value)}
                placeholder="0.0"
                className="w-full bg-transparent text-white font-mono font-bold outline-none text-lg"
              />
              <button 
                onClick={() => setLoadUnit(loadUnit === 'kW' ? 'Amps' : 'kW')}
                className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                {loadUnit}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Length (m)</label>
            <div className="flex items-center gap-2 bg-black/40 border border-hardware-border rounded-2xl px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
              <Ruler size={16} className="text-blue-500" />
              <input 
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-white font-mono font-bold outline-none text-lg"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply Phase</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(SupplyType).map((t) => (
                <button
                  key={t}
                  onClick={() => setSupplyType(t)}
                  className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                    supplyType === t ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Circuit Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(CircuitType).map((t) => (
                <button
                  key={t}
                  onClick={() => setCircuitType(t)}
                  className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                    circuitType === t ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Type</label>
            <select 
              value={cableType}
              onChange={(e) => setCableType(e.target.value as CableType)}
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none text-sm"
            >
              {Object.values(CableType).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Installation Method</label>
            <div className="grid gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {Object.values(InstallationMethod).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`w-full min-w-0 py-4 px-4 rounded-2xl text-xs font-bold text-left transition-all border flex items-start justify-between gap-3 ${
                    method === m
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                      : 'bg-black/40 text-gray-400 border-hardware-border hover:border-white/20'
                  }`}
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{m}</span>
                  {method === m && <CheckCircle2 size={16} className="shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply System</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(SupplySystem).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSupplySystemChange(s)}
                  className={`py-3 rounded-2xl text-[10px] font-bold transition-all border ${
                    supplySystem === s ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black/40 text-gray-400 border-hardware-border'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Protection Device</label>
              {deviceTypeOverride !== null && (
                <button
                  onClick={() => setDeviceTypeOverride(null)}
                  className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 transition-colors"
                >
                  Reset to Auto
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
              {Object.values(DeviceType).map((t) => (
                <button
                  key={t}
                  onClick={() => setDeviceTypeOverride(t)}
                  className={`py-3 px-2 rounded-2xl text-[9px] font-bold transition-all border leading-tight flex flex-col items-center justify-center relative overflow-hidden ${
                    activeDeviceType === t ? 'bg-emerald-500 text-black border-emerald-400 font-extrabold' : 'bg-black/40 text-gray-400 border-hardware-border'
                  }`}
                >
                  <span>{t.replace('60898 ', '').replace('BS ', '')}</span>
                  {suggestedDeviceType === t && (
                    <span className={`text-[7px] block uppercase font-bold tracking-tight mt-0.5 ${activeDeviceType === t ? 'text-black/75' : 'text-emerald-500/80'}`}>
                      (Suggested)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Max Ze Value (Ω)</label>
            <div className="flex items-center gap-2 bg-black/40 border border-hardware-border rounded-2xl px-4 py-3 focus-within:border-emerald-500/50 transition-colors">
              <Zap size={16} className="text-orange-500" />
              <input 
                type="number"
                step="0.01"
                value={zeValue}
                onChange={(e) => setZeValue(e.target.value)}
                placeholder="0.35"
                className="w-full bg-transparent text-white font-mono font-bold outline-none text-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Result Section */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`p-6 rounded-3xl border ${result.isCompliant ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-white uppercase tracking-wider text-sm">Circuit Design Result</h3>
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${result.isCompliant ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-red-500 text-white shadow-lg shadow-red-500/20'}`}>
                {result.isCompliant ? 'PASS' : 'FAIL'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Cable Size</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-mono font-bold text-emerald-500">{result.cableSize}mm²</p>
                  {result.cpcSize && (
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Line</span>
                  )}
                </div>
                {result.cpcSize && (
                  <div className="mt-2 pt-2 border-t border-hardware-border/30">
                    <div className="flex items-baseline gap-2">
                      <p className="text-xl font-mono font-bold text-emerald-500/80">{result.cpcSize}mm²</p>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">CPC</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Protective Device</p>
                <p className="text-2xl font-mono font-bold text-white">{result.protectiveDevice}A</p>
                <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest mt-1">
                  {activeDeviceType} {deviceTypeOverride === null ? '(Suggested)' : '(Manual)'}
                </p>
              </div>
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Voltage Drop</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-mono font-bold text-white">{result.voltageDropPercentage.toFixed(2)}%</p>
                  <span className={`text-[8px] font-black uppercase ${result.voltageDropPercentage <= result.limitPercentage ? 'text-emerald-500' : 'text-red-500'}`}>
                    {result.voltageDropPercentage <= result.limitPercentage ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Zs Value</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-mono font-bold text-white">{result.zs?.toFixed(2)}Ω</p>
                  <span className={`text-[8px] font-black uppercase ${result.zsCompliant ? 'text-emerald-500' : 'text-red-500'}`}>
                    {result.zsCompliant ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              </div>
            </div>

            {/* Protective Device Override Control */}
            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hardware-border/30">
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adjust Protective Device Rating</h4>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Suggested: <span className="font-mono font-bold text-emerald-500">{result.suggestedProtectiveDevice}A</span> based on load.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={result.protectiveDevice}
                      onChange={(e) => setProtectiveDeviceRatingOverride(parseInt(e.target.value))}
                      className="bg-black/60 border border-hardware-border rounded-xl pl-3 pr-8 py-2 text-white font-mono font-bold text-xs outline-none focus:border-emerald-500/50 appearance-none cursor-pointer animate-none"
                    >
                      {availableRatings.map((rating) => (
                        <option key={rating} value={rating} className="bg-hardware-card text-white">
                          {rating}A {rating === result.suggestedProtectiveDevice ? '(Suggested)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                  {protectiveDeviceRatingOverride !== null && (
                    <button
                      onClick={() => setProtectiveDeviceRatingOverride(null)}
                      className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2.5 py-2 rounded-xl border border-emerald-500/20 transition-colors"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adjust Device Type</h4>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Suggested: <span className="font-sans font-bold text-emerald-500">{suggestedDeviceType.replace('60898 ', '').replace('BS ', '')}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={activeDeviceType}
                      onChange={(e) => setDeviceTypeOverride(e.target.value as DeviceType)}
                      className="bg-black/60 border border-hardware-border rounded-xl pl-3 pr-8 py-2 text-white font-mono font-bold text-xs outline-none focus:border-emerald-500/50 appearance-none cursor-pointer animate-none"
                    >
                      {Object.values(DeviceType).map((type) => (
                        <option key={type} value={type} className="bg-hardware-card text-white">
                          {type.replace('60898 ', '').replace('BS ', '')} {type === suggestedDeviceType ? '(Suggested)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                  {deviceTypeOverride !== null && (
                    <button
                      onClick={() => setDeviceTypeOverride(null)}
                      className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2.5 py-2 rounded-xl border border-emerald-500/20 transition-colors"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 mb-4">
              <div className="flex gap-3">
                {result.isCompliant ? (
                  <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
                ) : (
                  <AlertTriangle className="text-red-500 shrink-0" size={18} />
                )}
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {result.isCompliant 
                      ? "The circuit design is fully compliant with BS 7671. The selected cable size and protective device ensure safe operation and disconnection within required limits."
                      : `The circuit design fails to meet BS 7671 requirements. ${!result.zsCompliant ? 'Earth Loop Impedance (Zs) exceeds the limit for this device. ' : ''}${result.voltageDropPercentage > result.limitPercentage ? 'Voltage drop exceeds the allowed limit. ' : ''}Consider a larger cable, a different protection device, or reducing the circuit length.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Zs & Temperature Correction Info */}
            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 mb-6 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-hardware-border/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <h4 className="text-[10px] font-extrabold uppercase text-gray-300 tracking-wider">Zs Temperature Correction & 80% Rule</h4>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                Earth fault loop impedance (<span className="text-white font-mono">Zs</span>) calculations are automatically corrected using a <span className="text-emerald-500 font-bold">1.2 multiplier</span> to account for conductor temperature rise from 20°C (ambient testing) to 70°C (safe operating limit under load).
              </p>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest">Tabulated Max Zs (100% Limit)</p>
                  <p className="text-sm font-mono font-bold text-white">{(result.maxZs).toFixed(2)} Ω</p>
                </div>
                <div>
                  <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest">On-Site Limit (80% Rule of Thumb)</p>
                  <p className="text-sm font-mono font-bold text-emerald-400">{(result.maxZs * 0.8).toFixed(2)} Ω</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed bg-black/20 p-2 rounded-xl border border-hardware-border/20 font-sans">
                * Note: Under unloaded/cold test conditions, actual measured on-site Zs must be compared against the <span className="text-white font-bold">80% limit</span> to ensure compliance when heated under full load.
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
