import { SupplyType, InstallationMethod, CalculationResult, CircuitType, CableType, DeviceType } from '../types';
import { CABLE_DATABASE, VOLTAGES, AMBIENT_TEMP_FACTORS, GROUPING_FACTORS, DEVICE_LIMITS } from '../constants';
import { getCircuitR1R2MilliOhmsPerMetre, getStandardCpcSize } from './resistance';

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
  protectiveDeviceOverride?: number
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

  // Determine suggested and active device types
  const suggestedDeviceType = suggestDeviceType(loadCurrent, supplyType, circuitType, ze);
  const activeDeviceType = deviceType !== undefined ? deviceType : suggestedDeviceType;

  // 3. Select Protective Device (In)
  // For MCBs we use standard ratings, for others we might need to filter by available ratings in DEVICE_LIMITS
  const availableRatings = Object.keys(DEVICE_LIMITS[activeDeviceType]).map(Number).sort((a, b) => a - b);
  const suggestedDevice = availableRatings.find((d) => d >= loadCurrent) || availableRatings[availableRatings.length - 1];
  const protectiveDevice = protectiveDeviceOverride && availableRatings.includes(protectiveDeviceOverride)
    ? protectiveDeviceOverride
    : suggestedDevice;

  // 4. Apply Correction Factors
  // Ca (Ambient Temp) and Cg (Grouping)
  const Ca = AMBIENT_TEMP_FACTORS[ambientTemp] || 1.0;
  const Cg = GROUPING_FACTORS[groupingCount] || 1.0;
  const totalCorrection = Ca * Cg;

  // 5. Choose cable size based on current capacity table
  // Iz >= In / (Ca * Cg) and Iz >= Ib / (Ca * Cg)
  const requiredCapacity = Math.max(protectiveDevice, loadCurrent) / totalCorrection;
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
    const resistanceMOhms = getCircuitR1R2MilliOhmsPerMetre(cableType, cable.size);
    if (resistanceMOhms === null) return Number.POSITIVE_INFINITY;
    // Apply 1.2 factor for conductor temperature rise (20°C to 70°C) as per BS 7671
    const r1r2 = (resistanceMOhms * lengthM * 1.2) / 1000;
    return ze + r1r2;
  };

  const maxZs = DEVICE_LIMITS[activeDeviceType][protectiveDevice] || 0;

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
    cpcSize = getStandardCpcSize(finalCable.size);
  }

  return {
    loadCurrent,
    protectiveDevice,
    suggestedProtectiveDevice: suggestedDevice,
    suggestedDeviceType: suggestedDeviceType,
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
