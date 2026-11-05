# Google 지도·장소 검색·길찾기

국내·해외 모두 Google Maps를 사용합니다. Android/iOS는 `react-native-maps`, 웹은 Google Maps JavaScript API입니다. 카카오 지도 SDK·웹 어댑터·제공자 선택 메뉴·Kakao Local 검색을 제거했습니다. 카카오 로그인은 유지합니다.

## 핀과 길찾기

- 지도에서 위치를 누르거나 검색 결과·기존 핀을 선택합니다.
- 선택한 위치, 핀 미리보기, 핀 상세에서 **현재 위치에서 길찾기**를 누릅니다.
- **대중교통 / 도보 / 자동차**를 선택하면 현재 위치를 새로 확인하고 Google 지도 앱 또는 웹을 엽니다.
- 위치 이용 동의·위치 권한·GPS가 없거나 위치 확인이 15초 내 완료되지 않으면 앱에서 길찾기를 시작할 수 없다고 안내합니다. 지도 중심이나 기본 서울 좌표를 출발점으로 대체하지 않습니다.
- 현재 위치 사용은 기존 정책대로 로그인이 필요합니다. 브라우저는 최신 좌표를 요청하며 팝업 차단을 피하도록 같은 탭에서 Google 지도를 엽니다.
- 실제 경로와 대중교통 제공 여부는 Google 지도에서 확인합니다. 앱은 경로 조회 API를 호출하거나 경로가 있다고 미리 판단하지 않습니다. Google 지도를 열지 못하면 별도의 실패 메시지를 표시합니다.
- 위치 확인 중 창을 닫거나 다른 핀으로 이동하면 늦게 도착한 결과로 길찾기를 열지 않습니다.

[Google Maps URL 공식 문서](https://developers.google.com/maps/documentation/urls/get-started), [Expo SDK 57 지도](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [위치](https://docs.expo.dev/versions/v57.0.0/sdk/location/)

## 사진으로 기록

- 지도 오른쪽 아래 **사진으로 기록**에서 사진을 최대 10장 고르면 사진의 촬영 위치·날짜를 읽습니다. 앱은 사진 선택기의 EXIF 값을, 웹은 파일의 EXIF 블록을 읽습니다.
- 위치가 있으면 대표 사진 위치로 지도를 옮기고 주변 장소·촬영일·사진 수를 확인합니다. 위치가 없거나 조정하면 지도 가운데 고정 핀을 움직이거나 장소를 검색해 위치를 정합니다.
- 업로드는 JPEG로 다시 인코딩하므로 원본의 GPS 정보가 서버에 저장되지 않습니다.
- Android 시스템 사진 선택기와 메신저·캡처 이미지는 위치 정보를 지운 채 전달할 수 있습니다. 이 경우 "위치 정보 없음" 단계에서 직접 위치를 지정합니다. iOS 카메라로 막 찍은 사진의 EXIF에는 GPS가 없을 수 있습니다([Expo ImagePicker 문서](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)).

## 앱과 웹 설정

```ini
GOOGLE_MAPS_ANDROID_API_KEY=Android_지도_키
GOOGLE_MAPS_IOS_API_KEY=iOS_지도_키
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=브라우저_지도_키
EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID=웹_지도_ID
```

- Google Cloud에서 Maps SDK for Android / iOS, Maps JavaScript API, Places API (New)를 활성화합니다.
- 네이티브 키는 플랫폼별 앱에 제한합니다. 패키지·번들 ID는 `kr.spotitmap.app`입니다. Android에는 실제 APK 서명의 SHA-1을 등록합니다.
- 웹 키는 Maps JavaScript API와 Places API (New), 실제 웹사이트 referrer에 제한합니다. 지도 ID를 생략하면 개발용 `DEMO_MAP_ID`를 사용합니다.
- 로컬 `.env.local`에 플랫폼 키와 웹 키를 설정했습니다. 별도 웹 빌드 환경에는 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`가 필요합니다. 생성한 `Spotit Google Maps Web` 키의 허용 origin은 `spotitmap.kr`, `www.spotitmap.kr`, 이 Firebase 프로젝트의 Hosting 도메인, `localhost:8082` / `127.0.0.1:8082`입니다. 웹 주소가 `https://www.pinori.kr`로 바뀌었으므로 `pinori.kr/*`, `www.pinori.kr/*`를 이 목록에 추가해야 합니다.
- 서버 Places 키를 브라우저나 `EXPO_PUBLIC_` 변수에 넣지 않습니다. 길찾기 URL에는 별도 Routes API 키가 필요하지 않습니다.
- 네이티브 지도 모듈 제거와 코드 변경은 **새 APK를 빌드·설치해야** 적용됩니다. 기존 APK는 Functions 배포만으로 화면이 바뀌지 않습니다.

## 장소 검색 서버

`searchMapPlaces`는 Google Places Text Search만 호출합니다. `GOOGLE_PLACES_SERVER_API_KEY` 하나만 함수에 바인딩합니다. 이전 APK가 보내는 제공자 값도 호환 목적으로 받지만 검색은 Google에서만 수행합니다. 기존 저장된 핀 좌표와 리뷰의 장소 ID를 삭제하거나 추정해 변환하지 않습니다. 따라서 기존 카카오 장소 ID에 달린 리뷰는 새 Google 장소 검색 결과로 자동 합쳐지지 않습니다.

```powershell
Set-Location C:\spotit
# 키가 아직 없는 새 환경에서만 등록
firebase functions:secrets:set GOOGLE_PLACES_SERVER_API_KEY --project naran-235a6
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
firebase deploy --config backend/firebase.json --project naran-235a6 --only "functions:searchMapPlaces" --non-interactive
```

`searchNearbyMapPlaces`는 사진으로 기록할 때 사진 위치 반경 200m의 장소 이름을 가까운 순서로 추천합니다(Places API Nearby Search, 행정구역·도로 제외). 로그인 사용자만 호출할 수 있고 같은 서버 키와 요청 제한을 사용합니다. 함수가 배포되지 않았거나 실패하면 추천만 표시되지 않고 기록 작성은 그대로 진행됩니다. 웹 미리보기는 브라우저 지도 SDK의 `searchNearby`를 직접 사용합니다.

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
firebase deploy --config backend/firebase.json --project naran-235a6 --only "functions:searchNearbyMapPlaces" --non-interactive
```

서버 키의 API 사용 범위는 Places API (New)로 제한합니다. Android/iOS/브라우저 앱 제한을 적용한 키는 서버용으로 사용하지 않습니다. 기존 카카오 Secret Manager 값은 삭제하지 않았지만 함수에서 더 이상 사용하지 않습니다.

## 검증

`npm run typecheck`, `npm test`, `npm run test:places`, `npm run licenses:check`로 회귀를 확인합니다. 위치 누락·잘못된 좌표·확인 시간 초과·Google 지도 열기 실패·확인 중 취소를 테스트합니다. 실제 기기에서 위치 허용·거부, Google 지도 앱 설치·미설치, 해당 지역의 대중교통 경로 제공 여부는 새 APK로 확인해야 합니다.
