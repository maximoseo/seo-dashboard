export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

export const DEFAULT_PAGE_SIZE: PageSize = 10

export function normalizePageSize(value: number | string | null | undefined): PageSize {
  const n = typeof value === 'string' ? Number(value) : value
  if (n === 10 || n === 20 || n === 50 || n === 100) return n
  return DEFAULT_PAGE_SIZE
}

export function storageKeyFor(tab: string) {
  return `seo-dash.pageSize.${tab}`
}

export function readStoredPageSize(tab: string, fallback: PageSize = DEFAULT_PAGE_SIZE): PageSize {
  try {
    return normalizePageSize(localStorage.getItem(storageKeyFor(tab)) ?? fallback)
  } catch {
    return fallback
  }
}

export function writeStoredPageSize(tab: string, size: PageSize) {
  try {
    localStorage.setItem(storageKeyFor(tab), String(size))
  } catch {
    // ignore quota / private mode
  }
}
