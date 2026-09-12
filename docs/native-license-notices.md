# 네이티브 앱 오픈소스 고지

`src/data/openSourceLicenses.json`은 앱의 `package-lock.json`과 서버의 `backend/functions/package-lock.json`에 있는 **843개 패키지, 675개 고지 본문**을 포함합니다. 원본 웹 프로젝트의 460개 목록을 그대로 사용하는 대신 현재 두 잠금 파일의 패키지 이름·버전·무결성·직접 의존성·사용 범위에 맞춰 다시 생성했습니다.

## 출처 범위

- 설치된 패키지의 LICENSE/NOTICE 파일과 기존에 확보한 동일 버전·동일 무결성 패키지 원문을 우선 사용합니다.
- 별도 LICENSE 파일을 배포하지 않은 **107개**에는 실제 설치된 `package.json`의 라이선스 선언과 발견한 소스 파일의 저작권·라이선스 헤더를 함께 담았습니다. 표준 약관 본문은 이미 확보한 원문에서 저작권자를 제외한 공통 조건을 발췌하고 출처를 별도로 표시했습니다. 다른 패키지의 저작권자나 연도를 해당 패키지에 붙이지 않습니다.
- 현재 호스트에 설치되지 않은 **10개 lightningcss 플랫폼 패키지**는 설치된 동일 버전 부모 패키지의 `optionalDependencies` 선언, 잠금 파일, 동일 버전 MPL 원문을 연결합니다. 해당 플랫폼 바이너리의 내부 파일을 직접 검사한 것은 아닙니다.
- 위 117개 항목에는 `noticeBasis`와 **Notice source and coverage** 문서를 추가했습니다. 별도 상류 LICENSE/NOTICE의 독립 취득 여부와 확보 범위를 앱의 라이선스 상세에서도 확인할 수 있습니다.

생성기의 검증은 잠금 파일과 고지 목록의 일치, 누락·중복 및 저장 본문의 SHA-256을 확인합니다. 전체 법적 준수나 상류 프로젝트의 모든 고지 확보를 판정하는 검사는 아닙니다.

## 갱신과 검증

```powershell
npm run licenses:generate
npm run licenses:check
```

네트워크 없이 설치 파일과 이미 확보된 고지만 사용하려면 다음을 실행합니다.

```powershell
node scripts/generate-open-source-licenses.mjs --offline
```

새 의존성의 원문을 확보하지 못한 경우 생성기는 오류를 내고 기존 배포용 JSON을 보존합니다. 성공한 중간 결과는 무시 대상인 `.verification.local/license-partial.json`에 저장하며, 재시도할 때 `--resume`으로 활용할 수 있습니다. 별도 원문이 필요한 신규 패키지의 온라인 수집은 npm 레지스트리와 해당 릴리스에 연결된 GitHub 출처를 사용합니다.

확인 결과: 오프라인 생성 성공, `--check` 성공, 생성기 구문 검사와 앱 TypeScript 전체 검사 성공.
