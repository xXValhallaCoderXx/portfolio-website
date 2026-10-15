// The three initials a pilot flies Good Lift under, as the board and the meet sheet show them: in
// the runes of the Elder Futhark over the Latin letters (ᚱᛖᚾ over REN), and never one of the few
// combinations nobody should have to read on a board. Pure and free of imports: the store checks
// typed initials here (good-lift-store.js), and the sheet draws them (GoodLiftResult.jsx).

// The Elder Futhark, the oldest row of runes (2nd to 8th century), in its own order: f u þ a r k
// g w h n i j ï p z s t b e m l ŋ d o. Every rune RUNES writes is one of these 24.
export const FUTHARK = Object.freeze([...'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ']);

// Each Latin capital's rune, by its sound. The row had no C, Q, V, X or Y of its own: C and Q are
// written with kaunan, the k rune, V with wunjo as W is, Y with jera (j, the y of "yes") as J is,
// and X, which is two sounds, with kaunan and sowilo (k and s), the one letter of two runes. So a
// rune can stand for more than one letter, which is why the letters always stand under them.
export const RUNES = Object.freeze({
  A: 'ᚨ', B: 'ᛒ', C: 'ᚲ', D: 'ᛞ', E: 'ᛖ', F: 'ᚠ', G: 'ᚷ', H: 'ᚺ', I: 'ᛁ', J: 'ᛃ', K: 'ᚲ', L: 'ᛚ', M: 'ᛗ',
  N: 'ᚾ', O: 'ᛟ', P: 'ᛈ', Q: 'ᚲ', R: 'ᚱ', S: 'ᛊ', T: 'ᛏ', U: 'ᚢ', V: 'ᚹ', W: 'ᚹ', X: 'ᚲᛊ', Y: 'ᛃ', Z: 'ᛉ',
});

// Initials the board will not show, refused as they are typed. Kept short and written out, so it
// can be read and argued with: the three-letter forms of the worst English swearing and sexual
// words, and of slurs and hate signs. A word for who someone is (GAY, JEW) is no insult and is
// never on it, and nor is a common name.
export const BLOCKED = Object.freeze([
  'ASS', 'CNT', 'CUM', 'CUN', 'DIC', 'DIK', 'FAG', 'FCK', 'FGT', 'FUC', 'FUK', 'FUQ',
  'JIZ', 'KKK', 'KYS', 'NGR', 'NIG', 'SEX', 'SHT', 'TIT', 'VAG', 'WTF', 'XXX',
]);

/** Whether three initials (capitals) are ones the board will not show. */
export const isBlocked = (initials) => BLOCKED.includes(initials);

/**
 * The runes of `initials`, one entry for each letter (two runes for an X), for the letters to stand
 * under: runesOf('REN') is ['ᚱ', 'ᛖ', 'ᚾ']. A character that is not a capital A to Z has none ('').
 */
export function runesOf(initials) {
  const runes = [];
  for (const letter of typeof initials === 'string' ? initials : '') runes.push(Object.hasOwn(RUNES, letter) ? RUNES[letter] : '');
  return runes;
}
