import { CableType, DeviceType, InstallationMethod, SupplyType } from '../types';
import { CABLE_DATABASE, CABLE_RESISTANCE, ALUMINIUM_RESISTANCE, DEVICE_LIMITS, AMBIENT_TEMP_FACTORS, GROUPING_FACTORS } from '../constants';
import { CABLE_REFERENCES, referenceCableRows } from './cableRatings';

export interface DatasetSource {
  id: string;
  title: string;
  edition: string | null;
  table: string | null;
  verification: 'unverified';
  licence: 'not-confirmed';
  units: string;
  notes: string[];
}

const legacySource = (id: string, title: string, units: string, notes: string[], table: string | null = null, edition: string | null = null): DatasetSource => ({
  id, title, units, notes, table, edition, verification: 'unverified', licence: 'not-confirmed',
});

export const CABLE_SOURCE_IDS: Record<CableType, string> = {
  [CableType.PVC_PVC]: 'cable-pvc-flat',
  [CableType.PVC_SWA]: 'cable-pvc-armoured',
  [CableType.XLPE_SWA]: 'cable-xlpe-armoured',
  [CableType.PVC_SINGLE]: 'cable-pvc-single',
};

export const DATASET_SOURCES: Record<string, DatasetSource> = {
  'dc-workbook': legacySource('dc-workbook', 'DC sizing method and user workbook', 'V; A; W; mm2; ohm mm2/m', [
    'User-supplied DC Calculator.xlsx, DC Cable Calc!J10:T21: I=P/V; copper rho20=0.0175; voltage-drop area=2*rho*L*I/allowedDrop; current-density area=I/(J*K); choose the larger requirement and round up to an available size.',
    'The workbook assumes J=6 A/mm2 and K=1 for copper. These are preliminary design assumptions, not cable-specific BS 7671 current ratings. No aluminium current-density default is supplied.',
    'Recorded resistance is the default; the optional workbook rho/area model is idealised and can predict lower resistance. Both use one-way length and two equal outgoing/return conductors. P/V uses power at supply voltage, not a constant-power load-terminal solution.',
    'Resistance temperature correction: R(T)=R20*(1+alpha*(T-20)); alpha=0.00393 copper, 0.00403 aluminium. Manufacturer reference: https://elsewedyequipment.com/wp-content/uploads/2021/07/power-cables-catalogue.pdf',
    'Temperature is a user-entered conductor temperature, not a thermal prediction. Confirm insulation, terminations, actual cable availability, installation ampacity, DC protection and fault withstand separately. No client or project data from the workbook is included.',
  ]),
  'cable-unidentified': legacySource('cable-unidentified', 'Unidentified cable dataset', 'not identified', ['No cable-specific source was recorded. No other cable dataset is substituted as provenance.']),
  ...Object.fromEntries(Object.values(CableType).map(type => {
    const table = type === CableType.PVC_PVC ? '4D5'
      : type === CableType.PVC_SWA ? '4D4A/4D4B' : type === CableType.XLPE_SWA ? '4D4A/4D4B (run at 70C); 4E4A/4E4B (90C confirmed)' : '4D1A/4D1B';
    const id = CABLE_SOURCE_IDS[type];
    return [id, legacySource(id, type, 'mm2; A; mV/A/m', [
      `Public reference checked: ${type === CableType.PVC_PVC ? CABLE_REFERENCES.flat : type === CableType.PVC_SINGLE ? CABLE_REFERENCES.singles : type === CableType.XLPE_SWA ? CABLE_REFERENCES.xlpeArmoured : CABLE_REFERENCES.pvcArmoured}`,
      'Phase-specific columns; no interpolation. Large-conductor voltage drop uses tabulated impedance magnitude as a conservative bound.',
      'Air 30C; D1 ground 20C, standard burial conditions. Balanced three-phase; harmonic neutral loading not assessed. Singles C uses touching/trefoil. Non-flexible copper only.',
      'SWA minimum 1.5mm2. Armour fault withstand is not inferred. XLPE defaults to run at 70C; 90C needs equipment manufacturer confirmation.',
      `70C SWA ratings and temperature guidance: ${CABLE_REFERENCES.iet}; voltage drop: ${CABLE_REFERENCES.pvcArmoured}`,
      'Public references do not establish complete current-amendment verification or redistribution permission.',
    ], table, 'BS 7671:2018 public tables; IET A2:2022 SWA cross-check; current amendment not fully verified')];
  })),
  installations: legacySource('installations', 'Installation and reference methods', 'method identifiers', [
    'Letters A-G are reference-method codes, not Table 4A2 installation numbers.',
    'Flat-cable choices 100-103 follow Table 4D5. 100: ceiling insulation <=100mm; 101: >100mm; 102: wall contact; 103: no wall contact. D is explicitly D1 (duct), not direct burial.',
    'Construction filters only exclude incompatible choices; they do not verify a rating-table column.',
  ]),
  protection: legacySource('protection', 'Protective-device design Zs limits', 'A; ohm', [
    'BS 7671:2018+A3:2024 is claimed by the existing code, not verified from a supplied source. Exact table, notes and disconnection applicability remain unverified.',
    'An RCD alone provides no overload or short-circuit protection. RCBO overcurrent and residual-current functions require separate data.',
    'MCCB/ACB settings, breaking capacity, energy let-through, selectivity and backup protection require manufacturer documentation; no generic values are supplied.',
    'Isolation/switching suitability and residual-current protection have not been assessed.',
  ], null, 'BS 7671:2018+A3:2024 (legacy claim only)'),
  ambient: legacySource('ambient', 'Ambient-temperature correction factors', 'dimensionless; deg C', [
    'Existing factors are for the legacy 70-degree thermoplastic-in-air assumption only; no 90-degree, buried-ground or mineral-insulated factors have been supplied.',
  ]),
  grouping: legacySource('grouping', 'Grouping correction factors', 'dimensionless; circuit count', [
    'Existing grouping factors have no verified arrangement/table/footnotes. They cannot establish applicability to other arrangements.',
  ]),
  'resistance-copper': legacySource('resistance-copper', 'Copper conductor resistance', 'mOhm/m at assumed 20 deg C', [
    'Existing copper resistance rows are shared across tools. Conductor class, construction, source table and edition are unknown.',
    'Resistance-only voltage-drop estimates omit reactance and do not establish current capacity, fault protection or minimum permitted conductor size.',
  ]),
  'resistance-aluminium': legacySource('resistance-aluminium', 'Aluminium conductor resistance', 'mOhm/m at assumed 20 deg C', [
    'Only existing non-extrapolated rows are retained; conductor class, source table and edition are unknown.',
    'A resistance row does not establish that the size is permitted for an installation.',
  ]),
  cpc: legacySource('cpc', 'Protective-conductor sizing assumptions', 'mm2; mOhm/m', [
    'Legacy separate-copper CPC sizing and flat-cable conductor pairings require verification against Tables 54.1-54.8.',
    'R1+R2 is the sum of the two recorded conductor resistances; armour and missing CPC pairings are not substituted.',
  ]),
  temperature: legacySource('temperature', 'Design temperature and field-test comparisons', 'dimensionless', [
    'The legacy design estimate multiplies circuit conductor resistance only by 1.2; external Ze is not multiplied. This is a declared approximation, not a verified correction for every cable temperature.',
    'The 0.8 field-test comparison is separate from the design Zs limit. It is not mathematically equivalent to multiplying resistance by 1.2 and does not replace a detailed calculation.',
    'IET guidance: https://electrical.theiet.org/bs-7671-18th-edition-wiring-regulations/faqs/inspection-and-testing-faqs/',
  ]),
  'manufacturer-protection': legacySource('manufacturer-protection', 'Manufacturer device data', 'A; kA; seconds; A2s', [
    'Breaking capacity must be entered from the actual device/manufacturer documentation. No default manufacturer rating is assigned.',
    'Fault-current comparison alone does not establish device suitability, selectivity, backup protection, energy let-through, residual protection or isolation.',
  ]),
  'voltage-drop-guidance': legacySource('voltage-drop-guidance', 'Voltage-drop targets', 'percent; V', [
    'Legacy AC targets are 3 percent for lighting and 5 percent for other circuits. Appendix 4 applicability, supply origin and exceptions have not been source-verified.',
    'DC targets are user-selected design targets; AC guidance is not silently applied as a DC regulatory limit.',
  ]),
};

export const DESIGN_RESISTANCE_MULTIPLIER = 1.2;
export const FIELD_TEST_LIMIT_MULTIPLIER = 0.8;

export interface InstallationEntry {
  id: InstallationMethod;
  kind: 'reference-method' | 'legacy-installation';
  installationNumber: number | null;
  referenceMethodCode: string | null;
  label: string;
  sourceId: 'installations';
}

export const INSTALLATION_ENTRIES: InstallationEntry[] = Object.values(InstallationMethod).map(id => {
  const token = id.split(' ')[1];
  const numeric = /^\d+$/.test(token);
  return {
    id, kind: numeric ? 'legacy-installation' : 'reference-method',
    installationNumber: numeric ? Number(token) : null,
    referenceMethodCode: numeric ? null : token,
    label: id === InstallationMethod.METHOD_100 ? 'Method 100 - Above plasterboard ceiling; insulation up to 100mm'
      : id === InstallationMethod.METHOD_101 ? 'Method 101 - Above plasterboard ceiling; insulation over 100mm'
      : id === InstallationMethod.METHOD_D ? 'Reference method D1 - Multicore armoured cable in a duct in the ground'
      : `${numeric ? 'Installation' : 'Reference method'} ${token} - ${id.slice(id.indexOf('(') + 1, -1)}`,
    sourceId: 'installations',
  };
});

export function getInstallationIssue(cable: CableType, method: InstallationMethod): string | null {
  if (!CABLE_DATABASE[cable] || !INSTALLATION_ENTRIES.some(entry => entry.id === method)) return 'Cable or installation method is not recorded.';
  const single = cable === CableType.PVC_SINGLE;
  if ([InstallationMethod.METHOD_F, InstallationMethod.METHOD_G].includes(method) && !single) return 'Reference methods F/G require single-core construction.';
  if (method === InstallationMethod.METHOD_E && single) return 'Reference method E is the multicore choice; a single-core mapping is required.';
  if (/Method 10[0-3] /.test(method) && cable !== CableType.PVC_PVC) return 'No cable-specific mapping is recorded for this numbered installation method.';
  if (method === InstallationMethod.METHOD_D && (single || cable === CableType.PVC_PVC)) return 'Ground method D1 requires the armoured multicore construction supplied in this dataset.';
  if (cable === CableType.PVC_PVC && method === InstallationMethod.METHOD_E) return 'No free-air rating-column mapping is recorded for flat twin-and-earth cable.';
  if (!referenceCableRows(cable, method).length) return 'No rating-column mapping for this cable and installation arrangement. Choose a supported method; no other method is substituted.';
  return null;
}

export function getCombinationIssue(cable: CableType, method: InstallationMethod, supply = SupplyType.SINGLE_PHASE): string | null {
  const methodIssue = getInstallationIssue(cable, method);
  if (methodIssue) return methodIssue;
  if (supply === SupplyType.THREE_PHASE && cable === CableType.PVC_PVC) return 'Twin-and-earth has only two insulated conductors. Select suitable multicore SWA or single-core phase conductors for three-phase design.';
  return null;
}

export function getCableRows(cable: CableType, method = InstallationMethod.METHOD_C, supply = SupplyType.SINGLE_PHASE, operatingTemperature: 70 | 90 = 70) {
  if (getCombinationIssue(cable, method, supply)) return [];
  return referenceCableRows(cable, method, supply, operatingTemperature);
}

export function getDeviceRatings(device: DeviceType): number[] {
  return Object.entries(DEVICE_LIMITS[device] ?? {}).filter(([rating, limit]) => Number.isFinite(limit) && limit > 0 && (!device.startsWith('60898') || Number(rating) <= 125)).map(([rating]) => Number(rating)).sort((a, b) => a - b);
}

export function getCorrectionFactors(cable: CableType, temperature: number, grouping: number, operatingTemperature: 70 | 90 = 70) {
  if (temperature === 30 && grouping === 1) return { error: null, value: 1 };
  if (cable === CableType.XLPE_SWA && operatingTemperature === 90) return { error: '90-degree non-reference-condition correction factors have not been supplied.', value: null };
  const ca = AMBIENT_TEMP_FACTORS[temperature];
  const cg = GROUPING_FACTORS[grouping];
  if (!ca || !cg) return { error: 'No recorded correction factor for the selected temperature or grouping. No unity fallback is applied.', value: null };
  return { error: null, value: ca * cg };
}

export const CONDUCTOR_RESISTANCE = { copper: CABLE_RESISTANCE, aluminium: ALUMINIUM_RESISTANCE };
export const getResistanceSizes = (material: keyof typeof CONDUCTOR_RESISTANCE) => Object.keys(CONDUCTOR_RESISTANCE[material]).map(Number).sort((a, b) => a - b);
// Fixed motor-power circuit subset; not flexible appliance leads/control wiring.
export const getMotorCircuitSizes = (material: keyof typeof CONDUCTOR_RESISTANCE) => getResistanceSizes(material).filter(size => size >= (material === 'copper' ? 1.5 : 16) && size <= 400);

export function getSourceIdsForTool(tool: string, cable?: CableType, material: 'copper' | 'aluminium' = 'copper'): string[] {
  if (['FAULT_CURRENT', 'fault'].includes(tool)) return ['manufacturer-protection'];
  if (['DC_VOLTAGE_DROP', 'dc_voltage_drop'].includes(tool)) return ['dc-workbook', `resistance-${material}`];
  if (['THREE_PHASE_MOTOR', 'three-phase-motor'].includes(tool)) return [`resistance-${material}`];
  if (['CABLE_FINDER', 'cable_finder'].includes(tool)) return [(cable && CABLE_SOURCE_IDS[cable]) || 'cable-unidentified', 'installations'];
  if (['PROTECTIVE_DEVICE_SELECTOR', 'protective_device_selector'].includes(tool)) return ['protection', 'temperature'];
  if (['ZS_CALCULATOR', 'zs'].includes(tool)) return ['protection', 'resistance-copper', 'temperature'];
  if (['CABLE_RESISTANCE', 'cable_resistance'].includes(tool)) return [`resistance-${material}`];
  if (['MAX_LENGTH', 'max_length'].includes(tool)) return [(cable && CABLE_SOURCE_IDS[cable]) || 'cable-unidentified', 'installations', 'protection', 'resistance-copper', 'cpc', 'temperature', 'voltage-drop-guidance'];
  if (['SMART_CIRCUIT', 'VOLTAGE_DROP', 'circuit'].includes(tool)) return [(cable && CABLE_SOURCE_IDS[cable]) || 'cable-unidentified', 'installations', 'protection', 'ambient', 'grouping', 'resistance-copper', 'cpc', 'temperature', 'voltage-drop-guidance'];
  return [];
}

// The compatibility inventory is single-phase/run-at-70C; ratingCases records
// the actual supported phase, operating temperature and installation columns.
export const ELECTRICAL_DATASETS = {
  cables: Object.values(CableType).map(type => ({
    type, source: DATASET_SOURCES[CABLE_SOURCE_IDS[type]], material: 'copper' as const,
    insulationTemperature: type === CableType.XLPE_SWA ? 90 : 70,
    construction: type === CableType.PVC_SINGLE ? 'single-core' : type === CableType.PVC_PVC ? 'flat-twin-and-earth' : 'armoured-multicore',
    loadedConductorArrangement: 'Default view: two loaded; separate three-loaded columns used for three-phase',
    ratingCases: [70, ...(type === CableType.XLPE_SWA ? [90] : [])].flatMap(temperature =>
      Object.values(SupplyType).flatMap(supply => INSTALLATION_ENTRIES.flatMap(entry => {
        const rows = referenceCableRows(type, entry.id, supply, temperature as 70 | 90);
        return rows.length ? [{ supply, operatingTemperature: temperature, method: entry.label, rows }] : [];
      }))
    ),
    rows: CABLE_DATABASE[type].map(row => ({ ...row, sourceId: CABLE_SOURCE_IDS[type], columns: Object.keys(row.capacity).map(method => ({
      legacyMethod: method, sourceColumn: referenceCableRows(type, method as InstallationMethod).find(item => item.size === row.size)?.capacityColumn ?? null, sourceId: CABLE_SOURCE_IDS[type],
    })) })),
  })),
  installations: { source: DATASET_SOURCES.installations, rows: INSTALLATION_ENTRIES },
  protection: { source: DATASET_SOURCES.protection, rows: Object.values(DeviceType).map(device => ({
    device, providesOvercurrentProtection: true, residualCurrentProtectionVerified: false, isolationSuitabilityVerified: false,
    limits: getDeviceRatings(device).map(rating => ({ rating, designZs: DEVICE_LIMITS[device][rating], sourceId: 'protection', sourceColumn: null })),
  })) },
  ambient: { source: DATASET_SOURCES.ambient, rows: AMBIENT_TEMP_FACTORS },
  grouping: { source: DATASET_SOURCES.grouping, rows: GROUPING_FACTORS },
  resistance: Object.entries(CONDUCTOR_RESISTANCE).map(([material, rows]) => ({ material, source: DATASET_SOURCES[`resistance-${material}`], rows })),
};

export function formatSourceNotes(ids: string[], assumptions: string[] = []): string {
  if (!ids.length) return '';
  return ['DATA SOURCES - NOT SOURCE-VERIFIED', ...[...new Set(ids)].map(id => {
    const source = DATASET_SOURCES[id];
    return `${id}: ${source.title}; edition: ${source.edition ?? 'not supplied'}; table: ${source.table ?? 'not verified'}; units: ${source.units}. ${source.notes.join(' ')}`;
  }), ...assumptions.map(note => `Assumption: ${note}`), 'Source documents and distribution permission are still required. These results do not establish BS 7671 compliance.'].join('\n');
}
