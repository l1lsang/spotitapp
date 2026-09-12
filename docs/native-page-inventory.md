# 스팟잇 웹 → 네이티브 화면 대응표

원본: `C:\Users\jkm08\OneDrive\바탕 화면\spotit`의 React/Vite 앱. 앱: `C:\spotit`의 Expo SDK 57 / React Native 앱.

원본의 21개 경로 패턴을 Expo Router 화면으로 옮겼습니다. 화면은 React Native `View`, `Text`, `Pressable`, `Modal`, `FlatList`와 네이티브 지도·사진·공유 기능으로 구현하며 웹 화면을 WebView에 띄우는 방식은 사용하지 않습니다. 정책 인쇄용 문서만 시스템 인쇄기에 전달할 HTML로 생성합니다.

## 경로별 대응

| 원본 경로 | 네이티브 화면 | 연결한 주요 기능 |
| --- | --- | --- |
| `/` | [AuthScreens.tsx](../src/screens/AuthScreens.tsx), `LandingScreen` | 기존 로고·히어로 이미지, 시작/로그인, 정책 링크 |
| `/login` | [AuthScreens.tsx](../src/screens/AuthScreens.tsx), `LoginScreen` | 이메일, Google, Kakao 로그인, 비밀번호 재설정 |
| `/signup` | [AuthScreens.tsx](../src/screens/AuthScreens.tsx), `SignupScreen` | 사용자 이름 검사, 2단계 가입, 프로필 사진, 필수 동의 |
| `/map` | [MapScreen.tsx](../src/screens/MapScreen.tsx) | 현재 위치, 핀/클러스터, 검색, 그룹 필터, 실시간 장소 상태, 작성 진입 |
| `/feed` | [FeedScreen.tsx](../src/screens/FeedScreen.tsx) | 거리별 피드, 위치, 검색, 다음 페이지, 새로고침 |
| `/groups` | [GroupScreens.tsx](../src/screens/GroupScreens.tsx), `GroupsScreen` | 공개/내 그룹, 검색, 공개·비공개 생성, 초대코드 가입 |
| `/groups/:groupId` | [GroupScreens.tsx](../src/screens/GroupScreens.tsx), `GroupDetailScreen` | 실시간 그룹/멤버십/핀, 가입·탈퇴, 코드 확인·복사, 공유, 그룹 지도 |
| `/posts/:postId` | [PostDetailScreen.tsx](../src/screens/PostDetailScreen.tsx) | 사진, 공개 범위, 좋아요, 댓글·답글·멘션, 작성자, 지도, 수정·삭제·신고·공유 |
| `/notifications` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `NotificationsScreen` | 실시간 알림, 개별/전체 읽음, 관련 화면 이동, 푸시 설정 |
| `/people` | [PeopleScreen.tsx](../src/screens/PeopleScreen.tsx) | 닉네임/사용자 이름 검색, 프로필, 팔로우·언팔로우·요청 취소 |
| `/people/:userId` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `PersonProfileScreen` | 타인 프로필, 접근 가능한 핀 앨범, 팔로우·요청, 1:1 대화, 신고 |
| `/chats` | [ChatScreens.tsx](../src/screens/ChatScreens.tsx), `ChatListScreen` | 실시간 대화 목록, 읽지 않음, 검색, 친구 선택·단체방 만들기 |
| `/chats/:chatId` | [ChatScreens.tsx](../src/screens/ChatScreens.tsx), `ChatRoomScreen` | 실시간 메시지·사진·읽은 사람, 친구 초대, 고정·미디어 모음, 대화 점프, 메시지/사진/유저 신고 |
| `/my` | [FeedScreen.tsx](../src/screens/FeedScreen.tsx), `kind="mine"` | 내 기록 목록, 상세·수정·삭제 진입 |
| `/profile` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `ProfileScreen` | 내 프로필·핀 앨범, 팔로우 수, 설정·좋아요 |
| `/profile/settings` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `ProfileSettingsScreen` | 프로필 편집, 공개 범위, 팔로워/팔로잉·요청, 핀 테마, 로그아웃·탈퇴 |
| `/profile/likes` | [FeedScreen.tsx](../src/screens/FeedScreen.tsx), `kind="liked"` | 실시간 좋아요 핀 목록 |
| `/support` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `SupportScreen` | 문의 제출, 내 신고·문의와 답변 |
| `/admin` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `AdminScreen` | 관리자 인증, 통계, 신고·문의 필터/처리, 핀 숨김·복구, 사용자 검색/정지 |
| `/licenses` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `LicensesScreen` | 라이선스 검색, 사용 범위, 원문 |
| `/policies/:policyId?` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `PoliciesScreen` | 정책 목록 및 5종 본문, 목차·섹션 이동, 링크, 시스템 인쇄 |

핀 작성·수정 모달은 앱의 `/posts/new`, `/posts/edit` 경로와 [PostFormScreen.tsx](../src/screens/PostFormScreen.tsx)로 분리했습니다. 사진 편집은 [PhotoEditor.tsx](../src/components/PhotoEditor.tsx)의 이동·확대·비율 자르기·회전·반전을 공유합니다. 지도·피드·사람·채팅·프로필의 다섯 하단 탭은 유지합니다.

## 데이터와 접근 범위

Firebase 사용자·핀·댓글·그룹·채팅·신고 서비스와 자료형을 재사용합니다. 앱 환경변수에 같은 Firebase 프로젝트를 지정하면 웹에서 쓰던 계정과 데이터를 공유합니다. 그룹 가입과 비공개 핀 접근, 채팅 참여자, 관리자 기능은 기존 Firestore 규칙과 서버 함수가 최종 권한을 판단합니다. 로컬 목업 데이터는 사용하지 않습니다.

개인 데이터 화면은 로그인 상태를 확인하고, 채팅방 메시지는 참여 가능한 방 정보를 확인한 뒤 구독합니다. 그룹 탈퇴 시 해당 비공개 그룹 문서 구독을 정리하고, 채팅 읽음 기록은 화면이 활성화되어 있을 때 갱신합니다. 네이티브 푸시는 웹 FCM 토큰과 다른 `expoPushTokens` 컬렉션을 사용합니다.

## 플랫폼 차이와 필요한 설정

- **지도:** 원본은 국내 Kakao Maps JavaScript SDK / 해외 Google Maps JavaScript SDK를 전환합니다. 앱은 [NativeMap.tsx](../src/components/NativeMap.tsx)의 `react-native-maps`를 사용하여 Android는 Google Maps, iOS는 기본 Apple Maps를 표시합니다. 지도 바탕·상표·POI 표시가 웹과 동일하지 않으며 앱에는 Kakao 지도 전환이 없습니다. 기존 핀의 좌표와 상세 기록은 계속 사용합니다. Android 앱용 Google Maps 키가 필요하며 원본 JavaScript 키의 웹 도메인 설정만으로 네이티브 지도 설정을 대체할 수 없습니다.
- **장소 검색:** 현재 [placeSearch.ts](../src/lib/placeSearch.ts)는 OS 주소 지오코딩을 사용합니다. 원본 Kakao 장소 검색/Google Places 사업장 검색과 검색 범위·결과·장소 ID가 동일하지 않습니다. 도로명 주소 중심으로 확인해야 하며 해외 장소 검색 결과도 OS 제공 범위에 따릅니다. 네이티브 검색의 `geo:` 장소 ID로 남긴 실시간 장소 상태는 원본 Kakao/Google ID의 상태와 자동으로 합쳐지지 않습니다. 이 부분의 완전한 동일성은 추가 POI 검색 제공자 연동이 필요합니다.
- **소셜 로그인:** 네이티브 Google/Kakao SDK와 플랫폼별 앱 등록을 사용합니다. [네이티브 인증 설정](native-auth-setup.md)의 클라이언트 ID·리디렉션·키 해시·OIDC 설정을 완료하고 개발/배포 빌드에서 확인해야 합니다. 이메일 로그인은 Expo Go에서도 사용할 수 있습니다.
- **푸시:** 앱 화면의 알림 목록은 기존 Firestore 데이터를 사용합니다. 잠금 화면/백그라운드 푸시는 EAS 프로젝트·APNs/FCM 인증서·실기기와 [추가 서버 설정](../backend/README.md)이 필요합니다. 서버 코드 작성 및 로컬 테스트와 운영 서버 배포·실기기 수신 검증은 별도 상태입니다.
- **사진:** 네이티브 사진 선택기·편집기를 사용하며 업로드는 JPEG와 썸네일로 처리합니다. GIF 애니메이션·투명도·원본 포맷 보존은 기존 웹 업로드와 다를 수 있습니다.
- **내비게이션/공유:** 앱 내부 경로는 Expo Router로 이동하고 공유 링크의 웹 주소는 `EXPO_PUBLIC_WEB_URL`을 사용합니다. `spotit://` 스킴과 웹 HTTPS 링크의 앱 자동 열기는 서로 다른 설정이며 HTTPS 자동 열기를 위해서는 도메인의 Universal Links/App Links 연결이 필요합니다.
- **표현:** 기존 색상·에셋·주요 화면 구성은 재사용하되 글꼴 렌더링, 네이티브 모달·키보드·공유 시트는 운영체제에 따릅니다. 모든 화면을 픽셀 단위로 동일하다고 검증한 상태는 아닙니다.
- **라이선스:** 앱·서버 잠금 파일을 기준으로 네이티브 의존성까지 포함한 생성 목록을 갱신했습니다(843개 패키지, 675개 본문). 원문 파일이 독립 배포되지 않은 패키지는 메타데이터·발견한 헤더·표준 약관의 출처를 구분합니다. 수집 범위와 한계는 [라이선스 생성 기록](native-license-notices.md)에 명시되어 있으며 의존성을 바꾸면 목록을 다시 생성해야 합니다.

## 검증 범위

개발 중 TypeScript 전체 검사를 통과했습니다. ESLint는 현재 개발 의존성에 없어 완료되지 않았습니다. 실제 Auth/Firestore 에뮬레이터에서 앱 서비스와 배포할 규칙을 사용하는 통합 테스트 4개가 통과했습니다. 네이티브 푸시 서버는 네트워크와 Firestore를 대체한 Node 테스트 10개로 큐 생성·중복 이벤트·재시도·수신증 처리·토큰 폐기 경합·계정 삭제를 확인했습니다. 이 검사는 실제 OAuth 로그인, 지도 키 승인, 운영 Firebase 설정, APK/IPA 실행 또는 푸시 실기기 수신을 대신하지 않습니다. 세부 기록은 [검증 문서](verification.md)에 있습니다.
