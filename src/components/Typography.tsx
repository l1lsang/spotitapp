import { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { fontFamilies } from '../constants/design';

const WeightContext = createContext<TextStyle['fontWeight']>('400');
function fontStyle(style: TextProps['style'], inherited: TextStyle['fontWeight']) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight ?? inherited;
  if (flat?.fontFamily) return { weight, font: {} };
  const numeric = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight || 400);
  const fontFamily = numeric >= 650 ? fontFamilies.bold : numeric >= 550 ? fontFamilies.semibold : numeric >= 450 ? fontFamilies.medium : fontFamilies.regular;
  // Each static face carries its own weight; avoid synthetic bold on Android.
  return { weight, font: { fontFamily, fontWeight: 'normal' as const } };
}

export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  const inherited = useContext(WeightContext);
  const { weight, font } = fontStyle(style, inherited);
  return <WeightContext.Provider value={weight}><NativeText ref={ref} {...props} style={[style, font]} /></WeightContext.Provider>;
});
export type Text = NativeText;

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const { font } = fontStyle(style, '400');
  return <NativeTextInput ref={ref} {...props} style={[style, font]} />;
});
export type TextInput = NativeTextInput;
