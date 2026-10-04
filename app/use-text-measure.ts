import { RefObject, useLayoutEffect, useMemo, useState } from "react";
import { MeasureText } from "./axis-names";

// A measure for text drawn inside the given element at the given size. Each
// form is the leading part of a CSS font shorthand, such as "bold" or "italic
// bold"; the measure gives the width of the widest form, so a name cut to fit
// with it fits in every one of them. Null until the element is mounted, and
// replaced by a new function when a web font finishes loading.
export function useTextMeasure(
  ref: RefObject<Element | null>,
  forms: readonly string[],
  fontSize: number,
): MeasureText | null {
  const [font, setFont] = useState<{ family: string; loads: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const read = () => {
      const family = getComputedStyle(element).fontFamily;
      setFont((previous) => ({ family, loads: (previous?.loads ?? 0) + 1 }));
    };
    read();
    // Text measured before a web font arrives has the fallback font's widths.
    document.fonts?.addEventListener("loadingdone", read);
    return () => document.fonts?.removeEventListener("loadingdone", read);
  }, [ref]);

  const formsKey = forms.join("|");
  return useMemo(() => {
    if (!font) {
      return null;
    }
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
      return null;
    }
    const fonts = formsKey
      .split("|")
      .map((form) => `${form} ${fontSize}px ${font.family}`);
    const widths = new Map<string, number>();
    return (text: string) => {
      let width = widths.get(text);
      if (width == null) {
        width = 0;
        for (const each of fonts) {
          context.font = each;
          width = Math.max(width, context.measureText(text).width);
        }
        widths.set(text, width);
      }
      return width;
    };
    // font.loads is a dependency so that a font load gives a new measure.
  }, [font, formsKey, fontSize]);
}
