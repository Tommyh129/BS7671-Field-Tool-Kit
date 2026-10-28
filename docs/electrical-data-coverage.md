# Electrical Data Coverage

## Current Status

Cable selection now uses identified public reference tables rather than the
previous legacy capacity rows. This is not a complete verification against
BS 7671:2018+A4:2026. Protective-device limits, conductor resistance, non-baseline
correction factors and complete current-amendment applicability remain unverified.
Distribution permission has not been established. Do not represent these
calculations as certification of a circuit's compliance.

## Cable References

Transcribed from Eland's public BS 7671:2018 reference PDFs, visually checked
against the table headers, columns and selected values:

- Flat PVC twin-and-earth: [4D5](https://www.elandcables.com/media/3hoka0mu/table-4d5.pdf).
- PVC singles: [4D1A/4D1B](https://www.elandcables.com/media/vyrp3kxq/table-4d1a-and-4d1b.pdf).
- Armoured copper at 70C: [4D4A/4D4B](https://www.elandcables.com/media/of4pe0xx/table-4d4a-and-4d4b.pdf).
- Armoured copper at 90C: [4E4A/4E4B](https://www.elandcables.com/media/cnwh0k2l/table-4e4a-and-4e4b.pdf).

The 1.5mm2, method C, three-loaded-conductor cell in Eland's 4D4A incorrectly
reads 118 A. The implemented 18 A is cross-checked against Figure 3 of the
[IET's SWA guidance](https://electrical.theiet.org/wiring-matters/years/2022/93-november-2022/thermoplastic-pvc-or-thermosetting-xlpe-swa-cable/).
That guidance also explains why XLPE defaults to 70C equipment operation and
why 90C tables require manufacturer-confirmed equipment/accessories.

Data is in `src/data/cableRatings.ts`. The old legacy cable matrix was removed.
No interpolation, neighbouring-size extrapolation or cross-construction copying.

## Supported Selection Cases

- Twin-and-earth: 1 to 16mm2, single-phase/two loaded conductors, methods A/B/C
  and installations 100-103. A 1mm2 row is not exported to an SWA family.
- SWA: 1.5 to 400mm2, two or three loaded conductors, C/E and D1 duct.
  D1 stops at 300mm2 where the reference column stops. No direct-burial D2
  inference, ground-factor substitution or 400mm2 duct extrapolation.
- PVC singles: 1 to 400mm2, A/B/C, two or three loaded conductors. A stops at
  300mm2. C voltage drop assumes touching singles (trefoil for three-phase).
  F/G require arrangement-specific data not included in this implementation.
- XLPE: 70C by default (4D4), optionally 90C (4E4) when explicitly confirmed.
- Installation 100 means ceiling insulation up to 100mm; 101 means over 100mm.
  Historic enum values remain unchanged for stored-history compatibility, but
  current selectors and Smart Circuit exports show corrected descriptions.
- Phase-specific voltage-drop columns are used directly. No extra 0.866
  multiplier is applied. For large conductors tabulated impedance magnitude
  supplies a conservative voltage-drop bound, not a full r*cos(phi)+x*sin(phi)
  power-factor calculation.
- Baselines: air 30C, buried ground 20C and standard table conditions; one circuit.
  Site-specific soil, burial depth, grouping, ambient and harmonics need assessment.
  Three-phase load conversion assumes balanced load and power factor 0.9.
- Ground non-reference corrections are blocked rather than using air factors.
  Non-reference 90C correction factors are not fabricated.

## CPC And Protection Boundaries

Smart Circuit Designer offers two explicit SWA CPC arrangements: separate copper
or an integral full-size insulated copper core. Integral CPC resistance uses the
selected line size and grows with each candidate cable during sizing. A dedicated
core must actually exist in the selected manufacturer's cable, in addition to all
required phases and any neutral; this does not mean the steel armour. Three-phase
ratings still assume only three loaded conductors. Twin-and-earth uses its recorded
factory line/CPC pairing, not the full-size SWA assumption.

Separate CPC sizing defaults to Automatic in Smart Circuit Designer, with a manual
size override retained. For each ascending line size, the algorithm searches
available copper CPC sizes from the tabular minimum upwards and selects the smallest
that meets the recorded design-Zs limit. The first pair satisfying current capacity,
voltage drop and Zs is recommended. It prioritises line size, not total copper cost.
If no CPC works for that line, the search continues with larger line sizes; a design
with no passing pair remains failed. The exact selected CPC is used in the loop
resistance, result, share text and history, not just in the displayed label.

The separate-CPC model assumes installation with the circuit, matching insulation/
fault-temperature characteristics and the tabular sizing relationship. Its
conservative minimum is 4mm2. A manual override is never silently increased; Automatic
is the explicit choice that permits CPC resizing. This retains the tabular method,
not a new adiabatic calculation; see the [IET sizing explanation](https://electrical.theiet.org/media/1549/earthing.pdf).
Neither arrangement is an armour resistance or adiabatic/fault-withstand assessment.
Armour-only paths require manufacturer data. See the
[IET's SWA guidance](https://electrical.theiet.org/media/2157/wiring-matters-issue-77-september-2019.pdf)
for the distinction between copper conductors and armour earthing arrangements.

Recalculate reruns sizing from current inputs and resets a manual protective-device
rating to the load-based suggestion. It retains the chosen device type, cable,
method, temperature, supply and CPC arrangement. The existing candidate search
selects the smallest available cable that meets the recorded current-capacity,
voltage-drop and Zs checks. An integral CPC follows that cable size. Fixed separate
CPCs and impossible inputs are not changed to force a pass. Feedback and source
assumptions remain visible, and saved/shared results include the CPC arrangement.

Copper resistance uses the existing recorded 20C values. Circuit resistance
is multiplied approximately by 1.2 at 70C or 1.28 at 90C; Ze is unchanged.
Loop reactance, fault energy, device breaking capacity, RCD requirements,
bonding, disconnection time, discrimination and equipment suitability still
require a complete design assessment. TT is not assessed as an RCD design.

60898 MCB selection is capped at 125 A, consistent with
[IEC 60898-1 scope](https://webstore.iec.ch/en/publication/66269).
Larger loads need manufacturer-specific protection, not generic 160-400 A MCBs.
BS 3036 remains blocked in circuit sizing pending its fuse factor/applicability.
A failed check remains a failed result; missing rows never produce a fallback pass.

## Provenance And Remaining Work

Results, share text and new Smart Circuit history retain selected rating/voltage
drop columns, conductor count, temperature and CPC assumptions. The machine
inventory records each supported case separately. The full-current-edition
verification counters intentionally remain zero, distinct from public-reference
transcription checks.

Before release as a standards-verified design system, obtain the complete licensed
edition/amendments/corrigenda and audit every applicable table, footnote,
manufacturer characteristic and installation constraint. Families 4D2/4D3,
4E1-4E3, 4F-4J, full 4A/4B/4C, 52/54/41-series and protection coordination are
not complete. Public availability of a reference is not redistribution permission.

## Verification

## Cross-Tool Behaviour

- Smart Circuit Designer and AC Voltage Drop share the same sizing engine, CPC
  resolver, phase-specific tables and operating-temperature choices. Selected CPC,
  arrangement, temperature, exact source columns and assumptions travel with results,
  history and share text. AC Voltage Drop no longer rejects SWA for missing CPC data.
- Cable Finder uses the same physical cable ranges and supported method filters,
  with phase and XLPE temperature selection. It is a current-capacity finder, not a
  fault-protection or CPC calculator; it never claims a complete passing design.
- Max Length uses the same phase/method tables and copper CPC resolver, both integral
  and automatic/manual separate. It checks current capacity as well as voltage drop
  and Zs. Recalculate can resize the conductor for an entered target length; without
  a length it recommends capacity sizing and displays the resulting length limits.
- Zs and Resistance default to actual installed/manual sizes. Copper design modes
  explicitly offer automatic separate sizing, integral full-size core and factory
  twin-and-earth pairings. Aluminium stays manual: copper CPC rules are not applied.
  Measured total R1+R2 and installed sizes are never rewritten to manufacture a pass.
  Resistance-only automatic selection has no Zs target; it is not CPC verification.
- DC Voltage Drop and Motor retain their own resistance-only sizing models, with
  Recalculate feedback. Neither acquires an invented AC installation/CPC rating.
  Fixed motor-power selection is bounded at 400mm2 with conservative minimums of
  1.5mm2 copper/16mm2 aluminium; it is not a model for flexible leads or control
  wiring. See the [IET author discussion of the fixed-power minimum](https://engx.theiet.org/f/wiring-and-regulations/22980/mcb-size-for-dedicated-fused-spurs).
- Protection Selector resets only its manual rating override when recalculating.
  Fault Current, Power and TT Electrode recheck their entered values without changing
  site measurements or manufacturer ratings. Those are not conductor-sizing tools.
- All calculator screens now provide a calculation/recalculation action and feedback
  appropriate to their scope. No button promises a pass for impossible constraints.

## Verification Commands

Run `npm.cmd test`, `node node_modules/typescript/bin/tsc --noEmit`,
`npm.cmd run audit:electrical` and `npm.cmd run build`.
Regression tests cover phase/method columns, physical size limits, CPC constraints,
temperature choice, boundaries, correction factors and invalid inputs.
Arithmetic tests and a successful frontend build do not certify regulatory accuracy.
