import { AppMode } from '../types';
import type { BusinessRecord } from '../business/model';

export const TOOL_LABELS: Partial<Record<AppMode, string>> = {
  [AppMode.ZS_CALCULATOR]: 'Zs Calculator', [AppMode.VOLTAGE_DROP]: 'AC Voltage Drop',
  [AppMode.DC_VOLTAGE_DROP]: 'DC Voltage Drop', [AppMode.THREE_PHASE]: 'Power Calculator',
  [AppMode.CABLE_FINDER]: 'Cable Finder', [AppMode.SMART_CIRCUIT]: 'Smart Circuit Designer',
  [AppMode.FAULT_CURRENT]: 'Fault Current', [AppMode.CABLE_RESISTANCE]: 'Resistance',
  [AppMode.MAX_LENGTH]: 'Max Length', [AppMode.EARTH_ELECTRODE]: 'TT Electrode',
  [AppMode.PROTECTIVE_DEVICE_SELECTOR]: 'Protective Device Selector', [AppMode.THREE_PHASE_MOTOR]: '3-Phase Motor',
};
export const TOOL_MODES = Object.keys(TOOL_LABELS) as AppMode[];
export const backDestination = (mode: AppMode) => TOOL_MODES.includes(mode) ? AppMode.DESIGN : AppMode.HOME;
export const PRO_TOOL_MODES = [AppMode.SMART_CIRCUIT, AppMode.FAULT_CURRENT, AppMode.CABLE_RESISTANCE,
  AppMode.MAX_LENGTH, AppMode.EARTH_ELECTRODE, AppMode.PROTECTIVE_DEVICE_SELECTOR, AppMode.THREE_PHASE_MOTOR];
const usageKey = (uid?: string | null) => `sparkys.tool-usage.v1.${uid || 'guest'}`;
export function readToolUsage(uid?: string | null): Partial<Record<AppMode, number>> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(usageKey(uid)) || '{}');
    return Object.fromEntries(TOOL_MODES.map(mode => [mode,
      Number.isSafeInteger(raw?.[mode]) && raw[mode] > 0 ? raw[mode] : 0]));
  } catch { return {}; }
}
export function recordToolUse(mode: AppMode, uid?: string | null) {
  if (!TOOL_MODES.includes(mode)) return;
  try {
    const usage = readToolUsage(uid);
    usage[mode] = Math.min((usage[mode] || 0) + 1, Number.MAX_SAFE_INTEGER);
    window.localStorage.setItem(usageKey(uid), JSON.stringify(usage));
    window.dispatchEvent(new Event('sparkys-tool-usage-updated'));
  } catch { /* Storage restrictions must not prevent opening a tool. */ }
}
export function clearToolUsage(uid: string) { window.localStorage.removeItem(usageKey(uid)); }
export function frequentTools(usage: Partial<Record<AppMode, number>>, pro: boolean) {
  return TOOL_MODES.filter(mode => pro || !PRO_TOOL_MODES.includes(mode))
    .sort((a, b) => (usage[b] || 0) - (usage[a] || 0)).slice(0, 4);
}
export function dueProjects(records: BusinessRecord[]) {
  return records.filter((row): row is BusinessRecord<'project'> => {
    if (row.kind !== 'project' || row.deleted) return false;
    const project = (row as BusinessRecord<'project'>).payload;
    const date = project.startDate || '';
    return ['Draft', 'Quoted', 'Accepted'].includes(project.status) && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && !Number.isNaN(Date.parse(date + 'T00:00:00Z'))
      && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
  }).sort((a,b) => a.payload.startDate!.localeCompare(b.payload.startDate!)
    || a.payload.number.localeCompare(b.payload.number, undefined, { numeric: true }) || a.id.localeCompare(b.id));
}
