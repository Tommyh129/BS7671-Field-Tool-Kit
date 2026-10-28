import { useState } from 'react';
import { Download } from 'lucide-react';
import { auth } from '../firebase';
import { downloadFile } from '../utils/download';
import { readBusiness, syncBusiness } from './store';
import { exportInvoiceRecords } from './invoices/client';
import { exportRamsRecords } from './rams/client';
import { blobDataUrl } from './pdf';

// Lapsed subscribers retain a way to retrieve their own financial records.
export function BusinessArchive({onSignIn}:{onSignIn:()=>void}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const exportRecords=async(invoices:boolean)=>{
    const uid=auth.currentUser?.uid;
    if(!uid){onSignIn();return;}
    setBusy(true);setMessage('');
    try {
      try{await syncBusiness(uid);}catch{/* Keep offline local backups available. */}
      const records=await readBusiness(uid);
      const data=invoices?await exportInvoiceRecords(uid,records.filter(r=>r.kind==='invoiceDraft')):new Blob([JSON.stringify({format:'sparkys-projects-backup-v1',private:true,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});
      await downloadFile(await blobDataUrl(data),invoices?'invoices-records.json':'projects-records.json','application/json');
      setMessage('Export downloaded. Keep this internal backup private.');
    }catch(error){setMessage(error instanceof Error?error.message:'Export could not finish. Connect and retry.');}
    finally{setBusy(false);}
  };
  return <div className="business mt-5 space-y-3">
    <button disabled={busy} onClick={()=>void (async()=>{const uid=auth.currentUser?.uid;if(!uid){onSignIn();return;}setBusy(true);setMessage('');try{await downloadFile(await blobDataUrl(await exportRamsRecords(uid)),'rams-records.json','application/json');setMessage('Private RAMS archive exported, including original PDFs. Keep client details and signatures secure.');}catch(e){setMessage(e instanceof Error?e.message:'RAMS export could not finish.');}finally{setBusy(false);}})()}><Download size={16}/>Export existing RAMS and PDFs</button>
    <button disabled={busy} onClick={()=>void exportRecords(false)}><Download size={16}/>Export existing project records</button>
    <button disabled={busy} onClick={()=>void exportRecords(true)}><Download size={16}/>Export existing invoices and PDFs</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}
