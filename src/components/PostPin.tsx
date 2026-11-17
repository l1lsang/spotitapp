import { Image, StyleSheet, View } from 'react-native';
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

export const PHOTO_PIN_SIZE = 48;

// A record with a photo shows it as a square pin framed in the pin color.
// The marker anchors at its bottom center, so the tail tip is the record's position.
export function PostPhotoPin({ uri, color, selected = false, onLoad }: { uri: string; color: string; selected?: boolean; onLoad?: () => void }) {
  return <View collapsable={false} style={styles.photoFrame}>
    <View style={[styles.photoRing, selected && styles.photoRingSelected]}>
      <View style={[styles.photoBox, { borderColor: color }]}>
        <Image source={{ uri }} onLoad={onLoad} onError={onLoad} resizeMode="cover" fadeDuration={0} style={styles.photo} />
      </View>
    </View>
    <View style={[styles.tail, { borderTopColor: color }]} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { minWidth: 64, height: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  pin: { width: 34, height: 34, borderWidth: 3, borderColor: p.paper, borderTopLeftRadius: 99, borderTopRightRadius: 99, borderBottomRightRadius: 99, borderBottomLeftRadius: 4, transform: [{ rotate: '-45deg' }], alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px #25282433' },
  dot: { width: 10, height: 10, borderRadius: 99, backgroundColor: p.paper },
  cluster: { minWidth: 44, width: 'auto', height: 44, paddingHorizontal: 9, borderRadius: 99, borderBottomLeftRadius: 99, transform: [] },
  count: { color: p.paper, fontSize: 15, fontWeight: '900' },
  selected: { outlineWidth: 3, outlineColor: p.primary, outlineOffset: 3 },
  // Room on the sides and top keeps the ring and shadow inside the marker snapshot.
  photoFrame: { paddingTop: 6, paddingHorizontal: 6, alignItems: 'center' },
  photoRing: { padding: 2, borderRadius: 10, borderWidth: 2, borderColor: p.transparent },
  photoRingSelected: { borderColor: p.primary },
  photoBox: { width: PHOTO_PIN_SIZE, height: PHOTO_PIN_SIZE, borderWidth: 3, borderRadius: 6, overflow: 'hidden', backgroundColor: p.surface, boxShadow: '0 4px 10px #161F1B47' },
  photo: { width: '100%', height: '100%' },
  tail: { width: 0, height: 0, marginTop: -1, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8, borderLeftColor: p.transparent, borderRightColor: p.transparent },
});
