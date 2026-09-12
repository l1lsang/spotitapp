# 스팟잇 네이티브 앱

원본 웹앱 `C:\Users\jkm08\OneDrive\바탕 화면\spotit`의 21개 화면 경로를 Expo SDK 57 / React Native로 옮긴 Android·iOS 프로젝트입니다. 모든 화면은 네이티브 UI로 구현했으며 원본 페이지를 WebView로 불러오지 않습니다. 같은 Firebase 프로젝트의 계정·기록·팔로우·그룹·채팅을 사용합니다.

## 실행

Node.js 22.13 이상이 필요합니다. 현재 작업 폴더에는 의존성과 원본의 공개 Firebase 클라이언트 설정을 준비했습니다. 설정 값은 Git에 포함되지 않는 `.env.local`에 있습니다.

```powershell
Set-Location C:\spotit
npm install
npm run go
```

Expo Go에서 이메일 로그인과 주요 화면을 확인할 수 있습니다. Google/Kakao 로그인과 원격 푸시는 네이티브 모듈이 포함된 개발 또는 배포 빌드가 필요합니다.

```powershell
# 설치된 개발 빌드에 연결
npm run dev-client
# 브라우저에서 화면 미리보기
npm run web
# Android APK / iOS 배포용 빌드 (EAS 프로젝트·자격 증명 설정 후)
npx eas build --platform android --profile preview
npx eas build --platform ios --profile production
```

웹 미리보기는 화면 확인용입니다. 대화형 지도와 주소 검색은 iOS·Android에서 동작합니다. iOS 로컬 빌드는 macOS와 Xcode가 필요합니다.

## 구현 범위

- 지도·핀 클러스터·현재 위치·주소 검색·그룹 지도·실시간 장소 상태
- 피드·거리/키워드 검색·페이지 추가 로딩·내 기록·좋아요
- 핀 작성/수정·사진 선택/촬영·자르기/회전/반전/확대·썸네일 업로드
- 댓글·답글·멘션·좋아요·공유·신고
- 사람 검색·팔로우/요청·비공개 프로필·핀 앨범·테마·프로필 설정
- 개인/단체 채팅·사진·읽음·초대·고정·미디어 모음
- 가입·필수 동의·로그인 유지·계정 재인증/탈퇴
- 알림·문의·관리자·5종 정책·라이선스

경로와 파일은 [화면 대응표](docs/native-page-inventory.md)에 정리했습니다. 사진·색상·한글 문구는 원본 자료를 사용하며 네이티브 레이아웃과 운영체제 UI에 맞춰 조정했습니다.

## 실제 서비스 연결에 남은 설정

`.env.example`에는 필요한 항목이 나열되어 있습니다. 키·클라이언트 ID가 없는 기능은 현재 활성화 완료 상태가 아닙니다.

| 항목 | 필요한 설정 |
| --- | --- |
| Android 지도 | `GOOGLE_MAPS_ANDROID_API_KEY`, Maps SDK for Android 활성화, 패키지 `kr.spotitmap.app`와 서명 SHA-1 등록 |
| iOS 지도 | 기본 Apple Maps 사용. Google 지도 제공자를 사용할 경우 별도 설정 필요 |
| Google 로그인 | Web/iOS OAuth client ID, Android SHA-1/SHA-256, iOS URL scheme |
| Kakao 로그인 | Native app key·플랫폼 키 해시·OIDC, Firebase provider의 토큰 audience 호환성 확인 |
| 푸시 | EAS project ID, APNs/FCM 자격 증명, [네이티브 푸시 서버](backend/README.md) 배포 |
| HTTPS 링크로 앱 열기 | 도메인에 Apple Universal Links / Android App Links 연결 파일과 앱 설정 추가 |

인증 등록 방법은 [네이티브 인증 설정](docs/native-auth-setup.md)을 참고하세요. 원본 JavaScript 지도 키는 네이티브 SDK 키 등록을 대신하지 않습니다.

원본은 한국에서 Kakao 웹 지도, 해외에서 Google 웹 지도를 사용합니다. 현재 앱은 Android Google Maps / iOS Apple Maps와 OS 주소 검색을 사용하므로 지도 바탕과 사업장 검색 결과까지 원본과 동일하지 않습니다. `geo:` 장소 ID를 사용한 상태 기록은 웹의 Kakao/Google 장소 ID와 자동 통합되지 않습니다. 원본과 동일한 POI 검색·지도 제공자 전환은 추가 연동 대상입니다.

`backend/`는 원본 서버를 보존하면서 네이티브 푸시 큐·재시도·수신증 처리를 추가한 배포 준비 코드입니다. 운영 서버는 이 작업에서 배포하지 않았습니다.

## 검사

```powershell
npm run typecheck
npm test
npm run test:push
npm run test:integration
npm run licenses:check
npm run build
```

원본의 가입 연령·동의, 좌표·핀 클러스터, 읽음 처리 테스트를 재사용했습니다. 총 30개 테스트를 통과했습니다(단위 16개, 푸시 서버 10개, Firebase 에뮬레이터 통합 4개). 통합 테스트는 로컬 Firebase CLI/JDK와 기존 에뮬레이터 캐시가 필요하며 프로젝트 전용 설정과 `demo-spotit-native`만 사용합니다. 자세한 내용은 [테스트 코드](tests/native-services.integration.test.mjs)와 [백엔드 문서](backend/README.md)를 참고하세요.

빌드 성공과 실제 기기 검증은 구분합니다. 실제 OAuth 인증·지도 키 승인·사진 권한·푸시 수신은 플랫폼 설정을 마친 실기기에서 최종 확인해야 합니다. 작업 중 검증한 범위는 [검증 기록](docs/verification.md)에 기록합니다.

## 코드 구조

`src/app`은 Expo Router 경로, `src/screens`는 네이티브 화면, `src/components`는 공통 UI와 사진 편집기입니다. `src/services`는 원본과 호환되는 Firebase 서비스, `src/lib`는 검색·검증·지도 계산, `src/data`는 정책과 생성된 오픈소스 고지입니다. 원본 웹앱 폴더를 수정하지 않았습니다.
