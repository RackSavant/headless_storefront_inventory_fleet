/**
 * Lazy firebase-admin setup (server only). Credentials, first match wins:
 *  - FIREBASE_SERVICE_ACCOUNT_JSON: the service-account JSON as a single string
 *  - GOOGLE_APPLICATION_CREDENTIALS / Application Default Credentials
 * FIREBASE_PROJECT_ID is optional when the credentials already carry a project.
 */
import type { Firestore } from "firebase-admin/firestore";

let db: Promise<Firestore> | null = null;

export function firebaseConfigured() {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_PROJECT_ID);
}

export function getFirestoreDb(): Promise<Firestore> {
  if (db) return db;
  db = (async () => {
    const { applicationDefault, cert, getApps, initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      initializeApp({
        credential: json ? cert(JSON.parse(json)) : applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || undefined,
      });
    }
    return getFirestore();
  })();
  db.catch(() => (db = null));
  return db;
}
