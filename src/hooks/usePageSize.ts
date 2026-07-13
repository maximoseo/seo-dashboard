import { useCallback, useState } from 'react'
import {
  DEFAULT_PAGE_SIZE,
  type PageSize,
  normalizePageSize,
  readStoredPageSize,
  writeStoredPageSize,
} from '@/lib/pageSize'

/** Persist page size per tab and reset caller page via onChange side-effects. */
export function usePageSize(tab: string, fallback: PageSize = DEFAULT_PAGE_SIZE) {
  const [pageSize, setPageSizeState] = useState<PageSize>(() => readStoredPageSize(tab, fallback))

  const setPageSize = useCallback(
    (next: number | string) => {
      const size = normalizePageSize(next)
      setPageSizeState(size)
      writeStoredPageSize(tab, size)
    },
    [tab],
  )

  return { pageSize, setPageSize }
}
