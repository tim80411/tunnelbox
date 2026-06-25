/**
 * Encode a string as a TOML basic string (quoted, with the value escaped per
 * the TOML spec). Using this for user-controlled values (frp serverAddr /
 * authToken) makes it impossible to break out of the quoted string and inject
 * additional TOML keys or tables — closing the config-injection hole where
 * these values were previously interpolated raw into the generated frpc.toml.
 * (TIM-317, F21)
 */
export function tomlBasicString(value: string): string {
  let out = '"'
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\f') out += '\\f'
    else if (ch === '\r') out += '\\r'
    else if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0')
    else out += ch
  }
  return out + '"'
}
