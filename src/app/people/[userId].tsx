import {AuthGate} from '../../components/AuthGate';
import {PersonProfileScreen as Page} from '../../screens/ProfileScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
