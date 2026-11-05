import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const symbol = require('../../assets/spotit/brand-symbol.png');
const wordmark = require('../../assets/spotit/brand-wordmark.png');
const sizes = {
  header: { symbolHeight: 32, wordmarkWidth: 80, gap: 8 },
  auth: { symbolHeight: 36, wordmarkWidth: 92, gap: 9 },
  hero: { symbolHeight: 76, wordmarkWidth: 196, gap: 18 },
} as const;

type BrandLogoProps = {
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
  accessible?: boolean;
};

export function BrandLogo({ size = 'header', style, accessible = true }: BrandLogoProps) {
  const { symbolHeight, wordmarkWidth, gap } = sizes[size];
  return <View accessible={accessible} accessibilityRole="image" accessibilityLabel="피노리" style={[styles.lockup, { gap }, style]}>
    <Image accessible={false} source={symbol} resizeMode="contain" style={{ width: symbolHeight * 473 / 553, height: symbolHeight }} />
    <Image accessible={false} source={wordmark} resizeMode="contain" style={{ width: wordmarkWidth, height: wordmarkWidth * 390 / 1586 }} />
  </View>;
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
});
