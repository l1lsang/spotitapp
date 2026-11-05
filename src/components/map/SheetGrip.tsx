import { useMemo, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { ChevronUp } from 'lucide-react-native';
import { Text } from '../Typography';
import { p } from '../ui';

const SWIPE_DISTANCE = 20;

// The handle on top of a map bottom sheet: tap it or swipe down to shrink the
// sheet to one line so the map shows, tap or swipe up to bring it back.
// `onChange` should be a state setter so the swipe handler stays stable.
export function SheetGrip({ minimized, onChange, label }: { minimized: boolean; onChange: (minimized: boolean) => void; label: string }) {
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > SWIPE_DISTANCE) onChange(true);
      else if (gesture.dy < -SWIPE_DISTANCE) onChange(false);
    },
  }), [onChange]);
  return <Pressable {...swipe.panHandlers} accessibilityRole="button" accessibilityLabel={minimized ? `${label} 펼치기` : `${label} 최소화`}
    accessibilityHint={minimized ? '위로 쓸어올려도 펼쳐져요' : '아래로 쓸어내려도 줄어들어요'} accessibilityState={{ expanded: !minimized }}
    onPress={() => onChange(!minimized)} hitSlop={{ top: 12, bottom: 8, left: 48, right: 48 }} style={g.grip}>
    <View style={g.bar} />
  </Pressable>;
}

// The one line a minimized sheet keeps: what it is about, and the way back.
export function MinimizedSheetRow({ title, detail, leading, trailing, onExpand }: {
  title: string; detail?: string; leading?: ReactNode; trailing?: ReactNode; onExpand: () => void;
}) {
  return <View style={g.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} 펼치기`} onPress={onExpand} style={({ pressed }) => [g.main, pressed && { opacity: 0.6 }]}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={g.title}>{title}</Text>
        {!!detail && <Text numberOfLines={1} style={g.detail}>{detail}</Text>}
      </View>
      <ChevronUp size={18} color={p.muted} />
    </Pressable>
    {trailing}
  </View>;
}

const g = StyleSheet.create({
  grip: { alignSelf: 'center', width: 72, height: 16, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 40, height: 4, borderRadius: 2, backgroundColor: p.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  main: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: p.ink, fontSize: 16, fontWeight: '600' },
  detail: { color: p.muted, fontSize: 12.5, marginTop: 2 },
});
