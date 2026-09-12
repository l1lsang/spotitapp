import {AuthGate} from '../../components/AuthGate';
import Page from '../../screens/PostFormScreen';
export default function Route(){return <AuthGate><Page/></AuthGate>;}
