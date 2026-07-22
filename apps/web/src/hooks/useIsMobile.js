import { useEffect, useState } from "react";

/**
 * True when the viewport matches a max-width media query (default 768px).
 * Live-updates on resize / orientation change.
 */
export function useIsMobile(query = "(max-width: 768px)") {
  const read = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(read);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    // Initial value comes from useState(read); here we only subscribe to changes.
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

export default useIsMobile;
