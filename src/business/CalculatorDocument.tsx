import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Modal } from "./Projects";
import { DocumentPreview, type PreviewRequest } from "./DocumentPreview";
import {
  blankCompany,
  blankProject,
  businessProfile,
  calculationSnapshot,
  type Company,
  type Project,
} from "./model";
import { blobDataUrl, snapshotPdf } from "./pdf";
import { calculationTextPdf } from "./documents";
import { readBusiness, readFile } from "./store";
import type { CalculationHistory } from "../types";

export function CalculatorDocument() {
  const [source, setSource] = useState<{
    snapshot?: CalculationHistory;
    text?: string;
  } | null>(null);
  const [company, setCompany] = useState<Company>(blankCompany);
  const [uid, setUid] = useState("");
  const [site, setSite] = useState<Project>(() => blankProject(""));
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let generation = 0,
      live = true;
    const close = () => {
      generation++;
      setSource(null);
      setError("");
      setLoading(false);
      setCompany(blankCompany());
    };
    const unsub = onAuthStateChanged(auth, close);
    const listener = (event: Event) => {
      const value = (
        event as CustomEvent<{ snapshot?: CalculationHistory; text?: string }>
      ).detail;
      const ticket = ++generation;
      const owner = auth.currentUser?.uid || "";
      setUid(owner);
      setSource(structuredClone(value));
      setReference(`CALC-${Date.now()}`);
      setSite(blankProject(""));
      setError("");
      setLoading(true);
      setCompany(blankCompany());
      void (async () => {
        try {
          const rows = owner ? await readBusiness(owner) : [];
          if (live && ticket === generation)
            setCompany(
              businessProfile(
                (rows.find((r) => r.kind === "settings" && !r.deleted)
                  ?.payload as Company) || {}
              )
            );
        } catch {
          if (live && ticket === generation)
            setError(
              "Could not read your business profile. Check device storage before exporting."
            );
        } finally {
          if (live && ticket === generation) setLoading(false);
        }
      })();
    };
    window.addEventListener("sparkys-preview-calculation", listener);
    return () => {
      live = false;
      generation++;
      unsub();
      window.removeEventListener("sparkys-preview-calculation", listener);
    };
  }, []);
  const request = useMemo<PreviewRequest>(
    () => ({
      filename: `${reference}.pdf`,
      editable: true,
      generate: async (options) => {
        if (!reference.trim()) throw Error("Enter a document reference.");
        const logo = company.logoId
          ? await blobDataUrl(await readFile(uid, "", company.logoId))
          : undefined;
        if (source?.snapshot)
          return snapshotPdf(
            source.snapshot.title,
            calculationSnapshot(source.snapshot.title, source.snapshot),
            company,
            site,
            logo,
            options,
            reference
          );
        return calculationTextPdf(
          source?.text || "",
          company,
          site,
          reference,
          logo,
          options
        );
      },
    }),
    [source, company, site, reference, uid]
  );
  if (!source) return null;
  return (
    <div className="business">
      <Modal title="Calculation report preview" close={() => setSource(null)}>
        {loading ? (
          <p role="status">Loading business profile...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            <div className="business-fields">
              <label>
                Document reference
                <input
                  value={reference}
                  maxLength={80}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <label>
                Customer name (optional)
                <input
                  value={site.customer}
                  maxLength={200}
                  onChange={(e) =>
                    setSite({ ...site, customer: e.target.value })
                  }
                />
              </label>
              <label>
                Project title (optional)
                <input
                  value={site.title}
                  maxLength={200}
                  onChange={(e) => setSite({ ...site, title: e.target.value })}
                />
              </label>
              <label>
                Site address (optional)
                <textarea
                  value={site.address}
                  maxLength={1000}
                  onChange={(e) =>
                    setSite({ ...site, address: e.target.value })
                  }
                />
              </label>
            </div>
            <DocumentPreview request={request} />
          </>
        )}
      </Modal>
    </div>
  );
}
