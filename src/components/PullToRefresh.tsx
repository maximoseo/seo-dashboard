import { useCallback, useEffect, useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
}

const THRESHOLD = 80;
const MAX_PULL = 120;

/** Wraps page content with native-feel pull-to-refresh on touch devices. */
export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    // Rubber-band effect
    const distance = Math.min(delta * 0.5, MAX_PULL);
    setPullDistance(distance);
    if (distance > 10) e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const showIndicator = pullDistance > 10 || refreshing;

  return (
    <div ref={containerRef} className="relative">
      {showIndicator && (
        <div
          className="flex items-center justify-center transition-all duration-200 overflow-hidden"
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          {refreshing ? (
            <div className="h-5 w-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div
              className={`text-xs font-medium transition-colors ${pullDistance >= THRESHOLD ? "text-orange-400" : "text-fg-dim"}`}
              style={{ transform: `rotate(${Math.min(pullDistance * 2, 180)}deg)` }}
            >
              ↓ {pullDistance >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
