import { createContext, forwardRef, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native'

const KeyboardVisible = createContext(false)

export function AppKeyboardProvider({ children }: PropsWithChildren) {
  const [viewport, setViewport] = useState<{ height: number; visible: boolean } | null>(null)
  useEffect(() => {
    const visual = window.visualViewport
    if (!visual) return
    let frame = 0
    let fullHeight = window.innerHeight
    function update() {
      const input = document.activeElement
      const editing = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || (input instanceof HTMLElement && input.isContentEditable)
      if (!editing) fullHeight = window.innerHeight
      const visible = editing && Math.max(fullHeight, window.innerHeight) - visual!.height > 100
      setViewport({ height: visual!.height, visible })
      cancelAnimationFrame(frame)
      if (visible) frame = requestAnimationFrame(() => input?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
    }
    update()
    visual.addEventListener('resize', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      cancelAnimationFrame(frame)
      visual.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return <KeyboardVisible.Provider value={viewport?.visible ?? false}>
    <View style={{ flex: 1, minHeight: 0, maxHeight: viewport?.height }}>{children}</View>
  </KeyboardVisible.Provider>
}

export function KeyboardPane({ enabled: _enabled, style, ...props }: ViewProps & { enabled?: boolean }) {
  return <View {...props} style={[{ flex: 1, minHeight: 0 }, style]} />
}

export const FormScrollView = forwardRef<ScrollView, ScrollViewProps & { keyboardSpaceAlreadyReserved?: boolean }>(function FormScrollView({ keyboardSpaceAlreadyReserved: _reserved, ...props }, ref) {
  return <ScrollView ref={ref} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" {...props} />
})

export function useKeyboardVisible() { return useContext(KeyboardVisible) }
