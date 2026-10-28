import { CableData, CableType, InstallationMethod as M, SupplyType } from '../types';

// Public reference transcriptions, not a verification of the complete current amendment.
export const CABLE_REFERENCES = {
  flat: 'https://www.elandcables.com/media/3hoka0mu/table-4d5.pdf',
  singles: 'https://www.elandcables.com/media/vyrp3kxq/table-4d1a-and-4d1b.pdf',
  pvcArmoured: 'https://www.elandcables.com/media/of4pe0xx/table-4d4a-and-4d4b.pdf',
  xlpeArmoured: 'https://www.elandcables.com/media/cnwh0k2l/table-4e4a-and-4e4b.pdf',
  iet: 'https://electrical.theiet.org/wiring-matters/years/2022/93-november-2022/thermoplastic-pvc-or-thermosetting-xlpe-swa-cable/',
};

// size, C (two/three loaded), E (two/three loaded), D1 duct (two/three loaded).
// The 1.5 mm2 C/three-loaded cell is checked against the IET's Figure 3:
// Eland's 4D4A has a transcription error (118 rather than 18 A) in that cell.
const armoured70 = [
  [1.5,21,18,22,19,22,18], [2.5,28,25,31,26,29,24],
  [4,38,33,41,35,37,30], [6,49,42,53,45,46,38],
  [10,67,58,72,62,60,50], [16,89,77,97,83,78,64],
  [25,118,102,128,110,99,82], [35,145,125,157,135,119,98],
  [50,175,151,190,163,140,116], [70,222,192,241,207,173,143],
  [95,269,231,291,251,204,169], [120,310,267,336,290,231,192],
  [150,356,306,386,332,261,217], [185,405,348,439,378,292,243],
  [240,476,409,516,445,336,280], [300,547,469,592,510,379,316],
  [400,621,540,683,590],
];
const armoured90 = [
  [1.5,27,23,29,25,25,21], [2.5,36,31,39,33,33,28],
  [4,49,42,52,44,43,36], [6,62,53,66,56,53,44],
  [10,85,73,90,78,71,58], [16,110,94,115,99,91,75],
  [25,146,124,152,131,116,96], [35,180,154,188,162,139,115],
  [50,219,187,228,197,164,135], [70,279,238,291,251,203,167],
  [95,338,289,354,304,239,197], [120,392,335,410,353,271,223],
  [150,451,386,472,406,306,251], [185,515,441,539,463,343,281],
  [240,607,520,636,546,395,324], [300,698,599,732,628,446,365],
  [400,787,673,847,728],
];
// Phase-specific mV/A/m. For >=25 mm2, use tabulated |z| as a conservative
// drop bound, not r alone and not a second sqrt(3)/2 conversion.
const armouredDrop70 = [
  [29,25],[18,15],[11,9.5],[7.3,6.4],[4.4,3.8],[2.8,2.4],
  [1.75,1.50],[1.25,1.10],[.94,.81],[.65,.57],[.50,.43],[.41,.35],
  [.34,.29],[.29,.25],[.24,.21],[.21,.185],[.185,.160],
];
const armouredDrop90 = [
  [31,27],[19,16],[12,10],[7.9,6.8],[4.7,4],[2.9,2.5],
  [1.90,1.65],[1.35,1.15],[1,.87],[.69,.60],[.52,.45],[.42,.37],
  [.35,.30],[.29,.26],[.24,.21],[.21,.185],[.190,.165],
];

// size, A, B, C, installation 100, 101, 102, 103, single-phase mV/A/m (4D5).
const flat = [
  [1,11.5,13,16,13,10.5,13,8,44],
  [1.5,14.5,16.5,20,16,13,16,10,29],
  [2.5,20,23,27,21,17,21,13.5,18],
  [4,26,30,37,27,22,27,18.5,11],
  [6,32,38,47,34,27,35,23.5,7.3],
  [10,44,52,64,45,36,47,32,4.4],
  [16,57,69,85,57,46,63,42.5,2.8],
];
// size, A (two/three), B (two/three), C touching/trefoil (two/three).
const singles = [
  [1,11,10.5,13.5,12,15.5,14], [1.5,14.5,13.5,17.5,15.5,20,18],
  [2.5,20,18,24,21,27,25], [4,26,24,32,28,37,33],
  [6,34,31,41,36,47,43], [10,46,42,57,50,65,59],
  [16,61,56,76,68,87,79], [25,80,73,101,89,114,104],
  [35,99,89,125,110,141,129], [50,119,108,151,134,182,167],
  [70,151,136,192,171,234,214], [95,182,164,232,207,284,261],
  [120,210,188,269,239,330,303], [150,240,216,300,262,381,349],
  [185,273,245,341,296,436,400], [240,321,286,400,346,515,472],
  [300,367,328,458,394,594,545], [400,0,0,546,467,694,634],
];
// A/B single-phase, C touching single-phase, A/B three-phase, C trefoil three-phase.
const singlesDropLarge = [
  [1.8,1.75,1.55,1.50],[1.3,1.25,1.10,1.10],[1,.95,.85,.82],
  [.72,.66,.61,.57],[.56,.50,.48,.43],[.47,.41,.41,.36],
  [.41,.34,.36,.30],[.37,.29,.32,.26],[.33,.25,.29,.22],
  [.31,.22,.27,.190],[.29,.20,.25,.175],
];
const singlesDropSmall = [[44,38],[29,25],[18,15],[11,9.5],[7.3,6.4],[4.4,3.8],[2.8,2.4]];

export interface RatedCable extends CableData {
  ratingTable: string;
  capacityColumn: string;
  voltageDropColumn: string;
  loadedConductors: 2 | 3;
  operatingTemperature: 70 | 90;
}

export function referenceCableRows(cable: CableType, method = M.METHOD_C, supply = SupplyType.SINGLE_PHASE, operatingTemperature: 70 | 90 = 70): RatedCable[] {
  const phase = supply === SupplyType.THREE_PHASE ? 1 : 0;
  const loadedConductors = phase ? 3 : 2;
  const temperature = cable === CableType.XLPE_SWA ? operatingTemperature : 70;
  if (!Object.values(CableType).includes(cable)) return [];
  if (cable === CableType.PVC_PVC) {
    if (phase) return [];
    const methods = [M.METHOD_A,M.METHOD_B,M.METHOD_C,M.METHOD_100,M.METHOD_101,M.METHOD_102,M.METHOD_103];
    const column = methods.indexOf(method);
    if (column < 0) return [];
    return flat.map(row => ({ size: row[0], capacity: Object.fromEntries(methods.map((m,i) => [m,row[i+1]])), mvAm: row[8], ratingTable: '4D5', capacityColumn: String([6,7,8,2,3,4,5][column]), voltageDropColumn: '9', loadedConductors, operatingTemperature: 70 }));
  }
  const single = cable === CableType.PVC_SINGLE;
  const methods = single ? [M.METHOD_A,M.METHOD_B,M.METHOD_C] : [M.METHOD_C,M.METHOD_E,M.METHOD_D];
  const column = methods.indexOf(method);
  if (column < 0) return [];
  const rows = single ? singles : temperature === 90 ? armoured90 : armoured70;
  return rows.filter(row => row[1+column*2+phase] > 0).map((row) => {
    const i = rows.indexOf(row);
    const capacity = Object.fromEntries(methods.flatMap((m,j) => row[1+j*2+phase] > 0 ? [[m,row[1+j*2+phase]]] : []));
    const mvAm = single
      ? i < 7 ? singlesDropSmall[i][phase] : singlesDropLarge[i-7][phase*2+(method === M.METHOD_C ? 1 : 0)]
      : (temperature === 90 ? armouredDrop90 : armouredDrop70)[i][phase];
    return { size: row[0], capacity, mvAm, loadedConductors, operatingTemperature: temperature,
      ratingTable: single ? '4D1A/4D1B' : temperature === 90 ? '4E4A/4E4B' : '4D4A/4D4B',
      capacityColumn: String(2+column*2+phase),
      voltageDropColumn: single ? String(phase ? method === M.METHOD_C ? 7 : 6 : method === M.METHOD_C ? 4 : 3) : String(phase ? 4 : 3),
    };
  });
}

// Compatibility view for tools with no supply selector: single phase, run at 70C.
export const REFERENCE_CABLE_DATABASE: Record<CableType, RatedCable[]> = Object.fromEntries(
  Object.values(CableType).map(type => [type, referenceCableRows(type)])
) as Record<CableType, RatedCable[]>;
