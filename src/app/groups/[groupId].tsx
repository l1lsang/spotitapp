import {AuthGate} from '../../components/AuthGate';
import {GroupDetailScreen as Page} from '../../screens/GroupScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
