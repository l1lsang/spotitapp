import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { Platform } from "react-native";
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const missingFirebaseEnvKeys = Object.entries(config)
  .filter(([, v]) => !v)
  .map(([key]) => key);
export const isFirebaseConfigured = missingFirebaseEnvKeys.length === 0;
export const firebaseApp = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(config))
  : null;
function createAuth(): Auth | null {
  if (!firebaseApp) return null;
  if (Platform.OS === "web") return getAuth(firebaseApp);
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/already-initialized")
      return getAuth(firebaseApp);
    throw error;
  }
}
export const auth = createAuth();
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
export const firebaseInitializationError = "";
export const firebaseConfigMessage = isFirebaseConfigured
  ? ""
  : "서비스 연결 설정이 필요합니다. .env.local의 EXPO_PUBLIC_FIREBASE 항목을 확인해 주세요.";
export const emulatorHost =
  process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ||
  (Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1");
if (
  __DEV__ &&
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
  auth &&
  db &&
  storage
) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || '9099'}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, emulatorHost, Number(process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080));
  connectStorageEmulator(storage, emulatorHost, Number(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT || 9199));
}
export function requireAuth() {
  if (!auth) throw new Error(firebaseConfigMessage);
  return auth;
}
export function requireDb() {
  if (!db) throw new Error(firebaseConfigMessage);
  return db;
}
export function requireStorage() {
  if (!storage) throw new Error(firebaseConfigMessage);
  return storage;
}
