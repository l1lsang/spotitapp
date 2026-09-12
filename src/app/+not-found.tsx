import {router} from 'expo-router';
import {Screen,Empty,Button} from '../components/ui';
export default function NotFound(){return <Screen><Empty title="페이지를 찾을 수 없어요"/><Button title="지도로 돌아가기" onPress={()=>router.replace('/map')}/></Screen>;}
