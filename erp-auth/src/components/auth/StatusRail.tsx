'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * A thin instrument strip: the shift clock and the link state. Small, but at a
 * till it answers the two questions people actually ask the screen.
 */
function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function StatusRail() {
  const [now, setNow] = useState<Date | null>(null);

  // Connectivity is an external store, not derived state; the server snapshot
  // is "online" so the first paint never claims a disconnection it cannot know.
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    // Deferred by a tick: the clock is client-only, and writing it during the
    // effect body would force a second render before the first one has painted.
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 px-1 text-xs text-ink-faint">
      <span className="flex items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${online ? 'bg-success' : 'bg-danger'}`}
          aria-hidden="true"
        />
        {online ? 'متصل' : 'لا يوجد اتصال'}
      </span>

      {/* Rendered only after mount: server and client clocks would disagree. */}
      <span className="numeral tracking-wider">
        {now
          ? now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '--:--:--'}
      </span>
    </div>
  );
}
