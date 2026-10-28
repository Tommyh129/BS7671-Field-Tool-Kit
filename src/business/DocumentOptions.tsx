import { documentOptions, type DocumentOptions } from "./model";
export function DocumentVisibility({
  value,
  onChange,
  allowInternal = false,
  disabled = false,
}: {
  value: Partial<DocumentOptions>;
  onChange: (value: DocumentOptions) => void;
  allowInternal?: boolean;
  disabled?: boolean;
}) {
  const options = documentOptions(value);
  return (
    <fieldset disabled={disabled}>
      <legend>Document visibility</legend>
      {(
        [
          ["showContactDetails", "Include optional contact details"],
          ["showPaymentInstructions", "Include payment instructions"],
          ["showBankDetails", "Include bank details"],
          ...(allowInternal
            ? [
                [
                  "internal",
                  "Internal export - include costs / private notes / purchasing status",
                ],
              ]
            : []),
        ] as [keyof DocumentOptions, string][]
      ).map(([key, label]) => (
        <label key={key} className="check">
          <input
            type="checkbox"
            checked={options[key]}
            onChange={(e) => onChange({ ...options, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
