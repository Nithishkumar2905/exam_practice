/**
 * Accessible Number-Based Audio CAPTCHA Utilities
 * Browser-safe CSPRNG generation, digit-by-digit speech formatting,
 * and spoken number-word normalization.
 */

const DIGIT_WORDS: Record<string, string> = {
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
};

const SPOKEN_WORD_TO_DIGIT: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  nought: '0',
  one: '1',
  won: '1',
  two: '2',
  too: '2',
  to: '2',
  three: '3',
  tree: '3',
  four: '4',
  for: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
  nine: '9',
  niner: '9',
};

/**
 * Generates a cryptographically random 3- or 4-digit numeric string,
 * preserving leading zeroes.
 */
export function generateNumericCaptchaCode(length?: 3 | 4): string {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Cryptographic random generator is unavailable.');
  }

  let targetLength = length;
  if (targetLength !== 3 && targetLength !== 4) {
    const lenBuf = new Uint8Array(1);
    cryptoObj.getRandomValues(lenBuf);
    targetLength = (lenBuf[0] % 2 === 0 ? 3 : 4) as 3 | 4;
  }

  const bytes = new Uint8Array(targetLength * 2);
  let result = '';
  let idx = 0;

  while (result.length < targetLength) {
    if (idx >= bytes.length) {
      cryptoObj.getRandomValues(bytes);
      idx = 0;
    } else if (idx === 0) {
      cryptoObj.getRandomValues(bytes);
    }
    const byte = bytes[idx++];
    // Rejection sampling: 250 is the largest multiple of 10 <= 255
    if (byte < 250) {
      result += String(byte % 10);
    }
  }

  return result;
}

/**
 * Formats a numeric CAPTCHA code so TTS reads each digit individually
 * with clear pauses, e.g. "007" -> "Zero... Zero... Seven."
 */
export function formatCaptchaDigitsForSpeech(code: string): string {
  const digitsOnly = String(code ?? '').replace(/\D/g, '');
  if (!digitsOnly) return '';
  const words = digitsOnly.split('').map((d) => DIGIT_WORDS[d] ?? d);
  return `${words.join('... ')}.`;
}

/**
 * Normalizes typed or spoken CAPTCHA input into a plain digit string,
 * preserving leading zeroes and converting spoken number words.
 */
export function normalizeSpokenCaptchaDigits(input: string): string {
  if (!input) return '';
  const cleaned = input
    .toLowerCase()
    .replace(/[-_,.;:!?/\\]+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const tokens = cleaned.split(/\s+/);
  let output = '';

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      output += token;
      continue;
    }
    if (token in SPOKEN_WORD_TO_DIGIT) {
      output += SPOKEN_WORD_TO_DIGIT[token];
      continue;
    }
    // Extract embedded digits if mixed (e.g., "number4", "code12")
    const embedded = token.replace(/\D/g, '');
    if (embedded) {
      output += embedded;
    }
  }

  return output;
}

