import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Typography';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useIsFocused, usePathname } from 'expo-router';
import { Bell, List, LogIn, Map, MessageCircle, User, UsersRound } from 'lucide-react-native';
import { useAuth } from '../hooks/useAuth';
import { subscribeToUnreadNotificationCount } from '../services/notificationService';
import { BrandLogo } from './BrandLogo';
import { useKeyboardVisible } from './keyboard';
import { p } from './ui';

const items = [
  { path: '/map', label: '지도', Icon: Map },
  { path: '/feed', label: '피드', Icon: List },
  { path: '/people', label: '사람', Icon: UsersRound },
  { path: '/chats', label: '채팅', Icon: MessageCircle },
  { path: '/profile', label: '프로필', Icon: User },
] as const;
// Map bottom sheets take the tab bar's place while they are the task on screen.
const navHiders = new Set<string>();
const navListeners = new Set<() => void>();
function notifyNav() { navListeners.forEach(listener => listener()); }
function subscribeNav(listener: () => void) { navListeners.add(listener); return () => { navListeners.delete(listener); }; }
const readNavHidden = () => navHiders.size > 0;
export function useHideBottomNav(key: string, hidden: boolean) {
  const focused = useIsFocused();
  const active = hidden && focused;
  useEffect(() => {
    if (!active) return;
    navHiders.add(key); notifyNav();
    return () => { navHiders.delete(key); notifyNav(); };
  }, [key, active]);
}
export function useAppChrome() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const navHidden = useSyncExternalStore(subscribeNav, readNavHidden, () => false);
  const authPage = ['/', '/login', '/signup'].includes(pathname);
  const chatRoom = /^\/chats\/.+/.test(pathname);
  const form = pathname === '/posts/new' || pathname === '/posts/edit';
  // The detail feed brings its own top bar on phones.
  const feedDetail = /^\/feed\/.+/.test(pathname) && width <= 860;
  return { pathname, header: !authPage && !chatRoom && !form && !feedDetail, tabs: !authPage && !chatRoom && !form && !navHidden };
}
function activeTab(pathname: string, path: string) {
  if (path === '/map') return pathname === '/map' || pathname.startsWith('/groups');
  if (path === '/profile' && pathname === '/my') return true;
  return pathname === path || pathname.startsWith(path + '/');
}
export function SiteHeader() {
  const { pathname, header } = useAppChrome();
  const { currentUser, profile, accountReady: firebaseReady } = useAuth();
  const { width } = useWindowDimensions();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    if (!currentUser || !firebaseReady) return;
    return subscribeToUnreadNotificationCount(currentUser.uid, setUnread, () => setUnread(0));
  }, [currentUser?.uid, firebaseReady]);
  if (!header) return null;
  return <SafeAreaView edges={['top']} style={{ backgroundColor: p.bg }}><View style={[styles.header, width > 860 && { minHeight: 80, paddingHorizontal: 40 }]}>
    <Pressable accessibilityRole="link" accessibilityLabel="피노리 지도 홈" onPress={() => router.push('/map')} style={styles.brandLink}>
      <BrandLogo accessible={false} />
    </Pressable>
    {width > 1000 && <Text style={{ color: p.muted, fontSize: 12, marginRight: 'auto', marginLeft: 32 }}>오늘, 이곳.</Text>}
    <View style={styles.headerLinks}>
      {width > 860 && items.filter(item => currentUser || item.path === '/map' || item.path === '/feed').map(item =>
        <Pressable key={item.path} accessibilityRole="link" onPress={() => router.push(item.path)} style={[styles.headerLink, activeTab(pathname, item.path) && styles.headerActive]}>
          <Text numberOfLines={1} style={[styles.headerText, activeTab(pathname, item.path) && { color: p.primary, fontWeight: '700' }]}>{item.path === '/profile' ? profile?.nickname || '프로필' : item.label}</Text>
        </Pressable>)}
      {!currentUser && <Pressable accessibilityRole="link" onPress={() => router.push('/login')} style={[styles.headerLink, styles.login]}><LogIn size={16} color={p.primary} /><Text style={{ color: p.primary }}>로그인</Text></Pressable>}
      {currentUser && <Pressable accessibilityRole="link" accessibilityLabel={unread ? `알림 ${unread}개` : '알림'} onPress={() => router.push('/notifications')} style={styles.bell}>
        <Bell size={19} color={p.muted} />{unread > 0 && <Text style={styles.badge}>{unread > 99 ? '99+' : unread}</Text>}
      </Pressable>}
    </View>
  </View></SafeAreaView>;
}
export function FloatingBottomNav() {
  const { pathname, tabs } = useAppChrome();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { width } = useWindowDimensions();
  if (!tabs || keyboardVisible || width > 860) return null;
  return <View pointerEvents="box-none" style={styles.navPosition}>
    <View accessibilityLabel="하단 탭 메뉴" style={[styles.nav, { paddingBottom: Math.max(6, insets.bottom) }]}>
      {items.map(({ path, label, Icon }) => {
        const selected = activeTab(pathname, path);
        return <Pressable key={path} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => router.navigate(path)} style={styles.tab}>
          <View style={[styles.tabIcon, selected && styles.active]}><Icon size={20} color={selected ? p.primary : p.muted} /></View><Text style={[styles.tabLabel, selected && { color: p.primary, fontWeight: '700' }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLink: { minHeight: 44, justifyContent: 'center' },
  headerLinks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, maxWidth: 160, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: p.transparent },
  headerActive: { borderBottomColor: p.primary }, login: { borderWidth: 1, borderBottomWidth: 1, borderColor: p.line, borderRadius: 6, backgroundColor: p.paper },
  headerText: { fontSize: 14, color: p.muted, flexShrink: 1 }, bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: -2, backgroundColor: p.primary, color: p.paper, borderRadius: 12, borderWidth: 2, borderColor: p.paper, paddingHorizontal: 5, fontSize: 10, fontWeight: '700' },
  navPosition: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  nav: { width: '100%', flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8, backgroundColor: p.paper, borderTopWidth: 1, borderColor: p.line },
  tab: { flex: 1, minHeight: 52, paddingVertical: 4, gap: 4, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { width: 48, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  tabLabel: { fontSize: 11, fontWeight: '500', color: p.muted }, active: { backgroundColor: p.primarySoft },
});
