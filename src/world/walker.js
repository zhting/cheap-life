/**
 * walker.js —— 格子移动与补间：每步 16 像素、8 帧补间（约每秒 6 步），
 * 按住方向键连续行走；点击寻路时按 A* 路径逐格走。
 * 走路不是命令：坐标只存在于世界层，内核不知情。
 */
import { TILE } from "./palette.js";

export function makeWalker(tx, ty) {
  return {
    tx, ty, // 所在格
    px: tx * TILE, py: ty * TILE, // 像素位置（补间中）
    dir: 0, // 0 下 1 上 2 左 3 右
    frame: 0,
    animT: 0,
    moving: false,
    path: [], // 剩余路径（格子坐标）
  };
}

/**
 * 每帧推进。held: {up,down,left,right}；arrive: 到达一个新格子时回调 (walker)。
 * blocked(x, y) => bool（目标格是否不可走）。
 */
export function stepWalker(w, held, dt, blocked, arrive) {
  if (!w.moving && w.path.length > 0) {
    const next = w.path[0];
    const dir = next[0] > w.tx ? 3 : next[0] < w.tx ? 2 : next[1] > w.ty ? 0 : 1;
    if (!blocked(next[0], next[1])) {
      w.path.shift();
      w.moving = true;
      w.fromX = w.px;
      w.fromY = w.py;
      w.toX = next[0] * TILE;
      w.toY = next[1] * TILE;
      w.t = 0;
      w.dir = dir;
    } else {
      w.path = [];
    }
  }
  if (!w.moving) {
    let dx = 0, dy = 0;
    if (held.left) dx = -1;
    else if (held.right) dx = 1;
    else if (held.up) dy = -1;
    else if (held.down) dy = 1;
    if (dx || dy) {
      w.dir = dx > 0 ? 3 : dx < 0 ? 2 : dy > 0 ? 0 : 1;
      const nx = w.tx + dx, ny = w.ty + dy;
      if (!blocked(nx, ny)) {
        w.moving = true;
        w.path = [];
        w.fromX = w.px;
        w.fromY = w.py;
        w.tx = nx;
        w.ty = ny;
        w.toX = nx * TILE;
        w.toY = ny * TILE;
        w.t = 0;
      }
    }
  }
  if (w.moving) {
    w.t += dt * 6 / 0.125; // 8 帧/步 ≈ 每步 0.125s
    if (w.t >= 1) {
      w.t = 1;
    }
    const ease = w.t;
    w.px = Math.round(w.fromX + (w.toX - w.fromX) * ease);
    w.py = Math.round(w.fromY + (w.toY - w.fromY) * ease);
    w.animT += dt;
    w.frame = Math.floor(w.animT * 12) % 2 + (w.t >= 1 ? 0 : 1);
    if (w.t >= 1) {
      w.moving = false;
      w.frame = 0;
      w.animT = 0;
      if (arrive) arrive(w);
    }
  }
}

/** 追加一条寻路路径（点击寻路）；新点击取消旧路径 */
export function setPath(w, path) {
  w.path = path ? path.slice() : [];
}
