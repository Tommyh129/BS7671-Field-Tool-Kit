import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {ramsFixture} from '../tests/rams-fixture.mjs';
import {ramsPdf} from '../src/business/rams/pdf.ts';
await mkdir('build/rams-qa',{recursive:true});
const draft=ramsFixture();
const logo='data:image/png;base64,'+(await readFile('build/branding-qa/transparent-logo.png')).toString('base64');
draft.company.name='QA Long Business Trading Name for Multipage RAMS Document Branding Verification';
draft.company.address='QA business address\nUnited Kingdom';
draft.site='QA multi-line site address\nSecond address line';
draft.hazards=Array.from({length:16},(_,i)=>({...draft.hazards[0],id:'hazard-'+i,task:`QA task ${i+1}`,hazard:('QA user-provided assessment text '+i+' ').repeat(55),controls:'QA user-authored control text. '.repeat(30),initial:{likelihood:3,severity:4},residual:{likelihood:2,severity:4}}));
draft.briefings=[{id:'qa-briefing',person:'QA briefing record',date:'2026-10-20',revision:1,acknowledged:true,signature:logo}];
for(const [name,issued] of [['draft',false],['issued',true]]){
  const blob=ramsPdf(draft,logo,issued,{name:'QA confirmer',at:'2026-10-20T12:00:00Z'});
  await writeFile(`build/rams-qa/${name}.pdf`,Buffer.from(await blob.arrayBuffer()));
}
const plain=ramsFixture();plain.company.name='QA No Logo Business';
await writeFile('build/rams-qa/no-logo.pdf',Buffer.from(await ramsPdf(plain).arrayBuffer()));
console.log('RAMS QA PDFs written to build/rams-qa. These contain QA placeholders, not safety guidance.');
