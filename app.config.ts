import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    config.extra?.eas?.projectId;
  return {
    ...config,
    name: "스팟잇",
    slug: "spotit",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "spotit",
    userInterfaceStyle: "light",
    icon: "./assets/spotit/icon.png",
    ios: {
      bundleIdentifier: "kr.spotitmap.app",
      supportsTablet: true,
      icon: "./assets/spotit/icon.png",
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
      ...(process.env.GOOGLE_SERVICES_INFO_PLIST
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST }
        : {}),
    },
    android: {
      package: "kr.spotitmap.app",
      adaptiveIcon: {
        foregroundImage: "./assets/spotit/icon.png",
        backgroundColor: "#F5F4EE",
      },
      softwareKeyboardLayoutMode: "resize",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    web: { output: "single", favicon: "./assets/spotit/icon.png" },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#F5F4EE",
          image: "./assets/spotit/icon.png",
          imageWidth: 104,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "주변 장소를 찾고 지도에 오늘의 기록을 남기기 위해 위치를 사용합니다.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "기록과 채팅에 사진을 첨부하기 위해 사진 접근이 필요합니다.",
          cameraPermission:
            "오늘의 장소를 사진으로 남기기 위해 카메라를 사용합니다.",
          microphonePermission: false,
        },
      ],
      "expo-secure-store",
      "expo-notifications",
      [
        "react-native-maps",
        {
          androidGoogleMapsApiKey:
            process.env.GOOGLE_MAPS_ANDROID_API_KEY || "",
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY || "",
        },
      ],
      ...(googleIosId
        ? [
            [
              "@react-native-google-signin/google-signin",
              { iosUrlScheme: googleIosId.split(".").reverse().join(".") },
            ] as [string, Record<string, string>],
          ]
        : []),
      ...(kakaoKey
        ? [
            ["@react-native-seoul/kakao-login", { kakaoAppKey: kakaoKey }] as [
              string,
              Record<string, string>,
            ],
          ]
        : []),
      [
        "expo-build-properties",
        {
          android: {
            extraMavenRepos: [
              "https://devrepo.kakao.com/nexus/content/groups/public/",
            ],
          },
        },
      ],
    ],
    experiments: { typedRoutes: false },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        ...(projectId ? { projectId } : {}),
      },
      nativeMaps: { androidConfigured: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY) },
    },
  };
};
