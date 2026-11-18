/**
 * Party — your friends list. Show a friend code (valid 20 s) for someone else
 * to type in, or type in theirs. Once added, a friend stays.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from 'deepspace'
import { UserPlus } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { Friendship } from './types'

interface IssuedCode {
  code: string
  expiresAt: number
}

/** 8 hex chars shown as XXXX-XXXX so they're easier to read out. */
export function formatCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Keep only hex digits, so typing or pasting "1a2b-3c4d" both work. */
function cleanEntry(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8)
}

function useSecondsLeft(expiresAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [expiresAt])
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0
}

export function PartyPanel({ userId }: { userId: string }) {
  const { success, error } = useToast()
  const { records: friends, status } = useQuery<Friendship>('friendships', { where: { ownerId: userId } })
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [entry, setEntry] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const secondsLeft = useSecondsLeft(issued?.expiresAt ?? null)
  const live = issued && secondsLeft > 0

  async function issue() {
    setIssuing(true)
    try {
      const { code, expiresAt, ttlMs } = await callAction<IssuedCode & { ttlMs: number }>('friendCodeCreate')
      // Count down from this browser's clock, not the server's.
      setIssued({ code, expiresAt: Date.now() + Math.min(ttlMs, Math.max(0, expiresAt - Date.now())) })
    } catch (e) {
      error('Could not make a code', (e as Error).message)
    } finally {
      setIssuing(false)
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault()
    if (!entry.trim()) return
    setRedeeming(true)
    try {
      const { friendName } = await callAction<{ friendName: string }>('friendCodeRedeem', { code: entry })
      setEntry('')
      success(`${friendName} joined your party`)
    } catch (err) {
      error('Could not add friend', (err as Error).message)
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <section data-testid="party-panel" className="mb-10 border border-border p-5">
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="size-4" />
        <h2 className="font-bold">Party</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Give a friend your code. It works once, for 20 seconds.</p>
          {live ? (
            <div className="flex items-center gap-3">
              <span data-testid="friend-code" className="font-mono text-2xl font-black tracking-[0.2em]">
                {formatCode(issued.code)}
              </span>
              <span data-testid="friend-code-timer" className="font-mono text-xs text-muted-foreground">
                {secondsLeft}s
              </span>
            </div>
          ) : (
            <Button data-testid="friend-code-create" variant="outline" onClick={issue} loading={issuing}>
              {issued ? 'Code expired — get a new one' : 'Get friend code'}
            </Button>
          )}
        </div>

        <form onSubmit={redeem} className="flex items-start gap-2">
          <Input
            data-testid="friend-code-input"
            onChange={(e) => setEntry(cleanEntry(e.target.value))}
            value={formatCode(entry)}
            placeholder="Friend's code, e.g. 3F9A-7C21"
            autoComplete="off"
            className="flex-1 font-mono uppercase"
          />
          <Button data-testid="friend-code-redeem" type="submit" loading={redeeming} disabled={entry.length !== 8}>
            Add
          </Button>
        </form>
      </div>

      {status !== 'loading' && friends.length > 0 && (
        <ul data-testid="friend-list" className="mt-4 flex flex-wrap gap-2">
          {friends.map((f) => (
            <li key={f.recordId} className="border border-border px-2 py-1 text-sm">
              {f.data.friendName || 'Friend'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
