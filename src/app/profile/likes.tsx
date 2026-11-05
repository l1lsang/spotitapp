import {Redirect} from 'expo-router';
// Liked pins now live in the profile's 좋아요 tab.
export default function Route(){return <Redirect href={{pathname:'/profile',params:{tab:'likes'}}}/>;}
