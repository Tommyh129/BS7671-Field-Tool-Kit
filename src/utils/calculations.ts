import { SupplyType, InstallationMethod, CalculationResult, CircuitType, CableType, DeviceType, CpcArrangement } from '../types';
import { VOLTAGES, DEVICE_LIMITS } from '../constants';
import { getCableRows, getCombinationIssue, getCorrectionFactors, getDeviceRatings, getSourceIdsForTool, DESIGN_RESISTANCE_MULTIPLIER } from '../data/electrical';
import { getCircuitR1R2MilliOhmsPerMetre, getStandardCpcSize, getLineConductorResistance, getIntegralCopperCpcSize, resolveCopperCpcSize } from './resistance';

export interface CircuitOptions {
  operatingTemperature?: 70 | 90;
  separateCopperCpcSize?: number;
  cpcArrangement?: CpcArrangement;
  autoSizeSeparateCpc?: boolean;
}

export function suggestDeviceType(
  loadCurrent: number,
  supplyType: SupplyType,
  circuitType: CircuitType,
  ze: number
): DeviceType {
  // If Three Phase, Type C is preferred (highly standard for three-phase commercial/industrial motors and loads)
  if (supplyType === SupplyType.THREE_PHASE) {
    return DeviceType.MCB_C;
  }

  // If Lighting, Type B or Type C can be suggested.
  // Modern lighting circuits use LEDs with high inrush currents, making Type C recommended.
  // But on longer runs or high Ze, Type B is suggested to avoid huge cables due to Zs.
  if (circuitType === CircuitType.LIGHTING) {
    if (ze > 0.8) {
      return DeviceType.MCB_B;
    }
    return DeviceType.MCB_C;
  }

  // Otherwise, default to Type B for domestic/light commercial sockets/other loads.
  return DeviceType.MCB_B;
}

export function calculateCircuit(
  loadKw: number,
  lengthM: number,
  supplyType: SupplyType,
  method: InstallationMethod,
  cableType: CableType = CableType.PVC_PVC,
  circuitType: CircuitType = CircuitType.OTHER,
  ambientTemp: number = 30,
  groupingCount: number = 1,
  ze: number = 0.35,
  deviceType?: DeviceType,
  protectiveDeviceOverride?: number,
  options: CircuitOptions = {}
): CalculationResult | null {
  if (![loadKw, lengthM, ze].every(Number.isFinite) || loadKw <= 0 || lengthM <= 0 || ze < 0) return null;
  if (getCircuitInputIssue(cableType, method, supplyType, ambientTemp, groupingCount, deviceType, options)) return null;

  const operatingTemperature = cableType === CableType.XLPE_SWA ? options.operatingTemperature ?? 70 : 70;
  const armoured = cableType === CableType.PVC_SWA || cableType === CableType.XLPE_SWA;
  const cableSizes = getCableRows(cableType, method, supplyType, operatingTemperature);
  if (!cableSizes.length) return null;

  // 1. Convert load in kW to watts
  const powerWatts = loadKw * 1000;

  // 2. Calculate current (I)
  let loadCurrent: number;
  if (supplyType === SupplyType.SINGLE_PHASE) {
    loadCurrent = powerWatts / VOLTAGES.SINGLE_PHASE;
  } else {
    loadCurrent = powerWatts / (Math.sqrt(3) * VOLTAGES.THREE_PHASE * 0.9);
  }

  // Determine suggested and active device types
  const suggestedDeviceType = suggestDeviceType(loadCurrent, supplyType, circuitType, ze);
  const activeDeviceType = deviceType !== undefined ? deviceType : suggestedDeviceType;

  // 3. Select Protective Device (In)
  // For MCBs we use standard ratings, for others we might need to filter by available ratings in DEVICE_LIMITS
  const availableRatings = getDeviceRatings(activeDeviceType);
  const suggestedDevice = availableRatings.find((d) => d >= loadCurrent);
  if (suggestedDevice === undefined) return null;
  if (protectiveDeviceOverride !== undefined && !availableRatings.includes(protectiveDeviceOverride)) return null;
  const protectiveDevice = protectiveDeviceOverride ?? suggestedDevice;
  if (protectiveDevice < loadCurrent) return null;

  // 4. Apply Correction Factors
  // Ca (Ambient Temp) and Cg (Grouping)
  const totalCorrection = getCorrectionFactors(cableType, ambientTemp, groupingCount, operatingTemperature).value;
  if (totalCorrection === null) return null;

  // 5. Choose cable size based on current capacity table
  // Iz >= In / (Ca * Cg) and Iz >= Ib / (Ca * Cg)
  const requiredCapacity = Math.max(protectiveDevice, loadCurrent) / totalCorrection;
  const maxZs = DEVICE_LIMITS[activeDeviceType][protectiveDevice] || 0;
  const resistanceMultiplier = operatingTemperature === 90 ? 1.28 : DESIGN_RESISTANCE_MULTIPLIER;
  const autoSeparateCpc = armoured && options.cpcArrangement !== 'integral' && options.autoSizeSeparateCpc === true;
  const resolvedCpcs = new Map<number, number | null>();
  const getCpcForCable = (lineSize: number): number | null => {
    if (resolvedCpcs.has(lineSize)) return resolvedCpcs.get(lineSize)!;
    const selected = resolveCopperCpcSize(cableType, lineSize, { ...options, lengthM, ze, maxZs, resistanceMultiplier });
    resolvedCpcs.set(lineSize, selected);
    return selected;
  };
  const cpcAllows = (size: number) => !armoured || getCpcForCable(size) !== null;
  let selectedCable = cableSizes.find((c) => c.capacity[method] >= requiredCapacity && cpcAllows(c.size));

  if (!selectedCable) return null;

  // 6. Calculate voltage drop (Vd)
  const voltage = supplyType === SupplyType.SINGLE_PHASE ? VOLTAGES.SINGLE_PHASE : VOLTAGES.THREE_PHASE;
  const limitPercentage = circuitType === CircuitType.LIGHTING ? 3 : 5;

  const getVd = (cable: any) => {
    return (cable.mvAm * loadCurrent * lengthM) / 1000;
  };
  const getVdPercent = (vd: number) => (vd / voltage) * 100;

  // 7. Calculate Zs
  const getZs = (cable: any) => {
    const resistanceMOhms = getCircuitR1R2MilliOhmsPerMetre(cableType, cable.size, armoured ? getCpcForCable(cable.size) ?? undefined : undefined, options.cpcArrangement);
    if (resistanceMOhms === null) return Number.POSITIVE_INFINITY;
    // Declared legacy approximation; source notes distinguish this from field testing.
    const r1r2 = (resistanceMOhms * lengthM * resistanceMultiplier) / 1000;
    return ze + r1r2;
  };

  // Try to find a cable that satisfies both Voltage Drop and Zs
  let finalCable = selectedCable;
  let finalVd = getVd(finalCable);
  let finalVdPercent = getVdPercent(finalVd);
  let finalZs = getZs(finalCable);

  let vdCompliant = finalVdPercent <= limitPercentage;
  let zsCompliant = finalZs <= maxZs;
  let finalIsCompliant = vdCompliant && zsCompliant;

  if (!finalIsCompliant) {
    const currentIndex = cableSizes.indexOf(selectedCable);
    // Find the SMALLEST cable that is compliant
    const compliantCable = cableSizes.slice(currentIndex + 1).find(nextCable => {
      const nextVd = getVd(nextCable);
      const nextVdPercent = getVdPercent(nextVd);
      const nextZs = getZs(nextCable);

      return nextCable.capacity[method] >= requiredCapacity && cpcAllows(nextCable.size) && nextVdPercent <= limitPercentage && nextZs <= maxZs;
    });

    if (compliantCable) {
      finalCable = compliantCable;
      finalVd = getVd(finalCable);
      finalVdPercent = getVdPercent(finalVd);
      finalZs = getZs(finalCable);
      vdCompliant = true;
      zsCompliant = true;
      finalIsCompliant = true;
    } else {
      // If NO cable is compliant, we stay with the capacity-based selection
      // rather than jumping to 400mm which also isn't compliant.
      // This provides a more "appropriate" starting point for the user to troubleshoot.
      finalCable = selectedCable;
      finalVd = getVd(finalCable);
      finalVdPercent = getVdPercent(finalVd);
      finalZs = getZs(finalCable);
      vdCompliant = finalVdPercent <= limitPercentage;
      zsCompliant = finalZs <= maxZs;
      finalIsCompliant = false;
    }
  }

  // 8. Calculate CPC Size for Single Core
  let cpcSize: number | undefined = undefined;
  if (cableType === CableType.PVC_SINGLE) {
    cpcSize = getStandardCpcSize(finalCable.size);
  }
  if (cableType === CableType.PVC_PVC) cpcSize = getIntegralCopperCpcSize(cableType, finalCable.size) ?? undefined;
  if (armoured) cpcSize = getCpcForCable(finalCable.size) ?? undefined;
  const cpcArrangement = cableType === CableType.PVC_PVC ? 'integral' : armoured ? options.cpcArrangement ?? 'separate' : 'separate';

  return {
    sourceVerified: false,
    dataSourceIds: getSourceIdsForTool('circuit', cableType),
    ratingTable: finalCable.ratingTable,
    capacityColumn: finalCable.capacityColumn,
    voltageDropColumn: finalCable.voltageDropColumn,
    assumptions: [
      `${finalCable.ratingTable}; rating column ${finalCable.capacityColumn}; voltage-drop column ${finalCable.voltageDropColumn}; ${finalCable.loadedConductors} loaded conductors; run at ${operatingTemperature}C.`,
      'Large-conductor voltage drop uses impedance magnitude, a conservative bound. Balanced three-phase power factor 0.9; single-phase power factor 1.',
      `Circuit resistance multiplier ${operatingTemperature === 90 ? 1.28 : 1.2}; Ze unchanged.`,
      ...(armoured ? [cpcArrangement === 'integral'
        ? `Integral copper CPC ${cpcSize}mm2: one dedicated full-size insulated core inside the selected cable, matching line insulation. Confirm the manufacturer supplies sufficient cores for phases, any neutral and this CPC. Armour is not counted; verify bonding and fault withstand.`
        : `Separate copper CPC ${cpcSize}mm2 (${autoSeparateCpc ? 'automatically selected: smallest available line conductor first, then smallest CPC meeting tabular minimum and design Zs' : 'manually selected'}), installed with circuit, matching circuit insulation/fault-temperature rating, tabular sizing with 4mm2 minimum; armour not counted. Verify connections, bonding and fault withstand.`] : []),
      ...(method === InstallationMethod.METHOD_D ? ['D1 duct: ground 20C, standard ground resistivity/depth; site corrections required for differing burial conditions.'] : ['Air ambient 30C; reference installation conditions.']),
      ...(operatingTemperature === 90 ? ['90C operation requires manufacturer-confirmed equipment and accessories.'] : []),
    ],
    loadCurrent,
    protectiveDevice,
    suggestedProtectiveDevice: suggestedDevice,
    suggestedDeviceType: suggestedDeviceType,
    cableSize: finalCable.size,
    cpcSize,
    cpcArrangement,
    voltageDrop: finalVd,
    voltageDropPercentage: finalVdPercent,
    isCompliant: finalIsCompliant,
    maxVoltageDrop: (limitPercentage / 100) * voltage,
    limitPercentage,
    zs: finalZs,
    maxZs,
    zsCompliant
  };
}

export function getCircuitInputIssue(cable: CableType, method: InstallationMethod, supply: SupplyType, temperature = 30, grouping = 1, device?: DeviceType, options: CircuitOptions = {}): string | null {
  const combinationIssue = getCombinationIssue(cable, method, supply);
  if (combinationIssue) return combinationIssue;
  if (method === InstallationMethod.METHOD_D && (temperature !== 30 || grouping !== 1)) return 'Buried-cable site correction factors require a ground-specific calculation; air correction factors cannot be used.';
  const correctionIssue = getCorrectionFactors(cable, temperature, grouping, options.operatingTemperature).error;
  if (correctionIssue) return correctionIssue;
  if (options.cpcArrangement !== undefined && !['separate', 'integral'].includes(options.cpcArrangement)) return 'Select a supported copper CPC arrangement; armour-only calculations require manufacturer data.';
  if ((cable === CableType.PVC_SWA || cable === CableType.XLPE_SWA) && options.cpcArrangement !== 'integral' && options.autoSizeSeparateCpc !== true && (!options.separateCopperCpcSize || options.separateCopperCpcSize < 4 || getLineConductorResistance(options.separateCopperCpcSize) === null)) return 'Select automatic copper CPC sizing, an integral copper CPC, or enter a separate CPC size (minimum 4mm2 in this model; matching insulation rating). Armour-only earth paths require manufacturer resistance and fault-withstand data; armour is not treated as copper.';
  if (device === DeviceType.BS3036) return 'BS 3036 cable sizing requires its fuse correction and applicability notes; these source pages have not been supplied.';
  return null;
}
