// WFRC chart helpers for Observable JS (Observable Plot, d3).
//
//   ```{ojs}
//   import {wfrcColors, wfrcPlot} from "./_extensions/wfrc-brand/assets/charts/wfrc-charts.js"
//   wfrcPlot({Plot, marks: [Plot.lineY(data, {x: "date", y: "value", stroke: "mode"})]})
//   ```
//
// Colors are the --wfrc-chart-N CSS variables set by the theme, so charts follow light and dark
// mode on their own. Use at most five categories, in this order. Gold (series 4) is below 3:1 on
// white: label series directly.

const FALLBACK = ["#1479B8", "#D2582A", "#8A5FB0", "#D6A21E", "#1FA0A6"];

export function wfrcColors() {
  const css = getComputedStyle(document.documentElement);
  return FALLBACK.map((fallback, i) => css.getPropertyValue(`--wfrc-chart-${i + 1}`).trim() || fallback);
}

export function wfrcPlot({ Plot, color = {}, ...options } = {}) {
  const P = Plot ?? window.Plot;
  if (!P) throw new Error("Observable Plot is not loaded; pass it as {Plot}.");
  return P.plot({
    style: { fontFamily: "Inter, sans-serif", fontSize: "12px", background: "transparent" },
    color: { range: wfrcColors(), ...color },
    ...options,
  });
}
