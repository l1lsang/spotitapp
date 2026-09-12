import {AuthGate} from '../components/AuthGate';
import {NotificationsScreen as Page} from '../screens/OperationsScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
