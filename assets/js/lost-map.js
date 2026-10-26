// "Off the map": a generative Wasatch Front topo map for the 404 page.
// Each broken address seeds its own terrain, pin and route. Canvas draws the scene, real <a>
// elements sit on top of the stations so the map is fully keyboard and screen-reader usable.

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Improved Perlin noise (3D), so the terrain can drift slowly through time.
function makeNoise(seed) {
  const rnd = mulberry(seed), base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}

const isDark = () => document.body.classList.contains("quarto-dark") ||
  (!document.body.classList.contains("quarto-light") && matchMedia("(prefers-color-scheme: dark)").matches);

const THEME = {
  light: { water: "#cfe3ee", land: "#f4f2ef", high: "#9db9ca", minor: "rgba(0,57,91,.30)", index: "rgba(0,57,91,.62)", ink: "#16232c", casing: "#ffffff", paper: "#ffffff", ring: "#00395b" },
  dark:  { water: "#0b2233", land: "#0d2536", high: "#2e6a8a", minor: "rgba(143,203,230,.26)", index: "rgba(143,203,230,.58)", ink: "#e8eef2", casing: "#0a1f2e", paper: "#122e46", ring: "#bfe6f5" },
};

export function createLostMap({ d3, stage, seedText, stations, target, reduceMotion }) {
  const seed = hash(seedText), rnd = mulberry(seed ^ 0x9e3779b9);
  const noise = makeNoise(seed);
  const phase = rnd() * 6.28, ox = rnd() * 50, oy = rnd() * 50;
  const pin = { x: 0.80 + rnd() * 0.13, y: 0.2 + rnd() * 0.6 };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "lost-canvas";
  const layer = document.createElement("div");
  layer.className = "lost-layer";
  stage.append(canvas, layer);

  // The transit line runs north-south through the valley; each station is a site section.
  const line = t => ({ x: 0.60 + 0.03 * Math.sin(t * 5 + phase), y: 0.09 + 0.82 * t });
  const stationPos = stations.map((_, i) => line((i + 0.5) / stations.length));

  const anchors = stations.map((s, i) => {
    const a = document.createElement("a");
    a.className = "station" + (i === target ? " dest" : "");
    a.href = s.url;
    a.textContent = s.name;
    if (i === target) a.setAttribute("aria-label", `${s.name} (nearest station to the page you wanted)`);
    layer.append(a);
    return a;
  });
  const pinLabel = document.createElement("div");
  pinLabel.className = "pin-label";
  pinLabel.textContent = "You are here";
  layer.append(pinLabel);

  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };

  function field(nx, ny, aspect, time) {
    const v = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = i / (nx - 1), y = j / (ny - 1);
      const ridge = smooth(0.28, 0.95, x);                                          // mountains on the east side
      const lake = 0.34 * Math.exp(-(((x - 0.10) ** 2) / 0.016 + ((y - 0.32) ** 2) / 0.05)); // a lake to the northwest
      let a = 0.5, f = 1, n = 0;
      for (let o = 0; o < 4; o++) { n += a * noise(x * aspect * 3 * f + ox, y * 3 * f + oy, time * 0.12 + o); f *= 2; a *= 0.5; }
      v[j * nx + i] = 0.12 + 0.82 * ridge - lake + 0.34 * n * (0.35 + 0.65 * ridge);
    }
    return v;
  }

  function draw(ctx, W, H, time, { labels = false, theme = isDark() ? THEME.dark : THEME.light } = {}) {
    const aspect = W / H, ny = 72, nx = Math.round(ny * aspect);
    const values = field(nx, ny, aspect, time);
    const levels = d3.range(0.10, 1.2, 0.07);
    const sx = W / (nx - 1), sy = H / (ny - 1);
    ctx.save();
    ctx.fillStyle = theme.water; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(ctx.getTransform().a * sx, 0, 0, ctx.getTransform().d * sy, 0, 0);
    const path = d3.geoPath(null, ctx), px = 1 / Math.min(sx, sy);
    const land = d3.contours().size([nx, ny]).thresholds([0.10])(values)[0];
    ctx.beginPath(); path(land); ctx.fillStyle = theme.land; ctx.fill();
    const ramp = d3.interpolateRgb(theme.land, theme.high);
    d3.contours().size([nx, ny]).thresholds(levels)(values).forEach((c, i, all) => {
      ctx.beginPath(); path(c);
      ctx.fillStyle = ramp(Math.pow(i / (all.length - 1), 0.8)); ctx.fill();     // elevation bands, low to high
      ctx.strokeStyle = i % 4 === 0 ? theme.index : theme.minor;
      ctx.lineWidth = (i % 4 === 0 ? 1.8 : 1) * px * (W > 900 ? 1 : 0.8);
      ctx.stroke();
    });
    ctx.restore();

    const P = (p) => [p.x * W, p.y * H];
    // transit line: casing + color
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const trace = () => { ctx.beginPath(); for (let k = 0; k <= 60; k++) { const [x, y] = P(line(k / 60)); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
    trace(); ctx.strokeStyle = theme.casing; ctx.lineWidth = 11; ctx.stroke();
    trace(); ctx.strokeStyle = "#00799f"; ctx.lineWidth = 6; ctx.stroke();

    // route from the pin to the nearest station, plus a train riding it
    const [x0, y0] = P(pin), [x3, y3] = P(stationPos[target]);
    const c1 = [x0 - W * 0.12, y0 + (y3 - y0) * 0.1], c2 = [x3 + W * 0.14, y3];
    const route = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x3, y3); };
    route(); ctx.setLineDash([2, 12]); ctx.lineDashOffset = -time * 24; ctx.strokeStyle = "#c85327"; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
    const k = reduceMotion ? 0.55 : ((time / 4.2) % 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const tx = bez(x0, c1[0], c2[0], x3, e), ty = bez(y0, c1[1], c2[1], y3, e);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(tx, ty, 8, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#c85327"; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 6.3); ctx.fill();

    // stations
    stationPos.forEach((s, i) => {
      const [x, y] = P(s), r = i === target ? 10 : 7;
      ctx.fillStyle = i === target ? "#febc46" : theme.paper; ctx.strokeStyle = theme.ring; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      if (labels) { ctx.fillStyle = theme.ink; ctx.font = `600 ${Math.round(H / 38)}px Inter, system-ui, sans-serif`; ctx.textBaseline = "middle"; ctx.fillText(stations[i].name, x + r + 10, y); }
    });

    // you-are-here pin with a pulsing ring
    const pulse = reduceMotion ? 0.4 : (time % 1.6) / 1.6;
    ctx.strokeStyle = `rgba(200,83,39,${0.6 * (1 - pulse)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x0, y0, 10 + pulse * 26, 0, 6.3); ctx.stroke();
    ctx.fillStyle = "#c85327"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x0, y0, 9, 0, 6.3); ctx.fill(); ctx.stroke();
    return { pin: [x0, y0] };
  }

  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, t0 = performance.now(), alive = true;

  function layout() {
    const r = stage.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(360, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    stationPos.forEach((s, i) => { anchors[i].style.left = s.x * W + "px"; anchors[i].style.top = s.y * H + "px"; });
    pinLabel.style.left = pin.x * W + "px"; pinLabel.style.top = pin.y * H + "px";
    frame(performance.now(), true);
  }

  function frame(now, force) {
    if (!alive) return;
    const ctx = canvas.getContext("2d");
    const time = (now - t0) / 1000;
    if (force || now - last > 55) {                       // about 18 fps is plenty for slow drifting contours
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, W, H, reduceMotion ? 3 : time);
    }
    if (!reduceMotion) raf = requestAnimationFrame(t => frame(t, false));
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  const mo = new MutationObserver(() => frame(performance.now(), true));
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  layout();

  return {
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); },
    // A shareable poster: the same map, drawn large with a title strip.
    poster(title, subtitle) {
      const PW = 1600, PH = 1000, STRIP = 150, c = document.createElement("canvas");
      c.width = PW; c.height = PH + STRIP;
      const ctx = c.getContext("2d"), theme = isDark() ? THEME.dark : THEME.light;
      draw(ctx, PW, PH, 3, { labels: true, theme });
      ctx.fillStyle = "#00395b"; ctx.fillRect(0, PH, PW, STRIP);
      ctx.fillStyle = "#febc46"; ctx.font = "700 54px Inter, system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
      ctx.fillText(title, 48, PH + 70);
      ctx.fillStyle = "#e8eef2"; ctx.font = "500 28px Inter, system-ui, sans-serif";
      ctx.fillText(subtitle, 48, PH + 116);
      ctx.textAlign = "right"; ctx.fillText("wfrcanalytics.github.io", PW - 48, PH + 116);
      return new Promise(res => c.toBlob(res, "image/png"));
    },
  };
}
