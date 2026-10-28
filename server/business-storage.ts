import type {Express} from 'express';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {hasBusinessAccess} from '../src/subscriptions';
import {reserveStorage} from './storage-allowance';

export function installBusinessStorageRoutes(app:Express,bucketName:string,databaseId='(default)') {
  app.post('/api/business-storage/reserve',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const bearer=req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    let uid:string;try{if(!bearer)throw Error();uid=(await getAuth().verifyIdToken(bearer,true)).uid;}catch{return res.status(401).json({error:'Sign in again before uploading business files.'});}
    try{const db=getFirestore(databaseId),profile=(await db.doc(`users/${uid}`).get()).data();
      if(profile?.deletionPending||!hasBusinessAccess(profile))return res.status(403).json({error:'Business access is required for cloud uploads. Your file remains saved on this device.'});
      const {id,projectId,recordId,kind,bytes}=req.body;
      if(![id,recordId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v))||typeof projectId!=='string'||!['photo','quote','settings'].includes(kind))throw Error('Invalid upload reference.');
      if(kind==='settings'){if(projectId!=='')throw Error('Invalid profile upload.');}
      else{if(!/^[A-Za-z0-9_-]{1,100}$/.test(projectId))throw Error('Invalid project.');const project=(await db.doc(`users/${uid}/business/${projectId}`).get()).data();if(!project||project.kind!=='project'||project.deleted)throw Error('Sync the project before uploading its files.');}
      const path=`business/${uid}/${projectId||'_settings'}/${id}`;
      res.json(await reserveStorage(db,getStorage().bucket(bucketName),uid,id,path,bytes,recordId,kind));
    }catch(error){const message=error instanceof Error?error.message:'';res.status(409).json({error:/^(Business storage|File must|Storage inventory|Sync the project)/.test(message)?message:'File capacity could not be checked. Your local copy is retained. Retry when connected.'});}
  });
}
