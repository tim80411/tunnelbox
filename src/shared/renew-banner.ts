/**
 * Soft-lock renew-banner visibility (Story 107 / TIM-211).
 *
 * The banner shows ONCE per major.minor version when a Pro license is soft-locked
 * (its updates window has lapsed but the build is still usable). Dismiss is keyed
 * on major.minor, so a patch bump does NOT re-show it, but the next minor/major does.
 */

/** "1.4.2" → "1.4". Used as the dismiss key so patch bumps don't re-trigger. */
export function majorMinor(version: string): string {
  const parts = version.split('.')
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version
}

export function shouldShowRenewBanner(opts: {
  isPro: boolean
  softLocked: boolean
  appVersion: string
  /** major.minor the user last dismissed the banner for (''=never). */
  dismissedVersion: string
}): boolean {
  if (!opts.isPro || !opts.softLocked) return false
  const mm = majorMinor(opts.appVersion)
  if (!mm) return false
  return opts.dismissedVersion !== mm
}
