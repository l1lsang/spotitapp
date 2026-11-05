# 피노리 스토어 등록 이미지

Figma `02 · 모바일` 페이지의 화면을 바탕으로 만들었고, 화면 상단의 예전 Spotit 로고는 PINORI 로고로 바꿨습니다.

## App Store Connect

| 항목 | 파일 | 규격 |
| --- | --- | --- |
| 앱 아이콘 | `app-store/app-icon-1024.png` | 1024×1024 PNG, 투명도 없음 |
| iPhone 6.3" 스크린샷 (필수) | `app-store/iphone-6.3/01~06` | 1206×2622 |
| iPhone 6.9" 스크린샷 | `app-store/iphone-6.9/01~06` | 1290×2796 |
| iPhone 6.5" 스크린샷 | `app-store/iphone-6.5/01~06` | 1242×2688 |
| iPad 13" 스크린샷 (필수) | `app-store/ipad-13/01~06` | 2064×2752 |

App Store Connect의 iPhone 칸 이름과 넣을 폴더:

- Dynamic Island (medium) → `iphone-6.3` (필수)
- Dynamic Island (large) → `iphone-6.9`
- Face ID (large) → `iphone-6.5` (Dynamic Island (large)를 올리지 않을 때만 필요)

크기가 다른 칸에 올리면 "규격이 맞지 않는다"는 오류가 납니다.

iPad 이미지는 앱을 iPad 13" 크기(1032×1376pt, 2배율)로 실제 실행해 데모 데이터로 찍었습니다. 넓은 화면에서는 하단 탭 대신 상단 메뉴가 나오는 등 레이아웃이 달라서, 휴대폰 화면을 늘려 쓰지 않았습니다. iPad 순서: 지도, 피드, 기록 상세, 그룹, 채팅, 프로필.

## Google Play Console

| 항목 | 파일 | 규격 |
| --- | --- | --- |
| 앱 아이콘 | `play-store/app-icon-512.png` | 512×512 PNG (32비트) |
| 그래픽 이미지(배너) | `play-store/feature-graphic-1024x500.png` | 1024×500 PNG, 투명도 없음 |
| 휴대전화 스크린샷 | `play-store/phone/01~06` | 1080×1920 (9:16) |

## 스크린샷 순서와 문구

1. 지도 · 다녀온 곳을 지도 위 핀으로
2. 사진으로 기록 · 사진만 올리면 핀이 자동으로
3. 피드 · 내 주변의 장소 이야기
4. 그룹 · 취향이 닮은 사람들과 함께 핀을 모아요
5. 채팅 · 가고 싶은 곳은 바로 공유하세요
6. 프로필 · 나만의 장소가 차곡차곡
