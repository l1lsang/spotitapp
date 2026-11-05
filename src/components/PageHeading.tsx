import { View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Typography';
import { p, s } from './ui';
// Title, then tools; no rule underneath — the content that follows starts the next group.
export function PageHeading({ eyebrow: _eyebrow, title, description, actions, style }: { eyebrow: string; title: string; description?: string; actions?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const wide = width > 640;
  return <View style={[{ gap: 16, paddingBottom: wide ? 24 : 8, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch' }, style]}>
    <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: wide ? 12 : 8 }}><Text accessibilityRole="header" style={[s.title, wide && { fontSize: 36, lineHeight: 46 }]}>{title}</Text>{!!description && <Text style={{ color: p.muted, fontSize: 14, lineHeight: 24 }}>{description}</Text>}</View>
    {!!actions && <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>{actions}</View>}
  </View>;
}
