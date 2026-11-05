import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { Platform } from "react-native";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, requireDb } from "../lib/firebase";
export type PushPermissionStatus =
  "unsupported" | "not-configured" | "granted" | "denied" | "prompt";
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
export const isPushConfigured = Boolean(projectId);
const key = (uid: string) => `spotit-native-push:${uid}`;
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (
    Platform.OS === "web" ||
    !Device.isDevice ||
    Constants.appOwnership === "expo"
  )
    return "unsupported";
  if (!projectId) return "not-configured";
  const Notifications = await import("expo-notifications");
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === "denied") return "denied";
  return permission.granted &&
    auth?.currentUser &&
    (await AsyncStorage.getItem(key(auth.currentUser.uid)))
    ? "granted"
    : "prompt";
}
export async function enablePushNotifications(uid: string) {
  if (!projectId) throw new Error("푸시 알림 설정이 아직 준비되지 않았습니다.");
  if (Platform.OS === "web" || Constants.appOwnership === "expo")
    throw new Error("알림은 설치된 피노리 앱에서 켤 수 있습니다.");
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "피노리 알림",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error("설정에서 알림 권한을 허용해 주세요.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (auth?.currentUser?.uid !== uid)
    throw new Error("로그인이 변경되었습니다. 다시 시도해 주세요.");
  const tokenDocId = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    token,
  );
  await setDoc(
    doc(requireDb(), "users", uid, "expoPushTokens", tokenDocId),
    {
      token,
      tokenDocId,
      platform: "expo",
      devicePlatform: Platform.OS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await AsyncStorage.setItem(key(uid), tokenDocId);
}
export async function disablePushNotifications(uid: string) {
  const tokenDocId = await AsyncStorage.getItem(key(uid));
  if (tokenDocId) {
    await deleteDoc(
      doc(requireDb(), "users", uid, "expoPushTokens", tokenDocId),
    );
    await AsyncStorage.removeItem(key(uid));
  }
}
