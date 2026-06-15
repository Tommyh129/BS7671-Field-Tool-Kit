import { getApiUrl } from './api';

export interface RegulatoryUpdate {
  version: string;
  amendment: string;
  date: string;
  summary: string;
  changes: string[];
}

export const REGULATORY_CACHE_VERSION = "bs7671-a4-2026-04-15";

export const DEFAULT_REGULATORY_UPDATE: RegulatoryUpdate = {
  version: "BS 7671:2018+A4:2026",
  amendment: "Amendment 4:2026",
  date: "15 April 2026",
  summary:
    "IET and BSI published Amendment 4:2026 to BS 7671:2018 on 15 April 2026, introducing updates for stationary secondary batteries, medical locations, functional earthing, Power over Ethernet, and harmonised standards.",
  changes: [
    "New chapter for stationary secondary batteries and energy storage systems.",
    "Major revision of Section 710 Medical Locations.",
    "New requirements for functional earthing and functional equipotential bonding for ICT systems.",
    "New Section 716 requirements for Power over Ethernet installations.",
    "BS 7671:2018+A2:2022+A3:2024 enters a six-month transition period before withdrawal."
  ]
};

interface CheckRegulatoryUpdateOptions {
  force?: boolean;
  timeoutMs?: number;
  throwOnError?: boolean;
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

export async function checkRegulatoryUpdates(options: CheckRegulatoryUpdateOptions = {}): Promise<RegulatoryUpdate> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  const query = options.force ? "?refresh=true" : "";

  try {
    const response = await fetch(getApiUrl(`/api/regulatory-updates${query}`), {
      cache: options.force ? "no-store" : "default",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Regulatory update request failed: ${response.status}`);
    }

    const data = await response.json();
    return normalizeRegulatoryUpdate(data);
  } catch (error) {
    console.error("Error checking regulatory updates:", error);
    if (options.throwOnError) {
      throw error;
    }
    return DEFAULT_REGULATORY_UPDATE;
  } finally {
    clearTimeout(timeout);
  }
}
