import express, {type Express} from 'express';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHash} from 'node:crypto';
import {hasBusinessAccess} from '../src/subscriptions';
import {issueRams,ramsPath,canonicalJson,type RamsRepository} from '../src/business/rams/engine';
import {assertDraft,type IssuedRams} from '../src/business/rams/model';
import {ramsPdf} from '../src/business/rams/pdf';
import {accountFiles,reserveStorage,storageLimit,capacityUsed} from './storage-allowance';

export function installRamsRoutes(app:Express,bucketName:string,databaseId='(default)') {
  const db=getFirestore(databaseId),bucket=getStorage().bucket(bucketName);
  app.use('/api/rams',express.json({limit:'12mb'}),async(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try{const token=req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();const identity=await getAuth().verifyIdToken(token,true);
      const profile=(await db.doc(`users/${identity.uid}`).get()).data();
      if(profile?.deletionPending)throw Error();
      res.locals.ramsUid=identity.uid;
      if(req.method!=='GET'&&!hasBusinessAccess(profile))return res.status(403).json({error:'An active Business subscription is required. Existing RAMS remain available to view and export.'});
      next();
    }catch{return res.status(401).json({error:'Sign in again to access your RAMS.'});}
  });
  const logo=async(uid:string,id:string|undefined)=>{
    if(!id)return undefined;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('RAMS logo reference is invalid.');
    const file=bucket.file(`business/${uid}/_settings/${id}`),[meta]=await file.getMetadata();
    if(!['image/png','image/jpeg'].includes(meta.contentType||'')||Number(meta.size)>5*1024*1024)throw Error('RAMS logo must be a PNG/JPEG up to 5 MB.');
    const [bytes]=await file.download();return `data:${meta.contentType};base64,${bytes.toString('base64')}`;
  };
  const put=async(uid:string,path:string,pdf:Blob,record:IssuedRams)=>{
    const existing=bucket.file(path);
    try{const [meta]=await existing.getMetadata();if(meta.metadata?.fingerprint!==record.fingerprint)throw Error('RAMS retained PDF differs from this issue attempt. Contact support.');return;}
    catch(error){if(Number((error as {code?:number}).code)!==404)throw error;}
    await reserveStorage(db,bucket,uid,record.id,path,pdf.size,record.id,'rams');
    const file=bucket.file(path);
    try{await file.save(Buffer.from(await pdf.arrayBuffer()),{resumable:false,contentType:'application/pdf',metadata:{metadata:{fingerprint:record.fingerprint}},preconditionOpts:{ifGenerationMatch:0}});}
    catch(error){if(Number((error as {code?:number}).code)!==412)throw error;const [meta]=await file.getMetadata();if(meta.metadata?.fingerprint!==record.fingerprint)throw Error('RAMS retained PDF differs from this issue attempt. Contact support.');}
  };
  const repository=(uid:string):RamsRepository=>({
    transaction:work=>db.runTransaction(tx=>work({get:async<T,>(path:string)=>(await tx.get(db.doc(path))).data() as T|undefined,set:(path,value)=>{tx.set(db.doc(path),JSON.parse(JSON.stringify(value)));}})),
    pdf:async record=>{
      const file=bucket.file(record.pdfPath);
      try{const [meta]=await file.getMetadata();if(meta.metadata?.fingerprint!==record.fingerprint)throw Error('RAMS retained PDF differs from this issue attempt. Contact support.');const [bytes]=await file.download();return new Blob([Uint8Array.from(bytes)],{type:'application/pdf'});}
      catch(error){if(Number((error as {code?:number}).code)!==404)throw error;}
      return ramsPdf(record.snapshot,await logo(uid,record.snapshot.company.logoId),true,record.declaration);
    },
    putPdf:(path,pdf,record)=>put(uid,path,pdf,record),
  });
  const failure=(res:express.Response,error:unknown)=>{
    const text=error instanceof Error?error.message:'';
    const safe=/^(RAMS|Project|Confirm|This issue|Another revision|A newer revision|File must|File reservation|Business storage|Business name|Storage inventory|Document title|Reference|Hazard|Method section|Complete the|Check copied|Briefing|End date|Review date|Scope is|Prepared by|Preparer job|Issue date|Customer is|Site address|Revision must|Add at least)/.test(text);
    res.status(safe?409:503).json({error:safe?text:'RAMS could not be saved to the server. Your draft or pending issue is retained. Check connection, Business access and server configuration, then retry the same document.'});
  };
  app.get('/api/rams',async(req,res)=>{
    try{const uid=res.locals.ramsUid;let query=db.collection(`users/${uid}/rams`).orderBy(FieldPath.documentId()).limit(200);
      if(req.query.after)query=query.startAfter(String(req.query.after));const docs=await query.get();
      res.json({records:docs.docs.map(d=>d.data()),next:docs.size===200?docs.docs.at(-1)!.id:null});
    }catch(error){failure(res,error);}
  });
  app.get('/api/rams/capacity',async(_req,res)=>{try{const uid=res.locals.ramsUid,files=await accountFiles(bucket,uid),reservations=await db.collection(`users/${uid}/storageReservations`).limit(5000).get();
    const held=reservations.docs.map(doc=>{const r=doc.data();return {path:r.path,bytes:r.bytes,expiresAt:r.expiresAt.toMillis()};});
    res.json({used:capacityUsed(files,held,Date.now()),limit:storageLimit()});}catch(error){failure(res,error);}});
  app.get('/api/rams/:id/pdf',async(req,res)=>{
    try{const uid=res.locals.ramsUid,record=(await db.doc(ramsPath(uid,req.params.id)).get()).data() as IssuedRams|undefined;
      if(!record||record.state!=='Issued')return res.status(404).json({error:'Issued RAMS PDF was not found.'});
      const [bytes]=await bucket.file(record.pdfPath).download();res.type('application/pdf').send(bytes);
    }catch(error){failure(res,error);}
  });
  app.post('/api/rams/:id/issue',async(req,res)=>{
    try{const uid=res.locals.ramsUid;const record=await issueRams(repository(uid),uid,req.body.projectId,req.params.id,req.body.draft,req.body.reviewed===true,req.body.controlsAcknowledged===true,String(req.body.confirmedName||''));res.json({record});}
    catch(error){failure(res,error);}
  });
  app.post('/api/rams/:id/attachment',async(req,res)=>{
    try{const uid=res.locals.ramsUid,id=req.params.id,path=ramsPath(uid,id),projectId=req.body.projectId;ramsPath(uid,projectId);assertDraft(req.body.draft);
      if(!req.body.draft.title.trim())throw Error('RAMS attachment needs a title.');
      if(typeof req.body.pdf!=='string'||req.body.pdf.length>12*1024*1024||!/^[A-Za-z0-9+/=]+$/.test(req.body.pdf))throw Error('RAMS attachment must be an unencrypted PDF up to 8 MB.');
      const bytes=Buffer.from(req.body.pdf,'base64');
      if(bytes.length>8*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))throw Error('RAMS attachment must be a complete PDF up to 8 MB.');
      const fingerprint=createHash('sha256').update(bytes).update(canonicalJson(req.body.draft)).digest('hex');
      const record=await db.runTransaction(async tx=>{
        const existing=await tx.get(db.doc(path)),parent=await tx.get(db.doc(`users/${uid}/business/${projectId}`));
        const referenceRef=db.doc(`users/${uid}/ramsReferences/${createHash('sha256').update(req.body.draft.reference.trim().toLowerCase()).digest('hex')}`),reference=await tx.get(referenceRef);
        if(existing.exists){if(existing.data()?.fingerprint!==fingerprint)throw Error('RAMS attachment retry does not match the original.');return existing.data() as IssuedRams;}
        if(reference.exists)throw Error('RAMS reference is already in use. Choose another document.');
        if(!parent.exists||parent.data()?.deleted)throw Error('Project must be synced before attaching a PDF.');
        const now=new Date().toISOString();const value:IssuedRams={id,projectId,familyId:id,reference:req.body.draft.reference,revision:1,state:'Preparing',kind:'attachment',snapshot:req.body.draft,fingerprint,pdfPath:`rams/${uid}/${id}/original.pdf`,issuedAt:now,updatedAt:now,declaration:{uid,name:'External attachment - not reviewed by the app',at:now,controlsAcknowledged:false}};
        tx.set(db.doc(path),value);tx.set(referenceRef,{familyId:id});tx.set(db.doc(`users/${uid}/ramsProjectLocks/${projectId}`),{retained:true});return value;
      });
      if(record.state!=='Issued'){await put(uid,record.pdfPath,new Blob([bytes],{type:'application/pdf'}),record);await db.doc(path).update({state:'Issued',updatedAt:new Date().toISOString()});}
      res.json({record:{...record,state:'Issued'}});
    }catch(error){failure(res,error);}
  });
}
