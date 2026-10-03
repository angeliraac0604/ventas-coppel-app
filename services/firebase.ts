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

// Validate connection to Firestore as per integration guidelines
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("🔥 [Firebase] Firestore connection verified successfully.");
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("🔥 [Firebase] Please check your Firebase configuration: client is offline.");
    } else {
      // Document might not exist, but connection is alive if no network error
      console.log("🔥 [Firebase] Firestore server reachable.");
    }
  }
}

testConnection();

export default app;
