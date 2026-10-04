import { useLayoutEffect, useRef, useState } from "react";

// What the target heatmap and the ranked chart of a direction lay out alike,
// so that the same member's name reads the same on both.

// A card narrower than this gets the narrow layout.
export const NARROW_BELOW = 480;
// The forms a name is drawn in, each the leading part of a CSS font shorthand.
// A name is measured at the widest of them, so its text is the same in every
// state.
export const NAME_FORMS = ["bold", "italic bold"];

export interface NameLayout {
  narrow: boolean;
  // The font size of the names.
  fontSize: number;
  // The space reserved for an attacker's name: fits a 15-character bold name
  // at both widths. A wider name is cut to fit.
  attackerNameSpace: number;
}

// Depends only on the card's width, never on the members.
export function nameLayout(cardWidth: number): NameLayout {
  const narrow = cardWidth < NARROW_BELOW;
  return {
    narrow,
    fontSize: narrow ? 9 : 10,
    attackerNameSpace: narrow ? 86 : 96,
  };
}

// The width of an element's content box and the device pixel ratio, kept up
// to date as either changes. Width is 0 until first measured.
export function useMeasuredWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [measured, setMeasured] = useState({ width: 0, devicePixelRatio: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const width = element.clientWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;
      setMeasured((previous) =>
        previous.width === width &&
        previous.devicePixelRatio === devicePixelRatio
          ? previous
          : { width, devicePixelRatio },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Zooming changes the device pixel ratio without always resizing the
    // element.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, measured] as const;
}
