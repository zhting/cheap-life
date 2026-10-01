/**
 * path.js —— A* 寻路。36×28 的网格上耗时不到 1ms。
 * 世界层专用：走路不是命令，坐标只存在于世界层，内核不知情。
 */

/**
 * 从 (sx,sy) 到 (tx,ty) 的最短路。walkable(x, y) => bool。
 * 返回路径数组 [[x,y], ...]（不含起点，含终点），不可达返回 null。
 */
export function findPath(sx, sy, tx, ty, walkable) {
  if (sx === tx && sy === ty) return [];
  if (!walkable(tx, ty)) return null;
  const W = 36, H = 28;
  const size = W * H;
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const open = [start];
  const came = new Int32Array(size).fill(-1);
  const g = new Float64Array(size).fill(Infinity);
  const inOpen = new Uint8Array(size);
  const closed = new Uint8Array(size);
  g[start] = 0;
  inOpen[start] = 1;
  const f = new Float64Array(size).fill(Infinity);
  f[start] = Math.abs(tx - sx) + Math.abs(ty - sy);
  while (open.length > 0) {
    // 取 f 最小的（网格小，线性扫描足够）
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (f[open[i]] < f[open[bi]]) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === goal) {
      const path = [];
      let c = cur;
      while (c !== start) {
        path.push([c % W, Math.floor(c / W)]);
        c = came[c];
      }
      path.reverse();
      return path;
    }
    closed[cur] = 1;
    const cx = cur % W, cy = Math.floor(cur / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni] || !walkable(nx, ny)) continue;
      const ng = g[cur] + 1;
      if (ng < g[ni]) {
        came[ni] = cur;
        g[ni] = ng;
        f[ni] = ng + Math.abs(tx - nx) + Math.abs(ty - ny);
        if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
      }
    }
  }
  return null;
}
