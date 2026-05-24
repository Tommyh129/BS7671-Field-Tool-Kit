export enum AppMode {
  HOME = 'HOME',
  SMART_CIRCUIT = 'SMART_CIRCUIT',
  VOLTAGE_DROP = 'VOLTAGE_DROP',
  THREE_PHASE = 'THREE_PHASE',
  CABLE_FINDER = 'CABLE_FINDER',
  ZS_CALCULATOR = 'ZS_CALCULATOR',
  FAULT_CURRENT = 'FAULT_CURRENT',
  CABLE_RESISTANCE = 'CABLE_RESISTANCE',
  MAX_LENGTH = 'MAX_LENGTH',
  EARTH_ELECTRODE = 'EARTH_ELECTRODE',
  HISTORY = 'HISTORY',
  PRIVACY = 'PRIVACY',
  ACCOUNT_DELETION = 'ACCOUNT_DELETION',
  SUPPORT = 'SUPPORT',
}

export enum SupplySystem {
  TN_C_S = 'TN-C-S',
  TN_S = 'TN-S',
  TT = 'TT',
}

export enum DeviceType {
  MCB_B = '60898 Type B',
  MCB_C = '60898 Type C',
  MCB_D = '60898 Type D',
  BS88_2 = 'BS 88-2 (gG) 0.4s',
  BS88_2_5S = 'BS 88-2 (gG) 5s',
  BS88_3 = 'BS 88-3 (gG)',
  BS3036 = 'BS 3036 (Rewireable)',
  BS1361 = 'BS 1361 (Cartridge)',
}

export enum SupplyType {
  SINGLE_PHASE = 'Single Phase (230V)',
  THREE_PHASE = 'Three Phase (400V)',
}

export enum InstallationMethod {
  METHOD_A = 'Method A (Thermally insulated wall)',
  METHOD_B = 'Method B (In conduit or trunking on a wall)',
  METHOD_C = 'Method C (Clipped direct)',
  METHOD_D = 'Method D (In conduit or duct in the ground)',
  METHOD_E = 'Method E (Multi-core cable in free air or on perforated cable tray)',
  METHOD_F = 'Method F (Single-core cables in free air or on perforated cable tray)',
  METHOD_G = 'Method G (Single-core cables in free air, spaced, or on perforated cable tray)',
  METHOD_100 = 'Method 100 (Above plasterboard ceiling, not in contact with insulation)',
  METHOD_101 = 'Method 101 (Above plasterboard ceiling, covered by insulation ≤ 100mm)',
  METHOD_102 = 'Method 102 (In timber stud wall, cable touching the wall)',
  METHOD_103 = 'Method 103 (In timber stud wall, cable not touching the wall)',
}

export enum CableType {
  PVC_PVC = '70°C PVC (Twin & Earth)',
  PVC_SWA = '70°C PVC Armoured (SWA)',
  XLPE_SWA = '90°C XLPE Armoured (SWA)',
  PVC_SINGLE = '70°C PVC Single Core',
}

export interface CableData {
  size: number; // mm2
  capacity: {
    [key in InstallationMethod]: number; // Amps
  };
  mvAm: number; // mV/A/m
}

export enum CircuitType {
  LIGHTING = 'Lighting (3%)',
  OTHER = 'Other (5%)',
}

export enum CableCoreType {
  MULTI_CORE = 'Multi-core',
  SINGLE_CORE = 'Single-core',
}

export enum DisconnectionTime {
  TIME_04 = '0.4s (Final)',
  TIME_5 = '5s (Distribution)',
}

export interface CalculationResult {
  loadCurrent: number;
  protectiveDevice: number;
  cableSize: number;
  cpcSize?: number;
  voltageDrop: number;
  voltageDropPercentage: number;
  isCompliant: boolean;
  maxVoltageDrop: number;
  limitPercentage: number;
  zs?: number;
  maxZs?: number;
  zsCompliant?: boolean;
}

export interface CalculationHistory {
  id: string;
  userId: string;
  type: 'circuit' | 'zs' | 'fault' | 'three-phase' | 'electrode' | 'cable_resistance' | 'max_length' | 'cable_finder';
  title: string;
  inputs: any;
  results: any;
  createdAt: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
