import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '../Typography';
import { p } from '../ui';
import { DEFAULT_POST_PIN_COLOR, FOLLOWING_PIN_COLOR } from '../../types/post';

export const controlShadow = { boxShadow: '0 2px 10px #161F1B1F' } as const;

// Secondary map control: icon above a short label on a white tile.
export function MapControlButton({ icon: Icon, label, accessibilityLabel, onPress, disabled = false, busy = false, expanded, style }: {
  icon: LucideIcon; label: string; accessibilityLabel?: string; onPress: () => void;
  disabled?: boolean; busy?: boolean; expanded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy, expanded }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [c.control, controlShadow, pressed && { backgroundColor: p.primarySoft }, style]}>
    {({ pressed }) => <>
      {busy ? <ActivityIndicator size="small" color={p.primary} /> : <Icon size={20} color={pressed ? p.primary : p.ink} />}
      <Text style={[c.controlLabel, pressed && { color: p.primary }]}>{label}</Text>
    </>}
  </Pressable>;
}

// Mini pins drawn like the real markers. Others' pins always share one colour.
export function MapPinLegend({ mineColors, othersLabel }: { mineColors: string[]; othersLabel: string }) {
  const mine = mineColors.length ? mineColors.slice(0, 3) : [DEFAULT_POST_PIN_COLOR];
  return <View accessibilityLabel={`핀 색 안내: 내 핀, ${othersLabel}`} style={[c.legend, controlShadow]}>
    <View style={c.legendItem}><View style={c.legendPins}>{mine.map((color, index) => <View key={index} style={[c.legendPin, { backgroundColor: color }, index > 0 && { marginLeft: -4 }]} />)}</View><Text style={c.legendText}>내 핀</Text></View>
    <View style={[c.legendItem, c.legendDivider]}><View style={c.legendPins}><View style={[c.legendPin, { backgroundColor: FOLLOWING_PIN_COLOR }]} /></View><Text style={c.legendText}>{othersLabel}</Text></View>
  </View>;
}

const c = StyleSheet.create({
  control: { width: 52, height: 52, gap: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 14, backgroundColor: p.paper },
  controlLabel: { color: p.ink, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  legend: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 12, minHeight: 40, paddingVertical: 6, paddingLeft: 12, paddingRight: 14, borderWidth: 1, borderColor: p.line, borderRadius: 999, backgroundColor: p.paper },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDivider: { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: p.line },
  legendPins: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  legendPin: { width: 14, height: 14, borderWidth: 2, borderColor: p.paper, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomRightRadius: 999, borderBottomLeftRadius: 2, transform: [{ rotate: '-45deg' }], boxShadow: '0 1px 3px #161F1B4D' },
  legendText: { color: p.ink, fontSize: 13, fontWeight: '600' },
});
