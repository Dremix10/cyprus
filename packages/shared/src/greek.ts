import { SpecialCardType } from './types/card.js';

/**
 * Title-case names for the four special cards. Accents stay: Δράκος, Φοίνικας.
 * All-caps labels must go through `toGreekUpper` (ΦΟΙΝΙΚΑΣ, ΔΡΑΚΟΣ). CSS
 * `text-transform: uppercase` and `String#toUpperCase` keep the tonos.
 */
export const SPECIAL_CARD_NAMES: Record<SpecialCardType, string> = {
  [SpecialCardType.MAHJONG]: 'Ματζόνγκ',
  [SpecialCardType.DOG]: 'Σκύλος',
  [SpecialCardType.PHOENIX]: 'Φοίνικας',
  [SpecialCardType.DRAGON]: 'Δράκος',
};

/** Remove Greek tonos (the acute). Dialytika (¨) stays. */
export function stripGreekTonos(text: string): string {
  return text.normalize('NFD').replace(/\u0301/g, '').normalize('NFC');
}

/**
 * Uppercase for display. Greek capitals drop tonos (Φοίνικας → ΦΟΙΝΙΚΑΣ).
 * Does not use `toLocaleUpperCase('el')`, which Hermes may not implement.
 */
export function toGreekUpper(text: string): string {
  return stripGreekTonos(text.toUpperCase());
}
