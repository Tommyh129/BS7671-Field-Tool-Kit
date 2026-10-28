import type { Express } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { applyAction, financePath, issueCredit, issueInvoice, type FinanceRepository } from '../src/business/invoices/engine';
import { invoicePdf, creditPdf } from '../src/business/invoices/pdf';
import type { Invoice, InvoiceDraft } from '../src/business/invoices/model';
import { hasBusinessAccess } from '../src/subscriptions';
import { reserveStorage } from './storage-allowance';
import { createHash } from 'node:crypto';

export function installInvoiceRoutes(app:Express,bucketName:string){
  const db=getFirestore(),bucket=getStorage().bucket(bucketName);
  const logo=async(uid:string,invoice:Invoice)=>{
    const draft=invoice.draft;
    if(!draft.company.logoId)return undefined;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(draft.company.logoId))throw Error('Invalid logo reference.');
    const retained=bucket.file(`invoices/${uid}/${invoice.id}/logo`);
    try {const [meta]=await retained.getMetadata();const [bytes]=await retained.download();return `data:${meta.contentType};base64,${bytes.toString('base64')}`;}
    catch(e){if(Number((e as {code?:number}).code)!==404)throw e;}
    const file=bucket.file(`business/${uid}/_settings/${draft.company.logoId}`);
    const [metadata]=await file.getMetadata();
    if(!['image/png','image/jpeg'].includes(metadata.contentType||'')||Number(metadata.size)>5*1024*1024)throw Error('Invalid business logo.');
    const [data]=await file.download();
    await reserveStorage(db,bucket,uid,createHash('sha256').update(retained.name).digest('hex'),retained.name,data.length,invoice.id,'invoice');
    try{await retained.save(data,{resumable:false,contentType:metadata.contentType,preconditionOpts:{ifGenerationMatch:0}});}catch(e){if(Number((e as {code?:number}).code)!==412)throw e;}
    const [frozen]=await retained.download();const [frozenMeta]=await retained.getMetadata();return `data:${frozenMeta.contentType};base64,${frozen.toString('base64')}`;
  };
  const repository=(uid:string):FinanceRepository=>({
    transaction:action=>db.runTransaction(tx=>action({get:async<T,>(path:string)=>(await tx.get(db.doc(path))).data() as T|undefined,set:(path,value)=>{tx.set(db.doc(path),JSON.parse(JSON.stringify(value)));}})),
    invoicePdf:async invoice=>invoicePdf(invoice.draft,invoice.reference,await logo(uid,invoice),true),
    creditPdf:async(invoice,credit)=>creditPdf(invoice,credit,await logo(uid,invoice)),
    putPdf:async(path,pdf)=>{
      if(pdf.size>8*1024*1024)throw Error('Invoice PDF exceeds the 8 MB limit.');
      const file=bucket.file(path);
      if((await file.exists())[0])return;
      await reserveStorage(db,bucket,uid,createHash('sha256').update(path).digest('hex'),path,pdf.size,path.split('/')[2],'invoice');
      try {await file.save(Buffer.from(await pdf.arrayBuffer()),{resumable:false,contentType:'application/pdf',preconditionOpts:{ifGenerationMatch:0}});}
      catch(e){if(Number((e as {code?:number}).code)!==412)throw e; /* An earlier retry already retained the original. */}
    },
  });
  app.use('/api/invoices',async(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    try {
      const token=req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
      if(!token){res.status(401).json({error:'Sign in to access invoices.'});return;}
      const user=await getAuth().verifyIdToken(token,true);res.locals.invoiceUid=user.uid;next();
    }catch {res.status(401).json({error:'Sign in again to access invoices.'});}
  });
  app.get('/api/invoices',async(req,res)=>{
    try {
      let query=db.collection(`users/${res.locals.invoiceUid}/invoices`).orderBy(FieldPath.documentId()).limit(200);
      if(req.query.after)query=query.startAfter(String(req.query.after));
      const docs=await query.get();res.json({invoices:docs.docs.map(d=>d.data()),next:docs.size===200?docs.docs.at(-1)!.id:null});
    }catch{res.status(503).json({error:'Invoice records could not be loaded. Check the backend configuration and connection.'});}
  });
  app.get('/api/invoices/:id/pdf',async(req,res)=>{
    try{
      const invoice=(await db.doc(financePath(res.locals.invoiceUid,req.params.id)).get()).data() as Invoice|undefined;
      const credit=invoice?.credits.find(c=>c.id===req.query.credit&&c.state==='Issued');
      if(!invoice||(req.query.credit?!credit:invoice.state!=='Issued')){res.status(404).json({error:'Issued PDF not found.'});return;}
      const [bytes]=await bucket.file(credit?.pdfPath||invoice.pdfPath).download();
      res.type('application/pdf').send(bytes);
    }catch{res.status(503).json({error:'Original PDF could not be downloaded. Connect and retry.'});}
  });
  app.get('/api/invoices/:id/logo',async(req,res)=>{
    try{
      const uid=res.locals.invoiceUid as string;
      const invoice=(await db.doc(financePath(uid,req.params.id)).get()).data() as Invoice|undefined;
      if(!invoice||invoice.state!=='Issued'){res.status(404).json({error:'Issued invoice not found.'});return;}
      res.json({logo:await logo(uid,invoice)||null});
    }catch{res.status(503).json({error:'Retained invoice logo could not be loaded.'});}
  });
  app.post('/api/invoices/:id/:action',async(req,res)=>{
    try{
      const uid=res.locals.invoiceUid as string,id=req.params.id;
      if (!hasBusinessAccess((await db.doc(`users/${uid}`).get()).data())) {
        res.status(403).json({error:'An active Business subscription is required to change invoices. Existing records and PDFs can still be exported.'});return;
      }
      const result=req.params.action==='issue'?await issueInvoice(repository(uid),uid,id,req.body.draft):req.params.action==='credit'?await issueCredit(repository(uid),uid,id,req.body.operationId,req.body.data):await applyAction(repository(uid),uid,id,req.body.operationId,req.params.action,req.body.data||{});
      res.json({invoice:result});
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const safe=/^(Select |Enter |Supplier |Customer |Billing |Payment |Project |Invoice |Credit |Construction |Non-VAT |VAT |Choose |Quantities |Discount |Use |Value |Line |Due |Service |Add |Finish |This |Issued |Unknown invoice|Invalid |Quote validity|Document footer|Business header|PDF export)/.test(message);
      res.status(safe?400:503).json({error:safe?message:'The financial action could not finish. Your operation is retained for retry; check server credentials, Storage and connection. Do not create a replacement invoice.'});
    }
  });
}
