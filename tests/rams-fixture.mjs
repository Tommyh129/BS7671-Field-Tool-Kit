import {newRams} from '../src/business/rams/model.ts';
import {blankCompany,blankProject} from '../src/business/model.ts';
export const ramsFixture=()=>{
  const project={...blankProject('001'),customer:'QA customer',title:'User-defined job',address:'QA site address'};
  const draft=newRams(project,{...blankCompany(),name:'QA Business',bankDetails:'PRIVATE_BANK_SENTINEL'},'QA preparer');
  Object.assign(draft,{title:'User-written RAMS',scope:'QA user-supplied scope',preparedRole:'QA role'});
  Object.assign(draft.hazards[0],{task:'QA task',hazard:'QA hazard',harmed:'QA affected persons and effects',controls:'QA user-supplied control text'});
  draft.sections=draft.sections.map(s=>({...s,content:['scope','sequence'].includes(s.id)?'QA user-authored text':'',notApplicable:!['scope','sequence'].includes(s.id)}));
  return draft;
};
