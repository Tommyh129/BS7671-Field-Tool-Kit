import { ELECTRICAL_DATASETS, DATASET_SOURCES } from '../src/data/electrical.ts';

const range = (prefix, start, end) => Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`);
const requiredSources = [
  ...range('4A', 1, 3),
  ...range('4D', 1, 5), ...range('4E', 1, 4), ...range('4F', 1, 3),
  ...range('4G', 1, 2), ...range('4H', 1, 4), ...range('4J', 1, 4),
  ...range('4B', 1, 5), ...range('4C', 1, 6),
  ...range('52.', 1, 3), ...range('54.', 1, 8), ...range('41.', 1, 4),
  'Appendix 3', 'Appendix 4 voltage-drop guidance', '537.4', 'Sections 531-536',
];

const report = {
  targetEdition: null,
  authoritativeSourceDocumentsSupplied: 0,
  sourceVerifiedDatasets: 0,
  sourceVerifiedRows: 0,
  distributionPermission: 'not supplied',
  completenessVerified: false,
  publicReferenceCableDatasets: ELECTRICAL_DATASETS.cables.map(cable => ({
    sourceId: cable.source.id, edition: cable.source.edition, tables: cable.source.table,
    cases: cable.ratingCases.map(item => ({
      supply: item.supply, operatingTemperature: item.operatingTemperature, method: item.method,
      sizes: item.rows.map(row => row.size), ratingTable: item.rows[0].ratingTable,
      capacityColumn: item.rows[0].capacityColumn, voltageDropColumn: item.rows[0].voltageDropColumn,
    })),
  })),
  retainedLegacyData: {
    cables: ELECTRICAL_DATASETS.cables.map(cable => ({
      type: cable.type, sourceId: cable.source.id, edition: cable.source.edition, tableClaim: cable.source.table,
      sizes: cable.rows.map(row => row.size), rows: cable.rows.length,
      legacyColumns: cable.rows.reduce((count, row) => count + row.columns.length, 0),
      sourceVerifiedColumns: 0,
    })),
    methods: ELECTRICAL_DATASETS.installations.rows,
    protection: ELECTRICAL_DATASETS.protection.rows.map(device => ({ device: device.device, ratings: device.limits.map(row => row.rating), sourceVerified: false })),
    correctionFactors: { ambient: Object.keys(ELECTRICAL_DATASETS.ambient.rows).map(Number), grouping: Object.keys(ELECTRICAL_DATASETS.grouping.rows).map(Number) },
    resistance: ELECTRICAL_DATASETS.resistance.map(table => ({ material: table.material, sizes: Object.keys(table.rows).map(Number).sort((a, b) => a - b) })),
    provenance: Object.values(DATASET_SOURCES),
  },
  sourceChecklist: requiredSources.map(reference => ({ reference, status: 'source missing - not verified', requirements: /^4[DEFGHJ]/.test(reference) ? 'All applicable capacity/voltage-drop subtables, columns, notes and applicability; subtable suffixes must be established from the supplied edition.' : 'Complete table/section, notes, applicability, edition and correction history.' })),
  additionalRequiredSources: [
    'Edition title/imprint, all applicable amendments, corrigenda and table index.',
    'Permission/licence for distributing each embedded dataset in the mobile/web app.',
    'Conductor resistance source, conductor class, material, construction and temperature conditions.',
    'Manufacturer MCCB/ACB settings, breaking capacities, let-through energy, selectivity/backup and armour data where used.',
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
