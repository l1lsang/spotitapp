import {useEffect} from 'react';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from '../contexts/AuthContext';
import {NotificationListener} from '../components/NotificationListener';
import {p} from '../components/ui';
export default function RootLayout(){useEffect(()=>{void SplashScreen.hideAsync();},[]);return <GestureHandlerRootView style={{flex:1,backgroundColor:p.bg}}><AuthProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:p.bg},animation:'slide_from_right'}}/><NotificationListener/></AuthProvider></GestureHandlerRootView>;}
