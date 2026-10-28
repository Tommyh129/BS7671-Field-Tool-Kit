import { CONDUCTOR_RESISTANCE, getResistanceSizes } from '../data/electrical';

export interface DcCableInputs {
  voltage: number;
  loadMode: 'current' | 'power';
  load: number;
  length: number;
  material: 'copper' | 'aluminium';
  resistanceModel: 'table' | 'workbook';
  temperature: number;
  maxDropPercent: number;
  currentDensity: number | null;
  deratingFactor: number;
  minimumSize: number;
}

// Workbook rho is an idealised copper estimate; recorded rows remain the default.
export const DC_COPPER_RESISTIVITY_20 = 0.0175;
export const DC_TEMPERATURE_COEFFICIENT = {copper:0.00393, aluminium:0.00403};
const withinLimit = (value:number, limit:number) => value<=limit || value-limit<=8*Number.EPSILON*Math.max(Math.abs(value),Math.abs(limit));

export function dcCableDesign(input: DcCableInputs, selectedSize: number, autoSelect: boolean) {
  const {voltage, load, loadMode, length, material, resistanceModel, temperature, maxDropPercent, currentDensity, deratingFactor, minimumSize} = input;
  if (!['copper','aluminium'].includes(material) || !['table','workbook'].includes(resistanceModel) || !['current','power'].includes(loadMode)) throw Error('Select a supported DC calculation method and conductor material.');
  if (![voltage,load,length,maxDropPercent,minimumSize].every(value=>Number.isFinite(value)&&value>0) || maxDropPercent>=100) throw Error('Enter positive voltage, load, one-way length and minimum size; the drop target must be below 100%.');
  if (!Number.isFinite(temperature) || temperature < -20 || temperature > 90) throw Error('Enter a conductor temperature between -20 and 90 degrees C, within the actual cable and termination ratings.');
  if (resistanceModel==='workbook' && material!=='copper') throw Error('The supplied workbook resistivity applies to copper only. Use recorded resistance for aluminium.');
  if (currentDensity !== null && (!Number.isFinite(currentDensity) || currentDensity<=0 || !Number.isFinite(deratingFactor) || deratingFactor<=0 || deratingFactor>1)) throw Error('Enter a positive design current density and a derating factor greater than 0 and no greater than 1.');
  const current = loadMode==='power' ? load/voltage : load;
  if (!Number.isFinite(current) || current<=0 || minimumSize<1 || minimumSize>400) throw Error('Enter a representable positive current and a minimum size from 1 to 400 mm2.');
  const temperatureFactor = 1 + DC_TEMPERATURE_COEFFICIENT[material]*(temperature-20);
  const allowedDrop = voltage*maxDropPercent/100;
  const resistance = (size:number) => {
    const row=CONDUCTOR_RESISTANCE[material][size];
    if (!Number.isFinite(row) || row<=0) throw Error('No recorded conductor size is available for this material.');
    return (resistanceModel==='workbook' ? DC_COPPER_RESISTIVITY_20*1000/size : row)*temperatureFactor;
  };
  const dropAt = (size:number) => 2*length*current*resistance(size)/1000;
  const sizes = getResistanceSizes(material).filter(size=>size>=minimumSize && size<=400);
  const minimumCurrentArea = currentDensity===null ? null : current/(currentDensity*deratingFactor);
  const minimumVoltageArea = resistanceModel==='workbook' ? 2*DC_COPPER_RESISTIVITY_20*temperatureFactor*length*current/allowedDrop : null;
  const requiredMinimumArea = minimumVoltageArea===null ? null : Math.max(minimumVoltageArea,minimumCurrentArea??0);
  const minimumVoltageSize = sizes.find(size=>withinLimit(dropAt(size),allowedDrop))??null;
  const suggestedSize = sizes.find(size=>withinLimit(minimumCurrentArea??0,size) && withinLimit(dropAt(size),allowedDrop))??null;
  const cableSize = autoSelect && suggestedSize!==null ? suggestedSize : selectedSize;
  if (!Number.isFinite(cableSize) || cableSize<1 || cableSize>400) throw Error('Select a conductor size from 1 to 400 mm2.');
  const unitResistance = resistance(cableSize);
  const voltageDrop = dropAt(cableSize);
  const percentageDrop = voltageDrop/voltage*100;
  const finalVoltage = voltage-voltageDrop;
  const densityCapacity = currentDensity===null ? null : cableSize*currentDensity*deratingFactor;
  if (![current,allowedDrop,unitResistance,voltageDrop,percentageDrop,finalVoltage,...[minimumCurrentArea,minimumVoltageArea,requiredMinimumArea,densityCapacity].filter(value=>value!==null)].every(Number.isFinite)) throw Error('These inputs exceed the supported calculation range.');
  const voltagePass = withinLimit(voltageDrop,allowedDrop);
  const densityPass = densityCapacity===null || withinLimit(current,densityCapacity);
  return {current,cableSize,unitResistance,temperatureFactor,allowedDrop,voltageDrop,percentageDrop,finalVoltage,
    minimumVoltageArea,minimumVoltageSize,minimumCurrentArea,requiredMinimumArea,densityCapacity,suggestedSize,voltagePass,densityPass,
    isCompliant:voltagePass && densityPass && cableSize>=minimumSize && (!autoSelect || suggestedSize!==null)};
}
