const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encodes a Uint8Array bytes into a Base58 string.
 */
export function encodeBase58(source: Uint8Array): string {
  if (source.length === 0) return '';
  
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    let carry = source[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  
  let string = '';
  // Deal with leading zeros
  for (let k = 0; k < source.length && source[k] === 0; k++) {
    string += ALPHABET[0];
  }
  for (let q = digits.length - 1; q >= 0; q--) {
    string += ALPHABET[digits[q]];
  }
  return string;
}
