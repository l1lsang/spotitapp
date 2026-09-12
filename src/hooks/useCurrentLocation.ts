import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import { useAuth } from "./useAuth";
import {
  hasLocationConsent,
  saveLocationConsent,
} from "../services/consentService";
import type { LatLng } from "../lib/mapLocation";
import { auth } from "../lib/firebase";
export const SEOUL_CITY_HALL = { lat: 37.566535, lng: 126.9779692 };
export function useCurrentLocation() {
  const { currentUser } = useAuth();
  const [location, setLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLocation(null);
    setError("");
  }, [currentUser?.uid]);
  const requestLocation = useCallback(async (): Promise<LatLng | null> => {
    if (!currentUser) {
      setError("현재 위치는 로그인 후 사용할 수 있습니다.");
      return null;
    }
    setLoading(true);
    setError("");
    try {
      if (!(await hasLocationConsent(currentUser.uid))) {
        const accepted = await new Promise<boolean>((resolve) =>
          Alert.alert(
            "위치기반서비스 이용 동의",
            "현재 위치를 지도에 표시하고 가까운 기록을 찾는 데 사용합니다. 프로필의 약관 및 정책에서 위치기반서비스 이용약관을 확인할 수 있습니다.",
            [
              { text: "취소", style: "cancel", onPress: () => resolve(false) },
              { text: "동의", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!accepted) return null;
        await saveLocationConsent(currentUser.uid, true);
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("휴대폰 설정에서 위치 권한을 허용해 주세요.");
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = {
        lat: result.coords.latitude,
        lng: result.coords.longitude,
      };
      if (auth?.currentUser?.uid !== currentUser.uid) return null;
      setLocation(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "현재 위치를 찾지 못했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);
  return { location, loading, error, requestLocation };
}
