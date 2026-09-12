import {AuthGate} from '../components/AuthGate';
import {SupportScreen as Page} from '../screens/OperationsScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
