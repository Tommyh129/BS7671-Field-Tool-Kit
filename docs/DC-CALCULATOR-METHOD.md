# DC Cable Calculator Review

Reviewed 28 October 2026. The supplied workbook is unchanged.

## Workbook Logic

Source: user-supplied `DC Calculator.xlsx`, sheet `DC Cable Calc`, inputs F10:L21 and outputs M10:T21; explanatory notes B34.

- Current: I = P / V, using power at the stated supply voltage.
- Copper resistivity at 20 C: rho = 0.0175 ohm mm2/m.
- Allowed voltage drop: V * targetPercent / 100.
- Minimum voltage-drop area: 2 * rho * one-way length * I / allowedDrop.
- Preliminary current-density area: I / (J * K), with workbook assumptions J = 6 A/mm2 and K = 1.
- Required unrounded area: the larger of these two areas. Actual cable area Q is manually selected in the workbook, not automatically rounded by a lookup.
- Actual drop: 2 * rho * one-way length * I / selectedArea.
- Percentage drop: drop / V, formatted as a percentage in Excel. The app explicitly multiplies this fraction by 100.
- Voltage at load: V - drop.

The twelve populated rows' cached numerical outputs were independently reproduced in regression tests. This is formula comparison, not a new calculation by desktop Excel. The workbook has no input data-validation rules and its COUNTA checks do not prevent zero divisors, invalid percentages or negative design inputs. These weaknesses are not copied into the app. No customer/project identifiers are copied into source or fixtures.

## App Integration

- One calculation engine serves live results, automatic sizing, manual checks, recommendations and report data.
- Current input remains available; power input adds I=P/V.
- Recorded conductor resistance remains the default; optional copper workbook mode reproduces rho/area rather than silently replacing recorded values with a lower theoretical resistance.
- Both modes select the smallest available recorded nominal size up to 400 mm2 satisfying voltage drop, enabled J/K sizing and the user-selected minimum available size. No missing aluminium resistance rows or over-400 sizes are invented.
- Workbook raw areas remain unrounded. Only the final suggested standard size is rounded upward. A manually undersized cable can pass voltage drop and still fail current-density sizing.
- Resistance at conductor temperature T is R20 * (1 + alpha * (T-20)), with alpha 0.00393 copper and 0.00403 aluminium. Supported input range is -20 to 90 C, not permission to operate any selected cable at 90 C. Default 20 C preserves the existing base assumption and workbook comparison; set the actual design conductor temperature.
- Current density defaults to the workbook's copper assumption only. Aluminium switches to recorded resistance with density sizing off; enabling it requires an explicit density input.
- Inputs reject nonfinite/invalid values and drop targets at or above 100%. Failure to find a suitable size is shown explicitly. A negative theoretical load voltage is not clamped to a misleading zero/pass.
- History, text/image/PDF reports include method, temperature, density/derating assumptions and selected-check results.

## Limits And References

This is preliminary steady-current DC sizing for equal outgoing and return conductors. J*A*K is **not** a manufacturer current rating or a substitute for BS 7671 installation tables. Cable construction, availability, ampacity, insulation/termination temperature, protection, fault withstand and voltage rating must be checked separately. Supply sag, connections and regulated constant-power terminal loads are not solved. PV source/circuit requirements need separate assessment; the workbook's example circuit names do not establish PV compliance.

- Manufacturer resistance-temperature formula and coefficients: https://elsewedyequipment.com/wp-content/uploads/2021/07/power-cables-catalogue.pdf
- Cable-specific current ratings differ by installation/reference method and conductor conditions: https://www.elandcables.com/media/ehkk3rg2/table-4e1a-and-4e1b.pdf

The app's existing recorded resistance tables retain their unverified provenance notice. The supplied workbook does not establish current-amendment verification or source-data redistribution rights.
