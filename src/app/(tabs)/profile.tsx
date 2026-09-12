import {AuthGate} from '../../components/AuthGate';
import {ProfileScreen as Page} from '../../screens/ProfileScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
