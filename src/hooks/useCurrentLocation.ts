import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Location from "expo-location";
import { useAuth } from "./useAuth";
import {
  hasLocationConsent,
  saveLocationConsent,
} from "../services/consentService";
import { isValidLocation, type LatLng } from "../lib/mapLocation";
import { withLocationTimeout } from "../lib/locationTimeout";
import { auth } from "../lib/firebase";
export const SEOUL_CITY_HALL = { lat: 37.566535, lng: 126.9779692 };
type Position = { coords: { latitude: number; longitude: number } };
const TIMEOUT_MESSAGE = '현재 위치를 확인하지 못했어요. 실내라면 창가로 이동하거나 위치 서비스·네트워크를 확인한 뒤 다시 시도해 주세요.';

// A fresh GPS fix can take long indoors (Expo recommends the last known position
// for quick answers), so: a recent cached fix first, then a short balanced fix,
// then any cached fix, then a coarse network fix.
async function readNativePosition(): Promise<Position> {
  const recent = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 500 }).catch(() => null);
  if (recent) return recent;
  try {
    return await withLocationTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8_000, TIMEOUT_MESSAGE);
  } catch (error) {
    const cached = await Location.getLastKnownPositionAsync().catch(() => null);
    if (cached) return cached;
    try {
      return await withLocationTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), 7_000, TIMEOUT_MESSAGE);
    } catch { throw error; }
  }
}

function readWebPosition(): Promise<Position> {
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve,
    error => reject(new Error(error.code === 1 ? '브라우저 설정에서 위치 권한을 허용해 주세요.' : TIMEOUT_MESSAGE)),
    // A position from the last five minutes answers at once.
    { maximumAge: 5 * 60_000, timeout: 12_000, enableHighAccuracy: false }));
}
export function useCurrentLocation() {
  const { currentUser, accountReady } = useAuth();
  const [location, setLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const uid = currentUser?.uid;
  useEffect(() => {
    revision.current++;
    setLocation(null);
    setError("");
    setLoading(false);
    return () => { revision.current++; };
  }, [uid]);
  const requestLocation = useCallback(async (interactive = true): Promise<LatLng | null> => {
    if (!uid) {
      if (interactive) setError("현재 위치는 로그인 후 사용할 수 있습니다.");
      return null;
    }
    if (!accountReady) {
      if (interactive) setError("계정 정보를 확인한 뒤 다시 시도해 주세요.");
      return null;
    }
    const request = ++revision.current;
    const active = () => request === revision.current && auth?.currentUser?.uid === uid;
    setLoading(true);
    setError("");
    try {
      if (!(await hasLocationConsent(uid))) {
        if (!interactive) return null;
        if (!active()) return null;
        const consentMessage = "현재 위치를 지도에 표시하고 가까운 기록을 찾거나 선택한 핀까지 길찾기를 시작하는 데 사용합니다. 길찾기를 선택하면 현재 위치와 목적지 좌표가 Google 지도로 전달됩니다. 프로필의 약관 및 정책에서 위치기반서비스 이용약관을 확인할 수 있습니다.";
        const accepted = Platform.OS === 'web'
          ? window.confirm("위치기반서비스 이용 동의\n\n" + consentMessage)
          : await new Promise<boolean>((resolve) =>
          Alert.alert(
            "위치기반서비스 이용 동의",
            consentMessage,
            [
              { text: "취소", style: "cancel", onPress: () => resolve(false) },
              { text: "동의", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!active()) return null;
        if (!accepted) throw new Error("위치 이용에 동의하지 않아 현재 위치를 확인할 수 없습니다.");
        await saveLocationConsent(uid, true);
      }
      if (!active()) return null;
      if (!(await Location.hasServicesEnabledAsync())) throw new Error("기기의 위치 서비스를 켠 뒤 다시 시도해 주세요.");
      // Browser geolocation asks permission itself. Expo's web permission request
      // otherwise performs a second, unbounded GPS lookup before the timed one.
      const permission = Platform.OS === 'web' && interactive ? null
        : interactive ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (!active()) return null;
      if (!interactive && !permission?.granted) return null;
      if (permission && !permission.granted)
        throw new Error("기기 또는 브라우저 설정에서 위치 권한을 허용해 주세요.");
      const result = Platform.OS === 'web'
        ? await withLocationTimeout(readWebPosition(), 15_000, TIMEOUT_MESSAGE)
        : await readNativePosition();
      const next = {
        lat: result.coords.latitude,
        lng: result.coords.longitude,
      };
      if (!active()) return null;
      if (!isValidLocation(next)) throw new Error("현재 위치를 확인할 수 없습니다. 다시 시도해 주세요.");
      setLocation(next);
      return next;
    } catch (e) {
      if (active()) setError(e instanceof Error ? e.message : "현재 위치를 찾지 못했습니다.");
      return null;
    } finally {
      if (active()) setLoading(false);
    }
  }, [uid, accountReady]);
  return { location, loading, error, requestLocation };
}
