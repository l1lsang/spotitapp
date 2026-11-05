# Android 카카오 로그인 수정 — 2026-09-15

## 확인한 원인

실제 Firebase `accounts:createAuthUri` 응답에서 `oidc.kakao`가 카카오의 `code` 방식이고 Client ID가 로컬 `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`와 다름을 확인했다. 기존 구현은 네이티브 audience의 토큰을 이 웹 provider에 바로 전달해 거부될 수 있었다. `auth/invalid-credential`을 로그인 방식과 무관하게 이메일·비밀번호 오류로 표시하는 문제도 있었다. 기기 로그나 실제 카카오 계정 로그인은 확보하지 않았으므로 개별 로그인 시도의 서버 오류 상세까지 확인한 것은 아니다.

Firebase Client ID는 토큰의 audience와 일치해야 한다. [Firebase OIDC 문서](https://firebase.google.com/docs/auth/web/openid-connect)

## 수정 내용

- 웹은 기존 `oidc.kakao` 팝업 로그인을 유지한다.
- Android/iOS는 `signInWithNativeKakao` 함수가 카카오 ID 토큰을 검증하고 동일한 `oidc.kakao` 계정 UID로 custom token을 발급한다.
- 신규 앱 가입자도 동일한 웹 provider에 연결한다. 이메일 주소 일치만으로 다른 계정을 병합하지 않는다.
- 탈퇴 재인증은 현재 UID와 카카오 계정의 UID가 같을 때만 허용한다.
- 카카오·구글 자격 증명 오류에 이메일·비밀번호 안내를 표시하지 않는다.

토큰 검증·계정 생성·동시 가입 시 동작은 [인증 설정](./native-auth-setup.md)에 설명되어 있다.

## 운영 적용 순서

1. `backend/functions/.env`의 `KAKAO_NATIVE_APP_KEY`를 앱의 네이티브 키와 같게, `KAKAO_FIREBASE_PROVIDER_ID`를 기존 웹 provider ID와 같게 설정한다. 이번 작업에서 로컬 앱 설정으로 준비했다. 예시는 같은 디렉터리의 `.env.example`에 있다. 이 값은 공개 식별자이며 카카오 client secret이나 서비스 계정 개인 키를 넣지 않는다.
2. 함수 실행 서비스 계정에 Firebase Authentication 사용자 조회·생성·연결 권한이 필요하다. 자신의 토큰 서명을 위한 `iam.serviceAccounts.signBlob` 권한과 IAM API 활성화도 필요하다. 서명 권한은 대상 서비스 계정 범위로 제한한다. [Firebase custom token 설정](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
3. 권한 있는 Firebase CLI 계정으로 프로젝트 루트에서 새 함수 하나만 배포한다.

   ```powershell
   firebase deploy --project naran-235a6 --config backend/firebase.json --only functions:signInWithNativeKakao
   ```

4. 서버 배포 후 수정된 앱으로 APK를 빌드하고 설치한다. 기존 APK에는 이전 JavaScript 로그인 경로가 있으므로 서버 배포만으로 수정이 적용되지 않는다.
5. 기존 웹 카카오 계정 → Android 로그인 → UID·기록 확인 → 로그아웃 → 웹 재로그인을 확인한다. Android 신규 가입 → 웹 로그인과 현재 계정으로 탈퇴 재인증도 확인한다.

2026-09-15 권한 있는 CLI 로그인으로 `signInWithNativeKakao` 업데이트와 `searchMapPlaces` 신규 배포를 완료했다. 두 함수 모두 `us-central1`에서 `ACTIVE`이며, 서버의 네이티브 키와 provider ID가 앱 설정과 일치한다. 초기 함수 분석의 10초 제한은 배포 명령에 `$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'`을 적용해 통과했다.

실행 계정 `860496376679-compute@developer.gserviceaccount.com`의 Firebase Auth 사용자 관리 권한과 IAM/IAM Credentials API 활성화를 확인했다. 부족했던 토큰 서명 권한은 해당 서비스 계정 리소스에 자기 자신을 대상으로 `roles/iam.serviceAccountTokenCreator`를 추가하고 다시 조회해 확인했다. 기존 웹 OIDC 설정은 변경하지 않았다. APK 재빌드·설치와 실제 카카오 계정 로그인은 아직 확인하지 않았다.

## 검증

```powershell
npm run typecheck
npm --prefix backend/functions test
npm run test:kakao:client
npm run test:kakao:integration
```

- 단위 테스트: 실제 RSA 서명으로 위조·issuer·audience·만료·nonce 검증, 기존 UID, 동시 가입, 연결 재시도, 재인증 계정 불일치, 사용 중지·MFA 차단.
- 클라이언트 테스트: 웹 팝업 유지, Android 토큰 교환, nonce 재시도, 서버 오류 처리, 재인증 계정 전환 방지, 오류 문구.
- Auth 에뮬레이터: 웹→앱과 앱→웹에서 실제 Firebase Admin 계정 연결 및 custom token 로그인 결과의 UID 확인.

배포 후 운영 서버에서 잘못된 카카오 인증 요청에 `INVALID_ARGUMENT` 응답을 확인했다. 장소 검색은 Google 검색 결과 6개와 Kakao 검색 결과 1개를 각각 HTTP 200으로 확인했다. 실제 카카오 토큰 발급·Firebase 로그인과 APK 실행은 별도 확인이 필요하다.
