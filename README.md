# 피노리(PINORI) 네이티브 앱

원본 웹앱 `C:\Users\jkm08\OneDrive\바탕 화면\창업\spotit`의 22개 화면 경로를 Expo SDK 57 / React Native로 옮긴 Android·iOS 프로젝트입니다. 모든 화면은 네이티브 UI로 구현했으며 원본 페이지를 WebView로 불러오지 않습니다. 같은 Firebase 프로젝트의 계정·기록·팔로우·그룹·채팅을 사용합니다.

## 실행

Node.js 22.13 이상이 필요합니다. 현재 작업 폴더에는 의존성과 원본의 공개 Firebase 클라이언트 설정을 준비했습니다. 설정 값은 Git에 포함되지 않는 `.env.local`에 있습니다.

```powershell
Set-Location C:\spotit
npm install
npm run go
```

Expo Go에서 이메일 로그인과 주요 화면을 확인할 수 있습니다. Google 지도·Google/Kakao 로그인·원격 푸시는 네이티브 모듈이 포함된 개발 또는 배포 빌드가 필요합니다.

```powershell
# 설치된 개발 빌드에 연결
npm run dev-client
# 브라우저에서 화면 미리보기
npm run web
# Android APK / iOS 배포용 빌드 (EAS 프로젝트·자격 증명 설정 후)
npx eas build --platform android --profile preview
npx eas build --platform ios --profile production
```

웹 미리보기에도 Google Maps JavaScript 지도 어댑터를 연결했습니다. 브라우저용 키가 필요하며 네이티브 지도 실행 검증을 대신하지 않습니다. iOS 로컬 빌드는 macOS와 Xcode가 필요합니다. 이번 수정 작업에서는 APK·IPA 빌드와 prebuild를 실행하지 않았습니다.

## 구현 범위

- 지도·핀 클러스터·현재 위치·전체 화면 장소 검색·그룹 범위 시트·핀 색 안내·실시간 장소 상태
- 사진으로 기록: 사진의 촬영 위치·날짜 읽기, 주변 장소 추천, 위치 확인·조정·직접 지정
- 3열 피드 그리드와 세로 상세 피드·거리/키워드 검색·페이지 추가 로딩·공개 범위별 내 기록
- 핀 작성/수정·사진 선택/촬영·자르기/회전/반전/확대·썸네일 업로드
- 댓글·답글·멘션·좋아요·공유·신고
- 사람 검색·팔로우/요청·비공개 프로필·핀/좋아요 탭 프로필·핀 테마(팔로잉 핀 고정 색 보호)·프로필 설정
- 개인/단체 채팅(+ 버튼의 단체방·팔로잉 1:1 시작)·사진·읽음·초대·고정·미디어 모음
- 가입·필수 동의·로그인 유지·계정 재인증/탈퇴
- 알림·문의·관리자·5종 정책·라이선스

경로와 파일은 [화면 대응표](docs/native-page-inventory.md)에 정리했습니다. 사진·색상·한글 문구는 원본 자료를 사용하며 네이티브 레이아웃과 운영체제 UI에 맞춰 조정했습니다.

## 실제 서비스 연결에 남은 설정

`.env.example`에는 필요한 항목이 나열되어 있습니다. 키·클라이언트 ID가 없는 기능은 현재 활성화 완료 상태가 아닙니다.

| 항목 | 필요한 설정 |
| --- | --- |
| Google 지도 | `GOOGLE_MAPS_ANDROID_API_KEY` / `GOOGLE_MAPS_IOS_API_KEY`, 플랫폼별 Maps SDK 활성화·앱 제한 |
| 사업장 검색 | Firebase `searchMapPlaces`·`searchNearbyMapPlaces` 함수와 Google Places 서버 시크릿 등록 |
| Google 로그인 | Web/iOS OAuth client ID, Android SHA-1/SHA-256, iOS URL scheme |
| Kakao 로그인 | Native app key·플랫폼 키 해시·OIDC, Firebase provider의 토큰 audience 호환성 확인 |
| Apple 로그인 | iOS Sign in with Apple capability, Firebase Apple 제공자, Android Services ID·HTTPS Return URL. [설정 안내](docs/native-auth-setup.md#apple) |
| 푸시 | EAS project ID, APNs/FCM 자격 증명, [앱 푸시 설정·오류 점검](docs/native-push-setup.md), [네이티브 푸시 서버](backend/README.md) 배포 |
| HTTPS 링크로 앱 열기 | 도메인에 Apple Universal Links / Android App Links 연결 파일과 앱 설정 추가 |

인증 등록 방법은 [네이티브 인증 설정](docs/native-auth-setup.md)을 참고하세요. 원본 JavaScript 지도 키는 네이티브 SDK 키 등록을 대신하지 않습니다.

국내·해외 모두 Google 지도를 사용합니다. 핀 미리보기·상세 화면에서 현재 위치를 출발점으로 대중교통·도보·자동차 길찾기를 Google 지도 앱·웹에 연결합니다. 장소 검색은 Google Places의 `google:` ID를 사용합니다. [지도·장소 검색 설정](docs/native-map-setup.md)에 네이티브 키와 서버 시크릿 설정을 정리했습니다.

첫 지도는 로그인 프로필 준비 후 핀·그룹을 조회하도록 수정했습니다. 완료 표시가 없던 기존 웹 계정 호환과 공용 사진 경로를 포함한 [Firestore·Storage 규칙 적용 방법](docs/firebase-rules-setup.md)을 따라 서버 규칙도 반영하세요.

`backend/`는 원본 서버를 보존하면서 네이티브 푸시 큐·재시도·수신증 처리를 추가한 배포 준비 코드입니다. 운영 서버는 이 작업에서 배포하지 않았습니다.

## 검사

```powershell
npm run typecheck
npm test
npm run test:push
npm run test:places
npm run test:integration
npm run licenses:check
npm run build
```

원본의 가입 연령·동의, 좌표·핀 클러스터, 읽음 처리 테스트와 앱·서버 통합 검사를 포함합니다. 통합 테스트는 로컬 Firebase CLI/JDK와 기존 Auth·Firestore·Storage 에뮬레이터 캐시가 필요하며 프로젝트 전용 설정과 `demo-spotit-native`만 사용합니다. 최신 결과는 [검증 기록](docs/verification.md), 구현은 [테스트 코드](tests/native-services.integration.test.mjs)를 참고하세요.

빌드 성공과 실제 기기 검증은 구분합니다. 실제 OAuth 인증·지도 키 승인·사진 권한·푸시 수신은 플랫폼 설정을 마친 실기기에서 최종 확인해야 합니다. 작업 중 검증한 범위는 [검증 기록](docs/verification.md)에 기록합니다.

## 코드 구조

`src/app`은 Expo Router 경로, `src/screens`는 네이티브 화면, `src/components`는 공통 UI와 사진 편집기입니다. `src/services`는 원본과 호환되는 Firebase 서비스, `src/lib`는 검색·검증·지도 계산, `src/data`는 정책과 생성된 오픈소스 고지입니다. 원본 웹앱 폴더를 수정하지 않았습니다.
