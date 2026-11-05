# 앱 업데이트 안내 운영

Android·iOS 앱은 Firestore의 플랫폼별 출시 정보를 확인하고, 설치된 앱보다 새 버전이 있으면 “새로운 앱 버전이 나왔습니다. 업데이트해 주세요.” 안내와 `나중에` / `업데이트` 버튼을 표시합니다. `업데이트`를 누르면 등록한 배포 주소를 엽니다. 설치는 스토어 또는 운영체제의 절차를 따릅니다.

배포 방식과 주소는 아직 정하지 않았으므로 출시 문서를 만들거나 임의 주소를 등록하지 않았습니다. 유효한 출시 문서가 없으면 안내가 표시되지 않습니다.

## 최초 적용

1. 갱신한 `backend/firestore.rules`를 운영 Firebase 프로젝트에 적용합니다. `appReleases/android`, `appReleases/ios`는 앱에서 개별 조회할 수 있고, 앱 사용자는 작성할 수 없습니다. 규칙 배포 방법은 [Firebase 규칙 안내](firebase-rules-setup.md)를 따르세요.
2. 이번 업데이트 확인 기능을 포함한 앱을 새로 빌드하고 배포합니다. **이 기능이 없는 기존 설치본에는 알림을 소급해서 표시할 수 없습니다.**
3. 배포 주소가 결정되면 아래 순서로 출시 정보를 게시합니다.

## 새 버전을 배포할 때

1. [app.config.ts](../app.config.ts)의 `version`을 올립니다. `1.0.2`, `1.1.0`처럼 숫자 세 부분으로 된 형식을 사용합니다. 같은 표시 버전의 빌드 번호만 올리면 안내가 표시되지 않습니다.
2. 새 앱을 빌드하고 실제 다운로드·업데이트가 가능한 상태로 배포합니다. 플랫폼에서 요구하는 빌드 번호도 해당 빌드 과정에서 올립니다.
3. 아래 명령의 프로젝트 ID와 HTTPS 주소를 실제 값으로 바꿔 `--dry-run`으로 확인합니다. `version`은 Expo의 `getConfig`로 현재 `app.config.ts`에서 자동으로 읽습니다.
4. 내용이 맞으면 `--dry-run`을 제외하고 같은 명령을 실행합니다. 그 시점에 해당 플랫폼의 출시 문서 하나만 게시됩니다. **파일의 버전만 바꿔서는 이미 설치된 앱이 새 버전을 알 수 없습니다. 출시 정보 게시까지 필요합니다.**

### Android

Google Play 앱 페이지, 직접 배포한 APK 또는 APK를 내려받는 안내 페이지의 HTTPS 주소를 사용합니다. 아래 값은 채워 넣을 자리이며 실제 배포 주소가 아닙니다.

```powershell
npm run release:publish -- --platform android --project "FIREBASE_PROJECT_ID" --url "ANDROID_HTTPS_DOWNLOAD_URL" --dry-run
```

### iOS

App Store 등 실제로 iOS 버전을 배포하는 페이지의 HTTPS 주소를 사용합니다. Android와 iOS는 출시 시점과 버전이 달라도 각각 게시할 수 있습니다. 명령을 실행하는 소스의 `version`은 해당 플랫폼에서 실제 배포한 버전과 일치해야 합니다.

```powershell
npm run release:publish -- --platform ios --project "FIREBASE_PROJECT_ID" --url "IOS_HTTPS_DOWNLOAD_URL" --dry-run
```

안내 문구를 추가하려면 `--message "더 편리해진 기능을 만나보세요."`를 붙입니다. 최대 500자이며 생략하면 앱의 기본 안내 문구를 사용합니다. URL은 최대 2048자이고 `https://사용자:비밀번호@주소` 같은 로그인 정보가 담긴 주소는 허용하지 않습니다.

## 게시 권한과 문서

명령은 프로젝트 루트와 `backend/functions`의 설치된 의존성을 사용합니다. npm 명령에 포함된 `--experimental-strip-types`는 Expo SDK 57의 최소 Node 버전인 22.13에서도 앱과 같은 TypeScript 검증 함수를 읽기 위한 옵션입니다. [Expo SDK 57 지원 버전](https://docs.expo.dev/versions/v57.0.0/)

게시 시 Firebase Admin SDK의 Application Default Credentials(ADC)가 필요하며, 해당 프로젝트의 Firestore 문서를 쓸 권한이 있어야 합니다. `firebase login`과 ADC는 별개입니다. 로컬 개발 환경은 `gcloud auth application-default login`으로 ADC를 설정할 수 있고, 배포 환경은 그 환경의 서비스 계정을 사용합니다. 인증 키·토큰을 명령 인자로 받거나 파일 내용을 출력하지 않습니다. [Firebase Admin 초기화 문서](https://firebase.google.com/docs/admin/setup#initialize_the_sdk)

`--project`는 **Firebase 프로젝트 ID**이며 EAS 프로젝트 UUID가 아닙니다. `--dry-run`은 Firebase 인증과 원격 조회·쓰기를 실행하지 않고 게시 대상과 공개 출시 정보만 출력합니다. 실제 게시에는 Firestore 트랜잭션을 사용하여 기존 버전보다 낮은 버전으로 덮어쓰지 않습니다. 같은 버전의 링크·문구를 수정하는 것은 가능합니다. [Firestore 트랜잭션 문서](https://firebase.google.com/docs/firestore/manage-data/transactions)

| 문서 | 필드 | 값 |
| --- | --- | --- |
| `appReleases/android` 또는 `appReleases/ios` | `version` | 실제 출시한 앱의 `major.minor.patch` 버전 |
| 위 문서 | `url` | 실제 업데이트 페이지 또는 다운로드 파일의 HTTPS 주소 |
| 위 문서 | `message` | 선택 사항, 최대 500자의 안내 문구 |
| 위 문서 | `enabled` | 게시 명령은 `true`로 설정. 콘솔에서 `false`로 바꾸면 안내 중지 |

출시 문서는 누구나 읽을 수 있는 공개 안내 정보이므로 비밀 키나 개인 정보를 담지 않습니다. 안내를 중지하려면 Firebase 콘솔에서 해당 플랫폼 문서의 `enabled`를 `false`로 바꾸세요. 다시 게시하면 `true`로 활성화됩니다. 버전을 잘못 게시했다면 같은 문서의 버전을 콘솔에서 확인·수정한 뒤 정상 출시 버전을 게시하세요.

## 사용자에게 보이는 동작

- 실제 설치 버전보다 높은 출시 버전에만 안내가 표시됩니다. Expo Go와 웹에는 표시되지 않습니다.
- `나중에`를 누르면 같은 실행 세션 동안 같은 버전의 안내는 다시 표시되지 않습니다. 앱을 완전히 종료했다가 다시 실행하면 다시 확인합니다.
- 네트워크 오류나 잘못된 출시 정보는 앱 사용을 막지 않습니다.
- `업데이트`는 배포 페이지를 열며 앱을 강제로 종료하거나 자동 설치하지 않습니다.

설치 버전은 Expo SDK 57의 `Application.nativeApplicationVersion`을 기준으로 확인합니다. [Expo SDK 57 Application 문서](https://docs.expo.dev/versions/v57.0.0/sdk/application/)
