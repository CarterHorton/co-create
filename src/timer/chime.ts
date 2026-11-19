/**
 * The optional "time's up" chime: two short sine tones from Web Audio (no
 * audio file). Off by default; the choice is remembered per browser. It
 * never plays before the person has interacted with the page, so it is not
 * autoplay.
 */

const KEY = 'co-create:timer-chime'

export function loadChimePref(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function saveChimePref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Private mode / storage disabled: the toggle still works for this visit.
  }
}

let ctx: AudioContext | null = null

/** Create (or wake) the audio context. Call from a user gesture, e.g. the toggle. */
export function primeAudio(): void {
  if (typeof AudioContext === 'undefined') return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
}

export function playChime(): void {
  // No sound before the first user interaction.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  if (activation && !activation.hasBeenActive) return
  if (typeof AudioContext === 'undefined') return
  ctx ??= new AudioContext()
  const ac = ctx
  if (ac.state === 'running') beep(ac)
  else ac.resume().then(() => beep(ac), () => undefined)
}

function beep(ac: AudioContext): void {
  const start = ac.currentTime
  ;[880, 660].forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const t = start + i * 0.22
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  })
}
