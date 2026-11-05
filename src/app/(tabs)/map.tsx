import {AuthGate} from '../../components/AuthGate';
import Page from '../../screens/MapScreen';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
