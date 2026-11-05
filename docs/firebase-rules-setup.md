# 웹·앱 공용 Firebase 규칙 적용

첫 지도 진입 시 앱이 로그인 사용자만 확인하고 프로필 생성·조회 완료 전에 핀과 그룹 구독을 시작하던 경로를 수정했습니다. 이제 `AuthContext.accountReady`가 된 뒤 조회하며, 프로필 재시도에 성공하면 구독도 다시 연결합니다. 가입 미완료 계정은 가입 화면으로 이동합니다.

기존 웹 계정 중 `onboardingComplete`가 없는 프로필은 완료된 기존 계정으로 처리합니다. 새 가입 계정의 `onboardingComplete: false`와 필수 가입정보 검증은 유지합니다. 운영 콘솔에 현재 배포된 규칙은 읽거나 변경하지 않았으므로, 아래 파일을 적용해야 서버 규칙 변경도 반영됩니다.

## 기준 파일

| 대상 | 파일 | 적용 내용 |
| --- | --- | --- |
| Firestore | [backend/firestore.rules](../backend/firestore.rules) | 기존 계정 필드 호환, 가입·개인/팔로잉/그룹 핀·채팅·알림·Expo 토큰 권한 |
| Storage | [backend/storage.rules](../backend/storage.rules) | 웹과 앱에서 사용하는 프로필·핀·채팅 사진 경로 |
| 인덱스 | [backend/firestore.indexes.json](../backend/firestore.indexes.json) | 핀 조회·정렬 등 앱과 웹의 복합 조회 |
| 배포 설정 | [backend/firebase.json](../backend/firebase.json) | 위 파일을 연결하는 Firebase CLI 설정 |

같은 Firebase 프로젝트를 사용하는 웹과 앱에는 하나의 서버 규칙이 적용됩니다. 웹용과 앱용 규칙을 이어 붙이지 말고 이 공용 파일을 기준으로 관리하세요. 원본 웹 폴더에서 예전 규칙을 다시 배포하면 수정 사항이 덮어써집니다. 중복되는 `allow` 중 하나라도 허용하면 요청이 허용되므로, 전체 공개 규칙을 남겨두고 하단에 제한을 추가하는 방식은 피해야 합니다. [Firebase 규칙 평가 방식](https://firebase.google.com/docs/rules/rules-behavior)

## 직접 적용하기

Firebase 콘솔의 기존 Firestore·Storage 규칙을 별도로 저장해 둡니다. 아래 `YOUR_FIREBASE_PROJECT_ID`를 `.env.local`의 `EXPO_PUBLIC_FIREBASE_PROJECT_ID` 값으로 바꾸세요. **EAS 프로젝트 UUID가 아닙니다.**

```powershell
Set-Location C:\spotit
firebase login
firebase deploy --config backend/firebase.json --project naran-235a6 --only "firestore:rules,firestore:indexes,storage"
```

이 명령은 규칙과 인덱스를 반영하며 APK를 만들지 않습니다. 인덱스 생성이 진행 중이면 완료될 때까지 기다린 후 앱을 다시 엽니다. Storage 규칙에서 Firestore 문서를 참조하기 때문에 최초 배포 시 두 서비스 연결 권한을 활성화하는 안내가 나올 수 있습니다. [Firebase Storage의 Firestore 문서 참조](https://firebase.google.com/docs/storage/security/rules-conditions)

CLI 대신 콘솔을 쓰려면 Firestore Database → 규칙에는 `backend/firestore.rules` 전체를, Storage → 규칙에는 `backend/storage.rules` 전체를 각각 붙여 넣고 게시합니다. 두 서비스의 규칙 파일은 서로 다릅니다. 인덱스는 위 CLI 명령으로 적용할 수 있습니다.

## 사진 경로별 권한

| 경로 | 업로드 | 인증된 SDK 조회 |
| --- | --- | --- |
| `profiles/{uid}/{file}` | 본인, 이미지 5MB 이하. 가입 중에도 허용 | 로그인 사용자 |
| `posts/{uid}/{postId}/{file}` | 가입 완료한 본인, 이미지 20MB 이하 | 본인 또는 해당 공개·팔로잉·그룹 핀의 열람자 |
| `chats/{chatId}/{uid}/{file}` | 채팅 참여자인 본인, 이미지 20MB 이하 | 해당 채팅 참여자 |

JPEG·PNG·WebP·GIF를 허용합니다. 본인은 게시물 문서를 저장하기 전 임시 업로드 파일도 읽을 수 있어, 기존 웹·앱의 `업로드 → URL 조회 → 핀 저장` 순서와 호환됩니다. 전체 파일 목록 조회와 이 표 밖 경로는 허용하지 않습니다.

웹과 앱은 기존 방식대로 다운로드 토큰이 포함된 사진 URL을 저장합니다. 이미 발급된 URL이나 다운로드된 사진까지 그룹 탈퇴로 회수되지는 않습니다. 비공개 핀 문서와 **인증된 SDK 요청**은 탈퇴 후 차단되며, 기존 다운로드 URL 회수는 Storage 다운로드 토큰 교체 또는 파일 삭제가 별도로 필요합니다.

## 확인한 범위

로컬 `demo-spotit-native` Auth·Firestore·Storage 에뮬레이터에서 실제 앱 서비스로 검증합니다.

```powershell
npm run test:integration
```

- 가입 미완료 시 첫 지도 조회 차단, 가입 완료 후 조회 성공
- 완료 표시가 없던 기존 웹 계정, 여러 팔로잉 묶음과 페이지 커서 조회
- 비공개 그룹 초대·핀·반응과 탈퇴 후 접근 회수
- 실시간 채팅·읽음·고정, 이모지 반응 추가·변경·취소, 비참여자와 타인의 반응 변경 차단
- Expo 토큰의 소유권·형식과 전송 큐 접근 차단
- 가입 중 프로필 사진, 핀 저장 전 업로드, 파일 형식·크기, 비공개/그룹/채팅 사진 권한

첫 지도 오류가 계속되면 앱과 배포 대상의 Firebase 프로젝트 ID가 같은지 먼저 확인하세요. `permission-denied`는 권한 문제이고 `failed-precondition`과 인덱스 생성 링크는 인덱스 문제입니다. 카카오/Google 지도를 불러오지 못했다는 안내는 지도 SDK 키·플랫폼 등록·네트워크 문제로, Firestore 규칙과 별도로 확인해야 합니다.

## 메시지 이모지 반응

메시지를 길게 누르거나 메시지 메뉴를 열면 👍 ❤️ 😂 😮 😢 🙏 중 하나를 선택할 수 있습니다. 같은 이모지를 다시 누르면 취소되고, 다른 이모지를 선택하면 내 반응이 바뀝니다. 메시지 아래에 반응 수와 내가 선택한 반응이 실시간으로 표시됩니다.

반응은 기존 메시지의 `reactionsBy` 필드에 저장하므로 별도 데이터 이전이나 인덱스가 필요하지 않습니다. 운영 환경에서 사용하려면 갱신된 `backend/firestore.rules`를 적용해야 합니다. 각 참여자는 자신의 반응만 변경할 수 있으며, 회원 탈퇴 시 해당 회원의 반응도 제거됩니다.

## 앱 업데이트 안내

`appReleases/android`와 `appReleases/ios`는 로그인 전에도 개별 조회할 수 있는 공개 출시 정보입니다. 앱 사용자의 작성·수정·삭제와 목록 조회는 허용하지 않습니다. 갱신된 규칙을 적용한 후 실제 새 버전의 다운로드 주소를 관리자 권한으로 게시하면 안내가 표시됩니다. [최초 적용·새 버전 게시 방법](app-updates.md)을 참고하세요.
