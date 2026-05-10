import { CalculationHistory } from '../types';

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
    const signature = getCalculationSignature(type, title, inputs, results);
    const history = getStoredHistory();
    const existing = history.find(item => getCalculationSignature(item.type, item.title, item.inputs, item.results) === signature);

    if (existing) {
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
    return newItem;
  } catch (error) {
    console.error('Error saving calculation:', error);
    throw error;
  }
};

export const getHistory = async (_userId?: string | null): Promise<CalculationHistory[]> => {
  return getStoredHistory();
};

export const deleteHistoryItem = async (_userId: string | null | undefined, historyId: string) => {
  const history = getStoredHistory();
  writeStoredHistory(history.filter(item => item.id !== historyId));
  window.dispatchEvent(new Event('bs7671-history-updated'));
};
