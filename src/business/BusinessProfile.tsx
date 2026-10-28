import { useEffect, useState } from "react";
import { Save, ImagePlus, Trash2 } from "lucide-react";
import { businessProfile, validateProfile, type Company } from "./model";
import { companyLogo, readFile } from "./store";

export function BusinessProfile({
  value,
  uid,
  save,
}: {
  value: Company;
  uid: string;
  save: (value: Company) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() =>
    businessProfile(structuredClone(value))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logo, setLogo] = useState("");
  useEffect(() => {
    let live = true,
      url = "";
    setLogo("");
    if (draft.logoId)
      void readFile(uid, "", draft.logoId)
        .then((blob) => {
          if (live) {
            url = URL.createObjectURL(blob);
            setLogo(url);
          }
        })
        .catch(() => {
          if (live)
            setError(
              "Could not load the saved logo. Connect to download it, or replace/remove it."
            );
        });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [uid, draft.logoId]);
  const fields: [keyof Company, string, boolean?][] = [
    ["name", "Business / trading name"],
    ["legalName", "Legal company name (optional)"],
    ["address", "Business address", true],
    ["contactName", "Contact name"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["website", "Website"],
    ["registrationNumber", "Company registration number"],
    ["terms", "Default payment terms", true],
    ["exclusions", "Default exclusions", true],
    ["footer", "Document footer", true],
  ];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          validateProfile(draft);
          if (!draft.name.trim())
            throw Error("Enter your business / trading name.");
          await save(draft);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>Business details</legend>
        <div className="business-fields">
          <label>Business type
            <select value={draft.businessType||''} onChange={e=>setDraft({...draft,businessType:e.target.value as Company['businessType']})}>
              <option value="">Select business type</option><option value="soleTrader">Sole trader</option><option value="limited">Limited company</option><option value="other">Other legal entity</option>
            </select>
          </label>
          {fields.map(([key, label, area]) => (
            <label key={key}>
              {label}
              {area ? (
                <textarea
                  value={String(draft[key] ?? "")}
                  maxLength={
                    key === "footer" ? 400 : key === "address" ? 1000 : 4000
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              ) : (
                <input
                  value={String(draft[key] ?? "")}
                  maxLength={key === "name" || key === "legalName" ? 200 : 300}
                  type={key === "email" ? "email" : "text"}
                  required={key === "name"}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <label>
            Default quote validity (days; 0 = no expiry)
            <input
              type="number"
              min="0"
              max="3650"
              step="1"
              value={Number.isNaN(draft.quoteValidityDays)?'':draft.quoteValidityDays ?? 30}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  quoteValidityDays:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.vatRegistered}
              onChange={(e) =>
                setDraft({ ...draft, vatRegistered: e.target.checked })
              }
            />
            VAT registered
          </label>
          <label>Default invoice payment period (days)
            <input type="number" min="0" max="3650" step="1" value={draft.invoiceDueDays??14} onChange={e=>setDraft({...draft,invoiceDueDays:e.target.value===''?NaN:Number(e.target.value)})}/>
          </label>
          <label>Invoice footer (optional; otherwise document footer)
            <textarea maxLength={400} value={draft.invoiceFooter??''} onChange={e=>setDraft({...draft,invoiceFooter:e.target.value})}/>
          </label>
          {draft.vatRegistered && (
            <label>
              VAT registration number (optional)
              <input
                value={draft.vatNumber}
                maxLength={100}
                onChange={(e) =>
                  setDraft({ ...draft, vatNumber: e.target.value })
                }
              />
            </label>
          )}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Custom logo</legend>
        {logo && (
          <div className="business-logo-preview">
            <img src={logo} alt="Business logo preview" />
          </div>
        )}
        <label className="business-file">
          <ImagePlus size={18} />
          {draft.logoId ? "Replace logo" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                const logoId = await companyLogo(uid, file);
                setDraft((previous) => ({ ...previous, logoId }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <p className="business-muted">
          PNG or JPEG, up to 5 MB. Transparent PNGs are preserved.
        </p>
        {draft.logoId && (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, logoId: "" })}
          >
            <Trash2 size={18} />
            Remove logo
          </button>
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Optional payment details</legend>
        <label>
          Payment instructions
          <textarea
            value={draft.paymentInstructions ?? ""}
            maxLength={3000}
            onChange={(e) =>
              setDraft({ ...draft, paymentInstructions: e.target.value })
            }
          />
        </label>
        <label>
          Bank details
          <textarea
            value={draft.bankDetails ?? ""}
            maxLength={2000}
            onChange={(e) =>
              setDraft({ ...draft, bankDetails: e.target.value })
            }
          />
        </label>
        <p className="business-muted">
          Excluded from documents unless explicitly enabled for that document.
        </p>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="submit" disabled={busy}>
          <Save size={18} />
          {busy ? "Saving..." : "Save business profile"}
        </button>
      </footer>
    </form>
  );
}
