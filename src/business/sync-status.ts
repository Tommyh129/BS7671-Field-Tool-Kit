import type { BusinessRecord, Project } from './model';

export function projectSyncGroups(records: BusinessRecord[]) {
  const groups = new Map<string, { id: string; label: string; records: BusinessRecord[] }>();
  for (const record of records) {
    if (record.sync === 'synced') continue;
    const id = record.kind === 'settings' ? 'business-profile' : record.kind === 'ramsTemplate' ? 'rams-templates' : record.kind === 'project' ? record.id : record.projectId;
    const project = records.find(item => item.id === id && item.kind === 'project');
    const number = (project?.payload as Project | undefined)?.number;
    const label = record.kind === 'settings' ? 'Business profile' : record.kind === 'ramsTemplate' ? 'Private RAMS templates' : number ? `Project ${number}` : 'Project';
    if (!groups.has(id)) groups.set(id, { id, label, records: [] });
    groups.get(id)!.records.push(record);
  }
  return [...groups.values()];
}

export function syncGroupMessage(records: BusinessRecord[]) {
  if(records.some(record=>record.error?.startsWith('Business storage is full')))return 'Saved on this device. Business storage is full. Existing documents can still be viewed and exported. Contact support or remove unneeded files before retrying.';
  if (records.some(record => record.sync === 'conflict')) {
    return 'Saved on this device. Changes on another device need review before cloud backup can finish. Export a local backup before replacing any local changes.';
  }
  return 'Saved on this device. Cloud backup has not completed. Check your connection and retry. If this continues, check your Business access or contact support.';
}
