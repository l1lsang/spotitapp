import {Tabs} from 'expo-router/js-tabs';
import {Map,List,UsersRound,MessageCircle,User} from 'lucide-react-native';
import {p} from '../../components/ui';
export default function TabLayout(){return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:p.primary,tabBarInactiveTintColor:p.muted,tabBarStyle:{backgroundColor:p.paper,borderTopColor:p.line,paddingTop:8},tabBarLabelStyle:{fontSize:11,fontWeight:'600'}}}>
 <Tabs.Screen name="map" options={{title:'지도',tabBarIcon:({color,size})=><Map size={size} color={color}/>}}/>
 <Tabs.Screen name="feed" options={{title:'피드',tabBarIcon:({color,size})=><List size={size} color={color}/>}}/>
 <Tabs.Screen name="people" options={{title:'사람',tabBarIcon:({color,size})=><UsersRound size={size} color={color}/>}}/>
 <Tabs.Screen name="chats" options={{title:'채팅',tabBarIcon:({color,size})=><MessageCircle size={size} color={color}/>}}/>
 <Tabs.Screen name="profile" options={{title:'프로필',tabBarIcon:({color,size})=><User size={size} color={color}/>}}/>
 </Tabs>;}
