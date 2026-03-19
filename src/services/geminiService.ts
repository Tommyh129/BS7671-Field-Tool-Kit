import { GoogleGenAI } from "@google/genai";

export interface RegulatoryUpdate {
  version: string;
  amendment: string;
  date: string;
  summary: string;
  changes: string[];
}

export async function checkRegulatoryUpdates(): Promise<RegulatoryUpdate> {
  try {
    // Create a new instance right before the call to ensure we use the latest selected API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "What is the current version and latest amendment of BS 7671 (Requirements for Electrical Installations)? Provide the version number, amendment number, release date, and a brief summary of key changes in JSON format.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    return {
      version: data.version || "18th Edition",
      amendment: data.amendment || "Amendment 3:2024",
      date: data.date || "July 2024",
      summary: data.summary || "Latest requirements for electrical installations in the UK, including updates on AFDDs and bidirectional power flow.",
      changes: data.changes || []
    };
  } catch (error) {
    console.error("Error checking regulatory updates:", error);
    return {
      version: "18th Edition",
      amendment: "Amendment 3:2024",
      date: "July 2024",
      summary: "Latest requirements for electrical installations in the UK, including updates on AFDDs and bidirectional power flow.",
      changes: []
    };
  }
}
