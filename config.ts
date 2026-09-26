import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase app singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Analytics safely (only in browser environment with support)
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((err) => {
      console.warn('Firebase Analytics not supported in this environment:', err);
    });
}

// Initialize Firestore with reliable long-polling to prevent proxy/iframe timeouts
const customDatabaseId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    customDatabaseId
  );
} catch {
  // If already initialized, retrieve instance
  firestoreInstance = customDatabaseId ? getFirestore(app, customDatabaseId) : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isOfflineError(error: unknown): boolean {
  if (!error) return false;
  let msg = '';
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === 'object') {
    try {
      msg = JSON.stringify(error);
    } catch {
      msg = String(error);
    }
  } else {
    msg = String(error);
  }
  const lower = msg.toLowerCase();
  return (
    lower.includes('offline') ||
    lower.includes('unavailable') ||
    lower.includes('client is offline') ||
    lower.includes('could not reach cloud firestore backend') ||
    lower.includes('backend') ||
    lower.includes('failed to get document') ||
    lower.includes('network') ||
    lower.includes('timeout')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  
  if (isOfflineError(error)) {
    console.warn('Firestore offline/indisponível:', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    const testPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection test timeout')), 4000)
    );
    await Promise.race([testPromise, timeoutPromise]);
    return true;
  } catch (error) {
    if (isOfflineError(error)) {
      console.warn('Firebase connection test: client offline.');
      return false;
    }
    return true;
  }
}
