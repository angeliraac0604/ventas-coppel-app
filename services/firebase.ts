import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Initialize Firestore with IndexedDB persistent local cache and experimentalForceLongPolling
// to prevent the 10-second WebSocket connection timeout in iframes and sandboxed environments
let dbInstance: any;
const dbId = firebaseConfig.firestoreDatabaseId || undefined;

try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true,
  }, dbId);
} catch {
  try {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, dbId);
  } catch {
    dbInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
}

export const db = dbInstance;
export const storage = getStorage(app);

export default app;
