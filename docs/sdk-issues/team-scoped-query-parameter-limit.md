# Team-scoped reads fail once a user is in ~100 teams ("too many SQL variables")

**Package:** `deepspace` 0.44.2
**Where:** `executeTableQuery` and `preloadUserTeamIds` in `dist/worker.js` (lines ~2222–2256) and the same code in `dist/server.js` (lines ~5257–5291)
**Status in this app:** worked around with a local patch (`patches/deepspace+0.44.2.patch`, applied by `patch-package` on install). The commit that adds this file has no workaround yet; the commit after it adds the patch.

## What happens

A collection with a `teamField` and `read: 'team'` permissions (in this app: `boards`, `team_members`, `comments`, `votes`, `vote_panels`, `board_timers`, …) is queried in two steps:

1. `preloadUserTeamIds` loads every team the user is an active member of:

   ```sql
   SELECT col_teamid FROM c_team_members WHERE col_userid = ? AND (col_status = 'active' OR col_status IS NULL)
   ```

2. `executeTableQuery` puts **one bound parameter per team** into the real query:

   ```js
   const placeholders = teamIds.map(() => "?").join(", ");
   whereClauses.push(`("${filterCol}" IN (${placeholders}) OR _created_by = ?)`);
   params.push(...teamIds, userId);
   ```

The query has `teams + 1` bound parameters. SQLite on Cloudflare (Durable Object storage and D1) allows about 100 bound parameters per statement. Once a user belongs to roughly 100 teams, **every** team-scoped query for that user fails:

```
Invalid message: too many SQL variables at offset 507: SQLITE_ERROR
```

In this app that means the user's board list and every board page stay on "Loading board…" with that error in a toast. The app can't recover; it's unusable for that account.

## How we hit it

Our e2e suite runs with two fixed test accounts that share boards with each other in many specs. After enough runs, both accounts were members of more than 100 boards, and every signed-in spec failed at once, with `getByTestId('board-page')` never appearing. Run on the commit that adds this file, `npx deepspace test run e2e` against a local database in that state fails 10 signed-in specs, and the page snapshot shows the error above. Any real user who joins about 100 shared boards would hit the same thing.

## Minimal reproduction

1. Define a collection with `teamField: 'teamId'` and `permissions: { member: { read: 'team', … } }`, plus the standard `team_members` collection.
2. Give one user `team_members` rows (status `active`) for 101 different `teamId`s.
3. As that user, run `useQuery('<collection>')` (or `tools.query` without RBAC bypass).
4. Result: `too many SQL variables … SQLITE_ERROR`. With 99 or fewer teams it works.

## Suggested fix

`c_team_members` is in the same SQLite database as the table being queried, so the team list doesn't need to go through bound parameters. A subquery keeps the number of parameters fixed at two, however many teams the user is in:

```js
whereClauses.push(
  `("${filterCol}" IN (SELECT col_teamid FROM c_team_members WHERE col_userid = ? AND (col_status = 'active' OR col_status IS NULL)) OR _created_by = ?)`
);
params.push(userId, userId);
```

This also saves the extra round trip in `preloadUserTeamIds`. If the list has to stay, splitting it into chunks of 100 or fewer and `OR`-ing them together would work too, but the subquery is simpler and scales better.

## Impact

Any DeepSpace app that uses team-scoped permissions breaks for its most active users: anyone who joins many shared spaces, boards or projects. Nothing about the app's own code causes it, and the app has no way to work around it short of patching the SDK.
