import { useId, useState } from 'react';

// Always shown on a larger screen. On a phone it sits behind a button so it doesn't push the content down.
export default function HelpText({ children, className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="min-h-11 pr-3 text-xs font-medium text-ink-2 sm:hidden"
      >
        <span aria-hidden="true">ⓘ </span>How this works
      </button>
      <p id={id} className={`text-xs text-ink-3 ${open ? 'mb-2' : 'max-sm:hidden'}`}>{children}</p>
    </div>
  );
}
