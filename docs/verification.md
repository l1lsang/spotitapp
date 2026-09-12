# 네이티브 앱 검증 기록

작성일: 2026-09-13.

## 확인한 항목

- `npm run typecheck`: strict TypeScript 검사 통과. 사용하지 않는 지역 변수·매개변수 검사 포함.
- `npm test`: 가입 나이/동의 5개, 지도 좌표/클러스터/외부 링크 7개, 채팅 읽음 4개 — 총 16개 통과.
- `npm run build -- --max-workers 2`: 최종 코드의 TypeScript·라이선스 검사와 Android Hermes·iOS Hermes·웹 번들 생성 성공. 출력은 `dist/`, Android 번들 약 9.6MB / iOS 약 9.4MB / 웹 주 번들 약 7.1MB. 이 결과는 APK/IPA 파일의 네이티브 컴파일 성공과 구분합니다.
- `npm run licenses:check`: 앱/서버 lockfile에 있는 843개 패키지 목록과 675개 고지 본문 해시 확인. 원문 확보 범위는 [라이선스 문서](native-license-notices.md)에 기록했습니다.
- 네이티브 푸시 서버 테스트: 큐 중복 방지, 재시도, 수신증, 토큰 폐기 경합 등 10개 통과.
- 390×844 브라우저 미리보기: 랜딩→로그인→회원가입, 지도→피드, 그룹 로그인 안내, 관리자 인증, 약관 목차·본문·인쇄 버튼, 라이선스 검색/목록 확인.
- 실행 검사에서 지도 오류 안내의 빈 문자열이 View의 텍스트 자식이 되던 문제를 수정했고 다시 열었을 때 오류 오버레이가 사라진 것을 확인했습니다.

화면 캡처는 `artifacts/landing.png`, `login.png`, `signup.png`, `map-preview.png`, `policies.png`, `licenses.png`에 있습니다. 웹 화면 검사는 네이티브 지도나 네이티브 모듈의 기기 실행을 검증하는 방법이 아닙니다.

## 기기·운영 검증 범위

처음 확인할 때 연결된 Android 기기는 없었습니다. OAuth 로그인·실제 사진 업로드·관리자 조치·계정 삭제를 운영 서비스에서 실행하지 않았습니다. 외부 메시지나 푸시를 전송하지 않았습니다. 지도/OAuth/푸시 앱 등록과 서버 배포는 준비 사항이며 완료로 표시하지 않습니다.

Android APK와 Firebase 에뮬레이터 검증 시도 결과는 아래와 같습니다.

## Android APK 빌드 시도

**APK는 아직 생성되지 않았습니다.** `expo prebuild --platform android --no-install --no-clean --skip-dependency-update react,react-native`는 성공하여 `android/` 네이티브 프로젝트가 생성됐습니다. Expo가 자동 수정한 기존 `android`/`ios` npm 실행 명령만 되돌렸으며 다른 작성 스크립트는 보존했습니다.

설치된 Android Studio JBR **OpenJDK 21.0.8**, Android SDK의 API 36 및 Build Tools를 확인했습니다. 생성된 Gradle wrapper는 **9.3.1**입니다. 첫 `assembleRelease`는 Gradle 배포 파일 다운로드 시 `java.net.SocketException: Permission denied: getsockopt`로 종료되었습니다. 컴파일 오류가 아니라 sandbox의 네트워크 접근 제한이었습니다.

필요한 권한 승격을 두 번 요청했으나 두 요청 모두 승인 대기 중 중단되었습니다. 승격된 Gradle 프로세스가 시작됐거나 의존성 다운로드·컴파일이 진행됐다는 결과는 없습니다. 기록 시점에 실행 중인 Java 프로세스와 release APK 출력 파일도 없었습니다. 따라서 Android 실기기 설치와 실행은 검증하지 못했습니다.

- 생성 기록: `artifacts/android-prebuild.log`
- 최초 다운로드 실패 기록: `artifacts/android-release-build.log`
- 재개 스크립트: `scripts/build-android.ps1`

일반 PowerShell에서 프로젝트 루트로 이동한 뒤 실행합니다. Gradle/Maven 및 필요 시 Android SDK 구성 요소 다운로드를 허용하는 네트워크 환경이 필요합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

스크립트는 JDK·SDK를 사전 확인하고 해당 프로세스의 환경 변수만 설정합니다. 삭제 없이 Android prebuild를 적용하고 `assembleRelease`를 수행합니다. 성공한 경우에만 `artifacts/spotit-preview.apk`를 복사합니다. 이 출력은 생성된 debug 서명키를 쓰는 로컬 미리보기 APK이며 앱스토어 배포 파일로 검증한 결과가 아닙니다. 지도·OAuth·푸시 서비스 키를 임의로 채우지 않으며 관련 설정은 [네이티브 인증 설정](native-auth-setup.md)과 앱 README를 따라야 합니다.

## Firebase 에뮬레이터 검증 시도

`tests/native-services.integration.test.mjs`에 네이티브 앱이 사용하는 실제 Firebase 서비스를 불러오는 4개 통합 테스트를 작성했습니다. 이메일 가입·필수 가입정보, 비공개 그룹과 핀·좋아요·댓글·답글·탈퇴 후 접근 회수, 채팅 실시간 수신·읽음·고정·비참여자 차단, Expo 토큰 소유권/형식 규칙을 대상으로 합니다. 기기 전용 암호화·스토리지·푸시 부분만 테스트용으로 대체하며, `demo-spotit-native` 및 로컬 에뮬레이터 주소가 아닌 실행은 시작 시 중단합니다.

**최종 결과: 4개 통합 테스트 모두 통과, 프로세스 종료 코드 0.** 첫 실행은 Firebase CLI 사용자 설정 파일의 sandbox `EPERM`으로 실패했고 승격 재실행도 승인 대기에서 중단되었습니다. 이후 설치된 CLI가 공식 지원하는 `XDG_CONFIG_HOME`/`FIREBASE_EMULATORS_PATH` 설정을 확인하여 사용자 설정을 읽지 않는 프로젝트 전용 실행기로 해결했습니다. 추가 권한승격 없이 로컬 Auth/Firestore가 기동되고, 테스트 후 두 에뮬레이터가 정상 종료된 것을 확인했습니다.

통과 근거는 최초 성공 실행에서 반환된 테스트 출력(`tests 4`, `pass 4`, `fail 0`)과 종료 코드입니다. 그 실행은 별도 원시 로그 파일로 보존하지 않았습니다. 이후 환경 덤프를 막도록 상속된 `DEBUG`를 제거했으며, 로그 확보를 위한 재실행은 CLI 시작 중 지연되어 중단했습니다. 이 재실행을 추가 통과로 계산하지 않습니다.

실행기는 사용자 캐시에 있던 Firestore JAR를 설치된 CLI의 SHA256 manifest와 대조한 뒤 `.verification.local` 아래에 복사합니다. 별도 CLI 설정 디렉터리를 사용하고 상속된 인증 환경변수를 제거하며 `demo-spotit-native`를 고정합니다. 운영 Firebase 데이터나 사용자 전역 Firebase 설정을 읽거나 변경하지 않았습니다. CLI의 공개 MOTD 요청은 네트워크 경고가 발생했으나 에뮬레이터와 테스트는 정상 완료되었습니다.

프로젝트 루트에서 성공한 재현 명령:

```powershell
node scripts/test-native-emulators.mjs
```

실제 서비스와 배포할 Firestore 규칙으로 확인한 결과:

- 이메일 가입·필수 가입정보 미완료 시 작성 차단·재로그인 통과.
- 비공개 그룹 초대코드·핀 접근 제한·좋아요·댓글/답글·탈퇴 후 접근 회수 통과.
- 실시간 채팅·읽음·고정과 비참여자 접근 차단 통과.
- 새 Expo 토큰 규칙의 소유권·형식 검사와 전송 큐의 클라이언트 접근 차단 통과.

별도 검증인 `node --test backend/functions/nativePush.test.cjs`는 **10개 통과**입니다(초기 8개에서 배치 한도/웹 토큰 분리와 수신증 미도착 검사를 추가). 네이티브 푸시 서버 파일의 `node --check`도 통과했습니다. 앱 단위 검사 16개와 합하면 총 **30개 테스트 통과**이며 실제 푸시 제공자 수신이나 기기 실행을 대신하지는 않습니다.
