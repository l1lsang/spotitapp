import {AuthGate} from '../components/AuthGate';
import MyPostsScreen from '../screens/MyPostsScreen';
export default function Route(){return <AuthGate><MyPostsScreen/></AuthGate>;}
