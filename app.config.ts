import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    config.extra?.eas?.projectId;
  return {
    ...config,
    name: "피노리",
    slug: "spotit",
    version: "1.0.8",
    orientation: "portrait",
    scheme: "spotit",
    userInterfaceStyle: "light",
    icon: "./assets/spotit/app-icon-1024.png",
    ios: {
      bundleIdentifier: "kr.spotitmap.app",
      supportsTablet: true,
      usesAppleSignIn: true,
      icon: "./assets/spotit/app-icon-1024.png",
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
      ...(process.env.GOOGLE_SERVICES_INFO_PLIST
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST }
        : {}),
    },
    android: {
      package: "kr.spotitmap.app",
      adaptiveIcon: {
        foregroundImage: "./assets/spotit/adaptive-icon-foreground.png",
        monochromeImage: "./assets/spotit/adaptive-icon-foreground.png",
        backgroundColor: "#FFFFFF",
      },
      softwareKeyboardLayoutMode: "resize",
      // Without it Android removes the GPS location from photos the app picks.
      permissions: [
        ...(config.android?.permissions || []),
        "android.permission.ACCESS_MEDIA_LOCATION",
      ],
      // expo-media-library is iOS-only here (excluded from Android autolinking in
      // package.json); keep its Play-restricted media permissions out of Android.
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      ],
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    web: { output: "single", favicon: "./assets/spotit/favicon.png" },
    plugins: [
      "expo-router",
      "expo-apple-authentication",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#F5F4EE",
          image: "./assets/spotit/splash-mark.png",
          imageWidth: 128,
          resizeMode: "contain",
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
      [
        "expo-media-library",
        {
          // Read-only: recovers the location of a picked photo on iOS.
          photosPermission:
            "사진에 저장된 촬영 위치로 핀을 찍기 위해 사진 보관함에 접근합니다.",
          savePhotosPermission: false,
          isAccessMediaLocationEnabled: false,
          granularPermissions: [],
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
            // R8 shrinks and optimizes the release DEX; unused resources are dropped too.
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Kakao SDK keep rules, as given in its Android getting-started guide.
            extraProguardRules: [
              "-keep class com.kakao.sdk.**.model.* { <fields>; }",
              "-dontwarn org.bouncycastle.jsse.**",
              "-dontwarn org.conscrypt.*",
              "-dontwarn org.openjsse.**",
              "-if interface * { @retrofit2.http.* <methods>; }",
              "-keep,allowobfuscation interface <1>",
              "-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation",
              "-if interface * { @retrofit2.http.* public *** *(...); }",
              "-keep,allowoptimization,allowshrinking,allowobfuscation class <3>",
              "-keep,allowobfuscation,allowshrinking class retrofit2.Response",
            ].join("\n"),
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
      nativeMaps: {
        androidConfigured: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY),
        iosConfigured: Boolean(process.env.GOOGLE_MAPS_IOS_API_KEY),
      },
    },
  };
};
