import { Redirect } from 'expo-router';
// The app opens on the map; the map's login gate sends signed-out visitors to the login screen.
export default function Route() { return <Redirect href="/map" />; }
