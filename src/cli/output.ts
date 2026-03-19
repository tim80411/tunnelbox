/**
 * Wrap a URL with OSC 8 terminal hyperlink escape sequences.
 * Clickable in modern terminals (iTerm2, Terminal.app, Windows Terminal, etc.).
 * Falls back to plain text when stdout is not a TTY (e.g. piped).
 */
export function link(url: string, text?: string): string {
  if (!process.stdout.isTTY) return text || url
  return `\x1b]8;;${url}\x07${text || url}\x1b]8;;\x07`
}

export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ success: true, data }))
  } else if (typeof data === 'string') {
    console.log(data)
  } else if (Array.isArray(data)) {
    data.length === 0 ? console.log('No items found.') : console.table(data)
  } else {
    console.log(data)
  }
}
