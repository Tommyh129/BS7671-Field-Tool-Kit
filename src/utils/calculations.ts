import { SupplyType, InstallationMethod, CalculationResult, CircuitType, CableType, DeviceType } from '../types';
import { CABLE_DATABASE, PROTECTIVE_DEVICES, VOLTAGES, AMBIENT_TEMP_FACTORS, GROUPING_FACTORS, CABLE_RESISTANCE, DEVICE_LIMITS } from '../constants';

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
  deviceType: DeviceType = DeviceType.MCB_B
): CalculationResult | null {
  if (loadKw <= 0 || lengthM <= 0) return null;

  const cableSizes = CABLE_DATABASE[cableType];
  if (!cableSizes) return null;

  // 1. Convert load in kW to watts
  const powerWatts = loadKw * 1000;

  // 2. Calculate current (I)
  let loadCurrent: number;
  if (supplyType === SupplyType.SINGLE_PHASE) {
    loadCurrent = powerWatts / VOLTAGES.SINGLE_PHASE;
  } else {
    loadCurrent = powerWatts / (1.732 * VOLTAGES.THREE_PHASE * 0.9);
  }

  // 3. Select Protective Device (In)
  // For MCBs we use standard ratings, for others we might need to filter by available ratings in DEVICE_LIMITS
  const availableRatings = Object.keys(DEVICE_LIMITS[deviceType]).map(Number).sort((a, b) => a - b);
  const protectiveDevice = availableRatings.find((d) => d >= loadCurrent) || availableRatings[availableRatings.length - 1];

  // 4. Apply Correction Factors
  // Ca (Ambient Temp) and Cg (Grouping)
  const Ca = AMBIENT_TEMP_FACTORS[ambientTemp] || 1.0;
  const Cg = GROUPING_FACTORS[groupingCount] || 1.0;
  const totalCorrection = Ca * Cg;

  // 5. Choose cable size based on current capacity table
  // Iz >= In / (Ca * Cg)
  const requiredCapacity = protectiveDevice / totalCorrection;
  let selectedCable = cableSizes.find((c) => c.capacity[method] >= requiredCapacity);

  if (!selectedCable) {
    selectedCable = cableSizes[cableSizes.length - 1];
  }

  // 6. Calculate voltage drop (Vd)
  const voltage = supplyType === SupplyType.SINGLE_PHASE ? VOLTAGES.SINGLE_PHASE : VOLTAGES.THREE_PHASE;
  const limitPercentage = circuitType === CircuitType.LIGHTING ? 3 : 5;

  const getVd = (cable: any) => {
    const vdFactor = supplyType === SupplyType.THREE_PHASE ? 0.866 : 1.0;
    return (cable.mvAm * loadCurrent * lengthM * vdFactor) / 1000;
  };
  const getVdPercent = (vd: number) => (vd / voltage) * 100;

  // 7. Calculate Zs
  const getZs = (cable: any) => {
    const resistanceMOhms = CABLE_RESISTANCE[cable.size] || (cable.size * 1.2); // Fallback if not in resistance table
    // Apply 1.2 factor for conductor temperature rise (20°C to 70°C) as per BS 7671
    const r1r2 = (resistanceMOhms * lengthM * 1.2) / 1000;
    return ze + r1r2;
  };

  const maxZs = DEVICE_LIMITS[deviceType][protectiveDevice] || 0;

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
      
      return nextVdPercent <= limitPercentage && nextZs <= maxZs;
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
    const lineSize = finalCable.size;
    if (lineSize <= 16) {
      cpcSize = lineSize;
    } else if (lineSize <= 35) {
      cpcSize = 16;
    } else {
      cpcSize = Math.ceil(lineSize / 2);
      // Find next standard size if needed, but for now just simple math
      const standardSizes = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
      cpcSize = standardSizes.find(s => s >= (cpcSize || 0)) || lineSize;
    }
  }

  return {
    loadCurrent,
    protectiveDevice,
    cableSize: finalCable.size,
    cpcSize,
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
