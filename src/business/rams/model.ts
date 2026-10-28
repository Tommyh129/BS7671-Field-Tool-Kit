import { businessProfile, today, type Company, type Project } from '../model';

export const RAMS_NOTE = "Prepared using The Sparky's Mate from information supplied by the user. The responsible business must ensure this document is suitable for the task and site, communicate it to those affected, and implement and review the controls.";
export const RAMS_STATES = ['Draft', 'Ready for Review', 'Issued', 'Superseded'] as const;
export interface RiskScore { likelihood: number | null; severity: number | null }
export interface Hazard {
  id: string; task: string; hazard: string; harmed: string; controls: string; further: string;
  responsible: string; due: string; completion: 'Not started' | 'In progress' | 'Complete' | 'Not applicable';
  initial: RiskScore | null; residual: RiskScore | null;
}
export interface MethodSection { id: string; title: string; content: string; notApplicable: boolean; explanation: string; hazardIds: string[] }
export interface Briefing { id: string; person: string; date: string; revision: number; acknowledged: boolean; signature?: string }
export interface RamsDraft {
  schema: 1; familyId: string; previousIssuedId: string; reference: string; revision: number;
  title: string; status: 'Draft' | 'Ready for Review'; company: Company;
  projectNumber: string; projectTitle: string; customer: string; site: string;
  description: string; scope: string; location: string; startDate: string; endDate: string;
  preparedBy: string; preparedRole: string; reviewedBy: string; reviewedRole: string;
  issueDate: string; reviewDate: string; contacts: string; siteConditions: string;
  hazards: Hazard[]; sections: MethodSection[]; briefings: Briefing[];
  copiedNeedsReview: boolean; copiedReviewed: boolean;
}
export interface RamsTemplate { name: string; draft: RamsDraft }
export interface IssuedRams {
  id: string; projectId: string; familyId: string; reference: string; revision: number;
  state: 'Preparing' | 'Issued'; kind: 'document' | 'attachment'; snapshot: RamsDraft;
  fingerprint: string; pdfPath: string; issuedAt: string; updatedAt: string;
  declaration: { uid: string; name: string; at: string; controlsAcknowledged: boolean };
  supersededBy?: string; supersededAt?: string;
}
export const METHOD_TITLES = [
  ['scope', 'Scope and limitations'], ['personnel', 'Personnel, competence and supervision'],
  ['equipment', 'Tools, plant and equipment'], ['materials', 'Materials'],
  ['access', 'Access, work area and public protection'], ['permits', 'Permits and site authorisations'],
  ['isolation', 'Isolation and prevention of unexpected energisation'], ['sequence', 'Step-by-step work sequence'],
  ['controls', 'Controls linked to risk-assessment entries'], ['ppe', 'PPE and other protective measures'],
  ['handling', 'Manual handling'], ['coshh', 'Substances / COSHH references'],
  ['emergency', 'Emergency arrangements and contacts'], ['waste', 'Waste and housekeeping'],
  ['handover', 'Completion, inspection, testing and handover'], ['changes', 'Stop-work conditions and changes'],
] as const;
export const LIKELIHOOD = ['1 - Rare: exceptional occurrence', '2 - Unlikely: not expected', '3 - Possible: could occur', '4 - Likely: expected in some circumstances', '5 - Almost certain: expected repeatedly'];
export const SEVERITY = ['1 - Minor injury: first aid', '2 - Injury requiring medical treatment', '3 - Serious injury or absence from work', '4 - Permanent disability or life-changing injury', '5 - Fatality or multiple life-changing injuries'];
export function blankHazard(): Hazard {
  return { id: crypto.randomUUID(), task: '', hazard: '', harmed: '', controls: '', further: '', responsible: '', due: '', completion: 'Not started', initial: null, residual: null };
}
export function newRams(project: Project, company: Company, author = ''): RamsDraft {
  const id = crypto.randomUUID();
  // Financial settings and private payment details are never copied into RAMS.
  const brand = { ...businessProfile(company), bankDetails: '', paymentInstructions: '', terms: '', exclusions: '' };
  return { schema: 1, familyId: id, previousIssuedId: '', reference: `RAMS-${project.number}-${id.slice(0, 8)}`, revision: 1,
    title: '', status: 'Draft', company: brand, projectNumber: project.number, projectTitle: project.title,
    customer: project.customer, site: project.address, description: project.description, scope: '', location: project.address,
    startDate: '', endDate: '', preparedBy: author || company.contactName || '', preparedRole: '', reviewedBy: '', reviewedRole: '',
    issueDate: today(), reviewDate: '', contacts: [project.email, project.phone].filter(Boolean).join('\n'), siteConditions: '',
    hazards: [blankHazard()], sections: METHOD_TITLES.map(([id, title]) => ({ id, title, content: '', notApplicable: false, explanation: '', hazardIds: [] })),
    briefings: [], copiedNeedsReview: false, copiedReviewed: false };
}
export function copyRams(source: RamsDraft, revision = false, issuedId = ''): RamsDraft {
  const copy = structuredClone(source), id = crypto.randomUUID();
  return { ...copy, familyId: revision ? source.familyId : id, previousIssuedId: revision ? issuedId : '',
    reference: revision ? source.reference : `RAMS-${source.projectNumber}-${id.slice(0,8)}`,
    revision: revision ? source.revision + 1 : 1, status: 'Draft', reviewedBy: '', reviewedRole: '',
    issueDate: today(), reviewDate: '', briefings: [], copiedNeedsReview: true, copiedReviewed: false };
}
export function riskValue(score: RiskScore | null) {
  return score?.likelihood && score.severity ? score.likelihood * score.severity : null;
}
export function ramsIssues(draft: RamsDraft): string[] {
  const issues: string[] = [];
  for (const [key, label] of [['title','Document title'], ['reference','Reference'], ['projectNumber','Project number'], ['customer','Customer'], ['site','Site address'], ['scope','Scope'], ['preparedBy','Prepared by'], ['preparedRole','Preparer job role'], ['issueDate','Issue date']] as const)
    if (!draft[key]?.trim()) issues.push(`${label} is required.`);
  if (!draft.company.name?.trim()) issues.push('Business name is required.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 /_.-]{0,79}$/.test(draft.reference)) issues.push('Reference must use 1-80 letters, numbers, spaces, /, _, . or -.');
  if (!Number.isInteger(draft.revision) || draft.revision < 1) issues.push('Revision must be a positive whole number.');
  for (const key of ['issueDate','startDate','endDate','reviewDate'] as const) if (draft[key] && !validDate(draft[key])) issues.push(`${key}: enter a valid date.`);
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) issues.push('End date cannot precede start date.');
  if (draft.reviewDate && draft.reviewDate < draft.issueDate) issues.push('Review date cannot precede issue date.');
  if (!draft.hazards.length) issues.push('Add at least one task-specific hazard assessment.');
  const ids = new Set(draft.hazards.map(h => h.id));
  if(ids.size !== draft.hazards.length) issues.push('Hazard identifiers must be unique.');
  draft.hazards.forEach((h, i) => {
    if (![h.task,h.hazard,h.harmed].every(v => v?.trim()) || !(h.controls?.trim() || h.further?.trim())) issues.push(`Hazard ${i+1}: enter task, hazard, who may be harmed/how and controls.`);
    if (h.further.trim() && (!h.responsible.trim() || !validDate(h.due))) issues.push(`Hazard ${i+1}: further actions need a responsible person and valid due date.`);
    for (const score of [h.initial,h.residual]) if (score && ![score.likelihood,score.severity].every(v => Number.isInteger(v) && v! >= 1 && v! <= 5)) issues.push(`Hazard ${i+1}: select both likelihood and severity, or disable scoring.`);
    if (!['Not started','In progress','Complete','Not applicable'].includes(h.completion)) issues.push(`Hazard ${i+1}: choose a completion status.`);
  });
  for (const required of ['scope','sequence']) if (!draft.sections.some(s => s.id === required && !s.notApplicable && s.content.trim())) issues.push(`Complete the ${required === 'scope' ? 'Scope and limitations' : 'Step-by-step work sequence'} method section.`);
  if(new Set(draft.sections.map(s=>s.id)).size!==draft.sections.length)issues.push('Method section identifiers must be unique.');
  draft.sections.forEach((s, i) => {
    if (!s.title.trim() || (!s.notApplicable && !s.content.trim())) issues.push(`Method section ${i+1}: add a heading and content, or mark not applicable.`);
    if(s.hazardIds.some(id=>!ids.has(id)))issues.push(`Method section ${i+1}: review linked hazards.`);
  });
  if(draft.copiedNeedsReview&&!draft.copiedReviewed)issues.push('Check copied site details, dates, contacts and controls, then confirm they are suitable for this task and site.');
  draft.briefings.forEach((b,i)=>{if(!b.person.trim()||!validDate(b.date)||!b.acknowledged||b.revision!==draft.revision)issues.push(`Briefing ${i+1}: record person, valid date, this revision and acknowledgement.`);});
  return issues;
}
export const outstandingActions = (draft: RamsDraft) => draft.hazards.filter(h => h.further.trim() && h.completion !== 'Complete' && h.completion !== 'Not applicable');
export const ramsFilename = (reference:string,revision:number,draft=false) => `${reference.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,90)||'RAMS'}-r${revision}${draft?'-DRAFT':''}.pdf`;
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value; }
export function assertDraft(value: unknown): asserts value is RamsDraft {
  const d = value as RamsDraft;
  if (!d || d.schema !== 1 || !['Draft','Ready for Review'].includes(d.status) || !d.company || !Array.isArray(d.hazards) || !Array.isArray(d.sections) || !Array.isArray(d.briefings)) throw Error('RAMS draft format is invalid.');
  if (JSON.stringify(d).length > 700000 || d.hazards.length > 150 || d.sections.length > 60 || d.briefings.length > 100) throw Error('RAMS document is too large. Split it into smaller documents.');
  for (const key of ['familyId','previousIssuedId','reference','title','projectNumber','projectTitle','customer','site','description','scope','location','startDate','endDate','preparedBy','preparedRole','reviewedBy','reviewedRole','issueDate','reviewDate','contacts','siteConditions'] as const)
    if (typeof d[key] !== 'string' || d[key].length > 12000) throw Error('RAMS document contains invalid or excessively long fields.');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(d.familyId) || (d.previousIssuedId && !/^[A-Za-z0-9_-]{1,100}$/.test(d.previousIssuedId))) throw Error('RAMS revision identity is invalid.');
  for(const h of d.hazards){for(const key of ['id','task','hazard','harmed','controls','further','responsible','due','completion'] as const)if(typeof h[key]!=='string'||h[key].length>12000)throw Error('RAMS hazard fields are invalid.');}
  for(const s of d.sections)if(!s||!['id','title','content','explanation'].every(key=>typeof s[key]==='string'&&s[key].length<=16000)||typeof s.notApplicable!=='boolean'||!Array.isArray(s.hazardIds))throw Error('RAMS method sections are invalid.');
  for(const b of d.briefings){if(!b||typeof b.id!=='string'||typeof b.person!=='string'||b.person.length>300||typeof b.date!=='string'||typeof b.acknowledged!=='boolean')throw Error('RAMS briefing fields are invalid.');if(b.signature&&(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.signature)||b.signature.length>200000))throw Error('RAMS signature must be a small PNG or JPEG image.');}
}
