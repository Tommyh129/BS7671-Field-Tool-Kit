import { CalculationHistory } from '../types';
import { DATASET_SOURCES, getSourceIdsForTool } from '../data/electrical';
import { clearToolUsage } from './homeSummary';

const LOCAL_HISTORY_KEY = 'bs7671.calculationHistory.v1';
const MAX_HISTORY_ITEMS = 100;

const getStoredHistory = (): CalculationHistory[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading local history:', error);
    return [];
  }
};

const writeStoredHistory = (items: CalculationHistory[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
};

const getCalculationSignature = (
  type: CalculationHistory['type'],
  title: string,
  inputs: any,
  results: any
) => JSON.stringify({ type, title, inputs, results });

export const saveCalculation = async (
  userId: string | null | undefined,
  type: CalculationHistory['type'],
  title: string,
  inputs: any,
  results: any
) => {
  try {
    const sourceIds = getSourceIdsForTool(type, inputs?.cableType, inputs?.material);
    if (sourceIds.length) {
      results = { ...results, dataSources: sourceIds.map(id => DATASET_SOURCES[id]), sourceVerified: false };
    }
    const signature = getCalculationSignature(type, title, inputs, results);
    const history = getStoredHistory();
    const existing = history.find(item => item.userId === (userId || 'local') && getCalculationSignature(item.type, item.title, item.inputs, item.results) === signature);

    if (existing) {
      window.dispatchEvent(new CustomEvent('sparkys-calculation-ready', { detail: existing }));
      return existing;
    }

    const newItem: CalculationHistory = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: userId || 'local',
      type,
      title,
      inputs,
      results,
      createdAt: new Date().toISOString()
    };

    writeStoredHistory([newItem, ...history]);
    window.dispatchEvent(new Event('bs7671-history-updated'));
    window.dispatchEvent(new CustomEvent('sparkys-calculation-ready', { detail: newItem }));
    return newItem;
  } catch (error) {
    console.error('Error saving calculation:', error);
    throw error;
  }
};

export const getHistory = async (userId?: string | null): Promise<CalculationHistory[]> => {
  return getStoredHistory().filter(item => item.userId === (userId || 'local'));
};

export const deleteHistoryItem = async (userId: string | null | undefined, historyId: string) => {
  const history = getStoredHistory();
  writeStoredHistory(history.filter(item => item.id !== historyId || item.userId !== (userId || 'local')));
  window.dispatchEvent(new Event('bs7671-history-updated'));
};

export function clearLocalHistory(userId: string) {
  clearToolUsage(userId);
  writeStoredHistory(getStoredHistory().filter(item => item.userId !== userId));
  window.dispatchEvent(new Event('bs7671-history-updated'));
}
