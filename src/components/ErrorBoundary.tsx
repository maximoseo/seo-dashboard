import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard screen crashed', { error, info })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-300">
            !
          </div>
          <h2 className="text-xl font-semibold text-fg">This screen hit a recoverable error</h2>
          <p className="mt-2 text-sm text-fg-muted">
            The dashboard shell is still running. Reload this screen or move to another module.
            Technical details were logged for diagnostics without exposing them here.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
