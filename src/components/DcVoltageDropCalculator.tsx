import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Share2,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Check,
  Download,
  FileText,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  Sparkles
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from '../utils/download';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface DcVoltageDropCalculatorProps {
  onShare: (text: string) => void;
}

const COPPER_RESISTANCE: Record<number, number> = {
  1.5: 12.1,
  2.5: 7.41,
  4: 4.61,
  6: 3.08,
  10: 1.83,
  16: 1.15,
  25: 0.727,
  35: 0.524,
  50: 0.387,
  70: 0.268,
  95: 0.193,
  120: 0.153,
  150: 0.124,
  185: 0.0991,
  240: 0.0754,
  300: 0.0601
};

const ALUMINIUM_RESISTANCE: Record<number, number> = {
  1.5: 20.0, // Extrapolated
  2.5: 12.2, // Extrapolated
  4: 7.41,
  6: 4.61,
  10: 3.08,
  16: 1.91,
  25: 1.20,
  35: 0.868,
  50: 0.641,
  70: 0.443,
  95: 0.320,
  120: 0.253,
  150: 0.206,
  185: 0.164,
  240: 0.125,
  300: 0.100
};

const CABLE_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

export default function DcVoltageDropCalculator({ onShare }: DcVoltageDropCalculatorProps) {
  // Input states
  const [voltageType, setVoltageType] = useState<string>('24'); // '12', '24', '48', '110', 'custom'
  const [customVoltage, setCustomVoltage] = useState<string>('24');
  const [loadCurrent, setLoadCurrent] = useState<string>('10');
  const [cableLength, setCableLength] = useState<string>('15');
  const [material, setMaterial] = useState<'copper' | 'aluminium'>('copper');
  const [cableSize, setCableSize] = useState<number>(4);
  const [maxDropType, setMaxDropType] = useState<string>('3'); // '3', '5', 'custom'
  const [customMaxDrop, setCustomMaxDrop] = useState<string>('3');
  const [autoSelect, setAutoSelect] = useState<boolean>(true);

  // Recommendation panel states
  const [recommendation, setRecommendation] = useState<{
    cableSize: number;
    voltageDrop: number;
    percentageDrop: number;
    finalVoltage: number;
    resistance: number;
  } | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // Sharing & Export states
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);

  const shareRef = React.useRef<HTMLDivElement>(null);
  const pdfRef = React.useRef<HTMLDivElement>(null);
  const lastSavedHistoryRef = React.useRef<string | null>(null);

  // Resolve Nominal Voltage
  const systemVoltage = useMemo(() => {
    if (voltageType === 'custom') {
      return Math.max(0.1, parseFloat(customVoltage) || 12);
    }
    return parseFloat(voltageType) || 24;
  }, [voltageType, customVoltage]);

  // Resolve Max Permitted Percentage
  const maxDropPercent = useMemo(() => {
    if (maxDropType === 'custom') {
      return Math.max(0.1, parseFloat(customMaxDrop) || 3);
    }
    return parseFloat(maxDropType) || 3;
  }, [maxDropType, customMaxDrop]);

  // Resolve Resistance Value
  const resistanceTable = material === 'copper' ? COPPER_RESISTANCE : ALUMINIUM_RESISTANCE;

  // Auto-selection of minimum compliant cable size
  const suggestedCableSize = useMemo(() => {
    const iVal = parseFloat(loadCurrent) || 0;
    const lVal = parseFloat(cableLength) || 0;
    if (iVal <= 0 || lVal <= 0 || systemVoltage <= 0) {
      return null;
    }

    for (const size of CABLE_SIZES) {
      const res = resistanceTable[size];
      if (!res) continue;

      const drop = (2 * lVal * iVal * res) / 1000;
      const pct = (drop / systemVoltage) * 100;

      if (pct <= maxDropPercent) {
        return size;
      }
    }
    return null;
  }, [loadCurrent, cableLength, systemVoltage, resistanceTable, maxDropPercent]);

  // Sync suggested size when autoSelect is true
  useEffect(() => {
    if (autoSelect && suggestedCableSize !== null) {
      setCableSize(suggestedCableSize);
    }
  }, [autoSelect, suggestedCableSize]);

  const unitResistance = useMemo(() => {
    return resistanceTable[cableSize] || 0;
  }, [cableSize, resistanceTable]);

  // Perform core calculation
  const calculation = useMemo(() => {
    const iVal = parseFloat(loadCurrent) || 0;
    const lVal = parseFloat(cableLength) || 0;

    // Validation flags
    const isValid = iVal > 0 && lVal > 0 && systemVoltage > 0;

    if (!isValid) {
      return {
        voltageDrop: 0,
        percentageDrop: 0,
        finalVoltage: systemVoltage,
        isCompliant: true,
        isValid: false,
        error: 'Please enter valid positive values for load current, cable length, and system voltage.'
      };
    }

    // Voltage Drop = (2 × L × I × R) / 1000
    const voltageDrop = (2 * lVal * iVal * unitResistance) / 1000;
    const percentageDrop = (voltageDrop / systemVoltage) * 100;
    const finalVoltage = Math.max(0, systemVoltage - voltageDrop);
    const isCompliant = percentageDrop <= maxDropPercent;

    return {
      voltageDrop,
      percentageDrop,
      finalVoltage,
      isCompliant,
      isValid: true,
      error: null
    };
  }, [loadCurrent, cableLength, systemVoltage, unitResistance, maxDropPercent]);

  // Handler to find the smallest compliant cable size
  const handleCalculateMinimumSize = () => {
    setAutoSelect(true);
    const iVal = parseFloat(loadCurrent) || 0;
    const lVal = parseFloat(cableLength) || 0;

    if (iVal <= 0 || lVal <= 0 || systemVoltage <= 0) {
      setRecommendationError('Cannot recommend cable size. Please check that current, length, and voltage are valid.');
      setRecommendation(null);
      setShowRecommendation(true);
      return;
    }

    setRecommendationError(null);
    let foundSize: number | null = null;
    let foundResult = null;

    // Iterate smallest to largest
    for (const size of CABLE_SIZES) {
      const res = resistanceTable[size];
      if (!res) continue;

      const drop = (2 * lVal * iVal * res) / 1000;
      const pct = (drop / systemVoltage) * 100;

      if (pct <= maxDropPercent) {
        foundSize = size;
        foundResult = {
          cableSize: size,
          voltageDrop: drop,
          percentageDrop: pct,
          finalVoltage: Math.max(0, systemVoltage - drop),
          resistance: res
        };
        break;
      }
    }

    if (foundResult && foundSize) {
      setRecommendation(foundResult);
      setCableSize(foundSize);
    } else {
      setRecommendation(null);
      setRecommendationError(`No cable size in our standard database (up to 300 mm²) satisfies the ${maxDropPercent}% maximum voltage drop limit. Consider raising the system voltage or reducing the cable length.`);
    }
    setShowRecommendation(true);
  };

  // Auto save calculation parameters to History service
  useEffect(() => {
    if (!calculation.isValid) return;

    const payload = {
      type: 'dc_voltage_drop' as const,
      title: `DC Drop: ${calculation.percentageDrop.toFixed(2)}% (${cableSize}mm²)`,
      inputs: {
        voltageType,
        customVoltage,
        loadCurrent,
        cableLength,
        material,
        cableSize,
        maxDropType,
        customMaxDrop,
        systemVoltage,
        maxDropPercent
      },
      results: {
        voltageDrop: calculation.voltageDrop,
        percentageDrop: calculation.percentageDrop,
        finalVoltage: calculation.finalVoltage,
        isCompliant: calculation.isCompliant,
        unitResistance
      }
    };

    const signature = JSON.stringify(payload);
    if (lastSavedHistoryRef.current === signature) return;
    lastSavedHistoryRef.current = signature;

    saveCalculation(
      auth.currentUser?.uid,
      payload.type,
      payload.title,
      payload.inputs,
      payload.results
    ).catch(error => {
      console.error('Error auto-saving DC voltage drop history:', error);
    });
  }, [calculation, cableSize, material, voltageType, customVoltage, loadCurrent, cableLength, maxDropType, customMaxDrop]);

  // Share calculation summary text
  const handleShare = () => {
    const text = `
⚡ DC VOLTAGE DROP & CABLE SIZING REPORT ⚡
-----------------------------------------
System Nominal Voltage: ${systemVoltage} V DC
Load Current: ${loadCurrent} A
One-way Cable Length: ${cableLength} m
Conductor Material: ${material.toUpperCase()}
Selected Cable Size: ${cableSize} mm²
Max Permitted Drop: ${maxDropPercent} %

Calculated Outputs:
- Cable Resistance: ${unitResistance} mΩ/m
- Calculated Voltage Drop: ${calculation.voltageDrop.toFixed(2)} V
- Percentage Voltage Drop: ${calculation.percentageDrop.toFixed(2)} %
- Final Voltage at Load: ${calculation.finalVoltage.toFixed(2)} V
- Limit Compliance: ${calculation.isCompliant ? 'PASS ✅' : 'FAIL ❌'}

${recommendation ? `
Optimal Cable Recommendation:
- Smallest Compliant Size: ${recommendation.cableSize} mm²
- Recommended Drop: ${recommendation.voltageDrop.toFixed(2)} V (${recommendation.percentageDrop.toFixed(2)}%)
- Recommended Load Voltage: ${recommendation.finalVoltage.toFixed(2)} V
` : ''}
-----------------------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(text);
  };

  // Download high-res PNG image
  const handleDownloadImage = async () => {
    if (!shareRef.current || isSavingImage) return;
    setIsSavingImage(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#0a0a0a',
      });
      await downloadFile(dataUrl, `dc-volt-drop-${Date.now()}.png`, 'image/png');
      setTimeout(() => setIsSavingImage(false), 2000);
    } catch (err) {
      console.error('Error generating image:', err);
      setIsSavingImage(false);
    }
  };

  // Download printable PDF Document
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

      await downloadFile(pdfDataUrl, `dc-volt-drop-report-${Date.now()}.pdf`, 'application/pdf');
      setTimeout(() => setIsSavingPDF(false), 2000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setIsSavingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6">

        {/* Toggle Material */}
        <div className="flex bg-black/40 p-1 rounded-2xl border border-hardware-border">
          <button
            onClick={() => setMaterial('copper')}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              material === 'copper' ? 'bg-emerald-500 text-black shadow-lg font-black' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Copper (Cu)
          </button>
          <button
            onClick={() => setMaterial('aluminium')}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              material === 'aluminium' ? 'bg-emerald-500 text-black shadow-lg font-black' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Aluminium (Al)
          </button>
        </div>

        {/* Primary Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Nominal Voltage */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">System Nominal Voltage</label>
            <div className="relative">
              <select
                value={voltageType}
                onChange={(e) => setVoltageType(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none cursor-pointer"
              >
                <option value="12" className="bg-hardware-card text-white">12 V DC</option>
                <option value="24" className="bg-hardware-card text-white">24 V DC</option>
                <option value="48" className="bg-hardware-card text-white">48 V DC</option>
                <option value="110" className="bg-hardware-card text-white">110 V DC</option>
                <option value="custom" className="bg-hardware-card text-white">Custom DC Voltage...</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Custom Voltage Field (Conditional) */}
          {voltageType === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Enter Custom DC Voltage (V)</label>
              <input
                type="number"
                inputMode="decimal"
                value={customVoltage}
                onChange={(e) => setCustomVoltage(e.target.value)}
                placeholder="24"
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </motion.div>
          )}

          {/* Load Current (Ib) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Load Current (Amps)</label>
            <input
              type="number"
              inputMode="decimal"
              value={loadCurrent}
              onChange={(e) => setLoadCurrent(e.target.value)}
              placeholder="10"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          {/* Cable Length */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Length (m) <span className="text-[8px] text-emerald-500/70 lowercase font-normal">(one-way)</span></label>
            <input
              type="number"
              inputMode="decimal"
              value={cableLength}
              onChange={(e) => setCableLength(e.target.value)}
              placeholder="15"
              className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
            />
          </div>

          {/* Cable Cross-Sectional Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Cable Cross-Sectional Area (mm²)</label>
              {autoSelect ? (
                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <Sparkles size={8} />
                  AUTO
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAutoSelect(true)}
                  className="text-[8px] font-black uppercase tracking-wider text-gray-400 hover:text-emerald-400 bg-white/5 hover:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-white/5 hover:border-emerald-500/20 transition-all cursor-pointer"
                >
                  Enable Auto
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={cableSize}
                onChange={(e) => {
                  setCableSize(parseFloat(e.target.value));
                  setAutoSelect(false);
                }}
                className={`w-full bg-black/40 border rounded-2xl px-4 py-4 text-white font-mono font-bold appearance-none focus:border-emerald-500/50 transition-all outline-none cursor-pointer ${
                  autoSelect ? 'border-emerald-500/30 text-emerald-400' : 'border-hardware-border'
                }`}
              >
                {CABLE_SIZES.map(size => (
                  <option key={size} value={size} className="bg-hardware-card text-white font-mono">
                    {size} mm² ({resistanceTable[size]} mΩ/m)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Max Permitted Drop */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Max Permitted Voltage Drop (%)</label>
            <div className="relative">
              <select
                value={maxDropType}
                onChange={(e) => setMaxDropType(e.target.value)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none cursor-pointer"
              >
                <option value="3" className="bg-hardware-card text-white">3% (Lighting standards)</option>
                <option value="5" className="bg-hardware-card text-white">5% (Power & General)</option>
                <option value="10" className="bg-hardware-card text-white">10% (High tolerance DC)</option>
                <option value="custom" className="bg-hardware-card text-white">Custom Percentage...</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Custom Percentage Drop Input (Conditional) */}
          {maxDropType === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Enter Custom Limit (%)</label>
              <input
                type="number"
                inputMode="decimal"
                value={customMaxDrop}
                onChange={(e) => setCustomMaxDrop(e.target.value)}
                placeholder="3"
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none"
              />
            </motion.div>
          )}

        </div>

        {/* Core Sizing Action Button */}
        <div className="pt-2">
          <button
            onClick={handleCalculateMinimumSize}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            Calculate Minimum Cable Size
          </button>
        </div>

      </div>

      {/* Validation Message Box */}
      {!calculation.isValid && (
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex gap-3">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Validation Notice</p>
            <p className="text-[11px] text-gray-400 leading-relaxed font-sans">{calculation.error}</p>
          </div>
        </div>
      )}

      {/* Auto-Sizing Recommendations Drawer */}
      <AnimatePresence>
        {showRecommendation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            {recommendationError ? (
              <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-5 flex gap-3.5">
                <AlertTriangle className="text-red-500 shrink-0 mt-1" size={18} />
                <div className="space-y-1.5">
                  <h4 className="text-xs font-black uppercase text-red-500 tracking-wider">No Valid Size Found</h4>
                  <p className="text-xs text-gray-400 leading-relaxed font-sans">{recommendationError}</p>
                </div>
              </div>
            ) : (
              recommendation && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />

                  <div className="flex justify-between items-center pb-3 border-b border-hardware-border/20">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-emerald-500" size={16} />
                      <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider">Cable Size Optimization Suggestion</h4>
                    </div>
                    <button
                      onClick={() => setShowRecommendation(false)}
                      className="p-1 bg-black/40 rounded-full text-gray-500 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 bg-black/30 rounded-2xl border border-hardware-border/30">
                      <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest">Smallest Safe Cable Size</p>
                      <p className="text-2xl font-mono font-black text-white mt-1">
                        {recommendation.cableSize} <span className="text-xs font-sans font-normal text-gray-400">mm²</span>
                      </p>
                      <button
                        onClick={() => {
                          setCableSize(recommendation.cableSize);
                          setShowRecommendation(false);
                        }}
                        className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400 mt-2 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 transition-colors inline-block"
                      >
                        Apply Size to Calculator
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-black/30 rounded-2xl border border-hardware-border/30">
                        <p className="text-gray-500 text-[8px] font-bold uppercase tracking-widest">Voltage Drop</p>
                        <p className="text-base font-mono font-bold text-white mt-0.5">{recommendation.voltageDrop.toFixed(2)} V</p>
                        <p className="text-[8px] font-mono text-emerald-500">{recommendation.percentageDrop.toFixed(2)}%</p>
                      </div>
                      <div className="p-3 bg-black/30 rounded-2xl border border-hardware-border/30">
                        <p className="text-gray-500 text-[8px] font-bold uppercase tracking-widest">Voltage at Load</p>
                        <p className="text-base font-mono font-bold text-white mt-0.5">{recommendation.finalVoltage.toFixed(2)} V</p>
                        <p className="text-[8px] text-gray-500 font-mono">cos φ = 1.0 (DC)</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Results Display */}
      {calculation.isValid && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Main Printable Results Panel */}
          <div ref={shareRef} className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-mono text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Voltage Drop Results</h3>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{cableSize} mm² {material === 'copper' ? 'Copper' : 'Aluminium'} Conductor</span>
                </h4>
              </div>
              <button
                onClick={() => setShowShareMenu(true)}
                className="p-2.5 bg-black/40 hover:bg-black/60 rounded-xl border border-hardware-border transition-colors text-gray-400 hover:text-white"
                title="Export Results"
              >
                <Share2 size={16} />
              </button>
            </div>

            {/* Voltage Drop Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Voltage Drop</p>
                <p className="text-2xl font-mono font-bold text-white">{calculation.voltageDrop.toFixed(2)} V</p>
                <p className="text-[9px] text-emerald-500 font-mono mt-1 font-bold">
                  {calculation.percentageDrop.toFixed(2)} % <span className="text-gray-500 font-normal">of system voltage</span>
                </p>
              </div>

              <div className="p-4 bg-black/40 rounded-2xl border border-hardware-border/50">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Voltage at Load</p>
                <p className="text-2xl font-mono font-bold text-white">{calculation.finalVoltage.toFixed(2)} V</p>
                <p className="text-[9px] text-gray-500 font-mono mt-1">
                  Nominal: {systemVoltage} V DC
                </p>
              </div>
            </div>

            {/* Sizing Warning */}
            {suggestedCableSize === null && (
              <div className="p-4 rounded-2xl border bg-red-500/10 border-red-500/20 text-red-400 flex gap-3.5">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1 flex-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
                    Sizing Alert: Limit Exceeded
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    No standard cable size in our database (up to 300 mm²) can satisfy the {maxDropPercent}% voltage drop limit with the current inputs. Consider raising the system voltage or reducing the cable run length.
                  </p>
                </div>
              </div>
            )}

            {/* Compliance Banner */}
            <div className={`p-4 rounded-2xl border ${
              calculation.isCompliant ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
            } flex gap-3.5`}>
              {calculation.isCompliant ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
              )}
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    calculation.isCompliant ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {calculation.isCompliant ? 'Compliance: Pass' : 'Compliance: Fail'}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold font-mono">
                    Limit: {maxDropPercent}% ({((maxDropPercent / 100) * systemVoltage).toFixed(2)} V)
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">
                  {calculation.isCompliant
                    ? `The calculated voltage drop of ${calculation.voltageDrop.toFixed(2)}V (${calculation.percentageDrop.toFixed(2)}%) is compliant with the selected maximum permitted limit of ${maxDropPercent}%.`
                    : `The calculated voltage drop of ${calculation.voltageDrop.toFixed(2)}V (${calculation.percentageDrop.toFixed(2)}%) exceeds the selected maximum permitted limit of ${maxDropPercent}%.`}
                </p>
              </div>
            </div>

            {/* Formula display block */}
            <div className="p-4 bg-black/20 rounded-2xl border border-hardware-border/30 space-y-2">
              <div className="flex items-center gap-2 pb-1.5 border-b border-hardware-border/10">
                <TrendingDown className="text-emerald-500" size={14} />
                <h4 className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Calculation Details & Physics Formula</h4>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed font-sans">
                Voltage drop computed utilizing the 2-way DC run formula:
              </p>
              <div className="bg-black/30 p-2.5 rounded-xl border border-hardware-border/20 text-center">
                <p className="text-xs font-mono font-bold text-white">
                  Voltage Drop (V) = (2 × L × I × R) / 1000
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[9px] text-gray-500 font-mono leading-normal pt-1">
                <div>
                  <p>• L (One-way) = {cableLength} m</p>
                  <p>• I (Current) = {loadCurrent} A</p>
                </div>
                <div>
                  <p>• R (Resistance) = {unitResistance} mΩ/m</p>
                  <p>• Multiplier = 2 (Positive + Return run)</p>
                </div>
              </div>
            </div>

          </div>

          {/* Share / Export Modal Dialog */}
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

          {/* Hidden Print quality Sheet for rendering PDF */}
          <div className="hidden">
            <div ref={pdfRef} style={{ width: '400px', height: '600px', padding: '40px', backgroundColor: '#ffffff', color: '#151619' }} className="space-y-8 font-sans">
              <div className="border-b-2 border-emerald-500 pb-4">
                <h1 className="text-2xl font-black tracking-tight uppercase">BS 7671 Field Report</h1>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mt-1 font-mono">DC Voltage Drop Calculation</p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">System Voltage</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{systemVoltage} V DC</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Load Current</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{loadCurrent} A</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Cable Specifications</p>
                    <p className="text-xs font-bold text-black mt-0.5 font-mono">{cableSize} mm² ({material.toUpperCase()})</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">One-way Cable Length</p>
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{cableLength} m</p>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-4">
                <h3 className="font-bold text-xs text-black uppercase tracking-wider">Calculation Outputs</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Calculated Drop (V / %)</p>
                    <p className="text-base font-bold font-mono text-black">{calculation.voltageDrop.toFixed(2)} V ({calculation.percentageDrop.toFixed(2)}%)</p>
                  </div>
                  <div>
                    <p className="text-emerald-600 text-[8px] font-bold uppercase tracking-wider">Final Voltage at Load</p>
                    <p className="text-base font-bold font-mono text-emerald-600">{calculation.finalVoltage.toFixed(2)} V</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Formula Parameters</p>
                <p className="text-[10px] text-gray-700 leading-relaxed">
                  Calculated using formula: Voltage Drop = (2 × L × I × R) / 1000. Resistance value used: {unitResistance} mΩ/m.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <p className="text-[8px] text-gray-500 font-mono">Max Permitted Limit: {maxDropPercent}%</p>
                  <p className="text-[8px] text-gray-500 font-mono">Status: {calculation.isCompliant ? 'PASS' : 'FAIL'}</p>
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
