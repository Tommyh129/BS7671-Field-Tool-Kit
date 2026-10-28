import { Capacitor } from '@capacitor/core';
import { getApiUrl } from '../../services/api';

export function invoiceApiUrl(path:string,native=Capacitor.isNativePlatform(),origin=typeof window==='undefined'?'':window.location.origin){
  if(native)return getApiUrl('/api/invoices'+path);
  if(!origin||origin==='null')throw Error('Open invoices through the app web server.');
  return new URL('/api/invoices'+path,origin).href;
}
