import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import {
  Auth,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

console.log("Firebase: Initializing SDK with Project ID:", firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let authInstance: Auth;
try {
  authInstance = Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app);
} catch (error) {
  console.warn("Firebase Auth was already initialized; reusing the existing instance.", error);
  authInstance = getAuth(app);
}

export const auth = authInstance;
console.log("Firebase: SDK Initialized.");
