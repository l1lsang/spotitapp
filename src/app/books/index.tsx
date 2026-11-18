import { AuthGate } from '../../components/AuthGate';
import BooksHomeScreen from '../../screens/BooksHomeScreen';

export default function Route() {
  return <AuthGate><BooksHomeScreen /></AuthGate>;
}
