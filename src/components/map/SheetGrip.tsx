import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native';
import { p } from '../ui';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.6;

// Dragging a bottom sheet's grip moves the sheet with the finger; letting go far or fast
// enough slides it away and runs `onDismiss`, the same action as the sheet's back button.
// A sheet that is still shown afterwards (the back action only stepped back) slides back in.
export function useSheetDismiss(onDismiss: () => void) {
  const [translateY] = useState(() => new Animated.Value(0));
  // Read only while a gesture runs, never during render.
  const live = useRef({ height: 0, mounted: true, onDismiss });
  useEffect(() => { live.current.onDismiss = onDismiss; }, [onDismiss]);
  useEffect(() => { const state = live.current; state.mounted = true; return () => { state.mounted = false; }; }, []);
  // The handlers read `live` only during a gesture; PanResponder.create does not call them.
  // eslint-disable-next-line react-hooks/refs
  const [panHandlers] = useState<GestureResponderHandlers>(() => {
    const settle = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < DISMISS_DISTANCE && !(gesture.vy > DISMISS_VELOCITY && gesture.dy > 16)) { settle(); return; }
        Animated.timing(translateY, { toValue: Math.max(live.current.height, 320), duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          live.current.onDismiss();
          setTimeout(() => { if (live.current.mounted) settle(); }, 220);
        });
      },
      onPanResponderTerminate: settle,
    }).panHandlers;
  });
  return {
    panHandlers,
    style: { transform: [{ translateY }] },
    onLayout: (event: LayoutChangeEvent) => { live.current.height = event.nativeEvent.layout.height; },
  };
}

// The handle on top of a bottom sheet. Keep it outside the sheet's scroll view so the
// scroll view never takes the drag. Screen readers get a close action instead.
export function SheetGrip({ panHandlers, label, onDismiss }: { panHandlers: GestureResponderHandlers; label: string; onDismiss: () => void }) {
  return <View {...panHandlers} accessible accessibilityRole="button" accessibilityLabel={`${label} 닫기`} accessibilityHint="아래로 쓸어내리면 닫혀요"
    accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') onDismiss(); }} style={g.grip}>
    <View style={g.bar} />
  </View>;
}

const g = StyleSheet.create({
  grip: { alignSelf: 'stretch', height: 28, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 40, height: 4, borderRadius: 2, backgroundColor: p.line },
});
