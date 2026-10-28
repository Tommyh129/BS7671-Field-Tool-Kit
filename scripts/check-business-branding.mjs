import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {blankCompany,blankProject,materialItem,sellingItem,documentOptions,calculationSnapshot} from '../src/business/model.ts';
import {quotePdf,materialsPdf,snapshotPdf} from '../src/business/pdf.ts';
import {calculationTextPdf} from '../src/business/documents.ts';
const out='build/branding-qa';await mkdir(out,{recursive:true});
const image=async name=>`data:image/${name.endsWith('.png')?'png':'jpeg'};base64,${(await readFile(`${out}/${name}`)).toString('base64')}`;
const png=await image('transparent-logo.png'),jpeg=await image('wide-logo.jpg'),portrait=await image('portrait-logo.png');
const company={...blankCompany(),name:'Example Electrical Services',legalName:'Example Electrical Services Limited',address:'Example business address\nUnited Kingdom',contactName:'QA Contact',email:'office@example.com',phone:'PHONE_QA_ONLY',website:'example.com',registrationNumber:'REG_QA',vatRegistered:true,vatNumber:'VAT_QA',footer:'QA FOOTER - professional services | example.com',paymentInstructions:'PAYMENT_QA_ONLY - payment by the agreed date.',bankDetails:'BANK_QA_ONLY - synthetic test data, not a real account.'};
const project={...blankProject('001'),customer:'Example Customer',title:'Kitchen rewire',address:'Example project site',email:'CUSTOMER_EMAIL_QA',notes:'PRIVATE_PROJECT_NOTES'};
const quote={reference:'Q-BRAND-001',revision:2,type:'Quote',issueDate:'2026-10-17',validUntil:'2026-11-16',company,customer:project,scope:'Supply and install the equipment listed below.',items:Array.from({length:35},(_,i)=>({...sellingItem(),description:`Circuit ${i+1}: lighting installation and testing, including the agreed fixings and connections.`,quantity:'2.5',unit:'each',rate:'19.99'})),discount:'10.00',vatPercent:'20',terms:company.terms,exclusions:'Decoration outside the agreed scope.',notes:'Customer-facing note.',status:'Sent',issuedAt:'2026-10-17',documentOptions:documentOptions()};
const list={name:'Client materials schedule',notes:'PRIVATE_LIST_NOTES',items:Array.from({length:18},(_,i)=>({...materialItem(),description:`Cable and fixings ${i+1}`,code:`CODE-${i+1}`,supplier:'PRIVATE_SUPPLIER',notes:'PRIVATE_ITEM_NOTES',quantity:'25.5',unit:'metres',cost:'1234.56',purchased:true}))};
const calc=calculationSnapshot('Kitchen circuit',{id:'PRIVATE_HISTORY_ID',userId:'PRIVATE_UID',type:'circuit',title:'Circuit calculation',createdAt:'2026-10-17',inputs:{lengthM:'25',loadKw:'2'},results:{cableSize:4,voltageDrop:2.5,privateNotes:'PRIVATE_RESULT_NOTES',cost:'PRIVATE_COST',dataSources:[{id:'example-reference',verification:'unverified',notes:['QA source metadata only; not a compliance claim.']}]}});
const long={...company,name:'Example Electrical Installation Inspection Testing Maintenance and Specialist Engineering Services for Residential Commercial and Industrial Properties Across the United Kingdom',legalName:'Example Electrical Limited'};
const cases=[
  ['transparent-quote.pdf',quotePdf(quote,png)],
  ['branded-estimate.pdf',quotePdf({...quote,type:'Estimate',company:long,documentOptions:documentOptions({showContactDetails:false,showPaymentInstructions:true,showBankDetails:true})},jpeg)],
  ['text-only.pdf',quotePdf({...quote,company:{...blankCompany(),name:'Text Header Business'},items:quote.items.slice(0,2)})],
  ['client-materials.pdf',materialsPdf(project,list,company,png)],
  ['internal-materials.pdf',materialsPdf(project,list,company,png,{internal:true})],
  ['calculation-report.pdf',snapshotPdf(calc.name,calc,company,project,png)],
  ['text-calculation-report.pdf',calculationTextPdf('Zs = 0.35 ohm\nStatus: PASS\nReference data is not fully verified.',company,project,'CALC-QA',jpeg)],
  ['portrait-logo.pdf',quotePdf({...quote,items:quote.items.slice(0,2)},portrait)]
];
for(const [name,blob] of cases)await writeFile(`${out}/${name}`,Buffer.from(await blob.arrayBuffer()));
console.log(`Generated ${cases.length} synthetic branding PDFs in ${out}.`);
