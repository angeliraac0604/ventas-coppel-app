import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use the databaseId specified in firebase-applet-config.json if present
export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const storage = getStorage(app);

// Validate connection to Firestore non-blocking
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});
  } catch (error: any) {
    // Suppress initial offline warnings
  }
}

// Run test connection without unhandled rejection
setTimeout(() => {
  testConnection().catch(() => {});
}, 1000);

export default app;
