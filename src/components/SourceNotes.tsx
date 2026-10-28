import { DATASET_SOURCES } from '../data/electrical';

export default function SourceNotes({ ids, expanded = false, assumptions = [] }: { ids: string[]; expanded?: boolean; assumptions?: string[] }) {
  if (!ids.length) return null;
  const content = <div className="space-y-2 break-words text-[10px] leading-relaxed">
    {[...new Set(ids)].map(id => {
      const source = DATASET_SOURCES[id];
      return <div key={id}>
        <p>{source.title} ({id})</p>
        <p>Edition: {source.edition ?? 'not supplied'}. Table: {source.table ?? 'not verified'}. Units: {source.units}.</p>
        {source.notes.map(note => <p key={note}>{note}</p>)}
      </div>;
    })}
    {assumptions.map(note => <p key={note}>Assumption: {note}</p>)}
    <p>Source pages and distribution permission are required before source verification. These results do not establish BS 7671 compliance.</p>
  </div>;
  return expanded ? <div className="text-[10px] leading-relaxed break-words"><p>Data sources - unverified legacy data</p>{content}</div> :
    <details className="text-gray-400 text-xs leading-relaxed border-t border-hardware-border py-3">
      <summary className="cursor-pointer">Data sources and assumptions - unverified</summary>{content}
    </details>;
}
