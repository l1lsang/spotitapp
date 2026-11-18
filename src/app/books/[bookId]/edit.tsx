import { useLocalSearchParams } from 'expo-router';
import { AuthGate } from '../../../components/AuthGate';
import { Notice, Screen } from '../../../components/ui';
import BookEditorScreen from '../../../screens/BookEditorScreen';

const BOOK_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default function Route() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const id = typeof bookId === 'string' && BOOK_ID.test(bookId) ? bookId : '';
  return <AuthGate>{id ? <BookEditorScreen key={id} bookId={id} /> : <Screen back title="책 편집"><Notice error>책 주소가 올바르지 않아요.</Notice></Screen>}</AuthGate>;
}
