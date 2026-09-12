import * as Location from "expo-location";
import { Platform } from "react-native";
import type { LatLng } from "./mapLocation";
export interface NativePlace {
  id: string;
  name: string;
  address: string;
  location: LatLng;
}
export async function searchNativePlaces(
  query: string,
): Promise<NativePlace[]> {
  if (!query.trim()) return [];
  if (Platform.OS === "web")
    throw new Error("장소 검색은 iOS·Android 앱에서 사용해 주세요.");
  if (Platform.OS === "android") {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      throw new Error("주소 검색을 위해 위치 권한을 허용해 주세요.");
  }
  const points = await Location.geocodeAsync(query.trim());
  return Promise.all(
    points.slice(0, 8).map(async (point, index) => {
      let address = query.trim();
      try {
        const [item] = await Location.reverseGeocodeAsync(point);
        if (item)
          address =
            [
              item.region,
              item.city,
              item.district,
              item.street,
              item.streetNumber,
            ]
              .filter(Boolean)
              .join(" ") || address;
      } catch {
        /* Keep the searched address if reverse geocoding is unavailable. */
      }
      return {
        id: `geo:${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}:${index}`,
        name: query.trim(),
        address,
        location: { lat: point.latitude, lng: point.longitude },
      };
    }),
  );
}
