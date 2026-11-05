# 웹·앱 공용 Firebase 백엔드

Android 카카오 로그인 수정과 새 `signInWithNativeKakao` 함수의 배포 절차는 [카카오 로그인 수정 기록](../docs/kakao-login-fix.md)을 참고하세요.

원본 웹앱의 Firebase 함수와 규칙에 네이티브 푸시, 지도 장소 검색, 기존 계정 호환 및 공용 Storage 규칙을 추가한 배포 준비 코드입니다. `signInWithNativeKakao`와 `searchMapPlaces`는 `naran-235a6`에 배포했습니다. 첫 지도 권한 오류는 [공용 규칙 적용](../docs/firebase-rules-setup.md), Google 장소 검색은 [지도 서버 설정](../docs/native-map-setup.md)을 먼저 참고하세요.

## 추가 내용

- `functions/index.js`의 기존 `sendPushForNotification`은 `users/{uid}/fcmTokens`에 웹 FCM 알림을 보내는 동작을 유지합니다. 기존 관리자·신고 함수도 그대로 포함합니다.
- `sendNativePushForNotification`은 같은 알림 생성 이벤트를 독립적으로 처리합니다. `users/{uid}/expoPushTokens`를 읽고 Expo API에 네이티브 알림을 보냅니다. 두 전송 경로는 서로의 성공에 의존하지 않습니다.
- `nativePushQueue`는 기기 토큰·알림별로 중복 생성을 방지합니다. `processNativePushQueue`는 5분마다 실패한 요청을 다시 시도하고 발송 후 15분부터 Expo 수신증을 확인합니다. 한 요청에는 최대 100개의 메시지를 보내며 토큰이 삭제되거나 계정이 사라졌으면 재발송하지 않습니다.
- HTTP 429/5xx/네트워크 오류는 최대 6번의 발송 시도 안에서 지수 간격으로 재시도합니다. 수신증은 최대 24시간 확인합니다. `DeviceNotRegistered`인 경우 등록 당시와 같은 토큰인지를 확인하고 해당 토큰만 삭제합니다.
- 큐의 최종 상태 `provider_accepted`는 APNs/FCM의 접수를 의미합니다. 기기 표시나 사용자의 확인을 보장하지 않습니다. 실패는 `failed` 상태의 `errorCode`와 Cloud Logging에 남습니다. 종료된 작업에서 원문 메시지·토큰을 제거합니다.
- 새 Firestore 규칙은 Expo 토큰의 본인 읽기/삭제와 형식 검사를 거친 본인 생성/수정만 허용하고, 전송 큐는 클라이언트 접근을 허용하지 않습니다. 원본 데이터 접근 규칙은 보존합니다.

## 집계·정리·검색 함수

- `countPostLikes`, `countPostComments`, `countCommentReplies`: 좋아요·댓글·답글이 바뀔 때마다 핀의 `likeCount`·`commentCount`와 댓글의 `replyCount`를 실제 문서 수로 **다시 셉니다**. 더하기·빼기가 아니므로 이벤트 중복 전달이나 구버전 앱의 쓰기, 기존 오차가 있어도 다음 변경 때 정확한 값으로 돌아옵니다. 규칙은 클라이언트의 카운터 쓰기를 거부합니다.
- 댓글 삭제는 앱·웹 모두 `deleted: true` 표시만 합니다. 답글이 하나도 남지 않은 삭제 댓글은 `countPostComments`/`countCommentReplies`가 지웁니다. 삭제된 댓글에는 규칙상 새 답글을 달 수 없습니다.
- `cleanupDeletedPost`: 핀이 삭제되면 그 아래 댓글·답글·좋아요 문서와 `posts/{uid}/{postId}/` 사진을 지웁니다. `cleanupRemovedPostPhotos`: 수정 중 뺀 사진과 썸네일을 지웁니다. 사진 URL은 클라이언트가 쓰므로 해당 핀 폴더 안의 파일만 지웁니다.
- `syncUserProfile`: 프로필의 `email`을 지우고(이메일은 Firebase Auth에만 둡니다) 닉네임·사용자 이름의 1·2글자 조각으로 검색 색인 `searchTokens`를 만듭니다. 이 필드는 클라이언트가 쓸 수 없습니다. 프로필 문서가 삭제되면 `profiles/{uid}/`, `posts/{uid}/`, 참여 채팅의 `chats/{chatId}/{uid}/` 파일을 지웁니다.
- `adminSearchUsers`의 이메일 검색과 결과의 이메일은 Firebase Auth에서 읽습니다.
- `syncPostSearchTokens`: 핀의 제목·장소 이름·주소·작성자 닉네임·메모를 단어로 나누고 단어마다 1·2글자 조각을 만들어 피드 검색 색인 `searchTokens`를 만듭니다. 메모는 앞 1,000자까지만 색인합니다. 클라이언트는 이 필드를 쓸 수 없고, 핀 전체를 덮어써서 필드가 빠지면 함수가 다시 만듭니다. 앱은 피드와 같은 범위(내 핀 + 팔로우한 사람의 팔로워·전체 공개 핀)를 검색어의 가장 긴 단어 첫 조각으로 조회한 뒤 모든 단어가 들어 있는 핀만 남깁니다. 이 조회에 필요한 복합 색인은 `firestore.indexes.json`에 있고, 쓰이지 않는 `searchTokens` 단일 필드 색인은 저장 비용을 줄이려고 꺼 둡니다.

### 피드 검색 적용 순서 (운영 변경, 이 작업에서는 실행하지 않음)

1. 색인 배포: `firebase deploy --project naran-235a6 --only firestore:indexes`. 색인이 다 만들어질 때까지 몇 분 걸리며, 그 전의 앱 검색은 불러온 기록에서만 찾는다고 안내합니다.
2. 함수 배포: `firebase deploy --project naran-235a6 --only functions:syncPostSearchTokens`
3. 기존 핀 색인 만들기(기본은 미리보기): `node scripts/backfill-post-search.cjs --project naran-235a6`, 결과 확인 뒤 `--apply`. Application Default Credentials가 필요합니다.
4. 규칙 배포: `firebase deploy --project naran-235a6 --only firestore:rules`. 앱과 원본 웹앱은 `searchTokens`를 쓰지 않으므로 순서는 상관없습니다.

### 적용 순서 (운영 변경, 이 작업에서는 실행하지 않음)

1. 함수 배포: `firebase deploy --project naran-235a6 --only "functions:countPostLikes,functions:countPostComments,functions:countCommentReplies,functions:cleanupDeletedPost,functions:cleanupRemovedPostPhotos,functions:syncUserProfile,functions:adminSearchUsers"`
2. 원본 웹앱과 앱 새 버전 배포. 새 클라이언트는 카운터를 쓰지 않으며 이전 규칙에서도 동작합니다.
3. 규칙 배포: `firebase deploy --project naran-235a6 --only firestore:rules`. 이후 구버전 앱의 좋아요·댓글·답글·댓글 삭제는 거부되므로 앱 업데이트 안내를 먼저 공지합니다. 원본 웹앱 폴더의 `firestore.rules`는 이전 사본이므로 그 폴더에서 규칙을 배포하지 않습니다.
4. 기존 프로필 정리(기본은 미리보기): `node scripts/backfill-user-profiles.cjs --project naran-235a6`, 결과 확인 뒤 `--apply`. Application Default Credentials가 필요합니다.

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

실제 Auth·Firestore·Storage 에뮬레이터용 6개 서비스·규칙 통합 테스트를 `../tests/native-services.integration.test.mjs`에 포함합니다. 사용자 Firebase 설정을 읽지 않는 config/cache 분리 실행기 `npm run test:integration`을 프로젝트 루트에서 실행합니다. [검증 기록](../docs/verification.md)을 참고하세요.

## 운영에 적용할 때

원본 Firebase 프로젝트가 `naran-235a6`인지 앱 설정과 함께 확인합니다. 아래 명령은 **운영 변경**이며 이 작업에서는 실행하지 않았습니다. 새 함수 두 개와 규칙만 반영하므로 기존 웹 함수의 재배포나 삭제가 필요하지 않습니다.

```powershell
Set-Location C:\spotit\backend
firebase deploy --project naran-235a6 --only "functions:sendNativePushForNotification,functions:processNativePushQueue,firestore:rules"
```

Cloud Scheduler 및 결제 가능한 Firebase 프로젝트 구성이 필요합니다. 새 큐 조회는 `nextAttemptAt` 단일 필드 인덱스를 사용하며 별도 복합 인덱스를 요구하지 않습니다. 큐 기록을 정리하려면 Firestore TTL 정책을 `nativePushQueue.expiresAt`에 연결할 수 있습니다. 생성 24시간이 지난 원본 알림은 재처리하지 않습니다.

적용 후 두 계정의 실제 기기에서 채팅·팔로우·좋아요 알림을 확인하고, 웹 브라우저 알림이 계속 오는지도 확인합니다. 큐의 `receipt` 상태는 수신증 대기이며 아직 성공 판정이 아닙니다. `failed`의 `InvalidCredentials`, `MismatchSenderId`, `UNAUTHORIZED`는 자격 증명 설정을 확인해야 합니다. 네트워크 응답을 잃은 뒤 재시도하는 경우 중복 가능성이 있으므로 같은 알림 ID를 `collapseId`/`tag`로 사용합니다.

참고: [Expo Push API와 수신증](https://docs.expo.dev/push-notifications/sending-notifications/), [Firebase 예약 함수](https://firebase.google.com/docs/functions/schedule-functions), [Expo 네이티브 푸시 설정](https://docs.expo.dev/push-notifications/push-notifications-setup/).
