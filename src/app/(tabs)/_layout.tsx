import { Tabs } from 'expo-router/js-tabs';
export default function TabLayout() {
  return <Tabs tabBar={() => null} screenOptions={{ headerShown: false }} />;
}
