import { useFonts } from 'expo-font'

// Book faces load with the Book Studio screens only, not at app start.
const BOOK_FONT_FILES = {
  'GowunBatang-Regular': require('../../../assets/fonts/book/GowunBatang-Regular.ttf'),
  'NanumPen-Regular': require('../../../assets/fonts/book/NanumPenScript-Regular.ttf'),
}

/** True once the faces are ready, or once loading failed (text then falls back to the UI font). */
export function useBookFonts(): boolean {
  const [loaded, error] = useFonts(BOOK_FONT_FILES)
  return loaded || !!error
}
