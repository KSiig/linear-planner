import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

/** True on phone widths. iPad (820) and web stay on the wide layout. */
export function useNarrowLayout(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}
