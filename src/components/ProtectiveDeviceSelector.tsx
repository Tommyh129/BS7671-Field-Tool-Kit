import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Share2,
  ChevronDown,
  Activity,
  Download,
  FileText,
  Copy,
  Check,
  X,
  Cpu,
  History as HistoryIcon,
  ArrowRightLeft
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from '../utils/download';
import { SupplyType, DeviceType } from '../types';
import { DEVICE_LIMITS } from '../constants';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface ProtectiveDeviceSelectorProps {
  onShare: (text: string) => void;
}

enum InputMode {
  DIRECT_AMPS = 'DIRECT_AMPS',
  POWER_KW = 'POWER_KW'
}

enum SelectorCircuitType {
  DOMESTIC_LIGHTING_SOCKETS = 'Domestic Lighting & Sockets',
  COMMERCIAL_LED_LIGHTING = 'Commercial LED Lighting (High Inrush)',
  MOTORS_INDUCTIVE = 'Motors & Highly Inductive Loads',
  HEATING_RESISTIVE = 'Heating & Purely Resistive Loads',
  DISTRIBUTION_SUBMAIN = 'Distribution / Sub-mains'
}

export default function ProtectiveDeviceSelector({ onShare }: ProtectiveDeviceSelectorProps) {
  const [inputMode, setInputMode] = useState<InputMode>(InputMode.DIRECT_AMPS);
  const [loadAmps, setLoadAmps] = useState<string>('16');
  const [loadKw, setLoadKw] = useState<string>('3.5');
  const [supplyType, setSupplyType] = useState<SupplyType>(SupplyType.SINGLE_PHASE);
  const [powerFactor, setPowerFactor] = useState<string>('0.9');
  const [circuitType, setCircuitType] = useState<SelectorCircuitType>(SelectorCircuitType.DOMESTIC_LIGHTING_SOCKETS);

  const [deviceTypeOverride, setDeviceTypeOverride] = useState<DeviceType | null>(null);
  const [ratingOverride, setRatingOverride] = useState<number | null>(null);

  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const shareRef = React.useRef<HTMLDivElement>(null);
  const pdfRef = React.useRef<HTMLDivElement>(null);

  // 1. Calculate Design Current (Ib)
  const designCurrent = useMemo(() => {
    if (inputMode === InputMode.DIRECT_AMPS) {
      return parseFloat(loadAmps) || 0;
    } else {
      const kwVal = parseFloat(loadKw) || 0;
      const pfVal = parseFloat(powerFactor) || 0.9;
      if (kwVal <= 0) return 0;

      if (supplyType === SupplyType.SINGLE_PHASE) {
        // Ib = P / (V * PF)
        return (kwVal * 1000) / (230 * pfVal);
      } else {
        // Ib = P / (sqrt(3) * V * PF)
        return (kwVal * 1000) / (1.732 * 400 * pfVal);
      }
    }
  }, [inputMode, loadAmps, loadKw, supplyType, powerFactor]);

  // 2. Suggest Device Type based on Circuit Type & Supply Phase
  const suggestedDeviceType = useMemo(() => {
    switch (circuitType) {
      case SelectorCircuitType.DOMESTIC_LIGHTING_SOCKETS:
        return DeviceType.MCB_B;
      case SelectorCircuitType.COMMERCIAL_LED_LIGHTING:
        return DeviceType.MCB_C;
      case SelectorCircuitType.MOTORS_INDUCTIVE:
        // Three phase motor circuits often prefer C or D
        return supplyType === SupplyType.THREE_PHASE ? DeviceType.MCB_D : DeviceType.MCB_C;
      case SelectorCircuitType.HEATING_RESISTIVE:
        return DeviceType.MCB_B;
      case SelectorCircuitType.DISTRIBUTION_SUBMAIN:
        return DeviceType.BS88_2;
      default:
        return DeviceType.MCB_B;
    }
  }, [circuitType, supplyType]);

  const activeDeviceType = deviceTypeOverride || suggestedDeviceType;

  // 3. Get available ratings for current device type
  const availableRatings = useMemo(() => {
    return Object.keys(DEVICE_LIMITS[activeDeviceType]).map(Number).sort((a, b) => a - b);
  }, [activeDeviceType]);

  // 4. Suggest standard rating (In) >= design current (Ib)
  const suggestedRating = useMemo(() => {
    const minRating = availableRatings.find((r) => r >= designCurrent) || availableRatings[availableRatings.length - 1];
    return minRating || 32;
  }, [availableRatings, designCurrent]);

  const activeRating = ratingOverride !== null && availableRatings.includes(ratingOverride)
    ? ratingOverride
    : suggestedRating;

  // Auto reset rating override if active device type changes or suggested rating shifts
  useEffect(() => {
    setRatingOverride(null);
  }, [activeDeviceType]);

  // Calculate results
  const maxZs100 = useMemo(() => {
    return DEVICE_LIMITS[activeDeviceType][activeRating] || 0;
  }, [activeDeviceType, activeRating]);

  const maxZs80 = useMemo(() => {
    return maxZs100 * 0.8;
  }, [maxZs100]);

  // Get disconnection times and characteristics
  const deviceInfo = useMemo(() => {
    const isMcb = activeDeviceType.startsWith('60898');
    const isTypeB = activeDeviceType.includes('Type B');
    const isTypeC = activeDeviceType.includes('Type C');
    const isTypeD = activeDeviceType.includes('Type D');

    let multiplier = '';
    let disconnectionTime = '0.4 seconds';
    let applicationText = '';

    if (isMcb) {
      if (isTypeB) {
        multiplier = '3x to 5x In';
        disconnectionTime = activeRating <= 32 ? '0.4 seconds (final circuit)' : '5 seconds';
        applicationText = 'Highly standard for domestic lighting & socket outlets. Low surge current profile.';
      } else if (isTypeC) {
        multiplier = '5x to 10x In';
        disconnectionTime = activeRating <= 32 ? '0.4 seconds (final circuit)' : '5 seconds';
        applicationText = 'Recommended for commercial lighting, LED banks, and light commercial motors where brief surges occur.';
      } else if (isTypeD) {
        multiplier = '10x to 20x In';
        disconnectionTime = activeRating <= 32 ? '0.4 seconds (final circuit)' : '5 seconds';
        applicationText = 'Designed for highly inductive industrial machinery, transformers, large motors, and welders.';
      }
    } else {
      multiplier = 'Thermal & Magnetic elements';
      disconnectionTime = activeDeviceType.includes('5s') ? '5.0 seconds' : '0.4 seconds';
      applicationText = 'Standard BS 88 HRC (High Rupturing Capacity) industrial cartridge fuse. Ideal for distribution boards or sub-mains.';
    }

    return {
      multiplier,
      disconnectionTime,
      applicationText
    };
  }, [activeDeviceType, activeRating]);

  // Save history automatically
  useEffect(() => {
    if (designCurrent <= 0) return;

    const payload = {
      type: 'protective_device_selector' as const,
      title: `Protection Selector: ${activeRating}A (${activeDeviceType.replace('60898 ', '')})`,
      inputs: { inputMode, loadAmps, loadKw, supplyType, powerFactor, circuitType, deviceTypeOverride, ratingOverride },
      results: { designCurrent, activeRating, activeDeviceType, maxZs100, maxZs80, deviceInfo }
    };

    saveCalculation(auth.currentUser?.uid, payload.type, payload.title, payload.inputs, payload.results).catch(error => {
      console.error('Error auto-saving protection selector history:', error);
    });
  }, [designCurrent, activeRating, activeDeviceType, maxZs100, maxZs80, inputMode, loadAmps, loadKw, supplyType, powerFactor, circuitType, deviceTypeOverride, ratingOverride, deviceInfo]);

  const handleShare = () => {
    const text = `
⚡ PROTECTIVE DEVICE SELECTION REPORT ⚡
-----------------------------------------
Circuit Type: ${circuitType}
Load Profile: ${inputMode === InputMode.DIRECT_AMPS ? `${loadAmps} A` : `${loadKw} kW (${supplyType})`}
Design Current (Ib): ${designCurrent.toFixed(2)} A

Suggested Device: ${suggestedRating}A (${suggestedDeviceType.replace('60898 ', '')})
Selected Device: ${activeRating}A (${activeDeviceType.replace('60898 ', '')}) ${deviceTypeOverride === null && ratingOverride === null ? '(Suggested)' : '(Override)'}

Max Permitted Loop Impedance (Zs):
- Tabulated (100%): ${maxZs100.toFixed(2)} Ω
- On-Site Limit (80%): ${maxZs80.toFixed(2)} Ω

Disconnection Time Limit: ${deviceInfo.disconnectionTime}
Magnetic Operating Range: ${deviceInfo.multiplier}

Application: ${deviceInfo.applicationText}
-----------------------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(text);
  };

  const handleDownloadImage = async () => {
    if (!shareRef.current || isSavingImage) return;
    setIsSavingImage(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#0a0a0a',
      });
      await downloadFile(dataUrl, `bs7671-device-select-${Date.now()}.png`, 'image/png');
      setTimeout(() => setIsSavingImage(false), 2000);
    } catch (err) {
      console.error('Error generating image:', err);
      setIsSavingImage(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!pdfRef.current || isSavingPDF) return;
    setIsSavingPDF(true);
    try {
      const dataUrl = await toPng(pdfRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [400, 600]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, 400, 600);
      const pdfDataUrl = pdf.output('datauristring');

      await downloadFile(pdfDataUrl, `bs7671-device-select-report-${Date.now()}.pdf`, 'application/pdf');
      setTimeout(() => setIsSavingPDF(false), 2000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setIsSavingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6">

        {/* Toggle Input Mode */}
        <div className="flex bg-black/40 p-1 rounded-2xl border border-hardware-border">
          <button
            onClick={() => setInputMode(InputMode.DIRECT_AMPS)}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              inputMode === InputMode.DIRECT_AMPS ? 'bg-emerald-500 text-black shadow-lg font-black' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Direct Current (Amps)
          </button>
          <button
            onClick={() => setInputMode(InputMode.POWER_KW)}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              inputMode === InputMode.POWER_KW ? 'bg-emerald-500 text-black shadow-lg font-black' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            From Power (kW)
          </button>
        </div>

        {/* Dynamic Inputs block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {inputMode === InputMode.DIRECT_AMPS ? (
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Design Current (Ib) Amps</label>
              <input
                type="number"
                inputMode="decimal"
                value={loadAmps}
                onChange={(e) => setLoadAmps(e.target.value)}
                placeholder="16"
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Active Power (kW)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={loadKw}
                  onChange={(e) => setLoadKw(e.target.value)}
                  placeholder="3.5"
                  className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply Voltage</label>
                <div className="relative">
                  <select
                    value={supplyType}
                    onChange={(e) => setSupplyType(e.target.value as SupplyType)}
                    className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
                  >
                    {Object.values(SupplyType).map(v => (
                      <option key={v} value={v} className="bg-hardware-card text-white">{v}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Power Factor (cos φ)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={powerFactor}
                  onChange={(e) => setPowerFactor(e.target.value)}
                  placeholder="0.9"
                  step="0.05"
                  min="0.1"
                  max="1"
                  className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Circuit / Load Category</label>
            <div className="relative">
              <select
                value={circuitType}
                onChange={(e) => setCircuitType(e.target.value as SelectorCircuitType)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.values(SelectorCircuitType).map(v => (
                  <option key={v} value={v} className="bg-hardware-card text-white">{v}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

        </div>

        {/* Suggestion Summary Banner */}
        {designCurrent > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                <Cpu size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Auto Recommendation</p>
                <p className="text-sm font-mono font-bold text-white mt-0.5">
                  Suggested Rating: <span className="text-emerald-400">{suggestedRating}A</span> • Type: <span className="text-emerald-400">{suggestedDeviceType.replace('60898 ', '')}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Computed Design Current</p>
              <p className="text-lg font-mono font-bold text-white">{designCurrent.toFixed(2)} Amps</p>
            </div>
          </div>
        )}

        {/* Protection Device Selector */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Select / Override Device Type</label>
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

        {/* Rating selector & Manual override */}
        <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hardware-border/30">
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adjust Device Rating</h4>
              <p className="text-[10px] text-gray-500 mt-1">
                Suggested Rating: <span className="font-mono font-bold text-emerald-500">{suggestedRating}A</span> (Based on {designCurrent.toFixed(1)}A load)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={activeRating}
                  onChange={(e) => setRatingOverride(parseInt(e.target.value))}
                  className="bg-black/60 border border-hardware-border rounded-xl pl-3 pr-8 py-2 text-white font-mono font-bold text-xs outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
                >
                  {availableRatings.map((rating) => (
                    <option key={rating} value={rating} className="bg-hardware-card text-white">
                      {rating}A {rating === suggestedRating ? '(Suggested)' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
              {ratingOverride !== null && (
                <button
                  onClick={() => setRatingOverride(null)}
                  className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2.5 py-2 rounded-xl border border-emerald-500/20 transition-colors"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Results details panel */}
      {designCurrent > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Main Results Card for Sharing/Saving */}
          <div ref={shareRef} className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-mono text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Protection Details</h3>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{activeRating}A {activeDeviceType.replace('60898 ', '').replace('BS ', '')}</span>
                  {deviceTypeOverride === null && ratingOverride === null ? (
                    <span className="text-[8px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">Auto Recommended</span>
                  ) : (
                    <span className="text-[8px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">Manual Selection</span>
                  )}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="p-2.5 bg-black/40 hover:bg-black/60 rounded-xl border border-hardware-border transition-colors text-gray-400 hover:text-white"
                  title="Share Results"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {/* Zs limits grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Tabulated Max Zs (100% Limit)</p>
                <p className="text-2xl font-mono font-bold text-white">{maxZs100.toFixed(2)} Ω</p>
                <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-2 bg-black/20 px-1.5 py-0.5 rounded border border-hardware-border/30 inline-block text-center">BS 7671 Table Limit (Hot Conductor 70°C)</p>
              </div>
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest mb-1">On-Site Limit (80% Rule of Thumb)</p>
                <p className="text-2xl font-mono font-bold text-emerald-400">{maxZs80.toFixed(2)} Ω</p>
                <p className="text-[8px] text-emerald-500/70 font-bold uppercase tracking-widest mt-2 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 inline-block text-center">Rule of Thumb Limit (Cold Conductor 20°C)</p>
              </div>
            </div>

            {/* Zs Principles Info Box */}
            <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50 space-y-3">
              <h4 className="text-[9px] font-extrabold uppercase text-gray-400 tracking-wider">Zs Temperature Correction Principles:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] text-gray-500 leading-relaxed">
                <div className="space-y-1 bg-black/20 p-2.5 rounded-xl border border-hardware-border/20">
                  <p className="font-bold text-gray-400 uppercase text-[8px] tracking-wider">1. Temperature Coefficient (1.2x)</p>
                  <p>
                    BS 7671 maximum tabulated Zs limits are given for loaded, warm conductors (70°C). We apply a 1.2 multiplier to cable resistances measured cold (20°C) to predict compliance under loaded conditions.
                  </p>
                </div>
                <div className="space-y-1 bg-black/20 p-2.5 rounded-xl border border-hardware-border/20">
                  <p className="font-bold text-gray-400 uppercase text-[8px] tracking-wider">2. 0.8 Rule of Thumb (80% Limit)</p>
                  <p>
                    Alternatively, when testing on-site with a loop tester at ambient temperature (20°C), we compare measured Zs directly with <span className="text-emerald-500 font-bold">80%</span> (0.8 factor) of the tabulated limit. This is mathematically identical to applying the 1.2 temperature rise factor.
                  </p>
                </div>
              </div>
            </div>

            {/* Additional details list */}
            <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-hardware-border/20">
              <div>
                <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-0.5">Design Current (Ib)</p>
                <p className="text-sm font-mono font-bold text-white">{designCurrent.toFixed(2)} A</p>
              </div>
              <div>
                <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-0.5">Disconnection Time</p>
                <p className="text-sm font-mono font-bold text-white">{deviceInfo.disconnectionTime}</p>
              </div>
              <div>
                <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-0.5">Operating Range</p>
                <p className="text-sm font-mono font-bold text-white">{deviceInfo.multiplier}</p>
              </div>
              <div>
                <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-0.5">Minimum Trip Current</p>
                <p className="text-sm font-mono font-bold text-white">
                  {activeDeviceType.includes('Type B') && `${activeRating * 5}A`}
                  {activeDeviceType.includes('Type C') && `${activeRating * 10}A`}
                  {activeDeviceType.includes('Type D') && `${activeRating * 20}A`}
                  {!activeDeviceType.startsWith('60898') && 'N/A (Fuse profile)'}
                </p>
              </div>
            </div>

            {/* Application insight block */}
            <div className="p-4 bg-black/20 rounded-2xl border border-hardware-border/30 flex gap-3">
              <AlertTriangle className="text-emerald-500 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Magnetic Trip Profile & Advice</p>
                <p className="text-[11px] text-gray-500 leading-relaxed font-sans font-medium">{deviceInfo.applicationText}</p>
              </div>
            </div>

          </div>

          {/* Share Modal Dialog Overlay */}
          <AnimatePresence>
            {showShareMenu && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-hardware-card border border-hardware-border rounded-[32px] p-6 max-w-sm w-full space-y-6"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-white">Export Results</h3>
                    <button
                      onClick={() => setShowShareMenu(false)}
                      className="p-1.5 bg-black/40 hover:bg-black/60 rounded-full text-gray-500 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => {
                        handleShare();
                        setIsCopying(true);
                        setTimeout(() => setIsCopying(false), 2000);
                      }}
                      className="w-full flex items-center gap-3 p-4 bg-black/40 border border-hardware-border rounded-2xl hover:border-emerald-500/30 text-left transition-colors"
                    >
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                        {isCopying ? <Check size={18} /> : <Copy size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{isCopying ? 'Copied!' : 'Copy Text'}</p>
                        <p className="text-[10px] text-gray-500">Copy raw text calculation summary</p>
                      </div>
                    </button>

                    <button
                      onClick={handleDownloadImage}
                      disabled={isSavingImage}
                      className="w-full flex items-center gap-3 p-4 bg-black/40 border border-hardware-border rounded-2xl hover:border-emerald-500/30 text-left transition-colors"
                    >
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                        {isSavingImage ? <Activity className="animate-spin" size={18} /> : <Download size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{isSavingImage ? 'Generating...' : 'Save Image'}</p>
                        <p className="text-[10px] text-gray-500">Export as high resolution PNG</p>
                      </div>
                    </button>

                    <button
                      onClick={handleDownloadPDF}
                      disabled={isSavingPDF}
                      className="w-full flex items-center gap-3 p-4 bg-black/40 border border-hardware-border rounded-2xl hover:border-emerald-500/30 text-left transition-colors"
                    >
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                        {isSavingPDF ? <Activity className="animate-spin" size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{isSavingPDF ? 'Generating...' : 'Save PDF Report'}</p>
                        <p className="text-[10px] text-gray-500">Export official PDF document</p>
                      </div>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Hidden PDF Sheet for print quality rendering */}
          <div className="hidden">
            <div ref={pdfRef} style={{ width: '400px', height: '600px', padding: '40px', backgroundColor: '#ffffff', color: '#151619' }} className="space-y-8 font-sans">
              <div className="border-b-2 border-emerald-500 pb-4">
                <h1 className="text-2xl font-black tracking-tight uppercase">BS 7671 Field Report</h1>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mt-1">Protective Device Selection</p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Circuit Load Profile</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">
                      {inputMode === InputMode.DIRECT_AMPS ? `${loadAmps} A` : `${loadKw} kW (${supplyType})`}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Design Current (Ib)</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{designCurrent.toFixed(2)} A</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Circuit Category</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{circuitType}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Device Specification</p>
                    <p className="text-xs font-bold font-mono text-emerald-600 mt-0.5">{activeRating}A {activeDeviceType.replace('60898 ', '').replace('BS ', '')}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-4">
                <h3 className="font-bold text-xs text-black uppercase tracking-wider">Loop Impedance Compliance Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Tabulated Max Zs (100%)</p>
                    <p className="text-lg font-bold font-mono text-black">{maxZs100.toFixed(2)} Ω</p>
                  </div>
                  <div>
                    <p className="text-emerald-600 text-[8px] font-bold uppercase tracking-wider">On-Site Limit (80%)</p>
                    <p className="text-lg font-bold font-mono text-emerald-600">{maxZs80.toFixed(2)} Ω</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Operating Parameters</p>
                <p className="text-[10px] text-gray-700 leading-relaxed">{deviceInfo.applicationText}</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <p className="text-[8px] text-gray-500 font-mono">Disconnection Time: {deviceInfo.disconnectionTime}</p>
                  <p className="text-[8px] text-gray-500 font-mono">Operating Range: {deviceInfo.multiplier}</p>
                </div>
              </div>

              <div className="border-t pt-4 text-[7px] text-gray-400 font-mono text-center">
                Calculated on {new Date().toLocaleDateString()} using The Sparkys Mate Pro
              </div>
            </div>
          </div>
        </motion.div>
      )}

    </div>
  );
}
