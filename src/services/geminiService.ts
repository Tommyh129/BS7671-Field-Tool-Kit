export interface RegulatoryUpdate {
  version: string;
  amendment: string;
  date: string;
  summary: string;
  changes: string[];
}

export const REGULATORY_CACHE_VERSION = "bs7671-a4-2026";

export const DEFAULT_REGULATORY_UPDATE: RegulatoryUpdate = {
  version: "BS 7671:2018+A4:2026",
  amendment: "Amendment 4:2026",
  date: "15 April 2026",
  summary:
    "IET and BSI have published Amendment 4:2026 to BS 7671:2018. The update introduces new requirements for stationary secondary batteries, Power over Ethernet, and further harmonised standards changes. BS 7671:2018+A2:2022+A3:2024 is due to be withdrawn after the transition period.",
  changes: [
    "New chapter for stationary secondary batteries and energy storage systems.",
    "New Section 716 for Power over Ethernet installations.",
    "Further harmonised document and IEC standard updates across BS 7671.",
    "Previous BS 7671:2018+A2:2022+A3:2024 edition enters a six-month transition period."
  ]
};

const DEFAULT_API_BASE_URL = "https://ais-pre-cudgj6lkyex64hxupsknop-164877439791.europe-west1.run.app";

function getApiBaseUrl() {
  const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
  const configuredBase = env.VITE_API_BASE_URL;

  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }

  const { protocol, origin } = window.location;
  if (protocol === "http:" || protocol === "https:") {
    return origin;
  }

  return DEFAULT_API_BASE_URL;
}

function normalizeRegulatoryUpdate(data: Partial<RegulatoryUpdate>): RegulatoryUpdate {
  return {
    version: data.version || DEFAULT_REGULATORY_UPDATE.version,
    amendment: data.amendment || DEFAULT_REGULATORY_UPDATE.amendment,
    date: data.date || DEFAULT_REGULATORY_UPDATE.date,
    summary: data.summary || DEFAULT_REGULATORY_UPDATE.summary,
    changes: Array.isArray(data.changes) && data.changes.length > 0
      ? data.changes
      : DEFAULT_REGULATORY_UPDATE.changes
  };
}

export async function checkRegulatoryUpdates(): Promise<RegulatoryUpdate> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/regulatory-updates`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Regulatory update request failed: ${response.status}`);
    }

    const data = await response.json();
    return normalizeRegulatoryUpdate(data);
  } catch (error) {
    console.error("Error checking regulatory updates:", error);
    return DEFAULT_REGULATORY_UPDATE;
  }
}
