import { CableType, CpcArrangement, DeviceType, InstallationMethod, SupplyType } from '../types';
import { DEVICE_LIMITS } from '../constants';
import { getCableRows, getDeviceRatings } from '../data/electrical';
import { getCircuitR1R2MilliOhmsPerMetre, resolveCopperCpcSize } from './resistance';
import { CircuitOptions, getCircuitInputIssue } from './calculations';

export function calculateMaxLength(cable: CableType, size: number, method: InstallationMethod, supply: SupplyType, device: DeviceType, rating: number, ze: number, load: number, vdPercent: number, length: number | undefined, options: CircuitOptions) {
  const failure = (error: string) => ({ error, maxLen: 0, maxLenZs: 0, maxLenVD: 0, isCompliant: false, limitingFactor: 'Unsupported inputs', cpcSize: null as number | null, cpcArrangement: null as CpcArrangement | null, assumptions: [] as string[] });
  if (![size,ze,load,vdPercent].every(Number.isFinite) || ze < 0 || load <= 0 || vdPercent <= 0 || load > rating || (length !== undefined && (!Number.isFinite(length) || length <= 0))) return failure('Enter valid positive inputs and an adequate device rating.');
  if (!getDeviceRatings(device).includes(rating)) return failure('No supported device rating.');
  const issue = getCircuitInputIssue(cable,method,supply,30,1,device,options);
  if (issue) return failure(issue);
  const row = getCableRows(cable,method,supply,options.operatingTemperature).find(row => row.size === size);
  if (!row) return failure('No rating/voltage-drop row for this cable, size, method and phase.');
  const voltage = supply === SupplyType.SINGLE_PHASE ? 230 : 400;
  const maxLenVD = vdPercent / 100 * voltage * 1000 / (row.mvAm * load);
  const multiplier = row.operatingTemperature === 90 ? 1.28 : 1.2;
  const maxZs = DEVICE_LIMITS[device][rating];
  const cpcSize = resolveCopperCpcSize(cable,size,{...options,lengthM:length ?? maxLenVD,ze,maxZs,resistanceMultiplier:multiplier});
  const armoured = cable === CableType.PVC_SWA || cable === CableType.XLPE_SWA;
  const resistance = getCircuitR1R2MilliOhmsPerMetre(cable,size,armoured ? cpcSize ?? undefined : undefined,options.cpcArrangement);
  if (!resistance || !cpcSize) return failure('No supported copper CPC for the selected line size and arrangement.');
  const maxLenZs = Math.max(0,(maxZs-ze) * 1000 / (resistance * multiplier));
  const maxLen = Math.min(maxLenZs,maxLenVD);
  const capacityPasses = row.capacity[method] >= rating;
  return { error:null, maxLen,maxLenZs,maxLenVD,cpcSize, cpcArrangement: cable === CableType.PVC_PVC ? 'integral' as const : options.cpcArrangement ?? 'separate',
    isCompliant:capacityPasses && maxLen > 0 && (length === undefined || length <= maxLen),
    limitingFactor:!capacityPasses ? 'Current capacity' : maxLenZs < maxLenVD ? 'Zs Limit' : 'Voltage Drop',
    assumptions:[`${row.ratingTable}; rating column ${row.capacityColumn}; voltage-drop column ${row.voltageDropColumn}; ${row.loadedConductors} loaded; run at ${row.operatingTemperature}C.`,
      `${cpcSize}mm2 copper CPC; ${cable === CableType.PVC_PVC ? 'factory integral pairing' : options.cpcArrangement === 'integral' ? 'dedicated integral full-size core' : options.autoSizeSeparateCpc ? 'automatic separate sizing' : 'separate copper sizing'}; armour not counted.`,
      length === undefined ? 'Automatic CPC targets the voltage-drop-limited length; line size remains the selected fixed size.' : 'CPC selected for the entered length; recalculation may recommend a larger line size.',
      'Reference ambient/ground conditions; same insulation/fault-temperature characteristics; verify bonding, fault withstand, residual protection and manufacturer suitability.'],
  };
}
