import { useEffect, useState } from "react";
import { FolderPlus, Save } from "lucide-react";
import { auth } from "../firebase";
import { AppMode, type CalculationHistory } from "../types";
import { getHistory } from "../services/historyService";
import {
  blankProject,
  calculationSnapshot,
  nextProjectNumber,
  type BusinessRecord,
  type Project,
} from "./model";
import { readBusiness, saveBusiness } from "./store";
import { ProjectForm, Modal } from "./Projects";

const modeTypes: Partial<Record<AppMode, CalculationHistory["type"]>> = {
  SMART_CIRCUIT: "circuit",
  VOLTAGE_DROP: "circuit",
  CABLE_FINDER: "cable_finder",
  ZS_CALCULATOR: "zs",
  FAULT_CURRENT: "fault",
  CABLE_RESISTANCE: "cable_resistance",
  MAX_LENGTH: "max_length",
  EARTH_ELECTRODE: "electrode",
  THREE_PHASE: "three-phase",
  THREE_PHASE_MOTOR: "three-phase-motor",
  DC_VOLTAGE_DROP: "dc_voltage_drop",
  PROTECTIVE_DEVICE_SELECTOR: "protective_device_selector",
};
export function SaveToProject({
  mode,
  onSignIn,
  hasBusiness,
  onUpgrade,
}: {
  mode: AppMode;
  onSignIn: () => void;
  hasBusiness: boolean;
  onUpgrade: () => void;
}) {
  const [item, setItem] = useState<CalculationHistory | null>(null);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<BusinessRecord<"project">[]>([]);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setItem(null);
    setStatus("");
    const listener = (e: Event) => {
      const value = (e as CustomEvent<CalculationHistory>).detail;
      if (
        value.type === modeTypes[mode] &&
        value.userId === (auth.currentUser?.uid || "local")
      )
        setItem(value);
    };
    const select = (e: Event) => {
      if (!hasBusiness) {onUpgrade();return;}
      setItem((e as CustomEvent<CalculationHistory>).detail);
      setOpen(true);
    };
    window.addEventListener("sparkys-calculation-ready", listener);
    window.addEventListener("sparkys-save-to-project", select);
    void getHistory(auth.currentUser?.uid).then((rows) => {
      if (live && modeTypes[mode])
        setItem(
          rows.find(
            (row) =>
              row.type === modeTypes[mode] &&
              row.userId === (auth.currentUser?.uid || "local")
          ) || null
        );
    });
    return () => {
      live = false;
      window.removeEventListener("sparkys-calculation-ready", listener);
      window.removeEventListener("sparkys-save-to-project", select);
    };
  }, [mode, hasBusiness]);
  useEffect(() => {
    if (!open) return;
    if (!hasBusiness) {setOpen(false);onUpgrade();return;}
    setCreating(false);
    setError("");
    setName(item?.title || "");
    setProjectId("");
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setOpen(false);
      onSignIn();
      return;
    }
    let live = true;
    readBusiness(uid)
      .then((rows) => {
        if (live)
          setProjects(
            rows.filter(
              (r) => r.kind === "project" && !r.deleted
            ) as BusinessRecord<"project">[]
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [open, hasBusiness]);
  const save = async () => {
    if (!hasBusiness) {onUpgrade();return;}
    const uid = auth.currentUser?.uid;
    if (!uid) {
      onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!item || (item.userId !== uid && item.userId !== "local"))
        throw Error("This result belongs to a different account.");
      await saveBusiness(
        uid,
        "calculation",
        projectId,
        calculationSnapshot(name, item)
      );
      setOpen(false);
      setStatus(
        "Snapshot saved on this device. Check Projects for cloud sync status."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="business">
      {modeTypes[mode] && (
        <>
          <button disabled={!item} onClick={() => hasBusiness ? setOpen(true) : onUpgrade()}>
            <FolderPlus size={18} />
            Save result to project
          </button>
          {item && (
            <p className="business-muted">Last saved result: {item.title}</p>
          )}
          {status && <p role="status">{status}</p>}
        </>
      )}
      {open && (
        <Modal title="Save result to project" close={() => setOpen(false)}>
          {creating ? (
            <ProjectForm
              value={blankProject(nextProjectNumber(projects))}
              cancel={() => setCreating(false)}
              save={async (value: Project) => {
                if (projects.some((p) => p.payload.number === value.number))
                  throw Error("Project number already in use.");
                const result = await saveBusiness(
                  auth.currentUser!.uid,
                  "project",
                  "",
                  value
                );
                setProjects([...projects, result]);
                setProjectId(result.id);
                setCreating(false);
              }}
            />
          ) : (
            <>
              <p>{item?.title}</p>
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
              <button onClick={() => setCreating(true)}>
                <FolderPlus size={18} />
                New project
              </button>
              <label>
                Calculation name
                <input
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <button
                disabled={busy || !projectId || !item || !name.trim()}
                onClick={() => void save()}
              >
                <Save size={18} />
                {busy ? "Saving..." : "Save snapshot"}
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
