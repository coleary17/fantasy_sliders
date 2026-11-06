import { useEffect, useState } from 'react';
import PlayoffOddsPage from './playoffs/PlayoffOddsPage';
import WinProbabilityPage from './winprob/WinProbabilityPage';

const VIEWS = [
  { hash: '#/win-probability', label: 'Win probability' },
  { hash: '#/playoff-odds', label: 'Playoff odds' },
];

const currentHash = () => (VIEWS.some((v) => v.hash === window.location.hash) ? window.location.hash : VIEWS[0].hash);

function Seal() {
  return (
    <svg viewBox="0 0 30 28" className="h-6 w-auto shrink-0 sm:h-8" aria-hidden="true">
      <path d="M15 2 L28 26 H2 Z" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="15" cy="17" r="3" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
      <circle cx="15" cy="17" r="1" fill="var(--gold)" />
    </svg>
  );
}

export default function Root() {
  const [hash, setHash] = useState(currentHash);

  useEffect(() => {
    const onChange = () => {
      setHash(currentHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      <header className="guilloche border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 py-2 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 bg-page pr-2 sm:gap-3">
            <Seal />
            <h1 className="font-display text-lg leading-tight text-ink sm:text-3xl">The New World Order</h1>
          </div>
          {/* A bar along the bottom on phones, where a thumb reaches it and it never scrolls away. */}
          <nav
            className="z-40 border-line bg-page text-sm max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)]"
            aria-label="Views"
          >
            <div className="flex gap-1">
            {VIEWS.map((view) => (
              <a
                key={view.hash}
                href={view.hash}
                aria-current={hash === view.hash ? 'page' : undefined}
                className={`whitespace-nowrap px-3 py-3 font-medium max-sm:flex max-sm:min-h-14 max-sm:flex-1 max-sm:items-center max-sm:justify-center max-sm:border-t-2 sm:border-b-2 ${
                  hash === view.hash ? 'border-gold text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {view.label}
              </a>
            ))}
            </div>
          </nav>
        </div>
      </header>
      {hash === '#/playoff-odds' && <PlayoffOddsPage />}
      {hash === '#/win-probability' && <WinProbabilityPage />}
    </>
  );
}
