# 스팟잇 웹 → 네이티브 화면 대응표

원본: `C:\Users\jkm08\OneDrive\바탕 화면\창업\spotit`의 React/Vite 앱. 앱: `C:\spotit`의 Expo SDK 57 / React Native 앱.

원본의 22개 경로 패턴을 Expo Router 화면으로 옮겼습니다. 화면은 React Native `View`, `Text`, `Pressable`, `Modal`, `FlatList`와 네이티브 지도·사진·공유 기능으로 구현하며 웹 화면을 WebView에 띄우는 방식은 사용하지 않습니다. 정책 인쇄용 문서만 시스템 인쇄기에 전달할 HTML로 생성합니다.

## 경로별 대응

| 원본 경로 | 네이티브 화면 | 연결한 주요 기능 |
| --- | --- | --- |
| `/` | [index.tsx](../src/app/index.tsx) | 앱 첫 화면은 지도. 비로그인 시 지도의 로그인 확인이 로그인 화면으로 보냄(웹의 소개 화면은 제거) |
| `/login` | [AuthScreens.tsx](../src/screens/AuthScreens.tsx), `LoginScreen` | 이메일, Google, Kakao, Apple 로그인, 비밀번호 재설정 |
| `/signup` | [AuthScreens.tsx](../src/screens/AuthScreens.tsx), `SignupScreen` | 사용자 이름 검사, 2단계 가입, 프로필 사진, 필수 동의 |
| `/map` | [MapScreen.tsx](../src/screens/MapScreen.tsx) | 로그인 필요. 전체 화면 장소 검색, 검색 결과 시트, 그룹 범위 시트·칩, 핀 색 안내, 내 위치, 핀/클러스터, 사진으로 기록(EXIF 위치·날짜 → 확인/직접 지정 → 작성) |
| `/feed` | [FeedScreen.tsx](../src/screens/FeedScreen.tsx) | 3열 정사각 그리드, 반경·위치·새로고침, 검색, 다음 페이지 |
| `/feed/:postId` | [FeedDetailScreen.tsx](../src/screens/FeedDetailScreen.tsx) | 누른 기록부터 이어지는 세로 피드, 사진 넘기기, 좋아요·댓글·지도 열기 |
| `/groups` | [GroupScreens.tsx](../src/screens/GroupScreens.tsx), `GroupsScreen` | 공개/내 그룹, 검색, 공개·비공개 생성, 초대코드 가입 |
| `/groups/:groupId` | [GroupScreens.tsx](../src/screens/GroupScreens.tsx), `GroupDetailScreen` | 실시간 그룹/멤버십/핀, 가입·탈퇴, 코드 확인·복사, 공유, 그룹 지도 |
| `/posts/:postId` | [PostDetailScreen.tsx](../src/screens/PostDetailScreen.tsx) | 사진, 공개 범위, 좋아요, 댓글·답글·멘션, 작성자, 지도, 수정·삭제·신고·공유 |
| `/notifications` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `NotificationsScreen` | 실시간 알림, 개별/전체 읽음, 관련 화면 이동, 푸시 설정 |
| `/people` | [PeopleScreen.tsx](../src/screens/PeopleScreen.tsx) | 닉네임/사용자 이름 검색, 프로필 진입·검색어 유지 |
| `/people/:userId` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `PersonProfileScreen` | 타인 프로필, 접근 가능한 핀 그리드, 팔로우·요청, 1:1 대화, 더보기 메뉴의 사용자·사진 신고 |
| `/chats` | [ChatScreens.tsx](../src/screens/ChatScreens.tsx), `ChatListScreen` | 실시간 대화 목록, 읽지 않음, + 버튼의 단체방 만들기·팔로잉 기반 1:1 채팅 시작 |
| `/chats/:chatId` | [ChatScreens.tsx](../src/screens/ChatScreens.tsx), `ChatRoomScreen` | 실시간 메시지·사진·읽은 사람, 친구 초대, 고정·미디어 모음, 대화 점프, 메시지/사진/유저 신고 |
| `/my` | [MyPostsScreen.tsx](../src/screens/MyPostsScreen.tsx) | 공개 범위 필터와 개수, 정사각 그리드, 상세·수정·삭제 진입 |
| `/profile` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `ProfileScreen` | 핀·팔로워·팔로잉 수, 프로필 편집, 핀/좋아요 탭(`?tab=likes`) |
| `/profile/settings` | [ProfileScreens.tsx](../src/screens/ProfileScreens.tsx), `ProfileSettingsScreen` | 프로필 편집, 공개 범위, 팔로워/팔로잉·요청, 핀 테마, 로그아웃·탈퇴 |
| `/profile/likes` | [likes.tsx](../src/app/profile/likes.tsx) | 프로필 좋아요 탭으로 이동 |
| `/support` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `SupportScreen` | 문의 제출, 내 신고·문의와 답변 |
| `/admin` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `AdminScreen` | 관리자 인증, 통계, 신고·문의 필터/처리, 핀 숨김·복구, 사용자 검색/정지 |
| `/licenses` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `LicensesScreen` | 라이선스 검색, 사용 범위, 원문 |
| `/policies/:policyId?` | [OperationsScreens.tsx](../src/screens/OperationsScreens.tsx), `PoliciesScreen` | 정책 목록 및 5종 본문, 목차·섹션 이동, 링크, 시스템 인쇄 |

핀 작성·수정 모달은 앱의 `/posts/new`, `/posts/edit` 경로와 [PostFormScreen.tsx](../src/screens/PostFormScreen.tsx)로 분리했습니다. 지도에서 연 작성은 저장 후 지도로 돌아가 새 핀을 보여 줍니다. 사진으로 기록은 [photoRecordBridge.ts](../src/lib/photoRecordBridge.ts)로 선택한 사진·위치·촬영일을 작성 화면에 넘기며, 작성 화면의 **위치 변경**은 지도 위치 조정 단계로 돌아갑니다. 사진 편집은 [PhotoEditor.tsx](../src/components/PhotoEditor.tsx)의 이동·확대·비율 자르기·회전·반전을 공유합니다. 지도·피드·사람·채팅·프로필의 다섯 하단 탭은 유지합니다.

## 데이터와 접근 범위

Firebase 사용자·핀·댓글·그룹·채팅·신고 서비스와 자료형을 재사용합니다. 앱 환경변수에 같은 Firebase 프로젝트를 지정하면 웹에서 쓰던 계정과 데이터를 공유합니다. 그룹 가입과 비공개 핀 접근, 채팅 참여자, 관리자 기능은 기존 Firestore 규칙과 서버 함수가 최종 권한을 판단합니다. 로컬 목업 데이터는 사용하지 않습니다.

개인 데이터 화면은 로그인 상태를 확인하고, 채팅방 메시지는 참여 가능한 방 정보를 확인한 뒤 구독합니다. 그룹 탈퇴 시 해당 비공개 그룹 문서 구독을 정리하고, 채팅 읽음 기록은 화면이 활성화되어 있을 때 갱신합니다. 네이티브 푸시는 웹 FCM 토큰과 다른 `expoPushTokens` 컬렉션을 사용합니다.

## 플랫폼 차이와 필요한 설정

- **지도:** 국내·해외 모두 `react-native-maps`의 Google 제공자를 사용하고 웹은 Google Maps JavaScript API를 사용합니다. 핀·클러스터·현재 위치를 표시하며 선택한 핀으로 외부 길찾기를 엽니다. [지도 설정](native-map-setup.md)을 참고하세요.
- **장소 검색:** Firebase `searchMapPlaces` callable 함수가 Google Places Text Search를, `searchNearbyMapPlaces`가 사진 위치 주변 장소 추천을 호출합니다. 웹과 같은 `google:` ID를 사용합니다. 기존 장소 ID와 저장된 기록은 임의로 변환하지 않습니다.
- **소셜 로그인:** 네이티브 Google/Kakao SDK와 플랫폼별 앱 등록을 사용합니다. [네이티브 인증 설정](native-auth-setup.md)의 클라이언트 ID·리디렉션·키 해시·OIDC 설정을 완료하고 개발/배포 빌드에서 확인해야 합니다. 이메일 로그인은 Expo Go에서도 사용할 수 있습니다.
- **푸시:** 앱 화면의 알림 목록은 기존 Firestore 데이터를 사용합니다. 잠금 화면/백그라운드 푸시는 EAS 프로젝트·APNs/FCM 인증서·실기기와 [추가 서버 설정](../backend/README.md)이 필요합니다. 서버 코드 작성 및 로컬 테스트와 운영 서버 배포·실기기 수신 검증은 별도 상태입니다.
- **사진:** 네이티브 사진 선택기·편집기를 사용하며 업로드는 JPEG와 썸네일로 처리합니다. GIF 애니메이션·투명도·원본 포맷 보존은 기존 웹 업로드와 다를 수 있습니다.
- **내비게이션/공유:** 앱 내부 경로는 Expo Router로 이동하고 공유 링크의 웹 주소는 `EXPO_PUBLIC_WEB_URL`을 사용합니다. `spotit://` 스킴과 웹 HTTPS 링크의 앱 자동 열기는 서로 다른 설정이며 HTTPS 자동 열기를 위해서는 도메인의 Universal Links/App Links 연결이 필요합니다.
- **표현:** 기존 색상·에셋·주요 화면 구성은 재사용하되 글꼴 렌더링, 네이티브 모달·키보드·공유 시트는 운영체제에 따릅니다. 모든 화면을 픽셀 단위로 동일하다고 검증한 상태는 아닙니다.
- **라이선스:** 앱·서버 잠금 파일을 기준으로 네이티브 의존성까지 포함한 생성 목록을 갱신했습니다(844개 패키지, 675개 본문). 원문 파일이 독립 배포되지 않은 패키지는 메타데이터·발견한 헤더·표준 약관의 출처를 구분합니다. 수집 범위와 한계는 [라이선스 생성 기록](native-license-notices.md)에 명시되어 있으며 의존성을 바꾸면 목록을 다시 생성해야 합니다.

## 검증 범위

TypeScript, 앱 단위 검사, 지도 검색·푸시 서버 검사, 실제 Auth·Firestore·Storage 에뮬레이터 통합 검사를 실행합니다. 테스트 계정의 로그인 → 첫 지도·그룹 선택 → 피드·핀 상세·프로필 흐름도 브라우저 미리보기로 확인했습니다. 운영 Firebase 규칙과 네이티브 지도 SDK 실행은 별도 검증 대상이며 APK 빌드는 실행하지 않았습니다. [최신 검증 기록](verification.md)에 결과와 범위를 정리했습니다.
