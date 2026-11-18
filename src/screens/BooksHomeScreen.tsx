import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react-native'
import { Text } from '../components/Typography'
import { Dialog } from '../components/Dialog'
import { Button, IconButton, Notice, Screen, p } from '../components/ui'
import { BookCover } from '../components/book/BookCover'
import { useAuth } from '../hooks/useAuth'
import { deleteBook, listMyBooks } from '../services/bookService'
import { removeBookLocal } from '../services/bookDraftStorage'
import { getBookSpec } from '../lib/book/specs'
import { BOOK_PRICE_KRW, formatWon } from '../lib/book/selection'
import { formatRelativeTime } from '../lib/date'
import type { BookSummary } from '../types/book'

const FACTS: [string, string][] = [
  ['만드는 법', '핀 고르기, 기본 설정, 페이지 꾸미기'],
  ['예상 가격', `${formatWon(BOOK_PRICE_KRW.base)}, 배송비 ${formatWon(BOOK_PRICE_KRW.shipping)}`],
  ['판형', `${getBookSpec('a5-soft').label}, ${getBookSpec('a5-soft').pages.min}~${getBookSpec('a5-soft').pages.max}쪽`],
]

const savedLabel = (ms: number) => (ms ? `${formatRelativeTime({ toMillis: () => ms })} 저장` : '방금 저장')

export default function BooksHomeScreen() {
  const { currentUser } = useAuth()
  const uid = currentUser?.uid ?? ''
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<BookSummary | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(() => {
    if (!uid) return () => undefined
    let active = true
    listMyBooks(uid)
      .then(next => { if (active) { setBooks(next); setError('') } })
      .catch(() => { if (active) setError('내 책을 불러오지 못했어요.') })
    return () => { active = false }
  }, [uid])
  // Back from the editor, the list shows the latest titles and save times.
  useFocusEffect(load)

  const closeMenu = () => { setMenu(null); setConfirming(false); setDeleteError('') }
  const remove = (book: BookSummary) => {
    setDeleting(true)
    deleteBook(book.id)
      .then(() => {
        setBooks(current => current?.filter(item => item.id !== book.id) ?? null)
        void removeBookLocal(uid, book.id).catch(() => undefined)
        closeMenu()
      })
      .catch(() => setDeleteError('책을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.'))
      .finally(() => setDeleting(false))
  }

  return <Screen back title="내 책" maxWidth={640}>
    <View style={styles.intro}>
      <Text accessibilityRole="header" style={styles.heading}>내 핀으로 만드는 A5 책</Text>
      <Text style={styles.lead}>고른 기록의 사진과 글을 페이지에 직접 배치해 한 권의 책으로 엮어요.</Text>
      <View>
        {FACTS.map(([label, value]) => <View key={label} style={styles.fact}>
          <Text style={styles.factLabel}>{label}</Text>
          <Text style={styles.factValue}>{value}</Text>
        </View>)}
      </View>
      <Button title="새 책 만들기" icon={<Plus size={18} color={p.paper} />} onPress={() => router.push('/books/new')} />
    </View>

    <Text accessibilityRole="header" style={styles.section}>내 책</Text>
    {!!error && <Notice error>{error}</Notice>}
    {!!error && <Button variant="secondary" title="다시 불러오기" onPress={() => { setError(''); load() }} />}
    {!books && !error && <ActivityIndicator color={p.primary} style={{ marginTop: 16 }} />}
    {books?.length === 0 && <Text style={styles.empty}>아직 만든 책이 없어요.</Text>}
    {books && books.length > 0 && <View>
      {books.map(book => <View key={book.id} style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${book.title || '제목 없는 책'} 이어서 편집`}
          accessibilityActions={[{ name: 'delete', label: '삭제' }]}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') { setMenu(book); setConfirming(true) } }}
          onPress={() => router.push({ pathname: '/books/[bookId]/edit', params: { bookId: book.id } })}
          onLongPress={() => setMenu(book)}
          style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
          <BookCover coverStyle={book.coverStyle} title={book.title} photo={book.coverPhoto} width={52} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={styles.title}>{book.title || '제목 없는 책'}</Text>
            <Text numberOfLines={1} style={styles.meta}>{getBookSpec(book.specId).label} · {book.pageCount}쪽 · 기록 {book.recordCount}개</Text>
            <Text numberOfLines={1} style={styles.status}>작성 중 · {savedLabel(book.updatedAtMs)}</Text>
          </View>
          <ChevronRight size={19} color={p.muted} />
        </Pressable>
        <IconButton label={`${book.title || '제목 없는 책'} 더보기`} onPress={() => setMenu(book)}><MoreHorizontal size={20} color={p.muted} /></IconButton>
      </View>)}
    </View>}

    <Dialog visible={!!menu} title={menu?.title || '제목 없는 책'} onClose={closeMenu} busy={deleting}>
      {!!deleteError && <Notice error>{deleteError}</Notice>}
      {confirming
        ? <>
          <Text style={styles.body}>이 책과 꾸민 페이지가 모두 지워져요. 핀과 기록은 그대로 남아요.</Text>
          <View style={styles.actions}>
            <Button variant="secondary" title="취소" disabled={deleting} onPress={closeMenu} />
            <Button variant="danger" title="삭제" loading={deleting} onPress={() => menu && remove(menu)} />
          </View>
        </>
        : <View>
          <Pressable accessibilityRole="button" onPress={() => { const book = menu; closeMenu(); if (book) router.push({ pathname: '/books/[bookId]/edit', params: { bookId: book.id } }) }} style={styles.menuRow}>
            <Text style={styles.menuText}>이어서 편집</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.menuRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.menuText, { color: p.danger }]}>책 삭제</Text>
          </Pressable>
        </View>}
    </Dialog>
  </Screen>
}

const styles = StyleSheet.create({
  intro: { gap: 14 },
  heading: { fontSize: 22, fontWeight: '700', color: p.ink, letterSpacing: -0.4 },
  lead: { fontSize: 15, lineHeight: 23, color: p.muted },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  factLabel: { width: 76, fontSize: 14, color: p.muted },
  factValue: { flex: 1, fontSize: 14, color: p.ink },
  section: { fontSize: 17, fontWeight: '700', color: p.ink, marginTop: 28, marginBottom: 4 },
  empty: { fontSize: 15, color: p.muted, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: p.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowText: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '600', color: p.ink },
  meta: { fontSize: 13, color: p.muted },
  status: { fontSize: 13, color: p.primary },
  body: { fontSize: 15, lineHeight: 23, color: p.ink },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  menuRow: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: p.line },
  menuText: { fontSize: 15, color: p.ink },
})
