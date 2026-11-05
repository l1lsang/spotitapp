import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { Text } from './Typography';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormScrollView, useKeyboardVisible } from './keyboard';
import { IconButton, QuietSurface, elevation, p, s } from './ui';
// One layer: no outline or header rule; spacing and the dialog shadow carry the grouping.
export function Dialog({ visible, title, eyebrow: _eyebrow, onClose, children, busy = false }: { visible: boolean; title: string; eyebrow?: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const keyboardVisible = useKeyboardVisible();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: p.overlay }}>
      <View style={{ flex: 1, justifyContent: keyboardVisible ? 'flex-start' : 'center', alignItems: 'center', padding: 16 }}>
        <View style={[{ width: '100%', maxWidth: 520, maxHeight: '94%', backgroundColor: p.paper, borderRadius: 12, overflow: 'hidden' }, elevation.dialog]}>
          <View style={[s.between, { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }]}>
            <View style={{ flex: 1, gap: 6 }}><Text accessibilityRole="header" style={{ color: p.ink, fontSize: 22, fontWeight: '600', letterSpacing: -0.8 }}>{title}</Text></View>
            <IconButton label="닫기" disabled={busy} onPress={onClose}><X size={20} color={p.muted} /></IconButton>
          </View>
          <QuietSurface.Provider value>
            <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 16, gap: 18 }}>{children}</FormScrollView>
          </QuietSurface.Provider>
        </View>
      </View>
    </SafeAreaView>
  </Modal>;
}
