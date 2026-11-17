# PINORI 개발 규칙

PINORI(피노리)는 사용자가 순간과 이야기를 지도 위 핀으로 기록하고 공유하는 앱이다.
저장소·패키지 이름은 `spotit`, 앱 ID는 `kr.spotitmap.app`, 웹 도메인은 `www.pinori.kr`이다.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
Expo SDK 57 / React Native 0.86 / React 19.2 / Expo Router(typed routes) / React Compiler.

## 브랜치

- `main`: 안정 배포 버전. 직접 커밋·push 금지. 병합은 사용자 승인 후에만.
- `dev`: 기능 통합 브랜치. feature PR의 병합 대상. 직접 기능 개발은 피한다.
- `feature/<짧은-설명>`: 모든 작업 단위. 항상 최신 `dev`에서 분기한다.
- force push 금지. 이미 push된 기록은 고쳐 쓰지 않는다.

## 작업 흐름

1. 요청과 관련 코드를 분석하고 구현 계획을 보고한다. 승인 전에는 파일을 수정하지 않는다.
2. 승인 후 `git switch dev && git pull --ff-only && git switch -c feature/<이름>`.
3. 기존 구조와 스타일에 맞춰 구현하고, 기능과 관계없는 파일은 건드리지 않는다.
4. `npm run check`를 실행하고, 실패는 원인을 분석해 고친다.
5. `git diff`를 직접 검토한 뒤 의미 있는 메시지로 커밋한다 (예: `feat: …`, `fix: …`, `chore: …`).
6. 사용자 승인 후 feature 브랜치를 push하고 `dev` 대상 PR을 만든다 (`gh pr create --base dev`).
7. 결과를 한국어로 보고한다. 실행하지 않은 검사는 "실행 안 함"으로 적고, 실패를 숨기지 않는다.

## 코드 구조

- `src/app`: Expo Router 경로. 화면 구현은 `src/screens`에 둔다
- `src/screens`: 화면 구현
- `src/components`: 공통 UI, 지도(`map/`, `webMaps/`), 사진 편집기
- `src/services`: Firebase 접근 (Firestore·Storage·Auth 호출)
- `src/lib`: 플랫폼과 무관한 순수 로직. 단위 테스트 대상
- `src/hooks`, `src/types`, `src/contexts`, `src/constants`, `src/data`
- 플랫폼별 구현은 `.ios.ts`, `.android.ts`, `.web.ts(x)` 확장자로 나눈다
- `backend/`: Firebase Functions(`functions/`, Node 24), Firestore·Storage 규칙, 인덱스
- `tests/`: 앱 단위 테스트(`*.test.mjs`)와 에뮬레이터 통합 테스트
- import 경로 별칭: `@/*` → `src/*`

## 검사

```bash
npm run check              # typecheck + 앱 테스트 + 백엔드 테스트 + lint
npm run typecheck
npm test
npm --prefix backend/functions test
npm run lint
npm run test:integration   # 로컬 에뮬레이터(demo-spotit-native) 전용, Firebase CLI + JDK 필요
```

- 새 `tests/*.test.mjs` 파일은 `package.json`의 `test` 스크립트 목록에 추가해야 실행된다.
- 새 `backend/functions/*.test.cjs` 파일은 `backend/functions/package.json`의 `test` 목록에 추가해야 실행된다.
- 린트에는 기존 오류(주로 `react-hooks/set-state-in-effect`, `react-hooks/refs`)가 남아 있다. 새로 만든 오류와 기존 오류를 구분해 보고한다.
- 빌드 성공과 실기기 검증은 다르다. 실기기에서 확인하지 않은 동작은 그렇다고 적는다.

## 금지 사항

- `.env*`, `google-services.json`, `GoogleService-Info.plist`의 값과 API 키·토큰을 출력·커밋·외부 전송하지 않는다.
- 사용자 승인 없이 `firebase deploy`, `eas build`, `eas submit`, `npm run release:publish`, PR 병합을 실행하지 않는다.
- 운영 Firestore·Storage·Auth에 쓰지 않는다. 테스트는 에뮬레이터만 사용한다.
- 검사를 끄거나 테스트를 지워서 통과시키지 않는다.
