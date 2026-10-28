import test from 'node:test';
import assert from 'node:assert/strict';
import { CableType, InstallationMethod, SupplyType, CircuitType, DeviceType } from '../src/types.ts';
import { CABLE_DATABASE, DEVICE_LIMITS } from '../src/constants.ts';
import { calculateCircuit } from '../src/utils/calculations.ts';
import { getCircuitR1R2MilliOhmsPerMetre } from '../src/utils/resistance.ts';
import { resolveCopperCpcSize, resolveInspectionCpcSize } from '../src/utils/resistance.ts';
import { calculateMaxLength } from '../src/utils/maxLength.ts';
import { getMotorCircuitSizes } from '../src/data/electrical.ts';
import { ELECTRICAL_DATASETS, DATASET_SOURCES, INSTALLATION_ENTRIES, getCableRows, getCombinationIssue, getInstallationIssue, getCorrectionFactors, getDeviceRatings, getResistanceSizes, CONDUCTOR_RESISTANCE, FIELD_TEST_LIMIT_MULTIPLIER, DESIGN_RESISTANCE_MULTIPLIER, formatSourceNotes } from '../src/data/electrical.ts';

const calculate = (kw = 2, length = 10, supply = SupplyType.SINGLE_PHASE, method = InstallationMethod.METHOD_C, cable = CableType.PVC_PVC, ambient = 30, grouping = 1, ze = 0.35, device = DeviceType.MCB_B, rating) => calculateCircuit(kw, length, supply, method, cable, CircuitType.OTHER, ambient, grouping, ze, device, rating);

test('missing cable rows remain missing rather than copied from single-core or neighbours', () => {
  assert.equal(CABLE_DATABASE[CableType.PVC_PVC].some(row => row.size === 400), false);
  assert.equal(CABLE_DATABASE[CableType.PVC_SWA].some(row => row.size === 1), false);
  assert.ok(getCableRows(CableType.PVC_SINGLE).some(row => row.size === 400));
});

test('incompatible constructions fail explicitly but supported methods remain selectable', () => {
  assert.match(getCombinationIssue(CableType.PVC_SWA, InstallationMethod.METHOD_F), /single-core/);
  assert.match(getCombinationIssue(CableType.PVC_SINGLE, InstallationMethod.METHOD_E), /multicore/);
  assert.match(getCombinationIssue(CableType.PVC_SWA, InstallationMethod.METHOD_100), /mapping/);
  assert.match(getCombinationIssue(CableType.PVC_PVC, InstallationMethod.METHOD_D), /Ground/);
  assert.equal(getInstallationIssue(CableType.XLPE_SWA, InstallationMethod.METHOD_C), null);
  assert.equal(getInstallationIssue(CableType.XLPE_SWA, InstallationMethod.METHOD_E), null);
  assert.equal(getInstallationIssue(CableType.XLPE_SWA, InstallationMethod.METHOD_D), null);
  assert.equal(getCombinationIssue(CableType.XLPE_SWA, InstallationMethod.METHOD_C, SupplyType.THREE_PHASE), null);
  assert.deepEqual(getCableRows(CableType.PVC_PVC, InstallationMethod.METHOD_C, SupplyType.THREE_PHASE), []);
  assert.equal(calculate(2, 10, SupplyType.THREE_PHASE), null);
});

test('Cable Finder checks the exact boundary without rounding down or inventing a row', () => {
  const rows = getCableRows(CableType.PVC_PVC, InstallationMethod.METHOD_C);
  const find = current => rows.find(row => row.capacity[InstallationMethod.METHOD_C] >= current);
  assert.equal(find(20).size, 1.5);
  assert.equal(find(20.001).size, 2.5);
  assert.equal(find(10000), undefined);
});

test('correction factors require an explicit legacy entry and correct insulation context', () => {
  assert.equal(getCorrectionFactors(CableType.PVC_PVC, 40, 2).value, 0.87 * 0.8);
  assert.equal(getCorrectionFactors(CableType.PVC_PVC, 31, 1).value, null);
  assert.equal(getCorrectionFactors(CableType.PVC_PVC, 30, 10).value, null);
  assert.equal(getCorrectionFactors(CableType.XLPE_SWA, 30, 1).value, 1);
  assert.equal(getCorrectionFactors(CableType.XLPE_SWA, 40, 1, 90).value, null);
  assert.equal(calculate(2, 10, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.PVC_PVC, 31), null);
});

test('device-specific rating lists retain fuse ratings missing from the old global list', () => {
  assert.ok(getDeviceRatings(DeviceType.BS88_2).includes(2));
  assert.ok(getDeviceRatings(DeviceType.BS88_3).includes(45));
  assert.ok(getDeviceRatings(DeviceType.BS3036).includes(15));
  assert.equal(getDeviceRatings(DeviceType.BS3036).includes(16), false);
  assert.ok(getDeviceRatings(DeviceType.MCB_B).every(rating => rating <= 125));
});

test('unsupported/undersized ratings and out-of-range loads never fall back to another selection', () => {
  assert.equal(calculate(2, 10, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.PVC_PVC, 30, 1, 0.35, DeviceType.MCB_B, 5), null);
  assert.equal(calculate(4, 10, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.PVC_PVC, 30, 1, 0.35, DeviceType.MCB_B, 6), null);
  assert.equal(calculate(100000), null);
  assert.equal(calculate(NaN), null);
  assert.equal(calculate(2, -1), null);
  assert.equal(calculate(2, 10, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.PVC_PVC, 30, 1, -0.1), null);
});

test('representative legacy calculation preserves units, load capacity, and unmultipled Ze', () => {
  const result = calculate();
  assert.ok(result);
  const row = CABLE_DATABASE[CableType.PVC_PVC].find(row => row.size === result.cableSize);
  assert.ok(row.capacity[InstallationMethod.METHOD_C] >= result.protectiveDevice);
  assert.ok(Math.abs(result.voltageDrop - row.mvAm * (2000 / 230) * 10 / 1000) < 1e-10);
  const expectedR = getCircuitR1R2MilliOhmsPerMetre(CableType.PVC_PVC, result.cableSize);
  assert.ok(Math.abs(result.zs - (0.35 + expectedR * 10 * DESIGN_RESISTANCE_MULTIPLIER / 1000)) < 1e-10);
});

test('non-unity correction factors still enforce derated device/cable capacity', () => {
  const result = calculate(4.6, 10, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.PVC_PVC, 50, 9);
  assert.ok(result);
  const row = getCableRows(CableType.PVC_PVC).find(row => row.size === result.cableSize);
  assert.ok(row.capacity[InstallationMethod.METHOD_C] * 0.71 * 0.5 >= result.protectiveDevice);
  assert.equal(calculate(100), null);
  const excessiveLength = calculate(2, 10000);
  assert.ok(excessiveLength);
  assert.equal(excessiveLength.isCompliant, false);
  assert.equal(excessiveLength.sourceVerified, false);
});

test('CPC loop resistance sums explicit conductors; armour and missing pairings are not assumed', () => {
  assert.ok(Math.abs(getCircuitR1R2MilliOhmsPerMetre(CableType.PVC_PVC, 16) - 4.23) < 1e-10);
  assert.equal(getCircuitR1R2MilliOhmsPerMetre(CableType.PVC_PVC, 400), null);
  assert.equal(getCircuitR1R2MilliOhmsPerMetre(CableType.PVC_SWA, 16), null);
});

test('DC copper range includes recorded endpoints; missing aluminium sizes are not extrapolated', () => {
  assert.ok(getResistanceSizes('copper').includes(1));
  assert.ok(getResistanceSizes('copper').includes(400));
  assert.equal(getResistanceSizes('aluminium').includes(1.5), false);
  assert.equal(getResistanceSizes('aluminium').includes(400), false);
  const dcDrop = 2 * 15 * 10 * CONDUCTOR_RESISTANCE.copper[4] / 1000;
  assert.equal(dcDrop, 1.383);
});

test('design Zs and field-test comparisons remain separate', () => {
  assert.equal(FIELD_TEST_LIMIT_MULTIPLIER, 0.8);
  assert.notEqual(1 / DESIGN_RESISTANCE_MULTIPLIER, FIELD_TEST_LIMIT_MULTIPLIER);
  assert.equal(DEVICE_LIMITS[DeviceType.MCB_B][32] * FIELD_TEST_LIMIT_MULTIPLIER, 1.096);
});

test('reference columns are identified without claiming full current-edition verification', () => {
  for (const cable of ELECTRICAL_DATASETS.cables) {
    assert.equal(cable.source.verification, 'unverified');
    assert.match(cable.loadedConductorArrangement, /two loaded/);
    for (const row of cable.rows) {
      assert.equal(row.sourceId, cable.source.id);
      for (const column of row.columns) assert.ok(column.sourceColumn);
    }
  }
  for (const source of Object.values(DATASET_SOURCES)) assert.equal(source.licence, 'not-confirmed');
  const reference = INSTALLATION_ENTRIES.find(entry => entry.id === InstallationMethod.METHOD_C);
  assert.equal(reference.installationNumber, null);
  assert.equal(reference.referenceMethodCode, 'C');
  const numbered = INSTALLATION_ENTRIES.find(entry => entry.id === InstallationMethod.METHOD_100);
  assert.equal(numbered.installationNumber, 100);
  assert.equal(numbered.referenceMethodCode, null);
  assert.match(formatSourceNotes(['protection']), /A3:2024 \(legacy claim only\)/);
  assert.match(formatSourceNotes(['protection']), /table: not verified/);
});

test('SWA phase-specific ratings and drops have no invented 1mm2 row or extra phase conversion', () => {
  for (const type of [CableType.PVC_SWA, CableType.XLPE_SWA]) {
    for (const supply of Object.values(SupplyType)) {
      const rows = getCableRows(type, InstallationMethod.METHOD_C, supply);
      assert.equal(rows[0].size, 1.5);
      assert.equal(rows.at(-1).size, 400);
      assert.ok(rows.every(row => row.size >= 1.5));
      const result = calculateCircuit(2, 10, supply, InstallationMethod.METHOD_C, type, CircuitType.OTHER, 30, 1, .35, DeviceType.MCB_B, undefined, { separateCopperCpcSize: 4 });
      assert.ok(result?.isCompliant);
      const row = rows.find(row => row.size === result.cableSize);
      assert.equal(row.loadedConductors, supply === SupplyType.THREE_PHASE ? 3 : 2);
      assert.ok(Math.abs(result.voltageDrop - row.mvAm * result.loadCurrent * 10 / 1000) < 1e-10);
      assert.equal(result.cpcSize, 4);
    }
  }
  assert.equal(getCableRows(CableType.PVC_SWA, InstallationMethod.METHOD_C, SupplyType.THREE_PHASE)[0].capacity[InstallationMethod.METHOD_C], 18);
});

test('XLPE uses 70C equipment limit unless 90C operation is explicitly selected', () => {
  const at70 = getCableRows(CableType.XLPE_SWA, InstallationMethod.METHOD_C).find(row => row.size === 6);
  const at90 = getCableRows(CableType.XLPE_SWA, InstallationMethod.METHOD_C, SupplyType.SINGLE_PHASE, 90).find(row => row.size === 6);
  assert.equal(at70.capacity[InstallationMethod.METHOD_C], 49);
  assert.equal(at90.capacity[InstallationMethod.METHOD_C], 62);
  assert.equal(at70.ratingTable, '4D4A/4D4B');
  assert.equal(at90.ratingTable, '4E4A/4E4B');
  const result = calculateCircuit(11, 5, SupplyType.SINGLE_PHASE, InstallationMethod.METHOD_C, CableType.XLPE_SWA, CircuitType.OTHER, 30, 1, .35, DeviceType.MCB_B, undefined, { separateCopperCpcSize: 10, operatingTemperature: 90 });
  assert.equal(result.cableSize, 6);
  assert.ok(result.assumptions.some(note => /manufacturer-confirmed/.test(note)));
});

test('method and conductor count select different source columns without substitution', () => {
  const a = getCableRows(CableType.PVC_SINGLE, InstallationMethod.METHOD_A, SupplyType.THREE_PHASE)[0];
  const c = getCableRows(CableType.PVC_SINGLE, InstallationMethod.METHOD_C, SupplyType.THREE_PHASE)[0];
  assert.equal(a.capacity[InstallationMethod.METHOD_A], 10.5);
  assert.equal(c.capacity[InstallationMethod.METHOD_C], 14);
  assert.equal(a.capacityColumn, '3');
  assert.equal(c.capacityColumn, '7');
  assert.equal(getCableRows(CableType.PVC_SINGLE, InstallationMethod.METHOD_A).some(row => row.size === 400), false);
  assert.equal(getCableRows(CableType.XLPE_SWA, InstallationMethod.METHOD_D).some(row => row.size === 400), false);
  assert.equal(getCableRows(CableType.PVC_PVC, InstallationMethod.METHOD_100).find(row => row.size === 1).capacity[InstallationMethod.METHOD_100], 13);
  assert.match(INSTALLATION_ENTRIES.find(entry => entry.id === InstallationMethod.METHOD_101).label, /over 100mm/);
});

test('SWA earth path must be specified; an inadequate CPC is never accepted or upsized silently', () => {
  assert.equal(calculateCircuit(2,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA), null);
  assert.equal(calculateCircuit(20,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{separateCopperCpcSize:1}), null);
  assert.equal(getCircuitR1R2MilliOhmsPerMetre(CableType.XLPE_SWA, 16, 16), 2.3);
  assert.equal(getCircuitR1R2MilliOhmsPerMetre(CableType.XLPE_SWA, 16, 6), null);
});

test('integral SWA CPC is a full-size copper core, including below the standalone CPC minimum', () => {
  for (const type of [CableType.PVC_SWA, CableType.XLPE_SWA]) {
    for (const supply of Object.values(SupplyType)) {
      const result = calculateCircuit(2,10,supply,InstallationMethod.METHOD_C,type,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{cpcArrangement:'integral'});
      assert.ok(result?.isCompliant);
      assert.equal(result.cpcArrangement, 'integral');
      assert.equal(result.cpcSize, result.cableSize);
      assert.equal(result.cpcSize, 1.5);
      assert.ok(result.assumptions.some(note => /dedicated full-size insulated core/.test(note)));
      assert.ok(Math.abs(getCircuitR1R2MilliOhmsPerMetre(type,1.5,undefined,'integral') - 24.2) < 1e-10);
    }
  }
});

test('integral CPC grows with the recommended cable when length or method changes', () => {
  const design = (length, method = InstallationMethod.METHOD_C) => calculateCircuit(4.6,length,SupplyType.SINGLE_PHASE,method,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{cpcArrangement:'integral'});
  const short = design(10);
  const long = design(100);
  const duct = design(100,InstallationMethod.METHOD_D);
  for (const result of [short,long,duct]) {
    assert.ok(result?.isCompliant);
    assert.equal(result.cpcSize, result.cableSize);
  }
  assert.ok(long.cableSize > short.cableSize);
  assert.equal(long.protectiveDevice, short.protectiveDevice);
});

test('recalculating with the load-based rating can recover a constrained manual selection', () => {
  const design = rating => calculateCircuit(2,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,rating,{cpcArrangement:'separate',separateCopperCpcSize:4});
  assert.equal(design(63), null);
  const automatic = design(undefined);
  assert.ok(automatic?.isCompliant);
  assert.equal(automatic.protectiveDevice,10);
  assert.equal(automatic.cpcSize,4);
  const impossible = calculateCircuit(2,100000,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{cpcArrangement:'integral'});
  assert.equal(impossible.isCompliant,false);
});

test('twin-and-earth reports its factory CPC pairing rather than a full-size SWA core', () => {
  const result = calculateCircuit(4.6,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.PVC_PVC);
  assert.ok(result?.isCompliant);
  assert.equal(result.cableSize,1.5);
  assert.equal(result.cpcSize,1);
  assert.equal(result.cpcArrangement,'integral');
});

test('automatic separate CPC sizing needs no manual size and follows conductor upsizing', () => {
  for (const type of [CableType.PVC_SWA, CableType.XLPE_SWA]) {
    const design = length => calculateCircuit(4.6,length,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,type,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{cpcArrangement:'separate',autoSizeSeparateCpc:true});
    const short = design(10);
    const long = design(100);
    assert.ok(short?.isCompliant);
    assert.ok(long?.isCompliant);
    assert.equal(short.cpcSize,4);
    assert.ok(long.cableSize > short.cableSize);
    assert.ok(long.cpcSize > short.cpcSize);
    assert.ok(long.assumptions.some(note => /automatically selected/.test(note)));
    const expectedResistance = getCircuitR1R2MilliOhmsPerMetre(type,long.cableSize,long.cpcSize);
    assert.ok(Math.abs(long.zs - (.35 + expectedResistance * 100 * 1.2 / 1000)) < 1e-10);
  }
});

test('automatic CPC grows independently when Zs needs more than the tabular minimum', () => {
  const result = calculateCircuit(2,30,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,1.7,DeviceType.MCB_C,undefined,{autoSizeSeparateCpc:true,cpcArrangement:'separate'});
  assert.ok(result?.isCompliant);
  assert.equal(result.cableSize,1.5);
  assert.equal(result.cpcSize,16);
  assert.ok(result.zs <= result.maxZs);
  const smallerLoop = getCircuitR1R2MilliOhmsPerMetre(CableType.XLPE_SWA,result.cableSize,10);
  assert.ok(1.7 + smallerLoop * 30 * 1.2 / 1000 > result.maxZs);
});

test('automatic CPC respects three-phase/integral modes and never forces an impossible pass', () => {
  const result = calculateCircuit(20,50,SupplyType.THREE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_C,undefined,{autoSizeSeparateCpc:true,cpcArrangement:'separate'});
  assert.ok(result?.isCompliant);
  assert.ok(result.cpcSize >= 4);
  const integral = calculateCircuit(2,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,{autoSizeSeparateCpc:true,cpcArrangement:'integral'});
  assert.equal(integral.cpcSize,integral.cableSize);
  const impossible = calculateCircuit(2,10,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,21,DeviceType.MCB_B,undefined,{autoSizeSeparateCpc:true});
  assert.ok(impossible);
  assert.equal(impossible.isCompliant,false);
  assert.equal(impossible.zsCompliant,false);
});

test('CPC selection agrees across circuit design, Zs and resistance models', () => {
  const options = {cpcArrangement:'separate',autoSizeSeparateCpc:true};
  const design = calculateCircuit(2,30,SupplyType.SINGLE_PHASE,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,1.7,DeviceType.MCB_C,undefined,options);
  const context = {...options,lengthM:30,ze:1.7,maxZs:design.maxZs,resistanceMultiplier:1.2};
  assert.equal(resolveCopperCpcSize(CableType.XLPE_SWA,design.cableSize,context),design.cpcSize);
  assert.equal(resolveInspectionCpcSize('separate-auto',design.cableSize,1,context),design.cpcSize);
  assert.equal(resolveInspectionCpcSize('manual',2.5,1.5,context),1.5);
  assert.equal(resolveInspectionCpcSize('twin-earth',16,1),6);
  assert.equal(resolveInspectionCpcSize('twin-earth',400,1),null);
  assert.equal(resolveInspectionCpcSize('integral',6,1),6);
});

test('Max Length agrees with circuit sizing across phases, CPC arrangements and temperatures', () => {
  for (const supply of Object.values(SupplyType)) for (const arrangement of ['separate','integral']) for (const temperature of [70,90]) {
    const options = {cpcArrangement:arrangement,autoSizeSeparateCpc:true,operatingTemperature:temperature};
    const design = calculateCircuit(4.6,100,supply,InstallationMethod.METHOD_C,CableType.XLPE_SWA,CircuitType.OTHER,30,1,.35,DeviceType.MCB_B,undefined,options);
    assert.ok(design?.isCompliant);
    const length = calculateMaxLength(CableType.XLPE_SWA,design.cableSize,InstallationMethod.METHOD_C,supply,DeviceType.MCB_B,design.protectiveDevice,.35,design.loadCurrent,5,100,options);
    assert.equal(length.error,null);
    assert.ok(length.isCompliant);
    assert.equal(length.cpcSize,design.cpcSize);
    assert.ok(length.maxLen >= 100);
  }
});

test('Max Length rejects absent columns and overloads, and zero available length never passes', () => {
  const options = {cpcArrangement:'separate',autoSizeSeparateCpc:true};
  const length = (size=2.5,rating=32,ze=.35,target=10) => calculateMaxLength(CableType.XLPE_SWA,size,InstallationMethod.METHOD_C,SupplyType.SINGLE_PHASE,DeviceType.MCB_B,rating,ze,20,5,target,options);
  assert.equal(length(1.5).isCompliant,false);
  assert.equal(length(1.5).limitingFactor,'Current capacity');
  assert.ok(length(1).error);
  assert.ok(length(2.5,5).error);
  assert.ok(length(2.5,32,.35,-1).error);
  assert.equal(length(16,32,21).isCompliant,false);
  assert.equal(length(16,32,21).maxLen,0);
  assert.ok(calculateMaxLength(CableType.XLPE_SWA,400,InstallationMethod.METHOD_D,SupplyType.THREE_PHASE,DeviceType.MCB_B,32,.35,20,5,10,options).error);
});

test('fixed motor-power size selection excludes undersized conductors and stays within 400mm2', () => {
  assert.equal(getMotorCircuitSizes('copper')[0],1.5);
  assert.equal(getMotorCircuitSizes('aluminium')[0],16);
  assert.equal(getMotorCircuitSizes('copper').at(-1),400);
  assert.equal(getMotorCircuitSizes('copper').includes(1),false);
});
