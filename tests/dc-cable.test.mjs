import test from 'node:test';
import assert from 'node:assert/strict';
import { dcCableDesign } from '../src/utils/dcCable.ts';
import { CONDUCTOR_RESISTANCE } from '../src/data/electrical.ts';

const base={voltage:24,loadMode:'power',load:60,length:1,material:'copper',resistanceModel:'workbook',temperature:20,maxDropPercent:5,currentDensity:6,deratingFactor:1,minimumSize:1};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('all twelve populated workbook examples reproduce their cached M:T results',()=>{
  // Numeric fixtures only; no employer, client or project identifiers are copied.
  const rows=[
    [30,12,1.5,2.5,0.14583333333333331,0.4166666666666667,0.05833333333333334,0.004861111111111112,11.941666666666666],
    [30,12,1.5,2.5,0.14583333333333331,0.4166666666666667,0.05833333333333334,0.004861111111111112,11.941666666666666],
    ...Array.from({length:7},()=>[60,24,1.5,2.5,0.07291666666666666,0.4166666666666667,0.05833333333333334,0.002430555555555556,23.941666666666666]),
    ...Array.from({length:2},()=>[60,24,2.5,2.5,0.07291666666666666,0.4166666666666667,0.035,0.0014583333333333334,23.965]),
    [100,24,1.5,4.166666666666667,0.12152777777777779,0.6944444444444445,0.09722222222222225,0.0040509259259259274,23.90277777777778],
  ];
  assert.equal(rows.length,12);
  for(const [power,voltage,size,current,areaV,areaI,drop,fraction,loadV] of rows){
    const r=dcCableDesign({...base,voltage,load:power},size,false);
    close(r.current,current);close(r.minimumVoltageArea,areaV);close(r.minimumCurrentArea,areaI);
    close(r.requiredMinimumArea,Math.max(areaV,areaI));close(r.voltageDrop,drop);close(r.percentageDrop,fraction*100);close(r.finalVoltage,loadV);
  }
});
test('power/current modes agree; both criteria govern upward size selection',()=>{
  const input={...base,loadMode:'current',load:30,length:1};
  const r=dcCableDesign(input,1,true);
  close(r.minimumCurrentArea,5);assert.equal(r.suggestedSize,6);
  const p=dcCableDesign({...input,loadMode:'power',load:720},1,true);
  close(p.voltageDrop,r.voltageDrop);
  const derated=dcCableDesign({...input,deratingFactor:0.5},1,true);
  assert.equal(derated.suggestedSize,10);
  const shortManual=dcCableDesign(input,1,false);
  assert.equal(shortManual.voltagePass,true);assert.equal(shortManual.densityPass,false);assert.equal(shortManual.isCompliant,false);
});
test('recorded resistance remains distinct from ideal workbook resistivity',()=>{
  const input={...base,loadMode:'current',load:10,length:15,currentDensity:null};
  const r=dcCableDesign({...input,resistanceModel:'table'},4,false);
  close(r.voltageDrop,2*15*10*CONDUCTOR_RESISTANCE.copper[4]/1000);
  const ideal=dcCableDesign(input,4,false);
  close(ideal.voltageDrop,2*15*10*0.0175/4);assert.notEqual(ideal.voltageDrop,r.voltageDrop);
  const hot=dcCableDesign({...input,resistanceModel:'table',temperature:70},4,false);
  close(hot.voltageDrop/r.voltageDrop,1.1965);
  const al=dcCableDesign({...input,resistanceModel:'table',material:'aluminium',temperature:90},16,false);
  close(al.unitResistance/CONDUCTOR_RESISTANCE.aluminium[16],1.2821);
});
test('minimum availability, manual changes, no-size outcome and negative load voltage are explicit',()=>{
  assert.equal(dcCableDesign({...base,minimumSize:16},1,true).suggestedSize,16);
  assert.equal(dcCableDesign(base,1,false).cableSize,1);
  assert.equal(dcCableDesign(base,4,false).cableSize,4);
  const excessive=dcCableDesign({...base,load:100000000,length:1000},1,true);
  assert.equal(excessive.suggestedSize,null);assert.equal(excessive.isCompliant,false);assert.ok(excessive.finalVoltage<0);
  const onlyDrop=dcCableDesign({...base,loadMode:'current',load:30,currentDensity:null},1,true);
  assert.equal(onlyDrop.minimumCurrentArea,null);assert.equal(onlyDrop.suggestedSize,1);
});
test('bad inputs, missing aluminium rows and invalid current-density assumptions fail closed',()=>{
  for(const change of [{voltage:0},{voltage:NaN},{load:0},{load:Infinity},{length:-1},{maxDropPercent:100},{maxDropPercent:0},{temperature:NaN},{temperature:91},{deratingFactor:0},{deratingFactor:1.1},{currentDensity:0},{minimumSize:401},{material:'aluminium'},{loadMode:'unknown'}]) assert.throws(()=>dcCableDesign({...base,...change},1,false));
  assert.throws(()=>dcCableDesign({...base,resistanceModel:'table',material:'aluminium'},1,false),/No recorded/);
});

test('an exact voltage-drop boundary passes without letting a genuinely higher drop pass',()=>{
  const input={...base,voltage:10,loadMode:'current',load:1,length:10,maxDropPercent:3.5,currentDensity:null};
  const exact=dcCableDesign(input,1,false);
  close(exact.voltageDrop,0.35);assert.equal(exact.voltagePass,true);
  assert.equal(dcCableDesign({...input,length:10.000001},1,false).voltagePass,false);
});
