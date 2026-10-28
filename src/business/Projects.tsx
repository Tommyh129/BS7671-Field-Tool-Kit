import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Plus,
  ArrowLeft,
  Settings,
  Camera,
  ImagePlus,
  Download,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  RefreshCw,
  Pencil,
  FolderOpen,
  Receipt,
} from "lucide-react";
import { auth } from "../firebase";
import { getHistory } from "../services/historyService";
import type { CalculationHistory } from "../types";
import { downloadFile } from "../utils/download";
import * as M from "./model";
import * as S from "./store";
import { projectSyncGroups, syncGroupMessage } from './sync-status';
import { RamsPanel } from './rams/RamsPanel';
import { blobDataUrl, materialsPdf, quotePdf, snapshotPdf } from "./pdf";
import { BusinessProfile } from "./BusinessProfile";
import { DocumentVisibility } from "./DocumentOptions";
import { DocumentPreview, type PreviewRequest } from "./DocumentPreview";
import { Invoices } from './invoices/Invoices';
import { fromQuote } from './invoices/model';
import { loadInvoices, cachedInvoices } from './invoices/client';
import "./projects.css";

type RecordOf<K extends M.Kind> = M.BusinessRecord<K>;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The operation failed. Please try again.";
const clone = <T,>(value: T): T => structuredClone(value);
const BusinessErrorContext = createContext("");
const quoteAmount = (quote: M.Quote) => {
  try {
    return M.money(M.quoteTotals(quote).total);
  } catch {
    return "Check pricing";
  }
};
function Action({
  title,
  children,
  onClick,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  area = false,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      {area ? (
        <textarea
          value={value}
          maxLength={10000}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={value}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          step={type === "number" ? "any" : undefined}
        />
      )}
    </label>
  );
}
export function Modal({
  title,
  children,
  close,
  hidden = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  hidden?: boolean;
}) {
  const error = useContext(BusinessErrorContext);
  const container = useRef<HTMLDivElement>(null);
  const closeAction = useRef(close);
  closeAction.current = close;
  useEffect(() => {
    if (hidden) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary"
        ) || []
      ).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAction.current();
      }
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [hidden]);
  return (
    <div
      ref={container}
      style={hidden ? { display: "none" } : undefined}
      className="business-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section>
        <header>
          <h2>{title}</h2>
          <Action title="Close" onClick={close}>
            <X size={22} />
          </Action>
        </header>
        {error && <p role="alert">{error}</p>}
        {children}
      </section>
    </div>
  );
}
function CalculationFields({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <dl>
        {Object.entries(values)
          .filter(([key]) => !["dataSources", "dataSourceIds"].includes(key))
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
              <dd>
                {typeof value === "object" ? (
                  <pre>{JSON.stringify(value, null, 2)}</pre>
                ) : typeof value === "boolean" ? (
                  value ? (
                    "Yes"
                  ) : (
                    "No"
                  )
                ) : (
                  String(value ?? "-")
                )}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
function Asset({
  uid,
  projectId,
  id,
  full = false,
}: {
  uid: string;
  projectId: string;
  id: string;
  full?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setUrl("");
    setError("");
    S.readFile(uid, projectId, id)
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uid, projectId, id]);
  return url ? (
    <img
      className={full ? "full-photo" : ""}
      src={url}
      alt="Saved project photo"
    />
  ) : (
    <span role="status">{error || "Loading image..."}</span>
  );
}
export function ProjectForm({
  value,
  save,
  cancel,
}: {
  value: M.Project;
  save: (value: M.Project) => Promise<void>;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(clone(value));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (
    key: keyof M.Project,
    label: string,
    area = false,
    required = false
  ) => (
    <Field
      label={label}
      value={draft[key] ?? ""}
      area={area}
      required={required}
      onChange={(value) => setDraft({ ...draft, [key]: value })}
    />
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          if (
            !draft.number.trim() ||
            !draft.customer.trim() ||
            !draft.title.trim()
          )
            throw Error("Project number, customer and title are required.");
          await save(draft);
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="business-fields">
        {field("number", "Project number", false, true)}
        {field("customer", "Customer", false, true)}
        {field("title", "Project title", false, true)}
        {field("address", "Site address", true)}
        {field("email", "Contact email")}
        {field("phone", "Contact phone")}
        <Field label="Work due to start" type="date" value={draft.startDate ?? ""}
          onChange={(startDate) => setDraft({ ...draft, startDate })} />
        <label>
          Status
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft({ ...draft, status: e.target.value as M.ProjectStatus })
            }
          >
            {M.PROJECT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {field("description", "Description", true)}
        {field("notes", "Notes", true)}
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button disabled={busy} type="submit">
          <Save size={18} />
          {busy ? "Saving..." : "Save project"}
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </footer>
    </form>
  );
}
function WorkStartDate({ value, save }: { value: string; save: (date: string) => Promise<void> }) {
  const [date, setDate] = useState(value);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setDate(value); }, [value]);
  return (
    <section aria-label="Work Due to Start">
      <h3>Work Due to Start</h3>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setFeedback(""); setError("");
        try {
          await save(date);
          setFeedback(date ? "Start date saved on this device." : "Start date cleared on this device.");
        } catch (e) { setError(message(e)); }
        finally { setBusy(false); }
      }}>
        <div className="business-fields">
          <Field label="Start date" type="date" value={date} onChange={(next) => {
            setDate(next); setFeedback(""); setError("");
          }} />
        </div>
        <div className="business-actions">
          <button type="submit" disabled={busy || date === value}>
            <Save size={18} />{busy ? "Saving..." : "Save start date"}
          </button>
          <button type="button" disabled={busy || !date} onClick={() => {
            setDate(""); setFeedback(""); setError("");
          }}>Clear date</button>
        </div>
        {feedback && <p role="status">{feedback}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
function MaterialsEditor({
  value,
  save,
  exportPdf,
}: {
  value: M.Materials;
  save: (value: M.Materials) => Promise<void>;
  exportPdf: (value: M.Materials) => Promise<void>;
}) {
  const [draft, setDraft] = useState(clone(value));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      M.materialTotals(draft);
      if (!draft.name.trim() || draft.items.some((i) => !i.description.trim()))
        throw Error("Enter a list name and a description for every item.");
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const patch = (id: string, changes: Partial<M.MaterialItem>) =>
    setDraft({
      ...draft,
      items: draft.items.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    });
  const move = (index: number, offset: number) => {
    const items = [...draft.items];
    [items[index], items[index + offset]] = [
      items[index + offset],
      items[index],
    ];
    setDraft({ ...draft, items });
  };
  let total = "";
  try {
    total = M.money(M.materialTotals(draft));
  } catch {
    total = "Check quantities and costs";
  }
  return (
    <>
      <Field
        label="List name"
        value={draft.name}
        onChange={(v) => setDraft({ ...draft, name: v })}
      />
      {draft.items.map((item, index) => (
        <fieldset key={item.id}>
          <legend>Item {index + 1}</legend>
          <div className="business-fields">
            {(
              [
                "description",
                "code",
                "supplier",
                "quantity",
                "unit",
                "cost",
                "notes",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={
                  {
                    description: "Description",
                    code: "Product code",
                    supplier: "Supplier",
                    quantity: "Quantity",
                    unit: "Unit",
                    cost: "Unit cost (GBP, optional)",
                    notes: "Notes",
                  }[key]
                }
                value={item[key]}
                onChange={(v) => patch(item.id, { [key]: v })}
              />
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={item.purchased}
                onChange={(e) =>
                  patch(item.id, { purchased: e.target.checked })
                }
              />
              Purchased
            </label>
          </div>
          <div className="business-actions">
            <Action
              title="Move item up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={18} />
            </Action>
            <Action
              title="Move item down"
              disabled={index === draft.items.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={18} />
            </Action>
            <Action
              title="Duplicate item"
              onClick={() =>
                setDraft({
                  ...draft,
                  items: [...draft.items, { ...item, id: crypto.randomUUID() }],
                })
              }
            >
              <Copy size={18} />
            </Action>
            <Action
              title="Remove item"
              onClick={() => {
                if (confirm("Remove this item?"))
                  setDraft({
                    ...draft,
                    items: draft.items.filter((i) => i.id !== item.id),
                  });
              }}
            >
              <Trash2 size={18} />
            </Action>
            <span>
              Line:{" "}
              {(() => {
                try {
                  return item.cost
                    ? M.money(M.linePence(item.quantity, item.cost))
                    : "Not priced";
                } catch {
                  return "Check values";
                }
              })()}
            </span>
          </div>
        </fieldset>
      ))}
      <button
        onClick={() =>
          setDraft({ ...draft, items: [...draft.items, M.materialItem()] })
        }
      >
        <Plus size={18} />
        Add item
      </button>
      <Field
        label="List notes"
        area
        value={draft.notes}
        onChange={(v) => setDraft({ ...draft, notes: v })}
      />
      <p>
        Known costs: <strong>{total}</strong>
      </p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button disabled={busy} onClick={() => void act(() => save(draft))}>
          <Save size={18} />
          Save materials
        </button>
        <button
          disabled={busy}
          onClick={() => void act(() => exportPdf(draft))}
        >
          <Download size={18} />
          Preview / share PDF
        </button>
      </footer>
    </>
  );
}
function QuoteEditor({
  value,
  lists,
  save,
  exportPdf,
}: {
  value: M.Quote;
  lists: RecordOf<"materials">[];
  save: (value: M.Quote) => Promise<void>;
  exportPdf: (value: M.Quote) => Promise<void>;
}) {
  const [draft, setDraft] = useState(clone(value));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const issued = !!value.issuedAt;
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      M.quoteId(draft.reference, draft.revision);
      M.quoteTotals(draft);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate) ||
        Number.isNaN(Date.parse(draft.issueDate))
      )
        throw Error("Enter an issue date.");
      if (
        !draft.company.name.trim() ||
        !draft.customer.customer.trim() ||
        !draft.items.length ||
        draft.items.some((i) => !i.description.trim())
      )
        throw Error(
          "Enter a business name, customer and at least one described pricing line."
        );
      if (draft.validUntil && draft.validUntil < draft.issueDate)
        throw Error("Valid-until date cannot precede the issue date.");
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  let totals: ReturnType<typeof M.quoteTotals> | undefined;
  try {
    totals = M.quoteTotals(draft);
  } catch {}
  return (
    <>
      <p>
        {draft.type} {draft.reference} / revision {draft.revision}
        {issued ? " - issued values retained" : ""}
      </p>
      <fieldset disabled={issued || busy}>
        <div className="business-fields">
          <label>
            Document type
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft({ ...draft, type: e.target.value as M.Quote["type"] })
              }
            >
              <option>Quote</option>
              <option>Estimate</option>
            </select>
          </label>
          <Field
            label="Reference"
            value={draft.reference}
            onChange={(v) => setDraft({ ...draft, reference: v })}
          />
          <Field
            label="Issue date"
            type="date"
            value={draft.issueDate}
            onChange={(v) => setDraft({ ...draft, issueDate: v })}
          />
          <Field
            label="Valid until"
            type="date"
            value={draft.validUntil}
            onChange={(v) => setDraft({ ...draft, validUntil: v })}
          />
          {(["customer", "title", "address", "email", "phone"] as const).map(
            (key) => (
              <Field
                key={key}
                label={
                  {
                    customer: "Customer",
                    title: "Project title",
                    address: "Site address",
                    email: "Customer email",
                    phone: "Customer phone",
                  }[key]
                }
                value={draft.customer[key]}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    customer: { ...draft.customer, [key]: v },
                  })
                }
              />
            )
          )}
          <Field
            label="Business name"
            value={draft.company.name}
            onChange={(v) =>
              setDraft({ ...draft, company: { ...draft.company, name: v } })
            }
          />
          <Field
            label="Business address"
            area
            value={draft.company.address}
            onChange={(v) =>
              setDraft({ ...draft, company: { ...draft.company, address: v } })
            }
          />
          <Field
            label="Business email"
            value={draft.company.email}
            onChange={(v) =>
              setDraft({ ...draft, company: { ...draft.company, email: v } })
            }
          />
          <Field
            label="Business phone"
            value={draft.company.phone}
            onChange={(v) =>
              setDraft({ ...draft, company: { ...draft.company, phone: v } })
            }
          />
        </div>
        <Field
          label="Scope of work"
          area
          value={draft.scope}
          onChange={(v) => setDraft({ ...draft, scope: v })}
        />
        {draft.items.map((item, index) => (
          <fieldset key={item.id}>
            <legend>Charge {index + 1}</legend>
            <div className="business-fields">
              <label>
                Category
                <select
                  value={item.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      items: draft.items.map((i) =>
                        i.id === item.id
                          ? {
                              ...i,
                              category: e.target
                                .value as M.SellingItem["category"],
                            }
                          : i
                      ),
                    })
                  }
                >
                  {["Materials", "Labour", "Other"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {(["description", "quantity", "unit", "rate"] as const).map(
                (key) => (
                  <Field
                    key={key}
                    label={
                      {
                        description: "Description",
                        quantity: "Quantity",
                        unit: "Unit",
                        rate: "Selling rate (GBP)",
                      }[key]
                    }
                    value={item[key]}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        items: draft.items.map((i) =>
                          i.id === item.id ? { ...i, [key]: v } : i
                        ),
                      })
                    }
                  />
                )
              )}
            </div>
            <div className="business-actions">
              <Action
                title="Remove charge"
                onClick={() => {
                  if (confirm("Remove this charge?"))
                    setDraft({
                      ...draft,
                      items: draft.items.filter((i) => i.id !== item.id),
                    });
                }}
              >
                <Trash2 size={18} />
              </Action>
              <span>
                Line: {totals ? M.money(totals.lines[index]) : "Check values"}
              </span>
            </div>
          </fieldset>
        ))}
        <button
          onClick={() =>
            setDraft({ ...draft, items: [...draft.items, M.sellingItem()] })
          }
        >
          <Plus size={18} />
          Add charge
        </button>
        {lists.length > 0 && (
          <details>
            <summary>Import materials</summary>
            {lists.map((list) => (
              <fieldset key={list.id}>
                <legend>{list.payload.name}</legend>
                {list.payload.items.map((item) => (
                  <label className="check" key={item.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id)
                        )
                      }
                    />
                    {item.description} ({item.quantity} {item.unit})
                  </label>
                ))}
              </fieldset>
            ))}
            <p>
              Selling rates start at GBP 0.00. Enter your selling prices before
              issuing.
            </p>
            <button
              disabled={!selected.length}
              onClick={() => {
                setDraft({
                  ...draft,
                  items: [
                    ...draft.items,
                    ...M.importMaterials(
                      lists
                        .flatMap((l) => l.payload.items)
                        .filter((i) => selected.includes(i.id))
                    ),
                  ],
                });
                setSelected([]);
              }}
            >
              Import selected items
            </button>
          </details>
        )}
        <div className="business-fields">
          <Field
            label="Discount (GBP)"
            value={draft.discount}
            onChange={(v) => setDraft({ ...draft, discount: v })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={draft.company.vatRegistered}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  company: {
                    ...draft.company,
                    vatRegistered: e.target.checked,
                  },
                })
              }
            />
            VAT registered
          </label>
          {draft.company.vatRegistered && (
            <>
              <Field
                label="VAT registration number"
                value={draft.company.vatNumber}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    company: { ...draft.company, vatNumber: v },
                  })
                }
              />
              <Field
                label="VAT rate (%)"
                value={draft.vatPercent}
                onChange={(v) => setDraft({ ...draft, vatPercent: v })}
              />
            </>
          )}
          {(["terms", "exclusions", "notes"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  terms: "Payment terms",
                  exclusions: "Exclusions",
                  notes: "Customer notes",
                }[key]
              }
              area
              value={draft[key]}
              onChange={(v) => setDraft({ ...draft, [key]: v })}
            />
          ))}
        </div>
      </fieldset>
      <DocumentVisibility
        disabled={issued || busy}
        value={draft.documentOptions || {}}
        onChange={(value) => setDraft({ ...draft, documentOptions: value })}
      />
      {totals ? (
        <dl className="business-totals">
          <dt>Subtotal</dt>
          <dd>{M.money(totals.subtotal)}</dd>
          <dt>Discount</dt>
          <dd>{M.money(totals.discount)}</dd>
          <dt>
            {draft.company.vatRegistered
              ? `VAT ${draft.vatPercent}%`
              : "VAT - not registered"}
          </dt>
          <dd>{M.money(totals.vat)}</dd>
          <dt>Total</dt>
          <dd>{M.money(totals.total)}</dd>
        </dl>
      ) : (
        <p role="alert">Check quantities, selling rates, discount and VAT.</p>
      )}
      <label>
        Status
        <select
          value={draft.status}
          disabled={busy}
          onChange={(e) =>
            setDraft({ ...draft, status: e.target.value as M.Quote["status"] })
          }
        >
          {(issued
            ? ["Sent", "Accepted", "Declined", "Expired"]
            : ["Draft", "Sent", "Accepted", "Declined", "Expired"]
          ).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <p className="business-muted">
        Sent and Accepted are manually recorded. No email or electronic
        signature is sent.
      </p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button disabled={busy} onClick={() => void act(() => save(draft))}>
          <Save size={18} />
          {busy ? "Saving..." : "Save document"}
        </button>
        <button
          disabled={busy}
          onClick={() => void act(() => exportPdf(draft))}
        >
          <Download size={18} />
          {issued ? "Preview original PDF" : "Preview draft PDF"}
        </button>
      </footer>
    </>
  );
}

export function ProjectsWorkspace({
  onSignIn,
  onReopen,
  initialProjectId = '',
}: {
  onSignIn: () => void;
  onReopen?: (snapshot: CalculationHistory) => boolean;
  initialProjectId?: string;
}) {
  const [uid, setUid] = useState(auth.currentUser?.uid || "");
  const [records, setRecords] = useState<M.BusinessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloudError, setCloudError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState("Overview");
  const [projectEdit, setProjectEdit] = useState<{
    id?: string;
    value: M.Project;
  } | null>(null);
  const [settings, setSettings] = useState(false);
  const [invoiceOverview, setInvoiceOverview] = useState(false);
  const [invoiceOpenId, setInvoiceOpenId] = useState('');
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const [materialEdit, setMaterialEdit] = useState<{
    id?: string;
    value: M.Materials;
  } | null>(null);
  const [quoteEdit, setQuoteEdit] = useState<{
    id?: string;
    value: M.Quote;
  } | null>(null);
  const [photo, setPhoto] = useState<RecordOf<"photo"> | null>(null);
  const [calculation, setCalculation] =
    useState<RecordOf<"calculation"> | null>(null);
  const [history, setHistory] = useState<CalculationHistory[] | null>(null);
  const [snapshot, setSnapshot] = useState<CalculationHistory | null>(null);
  const [calcName, setCalcName] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setUid(user?.uid || "");
        setRecords([]);
        setProjectId(user ? initialProjectId : "");
        setProjectEdit(null);
        setQuoteEdit(null);
        setMaterialEdit(null);
        setPhoto(null);
        setCalculation(null);
        setHistory(null);
        setSnapshot(null);
        setSettings(false);
        setInvoiceOverview(false);
        setInvoiceOpenId('');
        setPreview(null);
        setNotice("");
        setError("");
        setCloudError("");
      }),
    [initialProjectId]
  );
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let live = true;
    const reload = () =>
      void S.readBusiness(uid)
        .then((rows) => {
          if (live) setRecords(rows);
        })
        .catch((e) => {
          if (live) setError(message(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    setLoading(true);
    reload();
    const unsub = S.subscribeBusiness(reload);
    const sync = () => void S.syncBusiness(uid);
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) sync();
    };
    const complete = (e: Event) => {
      if (live && (e as CustomEvent<string>).detail === uid) setCloudError("");
    };
    const syncError = (e: Event) => {
      if (live) setCloudError((e as CustomEvent<string>).detail);
    };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("sparkys-business-sync-complete", complete);
    window.addEventListener("sparkys-business-sync-error", syncError);
    sync();
    const interval = setInterval(sync, 60000);
    return () => {
      live = false;
      unsub();
      clearInterval(interval);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("sparkys-business-sync-complete", complete);
      window.removeEventListener("sparkys-business-sync-error", syncError);
    };
  }, [uid]);
  const active = records.filter((r) => !r.deleted);
  const projects = active.filter(
    (r) => r.kind === "project"
  ) as RecordOf<"project">[];
  const project = projects.find((p) => p.id === projectId);
  const children = active.filter((r) => r.projectId === projectId);
  const lists = children.filter(
    (r) => r.kind === "materials"
  ) as RecordOf<"materials">[];
  const quotes = children.filter(
    (r) => r.kind === "quote"
  ) as RecordOf<"quote">[];
  const company = M.businessProfile(
    (active.find((r) => r.kind === "settings")?.payload as M.Company) || {}
  );
  useEffect(() => {
    setNotes(project?.payload.notes || "");
  }, [project?.id, project?.updatedAt]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const saved = () =>
    setNotice("Saved on this device. Cloud sync status is shown below.");
  const saveProject = async (value: M.Project) => {
    if (
      projects.some(
        (p) => p.id !== projectEdit?.id && p.payload.number === value.number
      )
    )
      throw Error("That project number is already in use.");
    const result = await S.saveBusiness(
      uid,
      "project",
      "",
      value,
      projectEdit?.id
    );
    setProjectId(result.id);
    setTab("Overview");
    setProjectEdit(null);
    saved();
  };
  const newProject = () => {
    try {
      setProjectEdit({
        value: M.blankProject(
          M.nextProjectNumber(
            records.filter((r) => r.kind === "project") as RecordOf<"project">[]
          )
        ),
      });
    } catch (e) {
      setError(message(e));
    }
  };
  const remove = async (record: M.BusinessRecord) => {
    if (
      !confirm(
        record.kind === "project"
          ? "Delete this project, its unissued drafts, photos, quotes, materials and calculations? Issued invoices, credit notes, payment history and original financial PDFs are retained separately in All invoices. Archive instead to keep project context. This deletion cannot be undone."
          : "Delete this record?"
      )
    )
      return;
    await S.removeBusiness(uid, record.id);
    if (record.kind === "project") setProjectId("");
    saved();
  };
  const newQuote = () => {
    if (!project) return;
    let n = 1;
    while (
      records.some(
        (r) =>
          r.id ===
          M.quoteId(
            `Q-${project.payload.number
              .replace(/[^A-Za-z0-9_-]/g, "")
              .slice(0, 30)}-${n}`,
            1
          )
      )
    )
      n++;
    setQuoteEdit({
      value: {
        reference: `Q-${project.payload.number
          .replace(/[^A-Za-z0-9_-]/g, "")
          .slice(0, 30)}-${n}`,
        revision: 1,
        type: "Quote",
        issueDate: M.today(),
        validUntil: M.quoteValidUntil(M.today(), company),
        documentOptions: M.documentOptions(),
        customer: {
          customer: project.payload.customer,
          address: project.payload.address,
          email: project.payload.email,
          phone: project.payload.phone,
          title: project.payload.title,
        },
        company: clone(company),
        scope: project.payload.description,
        items: [],
        discount: "0.00",
        vatPercent: "20",
        terms: company.terms,
        exclusions: company.exclusions,
        notes: "",
        status: "Draft",
      },
    });
  };
  const pdfQuote = async (value: M.Quote) => {
    if (value.issuedAt && value.pdfId)
      return S.readFile(uid, projectId, value.pdfId);
    const logo = value.company.logoId
      ? await blobDataUrl(await S.readFile(uid, "", value.company.logoId))
      : undefined;
    return quotePdf(value, logo);
  };
  const openQuotePreview = async (value: M.Quote) => {
    const frozen = clone(value);
    setPreview({
      filename: `${frozen.reference}-r${frozen.revision}.pdf`,
      options: frozen.documentOptions,
      editable: false,
      issued: !!frozen.issuedAt,
      generate: () => pdfQuote(frozen),
    });
  };
  const openMaterialsPreview = async (value: M.Materials) => {
    if (!project) return;
    const list = clone(value),
      branding = clone(company),
      site = clone(project.payload);
    setPreview({
      filename: `materials-${site.number}.pdf`,
      editable: true,
      allowInternal: true,
      generate: async (options) =>
        materialsPdf(
          site,
          list,
          branding,
          branding.logoId
            ? await blobDataUrl(await S.readFile(uid, "", branding.logoId))
            : undefined,
          options
        ),
    });
  };
  const openCalculationPreview = async (value: M.SavedCalculation) => {
    const frozen = clone(value),
      branding = clone(company),
      site = project ? clone(project.payload) : undefined;
    setPreview({
      filename: `calculation-${site?.number || "report"}.pdf`,
      editable: true,
      allowInternal: true,
      generate: async (options) =>
        snapshotPdf(
          frozen.name,
          frozen,
          branding,
          site,
          branding.logoId
            ? await blobDataUrl(await S.readFile(uid, "", branding.logoId))
            : undefined,
          options
        ),
    });
  };
  const saveQuote = async (value: M.Quote) => {
    const id = quoteEdit?.id || M.quoteId(value.reference, value.revision);
    if (!quoteEdit?.id && records.some((r) => r.id === id))
      throw Error(
        "Document reference and revision are already in use. Choose another reference."
      );
    if (quoteEdit?.id && id !== M.quoteId(value.reference, value.revision))
      throw Error("Create a new revision to change a document reference.");
    let payload = clone(value);
    if (!payload.issuedAt && ["Sent", "Accepted"].includes(payload.status)) {
      payload.issuedAt = new Date().toISOString();
      const blob = await pdfQuote(payload);
      payload = {
        ...payload,
        issuedAt: payload.issuedAt,
        pdfId: await S.saveFile(uid, projectId, blob),
      };
    }
    await S.saveBusiness(uid, "quote", projectId, payload, id);
    setQuoteEdit(null);
    saved();
  };
  const pickHistory = () =>
    void run(async () => {
      setHistory((await getHistory(uid)).filter((item) => item.userId === uid));
    });
  const syncGroups = projectSyncGroups(records);
  if (!uid)
    return (
      <div className="business">
        <h1>Projects</h1>
        <p>
          Sign in to keep your business records private and available across
          your devices.
        </p>
        <button onClick={onSignIn}>Sign in / create account</button>
      </div>
    );
  return (
    <BusinessErrorContext.Provider value={error}>
      <div className="business">
        <header>
          {project ? (
            <Action
              title="Back to projects"
              onClick={() => {
                setProjectId("");
                setTab("Overview");
              }}
            >
              <ArrowLeft size={22} />
            </Action>
          ) : (
            <FolderOpen size={24} />
          )}
          <h1>{project ? `Project ${project.payload.number}` : "Projects"}</h1>
          <Action title="Business Profile" onClick={() => setSettings(true)}>
            <Settings size={22} />
          </Action>
          <button onClick={()=>setInvoiceOverview(!invoiceOverview)}><Receipt size={18}/>{invoiceOverview?'Back to projects':'All invoices'}</button>
          {!project && (
            <button disabled={busy} onClick={newProject}>
              <Plus size={18} />
              New project
            </button>
          )}
        </header>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <div className="business-sync">
          <span>
            {loading
              ? "Loading saved projects..."
              : syncGroups.length
              ? `${syncGroups.length} ${syncGroups.length === 1 ? 'item' : 'items'} unsynced`
              : "No pending local changes"}
            {!online ? " - offline" : ""}
          </span>
          <Action
            title="Retry sync"
            onClick={() =>
              void run(async () => {
                await S.syncBusiness(uid);
              })
            }
            disabled={busy}
          >
            <RefreshCw size={18} />
          </Action>
          <button
            onClick={() =>
              void run(async () => {
                const blob = new Blob([JSON.stringify(records, null, 2)], {
                  type: "application/json",
                });
                await downloadFile(
                  await blobDataUrl(blob),
                  `projects-backup-${M.today()}.json`,
                  "application/json"
                );
              })
            }
          >
            Export local backup
          </button>
        </div>
        {(syncGroups.length > 0 || cloudError) && <details>
          <summary>
            Cloud backup details
          </summary>
          {cloudError && !syncGroups.length && <p className="business-warning">Cloud backup status could not be checked. Check your connection and retry.</p>}
          {syncGroups
            .filter(group => !project || group.id === project.id || group.id === 'business-profile')
            .map(group => (
              <div className="business-warning" key={group.id}>
                <p><strong>{group.label}</strong>: {syncGroupMessage(group.records)}</p>
                {group.records.filter(r => r.sync === 'conflict').map(r => (
                  <button
                    key={r.id}
                    onClick={() =>
                      void run(async () => {
                        if (
                          confirm(
                            "Replace this local record with the cloud version? Export your local backup first to keep unsynced edits."
                          )
                        )
                          await S.useCloudVersion(uid, r.id);
                      })
                    }
                  >
                    Use cloud version: {r.kind}
                  </button>
                ))}
              </div>
            ))}
        </details>}
        {invoiceOverview ? <Invoices key={uid+'-all'} uid={uid} records={records} company={company}/> : !project ? (
          <>
            <Field
              label="Search projects"
              value={search}
              onChange={setSearch}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Include archived projects
            </label>
            <div className="business-list">
              {projects
                .filter(
                  (p) =>
                    (archived || p.payload.status !== "Archived") &&
                    [
                      p.payload.number,
                      p.payload.customer,
                      p.payload.title,
                      p.payload.address,
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase())
                )
                .map((p) => (
                  <button
                    className="business-row"
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                  >
                    <strong>
                      Project {p.payload.number} - {p.payload.customer}
                    </strong>
                    <span>{p.payload.title}</span>
                    <small>
                      {p.payload.status} | Updated{" "}
                      {M.ukDate(
                        [
                          p.updatedAt,
                          ...active
                            .filter((c) => c.projectId === p.id)
                            .map((c) => c.updatedAt),
                        ]
                          .sort()
                          .at(-1)!
                      )}{" "}
                      | {syncGroups.some(group => group.id === p.id) ? 'unsynced' : 'synced'}
                    </small>
                  </button>
                ))}
            </div>
            {!loading && !projects.length && <p>No projects yet.</p>}
          </>
        ) : (
          <>
            <h2>{project.payload.customer}</h2>
            <p>{project.payload.title}</p>
            <div
              className="business-tabs"
              role="tablist"
              aria-label="Project sections"
            >
              {[
                "Overview",
                "Photos",
                "Quotes / Estimates",
                "Invoices",
                "RAMS",
                "Materials",
                "Calculations",
                "Notes",
              ].map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "Overview" && (
              <>
                <dl>
                  <dt>Status</dt>
                  <dd>{project.payload.status}</dd>
                  <dt>Site address</dt>
                  <dd className="pre-wrap">{project.payload.address || "-"}</dd>
                  <dt>Contact</dt>
                  <dd>
                    {[project.payload.email, project.payload.phone]
                      .filter(Boolean)
                      .join(" | ") || "-"}
                  </dd>
                  <dt>Description</dt>
                  <dd className="pre-wrap">
                    {project.payload.description || "-"}
                  </dd>
                  <dt>Latest activity</dt>
                  <dd>
                    {M.ukDate(
                      [project.updatedAt, ...children.map((c) => c.updatedAt)]
                        .sort()
                        .at(-1)!
                    )}
                  </dd>
                </dl>
                <WorkStartDate key={project.id} value={project.payload.startDate ?? ""}
                  save={async (startDate) => {
                    await S.saveBusiness(uid, "project", "", { ...project.payload, startDate }, project.id);
                    saved();
                  }} />
                <h3>Latest quote totals</h3>
                {quotes
                  .filter(
                    (q) =>
                      !quotes.some(
                        (other) =>
                          other.payload.reference === q.payload.reference &&
                          other.payload.revision > q.payload.revision
                      )
                  )
                  .map((q) => (
                    <p key={q.id}>
                      {q.payload.type} {q.payload.reference} r
                      {q.payload.revision} ({q.payload.status}):{" "}
                      {quoteAmount(q.payload)}
                    </p>
                  ))}
                {!quotes.length && <p>No quotes or estimates.</p>}
                <div className="business-actions">
                  <button
                    onClick={() =>
                      setProjectEdit({ id: project.id, value: project.payload })
                    }
                  >
                    <Pencil size={18} />
                    Edit project
                  </button>
                  <button
                    onClick={() => {
                      setTab("Photos");
                    }}
                  >
                    Add photo
                  </button>
                  <button onClick={newQuote}>New quote</button>
                  <button
                    onClick={() =>
                      setMaterialEdit({
                        value: { name: "Materials", notes: "", items: [] },
                      })
                    }
                  >
                    New materials list
                  </button>
                  <button onClick={pickHistory}>Save calculation</button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await S.saveBusiness(
                          uid,
                          "project",
                          "",
                          {
                            ...project.payload,
                            status:
                              project.payload.status === "Archived"
                                ? "Draft"
                                : "Archived",
                          },
                          project.id
                        );
                        saved();
                      })
                    }
                  >
                    {project.payload.status === "Archived"
                      ? "Unarchive"
                      : "Archive"}
                  </button>
                  <Action
                    title="Delete project and all content"
                    disabled={busy}
                    onClick={() => void run(() => remove(project))}
                  >
                    <Trash2 size={18} />
                  </Action>
                </div>
              </>
            )}
            {tab === 'RAMS' && <RamsPanel key={uid+'/'+project.id} uid={uid} projectId={project.id} project={project.payload} company={company} records={records}/>}
            {tab === "Photos" && (
              <>
                <div className="business-actions">
                  <label className="business-file">
                    <Camera size={20} />
                    Take photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={busy}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = "";
                        if (!files.length) return;
                        void run(async () => {
                          for (const file of files)
                            await S.addPhoto(uid, projectId, file, "");
                          saved();
                        });
                      }}
                    />
                  </label>
                  <label className="business-file">
                    <ImagePlus size={20} />
                    Choose photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busy}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = "";
                        if (!files.length) return;
                        void run(async () => {
                          for (const file of files)
                            await S.addPhoto(uid, projectId, file, "");
                          saved();
                        });
                      }}
                    />
                  </label>
                </div>
                <p className="business-muted">
                  If the camera or library does not open, allow access in device
                  settings or choose an existing JPEG/PNG image.
                </p>
                <div className="business-photos">
                  {(
                    children.filter(
                      (r) => r.kind === "photo"
                    ) as RecordOf<"photo">[]
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPhoto(p);
                        setCaption(p.payload.caption);
                      }}
                    >
                      <Asset
                        uid={uid}
                        projectId={projectId}
                        id={p.payload.thumbnailId}
                      />
                      <span>{p.payload.caption || "Untitled photo"}</span>
                      <small>{M.ukDate(p.payload.addedAt)}</small>
                    </button>
                  ))}
                </div>
                {!children.some((r) => r.kind === "photo") && (
                  <p>No job photos yet.</p>
                )}
              </>
            )}
            {tab === "Materials" && (
              <>
                <button
                  onClick={() =>
                    setMaterialEdit({
                      value: { name: "Materials", notes: "", items: [] },
                    })
                  }
                >
                  <Plus size={18} />
                  New materials list
                </button>
                {lists.map((l) => (
                  <div className="business-row" key={l.id}>
                    <button
                      onClick={() =>
                        setMaterialEdit({ id: l.id, value: l.payload })
                      }
                    >
                      {l.payload.name} - {M.money(M.materialTotals(l.payload))}
                    </button>
                    <div className="business-actions">
                      <Action
                        title="Duplicate list"
                        onClick={() =>
                          void run(async () => {
                            const copy = clone(l.payload);
                            copy.name += " (copy)";
                            copy.items = copy.items.map((i) => ({
                              ...i,
                              id: crypto.randomUUID(),
                            }));
                            await S.saveBusiness(
                              uid,
                              "materials",
                              projectId,
                              copy
                            );
                            saved();
                          })
                        }
                      >
                        <Copy size={18} />
                      </Action>
                      <Action
                        title="Preview / share materials PDF"
                        onClick={() =>
                          void run(() => openMaterialsPreview(l.payload))
                        }
                      >
                        <Download size={18} />
                      </Action>
                      <Action
                        title="Delete list"
                        onClick={() => void run(() => remove(l))}
                      >
                        <Trash2 size={18} />
                      </Action>
                    </div>
                  </div>
                ))}
                {!lists.length && <p>No materials lists yet.</p>}
              </>
            )}
            {tab === "Quotes / Estimates" && (
              <>
                <button onClick={newQuote}>
                  <Plus size={18} />
                  New quote / estimate
                </button>
                {quotes.map((q) => (
                  <div className="business-row" key={q.id}>
                    <button
                      onClick={() =>
                        setQuoteEdit({ id: q.id, value: q.payload })
                      }
                    >
                      {q.payload.type} {q.payload.reference} r
                      {q.payload.revision} - {q.payload.status} -{" "}
                      {quoteAmount(q.payload)}
                    </button>
                    <div className="business-actions">
                      <button disabled={busy} onClick={()=>void run(async()=>{
                        let cloud=true;
                        const invoices=await loadInvoices(uid).catch(async()=>{cloud=false;return cachedInvoices(uid);});
                        const duplicate=invoices.some(i=>i.state!=='Void'&&i.draft.projectId===projectId&&i.draft.sourceQuote?.reference===q.payload.reference)||active.some(r=>r.kind==='invoiceDraft'&&(r.payload as M.BusinessPayloads['invoiceDraft']).sourceQuote?.reference===q.payload.reference&&r.projectId===projectId);
                        if((duplicate||!cloud)&&!confirm(duplicate?'This quote already has an invoice or invoice draft. Create another independent draft only if you intend additional billing.':"Other devices could not be checked for duplicate invoices. Continue with an offline draft?"))return;
                        const draft=await S.saveBusiness(uid,'invoiceDraft',projectId,fromQuote(q.id,q.payload,projectId,project.payload));setInvoiceOpenId(draft.id);setTab('Invoices');
                      })}><Receipt size={18}/>Create invoice</button>
                      {q.payload.issuedAt && (
                        <button
                          onClick={() =>
                            setQuoteEdit({
                              value: M.revisionOf(
                                q.payload,
                                quotes.map((r) => r.payload)
                              ),
                            })
                          }
                        >
                          <Copy size={18} />
                          New revision
                        </button>
                      )}
                      <Action
                        title="Preview / share PDF"
                        onClick={() =>
                          void run(() => openQuotePreview(q.payload))
                        }
                      >
                        <Download size={18} />
                      </Action>
                      {!q.payload.issuedAt && (
                        <Action
                          title="Delete draft document"
                          onClick={() => void run(() => remove(q))}
                        >
                          <Trash2 size={18} />
                        </Action>
                      )}
                    </div>
                  </div>
                ))}
                {!quotes.length && <p>No quotes or estimates yet.</p>}
              </>
            )}
            {tab === "Invoices" && <Invoices key={uid+'-'+projectId} uid={uid} records={records} company={company} project={project} openId={invoiceOpenId}/>}
            {tab === "Calculations" && (
              <>
                <button onClick={pickHistory}>
                  <Plus size={18} />
                  Save calculation from history
                </button>
                {(
                  children.filter(
                    (r) => r.kind === "calculation"
                  ) as RecordOf<"calculation">[]
                ).map((c) => (
                  <div className="business-row" key={c.id}>
                    <button onClick={() => setCalculation(c)}>
                      {c.payload.name}
                      <small>
                        {c.payload.snapshot.type} |{" "}
                        {M.ukDate(c.payload.savedAt)}
                      </small>
                    </button>
                    <Action
                      title="Delete calculation snapshot"
                      onClick={() => void run(() => remove(c))}
                    >
                      <Trash2 size={18} />
                    </Action>
                  </div>
                ))}
                {!children.some((r) => r.kind === "calculation") && (
                  <p>No calculations saved to this project.</p>
                )}
              </>
            )}
            {tab === "Notes" && (
              <>
                <Field
                  label="Project notes"
                  area
                  value={notes}
                  onChange={setNotes}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await S.saveBusiness(
                        uid,
                        "project",
                        "",
                        { ...project.payload, notes },
                        project.id
                      );
                      saved();
                    })
                  }
                >
                  <Save size={18} />
                  Save notes
                </button>
              </>
            )}
          </>
        )}
        {projectEdit && (
          <Modal
            title={projectEdit.id ? "Edit project" : "New project"}
            close={() => setProjectEdit(null)}
          >
            <ProjectForm
              value={projectEdit.value}
              save={saveProject}
              cancel={() => setProjectEdit(null)}
            />
          </Modal>
        )}
        {settings && (
          <Modal title="Business Profile" close={() => setSettings(false)}>
            <BusinessProfile
              value={company}
              uid={uid}
              save={async (value) => {
                await S.saveBusiness(
                  uid,
                  "settings",
                  "",
                  value,
                  "company-settings"
                );
                setSettings(false);
                saved();
              }}
            />
          </Modal>
        )}
        {materialEdit && project && (
          <Modal
            hidden={!!preview}
            title="Materials list"
            close={() => setMaterialEdit(null)}
          >
            <MaterialsEditor
              value={materialEdit.value}
              save={async (value) => {
                await S.saveBusiness(
                  uid,
                  "materials",
                  projectId,
                  value,
                  materialEdit.id
                );
                setMaterialEdit(null);
                setTab("Materials");
                saved();
              }}
              exportPdf={openMaterialsPreview}
            />
          </Modal>
        )}
        {quoteEdit && (
          <Modal
            hidden={!!preview}
            title="Quote / estimate"
            close={() => setQuoteEdit(null)}
          >
            <QuoteEditor
              value={quoteEdit.value}
              lists={lists}
              save={saveQuote}
              exportPdf={openQuotePreview}
            />
          </Modal>
        )}
        {photo && (
          <Modal title="Job photo" close={() => setPhoto(null)}>
            <Asset
              uid={uid}
              projectId={projectId}
              id={photo.payload.imageId}
              full
            />
            <p>Added {M.ukDate(photo.payload.addedAt)}</p>
            <Field label="Caption" area value={caption} onChange={setCaption} />
            <footer>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await S.saveBusiness(
                      uid,
                      "photo",
                      projectId,
                      { ...photo.payload, caption },
                      photo.id
                    );
                    setPhoto(null);
                    saved();
                  })
                }
              >
                <Save size={18} />
                Save caption
              </button>
              <Action
                title="Delete photo"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await remove(photo);
                    setPhoto(null);
                  })
                }
              >
                <Trash2 size={18} />
              </Action>
            </footer>
          </Modal>
        )}
        {history && !projectEdit && (
          <Modal
            title="Save calculation to project"
            close={() => {
              setHistory(null);
              setSnapshot(null);
            }}
          >
            <p>
              Choose a saved result. Original inputs and results are kept as a
              snapshot.
            </p>
            <label>
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Choose project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.payload.number} - {p.payload.title}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={newProject}>
              <Plus size={18} />
              Create project
            </button>
            <label>
              Saved result
              <select
                value={snapshot?.id || ""}
                onChange={(e) => {
                  const value = history.find((h) => h.id === e.target.value);
                  setSnapshot(value || null);
                  setCalcName(value?.title || "");
                }}
              >
                <option value="">Choose calculation</option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title || h.type} - {M.ukDate(h.createdAt)}{" "}
                    {new Date(h.createdAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </option>
                ))}
              </select>
            </label>
            {!history.length && (
              <p>
                No saved calculations for this account. Calculate and save a
                result first.
              </p>
            )}
            <Field
              label="Calculation name"
              value={calcName}
              onChange={setCalcName}
            />
            <button
              disabled={busy || !snapshot || !projectId}
              onClick={() =>
                void run(async () => {
                  await S.saveBusiness(
                    uid,
                    "calculation",
                    projectId,
                    M.calculationSnapshot(calcName, snapshot!)
                  );
                  setHistory(null);
                  setSnapshot(null);
                  setTab("Calculations");
                  saved();
                })
              }
            >
              <Save size={18} />
              Save snapshot
            </button>
          </Modal>
        )}
        {calculation && (
          <Modal
            hidden={!!preview}
            title={calculation.payload.name}
            close={() => setCalculation(null)}
          >
            <p>
              {calculation.payload.engineVersion} |{" "}
              {M.ukDate(calculation.payload.savedAt)}
            </p>
            <p>Historical snapshot. Saving does not certify compliance.</p>
            <CalculationFields
              title="Original inputs"
              values={calculation.payload.snapshot.inputs}
            />
            <CalculationFields
              title="Original results"
              values={calculation.payload.snapshot.results}
            />
            <details>
              <summary>Units, assumptions and reference metadata</summary>
              <pre>
                {JSON.stringify(
                  {
                    units: calculation.payload.units,
                    references: calculation.payload.referenceMetadata,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
            <footer>
              <button
                onClick={() =>
                  void run(() => openCalculationPreview(calculation.payload))
                }
              >
                <Download size={18} />
                Preview / share PDF
              </button>
              {onReopen &&
                (calculation.payload.snapshot.type === "cable_finder" ||
                  (calculation.payload.snapshot.type === "circuit" &&
                    calculation.payload.snapshot.inputs.loadKw !==
                      undefined)) && (
                  <button
                    onClick={() => {
                      if (onReopen(clone(calculation.payload.snapshot)))
                        setCalculation(null);
                      else
                        setError(
                          "This calculator does not yet support restoring inputs. The original snapshot remains available to view or export."
                        );
                    }}
                  >
                    Reopen as new calculation
                  </button>
                )}
            </footer>
          </Modal>
        )}
        {preview && (
          <Modal title="Document preview" close={() => setPreview(null)}>
            <DocumentPreview request={preview} />
          </Modal>
        )}
        {busy && <p role="status">Working...</p>}
      </div>
    </BusinessErrorContext.Provider>
  );
}
