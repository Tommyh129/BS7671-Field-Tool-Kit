import {readFile, writeFile} from 'node:fs/promises';
const file=new URL('../ios/App/CapApp-SPM/Package.swift',import.meta.url);
const source=await readFile(file,'utf8');
const normalized=source.replace(/(path:\s*")([^"]+)(")/g,(_match,start,value,end)=>start+value.replaceAll('\\','/')+end);
if(normalized!==source) await writeFile(file,normalized);
console.log('iOS local Swift package paths use portable forward slashes.');
