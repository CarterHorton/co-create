/** Search boards by title and choose the sort order. */

import { SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { SORT_LABELS, type SortKey } from './boardList'

export function BoardsToolbar({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string
  onQuery: (q: string) => void
  sort: SortKey
  onSort: (s: SortKey) => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex-1">
        <SearchInput
          data-testid="board-search"
          aria-label="Search boards by title"
          placeholder="Search boards"
          value={query}
          maxLength={200}
          onChange={(e) => onQuery(e.target.value)}
          onClear={() => onQuery('')}
        />
      </div>
      <div className="flex items-center gap-2">
        <span id="board-sort-label" className="font-mono text-xs text-muted-foreground">
          Sort
        </span>
        <Select value={sort} onValueChange={(v) => onSort((v || 'recent') as SortKey)}>
          <SelectTrigger aria-labelledby="board-sort-label" data-testid="board-sort" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
