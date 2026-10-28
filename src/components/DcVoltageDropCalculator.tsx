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
import { getResistanceSizes, formatSourceNotes } from '../data/electrical';
import SourceNotes from './SourceNotes';
import RecalculateButton from './RecalculateButton';
import { dcCableDesign, type DcCableInputs } from '../utils/dcCable';

interface DcVoltageDropCalculatorProps {
  onShare: (text: string) => void;
}

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
  const [loadMode, setLoadMode] = useState<'current' | 'power'>('current');
  const [loadPower, setLoadPower] = useState('240');
  const [resistanceModel, setResistanceModel] = useState<'table' | 'workbook'>('table');
  const [temperature, setTemperature] = useState('20');
  const [useCurrentDensity, setUseCurrentDensity] = useState(true);
  const [currentDensity, setCurrentDensity] = useState('6');
  const [deratingFactor, setDeratingFactor] = useState('1');
  const [minimumSize, setMinimumSize] = useState(1);

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
      return Number(customVoltage);
    }
    return Number(voltageType);
  }, [voltageType, customVoltage]);

  // Resolve Max Permitted Percentage
  const maxDropPercent = useMemo(() => {
    if (maxDropType === 'custom') {
      return Number(customMaxDrop);
    }
    return Number(maxDropType);
  }, [maxDropType, customMaxDrop]);

  // Resolve Resistance Value
  const cableSizes = getResistanceSizes(material);
  const sourceIds = ['dc-workbook', ...(resistanceModel === 'table' ? [`resistance-${material}`] : [])];
  const designInputs: DcCableInputs = {
    voltage:systemVoltage, loadMode, load:Number(loadMode==='power'?loadPower:loadCurrent), length:Number(cableLength),
    material, resistanceModel, temperature:Number(temperature.trim() || 'NaN'), maxDropPercent,
    currentDensity:useCurrentDensity?Number(currentDensity):null, deratingFactor:Number(deratingFactor), minimumSize,
  };
  const designKey = JSON.stringify(designInputs);

  const calculation = useMemo(() => {
    try {
      return {...dcCableDesign(designInputs, cableSize, autoSelect), isValid:true, error:null};
    } catch (error) {
      return {isValid:false, error:error instanceof Error?error.message:'Invalid DC design inputs.',
        current:0,cableSize,unitResistance:0,temperatureFactor:0,allowedDrop:0,voltageDrop:0,percentageDrop:0,finalVoltage:0,
        minimumVoltageArea:null,minimumVoltageSize:null,minimumCurrentArea:null,requiredMinimumArea:null,densityCapacity:null,
        suggestedSize:null,voltagePass:false,densityPass:false,isCompliant:false};
    }
  }, [designKey, cableSize, autoSelect]);
  const suggestedCableSize = calculation.suggestedSize;
  const unitResistance = calculation.unitResistance;
  const displayedCableSize = calculation.cableSize;
  const assumptions = [
    `One-way length; equal two-conductor DC loop; conductor temperature ${temperature} deg C; ${resistanceModel==='workbook'?'idealised copper rho20=0.0175 ohm mm2/m':'recorded 20 deg C resistance rows with temperature correction'}.`,
    useCurrentDensity?`Preliminary current-density check: J=${currentDensity} A/mm2, K=${deratingFactor}; not a manufacturer/BS 7671 ampacity rating.`:'Current-carrying capacity not assessed.',
    `Minimum available size ${minimumSize} mm2. User-selected voltage-drop target, not verified DC regulatory compliance.`,
    'P/V uses power at supply voltage. Constant-power load regulation, source sag, joints, unequal returns, fault protection and installation ampacity require separate assessment.',
  ];

  // Sync suggested size when autoSelect is true
  useEffect(() => {
    if (autoSelect && suggestedCableSize !== null) {
      setCableSize(suggestedCableSize);
    }
  }, [autoSelect, suggestedCableSize]);

  useEffect(() => {
    setRecommendation(null);
    setShowRecommendation(false);
  }, [designKey]);

  // Handler to find the smallest compliant cable size
  const handleCalculateMinimumSize = () => {
    setAutoSelect(true);
    try {
      const next = dcCableDesign(designInputs, cableSize, true);
      if (next.suggestedSize===null) throw Error('No available size up to 400 mm2 meets every selected design check.');
      setRecommendation({...next,resistance:next.unitResistance});
      setCableSize(next.cableSize);
      setRecommendationError(null);
    } catch (error) {
      setRecommendation(null);
      setRecommendationError(error instanceof Error?error.message:'Check the DC design inputs.');
    }
    setShowRecommendation(true);
  };

  // Auto save calculation parameters to History service
  useEffect(() => {
    if (!calculation.isValid) return;

    const payload = {
      type: 'dc_voltage_drop' as const,
      title: `DC Drop: ${calculation.percentageDrop.toFixed(2)}% (${displayedCableSize}mm²)`,
      inputs: {
        voltageType,
        customVoltage,
        loadCurrent:String(calculation.current),
        loadMode, loadPower, resistanceModel, temperature, useCurrentDensity, currentDensity, deratingFactor, minimumSize,
        cableLength,
        material,
        cableSize:displayedCableSize,
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
        unitResistance,
        current:calculation.current, minimumVoltageArea:calculation.minimumVoltageArea, minimumVoltageSize:calculation.minimumVoltageSize,
        minimumCurrentArea:calculation.minimumCurrentArea, requiredMinimumArea:calculation.requiredMinimumArea,
        densityCapacity:calculation.densityCapacity, voltagePass:calculation.voltagePass, densityPass:calculation.densityPass,
        calculationVersion:'dc-workbook-v1', assumptions,
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
  }, [calculation, designKey, voltageType, customVoltage, maxDropType, customMaxDrop]);

  // Share calculation summary text
  const handleShare = () => {
    if (!calculation.isValid) return;
    const text = `
⚡ DC VOLTAGE DROP & CABLE SIZING REPORT ⚡
-----------------------------------------
System Nominal Voltage: ${systemVoltage} V DC
Load Current: ${calculation.current.toFixed(4)} A${loadMode==='power'?` (from ${loadPower} W at supply voltage)`:''}
One-way Cable Length: ${cableLength} m
Conductor Material: ${material.toUpperCase()}
Selected Cable Size: ${displayedCableSize} mm²
Max Permitted Drop: ${maxDropPercent} %

Calculated Outputs:
- Cable Resistance: ${unitResistance} mΩ/m
- Calculated Voltage Drop: ${calculation.voltageDrop.toFixed(2)} V
- Percentage Voltage Drop: ${calculation.percentageDrop.toFixed(2)} %
- Final Voltage at Load: ${calculation.finalVoltage.toFixed(2)} V
- Selected design checks: ${calculation.isCompliant ? 'MET' : 'NOT MET'} (not BS 7671 certification)
- Minimum area from current density: ${calculation.minimumCurrentArea?.toFixed(4) ?? 'Not assessed'} mm2
- Minimum available size for voltage drop: ${calculation.minimumVoltageSize ?? 'None'} mm2

${recommendation ? `
Optimal Cable Recommendation:
- Smallest Size Meeting Selected Checks: ${recommendation.cableSize} mm²
- Recommended Drop: ${recommendation.voltageDrop.toFixed(2)} V (${recommendation.percentageDrop.toFixed(2)}%)
- Recommended Load Voltage: ${recommendation.finalVoltage.toFixed(2)} V
` : ''}
-----------------------------------------
Calculated via The Sparkys Mate
    `.trim();
    onShare(`${text}\n\n${formatSourceNotes(sourceIds, assumptions)}`);
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

      const reportHeight = Math.max(600, 400 * pdfRef.current.scrollHeight / pdfRef.current.offsetWidth);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [400, reportHeight]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, 400, reportHeight);
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
      <SourceNotes ids={sourceIds} assumptions={assumptions} />
      <RecalculateButton inputKey={JSON.stringify([designKey,cableSize,autoSelect])} onRecalculate={handleCalculateMinimumSize} message={calculation.isValid ? suggestedCableSize!==null ? 'Recalculated using the voltage-drop target and any enabled current-density check. Installation ampacity and protection still require verification.' : 'No available size meets every selected design check.' : 'No valid DC result for these inputs.'} />
      <div className="bg-hardware-card rounded-3xl border border-hardware-border p-5 sm:p-6 space-y-6">

        {/* Toggle Material */}
        <div className="flex bg-black/40 p-1 rounded-2xl border border-hardware-border">
          <button
            onClick={() => {if(material!=='copper')setCurrentDensity('6');setMaterial('copper');}}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              material === 'copper' ? 'bg-emerald-500 text-black shadow-lg font-black' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Copper (Cu)
          </button>
          <button
            onClick={() => {setMaterial('aluminium');setResistanceModel('table');setCurrentDensity('');setUseCurrentDensity(false);}}
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

          <div className="md:col-span-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="dc-load-mode" checked={loadMode==='current'} onChange={()=>setLoadMode('current')}/>Current input (A)</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="dc-load-mode" checked={loadMode==='power'} onChange={()=>setLoadMode('power')}/>Power at supply voltage (W)</label>
          </div>
          {/* Load Current (Ib) */}
          <div>
            <label htmlFor="dc-load" className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">{loadMode==='power'?'Load Power (Watts at supply voltage)':'Load Current (Amps)'}</label>
            <input
              id="dc-load"
              type="number"
              inputMode="decimal"
              value={loadMode==='power'?loadPower:loadCurrent}
              onChange={(e) => loadMode==='power'?setLoadPower(e.target.value):setLoadCurrent(e.target.value)}
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
                value={displayedCableSize}
                onChange={(e) => {
                  setCableSize(parseFloat(e.target.value));
                  setAutoSelect(false);
                }}
                className={`w-full bg-black/40 border rounded-2xl px-4 py-4 text-white font-mono font-bold appearance-none focus:border-emerald-500/50 transition-all outline-none cursor-pointer ${
                  autoSelect ? 'border-emerald-500/30 text-emerald-400' : 'border-hardware-border'
                }`}
              >
                {!cableSizes.includes(cableSize) && <option value={cableSize} disabled>{cableSize} mm2 - no recorded {material} row</option>}
                {cableSizes.filter(size=>size<=400).map(size => (
                  <option key={size} value={size} className="bg-hardware-card text-white font-mono">
                    {size} mm²
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
                <option value="3" className="bg-hardware-card text-white">3% design target</option>
                <option value="5" className="bg-hardware-card text-white">5% design target</option>
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

        <div className="border-t border-hardware-border pt-5 space-y-4">
          <h3 className="text-sm font-bold">DC Design Assumptions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
            <div className="min-w-0">
              <label htmlFor="dc-resistance-model" className="block text-xs text-gray-400 mb-2">Resistance basis</label>
              <select id="dc-resistance-model" value={resistanceModel} onChange={e=>setResistanceModel(e.target.value as 'table'|'workbook')} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-lg p-3 text-sm">
                <option value="table">Recorded resistance at 20 C</option>
                {material==='copper' && <option value="workbook">Workbook copper resistivity (0.0175)</option>}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="dc-minimum-size" className="block text-xs text-gray-400 mb-2">Minimum available cable size (mm²)</label>
              <select id="dc-minimum-size" value={minimumSize} onChange={e=>setMinimumSize(Number(e.target.value))} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-lg p-3 text-sm">
                {[1,1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300,400].map(size=><option value={size} key={size}>{size} mm²</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dc-temperature" className="block text-xs text-gray-400 mb-2">Conductor temperature (°C)</label>
              <input id="dc-temperature" type="number" inputMode="decimal" min={-20} max={90} value={temperature} onChange={e=>setTemperature(e.target.value)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-lg p-3 text-sm"/>
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={useCurrentDensity} onChange={e=>setUseCurrentDensity(e.target.checked)}/>Include preliminary current-density sizing</label>
          {useCurrentDensity && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dc-current-density" className="block text-xs text-gray-400 mb-2">Design current density J (A/mm²)</label>
              <input id="dc-current-density" type="number" inputMode="decimal" min="0" step="any" value={currentDensity} onChange={e=>setCurrentDensity(e.target.value)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-lg p-3 text-sm"/>
            </div>
            <div>
              <label htmlFor="dc-derating" className="block text-xs text-gray-400 mb-2">Combined derating factor K (0 &lt; K ≤ 1)</label>
              <input id="dc-derating" type="number" inputMode="decimal" min="0" max="1" step="any" value={deratingFactor} onChange={e=>setDeratingFactor(e.target.value)} className="w-full min-w-0 bg-black/40 border border-hardware-border rounded-lg p-3 text-sm"/>
            </div>
          </div>}
          <p className="text-xs text-amber-300 leading-relaxed">Preliminary sizing only. J = 6 A/mm² is the workbook's copper assumption, not a cable rating. Verify the selected cable's installation ampacity, DC protection, insulation and termination temperature limits. Power input uses P/V at supply voltage, not a regulated constant-power load model.</p>
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
                      <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest">Smallest Size Meeting Design Checks</p>
                      <p className="text-2xl font-mono font-black text-white mt-1">
                        {recommendation.cableSize} <span className="text-xs font-sans font-normal text-gray-400">mm²</span>
                      </p>
                      <button
                        onClick={() => {
                          setCableSize(recommendation.cableSize);
                          setAutoSelect(true);
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
                        <p className="text-[8px] text-gray-500 font-mono">Two-conductor DC loop</p>
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
            <SourceNotes ids={sourceIds} expanded assumptions={assumptions} />
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-mono text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Voltage Drop Results</h3>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{displayedCableSize} mm² {material === 'copper' ? 'Copper' : 'Aluminium'} Conductor</span>
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
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-hardware-border pt-4 text-sm">
              <div><dt className="text-xs text-gray-400">Design current</dt><dd className="font-mono mt-1">{calculation.current.toFixed(4)} A{loadMode==='power'?` (${loadPower} W / ${systemVoltage} V)`:''}</dd></div>
              <div><dt className="text-xs text-gray-400">Conductor resistance at {temperature} °C</dt><dd className="font-mono mt-1">{unitResistance.toFixed(5)} mΩ/m</dd></div>
              <div><dt className="text-xs text-gray-400">Minimum available size for voltage drop</dt><dd className="font-mono mt-1">{calculation.minimumVoltageSize!==null?`${calculation.minimumVoltageSize} mm²`:'None up to 400 mm²'}</dd></div>
              <div><dt className="text-xs text-gray-400">Minimum area from current density</dt><dd className="font-mono mt-1">{calculation.minimumCurrentArea!==null?`${calculation.minimumCurrentArea.toFixed(4)} mm²`:'Not assessed'}</dd></div>
              {calculation.minimumVoltageArea!==null && <div><dt className="text-xs text-gray-400">Workbook voltage-drop area</dt><dd className="font-mono mt-1">{calculation.minimumVoltageArea.toFixed(4)} mm²</dd></div>}
              {calculation.requiredMinimumArea!==null && <div><dt className="text-xs text-gray-400">Combined minimum before size rounding</dt><dd className="font-mono mt-1">{calculation.requiredMinimumArea.toFixed(4)} mm²</dd></div>}
              {calculation.densityCapacity!==null && <div><dt className="text-xs text-gray-400">Current-density allowance (not rated ampacity)</dt><dd className="font-mono mt-1">{calculation.densityCapacity.toFixed(2)} A</dd></div>}
            </dl>
            {suggestedCableSize === null && (
              <div className="p-4 rounded-2xl border bg-red-500/10 border-red-500/20 text-red-400 flex gap-3.5">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1 flex-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
                    Sizing Alert: Limit Exceeded
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    No available {material} size up to 400 mm² meets every selected design check. No larger size is invented.
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
                    {calculation.isCompliant ? 'Selected Checks Met' : 'Selected Checks Not Met'}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold font-mono">
                    Limit: {maxDropPercent}% ({((maxDropPercent / 100) * systemVoltage).toFixed(2)} V)
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">
                  Voltage-drop target: {calculation.voltagePass?'met':'not met'}. {useCurrentDensity?`Current-density assumption: ${calculation.densityPass?'met':'not met'}.`:'Current capacity not assessed.'} This is not a BS 7671 compliance assessment.
                  {displayedCableSize<minimumSize && ' Selected cable is below the minimum available size.'}
                  {calculation.finalVoltage<=0 && ' The assumed current would exhaust the supply voltage. The actual load cannot operate as modelled.'}
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
                  <p>• I (Current) = {calculation.current.toFixed(4)} A</p>
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
          <div aria-hidden="true" className="fixed -left-[10000px] top-0 pointer-events-none">
            <div ref={pdfRef} style={{ width: '400px', minHeight: '600px', padding: '40px', backgroundColor: '#ffffff', color: '#151619' }} className="space-y-8 font-sans">
              <SourceNotes ids={sourceIds} expanded assumptions={assumptions} />
              <div className="border-b-2 border-emerald-500 pb-4">
                <h1 className="text-2xl font-black tracking-tight uppercase">DC Cable Design Estimate</h1>
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
                    <p className="text-xs font-bold font-mono text-black mt-0.5">{calculation.current.toFixed(4)} A{loadMode==='power'?` (${loadPower} W at supply voltage)`:''}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Cable Specifications</p>
                    <p className="text-xs font-bold text-black mt-0.5 font-mono">{displayedCableSize} mm² ({material.toUpperCase()})</p>
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
                  <p className="text-[8px] text-gray-500 font-mono">Selected checks: {calculation.isCompliant ? 'MET' : 'NOT MET'}; not compliance certification</p>
                </div>
                <p className="text-[10px] text-gray-700">Voltage-drop minimum available size: {calculation.minimumVoltageSize??'None'} mm². Current-density minimum area: {calculation.minimumCurrentArea?.toFixed(4)??'Not assessed'} mm². Combined unrounded area: {calculation.requiredMinimumArea?.toFixed(4)??'Use discrete resistance rows'}.</p>
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
