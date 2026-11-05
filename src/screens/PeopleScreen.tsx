import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../components/Typography';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { Avatar, Button, Notice, Screen, SearchBox, p, s } from '../components/ui';
import { usePeopleSearch } from '../hooks/usePeopleSearch';
export default function PeopleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [keyword, setKeyword] = useState(params.q || '');
  const { people: filtered, loading, error, searching, retry } = usePeopleSearch(keyword);
  const status = { ...s.muted, fontSize: 14, lineHeight: 25, textAlign: 'center' as const, paddingVertical: 32 };
  // Search sits right under the header. Without a query it lists the people you follow.
  return <Screen refreshing={loading && !searching} onRefresh={retry} contentStyle={{ paddingTop: 24 }}>
    <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', gap: 18 }}>
      <SearchBox value={keyword} onChangeText={value => { setKeyword(value); router.setParams({ q: value }); }} placeholder="사용자 이름 또는 닉네임 검색" accessibilityLabel="사용자 검색" autoCapitalize="none" autoCorrect={false} />
      {!!error && <View style={{ gap: 10 }}><Notice error>{error}</Notice><Button title="다시 시도" icon={<RefreshCw size={17} color={p.ink} />} variant="secondary" disabled={loading} onPress={retry} /></View>}
      {!searching && !loading && !error && filtered.length > 0 && <Text accessibilityLiveRegion="polite" style={{ ...s.muted, fontSize: 13.6 }}>팔로잉 {filtered.length}명 · 다른 사람은 닉네임이나 @사용자 이름으로 찾아보세요.</Text>}
      {loading && <Text style={status}>{searching ? '사람을 찾는 중입니다.' : '사람들을 불러오는 중입니다.'}</Text>}
      {!loading && !error && !filtered.length && <Text style={status}>{searching ? '검색된 사용자가 없습니다.' : '아직 팔로우하는 사람이 없습니다. 닉네임이나 @사용자 이름으로 찾아보세요.'}</Text>}
      {!loading && filtered.length > 0 && <View accessibilityLabel="사용자 목록">{filtered.map(user => <Pressable key={user.uid} accessibilityRole="link" accessibilityLabel={(user.nickname || '사용자') + (user.username ? ' (@' + user.username + ')' : '') + ' 프로필 보기'} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: user.uid, from: '/people?q=' + encodeURIComponent(keyword) } })} style={({ pressed }) => [s.row, { minHeight: 92, paddingVertical: 14, gap: 14 }, pressed && { backgroundColor: p.surface }]}>
        <Avatar uri={user.photoURL} name={user.nickname} size={48} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: p.ink, fontSize: 16, fontWeight: '600' }}>{user.nickname || '피노리 사용자'}</Text>{!!user.username && <Text style={{ color: p.muted, fontSize: 13.6 }}>@{user.username}</Text>}</View>
      </Pressable>)}</View>}
    </View>
  </Screen>;
}
