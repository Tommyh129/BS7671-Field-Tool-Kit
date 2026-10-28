import {auth} from '../firebase';
import {getApiUrl} from '../services/api';
export async function reserveBusinessUpload(uid:string,id:string,projectId:string,bytes:number,recordId:string,kind:string) {
  if(auth.currentUser?.uid!==uid)throw Error('Sign in to upload your own files.');
  const response=await fetch(getApiUrl('/api/business-storage/reserve'),{method:'POST',headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify({id,projectId,bytes,recordId,kind}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'File capacity could not be checked. Your local copy is retained.');
}
