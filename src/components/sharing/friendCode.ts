/**
 * Pure helpers for showing a friend code's countdown and announcing it to
 * screen readers without reading out every tick (WCAG 2.2.1 / 4.1.3).
 */

/** Below this many seconds the panel offers a new code and says time is short. */
export const LOW_TIME_SECONDS = 30

/** 300 → "5:00", 29 → "0:29". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "3F9A7C21" → "3 F 9 A 7 C 2 1", so a screen reader spells it out. */
export function spellCode(code: string): string {
  return code.split('').join(' ')
}

/** "5 minutes", "1 minute", "45 seconds". */
export function describeDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}

/**
 * What the polite live region should say. It only changes at three moments —
 * a new code, the low-time warning and expiry — so it is announced only then.
 */
export function codeAnnouncement(
  issued: { code: string; ttlMs: number } | null,
  secondsLeft: number,
): string {
  if (!issued) return ''
  if (secondsLeft <= 0) return 'Code expired'
  if (secondsLeft <= LOW_TIME_SECONDS) return `${LOW_TIME_SECONDS} seconds left`
  return `Your code is ${spellCode(issued.code)}, valid for ${describeDuration(issued.ttlMs)}`
}
