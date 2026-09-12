import {AuthGate} from '../../components/AuthGate';
import Page from '../../screens/PeopleScreen';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
