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
  LogIn,
  History as HistoryIcon
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from '../utils/download';
import { SupplySystem, DeviceType } from '../types';
import { CABLE_RESISTANCE, DEVICE_LIMITS } from '../constants';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface ZsCalculatorProps {
  onShare: (text: string) => void;
}

export default function ZsCalculator({ onShare }: ZsCalculatorProps) {
  const [supplySystem, setSupplySystem] = useState<SupplySystem>(SupplySystem.TN_C_S);
  const [ze, setZe] = useState<string>('0.35');
  const [phaseSize, setPhaseSize] = useState<string>('2.5');
  const [cpcSize, setCpcSize] = useState<string>('1.5');
  const [resistance, setResistance] = useState<string>('19.51');
  const [cableLength, setCableLength] = useState<string>('');
  const [useTotalResistance, setUseTotalResistance] = useState(false);
  const [totalResistance, setTotalResistance] = useState<string>('');
  const [deviceType, setDeviceType] = useState<DeviceType>(DeviceType.MCB_B);
  const [protectiveDevice, setProtectiveDevice] = useState<number>(32);
  const [showResult, setShowResult] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  
  const shareRef = React.useRef<HTMLDivElement>(null);
  const pdfRef = React.useRef<HTMLDivElement>(null);

  // Reset protective device rating when type changes
  useEffect(() => {
    const availableRatings = Object.keys(DEVICE_LIMITS[deviceType]).map(Number);
    if (!availableRatings.includes(protectiveDevice)) {
      setProtectiveDevice(availableRatings[0]);
    }
  }, [deviceType]);

  // Update resistance when cable size changes
  useEffect(() => {
    const phase = parseFloat(phaseSize);
    const cpc = parseFloat(cpcSize);
    
    if (CABLE_RESISTANCE[phase] && CABLE_RESISTANCE[cpc]) {
      const totalResistanceMilliOhms = CABLE_RESISTANCE[phase] + CABLE_RESISTANCE[cpc];
      setResistance(totalResistanceMilliOhms.toFixed(3));
    }
  }, [phaseSize, cpcSize]);

  const calculation = useMemo(() => {
    const zeVal = parseFloat(ze) || 0;
    const lengthVal = parseFloat(cableLength) || 0;
    const resistanceMilliOhms = parseFloat(resistance) || 0;
    
    // Apply 1.2 factor for conductor temperature rise (20°C to 70°C) as per BS 7671
    let r1r2 = 0;
    if (useTotalResistance) {
      r1r2 = (parseFloat(totalResistance) || 0) * 1.2;
    } else {
      r1r2 = (resistanceMilliOhms * lengthVal * 1.2) / 1000;
    }

    const zs = zeVal + r1r2;
    const maxZs = DEVICE_LIMITS[deviceType][protectiveDevice] || 0;
    const isCompliant = zs <= maxZs;

    return {
      zs,
      maxZs,
      isCompliant,
      r1r2
    };
  }, [ze, resistance, cableLength, deviceType, protectiveDevice, useTotalResistance, totalResistance]);

  const handleShare = () => {
    const text = `
⚡ Zs CALCULATION RESULT ⚡
-------------------------
Supply: ${supplySystem}
Ze: ${ze} Ω
${useTotalResistance 
  ? `Total R1+R2: ${totalResistance} Ω` 
  : `Cable: ${phaseSize}/${cpcSize}mm² (${cableLength}m)\nResistance: ${resistance} mΩ/m`}
Device: ${deviceType} ${protectiveDevice}A

Calculated Zs: ${calculation.zs.toFixed(2)} Ω
Max Permitted: ${calculation.maxZs.toFixed(2)} Ω
Status: ${calculation.isCompliant ? '✅ PASS' : '❌ FAIL'}

Explanation: ${calculation.isCompliant 
  ? `The calculated Zs of ${calculation.zs.toFixed(2)}Ω is within the maximum permitted limit of ${calculation.maxZs.toFixed(2)}Ω for a ${deviceType} ${protectiveDevice}A. Disconnection time requirements are met.`
  : `The calculated Zs of ${calculation.zs.toFixed(2)}Ω exceeds the maximum permitted limit of ${calculation.maxZs.toFixed(2)}Ω. Disconnection time requirements are NOT met.`}
-------------------------
Calculated via BS7671 Field Toolkit
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
      
      await downloadFile(dataUrl, `bs7671-zs-calc-${Date.now()}.png`, 'image/png');
      
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
      
      await downloadFile(pdfDataUrl, `bs7671-zs-report-${Date.now()}.pdf`, 'application/pdf');
      
      setTimeout(() => setIsSavingPDF(false), 2000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setIsSavingPDF(false);
    }
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
    
    if (isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      await saveCalculation(
        auth.currentUser!.uid,
        'zs',
        `Zs: ${deviceType} ${protectiveDevice}A`,
        { supplySystem, ze, cableSize: `${phaseSize}/${cpcSize}`, resistance, cableLength, useTotalResistance, totalResistance, deviceType, protectiveDevice },
        { zs: calculation.zs, maxZs: calculation.maxZs, isCompliant: calculation.isCompliant }
      );
      // Show success state
      setTimeout(() => setIsSavingHistory(false), 2000);
    } catch (error) {
      console.error('Error saving to history:', error);
      setIsSavingHistory(false);
    }
  };

  const availableRatings = useMemo(() => {
    return Object.keys(DEVICE_LIMITS[deviceType]).map(Number).sort((a, b) => a - b);
  }, [deviceType]);

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card p-6 rounded-3xl border border-hardware-border">
        <div className="space-y-4">
          {/* Supply System */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply Type</label>
            <div className="relative">
              <select 
                id="supply-system-select"
                value={supplySystem}
                onChange={(e) => setSupplySystem(e.target.value as SupplySystem)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.values(SupplySystem).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Ze */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">External Impedance (Ze) Ω</label>
            <input 
              id="ze-input"
              type="number"
              inputMode="decimal"
              value={ze}
              onChange={(e) => setZe(e.target.value)}
              placeholder="0.35"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          {/* Resistance Mode Toggle */}
          <div className="flex bg-black/40 p-1 rounded-2xl border border-hardware-border">
            <button
              id="mode-per-meter-button"
              onClick={() => setUseTotalResistance(false)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                !useTotalResistance ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Per Meter
            </button>
            <button
              id="mode-total-ohms-button"
              onClick={() => setUseTotalResistance(true)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                useTotalResistance ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Total Ohms
            </button>
          </div>

          {/* Cable Size & Resistance */}
          <div className="grid grid-cols-1 gap-4">
            {!useTotalResistance ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Phase Conductor (mm²)</label>
                    <div className="relative">
                      <select 
                        value={phaseSize}
                        onChange={(e) => setPhaseSize(e.target.value)}
                        className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
                      >
                        {Object.keys(CABLE_RESISTANCE).map(Number).sort((a, b) => a - b).map(size => (
                          <option key={size} value={size}>{size} mm²</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">CPC Conductor (mm²)</label>
                    <div className="relative">
                      <select 
                        value={cpcSize}
                        onChange={(e) => setCpcSize(e.target.value)}
                        className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
                      >
                        {Object.keys(CABLE_RESISTANCE).map(Number).sort((a, b) => a - b).map(size => (
                          <option key={size} value={size}>{size} mm²</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Resistance (mΩ/m)</label>
                    {CABLE_RESISTANCE[parseFloat(phaseSize)] && CABLE_RESISTANCE[parseFloat(cpcSize)] && (
                      <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Auto-calculated</span>
                    )}
                  </div>
                  <input 
                    type="number"
                    inputMode="decimal"
                    value={resistance}
                    onChange={(e) => setResistance(e.target.value)}
                    className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Total R1+R2 (Ω)</label>
                <input 
                  type="number"
                  inputMode="decimal"
                  value={totalResistance}
                  onChange={(e) => setTotalResistance(e.target.value)}
                  placeholder="0.50"
                  className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
                />
              </div>
            )}
          </div>

          {/* Cable Length */}
          {!useTotalResistance && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Length (m)</label>
            <input 
              id="cable-length-input"
              type="number"
              inputMode="numeric"
              value={cableLength}
              onChange={(e) => setCableLength(e.target.value)}
              placeholder="Enter length"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
              {cableLength && (
                <div className="flex justify-between px-2">
                  <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Live R1+R2 Preview (70°C)</span>
                  <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">
                    {calculation.r1r2.toFixed(3)} Ω
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Device Type */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Device Type</label>
            <div className="relative">
              <select 
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {Object.values(DeviceType).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Protective Device Rating */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Rating (Amps)</label>
            <div className="relative">
              <select 
                value={protectiveDevice}
                onChange={(e) => setProtectiveDevice(parseInt(e.target.value))}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none"
              >
                {availableRatings.map(rating => (
                  <option key={rating} value={rating}>{rating}A</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          <button
            id="calculate-zs-button"
            onClick={() => setShowResult(true)}
            disabled={!useTotalResistance && !cableLength}
            className="w-full bg-emerald-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-emerald-400 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale mt-4 shadow-lg shadow-emerald-500/20"
          >
            Calculate Zs
          </button>
        </div>
      </div>

      {showResult && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className={`p-6 rounded-3xl border ${
            calculation.isCompliant 
              ? 'bg-emerald-500/5 border-emerald-500/20' 
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className={calculation.isCompliant ? 'text-emerald-500' : 'text-red-500'} />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Circuit Result</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                calculation.isCompliant 
                  ? 'bg-emerald-500 text-black' 
                  : 'bg-red-500 text-white'
              }`}>
                {calculation.isCompliant ? 'Pass' : 'Fail'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Calculated Zs</p>
                <p className={`text-2xl font-mono font-bold ${calculation.isCompliant ? 'text-white' : 'text-red-500'}`}>
                  {calculation.zs.toFixed(2)}<span className="text-sm ml-1">Ω</span>
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Max Permitted</p>
                <p className="text-2xl font-mono font-bold text-white">
                  {calculation.maxZs.toFixed(2)}<span className="text-sm ml-1">Ω</span>
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
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {calculation.isCompliant 
                      ? `The calculated Zs of ${calculation.zs.toFixed(2)}Ω is within the maximum permitted limit of ${calculation.maxZs.toFixed(2)}Ω for a ${deviceType} ${protectiveDevice}A. Disconnection time requirements are met.`
                      : `The calculated Zs of ${calculation.zs.toFixed(2)}Ω exceeds the maximum permitted limit of ${calculation.maxZs.toFixed(2)}Ω. Disconnection time requirements are NOT met.`}
                  </p>
                  <p className="text-[10px] text-gray-500 italic">
                    * Calculation includes a 1.2 multiplier for conductor temperature rise (70°C operating temp).
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setShowShareMenu(true)}
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

      {/* Share Menu Overlay */}
      <AnimatePresence>
        {showShareMenu && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareMenu(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-hardware-card border border-hardware-border rounded-t-[40px] sm:rounded-[40px] p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Export Zs Result</h3>
                <button onClick={() => setShowShareMenu(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <button 
                  onClick={handleShare}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group"
                >
                  <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    {isCopying ? <Check size={20} /> : <Copy size={20} />}
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                    {isCopying ? 'Copied' : 'Copy'}
                  </span>
                </button>

                <button 
                  onClick={handleDownloadImage}
                  disabled={isSavingImage}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    {isSavingImage ? <Check size={20} /> : <Download size={20} />}
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingImage ? 'Saved' : 'Image'}
                  </span>
                </button>

                <button 
                  onClick={handleDownloadPDF}
                  disabled={isSavingPDF}
                  className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                    {isSavingPDF ? <Check size={20} /> : <FileText size={20} />}
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                    {isSavingPDF ? 'Saved' : 'PDF'}
                  </span>
                </button>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                <p className="text-[10px] text-gray-500 text-center uppercase font-bold tracking-widest">Preview</p>
                <div className="mt-4 p-4 bg-hardware-bg rounded-2xl border border-hardware-border overflow-hidden">
                  <div ref={shareRef} className="p-6 bg-hardware-bg text-white font-sans">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                        <Activity size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">Zs Calculation</h4>
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">BS7671 Field Toolkit • Zs Module</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Ze</span>
                        <span className="text-sm font-mono font-bold">{ze} Ω</span>
                      </div>
                      {useTotalResistance ? (
                        <div>
                          <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total R1+R2</span>
                          <span className="text-sm font-mono font-bold">{totalResistance} Ω</span>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Length</span>
                            <span className="text-sm font-mono font-bold">{cableLength} m</span>
                          </div>
                          <div>
                            <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cable</span>
                            <span className="text-sm font-mono font-bold">{phaseSize}/{cpcSize} mm²</span>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Device</span>
                        <span className="text-sm font-mono font-bold">{deviceType} {protectiveDevice}A</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Calculated Zs</span>
                        <span className={`text-sm font-mono font-bold ${calculation.isCompliant ? 'text-emerald-500' : 'text-red-500'}`}>{calculation.zs.toFixed(2)} Ω</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Max Limit</span>
                        <span className="text-sm font-mono font-bold">{calculation.maxZs.toFixed(2)} Ω</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hidden PDF Report (White Background) */}
              <div className="fixed -left-[9999px] top-0">
                <div ref={pdfRef} className="w-[400px] p-10 bg-white text-black font-sans border border-gray-200">
                  <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
                    <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                      <Activity size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xl text-gray-900">Zs Impedance Report</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">BS7671 Field Toolkit • Zs Module</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-y-6">
                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Supply System</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{supplySystem}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">External (Ze)</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{ze} Ω</span>
                      </div>
                    </div>

                    {useTotalResistance ? (
                      <div className="border-b border-gray-50 pb-4">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total R1+R2</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{totalResistance} Ω</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cable Size</span>
                          <span className="text-sm font-mono font-bold text-gray-900">{phaseSize}/{cpcSize} mm²</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Length</span>
                          <span className="text-sm font-mono font-bold text-gray-900">{cableLength} m</span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Device Type</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{deviceType}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rating</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{protectiveDevice} A</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b border-gray-50 pb-4">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Calculated Zs</span>
                        <span className={`text-lg font-mono font-bold ${calculation.isCompliant ? 'text-emerald-600' : 'text-red-600'}`}>{calculation.zs.toFixed(2)} Ω</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Max Permitted</span>
                        <span className="text-lg font-mono font-bold text-gray-900">{calculation.maxZs.toFixed(2)} Ω</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Compliance Status</span>
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${
                        calculation.isCompliant ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                      }`}>
                        {calculation.isCompliant ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        {calculation.isCompliant ? 'Pass' : 'Fail'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-12 pt-6 border-t border-gray-100 flex justify-between items-center text-gray-400">
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Report Date: {new Date().toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      BS7671 Field Toolkit Professional
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
