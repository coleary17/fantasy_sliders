import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildSlides, firstSlideOfWeek, loadCatalog, loadStory, weekProgress } from './data';
import { formatStoryRoute, parseStoryRoute, resolveStoryRoute } from './route';
import { Graphic, Rise, Standings } from './Graphics';
import './story.css';

const PREVIOUS_ZONE = 0.3;

const Eyebrow = ({ children }) => <div className="text-sm font-semibold uppercase tracking-widest text-gold">{children}</div>;

function Card({ slide, story, active, color }) {
  switch (slide.kind) {
    case 'cover': {
      const last = story.chapters[story.chapters.length - 1];
      const game = last?.facts?.find((f) => f.type === 'game');
      return (
        <div className="guilloche -mx-6 flex h-full flex-col justify-center px-6">
          <Rise><Eyebrow>The story so far</Eyebrow></Rise>
          <Rise step={1} className="mt-4"><h2 className="font-display text-5xl leading-tight" style={{ color }}>{story.team}</h2></Rise>
          <Rise step={2} className="mt-5 text-xl leading-snug text-ink">{story.arc?.logline}</Rise>
          <Rise step={3} className="mt-8 text-base text-ink-2">{story.throughWeek ? `Through week ${story.throughWeek}` : 'Your season story'}{game?.recordAfter ? ` · ${game.recordAfter}` : ''}</Rise>
          <Rise step={4} className="mt-2 text-base text-ink-3">Swipe to start</Rise>
        </div>
      );
    }
    case 'intro':
      return (
        <div className="flex h-full flex-col justify-center">
          <Rise><Eyebrow>Week {slide.week} · {slide.chapter.mood}</Eyebrow></Rise>
          <Rise step={1} className="mt-4"><h2 className="font-display text-4xl leading-tight text-ink">{slide.chapter.headline}</h2></Rise>
          <Rise step={2} className="mt-5 text-xl leading-snug text-ink-2">{slide.chapter.dek}</Rise>
        </div>
      );
    case 'beat':
      return (
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <Graphic fact={slide.fact} game={slide.game} foe={slide.foe} active={active} color={color} />
          </div>
          <div className="pb-4 pt-6">
            <Rise step={3}><Eyebrow>{slide.beat.eyebrow}</Eyebrow></Rise>
            <Rise step={4} className="mt-2 text-xl leading-snug text-ink">{slide.beat.text}</Rise>
          </div>
        </div>
      );
    case 'cliffhanger':
      return (
        <div className="flex h-full flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            {slide.standings && <Standings fact={slide.standings} active={active} color={color} />}
          </div>
          <div className="pb-4 pt-6">
            <Rise step={3}><Eyebrow>End of week {slide.week}</Eyebrow></Rise>
            <Rise step={4} className="mt-2 font-display text-2xl leading-snug text-ink">{slide.chapter.cliffhanger}</Rise>
          </div>
        </div>
      );
    default: {
      const open = (story.threads || []).filter((t) => t.status !== 'closed').slice(-3);
      return (
        <div className="flex h-full flex-col justify-center">
          <Rise><Eyebrow>Next up</Eyebrow></Rise>
          <Rise step={1} className="mt-4"><h2 className="font-display text-3xl leading-tight text-ink">{story.arc?.logline}</h2></Rise>
          <div className="mt-6 space-y-4">
            {open.map((thread, i) => (
              <Rise key={thread.id} step={i + 2} className="border-t border-line pt-3">
                <div className="text-base font-semibold text-ink">{thread.title}</div>
                <div className="text-sm text-ink-2">{thread.note}</div>
              </Rise>
            ))}
          </div>
        </div>
      );
    }
  }
}

export default function StoryPage() {
  const [location, setLocation] = useState(() => ({ hash: window.location.hash }));
  const { hash } = location;
  const [catalogResult, setCatalogResult] = useState({ status: 'loading' });
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ status: 'loading' });
  const [index, setIndex] = useState(0);
  const track = useRef(null);
  const suppressScroll = useRef(false);

  useEffect(() => {
    const changed = () => setLocation({ hash: window.location.hash });
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  useEffect(() => {
    let active = true;
    loadCatalog().then((value) => { if (active) setCatalogResult(value); });
    return () => { active = false; };
  }, [refresh]);

  const route = useMemo(() => resolveStoryRoute(parseStoryRoute(location.hash), catalogResult.catalog), [location, catalogResult.catalog]);
  const identityKey = route.kind === 'team' ? JSON.stringify([route.leagueId, route.season, route.rosterId]) : '';
  const league = catalogResult.catalog?.leagues.find((item) => item.leagueId === route.leagueId && item.season === route.season);
  const selectedTeam = league?.teams.find((team) => team.rosterId === route.rosterId);
  const story = result.key === identityKey && result.status === 'ready' ? result.story : null;
  const slides = useMemo(() => story ? buildSlides(story) : [], [story]);
  const currentWeek = slides[index]?.week || null;
  const color = `var(--team-${route.rosterId}, var(--gold))`;

  useEffect(() => {
    if (catalogResult.status !== 'ready' || route.kind !== 'team') return;
    const canonical = formatStoryRoute(route);
    if (hash !== canonical) {
      window.history.replaceState(null, '', canonical);
    }
  }, [catalogResult.status, hash, route]);

  useEffect(() => {
    if (!identityKey || catalogResult.status !== 'ready') return;
    let active = true;
    const [leagueId, season, rosterId] = JSON.parse(identityKey);
    loadStory({ leagueId, season, rosterId: Number(rosterId) }).then((value) => {
      if (active) setResult({ ...value, key: identityKey });
    });
    return () => { active = false; };
  }, [identityKey, catalogResult.status, refresh]);

  // Route changes position the track before scroll events may update the URL.
  useLayoutEffect(() => {
    if (!story || !track.current) return;
    const exists = !route.week || slides.some((slide) => slide.week === route.week);
    const target = exists && route.week ? firstSlideOfWeek(slides, route.week) : 0;
    suppressScroll.current = true;
    track.current.scrollLeft = target * track.current.clientWidth;
    const frame = requestAnimationFrame(() => { setIndex(target); suppressScroll.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [story, slides, route]);

  const unavailableWeek = story && route.week && !slides.some((slide) => slide.week === route.week);
  const notice = unavailableWeek && index === 0 ? `Week ${route.week} is not available for this team. Showing the cover.` : '';
  useEffect(() => {
    if (unavailableWeek) window.history.replaceState(null, '', formatStoryRoute({ ...route, week: null }));
  }, [unavailableWeek, route]);

  const goTo = useCallback((next) => {
    const el = track.current;
    if (!el || !slides.length) return;
    const target = Math.min(Math.max(next, 0), slides.length - 1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }, [slides.length]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof Element && event.target.closest('input, select, textarea, button, a, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index]);

  useEffect(() => {
    const resize = () => { if (track.current) track.current.scrollLeft = index * track.current.clientWidth; };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [index]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth || suppressScroll.current) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(next);
    const path = formatStoryRoute({ ...route, week: slides[next]?.week || null });
    window.history.replaceState(null, '', path);
  };
  const onTap = (event) => {
    if (window.getSelection()?.toString()) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    goTo(index + ((event.clientX - left) / width < PREVIOUS_ZONE ? -1 : 1));
  };
  const chooseTeam = (event) => {
    const team = league?.teams.find((item) => item.rosterId === Number(event.target.value));
    if (!team) return;
    const path = formatStoryRoute({ ...route, rosterId: team.rosterId, week: currentWeek });
    window.location.hash = path;
  };

  const loading = catalogResult.status === 'loading' || (catalogResult.status === 'ready' && route.kind === 'team' && result.key !== identityKey);
  let message = '';
  if (catalogResult.status !== 'ready' && !loading) message = catalogResult.message || 'Could not load the story catalog. Refresh it and try again.';
  else if (route.kind === 'invalid') message = 'This story link is not valid. Choose a team to continue.';
  else if (route.kind === 'empty') message = 'No stories have been written yet.';
  else if (route.kind === 'team' && !selectedTeam) message = 'This team is not in the story catalog. Choose another team.';
  else if (!loading && result.status === 'missing') message = "This team's story hasn't been written yet.";
  else if (!loading && result.status !== 'ready') message = result.message || 'Could not load this story. Please try again.';
  const pickerLeague = league || catalogResult.catalog?.leagues[0];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      <div className="mx-auto w-full max-w-md shrink-0 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <label htmlFor="story-team" className="text-sm text-ink-2">Team</label>
          <select id="story-team" value={selectedTeam ? String(selectedTeam.rosterId) : ''} onChange={(event) => {
            if (league) chooseTeam(event);
            else {
              const team = pickerLeague?.teams.find((item) => item.rosterId === Number(event.target.value));
              if (team) window.location.hash = formatStoryRoute({ ...pickerLeague, rosterId: team.rosterId });
            }
          }} className="min-w-0 flex-1 rounded border border-line bg-page px-2 py-2 text-ink" disabled={!pickerLeague}>
            {!selectedTeam && <option value="">Choose a team</option>}
            {pickerLeague?.teams.map((team) => <option key={team.rosterId} value={team.rosterId}>{team.team}{team.available ? '' : ' — Not written yet'}</option>)}
          </select>
          <button type="button" onClick={() => { setLocation({ hash: window.location.hash }); setRefresh((value) => value + 1); }} className="min-h-11 px-1 text-sm text-gold">Refresh</button>
          <a href="#/win-probability" aria-label="Close the story" className="flex min-h-11 min-w-11 items-center justify-center text-2xl leading-none text-ink-2 hover:text-ink">×</a>
        </div>
        {story && <div className="flex gap-1">
          {weekProgress(slides, index).map(({ week, share }) => <button key={week} type="button" onClick={() => goTo(firstSlideOfWeek(slides, week))} aria-label={`Go to week ${week}`} aria-current={week === currentWeek ? 'step' : undefined} className="flex-1 py-3"><span className="block h-1 overflow-hidden rounded-full bg-raised"><span className="block h-full bg-gold transition-[width] duration-300" style={{ width: `${share * 100}%` }} /></span></button>)}
        </div>}
        {story && <span className="text-sm text-ink-2">{currentWeek ? `Week ${currentWeek}` : story.team}</span>}
        {notice && story && <p role="status" className="text-sm text-ink-2">{notice}</p>}
      </div>
      {loading ? <p role="status" className="m-auto text-ink-2">Loading story…</p> : message ? <p role="status" className="m-auto px-6 text-center text-ink">{message}</p> : story && <div className="relative mx-auto min-h-0 w-full max-w-md flex-1">
        <div ref={track} onScroll={onScroll} onClick={onTap} className="story-track flex h-full cursor-pointer select-none overflow-x-auto">
          {slides.map((slide, i) => <section key={i} className="story-slide h-full w-full shrink-0 overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]" data-active={i === index} aria-hidden={i !== index}>{Math.abs(i - index) <= 1 && <Card slide={slide} story={story} active={i === index} color={color} />}</section>)}
        </div>
      </div>}
    </div>
  );
}
