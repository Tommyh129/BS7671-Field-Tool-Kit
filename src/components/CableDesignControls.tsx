import React from 'react';
import { CableType, CpcArrangement } from '../types';
import { CircuitOptions } from '../utils/calculations';
import { getResistanceSizes } from '../data/electrical';
import { InspectionCpcModel } from '../utils/resistance';

const controlClass = 'w-full min-w-0 bg-black/40 border border-hardware-border rounded-2xl px-4 py-4 text-white outline-none text-sm';
const labelClass = 'text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block';

export default function CableDesignControls({ cable, value, onChange, temperatureOnly = false }: { cable: CableType; value: CircuitOptions; onChange: (value: CircuitOptions) => void; temperatureOnly?: boolean }) {
  const armoured = cable === CableType.PVC_SWA || cable === CableType.XLPE_SWA;
  return <div className="space-y-4">
    {cable === CableType.XLPE_SWA && <label className={labelClass}>Conductor Operating Limit
      <select aria-label="Conductor Operating Limit" className={controlClass} value={value.operatingTemperature ?? 70} onChange={e => onChange({ ...value, operatingTemperature: Number(e.target.value) as 70 | 90 })}>
        <option value={70}>70C - standard equipment limit (4D4)</option><option value={90}>90C - equipment manufacturer confirmed (4E4)</option>
      </select>
    </label>}
    {armoured && !temperatureOnly && <>
      <label className={labelClass}>CPC Arrangement
        <select aria-label="CPC Arrangement" className={controlClass} value={value.cpcArrangement ?? 'separate'} onChange={e => onChange({ ...value, cpcArrangement: e.target.value as CpcArrangement })}>
          <option value="separate">Separate copper CPC</option><option value="integral">Integral copper CPC (full-size core)</option>
        </select>
      </label>
      {value.cpcArrangement !== 'integral' && <label className={labelClass}>Separate Copper CPC (mm2; matching insulation)
        <select aria-label="Separate Copper CPC" className={controlClass} value={value.autoSizeSeparateCpc !== false ? '' : value.separateCopperCpcSize ?? ''} onChange={e => onChange({ ...value, autoSizeSeparateCpc: e.target.value === '', separateCopperCpcSize: e.target.value === '' ? undefined : Number(e.target.value) })}>
          <option value="">Automatic (recommended)</option>{getResistanceSizes('copper').filter(size => size >= 4 && size <= 400).map(size => <option key={size} value={size}>{size} mm2</option>)}
        </select>
      </label>}
    </>}
  </div>;
}

export function InspectionCpcControl({ value, onChange }: { value: InspectionCpcModel; onChange: (value: InspectionCpcModel) => void }) {
  return <label className={labelClass}>Copper CPC Model
    <select aria-label="Copper CPC Model" className={controlClass} value={value} onChange={e => onChange(e.target.value as InspectionCpcModel)}>
      <option value="manual">Actual installed size (manual)</option><option value="separate-auto">Separate copper CPC (automatic design)</option><option value="integral">Integral copper core (full-size)</option><option value="twin-earth">Twin-and-earth (factory CPC)</option>
    </select>
  </label>;
}
