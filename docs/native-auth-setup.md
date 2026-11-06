# 스팟잇 네이티브 인증 설정

로그인·회원가입·프로필은 React Native 화면이며 기존 Firebase Authentication 사용자와 Firestore 데이터를 사용한다. 이메일 인증은 Firebase JS SDK를 사용한다. Google은 네이티브 SDK 자격 증명을 Firebase에 전달한다. Kakao는 네이티브 SDK의 ID 토큰을 서버에서 검증한 뒤 기존 사용자 UID의 Firebase custom token으로 교환한다. 웹에서는 기존 Firebase 팝업 인증을 사용한다.

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
| `EXPO_PUBLIC_APPLE_SERVICE_ID` | Apple Developer에서 앱과 연결한 Services ID. Android 로그인에 사용하며 Firebase Apple 제공자에도 동일하게 등록 |
| `EXPO_PUBLIC_APPLE_REDIRECT_URI` | 선택 항목. 기본값은 `https://<EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN>/__/auth/handler`. Apple Services ID의 Return URLs에 정확히 등록 |

## Apple

### 콘솔 설정과 새 빌드

1. Apple Developer에서 앱 ID `kr.spotitmap.app`에 **Sign in with Apple**을 활성화한다. 웹·Android용 Services ID를 만들고 이 앱 ID와 연결한다. 동일한 Apple 계정을 플랫폼마다 같은 Firebase 계정으로 인식하려면 앱·Services ID의 연결을 유지해야 한다.
2. Services ID의 웹 인증 설정에 Firebase 인증 도메인과 `https://<인증 도메인>/__/auth/handler`를 등록한다. Android에 별도 Return URL을 사용하면 `EXPO_PUBLIC_APPLE_REDIRECT_URI`와 Apple 콘솔의 URL을 정확히 일치시킨다.
3. Firebase Console → Authentication → Sign-in method에서 **Apple**을 활성화하고 Services ID, Apple Team ID, Key ID, Sign in with Apple 비공개 키를 설정한다. 비공개 키와 client secret은 앱 코드나 `EXPO_PUBLIC_` 환경 변수에 넣지 않는다.
4. Android 빌드 환경에 `EXPO_PUBLIC_APPLE_SERVICE_ID`를 설정한다. iOS는 앱 bundle identifier로 인증하므로 이 환경 변수 없이 네이티브 인증이 가능하지만 Firebase의 Apple 제공자 설정은 필요하다. 웹 도메인은 Firebase Authentication의 Authorized domains에도 등록한다.
5. `app.config.ts`의 `ios.usesAppleSignIn`과 `expo-apple-authentication` 플러그인을 포함해 새 개발/배포 빌드를 생성한다. Android에도 새 네이티브 모듈이 포함되므로 기존 APK·IPA에 JS만 업데이트해서는 사용할 수 없다. Expo Go에서는 설치된 앱 이용 안내를 표시한다.
6. Apple의 이메일 가리기를 허용하는 경우, Firebase가 발송하는 메일의 발신 도메인·주소를 Apple Private Email Relay에 등록한다.

설정 근거: [Expo 57 AppleAuthentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/), [Firebase Apple 로그인](https://firebase.google.com/docs/auth/web/apple), [Android SDK 설정](https://github.com/invertase/react-native-apple-authentication/blob/main/docs/ANDROID_EXTRA.md).

### 앱 동작

- iOS는 Expo의 시스템 로그인 버튼과 인증 창을 사용한다. Android는 Invertase Apple 인증 창, 웹은 Firebase `apple.com` 팝업을 사용한다. 네이티브 전용 모듈은 Metro의 플랫폼 파일로 분리한다.
- 매 인증마다 nonce와 state를 새로 만든다. iOS 요청에는 SHA-256 nonce, Android SDK에는 자체 해시를 위한 원본 nonce를 전달한다. Firebase 자격 증명에는 원본 nonce를 전달하며 반환 state가 다르거나 ID 토큰이 없으면 로그인을 중단한다. JWT 서명·issuer·audience·nonce의 최종 검증은 Firebase가 수행한다.
- Apple이 처음 전달한 이름은 기존 Firebase 표시 이름이 비어 있을 때 저장한다. 다음 로그인에서 이름을 전달하지 않아도 기존 값을 지우지 않는다. 프로필 사진은 Apple에서 제공되지 않으며, 신규 사용자는 기존 가입 화면에서 닉네임·생년월일·약관 동의를 완료한다.
- 같은 이메일만으로 Google·Kakao 등 다른 계정에 자동 연결하지 않는다. Firebase에서 계정 충돌을 반환하면 기존 로그인 방법을 안내한다.
- 취소 시 로그인 화면으로 복귀한다. 진행 중에는 중복 요청과 다른 로그인 버튼을 막고, 실패하면 다시 시도할 수 있다. 웹 팝업은 사용자 클릭 중에 시작한다.
- 로그아웃은 기존 Firebase 세션 정리를 사용한다. 탈퇴 전에는 Apple 계정으로 `reauthenticateWithCredential` 또는 `reauthenticateWithPopup`을 호출하여 현재 UID를 유지한다.

### 2026-11-05 Apple 로그인 오류 원인

`accounts:createAuthUri`에 `apple.com`을 조회하면 `OPERATION_NOT_ALLOWED : The identity provider configuration is not found`가 반환된다. `google.com`, `oidc.kakao`는 정상이다. 즉 Firebase Authentication에 **Apple 제공자가 등록·활성화되어 있지 않아** 앱에서 Apple 인증을 마쳐도 `signInWithCredential`이 `auth/operation-not-allowed`로 실패하고 “이 로그인 방법은 아직 준비되지 않았습니다”가 표시된다. 앱 코드 수정이나 재빌드 없이 위 3번(Firebase Console → Authentication → 로그인 방법 → Apple 사용 설정)만 하면 해결된다. 탈퇴 시 Apple 토큰 철회까지 동작하려면 Team ID·Key ID·비공개 키도 입력한다.

### 탈퇴 시 Apple 연결 해제

Apple 계정 탈퇴는 항상 Apple 확인(Face ID 한 번)을 거쳐 받은 authorization code로 Firebase `v2/accounts:revokeToken`(tokenType `CODE`, 웹은 `revokeAccessToken`)을 호출한 뒤 계정을 삭제한다. 철회 실패는 탈퇴를 막지 않는다.

### 2026-10-14 검증

`npm run test:apple`은 실제 소스에 제공자 SDK를 대체하여 nonce·state·이름 보존·취소·설정 누락·잘못된 재인증 계정을 검사한다. 콘솔의 Apple 제공자 활성화나 실사용 Apple 계정 로그인은 이 테스트에 포함되지 않는다. 실제 기기에서 로그인 → 신규 가입 완료 또는 기존 UID 확인 → 로그아웃 → 재로그인 → 재인증을 검증해야 한다.

Apple 인증 테스트 20개, 기존 Kakao 인증 테스트 8개, 기본 테스트 38개와 타입·라이선스 검사를 통과했다. iOS config introspection에서 Apple entitlement `Default`와 버튼 다국어 설정을 확인했다. 웹·Android·iOS JS 번들을 생성했고, 브라우저에서 320·375·1440px 버튼 배치와 진행 중 중복 요청 차단, 취소, 오류 안내, 신규 사용자 가입 화면 이동을 테스트 데이터로 확인했다. APK·IPA 빌드와 실사용 계정 인증은 수행하지 않았다.

## Google

1. 기존 Firebase 프로젝트에서 Google 로그인을 활성화하고 동일 프로젝트의 OAuth 클라이언트를 사용한다.
2. Android OAuth 클라이언트에 실제 `android.package`와 개발/릴리스/Play 앱 서명 SHA 인증서를 등록한다.
3. iOS OAuth 클라이언트의 bundle identifier를 `ios.bundleIdentifier`와 맞춘다.
4. Expo config plugin `@react-native-google-signin/google-signin`의 `iosUrlScheme`은 iOS client ID를 뒤집은 `com.googleusercontent.apps.<client-id-prefix>` 형식이다. 구성 방식에 따라 Firebase의 플랫폼별 `google-services.json` 및 `GoogleService-Info.plist` 파일을 사용할 수도 있다.
5. 설정 변경 뒤 앱을 다시 빌드하고 실제 기기에서 로그인과 취소 동작을 검증한다.

네이티브 코드가 필요한 제공자 SDK는 Expo Go에서 실행되지 않는다. 이 앱은 Expo Go에서 SDK를 불러오기 전에 안내를 보여 주며 이메일 로그인은 계속 사용할 수 있다. [Google SDK Expo 설정](https://react-native-google-signin.github.io/docs/setting-up/expo), [Google SDK 인증 API](https://react-native-google-signin.github.io/docs/original).

### 2026-09-14 Android `DEVELOPER_ERROR` 수정

EAS preview 빌드 `914e09db-e415-45e7-b984-d2ea8d39082d`의 기존 APK를 다운로드해 서명을 검증했다. 패키지는 `kr.spotitmap.app`, 버전은 `1.0.1`이며 APK 안의 웹 OAuth client ID는 현재 Firebase 설정의 웹 클라이언트와 일치했다. Firebase Android 앱에 등록된 SHA 지문은 0개였고 Android OAuth 클라이언트도 설정 파일에 없었다.

해당 APK의 다음 SHA-1을 Firebase Android 앱에 등록했다.

```text
B8:0C:74:55:C4:87:13:B8:12:97:EF:99:9F:7C:CE:B2:6A:9F:09:C0
```

등록 후 Firebase에서 새 설정을 조회해 패키지·SHA-1과 일치하는 Android OAuth 클라이언트가 생성됐고 기존 웹 클라이언트 ID는 유지됨을 확인했다. 로컬 `google-services.json`도 새 설정으로 갱신했다. API key와 `.env.local`은 변경하지 않았다. Google 로그인에서 SHA-1이 필요한 이유와 `DEVELOPER_ERROR` 설정 점검은 [Google 서명 인증서 안내](https://developers.google.com/android/guides/client-auth), [로그인 SDK 문제 해결](https://react-native-google-signin.github.io/docs/troubleshooting)을 참고한다.

이번 변경은 기존 APK 서명에 대한 서버 등록이므로 해당 APK로 로그인을 다시 시도할 수 있다. 새로운 APK는 생성하지 않았다. Play Store 배포본이나 다른 서명으로 만든 APK는 실제 배포본의 SHA-1을 별도로 확인해 등록해야 한다. 사용자 기기에서의 최종 로그인 성공 여부는 아직 확인하지 않았다.

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

SDK는 카카오톡 로그인을 시도하고 필요하면 시스템 브라우저의 카카오 계정 로그인으로 전환한다. 일회성 nonce의 SHA-256 값을 로그인 요청에 넣고 받은 OIDC `idToken`과 원래 nonce를 `signInWithNativeKakao` callable 함수에 전달한다. 서버는 카카오 공개키로 서명을 확인하고 issuer, 네이티브 앱 키인 audience, 만료, 발급 후 5분 이내인지, nonce를 검증한다. 이전 Android SDK가 카카오톡 경로에서 nonce를 누락한 경우에만 새로운 nonce로 카카오 계정 로그인을 한 번 재시도한다. [Kakao React Native SDK 설정](https://github.com/crossplatformkorea/react-native-kakao-login#expo-expo-go-snack-사용-불가-development-buildeas-local-build만-가능), [Kakao 토큰 검증](https://developers.kakao.com/docs/ko/kakaologin/utilize#oidc).

**출시 전 확인할 부분:** Firebase OIDC 설정의 client ID는 전달되는 ID 토큰의 `aud`와 일치해야 한다. 기존 웹의 REST API 키와 네이티브 앱 키가 다르면 웹용 `oidc.kakao` 설정만으로 네이티브 로그인이 성공한다고 보장할 수 없다. 운영 중인 웹 provider client ID를 네이티브 키로 덮어쓰면 웹 로그인이 영향을 받을 수 있다. 이 프로젝트에서는 운영 provider 설정을 변경하지 않았다. [Firebase OIDC의 client ID와 토큰 audience](https://firebase.google.com/docs/auth/web/openid-connect).

`backend/functions/kakaoAuth.js`와 `kakaoAuthCore.js`가 네이티브 토큰 교환을 구현한다. 검증된 Kakao `sub`를 `getUserByProviderUid('oidc.kakao', sub)`로 조회해 기존 웹 UID를 재사용한다. 신규 사용자는 예약된 `kakao-native:` UID 영역에 생성하고 동일한 웹 provider에 연결한 뒤 custom token을 발급하므로 이후 웹 로그인에서도 같은 계정을 찾을 수 있다. 이메일 일치만으로 다른 계정에 연결하지 않으며, 검증되지 않은 이메일을 Firebase의 인증된 이메일로 저장하지 않는다. 계정 생성 후 연결이 실패하면 같은 UID로 재시도한다. 웹의 동시 첫 로그인에 먼저 연결된 계정이 있으면 그 계정을 사용하며, 이 경우 연결되지 않은 빈 Auth 레코드가 남을 수 있지만 해당 레코드의 로그인 토큰은 발급하지 않는다. 사용 중지 계정과 MFA 등록 계정에는 custom token을 발급하지 않는다. 서버 배포 및 적용 상태는 [2026-09-15 수정 기록](./kakao-login-fix.md)을 참고한다.

## 가입, 프로필, 로그아웃, 탈퇴 동작

- 가입은 원본의 만 14세 제한, 사용자 이름 중복 검사, 필수 약관/개인정보 동의, 선택 위치 동의를 유지한다. 사용자 이름 예약과 프로필 저장은 원본 Firestore transaction을 사용한다.
- 신규 소셜 사용자도 생년월일·동의·사용자 이름을 완료해야 한다. 업로드나 프로필 저장이 실패하면 생성된 계정으로 다시 시도한다.
- 사진은 기기에서 선택한 뒤 네이티브 편집 화면에서 드래그 이동, 확대, 양방향 회전, 좌우 반전, 초기화, 정사각형 자르기를 적용한다. 기존 프로필 사진도 다시 편집할 수 있다. JPEG로 압축해 Storage에 저장한다.
- 로그아웃은 이 기기의 푸시 토큰을 먼저 제거한다. 제거에 실패하면 로그아웃을 중단하고 재시도할 수 있도록 오류를 표시한다. Firebase 로그아웃 후 Google/Kakao 세션 정리는 가능한 경우 수행한다.
- 탈퇴는 설정 → 계정 관리 → 회원 탈퇴 한 줄에서 시작한다. 로그인한 지 4분 이내면 재인증 없이 한 번에 탈퇴한다. 그보다 오래됐으면 이메일 계정은 현재 비밀번호(대화상자에서 재설정 메일 발송 가능), Google/Kakao 계정은 해당 제공자 재인증을 요구한다. Apple 계정은 토큰 철회를 위해 항상 Apple 확인을 거친다. 가입을 끝내지 않은 소셜 로그인 사용자는 가입 화면에서 ‘다른 계정으로 로그인’ 또는 ‘가입 취소’(임시 프로필과 Auth 계정 삭제)를 할 수 있다.
- 재인증이 필요한 경우 이메일 계정은 현재 비밀번호, Google/Kakao 계정은 해당 제공자 재인증을 요구한다. 네이티브 Kakao는 서버가 요청의 Firebase UID와 검증된 카카오 계정의 연결 UID가 일치할 때만 새 custom token을 발급하고 앱도 현재 UID가 유지되는지 확인한다. 이 재인증은 신규 계정을 생성하지 않는다. 웹에서는 `reauthenticateWithPopup`을 사용한다.
- 탈퇴 서비스는 최근 인증 시간을 확인하고 기기 푸시 토큰을 제거한 뒤 기존 데이터 삭제 서비스와 Firebase `deleteUser`를 순서대로 호출한다. 기존 삭제 서비스는 여러 Firestore batch로 실행되어 전체 과정이 단일 transaction은 아니다. 네트워크나 권한 문제로 중단되면 일부 데이터가 이미 삭제되었을 수 있다. 운영 수준의 완전한 재시도 보장은 서버의 삭제 작업 큐로 옮기는 것이 필요하다.

## 검증 범위

네이티브 OAuth SDK의 타입과 앱의 TypeScript 연결을 확인했다. 2026-09-14에는 위 EAS APK의 서명과 Google 웹 클라이언트 ID를 확인하고 Firebase Android SHA-1 등록 및 Android OAuth 클라이언트 생성을 검증했다. 실사용 계정 로그인, Kakao 콘솔 설정 변경, 운영 데이터 삭제는 실행하지 않았다. 테스트용 별도 계정으로 Android/iOS 로그인 → 기존 UID 확인 → 프로필 수정 → 로그아웃 및 푸시 해제 → 재로그인 → 탈퇴 순서를 확인해야 한다.

SDK 기준: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo ImagePicker 57](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/).
