import FeedScreen from '../screens/FeedScreen';
import {AuthGate} from '../components/AuthGate';
export default function Route(){return <AuthGate><FeedScreen kind="mine"/></AuthGate>;}
