import { describe, expect, it } from 'vitest';
import { SpecialCardType } from '../types/card.js';
import { SPECIAL_CARD_NAMES, stripGreekTonos, toGreekUpper } from '../greek.js';

describe('Greek all-caps', () => {
  it('keeps accents on the title-case special-card names', () => {
    expect(SPECIAL_CARD_NAMES[SpecialCardType.DRAGON]).toBe('Δράκος');
    expect(SPECIAL_CARD_NAMES[SpecialCardType.PHOENIX]).toBe('Φοίνικας');
    expect(SPECIAL_CARD_NAMES[SpecialCardType.DOG]).toBe('Σκύλος');
    expect(SPECIAL_CARD_NAMES[SpecialCardType.MAHJONG]).toBe('Ματζόνγκ');
    expect(stripGreekTonos('Δράκος')).not.toBe('Δράκος');
  });

  it('drops tonos when those names are shown in capitals', () => {
    expect(toGreekUpper(SPECIAL_CARD_NAMES[SpecialCardType.PHOENIX])).toBe('ΦΟΙΝΙΚΑΣ');
    expect(toGreekUpper(SPECIAL_CARD_NAMES[SpecialCardType.DRAGON])).toBe('ΔΡΑΚΟΣ');
    expect(toGreekUpper(SPECIAL_CARD_NAMES[SpecialCardType.DOG])).toBe('ΣΚΥΛΟΣ');
    expect(toGreekUpper(SPECIAL_CARD_NAMES[SpecialCardType.MAHJONG])).toBe('ΜΑΤΖΟΝΓΚ');
    expect(toGreekUpper('Φοίνικας')).not.toBe('Φοίνικας'.toUpperCase());
  });

  it('uppercases UI Greek the way CSS uppercase does not', () => {
    expect('Κατάταξη'.toUpperCase()).toBe('ΚΑΤΆΤΑΞΗ');
    expect(toGreekUpper('Κατάταξη')).toBe('ΚΑΤΑΤΑΞΗ');
    expect(toGreekUpper('Αίθουσα των Πρωταθλητών')).toBe('ΑΙΘΟΥΣΑ ΤΩΝ ΠΡΩΤΑΘΛΗΤΩΝ');
    expect(toGreekUpper('Παίξε Online')).toBe('ΠΑΙΞΕ ONLINE');
    expect(toGreekUpper('ή')).toBe('Η');
  });

  it('keeps dialytika and still uppercases Latin', () => {
    expect(toGreekUpper('μαϊμού')).toBe('ΜΑΪΜΟΥ');
    expect(toGreekUpper('Ευρωπαϊκή')).toBe('ΕΥΡΩΠΑΪΚΗ');
    expect(toGreekUpper('Play Online')).toBe('PLAY ONLINE');
  });
});
