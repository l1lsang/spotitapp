import { PIN_COLOR_PALETTE } from '../types/post'

// A wide, easy palette: the brand colors first, then a rainbow of clear map-friendly colors.
// Every color keeps enough contrast for the white pin icon drawn on top.
export const PIN_COLOR_CHOICES: readonly { name: string; color: string }[] = [
  ...PIN_COLOR_PALETTE,
  { name: '빨강', color: '#d93a3f' },
  { name: '주황', color: '#e5671b' },
  { name: '귤색', color: '#d98a00' },
  { name: '머스터드', color: '#b38f00' },
  { name: '연두', color: '#6a9a1f' },
  { name: '초록', color: '#2a9160' },
  { name: '청록', color: '#0f8f86' },
  { name: '하늘', color: '#0b8bb3' },
  { name: '파랑', color: '#1f6fd6' },
  { name: '남색', color: '#3e4fc4' },
  { name: '보라', color: '#7d45bd' },
  { name: '자주', color: '#b23c95' },
  { name: '분홍', color: '#d9467a' },
  { name: '갈색', color: '#8a5a36' },
]

function channels(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Blends a color toward white (positive amount) or black (negative amount), -1…1. */
export function shadePinColor(hex: string, amount: number): string | null {
  const rgb = channels(hex)
  if (!rgb) return null
  const target = amount >= 0 ? 255 : 0
  const weight = Math.min(1, Math.abs(amount))
  return '#' + rgb.map(value => Math.round(value + (target - value) * weight).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Lighter and deeper versions of the chosen color, kept dark enough for the white pin icon.
export const PIN_SHADE_STEPS = [0.3, 0.15, 0, -0.2, -0.38] as const

export function getPinShades(hex: string): string[] {
  return PIN_SHADE_STEPS.map(step => shadePinColor(hex, step)).filter((color): color is string => Boolean(color))
}
