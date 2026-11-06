const STALE_AFTER_MS = 15_000;

// Runs `refresh` every `ms`, but not while the page is hidden. Coming back to the page after
// more than a few seconds refreshes straight away, so unlocking a phone doesn't show old scores.
// Returns a function that stops it.
export function startPolling(refresh, ms) {
  let timer = null;
  let lastRun = Date.now();

  const run = () => {
    lastRun = Date.now();
    refresh();
  };
  const start = () => {
    clearInterval(timer);
    timer = setInterval(run, ms);
  };
  const handleVisibility = () => {
    clearInterval(timer);
    if (document.hidden) return;
    if (Date.now() - lastRun >= STALE_AFTER_MS) run();
    start();
  };

  if (!document.hidden) start();
  document.addEventListener('visibilitychange', handleVisibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
