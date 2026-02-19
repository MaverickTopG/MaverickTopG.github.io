import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const getConfig = (): FirebaseConfig => {
  const globalConfig = (window as Window & Record<string, string | undefined>);

  const apiKey =
    globalConfig.PUBLIC_FIREBASE_API_KEY
    || import.meta.env.PUBLIC_FIREBASE_API_KEY
    || '';
  const authDomain =
    globalConfig.PUBLIC_FIREBASE_AUTH_DOMAIN
    || import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN
    || '';
  const projectId =
    globalConfig.PUBLIC_FIREBASE_PROJECT_ID
    || import.meta.env.PUBLIC_FIREBASE_PROJECT_ID
    || '';
  const storageBucket =
    globalConfig.PUBLIC_FIREBASE_STORAGE_BUCKET
    || import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET
    || '';
  const messagingSenderId =
    globalConfig.PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    || import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    || '';
  const appId =
    globalConfig.PUBLIC_FIREBASE_APP_ID
    || import.meta.env.PUBLIC_FIREBASE_APP_ID
    || '';

  if (!apiKey || !authDomain || !projectId) {
    console.warn('Firebase config missing in admin dashboard.');
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseFunctions: Functions | null = null;
let authPersistenceConfigured = false;

export const getFirebaseApp = (): FirebaseApp => {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(getConfig());
  }
  return firebaseApp;
};

const configureAuthPersistence = (auth: Auth) => {
  if (authPersistenceConfigured) return;
  authPersistenceConfigured = true;
  setPersistence(auth, browserSessionPersistence).catch((error) => {
    console.warn('Failed to set session-only auth persistence', error);
  });
};

export const getFirebaseAuth = (): Auth => {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseApp());
    configureAuthPersistence(firebaseAuth);
  }
  return firebaseAuth;
};

export const getFirestoreDb = (): Firestore => getFirestore(getFirebaseApp());
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const getFirebaseStorage = (): FirebaseStorage => getStorage(getFirebaseApp());

export const getFirebaseFunctions = (): Functions => {
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(getFirebaseApp());
  }
  return firebaseFunctions;
};
