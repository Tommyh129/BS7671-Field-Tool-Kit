import { CableType, CpcArrangement } from '../types';
import { CABLE_CONFIGURATIONS, CABLE_RESISTANCE } from '../constants';

const STANDARD_CPC_SIZES = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400];

const TWIN_AND_EARTH_CPC = new Map(
  CABLE_CONFIGURATIONS.map((configuration) => {
    const lineSize = Number.parseFloat(configuration.size.split('/')[0]);
    return [lineSize, Number.parseFloat(configuration.size.split('/')[1])] as const;
  })
);

export const getLineConductorResistance = (lineSize: number) => {
  return CABLE_RESISTANCE[lineSize] ?? null;
};

export const getStandardCpcSize = (lineSize: number) => {
  if (lineSize <= 16) return lineSize;
  if (lineSize <= 35) return 16;

  const minimumCpc = lineSize / 2;
  return STANDARD_CPC_SIZES.find((size) => size >= minimumCpc) ?? lineSize;
};

export const getIntegralCopperCpcSize = (cableType: CableType, lineSize: number) => {
  if (cableType === CableType.PVC_PVC) return TWIN_AND_EARTH_CPC.get(lineSize) ?? null;
  if ((cableType === CableType.PVC_SWA || cableType === CableType.XLPE_SWA) && lineSize >= 1.5 && getLineConductorResistance(lineSize) !== null) return lineSize;
  return null;
};

export const getArmouredCopperCpcSize = (cableType: CableType, lineSize: number, arrangement: CpcArrangement = 'separate', separateSize?: number) => {
  if (cableType !== CableType.PVC_SWA && cableType !== CableType.XLPE_SWA) return null;
  if (arrangement === 'integral') return getIntegralCopperCpcSize(cableType, lineSize);
  if (arrangement !== 'separate' || !separateSize || separateSize < Math.max(4, getStandardCpcSize(lineSize)) || getLineConductorResistance(separateSize) === null) return null;
  return separateSize;
};

export const getCircuitR1R2MilliOhmsPerMetre = (cableType: CableType, lineSize: number, separateCopperCpcSize?: number, arrangement: CpcArrangement = 'separate') => {
  if (cableType === CableType.PVC_PVC) {
    const cpcSize = TWIN_AND_EARTH_CPC.get(lineSize);
    if (cpcSize === undefined) return null;
    const line = getLineConductorResistance(lineSize);
    const cpc = getLineConductorResistance(cpcSize);
    return line === null || cpc === null ? null : line + cpc;
  }

  const armoured = cableType === CableType.PVC_SWA || cableType === CableType.XLPE_SWA;
  if (cableType !== CableType.PVC_SINGLE && !armoured) return null;

  const lineResistance = getLineConductorResistance(lineSize);
  if (lineResistance === null) return null;

  const cpcSize = armoured ? getArmouredCopperCpcSize(cableType, lineSize, arrangement, separateCopperCpcSize) : getStandardCpcSize(lineSize);
  if (cpcSize === null) return null;
  const cpcResistance = getLineConductorResistance(cpcSize);
  if (cpcResistance === null) return null;

  return lineResistance + cpcResistance;
};

export interface CopperCpcOptions {
  cpcArrangement?: CpcArrangement;
  separateCopperCpcSize?: number;
  autoSizeSeparateCpc?: boolean;
  lengthM?: number;
  ze?: number;
  maxZs?: number;
  resistanceMultiplier?: number;
}

export function resolveCopperCpcSize(cable: CableType, lineSize: number, options: CopperCpcOptions = {}): number | null {
  if (cable === CableType.PVC_PVC) return getIntegralCopperCpcSize(cable, lineSize);
  if (cable === CableType.PVC_SINGLE) return getStandardCpcSize(lineSize);
  if (options.cpcArrangement === 'integral') return getIntegralCopperCpcSize(cable, lineSize);
  if (!options.autoSizeSeparateCpc) return getArmouredCopperCpcSize(cable, lineSize, 'separate', options.separateCopperCpcSize);
  if (getLineConductorResistance(lineSize) === null) return null;
  const candidates = STANDARD_CPC_SIZES.filter(size => size >= Math.max(4, getStandardCpcSize(lineSize)) && getLineConductorResistance(size) !== null);
  const { lengthM, ze, maxZs, resistanceMultiplier = 1.2 } = options;
  if (!Number.isFinite(lengthM) || lengthM <= 0 || !Number.isFinite(ze) || ze < 0 || !Number.isFinite(maxZs) || maxZs <= 0) return candidates[0] ?? null;
  return candidates.find(size => ze + (getLineConductorResistance(lineSize)! + getLineConductorResistance(size)!) * lengthM * resistanceMultiplier / 1000 <= maxZs) ?? candidates[0] ?? null;
}

export type InspectionCpcModel = 'manual' | 'separate-auto' | 'integral' | 'twin-earth';
export function resolveInspectionCpcSize(model: InspectionCpcModel, lineSize: number, manualSize: number, options: CopperCpcOptions = {}) {
  if (model === 'manual') return getLineConductorResistance(manualSize) !== null ? manualSize : null;
  return resolveCopperCpcSize(model === 'twin-earth' ? CableType.PVC_PVC : CableType.PVC_SWA, lineSize, {
    ...options, cpcArrangement: model === 'integral' || model === 'twin-earth' ? 'integral' : 'separate', autoSizeSeparateCpc: model === 'separate-auto',
  });
}
