import { useSyncExternalStore } from 'react';

// Matches Tailwind's `sm` breakpoint, for what CSS classes alone can't change.
const phone = window.matchMedia('(max-width: 639px)');

const subscribe = (onChange) => {
  phone.addEventListener('change', onChange);
  return () => phone.removeEventListener('change', onChange);
};

export default function useIsPhone() {
  return useSyncExternalStore(subscribe, () => phone.matches);
}
