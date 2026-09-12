# 스팟잇 네이티브 인증 설정

로그인·회원가입·프로필은 React Native 화면이며 기존 Firebase Authentication 사용자와 Firestore 데이터를 사용한다. 이메일 인증은 Firebase JS SDK를 사용한다. Google과 Kakao는 설치된 앱에서 제공자 네이티브 SDK로 인증한 뒤 Firebase 자격 증명으로 교환한다. 웹 미리보기에서는 Firebase 팝업 인증을 사용한다.

## 필요한 공개 설정

실제 값은 로컬 `.env` 또는 EAS 환경 변수에 설정한다. 아래 항목은 클라이언트 식별자이며 비밀번호나 OAuth client secret이 아니다. OAuth client secret, 서비스 계정 키, 관리자 키는 앱에 넣지 않는다.

| 환경 변수 | 값 및 용도 |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | 기존 Firebase 웹 앱 API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | 기존 Firebase auth domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | 기존 Firebase project ID |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | 기존 Storage bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | 기존 messaging sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | 기존 Firebase 웹 앱 ID |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud의 **웹 애플리케이션 유형** OAuth client ID. Android client ID를 입력하면 안 됨 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS bundle identifier와 연결된 iOS OAuth client ID |
| `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY` | 동일한 Kakao Developers 앱의 네이티브 앱 키 |
| `EXPO_PUBLIC_FIREBASE_KAKAO_PROVIDER_ID` | Firebase OIDC provider ID. 기본값 `oidc.kakao` |

## Google

1. 기존 Firebase 프로젝트에서 Google 로그인을 활성화하고 동일 프로젝트의 OAuth 클라이언트를 사용한다.
2. Android OAuth 클라이언트에 실제 `android.package`와 개발/릴리스/Play 앱 서명 SHA 인증서를 등록한다.
3. iOS OAuth 클라이언트의 bundle identifier를 `ios.bundleIdentifier`와 맞춘다.
4. Expo config plugin `@react-native-google-signin/google-signin`의 `iosUrlScheme`은 iOS client ID를 뒤집은 `com.googleusercontent.apps.<client-id-prefix>` 형식이다. 구성 방식에 따라 Firebase의 플랫폼별 `google-services.json` 및 `GoogleService-Info.plist` 파일을 사용할 수도 있다.
5. 설정 변경 뒤 앱을 다시 빌드하고 실제 기기에서 로그인과 취소 동작을 검증한다.

네이티브 코드가 필요한 제공자 SDK는 Expo Go에서 실행되지 않는다. 이 앱은 Expo Go에서 SDK를 불러오기 전에 안내를 보여 주며 이메일 로그인은 계속 사용할 수 있다. [Google SDK Expo 설정](https://react-native-google-signin.github.io/docs/setting-up/expo), [Google SDK 인증 API](https://react-native-google-signin.github.io/docs/original).

## Kakao와 기존 웹 계정

Kakao Developers에서 Android 패키지/키 해시와 iOS bundle identifier를 등록하고 카카오 로그인과 OpenID Connect를 활성화한다. Expo plugin 설정은 다음과 같다.

```json
[
  ["@react-native-seoul/kakao-login", { "kakaoAppKey": "<native-app-key>" }],
  ["expo-build-properties", {
    "android": {
      "extraMavenRepos": ["https://devrepo.kakao.com/nexus/content/groups/public/"]
    }
  }]
]
```

SDK는 카카오톡 로그인을 시도하고 필요하면 시스템 브라우저의 카카오 계정 로그인으로 전환한다. 일회성 nonce의 SHA-256 값을 로그인 요청에 넣고 받은 OIDC `idToken`과 원래 nonce를 Firebase `OAuthProvider(...).credential({ idToken, rawNonce })`에 전달한다. [Kakao React Native SDK 설정](https://github.com/crossplatformkorea/react-native-kakao-login#expo-expo-go-snack-사용-불가-development-buildeas-local-build만-가능).

**출시 전 확인할 부분:** Firebase OIDC 설정의 client ID는 전달되는 ID 토큰의 `aud`와 일치해야 한다. 기존 웹의 REST API 키와 네이티브 앱 키가 다르면 웹용 `oidc.kakao` 설정만으로 네이티브 로그인이 성공한다고 보장할 수 없다. 운영 중인 웹 provider client ID를 네이티브 키로 덮어쓰면 웹 로그인이 영향을 받을 수 있다. 이 프로젝트에서는 운영 provider 설정을 변경하지 않았다. [Firebase OIDC의 client ID와 토큰 audience](https://firebase.google.com/docs/auth/web/openid-connect).

기존 웹 사용자 UID까지 보존해야 하고 provider가 두 audience를 수용하지 못하는 경우에는 서버에서 네이티브 Kakao 토큰의 서명·issuer·audience·만료를 검증한 다음 기존 `oidc.kakao` provider 사용자 ID와 연결된 Firebase UID에 custom token을 발급하는 별도 브리지가 필요하다. 다른 OIDC provider를 만들기만 하면 기존 계정과 자동 병합된다고 가정하면 안 된다. **그 브리지는 현재 구현·배포되지 않았다.** 원본 설정과 계정 연결을 검증한 뒤 별도 구현이 필요하다.

## 가입, 프로필, 로그아웃, 탈퇴 동작

- 가입은 원본의 만 14세 제한, 사용자 이름 중복 검사, 필수 약관/개인정보 동의, 선택 위치 동의를 유지한다. 사용자 이름 예약과 프로필 저장은 원본 Firestore transaction을 사용한다.
- 신규 소셜 사용자도 생년월일·동의·사용자 이름을 완료해야 한다. 업로드나 프로필 저장이 실패하면 생성된 계정으로 다시 시도한다.
- 사진은 기기에서 선택한 뒤 네이티브 편집 화면에서 드래그 이동, 확대, 양방향 회전, 좌우 반전, 초기화, 정사각형 자르기를 적용한다. 기존 프로필 사진도 다시 편집할 수 있다. JPEG로 압축해 Storage에 저장한다.
- 로그아웃은 이 기기의 푸시 토큰을 먼저 제거한다. 제거에 실패하면 로그아웃을 중단하고 재시도할 수 있도록 오류를 표시한다. Firebase 로그아웃 후 Google/Kakao 세션 정리는 가능한 경우 수행한다.
- 탈퇴 확인 화면에서 이메일 계정은 현재 비밀번호, Google/Kakao 계정은 해당 제공자 재인증을 요구한다. 다른 계정으로 인증하면 Firebase의 재인증 검증이 거절한다. 네이티브에서는 네이티브 SDK, 웹에서는 `reauthenticateWithPopup`을 사용한다.
- 탈퇴 서비스는 최근 인증 시간을 확인하고 기기 푸시 토큰을 제거한 뒤 기존 데이터 삭제 서비스와 Firebase `deleteUser`를 순서대로 호출한다. 기존 삭제 서비스는 여러 Firestore batch로 실행되어 전체 과정이 단일 transaction은 아니다. 네트워크나 권한 문제로 중단되면 일부 데이터가 이미 삭제되었을 수 있다. 운영 수준의 완전한 재시도 보장은 서버의 삭제 작업 큐로 옮기는 것이 필요하다.

## 검증 범위

네이티브 OAuth SDK의 타입과 앱의 TypeScript 연결을 확인했다. 실사용 계정 로그인, Google/Kakao 콘솔의 클라이언트 설정, 실기기 서명, 운영 데이터 삭제는 이 작업에서 실행하지 않았다. 테스트용 별도 계정으로 Android/iOS 로그인 → 기존 UID 확인 → 프로필 수정 → 로그아웃 및 푸시 해제 → 재로그인 → 탈퇴 순서를 확인해야 한다.

SDK 기준: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo ImagePicker 57](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/).
