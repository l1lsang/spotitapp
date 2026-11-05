/* Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V4
 * Spotit reference system · Photographic / Workbench / Long Document
 * Native sRGB equivalents of the reference project's OKLCH tokens.
 */
export const palette = {
  bg: '#FAFAF8', paper: '#FFFFFF', surface: '#EEF1EE',
  primary: '#234E43', primaryHover: '#14352C', primarySoft: '#E1EFE8',
  ink: '#161F1B', muted: '#555D59', light: '#676E6A', line: '#D1D6D1',
  coral: '#974426', coralSoft: '#FCEAE3', olive: '#495937', oliveSoft: '#ECF0E7',
  danger: '#9E2320', errorSoft: '#FEEEEB',
  scrim: '#15211BCC', overlay: '#19211D70', viewer: '#111511',
  white: '#FFFFFF', transparent: 'transparent',
} as const;

export const shape = { control: 6, photo: 6, tile: 3, dialog: 12 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48 } as const;
export const layout = { content: 1120, reading: 760, form: 640, desktop: 860, navHeight: 64 } as const;
export const shadows = { map: '0 4px 20px #19211D14', dialog: '0 24px 80px #19211D29' } as const;
export const fontFamilies = {
  regular: 'Pretendard-Regular', medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold', bold: 'Pretendard-Bold',
} as const;
