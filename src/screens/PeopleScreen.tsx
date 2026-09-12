import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { LockKeyhole, Search, UsersRound } from 'lucide-react-native'
import { Avatar, Button, Empty, Field, Notice, Screen, p } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { invalidateAppReads } from '../lib/readCache'
import { cancelFollowRequest, followUser, getFollowingIds, getOutgoingFollowRequestIds, unfollowUser } from '../services/followService'
import { listUsers } from '../services/userService'
import type { DaymarkUser } from '../types/user'

export default function PeopleScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const { currentUser, profile, firebaseReady } = useAuth()
  const [keyword, setKeyword] = useState(params.q || '')
  const [users, setUsers] = useState<DaymarkUser[]>([])
  const [following, setFollowing] = useState<string[]>([])
  const [pending, setPending] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useFocusEffect(useCallback(() => {
    if (!firebaseReady || !currentUser) { setLoading(false); return }
    let active = true
    setLoading(true)
    setError('')
    Promise.all([listUsers(), getFollowingIds(currentUser.uid), getOutgoingFollowRequestIds(currentUser.uid)])
      .then(([people, ids, requests]) => {
        if (!active) return
        setUsers(people.filter(user => user.uid !== currentUser.uid))
        setFollowing(ids)
        setPending(requests)
      })
      .catch(e => { if (active) setError(message(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentUser?.uid, firebaseReady, revision]))

  const filtered = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase().replace(/^@/, '')
    return users.filter(user => !query || `${user.nickname} ${user.username || ''}`.toLocaleLowerCase().includes(query))
  }, [keyword, users])

  async function toggleFollow(user: DaymarkUser) {
    if (!profile || busy) return
    setBusy(user.uid)
    setError('')
    try {
      if (following.includes(user.uid)) {
        await unfollowUser(profile.uid, user.uid)
        setFollowing(ids => ids.filter(id => id !== user.uid))
      } else if (pending.includes(user.uid)) {
        await cancelFollowRequest(profile.uid, user.uid)
        setPending(ids => ids.filter(id => id !== user.uid))
      } else {
        const result = await followUser(profile, user)
        if (result === 'requested') setPending(ids => [...ids, user.uid])
        else setFollowing(ids => [...ids, user.uid])
      }
      invalidateAppReads()
    } catch (e) { setError(message(e)) }
    finally { setBusy('') }
  }

  return <Screen title="사람 찾기" refreshing={loading} onRefresh={() => { invalidateAppReads(); setRevision(value => value + 1) }}>
    <View style={styles.intro}><UsersRound color={p.primary} size={27} /><Text style={styles.description}>마음이 통하는 사람들과{ '\n' }좋아하는 장소를 나눠 보세요.</Text></View>
    <View style={styles.search}><Search color={p.muted} size={20} /><View style={{ flex: 1 }}><Field value={keyword} onChangeText={setKeyword} placeholder="사용자 이름 또는 닉네임 검색" accessibilityLabel="사용자 검색" autoCapitalize="none" returnKeyType="search" /></View></View>
    {error ? <Notice error>{error}</Notice> : null}
    {!currentUser ? <><Empty title="친구를 만나 보세요" description="로그인하면 사람을 검색하고 팔로우할 수 있어요." /><Button title="로그인" onPress={() => router.push('/login')} /></> : null}
    {loading ? <ActivityIndicator color={p.primary} style={{ margin: 20 }} /> : null}
    {currentUser && !loading && !error && !filtered.length ? <Empty title="검색된 사용자가 없습니다" description="다른 닉네임이나 사용자 이름을 입력해 보세요." /> : null}
    {filtered.map(user => <View key={user.uid} style={styles.card}>
      <Pressable style={styles.identity} accessibilityRole="button" accessibilityLabel={`${user.nickname} 프로필 보기`} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: user.uid } })}>
        <Avatar uri={user.photoURL} name={user.nickname} size={49} />
        <View style={{ flex: 1, gap: 3 }}><View style={styles.nameRow}><Text style={styles.name}>{user.nickname}</Text>{user.isPrivate ? <LockKeyhole size={13} color={p.muted} /> : null}</View><Text style={styles.username}>@{user.username || 'spotit'}</Text>{user.bio ? <Text numberOfLines={2} style={styles.bio}>{user.bio}</Text> : null}</View>
      </Pressable>
      <Button title={following.includes(user.uid) ? '팔로잉' : pending.includes(user.uid) ? '요청 취소' : '팔로우'} variant={following.includes(user.uid) || pending.includes(user.uid) ? 'secondary' : 'primary'} loading={busy === user.uid} disabled={Boolean(busy) || !profile} onPress={() => void toggleFollow(user)} />
    </View>)}
  </Screen>
}

function message(error: unknown) { return error instanceof Error ? error.message : '사용자 정보를 불러오지 못했습니다. 다시 시도해 주세요.' }

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 15, marginVertical: 12 },
  description: { fontSize: 15, color: p.muted, lineHeight: 23 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 19, borderColor: p.line, borderWidth: 1, backgroundColor: p.paper, marginBottom: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 16, fontWeight: '700', color: p.ink, flexShrink: 1 },
  username: { fontSize: 12, color: p.muted },
  bio: { fontSize: 12, lineHeight: 17, color: p.muted },
})
