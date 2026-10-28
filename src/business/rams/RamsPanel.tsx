import {useEffect,useRef,useState} from 'react';
import {Plus,Copy,Save,ArrowLeft,ArrowUp,ArrowDown,Trash2,FileText,RefreshCw,Upload,Send} from 'lucide-react';
import {auth} from '../../firebase';
import type {BusinessRecord,Company,Project} from '../model';
import {today,ukDate} from '../model';
import * as S from '../store';
import {Modal} from '../Projects';
import {DocumentPreview,type PreviewRequest} from '../DocumentPreview';
import {blobDataUrl} from '../pdf';
import {optimiseLogo} from '../logo';
import {blankHazard,newRams,copyRams,ramsIssues,outstandingActions,LIKELIHOOD,SEVERITY,riskValue,ramsFilename,type RamsDraft,type RamsTemplate,type Hazard,type IssuedRams,type MethodSection} from './model';
import {ramsPdf} from './pdf';
import * as API from './client';

function Text({label,value,onChange,area=false,type='text'}:{label:string;value:string;onChange:(value:string)=>void;area?:boolean;type?:string}){
  return <label>{label}{area?<textarea value={value} maxLength={12000} onChange={e=>onChange(e.target.value)}/>:<input type={type} value={value} maxLength={500} onChange={e=>onChange(e.target.value)}/>}</label>;
}
function Move({index,length,move,remove,required=false}:{index:number;length:number;move:(delta:number)=>void;remove:()=>void;required?:boolean}){
  return <div className="business-actions"><button title="Move up" aria-label="Move up" disabled={!index} onClick={()=>move(-1)}><ArrowUp size={16}/></button><button title="Move down" aria-label="Move down" disabled={index===length-1} onClick={()=>move(1)}><ArrowDown size={16}/></button><button title="Remove entry" aria-label="Remove entry" disabled={required} onClick={remove}><Trash2 size={16}/></button></div>;
}
function reordered<T>(values:T[],index:number,delta:number){const copy=[...values];[copy[index],copy[index+delta]]=[copy[index+delta],copy[index]];return copy;}

export function RamsPanel({uid,projectId,project,company,records}:{uid:string;projectId:string;project:Project;company:Company;records:BusinessRecord[]}){
  const [issued,setIssued]=useState<IssuedRams[]>([]),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('All'),[editor,setEditor]=useState<RamsDraft|null>(null);
  const [saveStatus,setSaveStatus]=useState(''),[pending,setPending]=useState<API.PendingRams|undefined>();
  const recordRef=useRef<BusinessRecord<'ramsDraft'>|null>(null),draftRef=useRef<RamsDraft|null>(null),chain=useRef(Promise.resolve());
  const [preview,setPreview]=useState<PreviewRequest|null>(null),[reviewed,setReviewed]=useState(false),[controls,setControls]=useState(false),[confirmedName,setConfirmedName]=useState('');
  const [issues,setIssues]=useState<string[]>([]),[capacity,setCapacity]=useState<{used:number;limit:number}|null>(null);
  const [attachment,setAttachment]=useState<{id:string;draft:RamsDraft;pdf:string}|null>(null);
  const [pendingUploads,setPendingUploads]=useState<API.PendingRams[]>([]);
  const drafts=records.filter(r=>r.kind==='ramsDraft'&&r.projectId===projectId&&!r.deleted) as BusinessRecord<'ramsDraft'>[];
  const templates=records.filter(r=>r.kind==='ramsTemplate'&&!r.deleted) as BusinessRecord<'ramsTemplate'>[];
  const load=async()=>{try{setPendingUploads(await API.listPendingRams(uid));setIssued(await API.loadRams(uid));setCapacity(await API.ramsCapacity(uid));}catch{setError('Cloud RAMS could not be refreshed. Downloaded originals and local drafts remain available. Check connection and Business access.');}};
  useEffect(()=>{let live=true;void API.cachedRams(uid).then(rows=>{if(live)setIssued(rows);});void load();return()=>{live=false;};},[uid,projectId]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(draftRef.current&&saveStatus!=='Saved on this device.'){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[saveStatus]);
  const run=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'RAMS action could not finish. Your local copy is retained.');}finally{setBusy(false);}};
  const persist=(value:RamsDraft)=>{
    const target=recordRef.current;if(!target)return Promise.resolve();
    setSaveStatus('Saving...');
    const task=chain.current.catch(()=>{}).then(async()=>{
      if(recordRef.current?.id!==target.id)return;
      const current=recordRef.current;
      const saved=await S.saveBusiness(uid,'ramsDraft',projectId,value,current.id,current.mutationId);
      recordRef.current=saved;
      if(draftRef.current===value)setSaveStatus('Saved on this device.');
    });
    chain.current=task;
    void task.catch(e=>{setSaveStatus('Not saved. Retry before closing.');setError(e instanceof Error?e.message:'Draft save failed.');});
    return task;
  };
  const change=(value:RamsDraft)=>{draftRef.current=value;setEditor(value);setReviewed(false);setControls(false);setIssues([]);void persist(value);};
  const open=async(record:BusinessRecord<'ramsDraft'>)=>{await chain.current.catch(()=>{});recordRef.current=record;draftRef.current=structuredClone(record.payload);setEditor(draftRef.current);setPending(await API.pendingRams(uid,record.id));setReviewed(false);setControls(false);setConfirmedName(record.payload.preparedBy);setIssues([]);setSaveStatus('Saved on this device.');};
  const create=async(value=newRams(project,company,auth.currentUser?.displayName||''))=>{const record=await S.saveBusiness(uid,'ramsDraft',projectId,value);await open(record);};
  const close=async()=>{if(draftRef.current&&!pending)await persist(draftRef.current);await chain.current;setEditor(null);draftRef.current=null;recordRef.current=null;setPending(undefined);};
  const draftLogo=async(value:RamsDraft)=>value.company.logoId?blobDataUrl(await S.readFile(uid,'',value.company.logoId)):undefined;
  const previewDraft=async(value:RamsDraft)=>{const copy=structuredClone(value),logo=await draftLogo(copy);setPreview({filename:ramsFilename(copy.reference,copy.revision,true),editable:false,generate:async()=>ramsPdf(copy,logo)});};
  const view=async(record:IssuedRams)=>{setPreview({filename:ramsFilename(record.reference,record.revision),editable:false,issued:record.kind==='document',external:record.kind==='attachment',generate:()=>API.ramsOriginal(uid,record.id)});};
  const previewEntry=async(draft:BusinessRecord<'ramsDraft'>|undefined,saved:IssuedRams|undefined)=>{
    if(saved?.state==='Issued')return view(saved);
    if(saved?.kind==='attachment'){
      const request=await API.pendingRams(uid,saved.id),data=request?.body.pdf;
      if(typeof data!=='string')throw Error('The external PDF is not cached on this device. Retry its original upload on the device that started it.');
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      setPreview({filename:ramsFilename(saved.reference,saved.revision),external:true,editable:false,generate:async()=>new Blob([bytes],{type:'application/pdf'})});return;
    }
    return previewDraft(draft?.payload||saved!.snapshot);
  };
  const refreshLocal=async()=>{try{await S.syncBusiness(uid);}catch{};};
  const issue=async()=>{
    if(!editor||!recordRef.current)return;
    await persist(editor);const validation=ramsIssues(editor);setIssues(validation);if(validation.length)return;
    if(!reviewed||outstandingActions(editor).length&&!controls)throw Error('Confirm the actual task/site review and outstanding control requirements before issue.');
    // Catch font/logo/size failures before creating a server-side immutable reservation.
    const preflight=ramsPdf(editor,await draftLogo(editor),true,{name:confirmedName,at:new Date().toISOString()});
    if(preflight.size>8*1024*1024)throw Error('RAMS PDF exceeds 8 MB. Split it into smaller documents.');
    await refreshLocal();
    const id=recordRef.current.id;
    try{
      const result=await API.submitRams(uid,id,'issue',{projectId,draft:editor,reviewed,controlsAcknowledged:controls,confirmedName});
      setIssued(rows=>[...rows.filter(r=>r.id!==id),result]);setStatus('Issued PDF saved. Previous versions remain available.');
      setEditor(null);draftRef.current=null;recordRef.current=null;await load();
    }finally{setPending(await API.pendingRams(uid,id));}
  };
  const retry=async(saved:IssuedRams)=>{
    const request=await API.pendingRams(uid,saved.id)||{id:saved.id,action:'issue' as const,body:{projectId,draft:saved.snapshot,reviewed:true,controlsAcknowledged:saved.declaration.controlsAcknowledged,confirmedName:saved.declaration.name}};
    if(saved.kind==='attachment'&&!await API.pendingRams(uid,saved.id))throw Error('Reselect the original external PDF to retry its attachment.');
    await API.retryRams(uid,request);await load();setStatus('Original issue attempt completed.');
  };
  const addAttachment=async(file:File)=>{
    if(file.type!=='application/pdf'||file.size>8*1024*1024)throw Error('Choose a PDF up to 8 MB.');
    const data=await blobDataUrl(file),draft=newRams(project,company);draft.title=file.name.replace(/\.pdf$/i,'');
    setAttachment({id:crypto.randomUUID(),draft,pdf:data.split(',')[1]});
  };
  const workingIssued=issued.filter(r=>r.projectId===projectId),issuedIds=new Set(issued.map(r=>r.id));
  const entries=[...drafts.filter(r=>!issuedIds.has(r.id)).map(r=>({id:r.id,title:r.payload.title||'Untitled RAMS',reference:r.payload.reference,revision:r.payload.revision,state:r.payload.status,author:r.payload.preparedBy,updated:r.updatedAt,draft:r,issued:undefined as IssuedRams|undefined})),
    ...workingIssued.map(r=>({id:r.id,title:r.snapshot.title,reference:r.reference,revision:r.revision,state:r.state==='Preparing'?'Issue incomplete':r.supersededBy?'Superseded':r.kind==='attachment'?'External attachment':'Issued',author:r.snapshot.preparedBy,updated:r.updatedAt,draft:undefined as BusinessRecord<'ramsDraft'>|undefined,issued:r}))];
  return <section aria-label="RAMS documents">
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    {preview&&<Modal title="RAMS PDF preview" close={()=>setPreview(null)}><DocumentPreview request={preview}/></Modal>}
    {attachment&&<Modal title="External RAMS PDF attachment" close={()=>{if(!busy)setAttachment(null);}}>
      <fieldset disabled={busy||pendingUploads.some(p=>p.id===attachment.id)}><Text label="Attachment title" value={attachment.draft.title} onChange={value=>setAttachment({...attachment,draft:{...attachment.draft,title:value}})}/></fieldset>
      <p className="business-muted">Externally prepared attachment. The app does not verify its contents or mark it as an app-reviewed assessment.</p>
      <button disabled={busy} onClick={()=>void run(async()=>{await refreshLocal();try{const result=await API.submitRams(uid,attachment.id,'attachment',{projectId,draft:attachment.draft,pdf:attachment.pdf});setIssued(rows=>[...rows.filter(r=>r.id!==result.id),result]);setAttachment(null);setStatus('External attachment stored.');}finally{setPendingUploads(await API.listPendingRams(uid));}})}><Upload size={16}/>Save / retry original attachment</button>
    </Modal>}
    {!editor?<>
      <div className="business-actions"><h2>RAMS</h2><button disabled={busy} onClick={()=>void run(()=>create())}><Plus size={16}/>New RAMS</button><button disabled={busy} onClick={()=>void run(load)} title="Refresh RAMS" aria-label="Refresh RAMS"><RefreshCw size={16}/></button>
        <label className="business-file"><Upload size={16}/>Attach external PDF<input type="file" accept="application/pdf" hidden disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void run(()=>addAttachment(file));e.target.value='';}}/></label></div>
      {capacity&&<p className="business-muted">Business files: {(capacity.used/1048576).toFixed(1)} / {(capacity.limit/1048576).toFixed(0)} MB. Viewing and export remain available when full.</p>}
      {pendingUploads.filter(p=>p.action==='attachment'&&p.body.projectId===projectId).map(p=><div className="business-warning" key={p.id}><p>External PDF upload awaiting retry: {(p.body.draft as RamsDraft).title}</p><button disabled={busy} onClick={()=>void run(async()=>{await API.retryRams(uid,p);await load();})}>Retry original attachment</button><button disabled={busy} onClick={()=>void run(async()=>{if(confirm('Discard this upload attempt only if the server confirms nothing was reserved? Keep your original PDF.')){await API.unlockRamsDraft(uid,p.id);await load();}})}>Discard unstarted upload</button></div>)}
      <div className="business-fields"><Text label="Search RAMS" value={search} onChange={setSearch}/><label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Draft','Ready for Review','Issued','Superseded','External attachment','Issue incomplete'].map(s=><option key={s}>{s}</option>)}</select></label></div>
      {templates.length>0&&<details><summary>Your private templates</summary>{templates.map(t=><div className="business-actions" key={t.id}><span>{t.payload.name}</span><button disabled={busy} onClick={()=>void run(()=>create(copyRams(t.payload.draft)))}>Use template</button><button title="Delete template" aria-label={`Delete template ${t.payload.name}`} disabled={busy} onClick={()=>void run(async()=>{if(confirm('Delete this private template?'))await S.removeBusiness(uid,t.id);})}><Trash2 size={16}/></button></div>)}</details>}
      <div className="business-list">{entries.filter(e=>(filter==='All'||e.state===filter)&&`${e.title} ${e.reference} ${e.author}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.updated.localeCompare(a.updated)).map(e=><article className="business-row" key={e.id}>
        <strong>{e.title}</strong><span>{e.reference} | Revision {e.revision} | {e.state}</span><small>Author: {e.author||'Not recorded'} | Updated {ukDate(e.updated)}</small>
        <div className="business-actions">{e.draft&&<button disabled={busy} onClick={()=>void run(()=>open(e.draft!))}>Edit draft</button>}
          <button disabled={busy} onClick={()=>void run(()=>previewEntry(e.draft,e.issued))}><FileText size={16}/>Preview / export</button>
          {(!e.issued||e.issued.kind==='document')&&<button disabled={busy} onClick={()=>void run(()=>create(copyRams(e.draft?.payload||e.issued!.snapshot)))}><Copy size={16}/>Duplicate</button>}
          {e.issued?.state==='Issued'&&e.issued.kind==='document'&&!e.issued.supersededBy&&<button disabled={busy} onClick={()=>void run(()=>create(copyRams(e.issued!.snapshot,true,e.id)))}>New revision</button>}
          {e.issued?.state==='Preparing'&&<button disabled={busy} onClick={()=>void run(()=>retry(e.issued!))}>Retry original issue</button>}
          {e.draft&&<button title="Delete draft" aria-label="Delete draft" disabled={busy} onClick={()=>void run(async()=>{if(await API.pendingRams(uid,e.id))throw Error('Resolve the pending issue before deleting its draft.');if(confirm('Delete this draft?'))await S.removeBusiness(uid,e.id);})}><Trash2 size={16}/></button>}
        </div></article>)}</div>{!entries.length&&<p>No RAMS documents in this project.</p>}
    </>:<>
      <div className="business-actions"><button disabled={busy} onClick={()=>void run(close)}><ArrowLeft size={16}/>Save and close</button><h2>{editor.title||'RAMS draft'}</h2></div>
      <p role="status">{saveStatus}</p>
      {pending&&<div className="business-warning"><p>An issue attempt is pending. Its original content is locked for safe retry.</p><button disabled={busy} onClick={()=>void run(async()=>{await API.retryRams(uid,pending);setPending(undefined);setEditor(null);draftRef.current=null;recordRef.current=null;await load();})}>Retry saved issue</button><button disabled={busy} onClick={()=>void run(async()=>{await API.unlockRamsDraft(uid,pending.id);setPending(undefined);})}>Return to draft if nothing was reserved</button></div>}
      <fieldset disabled={busy||Boolean(pending)}>
      <legend>Document details</legend><div className="business-fields">
        {([['title','RAMS title'],['reference','Unique reference'],['projectNumber','Project number'],['projectTitle','Project title'],['customer','Customer'],['site','Site address'],['location','Work location'],['preparedBy','Prepared by'],['preparedRole','Preparer job role'],['reviewedBy','Reviewed by (optional, manually recorded)'],['reviewedRole','Reviewer job role']] as const).map(([key,label])=><Text key={key} label={label} value={editor[key]} onChange={value=>change({...editor,[key]:value})}/>)}
        {(['startDate','endDate','issueDate','reviewDate'] as const).map(key=><Text key={key} type="date" label={{startDate:'Proposed start date',endDate:'Proposed end date',issueDate:'Issue date',reviewDate:'Review date'}[key]} value={editor[key]} onChange={value=>change({...editor,[key]:value})}/>)}
        <label>Draft status<select value={editor.status} onChange={e=>change({...editor,status:e.target.value as RamsDraft['status']})}><option>Draft</option><option>Ready for Review</option></select></label>
      </div>
      {(['description','scope','contacts','siteConditions'] as const).map(key=><Text area key={key} label={{description:'Description',scope:'Scope of work',contacts:'Site contacts',siteConditions:'Site conditions and interfaces with other people or work'}[key]} value={editor[key]} onChange={value=>change({...editor,[key]:value})}/>)}
      <details><summary>Editable document branding</summary><p className="business-muted">These values are saved with this document, not the Business Profile.</p>
        {(['name','legalName','address','contactName','email','phone','website','registrationNumber'] as const).map(key=><Text key={key} label={`Business ${key}`} value={editor.company[key]||''} onChange={value=>change({...editor,company:{...editor.company,[key]:value}})}/>)}
        <button onClick={()=>change({...editor,company:{...editor.company,logoId:''}})}>Remove logo from this document</button><button onClick={()=>change({...editor,company:{...editor.company,logoId:company.logoId||''}})}>Use current Business Profile logo</button>
      </details>
      </fieldset>
      <fieldset disabled={busy||Boolean(pending)}><legend>Risk assessment</legend>
      <details><summary>Optional risk-scoring definitions</summary><p>Likelihood x severity = score (1-25). Scoring is optional; no score means automatic acceptance or that work is safe.</p><h3>Likelihood</h3>{LIKELIHOOD.map(v=><p key={v}>{v}</p>)}<h3>Severity</h3>{SEVERITY.map(v=><p key={v}>{v}</p>)}</details>
      {editor.hazards.some(h=>h.initial||h.residual)&&<table aria-label="Likelihood by severity risk matrix" style={{width:'100%',tableLayout:'fixed',textAlign:'center'}}><thead><tr><th scope="col">L / S</th>{[1,2,3,4,5].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{[1,2,3,4,5].map(l=><tr key={l}><th scope="row">{l}</th>{[1,2,3,4,5].map(s=><td key={s}>{l*s}</td>)}</tr>)}</tbody></table>}
      {editor.hazards.map((h,index)=>{
        const update=(next:Hazard)=>change({...editor,hazards:editor.hazards.map(item=>item.id===h.id?next:item)});
        return <fieldset key={h.id}><legend>Hazard {index+1}</legend><Move index={index} length={editor.hazards.length} move={delta=>change({...editor,hazards:reordered(editor.hazards,index,delta)})} remove={()=>change({...editor,hazards:editor.hazards.filter(item=>item.id!==h.id),sections:editor.sections.map(s=>({...s,hazardIds:s.hazardIds.filter(id=>id!==h.id)}))})}/>
          {([['task','Activity / task'],['hazard','Hazard'],['harmed','Who may be harmed and how'],['controls','Existing control measures'],['further','Further controls / actions required'],['responsible','Person responsible']] as const).map(([key,label])=><Text area={key!=='responsible'} key={key} label={label} value={h[key]} onChange={value=>update({...h,[key]:value})}/>)}
          <div className="business-fields"><Text type="date" label="Action due date" value={h.due} onChange={value=>update({...h,due:value})}/><label>Action completion<select value={h.completion} onChange={e=>update({...h,completion:e.target.value as Hazard['completion']})}>{['Not started','In progress','Complete','Not applicable'].map(v=><option key={v}>{v}</option>)}</select></label></div>
          {(['initial','residual'] as const).map(key=><div key={key}><label className="check"><input type="checkbox" checked={Boolean(h[key])} onChange={e=>update({...h,[key]:e.target.checked?{likelihood:null,severity:null}:null})}/>{key==='initial'?'Initial':'Residual'} risk score (optional)</label>{h[key]&&<div className="business-fields">{(['likelihood','severity'] as const).map(dimension=><label key={dimension}>{dimension}<select value={h[key]?.[dimension]??''} onChange={e=>update({...h,[key]:{...h[key]!,[dimension]:e.target.value?Number(e.target.value):null}})}><option value="">Not selected</option>{(dimension==='likelihood'?LIKELIHOOD:SEVERITY).map((value,i)=><option key={i} value={i+1}>{value}</option>)}</select></label>)}<p>Score: {riskValue(h[key])??'Not scored'}. Not a safety approval.</p></div>}</div>)}
        </fieldset>;
      })}<button onClick={()=>change({...editor,hazards:[...editor.hazards,blankHazard()]})}><Plus size={16}/>Add hazard</button></fieldset>
      <fieldset disabled={busy||Boolean(pending)}><legend>Method statement</legend>
        {editor.sections.map((s,index)=>{const update=(value:MethodSection)=>change({...editor,sections:editor.sections.map(item=>item.id===s.id?value:item)});return <fieldset key={s.id}><legend>Section {index+1}</legend>
          <Move index={index} length={editor.sections.length} required={['scope','sequence'].includes(s.id)} move={delta=>change({...editor,sections:reordered(editor.sections,index,delta)})} remove={()=>change({...editor,sections:editor.sections.filter(item=>item.id!==s.id)})}/>
          <Text label="Section heading" value={s.title} onChange={value=>update({...s,title:value})}/>
          {!['scope','sequence'].includes(s.id)&&<label className="check"><input type="checkbox" checked={s.notApplicable} onChange={e=>update({...s,notApplicable:e.target.checked})}/>Not applicable</label>}
          <Text area label={s.notApplicable?'Explanation (optional)':'Your method statement'} value={s.notApplicable?s.explanation:s.content} onChange={value=>update({...s,[s.notApplicable?'explanation':'content']:value})}/>
          <details><summary>Link risk-assessment entries</summary>{editor.hazards.map((h,i)=><label className="check" key={h.id}><input type="checkbox" checked={s.hazardIds.includes(h.id)} onChange={e=>update({...s,hazardIds:e.target.checked?[...s.hazardIds,h.id]:s.hazardIds.filter(id=>id!==h.id)})}/>Hazard {i+1}: {h.task||'Untitled'}</label>)}</details>
        </fieldset>;})}<button onClick={()=>change({...editor,sections:[...editor.sections,{id:crypto.randomUUID(),title:'',content:'',explanation:'',notApplicable:false,hazardIds:[]}]})}><Plus size={16}/>Add optional section</button>
      </fieldset>
      <fieldset disabled={busy||Boolean(pending)}><legend>Optional briefing record - revision {editor.revision}</legend><p className="business-muted">Acknowledgement of a briefing, not proof of competence or guaranteed understanding. These records apply only to this revision.</p>
        {editor.briefings.map((b,index)=>{const update=(value:typeof b)=>change({...editor,briefings:editor.briefings.map(item=>item.id===b.id?value:item)});return <fieldset key={b.id}><legend>Person {index+1}</legend><Text label="Person briefed" value={b.person} onChange={value=>update({...b,person:value})}/><Text label="Briefing date" type="date" value={b.date} onChange={value=>update({...b,date:value})}/><label className="check"><input type="checkbox" checked={b.acknowledged} onChange={e=>update({...b,acknowledged:e.target.checked})}/>Briefing acknowledged for revision {editor.revision}</label>
          <label className="business-file"><Upload size={16}/>Optional signature image<input type="file" accept="image/png,image/jpeg" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(!confirm('Only attach a signature with that person\'s authorisation. Continue?'))return;const data=await blobDataUrl(await optimiseLogo(file));if(data.length>200000)throw Error('Signature image is too large. Choose a smaller PNG/JPEG.');update({...b,signature:data});});e.target.value='';}}/></label>
          {b.signature&&<><img src={b.signature} alt="Recorded signature" style={{maxWidth:180,maxHeight:70,objectFit:'contain',background:'#fff'}}/><button onClick={()=>{const copy={...b};delete copy.signature;update(copy);}}>Remove signature</button></>}
          <button title="Remove briefing record" aria-label="Remove briefing record" onClick={()=>change({...editor,briefings:editor.briefings.filter(item=>item.id!==b.id)})}><Trash2 size={16}/></button></fieldset>;})}
        <button onClick={()=>change({...editor,briefings:[...editor.briefings,{id:crypto.randomUUID(),person:'',date:today(),revision:editor.revision,acknowledged:false}]})}><Plus size={16}/>Add briefing record</button>
      </fieldset>
      {editor.copiedNeedsReview&&<label className="check"><input type="checkbox" disabled={Boolean(pending)} checked={editor.copiedReviewed} onChange={e=>change({...editor,copiedReviewed:e.target.checked})}/>I have checked copied site details, dates, contacts and controls for this task and site.</label>}
      {!!issues.length&&<div role="alert"><strong>Before issue</strong><ul>{issues.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {outstandingActions(editor).length>0&&<p className="business-warning">{outstandingActions(editor).length} control action(s) are outstanding. Record responsibility and due dates; required controls must be in place before relevant work.</p>}
      <fieldset disabled={busy||Boolean(pending)}><legend>User declaration</legend>
        <Text label="Confirmation made by" value={confirmedName} onChange={setConfirmedName}/>
        <label className="check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I have reviewed this document for the actual task and site. Required controls must be implemented before relevant work begins.</label>
        {outstandingActions(editor).length>0&&<label className="check"><input type="checkbox" checked={controls} onChange={e=>setControls(e.target.checked)}/>I acknowledge the outstanding actions and their required implementation before the relevant work.</label>}
        <p className="business-muted">Your declaration is not independent verification of competence or approval by The Sparky's Mate.</p>
      </fieldset>
      <div className="business-actions"><button disabled={busy||Boolean(pending)} onClick={()=>void run(async()=>{await persist(editor);setStatus('Draft saved on this device.');})}><Save size={16}/>Save draft</button><button disabled={busy} onClick={()=>void run(()=>previewDraft(editor))}><FileText size={16}/>Preview draft PDF</button>
        <button disabled={busy||Boolean(pending)} onClick={()=>void run(async()=>{const name=prompt('Private template name',editor.title);if(name?.trim()){const draft=copyRams(editor);await S.saveBusiness(uid,'ramsTemplate','',{name:name.trim(),draft} satisfies RamsTemplate);setStatus('Private template saved without review or briefing confirmations.');}})}><Copy size={16}/>Save private template</button>
        <button disabled={busy||Boolean(pending)||!reviewed||!confirmedName.trim()||Boolean(outstandingActions(editor).length&&!controls)} onClick={()=>void run(issue)}><Send size={16}/>Issue and store PDF</button>
      </div>
    </>}
  </section>;
}
