import { CableType } from '../types';
import { CABLE_CONFIGURATIONS, CABLE_RESISTANCE } from '../constants';

const STANDARD_CPC_SIZES = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

const TWIN_AND_EARTH_R1_R2 = new Map(
  CABLE_CONFIGURATIONS.map((configuration) => {
    const lineSize = Number.parseFloat(configuration.size.split('/')[0]);
    return [lineSize, configuration.resistance] as const;
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

export const getCircuitR1R2MilliOhmsPerMetre = (cableType: CableType, lineSize: number) => {
  if (cableType === CableType.PVC_PVC) {
    const twinAndEarthResistance = TWIN_AND_EARTH_R1_R2.get(lineSize);
    if (twinAndEarthResistance !== undefined) return twinAndEarthResistance;
  }

  const lineResistance = getLineConductorResistance(lineSize);
  if (lineResistance === null) return null;

  const cpcSize = cableType === CableType.PVC_SINGLE ? getStandardCpcSize(lineSize) : lineSize;
  const cpcResistance = getLineConductorResistance(cpcSize);
  if (cpcResistance === null) return null;

  return lineResistance + cpcResistance;
};
