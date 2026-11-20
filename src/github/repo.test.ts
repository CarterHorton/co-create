import { describe, expect, it } from 'vitest'
import {
  REPO_LOOKUPS_PER_DAY,
  REPO_LOOKUPS_PER_HOUR,
  effectiveRepo,
  lookupAllowed,
  lookupFailure,
  parseRepoInput,
  parseStoredRepo,
  repoFromApi,
  serializeRepo,
  specRepoLine,
  type RepoInfo,
} from './repo'

const repo = (fullName: string): RepoInfo => ({
  fullName,
  description: '',
  defaultBranch: 'main',
  url: `https://github.com/${fullName}`,
  connectedAt: 1,
})

describe('parseRepoInput', () => {
  it.each([
    ['octocat/Hello-World', 'octocat', 'Hello-World'],
    ['  octocat/Hello-World  ', 'octocat', 'Hello-World'],
    ['https://github.com/octocat/Hello-World', 'octocat', 'Hello-World'],
    ['http://www.github.com/octocat/Hello-World/', 'octocat', 'Hello-World'],
    ['github.com/octocat/Hello-World.git', 'octocat', 'Hello-World'],
    ['https://github.com/octocat/Hello-World/tree/main/src?x=1', 'octocat', 'Hello-World'],
    ['git@github.com:octocat/Hello-World.git', 'octocat', 'Hello-World'],
    ['vercel/next.js', 'vercel', 'next.js'],
  ])('reads %s', (input, owner, name) => {
    expect(parseRepoInput(input)).toEqual({ owner, name })
  })

  it.each(['', 'octocat', 'octocat/', '/x', 'a b/c', 'octo cat/x', 'owner/..', '-bad/x', 42, null])('rejects %s', (input) => {
    expect(parseRepoInput(input)).toHaveProperty('error')
  })

  it('rejects other hosts', () => {
    expect(parseRepoInput('https://gitlab.com/a/b')).toEqual({ error: 'Only github.com repositories can be connected.' })
    expect(parseRepoInput('evil.example.com/a/b')).toHaveProperty('error')
  })
})

describe('repoFromApi', () => {
  it('keeps public metadata and builds the link itself', () => {
    const r = repoFromApi(
      {
        full_name: 'octocat/Hello-World',
        description: '  My first\nrepository  ',
        default_branch: 'master',
        html_url: 'https://evil.example/',
        private: false,
      },
      5,
    )
    expect(r).toEqual({
      fullName: 'octocat/Hello-World',
      description: 'My first repository',
      defaultBranch: 'master',
      url: 'https://github.com/octocat/Hello-World',
      connectedAt: 5,
    })
  })

  it('refuses private or malformed answers', () => {
    expect(repoFromApi({ full_name: 'a/b', private: true }, 1)).toBeNull()
    expect(repoFromApi({ name: 'b' }, 1)).toBeNull()
    expect(repoFromApi(null, 1)).toBeNull()
  })

  it('caps long descriptions', () => {
    const r = repoFromApi({ full_name: 'a/b', description: 'x'.repeat(1000) }, 1)
    expect(r?.description.length).toBe(300)
  })
})

describe('stored repos', () => {
  it('round-trips and reads junk as none', () => {
    const r = repo('a/b')
    expect(parseStoredRepo(serializeRepo(r))).toEqual(r)
    expect(serializeRepo(null)).toBe('')
    expect(parseStoredRepo('')).toBeNull()
    expect(parseStoredRepo('{not json')).toBeNull()
    expect(parseStoredRepo(JSON.stringify({ fullName: 'no-slash' }))).toBeNull()
    expect(parseStoredRepo(undefined)).toBeNull()
  })
})

describe('effectiveRepo (project → board inheritance)', () => {
  const projectRepo = serializeRepo(repo('team/app'))
  const boardRepo = serializeRepo(repo('team/override'))

  it('a board in a project inherits the project repo', () => {
    expect(effectiveRepo({ projectId: 'p1', projectRepo })).toEqual({ repo: repo('team/app'), source: 'project' })
  })

  it("a board's own repo overrides the project's", () => {
    expect(effectiveRepo({ projectId: 'p1', projectRepo, repo: boardRepo })).toEqual({
      repo: repo('team/override'),
      source: 'board',
    })
  })

  it('disconnecting the board repo falls back to the project', () => {
    expect(effectiveRepo({ projectId: 'p1', projectRepo, repo: '' })?.source).toBe('project')
  })

  it('disconnecting the project repo leaves only boards with their own', () => {
    expect(effectiveRepo({ projectId: 'p1', projectRepo: '' })).toBeNull()
    expect(effectiveRepo({ projectId: 'p1', projectRepo: '', repo: boardRepo })?.source).toBe('board')
  })

  it('a board outside any project never uses a stale inherited copy', () => {
    expect(effectiveRepo({ projectId: '', projectRepo })).toBeNull()
    expect(effectiveRepo({ projectRepo })).toBeNull()
    expect(effectiveRepo({ repo: boardRepo })?.source).toBe('board')
  })
})

describe('specRepoLine', () => {
  it('names the repo, branch and description', () => {
    expect(specRepoLine({ ...repo('a/b'), defaultBranch: 'dev`x', description: 'Hi' })).toBe(
      '**Repository:** [a/b](https://github.com/a/b) (default branch `devx`) — Hi',
    )
  })
})

describe('lookupAllowed', () => {
  const now = 10 * 86_400_000
  it('allows up to the hourly limit', () => {
    const times = Array.from({ length: REPO_LOOKUPS_PER_HOUR - 1 }, (_, i) => now - i * 1000)
    expect(lookupAllowed(times, now).ok).toBe(true)
    expect(lookupAllowed([...times, now - 5], now).ok).toBe(false)
  })
  it('forgets lookups older than an hour, but counts the day', () => {
    const hourAgo = Array.from({ length: REPO_LOOKUPS_PER_HOUR }, () => now - 3_700_000)
    expect(lookupAllowed(hourAgo, now).ok).toBe(true)
    const day = Array.from({ length: REPO_LOOKUPS_PER_DAY }, (_, i) => now - 3_700_000 - i * 60_000)
    expect(lookupAllowed(day, now).ok).toBe(false)
    expect(lookupAllowed(day, now + 86_400_000).ok).toBe(true)
  })
})

describe('lookupFailure', () => {
  it('explains running out of credits', () => {
    expect(lookupFailure({ code: 'insufficient_credits', error: 'x' }, 'a/b').code).toBe('insufficient_credits')
    expect(lookupFailure({ status: 402 }, 'a/b').code).toBe('insufficient_credits')
  })
  it('explains a missing or private repo', () => {
    const f = lookupFailure(
      { code: 'upstream_provider_error', error: 'github/get-repository (502): GitHub public API error 404: Not Found' },
      'a/b',
    )
    expect(f.code).toBe('not_found')
    expect(f.error).toContain('a/b')
  })
  it('falls back to a generic message', () => {
    expect(lookupFailure({ error: 'boom' }, 'a/b').code).toBe('upstream_error')
  })
})
