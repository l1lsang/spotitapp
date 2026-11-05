import {useEffect} from 'react';
import {useFonts} from 'expo-font';
import '../global.css';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from '../contexts/AuthContext';
import {NotificationListener} from '../components/NotificationListener';
import {AppUpdatePrompt} from '../components/AppUpdatePrompt';
import {BlockedUsersSync} from '../hooks/useBlockedUsers';
import {AppKeyboardProvider} from '../components/keyboard';
import {p} from '../components/ui';
import {FloatingBottomNav, SiteHeader} from '../components/AppChrome';
void SplashScreen.preventAutoHideAsync().catch(() => {});
export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
  });
  useEffect(() => { if (loaded || fontError) void SplashScreen.hideAsync(); }, [loaded, fontError]);
  if (!loaded && !fontError) return null;
  return <GestureHandlerRootView style={{flex:1,backgroundColor:p.bg}}><AppKeyboardProvider><AuthProvider><StatusBar style="dark"/><SiteHeader/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:p.bg},animation:'slide_from_right'}}/><FloatingBottomNav/><NotificationListener/><BlockedUsersSync/><AppUpdatePrompt/></AuthProvider></AppKeyboardProvider></GestureHandlerRootView>;
}
