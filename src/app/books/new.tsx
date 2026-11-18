import { AuthGate } from '../../components/AuthGate';
import BookCreateScreen from '../../screens/BookCreateScreen';

export default function Route() {
  return <AuthGate><BookCreateScreen /></AuthGate>;
}
