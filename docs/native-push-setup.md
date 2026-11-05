# 네이티브 푸시 설정과 오류 점검

Android에서는 `expo-notifications`가 Firebase 설치 인증 및 FCM 기기 토큰을 얻은 다음 Expo 푸시 토큰을 발급받습니다. 앱의 알림 허용 설정과 실제 알림 전송 서버는 별도로 구성해야 합니다.

- `EXPO_PUBLIC_EAS_PROJECT_ID`: 앱이 연결된 EAS 프로젝트 UUID.
- `GOOGLE_SERVICES_JSON`: `kr.spotitmap.app` Android 앱의 `google-services.json` 파일 경로. `app.config.ts`에서 Android 빌드 설정으로 사용합니다.
- EAS FCM V1 자격 증명과 알림 전송 서버: [서버 설정](../backend/README.md) 참고.

## 2026-09-14 `FIS_AUTH_ERROR` 수정

EAS preview APK `914e09db-e415-45e7-b984-d2ea8d39082d`에서 Firebase 앱 ID·프로젝트 ID·발신자 ID·API 키를 추출해 현재 `google-services.json`과 일치하는지 확인했습니다. APK에서 사용한 Google Cloud 키 `API key 3`의 허용 API 목록에는 지도 API만 있었고, Firebase Installations API는 빠져 있었습니다. 프로젝트의 Firebase Installations API 자체는 활성화되어 있었습니다.

APK와 같은 앱 설정·패키지·서명으로 Firebase Installations 등록 요청을 실행해 HTTP 403 `API_KEY_SERVICE_BLOCKED`를 확인했습니다. 해당 키의 API 제한에 아래 두 항목을 추가했습니다. 기존 API 허용 목록과 Android 애플리케이션 제한은 유지했습니다.

```text
firebaseinstallations.googleapis.com
fcmregistrations.googleapis.com
```

수정 후 테스트용 Firebase 설치 등록과 설치 인증 토큰 발급이 모두 HTTP 200으로 성공했습니다. 검사에서 생성한 임시 설치는 HTTP 200 삭제 응답까지 확인해 정리했습니다. 사용자 기기의 설치·로그인·저장 데이터는 변경하지 않았습니다.

이번 수정은 서버의 API 허용 목록 변경이므로 기존 APK에서 앱을 완전히 종료한 뒤 푸시 알림을 다시 켜면 됩니다. APK 재빌드나 환경 변수 변경은 필요하지 않습니다. 기기에서의 Expo 푸시 토큰 발급과 실제 알림 수신은 아직 검증하지 않았습니다.

같은 오류가 다시 발생하면 APK에 포함된 API 키의 **API 제한**에 Firebase Installations API가 허용되어 있는지 확인합니다. FCM Registration API도 Cloud Messaging에 필요한 허용 항목입니다. [Firebase API 키 안내](https://firebase.google.com/docs/projects/api-keys), [Firebase Android SDK 제한 점검](https://github.com/firebase/firebase-android-sdk/blob/main/firebase-installations/API_KEY_RESTRICTIONS.md)
