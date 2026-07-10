import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Share2,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Check,
  ChevronDown,
  Cpu,
  Zap,
  Cable,
  Ruler,
  Info
} from 'lucide-react';
import { saveCalculation } from '../services/historyService';
import { auth } from '../firebase';

interface ThreePhaseMotorCalculatorProps {
  onShare: (text: string) => void;
}

const CABLE_SIZES = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300
];

const COPPER_RESISTANCE: Record<number, number> = {
  1.5: 12.1,
  2.5: 7.41,
  4.0: 4.61,
  6.0: 3.08,
  10.0: 1.83,
  16.0: 1.15,
  25.0: 0.727,
  35.0: 0.524,
  50.0: 0.387,
  70.0: 0.268,
  95.0: 0.193,
  120.0: 0.153,
  150.0: 0.124,
  185.0: 0.0991,
  240.0: 0.0754,
  300.0: 0.0601,
};

type StartingMethod = 'DOL' | 'Star-Delta' | 'Soft Starter' | 'VSD';

const DEFAULT_MULTIPLIERS: Record<StartingMethod, number> = {
  'DOL': 6.0,
  'Star-Delta': 2.5,
  'Soft Starter': 3.0,
  'VSD': 1.5
};

export default function ThreePhaseMotorCalculator({ onShare }: ThreePhaseMotorCalculatorProps) {
  // --- State Variables ---
  const [supplyVoltage, setSupplyVoltage] = useState<string>('400');
  const [motorPower, setMotorPower] = useState<string>('5.5');
  const [powerFactor, setPowerFactor] = useState<string>('0.8');
  const [efficiency, setEfficiency] = useState<string>('90');
  const [startingMethod, setStartingMethod] = useState<StartingMethod>('DOL');
  const [startingMultiplier, setStartingMultiplier] = useState<string>('6.0');
  const [cableLength, setCableLength] = useState<string>('50');
  const [cableSize, setCableSize] = useState<number>(4);
  const [material, setMaterial] = useState<'copper' | 'aluminium'>('copper');
  const [maxDropPercent, setMaxDropPercent] = useState<string>('5.0');

  // Interactive Sizing Recommendation Modal/State
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendation, setRecommendation] = useState<{
    cableSize: number;
    voltageDrop: number;
    percentageDrop: number;
    finalVoltage: number;
    flc: number;
  } | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // History Auto-Save Guard
  const lastSavedHistoryRef = useRef<string | null>(null);

  // Validation State
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync Starting Current Multiplier on Method Selection
  useEffect(() => {
    setStartingMultiplier(DEFAULT_MULTIPLIERS[startingMethod].toFixed(1));
  }, [startingMethod]);

  // --- Real-time Calculations ---
  const calculation = useMemo(() => {
    const vVal = parseFloat(supplyVoltage);
    const pVal = parseFloat(motorPower);
    const pfVal = parseFloat(powerFactor);
    const effVal = parseFloat(efficiency);
    const multVal = parseFloat(startingMultiplier);
    const lengthVal = parseFloat(cableLength);
    const limitPct = parseFloat(maxDropPercent);

    // Initial validation
    const currentErrors: Record<string, string> = {};

    if (isNaN(vVal) || vVal <= 0) {
      currentErrors.supplyVoltage = 'Supply voltage must be greater than 0';
    }
    if (isNaN(pVal) || pVal <= 0) {
      currentErrors.motorPower = 'Motor power must be greater than 0';
    }
    if (isNaN(pfVal) || pfVal <= 0 || pfVal > 1) {
      currentErrors.powerFactor = 'Power factor must be between 0 and 1';
    }
    if (isNaN(effVal) || effVal <= 0 || effVal > 100) {
      currentErrors.efficiency = 'Efficiency must be between 1% and 100%';
    }
    if (isNaN(multVal) || multVal <= 0) {
      currentErrors.startingMultiplier = 'Multiplier must be greater than 0';
    }
    if (isNaN(lengthVal) || lengthVal < 0) {
      currentErrors.cableLength = 'Cable length cannot be negative';
    }
    if (isNaN(limitPct) || limitPct <= 0 || limitPct > 100) {
      currentErrors.maxDropPercent = 'Voltage drop limit must be between 0.1% and 100%';
    }

    setErrors(currentErrors);

    const hasErrors = Object.keys(currentErrors).length > 0;
    if (hasErrors) {
      return {
        isValid: false,
        flc: 0,
        startingCurrent: 0,
        voltageDrop: 0,
        percentageDrop: 0,
        finalVoltage: 0,
        isCompliant: false,
      };
    }

    // FLC = P / (√3 × V × PF × Efficiency)
    // P is converted to Watts (kW * 1000)
    // Efficiency is converted to decimal (eff / 100)
    const pWatts = pVal * 1000;
    const effDecimal = effVal / 100;
    const denominator = Math.sqrt(3) * vVal * pfVal * effDecimal;
    const flc = pWatts / denominator;

    // Starting Current
    const startingCurrent = flc * multVal;

    // Resistance Lookup (Copper base, 1.64x multiplier for Aluminium)
    const baseR = COPPER_RESISTANCE[cableSize] || 0;
    const multiplierR = material === 'aluminium' ? 1.64 : 1.0;
    const finalR = baseR * multiplierR;

    // Voltage Drop = (√3 × L × I × R) / 1000
    // L = lengthVal, I = flc, R = finalR
    const voltageDrop = (Math.sqrt(3) * lengthVal * flc * finalR) / 1000;
    const percentageDrop = (voltageDrop / vVal) * 100;
    const finalVoltage = Math.max(0, vVal - voltageDrop);
    const isCompliant = percentageDrop <= limitPct;

    return {
      isValid: true,
      flc,
      startingCurrent,
      voltageDrop,
      percentageDrop,
      finalVoltage,
      isCompliant,
    };
  }, [
    supplyVoltage,
    motorPower,
    powerFactor,
    efficiency,
    startingMultiplier,
    cableLength,
    cableSize,
    material,
    maxDropPercent,
  ]);

  // --- Calculate Minimum Cable Size ---
  const handleCalculateMinimumSize = () => {
    const vVal = parseFloat(supplyVoltage);
    const pVal = parseFloat(motorPower);
    const pfVal = parseFloat(powerFactor);
    const effVal = parseFloat(efficiency);
    const lengthVal = parseFloat(cableLength);
    const limitPct = parseFloat(maxDropPercent);

    if (isNaN(vVal) || isNaN(pVal) || isNaN(pfVal) || isNaN(effVal) || isNaN(lengthVal) || isNaN(limitPct)) {
      setRecommendationError('Please fill in all input parameters correctly before calculating.');
      setRecommendation(null);
      setShowRecommendation(true);
      return;
    }

    const pWatts = pVal * 1000;
    const effDecimal = effVal / 100;
    const denominator = Math.sqrt(3) * vVal * pfVal * effDecimal;
    const flc = pWatts / denominator;

    let foundSize: number | null = null;
    let foundResult = null;

    // Iterate through cable sizes smallest to largest
    for (const size of CABLE_SIZES) {
      const baseR = COPPER_RESISTANCE[size] || 0;
      const multiplierR = material === 'aluminium' ? 1.64 : 1.0;
      const finalR = baseR * multiplierR;

      const drop = (Math.sqrt(3) * lengthVal * flc * finalR) / 1000;
      const pct = (drop / vVal) * 100;

      if (pct <= limitPct) {
        foundSize = size;
        foundResult = {
          cableSize: size,
          voltageDrop: drop,
          percentageDrop: pct,
          finalVoltage: Math.max(0, vVal - drop),
          flc,
        };
        break;
      }
    }

    if (foundResult && foundSize) {
      setRecommendation(foundResult);
      setCableSize(foundSize);
      setRecommendationError(null);
    } else {
      setRecommendation(null);
      setRecommendationError(
        `No cable size in our standard database (up to 300 mm²) satisfies the ${limitPct}% maximum running voltage drop limit. Consider raising the system voltage or shortening the cable length.`
      );
    }
    setShowRecommendation(true);
  };

  // --- Starter Recommendation ---
  const starterGuidance = useMemo(() => {
    const pVal = parseFloat(motorPower) || 0;
    if (pVal <= 0) return null;

    let text = '';
    if (pVal <= 4.0) {
      text = 'Direct-On-Line (DOL) starting is typically suitable depending on the local electricity authority restrictions and site load.';
    } else if (pVal <= 15.0) {
      text = 'Star-Delta starting, an electronic Soft Starter, or a Variable Speed Drive (VSD) should be considered to reduce the inrush starting current.';
    } else {
      text = 'An electronic Soft Starter or a Variable Speed Drive (VSD) is highly preferred to prevent severe line voltage sags and protect mechanical components.';
    }

    return {
      text,
      note: 'Note: Final starter selection must consider local supply authority network rules, site distribution capacity, mechanical load torque profiles, starting cycle duty, and manufacturer equipment specifications.'
    };
  }, [motorPower]);

  // --- Auto Save Calculation to History ---
  useEffect(() => {
    if (!calculation.isValid) return;

    const payload = {
      type: 'three-phase-motor' as const,
      title: `Motor: ${motorPower}kW (${cableSize}mm² ${material === 'copper' ? 'Cu' : 'Al'})`,
      inputs: {
        supplyVoltage,
        motorPower,
        powerFactor,
        efficiency,
        startingMethod,
        startingMultiplier,
        cableLength,
        cableSize,
        material,
        maxDropPercent
      },
      results: {
        flc: calculation.flc,
        startingCurrent: calculation.startingCurrent,
        voltageDrop: calculation.voltageDrop,
        percentageDrop: calculation.percentageDrop,
        finalVoltage: calculation.finalVoltage,
        isCompliant: calculation.isCompliant
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
      console.error('Error auto-saving 3-phase motor calculation to history:', error);
    });
  }, [calculation, cableSize, material, supplyVoltage, motorPower, powerFactor, efficiency, startingMethod, startingMultiplier, cableLength, maxDropPercent]);

  // --- Share Calculation Summary ---
  const handleShare = () => {
    if (!calculation.isValid) return;

    const text = `
⚡ 3-PHASE MOTOR DESIGN REPORT ⚡
-----------------------------------------
Supply Voltage: ${supplyVoltage} V AC
Motor Power: ${motorPower} kW
Power Factor: ${powerFactor}
Efficiency: ${efficiency} %
Starting Method: ${startingMethod} (x${startingMultiplier})
Cable Length: ${cableLength} m
Selected Cable: ${cableSize} mm² (${material.toUpperCase()})
Permitted Drop: ${maxDropPercent} %

Calculated Outputs:
- Full Load Current (FLC): ${calculation.flc.toFixed(2)} A
- Estimated Starting Current: ${calculation.startingCurrent.toFixed(2)} A
- Running Voltage Drop: ${calculation.voltageDrop.toFixed(2)} V (${calculation.percentageDrop.toFixed(2)}%)
- Terminal Voltage: ${calculation.finalVoltage.toFixed(2)} V
- Status Check: ${calculation.isCompliant ? 'PASS ✅' : 'FAIL ❌'}

-----------------------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(text);
  };

  return (
    <div className="space-y-6">
      <div className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6">

        {/* Toggle Conductor Material */}
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

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Supply Voltage */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Supply Voltage (V)</label>
            <input
              type="number"
              inputMode="numeric"
              value={supplyVoltage}
              onChange={(e) => setSupplyVoltage(e.target.value)}
              placeholder="400"
              className={`w-full bg-black/40 border ${errors.supplyVoltage ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.supplyVoltage && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.supplyVoltage}</p>}
          </div>

          {/* Motor Power (kW) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Motor Power (kW)</label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={motorPower}
              onChange={(e) => setMotorPower(e.target.value)}
              placeholder="5.5"
              className={`w-full bg-black/40 border ${errors.motorPower ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.motorPower && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.motorPower}</p>}
          </div>

          {/* Power Factor (cos φ) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Power Factor (cos φ)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={powerFactor}
              onChange={(e) => setPowerFactor(e.target.value)}
              placeholder="0.80"
              className={`w-full bg-black/40 border ${errors.powerFactor ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.powerFactor && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.powerFactor}</p>}
          </div>

          {/* Efficiency (%) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Efficiency (%)</label>
            <input
              type="number"
              inputMode="numeric"
              value={efficiency}
              onChange={(e) => setEfficiency(e.target.value)}
              placeholder="90"
              className={`w-full bg-black/40 border ${errors.efficiency ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.efficiency && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.efficiency}</p>}
          </div>

          {/* Starting Method */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Starting Method</label>
            <div className="relative">
              <select
                value={startingMethod}
                onChange={(e) => setStartingMethod(e.target.value as StartingMethod)}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none cursor-pointer"
              >
                <option value="DOL" className="bg-hardware-card text-white">DOL (Direct-On-Line)</option>
                <option value="Star-Delta" className="bg-hardware-card text-white">Star-Delta</option>
                <option value="Soft Starter" className="bg-hardware-card text-white">Soft Starter</option>
                <option value="VSD" className="bg-hardware-card text-white">Variable Speed Drive (VSD)</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

          {/* Starting Multiplier (Overridable) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Inrush Multiplier (x FLC)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={startingMultiplier}
              onChange={(e) => setStartingMultiplier(e.target.value)}
              placeholder="6.0"
              className={`w-full bg-black/40 border ${errors.startingMultiplier ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.startingMultiplier && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.startingMultiplier}</p>}
          </div>

          {/* Cable Length (m) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cable Length (m)</label>
            <input
              type="number"
              inputMode="numeric"
              value={cableLength}
              onChange={(e) => setCableLength(e.target.value)}
              placeholder="50"
              className={`w-full bg-black/40 border ${errors.cableLength ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.cableLength && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.cableLength}</p>}
          </div>

          {/* Maximum Permitted Volt Drop (%) */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Permitted Running Drop (%)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={maxDropPercent}
              onChange={(e) => setMaxDropPercent(e.target.value)}
              placeholder="5.0"
              className={`w-full bg-black/40 border ${errors.maxDropPercent ? 'border-red-500' : 'border-hardware-border'} rounded-2xl px-4 py-4 text-white font-mono font-bold focus:border-emerald-500/50 transition-colors outline-none`}
            />
            {errors.maxDropPercent && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.maxDropPercent}</p>}
          </div>

          {/* Cable Size Selector */}
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Conductor Cross-Section (mm²)</label>
            <div className="relative">
              <select
                value={cableSize}
                onChange={(e) => setCableSize(parseFloat(e.target.value))}
                className="w-full bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white font-bold appearance-none focus:border-emerald-500/50 transition-colors outline-none cursor-pointer"
              >
                {CABLE_SIZES.map(size => (
                  <option key={size} value={size} className="bg-hardware-card text-white">
                    {size} mm² {material === 'copper' ? '(Copper)' : '(Aluminium)'}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
            </div>
          </div>

        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={handleCalculateMinimumSize}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            Calculate Minimum Cable Size
          </button>
        </div>

      </div>

      {/* Interactive Sizing Recommendation Modal */}
      <AnimatePresence>
        {showRecommendation && (
          <div className="safe-modal-shell fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRecommendation(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="safe-modal-panel relative w-full max-w-lg bg-hardware-card border border-hardware-border rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-7 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold">Cable Recommendation</h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Optimized design solution</p>
                </div>
                <button onClick={() => setShowRecommendation(false)} className="p-2 bg-white/5 rounded-full">
                  <X size={18} />
                </button>
              </div>

              {recommendationError ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 text-red-500">
                  <AlertTriangle size={20} className="shrink-0" />
                  <p className="text-sm font-medium leading-relaxed">{recommendationError}</p>
                </div>
              ) : recommendation ? (
                <div className="space-y-6">
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500">
                      <Cable size={24} />
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Recommended Size</p>
                      <h4 className="text-2xl font-black font-mono">{recommendation.cableSize} mm²</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Full Load Current (FLC)</p>
                      <p className="text-lg font-mono font-bold text-white">{recommendation.flc.toFixed(2)} A</p>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Terminal Voltage</p>
                      <p className="text-lg font-mono font-bold text-white">{recommendation.finalVoltage.toFixed(2)} V</p>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Voltage Drop (V)</p>
                      <p className="text-lg font-mono font-bold text-white">{recommendation.voltageDrop.toFixed(2)} V</p>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Voltage Drop (%)</p>
                      <p className="text-lg font-mono font-bold text-white text-emerald-400">{recommendation.percentageDrop.toFixed(2)} %</p>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 text-xs text-gray-400 leading-relaxed">
                    Setting the cable cross-section to <span className="font-bold text-emerald-400">{recommendation.cableSize} mm²</span> will ensure that running volt drop remains at <span className="font-bold text-emerald-400">{recommendation.percentageDrop.toFixed(2)}%</span>, well within the permitted limit.
                  </div>
                </div>
              ) : null}

              <button
                onClick={() => setShowRecommendation(false)}
                className="w-full mt-6 bg-white/5 hover:bg-white/10 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-colors"
              >
                Close Recommendation
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Results Section */}
      {calculation.isValid && (
        <div className="space-y-4">

          {/* Main Pass/Fail Banner */}
          <div className={`p-5 rounded-3xl border flex items-center justify-between ${
            calculation.isCompliant
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            <div className="flex items-center gap-3">
              {calculation.isCompliant ? (
                <CheckCircle2 size={24} className="shrink-0" />
              ) : (
                <AlertTriangle size={24} className="shrink-0" />
              )}
              <div>
                <p className="text-[8px] font-bold uppercase tracking-widest">Running Voltage Drop</p>
                <h4 className="text-lg font-black uppercase tracking-tight">
                  {calculation.isCompliant ? 'PASS - Limit Compliant' : 'FAIL - Limit Exceeded'}
                </h4>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-bold uppercase tracking-widest">Limit Set</p>
              <p className="text-sm font-mono font-bold">{parseFloat(maxDropPercent).toFixed(2)}%</p>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">

            {/* Full Load Current */}
            <div className="bg-hardware-card p-4 rounded-2xl border border-hardware-border flex flex-col gap-1">
              <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Full Load Current (FLC)</p>
              <p className="text-2xl font-mono font-black text-white">{calculation.flc.toFixed(2)} A</p>
            </div>

            {/* Estimated Starting Current */}
            <div className="bg-hardware-card p-4 rounded-2xl border border-hardware-border flex flex-col gap-1">
              <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Starting Current</p>
              <p className="text-2xl font-mono font-black text-white">{calculation.startingCurrent.toFixed(2)} A</p>
            </div>

            {/* Voltage Drop V */}
            <div className="bg-hardware-card p-4 rounded-2xl border border-hardware-border flex flex-col gap-1">
              <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Voltage Drop (V)</p>
              <p className="text-2xl font-mono font-black text-white">{calculation.voltageDrop.toFixed(2)} V</p>
            </div>

            {/* Voltage Drop % */}
            <div className={`bg-hardware-card p-4 rounded-2xl border border-hardware-border flex flex-col gap-1 ${calculation.isCompliant ? '' : 'border-red-500/20'}`}>
              <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Voltage Drop (%)</p>
              <p className={`text-2xl font-mono font-black ${calculation.isCompliant ? 'text-emerald-400' : 'text-red-400'}`}>
                {calculation.percentageDrop.toFixed(2)} %
              </p>
            </div>

            {/* Final Voltage */}
            <div className="col-span-2 bg-hardware-card p-4 rounded-2xl border border-hardware-border flex items-center justify-between">
              <div>
                <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Terminal Voltage at Motor</p>
                <p className="text-xl font-mono font-black text-white">{calculation.finalVoltage.toFixed(2)} V AC</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest font-sans">System Line Voltage</p>
                <p className="text-xs font-mono font-bold text-gray-400">{supplyVoltage} V</p>
              </div>
            </div>

          </div>

          {/* Motor Starter Recommendation Banner */}
          {starterGuidance && (
            <div className="bg-hardware-card p-5 rounded-3xl border border-hardware-border space-y-3">
              <div className="flex items-center gap-2 text-purple-400">
                <Cpu size={18} />
                <h5 className="font-bold text-xs uppercase tracking-wider">Motor Starter Recommendation</h5>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed font-sans">{starterGuidance.text}</p>
              <p className="text-[10px] text-gray-500 leading-relaxed italic">{starterGuidance.note}</p>
            </div>
          )}

          {/* Sharing Trigger */}
          <div className="pt-2">
            <button
              onClick={handleShare}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              <Share2 size={16} />
              Share Motor Report
            </button>
          </div>

        </div>
      )}

      {/* Disclaimers & Regulatory Notes */}
      <div className="p-4 bg-black/20 rounded-2xl border border-hardware-border space-y-2">
        <div className="flex items-center gap-1.5 text-gray-500">
          <Info size={14} />
          <span className="text-[9px] font-bold uppercase tracking-wider">Engineering Disclaimer</span>
        </div>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          This calculator provides estimated values for design assistance only. Final cable sizing, protection, volt drop, starting method and installation design must be verified against BS 7671, manufacturer data and site-specific conditions.
        </p>
      </div>

    </div>
  );
}
