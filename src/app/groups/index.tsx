import {AuthGate} from '../../components/AuthGate';
import {GroupsScreen as Page} from '../../screens/GroupScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
