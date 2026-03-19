import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  deleteDoc, 
  doc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { CalculationHistory } from '../types';

const HISTORY_COLLECTION = 'history';

export const saveCalculation = async (
  userId: string, 
  type: CalculationHistory['type'], 
  title: string, 
  inputs: any, 
  results: any
) => {
  try {
    const historyRef = collection(db, 'users', userId, HISTORY_COLLECTION);
    const newDoc = {
      userId,
      type,
      title,
      inputs,
      results,
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(historyRef, newDoc);
    return { id: docRef.id, ...newDoc };
  } catch (error) {
    console.error('Error saving calculation:', error);
    throw error;
  }
};

export const getHistory = async (userId: string): Promise<CalculationHistory[]> => {
  try {
    const historyRef = collection(db, 'users', userId, HISTORY_COLLECTION);
    const q = query(historyRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as CalculationHistory));
  } catch (error) {
    console.error('Error fetching history:', error);
    throw error;
  }
};

export const deleteHistoryItem = async (userId: string, historyId: string) => {
  try {
    const docRef = doc(db, 'users', userId, HISTORY_COLLECTION, historyId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting history item:', error);
    throw error;
  }
};
