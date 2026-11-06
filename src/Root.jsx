import { useEffect, useState } from 'react';
import PlayoffOddsPage from './playoffs/PlayoffOddsPage';
import WinProbabilityPage from './winprob/WinProbabilityPage';

const VIEWS = [
  { hash: '#/win-probability', label: 'Win probability' },
  { hash: '#/playoff-odds', label: 'Playoff odds' },
];

const currentHash = () => (VIEWS.some((v) => v.hash === window.location.hash) ? window.location.hash : VIEWS[0].hash);

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
      {/* A bar along the bottom on phones, where a thumb reaches it and it never scrolls away. */}
      <nav
        className="z-40 border-line bg-page text-sm max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)] sm:border-b"
        aria-label="Views"
      >
        <div className="mx-auto flex max-w-7xl gap-1 sm:px-4">
          {VIEWS.map((view) => (
            <a
              key={view.hash}
              href={view.hash}
              aria-current={hash === view.hash ? 'page' : undefined}
              className={`px-3 py-3 font-medium max-sm:flex max-sm:min-h-14 max-sm:flex-1 max-sm:items-center max-sm:justify-center max-sm:border-t-2 sm:border-b-2 ${
                hash === view.hash ? 'border-white text-white' : 'border-transparent text-gray-300 hover:text-white'
              }`}
            >
              {view.label}
            </a>
          ))}
        </div>
      </nav>
      {hash === '#/playoff-odds' && <PlayoffOddsPage />}
      {hash === '#/win-probability' && <WinProbabilityPage />}
    </>
  );
}
