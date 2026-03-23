/** Parse version string — extracts first semver match (e.g., "bore 0.5.2" → "0.5.2") */
export function parseVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

/** Compare two semver strings. Returns -1 (a < b), 0 (equal), or 1 (a > b). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}
