# 네이티브 푸시 서버 연결

이 디렉터리는 원본 웹앱의 Firebase 함수와 Firestore 규칙을 복사한 뒤, 네이티브 푸시에 필요한 부분만 추가한 **배포 준비 코드**입니다. 원본 폴더와 운영 서버를 수정하거나 배포하지 않았습니다.

## 추가 내용

- `functions/index.js`의 기존 `sendPushForNotification`은 `users/{uid}/fcmTokens`에 웹 FCM 알림을 보내는 동작을 유지합니다. 기존 관리자·신고 함수도 그대로 포함합니다.
- `sendNativePushForNotification`은 같은 알림 생성 이벤트를 독립적으로 처리합니다. `users/{uid}/expoPushTokens`를 읽고 Expo API에 네이티브 알림을 보냅니다. 두 전송 경로는 서로의 성공에 의존하지 않습니다.
- `nativePushQueue`는 기기 토큰·알림별로 중복 생성을 방지합니다. `processNativePushQueue`는 5분마다 실패한 요청을 다시 시도하고 발송 후 15분부터 Expo 수신증을 확인합니다. 한 요청에는 최대 100개의 메시지를 보내며 토큰이 삭제되거나 계정이 사라졌으면 재발송하지 않습니다.
- HTTP 429/5xx/네트워크 오류는 최대 6번의 발송 시도 안에서 지수 간격으로 재시도합니다. 수신증은 최대 24시간 확인합니다. `DeviceNotRegistered`인 경우 등록 당시와 같은 토큰인지를 확인하고 해당 토큰만 삭제합니다.
- 큐의 최종 상태 `provider_accepted`는 APNs/FCM의 접수를 의미합니다. 기기 표시나 사용자의 확인을 보장하지 않습니다. 실패는 `failed` 상태의 `errorCode`와 Cloud Logging에 남습니다. 종료된 작업에서 원문 메시지·토큰을 제거합니다.
- 새 Firestore 규칙은 Expo 토큰의 본인 읽기/삭제와 형식 검사를 거친 본인 생성/수정만 허용하고, 전송 큐는 클라이언트 접근을 허용하지 않습니다. 원본 데이터 접근 규칙은 보존합니다.

## 앱 설정

1. 앱의 `EXPO_PUBLIC_EAS_PROJECT_ID`에 실제 EAS 프로젝트 ID를 지정합니다.
2. 같은 앱 식별자에 Android FCM v1 및 iOS APNs 자격 증명을 등록합니다. 앱의 알림 채널 ID는 `default`를 사용합니다.
3. 네이티브 앱이 받은 Expo 토큰을 `users/{uid}/expoPushTokens/{tokenId}`에 `token` 문자열로 저장해야 합니다. 기존 `fcmTokens`에 Expo 토큰을 넣지 않습니다.
4. 개발/배포 빌드의 실제 기기에서 알림 권한을 허용합니다. 토큰 등록과 사용자 로그아웃/알림 해제 시 폐기를 함께 확인합니다.

Expo의 추가 푸시 보안 기능을 활성화한 프로젝트는 서버의 `EXPO_ACCESS_TOKEN` 환경변수를 설정해야 합니다. 이 값은 클라이언트 `EXPO_PUBLIC_` 환경변수에 넣지 않습니다. 현재 코드는 서버 프로세스 환경변수에서만 읽습니다.

## 로컬 확인

프로젝트 루트 `C:\spotit`에서:

```powershell
node --test backend/functions/nativePush.test.cjs
npm --prefix backend/functions ci
```

테스트는 외부 Firebase/Expo에 알림을 보내지 않습니다. 서비스와 Firestore의 응답을 대체하여 큐·실패 처리를 검사하며, 운영 전송 자격 증명의 유효성을 검사하지 않습니다.

실제 Auth/Firestore 에뮬레이터용 4개 서비스·규칙 통합 테스트도 `../tests/native-services.integration.test.mjs`에 포함하며 모두 통과했습니다. 사용자 Firebase 설정을 읽지 않는 공식 config/cache 분리 실행기 `node scripts/test-native-emulators.mjs`를 프로젝트 루트에서 실행합니다. [검증 기록과 실행 환경](../docs/verification.md#firebase-에뮬레이터-검증-시도)을 참고합니다.

## 운영에 적용할 때

원본 Firebase 프로젝트가 `naran-235a6`인지 앱 설정과 함께 확인합니다. 아래 명령은 **운영 변경**이며 이 작업에서는 실행하지 않았습니다. 새 함수 두 개와 규칙만 반영하므로 기존 웹 함수의 재배포나 삭제가 필요하지 않습니다.

```powershell
Set-Location C:\spotit\backend
firebase deploy --project naran-235a6 --only "functions:sendNativePushForNotification,functions:processNativePushQueue,firestore:rules"
```

Cloud Scheduler 및 결제 가능한 Firebase 프로젝트 구성이 필요합니다. 새 큐 조회는 `nextAttemptAt` 단일 필드 인덱스를 사용하며 별도 복합 인덱스를 요구하지 않습니다. 큐 기록을 정리하려면 Firestore TTL 정책을 `nativePushQueue.expiresAt`에 연결할 수 있습니다. 생성 24시간이 지난 원본 알림은 재처리하지 않습니다.

적용 후 두 계정의 실제 기기에서 채팅·팔로우·좋아요 알림을 확인하고, 웹 브라우저 알림이 계속 오는지도 확인합니다. 큐의 `receipt` 상태는 수신증 대기이며 아직 성공 판정이 아닙니다. `failed`의 `InvalidCredentials`, `MismatchSenderId`, `UNAUTHORIZED`는 자격 증명 설정을 확인해야 합니다. 네트워크 응답을 잃은 뒤 재시도하는 경우 중복 가능성이 있으므로 같은 알림 ID를 `collapseId`/`tag`로 사용합니다.

참고: [Expo Push API와 수신증](https://docs.expo.dev/push-notifications/sending-notifications/), [Firebase 예약 함수](https://firebase.google.com/docs/functions/schedule-functions), [Expo 네이티브 푸시 설정](https://docs.expo.dev/push-notifications/push-notifications-setup/).
