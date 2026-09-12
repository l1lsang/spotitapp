import {AuthGate} from '../../components/AuthGate';
import {ChatRoomScreen as Page} from '../../screens/ChatScreens';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
