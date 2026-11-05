/** Macbeth-style 24-patch chart + grayscale + skin ramps, in sRGB 8-bit. */

const MACBETH: [number, number, number][] = [
  [115, 82, 68],
  [194, 150, 130],
  [98, 122, 157],
  [87, 108, 67],
  [133, 128, 177],
  [103, 189, 170],
  [214, 126, 44],
  [80, 91, 166],
  [193, 90, 99],
  [94, 60, 108],
  [157, 188, 64],
  [224, 163, 46],
  [56, 61, 150],
  [70, 148, 73],
  [175, 54, 60],
  [231, 199, 31],
  [187, 86, 149],
  [8, 133, 161],
  [243, 243, 242],
  [200, 200, 200],
  [160, 160, 160],
  [122, 122, 121],
  [85, 85, 85],
  [52, 52, 52],
];

const SKIN: [number, number, number][] = [
  [89, 47, 42],
  [141, 85, 67],
  [198, 134, 106],
  [224, 172, 145],
  [80, 58, 44],
  [120, 90, 70],
];

export function drawTestChart(w = 960, h = 720): ImageData {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c8c2b8";
  ctx.fillRect(0, 0, w, h);

  const pad = Math.round(w * 0.06);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // 6x4 Macbeth
  const cols = 6;
  const rows = 4;
  const gap = 8;
  const chartH = Math.round(innerH * 0.58);
  const pw = (innerW - gap * (cols - 1)) / cols;
  const ph = (chartH - gap * (rows - 1)) / rows;
  MACBETH.forEach((rgb, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(pad + col * (pw + gap), pad + row * (ph + gap), pw, ph);
  });

  // grayscale ramp
  const gy = pad + chartH + 18;
  const gh = Math.round(innerH * 0.12);
  const steps = 21;
  const gw = innerW / steps;
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(pad + i * gw, gy, gw + 1, gh);
  }

  // skin + primaries
  const sy = gy + gh + 16;
  const sh = innerH - (sy - pad);
  const blocks = [
    ...SKIN,
    [220, 40, 40],
    [40, 180, 70],
    [40, 80, 210],
    [240, 200, 40],
    [20, 20, 20],
    [245, 245, 242],
  ];
  const bw = innerW / blocks.length;
  blocks.forEach((rgb, i) => {
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(pad + i * bw, sy, bw + 1, sh);
  });

  return ctx.getImageData(0, 0, w, h);
}
