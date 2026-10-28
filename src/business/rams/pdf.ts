import { Document } from '../documents';
import { ukDate } from '../model';
import { RAMS_NOTE, LIKELIHOOD, SEVERITY, riskValue, type RamsDraft } from './model';

export function ramsPdf(draft: RamsDraft, logo?: string, issued = false, declaration?: {name:string;at:string}): Blob {
  const d = new Document(`${draft.reference} | Revision ${draft.revision}`, draft.company, logo, {showBankDetails:false,showPaymentInstructions:false});
  d.paragraph(`RAMS ${draft.reference} | Revision ${draft.revision}`,14,true);
  d.paragraph(draft.title,12,true);
  d.paragraph(`Status: ${issued?'Issued':draft.status} | Issue date: ${ukDate(draft.issueDate)}`,9);
  d.section('Project and site', [`Project ${draft.projectNumber}: ${draft.projectTitle}`,draft.customer,draft.site, draft.location].filter(Boolean).join('\n'));
  d.section('Description and scope', [draft.description,draft.scope].filter(Boolean).join('\n'));
  d.section('Work dates and review', [`Proposed: ${draft.startDate?ukDate(draft.startDate):'Not recorded'} to ${draft.endDate?ukDate(draft.endDate):'Not recorded'}`,`Review date: ${draft.reviewDate?ukDate(draft.reviewDate):'Not recorded'}`].join('\n'));
  d.section('Preparation and review', [`Prepared by: ${draft.preparedBy} | ${draft.preparedRole}`,`Reviewer (manually recorded): ${draft.reviewedBy||'Not recorded'} | ${draft.reviewedRole}`].join('\n'));
  d.section('Site contacts',draft.contacts);
  d.section('Site-specific conditions and interfaces',draft.siteConditions);
  d.paragraph('Risk assessment',12,true);
  if(draft.hazards.some(h=>h.initial||h.residual)){
    d.section('Optional risk matrix', 'User-selected likelihood (1-5) x severity (1-5) = score (1-25). No automatic acceptance threshold is applied. A low score does not establish that work is safe.\n'+LIKELIHOOD.join('\n')+'\n'+SEVERITY.join('\n'));
    d.table(['Likelihood / severity','1','2','3','4','5'],[1,2,3,4,5].map(l=>[String(l),...[1,2,3,4,5].map(s=>String(l*s))]),[80,20,20,20,20,20]);
  }
  draft.hazards.forEach((h,index)=>{
    d.paragraph(`Hazard ${index+1}: ${h.task}`,10,true);
    d.table(['Assessment field','User assessment'],[
      ['Hazard',h.hazard],['Who may be harmed and how',h.harmed],['Existing controls',h.controls],['Further actions',h.further||'None recorded'],
      ['Responsible / due / completion',[h.responsible,h.due?ukDate(h.due):'',h.completion].filter(Boolean).join(' | ')],
      ['Initial / residual risk',`${riskValue(h.initial)??'Not scored'} / ${riskValue(h.residual)??'Not scored'}`],
    ],[55,125]);
  });
  d.paragraph('Method statement',12,true);
  draft.sections.forEach(s=>{
    d.section(s.title,s.notApplicable?`Not applicable${s.explanation?': '+s.explanation:''}`:s.content||'Not completed');
    if(s.hazardIds.length)d.paragraph('Linked hazards: '+s.hazardIds.map(id=>draft.hazards.findIndex(h=>h.id===id)+1).filter(n=>n>0).join(', '),9);
  });
  if(declaration)d.section('User declaration',`Recorded by ${declaration.name} at ${declaration.at}. Reviewed for the actual task and site; required controls must be implemented before the relevant work begins. This is the user's declaration, not independent verification of competence or approval by The Sparky's Mate.`);
  if(draft.briefings.length){
    d.paragraph('Optional briefing record',12,true);
    d.paragraph('Records acknowledgement of a briefing, not proof of competence or guaranteed understanding.',9);
    for(const b of draft.briefings){
      d.paragraph(`${b.person} | ${ukDate(b.date)} | Revision ${b.revision} | ${b.acknowledged?'Acknowledged':'Not acknowledged'}`,9);
      if(b.signature){d.ensure(24);const p=d.pdf.getImageProperties(b.signature);const scale=Math.min(55/p.width,18/p.height);d.pdf.addImage(b.signature,p.fileType,15,d.y,p.width*scale,p.height*scale);d.y+=23;}
    }
  }
  d.section('Responsibility',RAMS_NOTE);
  if(!issued){for(let page=1;page<=d.pdf.getNumberOfPages();page++){d.pdf.setPage(page);d.pdf.setFontSize(46);d.pdf.setTextColor(225);d.pdf.text('DRAFT',110,170,{align:'center',angle:35});}}
  return d.finish();
}
