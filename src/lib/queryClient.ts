import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message : ''
        if (/401|403|429/.test(message)) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
  },
})
