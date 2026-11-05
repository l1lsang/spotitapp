# 네이티브 앱 검증 기록

최종 확인일: 2026-09-14. 이번 작업에서는 APK·IPA 생성, Expo prebuild, 운영 Firebase 규칙·함수 배포를 실행하지 않았습니다. Android Gradle 검사는 카카오 지도 모듈의 `:spotit-kakao-map:compileReleaseKotlin`과 그 의존 모듈 컴파일까지만 실행했습니다. 2026-09-14에는 Google 로그인 오류를 해결하기 위해 확인한 EAS APK의 SHA-1을 Firebase Android 앱에 등록했습니다.

같은 날 푸시 `FIS_AUTH_ERROR`에 대응해 APK의 API 키 허용 목록에 Firebase Installations API와 FCM Registration API를 추가했습니다. APK 설정으로 재현한 설치 등록 요청이 HTTP 403에서 200으로 바뀌었고 설치 인증 토큰 발급도 200으로 성공했습니다. 테스트용 설치는 검사 직후 삭제했습니다. [푸시 설정 기록](native-push-setup.md)에 원인과 검증 범위를 정리했습니다.

## 코드와 데이터 검사

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm test` | 31개 통과: 가입 나이·동의, 지도 제공자·좌표·클러스터·Mercator 투영, 채팅 읽음·이모지 반응, 앱 버전 비교·출시 정보 게시 |
| `npm run test:push` | 10개 통과: 네이티브 푸시 큐·재시도·수신증·토큰 경합 |
| `npm run test:places` | 4개 통과: 요청 검증, Kakao ID/좌표, Google 전환/ID, 제공자 오류 |
| `npm run test:integration` | 8개 통과: 실제 Auth·Firestore·Storage 에뮬레이터와 앱 서비스, 채팅 반응·탈퇴 정리, 로그인 전 앱 출시 정보 조회·권한 |
| `npm run licenses:check` | 844개 npm 패키지·675개 고지 본문, 앱/서버 lockfile 일치 |
| `git diff --check` | 통과 |
| 새 검색 서버 파일 `node --check` | 통과 |

**총 53개 테스트 통과, 실패 0개.** 지도 검색·푸시 서버 단위 테스트는 외부 API를 대체하며 실제 서비스에 검색이나 알림을 보내지 않습니다. 앱 업데이트 안내 추가 작업에서는 타입 검사, 라이선스 검사, 앱 단위 테스트 31개와 통합 테스트 8개를 다시 실행했습니다.

Firebase 통합 테스트는 `demo-spotit-native`와 고정된 로컬 주소 외의 실행을 거부합니다. Auth 9291, Firestore 8281, Storage 9391을 사용합니다. 실행기는 상속된 운영 인증 환경변수와 DEBUG를 제거하고 프로젝트 내부 CLI 설정·캐시를 사용합니다. 설치된 Firebase CLI manifest와 SHA256이 같은 기존 Firestore 1.20.2 / Storage rules runtime 1.1.3 JAR만 복사합니다.

첫 지도 회귀 검사는 가입 미완료 시 지도 조회가 거부되고 가입 후 성공하는지, `onboardingComplete`가 없는 기존 웹 계정의 조회·핀 테마 저장, 팔로잉 6명을 두 묶음 이상으로 조회하고 커서로 이어 읽을 수 있는지 확인합니다. 비공개 그룹·채팅·사진은 허용할 요청과 거부할 요청을 함께 검사합니다. 테스트 뒤 에뮬레이터가 종료됐습니다.

채팅 이모지 반응은 기존 메시지 호환, 실시간 추가·변경·취소, 세 참여자의 동시 변경, 기본 이모지 여섯 종류, 메시지와 채팅 시간 정보 보존을 확인했습니다. 비참여자 접근, 타인 반응 변경, 메시지 내용·작성자 위조를 차단하고 회원 탈퇴 시 반응 정리도 검증했습니다. 네이티브 실기기에서 길게 누르기와 시각적 배치는 아직 확인하지 않았으며, 운영 반영에는 [갱신된 Firestore 규칙 적용](firebase-rules-setup.md)이 필요합니다.

앱 업데이트 안내는 숫자 기준 버전 비교, 잘못된 주소·배포 정보 무시, 로그인 전 플랫폼별 조회, 서버에서 확인하지 않은 캐시 정보 제외, 일반 사용자의 게시 차단을 검증했습니다. 게시 명령은 실제 앱 설정에서 버전을 읽는 `--dry-run`과 버전 하향 게시 방지 테스트를 통과했습니다. 배포 주소가 미정이므로 운영 출시 정보는 게시하지 않았으며 실제 스토어·APK 이동과 실기기 팝업은 아직 확인하지 않았습니다. 최초 빌드와 이후 버전 게시 절차는 [업데이트 안내 운영](app-updates.md)에 정리했습니다.

## JavaScript 번들 및 자동 연결

```powershell
npx expo export --platform all --output-dir .verification.local/bundle-final --max-workers 2
```

명령 종료 코드 0. Android Hermes 약 9.6MB, iOS Hermes 약 9.4MB, 웹 주 번들 약 7.1MB를 생성했습니다. 이 결과는 JavaScript와 에셋 번들 검사이며 APK/IPA나 Kotlin/Swift 컴파일 결과가 아닙니다.

Expo 자동 연결의 Android·iOS resolve 결과에서 `spotit-kakao-map` 모듈을 확인했습니다. Android `kr.spotitmap.maps.SpotitKakaoMapModule`, iOS `SpotitKakaoMapModule` 및 pod `SpotitKakaoMap`이 발견됩니다.

## Android 카카오 모듈 컴파일

EAS 빌드 `692b55f8-711b-4d33-b786-964b153b4241`의 Kotlin 오류를 확인해 직접 사용하는 `react-android` 의존성을 추가하고, 생명주기 리스너 등록·해제를 SDK 57의 `appContext.runtime.reactContext`에서 호출하도록 수정했습니다.

기존 로컬 Android 프로젝트에서 다음 작업을 실행했습니다. 먼저 `--dry-run`으로 앱 조립·패키징 작업이 포함되지 않음을 확인했습니다.

```powershell
Set-Location C:\spotit\android
.\gradlew.bat :spotit-kakao-map:compileReleaseKotlin --console=plain --no-daemon --max-workers=2 "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m -Dfile.encoding=UTF-8"
```

JDK 21, Android SDK 36, Kotlin 2.1.20에서 종료 코드 0, `BUILD SUCCESSFUL`을 확인했습니다. 로그는 로컬 `.verification.local/kakao-compile-release-fixed.log`에 저장했습니다. 이 검사는 카카오 모듈의 Android Kotlin 컴파일을 검증하며 전체 APK 패키징, iOS 컴파일, 실제 기기 지도 동작을 검증하지 않습니다.

2026-09-14 지도 한 번 누르기 변경 후에도 `npm run typecheck`와 `:spotit-kakao-map:compileReleaseKotlin`이 통과했습니다. Google 지도는 지도 누르기 이벤트를 추가하고 게시물 마커 이벤트가 위치 선택으로 전달되지 않도록 처리했습니다. 카카오 Android는 Terrain 클릭 리스너, iOS는 SDK 인터페이스에 선언된 `terrainDidTapped`를 연결했습니다. 기존 길게 누르기는 유지했습니다. Kotlin 로그는 `.verification.local/kakao-tap-compile.log`이며, iOS 컴파일과 실기기 터치 검사는 실행하지 않았습니다.

## 브라우저 미리보기

390×844 브라우저에서 다음 흐름을 확인했습니다.

- 로그인: 구글 버튼 아래 브라우저 안내 제거, 약관 5종·오픈소스 링크와 로고 제작 표기.
- 별도 로컬 데모 환경의 이메일 로그인 → 첫 지도. 완료 표시가 없는 기존 웹 계정 형태의 테스트 프로필 사용.
- 첫 지도 그룹 선택에서 실제 에뮬레이터의 가입 그룹 표시, 그룹 지도 선택.
- 피드에 테스트 핀 1개 표시, 핀 상세·댓글 입력·내 프로필 앨범 조회.
- 그룹 목록 및 작성 폼의 필드·테마·공개 범위 표시.
- 위 흐름에서 브라우저 JavaScript 오류 목록이 비어 있음을 확인.

데모 환경은 `EXPO_NO_DOTENV=1`로 사용자 환경 파일 로드를 끄고 공개 설정을 전부 `demo-spotit-native`로 바꿨습니다. 테스트 사용자·핀·그룹은 로컬 에뮬레이터에만 생성했습니다. 데모 브라우저와 서버·에뮬레이터는 검사 후 종료했습니다.

브라우저 지도 키가 없어 배경 지도는 설정 안내 상태였습니다. 따라서 이 검사로 실제 지도 타일·SDK 인증·핀 제스처가 동작했다고 판단하지 않습니다. 원본 Vite 개발 서버와 웹 소스는 변경하지 않았습니다.

## 2026-10-22 참고 프로젝트 동기화

- `npm run typecheck`, `npm test`(60개), `npm run test:places`(5개, 주변 장소 검색 포함), `npm run test:push`(10개), `npm run licenses:check`, `npx expo export --platform all` 통과.
- 브라우저 375·1440px, 브라우저 전용 테스트 데이터: 지도 → 장소 검색 → 장소 시트·리뷰 작성 폼, 그룹 범위 시트 → 그룹 지도 칩, 사진으로 기록(GPS가 있는 사진 → 확인 → 위치 조정 → 작성 화면 → 위치 변경, GPS 없는 사진 → 직접 지정), 피드 그리드 → 상세 피드, 내 기록 필터, 프로필 핀/좋아요 탭, 타인 프로필 더보기 메뉴, 채팅 + 메뉴·1:1 시작, 사람 목록. JavaScript 오류 없음.
- 시작 경로: 로그인 상태 `/` → `/map`, 비로그인 `/` → `/login?from=/map`.
- 서버 데이터 쓰기, `searchNearbyMapPlaces` 배포, 실제 기기의 사진 EXIF·지도 SDK 동작은 확인하지 않았습니다.

## 기기·운영에 남은 확인

Google 로그인 설정은 2026-09-14에 EAS preview APK `914e09db-e415-45e7-b984-d2ea8d39082d`의 패키지·서명·포함된 웹 클라이언트 ID를 검증했습니다. Firebase의 SHA 지문 등록 0개를 확인한 뒤 해당 SHA-1을 등록했고, 새 설정에서 일치하는 Android OAuth 클라이언트 생성을 확인했습니다. 자세한 지문과 변경 기록은 [인증 설정](native-auth-setup.md)에 있습니다. 기기에서의 로그인 성공은 아직 검증하지 않았습니다.

같은 APK의 카카오 지도 설정도 확인했습니다. 현재 네이티브 키가 번들에 포함되어 있고, 검증된 APK 서명·패키지로 지도 SDK 인증 요청을 재현했을 때 HTTP 401 `android keyhash mismatched`를 확인했습니다. 카카오 콘솔에 직접 접근할 브라우저가 없어 등록 변경은 하지 못했으며, [지도 설정](native-map-setup.md)에 정확한 키 해시와 등록 절차를 기록했습니다.

- 전체 Android 앱 패키징·iOS 네이티브 컴파일·실기기 Kakao/Google 지도 전환·핀 선택·클러스터 확대·현재 위치.
- 네이티브 Google/Kakao OAuth, 실제 기기 사진 권한·편집·공유, 원격 푸시 수신.
- 운영 Firebase 프로젝트의 규칙·인덱스와 검색 함수·시크릿 적용.
- 운영체제별 글꼴·모달·키보드와 웹 디자인의 최종 시각 비교.

[규칙 적용 안내](firebase-rules-setup.md), [지도·검색 설정](native-map-setup.md), [인증 설정](native-auth-setup.md)에 사용자가 적용할 절차를 정리했습니다. 완전한 픽셀 일치나 실기기 전체 기능 검증을 완료한 상태로 표시하지 않습니다.
