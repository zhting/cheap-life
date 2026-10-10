/**
 * pixel-text.js —— 把系统字体“像素化”：小字号画到离屏画布，按透明度二值化成方块，
 * 再整数放大，加一圈墨色描边和下方投影。中文不用下载像素字库，也能得到像素标题。
 */

const FONT_STACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif';

/**
 * 画像素字到 canvas 上，返回逻辑尺寸。
 * opts: size（原始字号，越小越“像素”）、scale（放大倍数）、fill、outline、shadow、threshold
 */
export function drawPixelText(canvas, text, opts = {}) {
  const size = opts.size || 16;
  const scale = opts.scale || 4;
  const threshold = opts.threshold == null ? 110 : opts.threshold;
  const pad = 2; // 描边 1 + 投影 1
  // 1. 原始字号排一遍，量出宽度
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `bold ${size}px ${FONT_STACK}`;
  const tw = Math.ceil(probe.measureText(text).width);
  const w = tw + pad * 2 + 1;
  const h = size + 4 + pad * 2;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const g = src.getContext("2d");
  g.font = probe.font;
  g.textBaseline = "middle";
  g.fillStyle = "#000";
  g.fillText(text, pad, Math.round(h / 2));
  const img = g.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = img[i * 4 + 3] >= threshold ? 1 : 0;
  // 2. 描边 = 字形向八个方向膨胀 1 格；投影 = 描边下移 1 格
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? on[y * w + x] : 0);
  const outline = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on[y * w + x]) continue;
      for (let dy = -1; dy <= 1 && !outline[y * w + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) { outline[y * w + x] = 1; break; }
      }
    }
  }
  // 3. 放大输出
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.round(scale * dpr));
  canvas.width = w * px;
  canvas.height = (h + 1) * px;
  canvas.style.width = (w * px) / dpr + "px";
  canvas.style.height = ((h + 1) * px) / dpr + "px";
  const o = canvas.getContext("2d");
  o.clearRect(0, 0, canvas.width, canvas.height);
  const paint = (mask, color, oy) => {
    o.fillStyle = color;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!mask[y * w + x]) { x++; continue; }
        const x0 = x;
        while (x < w && mask[y * w + x]) x++;
        o.fillRect(x0 * px, (y + oy) * px, (x - x0) * px, px);
      }
    }
  };
  if (opts.shadow) {
    const both = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) both[i] = on[i] | outline[i];
    paint(both, opts.shadow, 1);
  }
  if (opts.outline) paint(outline, opts.outline, 0);
  paint(on, opts.fill || "#1a1c2c", 0);
  // 高光：每个笔画最上面一行提亮，像招牌字的受光面
  if (opts.highlight) {
    const top = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on[y * w + x] && !at(x, y - 1)) top[y * w + x] = 1;
    paint(top, opts.highlight, 0);
  }
  return { width: (w * px) / dpr, height: ((h + 1) * px) / dpr };
}
