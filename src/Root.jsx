import { useEffect, useState } from 'react';
import App from './App';
import WinProbabilityPage from './winprob/WinProbabilityPage';

const VIEWS = [
  { hash: '#/win-probability', label: 'Win probability' },
  { hash: '#/simulator', label: 'Playoff simulator' },
];

const currentHash = () => (VIEWS.some((v) => v.hash === window.location.hash) ? window.location.hash : VIEWS[0].hash);

export default function Root() {
  const [hash, setHash] = useState(currentHash);

  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      <nav className="border-b border-line bg-page text-sm" aria-label="Views">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 flex gap-1">
          {VIEWS.map((view) => (
            <a
              key={view.hash}
              href={view.hash}
              aria-current={hash === view.hash ? 'page' : undefined}
              className={`px-3 py-3 font-medium border-b-2 ${
                hash === view.hash ? 'text-white border-white' : 'text-gray-300 border-transparent hover:text-white'
              }`}
            >
              {view.label}
            </a>
          ))}
        </div>
      </nav>
      {hash === '#/simulator' ? <App /> : <WinProbabilityPage />}
    </>
  );
}
