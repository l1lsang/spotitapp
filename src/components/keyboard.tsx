import { forwardRef, useCallback, type PropsWithChildren } from 'react'
import type { ScrollView, ScrollViewProps, ViewProps } from 'react-native'
import {
  KeyboardProvider, KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState, type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller'

export function AppKeyboardProvider({ children }: PropsWithChildren) {
  return <KeyboardProvider preload={false}>{children}</KeyboardProvider>
}

// Measure the actual screen offset, including safe areas, headers and modals.
export function KeyboardPane({ style, enabled = true, ...props }: ViewProps & { enabled?: boolean }) {
  return <KeyboardAvoidingView {...props} enabled={enabled} automaticOffset behavior="padding" style={[{ flex: 1 }, style]} />
}

// Scroll the focused caret into view, including fields that grow while typing.
export const FormScrollView = forwardRef<ScrollView, ScrollViewProps & { keyboardSpaceAlreadyReserved?: boolean }>(function FormScrollView({ keyboardSpaceAlreadyReserved = false, ...props }, ref) {
  const keyboardHeight = useKeyboardState(state => state.height)
  const setRef = useCallback((value: KeyboardAwareScrollViewRef | null) => {
    if (typeof ref === 'function') ref(value)
    else if (ref) ref.current = value
  }, [ref])
  return <KeyboardAwareScrollView ref={setRef} bottomOffset={16} extraKeyboardSpace={keyboardSpaceAlreadyReserved ? -keyboardHeight : 0} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" {...props} />
})

export function useKeyboardVisible() {
  return useKeyboardState(state => state.isVisible)
}
