import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { p } from './ui';

/** Dimensions and shape from the web app's .daymark-map-pin. */
export function PostPin({ color, count = 1, selected = false }: { color: string; count?: number; selected?: boolean }) {
  const cluster = count > 1;
  return <View collapsable={false} style={styles.frame}>
    <View style={[styles.pin, { backgroundColor: color }, cluster && styles.cluster, selected && styles.selected]}>
      {cluster ? <Text style={styles.count}>+{count}</Text> : <View style={styles.dot} />}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { minWidth: 64, height: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  pin: { width: 34, height: 34, borderWidth: 3, borderColor: p.paper, borderTopLeftRadius: 99, borderTopRightRadius: 99, borderBottomRightRadius: 99, borderBottomLeftRadius: 4, transform: [{ rotate: '-45deg' }], alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px #25282433' },
  dot: { width: 10, height: 10, borderRadius: 99, backgroundColor: p.paper },
  cluster: { minWidth: 44, width: 'auto', height: 44, paddingHorizontal: 9, borderRadius: 99, borderBottomLeftRadius: 99, transform: [] },
  count: { color: p.paper, fontSize: 15, fontWeight: '900' },
  selected: { outlineWidth: 3, outlineColor: p.primary, outlineOffset: 3 },
});
