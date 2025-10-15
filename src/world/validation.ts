export class FpsLogger {
  private targetSec: number;
  private startMs = 0;
  private count = 0;
  private sum = 0;
  private min = Infinity;
  private running = false;
  private onFinish?: (stats: { avg: number; min: number; samples: number; seconds: number }) => void;

  constructor(targetSec: number, onFinish?: (stats: { avg: number; min: number; samples: number; seconds: number }) => void) {
    this.targetSec = Math.max(1, Math.floor(targetSec));
    this.onFinish = onFinish;
  }
  start() { this.startMs = performance.now(); this.running = true; }
  stop() { this.running = false; }
  isRunning() { return this.running; }
  tick(fps: number) {
    if (!this.running) return;
    this.count++;
    this.sum += fps;
    if (fps < this.min) this.min = fps;
    const elapsed = (performance.now() - this.startMs) / 1000;
    if (elapsed >= this.targetSec) {
      this.running = false;
      const stats = { avg: this.sum / this.count, min: this.min, samples: this.count, seconds: this.targetSec };
      try { this.onFinish?.(stats); } catch { /* noop */ }
      // Also print to console in a structured form
      // eslint-disable-next-line no-console
      console.log('[FpsLogger] done', stats);
    }
  }
}

function dispatchKey(code: string, type: 'keydown'|'keyup') {
  const ev = new KeyboardEvent(type, { code, key: code.startsWith('Key') ? code.replace('Key','') : code, bubbles: true });
  document.dispatchEvent(ev);
}

export class AutoPlayer {
  private timer: number | null = null;
  private jumpTimer: number | null = null;
  private patternIndex = 0;
  private running = false;
  // simple square pattern: W → D → S → A
  private pattern: string[] = ['KeyW','KeyD','KeyS','KeyA'];

  start(stepMs = 1500, jumpMs = 1200) {
    if (this.running) return;
    this.running = true;
    // initial press
    dispatchKey(this.pattern[this.patternIndex], 'keydown');
    this.timer = window.setInterval(() => {
      // release current
      dispatchKey(this.pattern[this.patternIndex], 'keyup');
      // next
      this.patternIndex = (this.patternIndex + 1) % this.pattern.length;
      dispatchKey(this.pattern[this.patternIndex], 'keydown');
    }, stepMs);
    this.jumpTimer = window.setInterval(() => {
      dispatchKey('Space', 'keydown');
      // short tap
      setTimeout(() => dispatchKey('Space','keyup'), 40);
    }, jumpMs);
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.jumpTimer !== null) { clearInterval(this.jumpTimer); this.jumpTimer = null; }
    // release all movement keys
    ['KeyW','KeyA','KeyS','KeyD'].forEach(k => dispatchKey(k,'keyup'));
  }
  isRunning() { return this.running; }
}

export function installValidationHotkeys(opts: {
  onToggleAuto: () => void;
  onStartFpsLog: (secs: number) => void;
  onEditStress?: (cycles: number) => void;
}) {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyY') { // toggle autopilot
      opts.onToggleAuto();
    } else if (e.code === 'KeyU') { // start 30s fps logging
      opts.onStartFpsLog(30);
    } else if (e.code === 'KeyT') { // convenience: start both
      opts.onStartFpsLog(30);
      opts.onToggleAuto();
    } else if (e.code === 'KeyI') { // edit stress test (100 cycles)
      opts.onEditStress?.(100);
    }
  });
}

// ---- Acceptance helpers (edit/Destroy stress) ----
type ThreeLike = any;
type ValidationCtx = {
  scene: ThreeLike;
  camera: ThreeLike;
  raycaster: ThreeLike;
  objects: any[];
  cubeGeometry: ThreeLike;
  placeMaterial: ThreeLike;
  getPlayerPosition: () => { x: number; y: number; z: number };
};

let ctx: ValidationCtx | null = null;
export function registerValidationContext(c: ValidationCtx) { ctx = c; }

export function runEditStressTest(cycles = 100): { dx: number; dy: number; dz: number } | null {
  if (!ctx) return null;
  const { scene, camera, raycaster, objects, cubeGeometry, placeMaterial, getPlayerPosition } = ctx;
  const start = getPlayerPosition();
  for (let i = 0; i < cycles; i++) {
    // aim at center and intersect
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length === 0) continue;
    const h = hits[0];
    if (i % 2 === 0) {
      // place
      const newCube = new (scene.constructor as any).Mesh(cubeGeometry, placeMaterial);
      newCube.position.copy(h.object.position).add(h.face.normal);
      newCube.castShadow = true;
      newCube.receiveShadow = true;
      scene.add(newCube);
      objects.push(newCube);
    } else {
      // destroy
      scene.remove(h.object);
      const idx = objects.indexOf(h.object);
      if (idx >= 0) objects.splice(idx, 1);
    }
  }
  const end = getPlayerPosition();
  return { dx: end.x - start.x, dy: end.y - start.y, dz: end.z - start.z };
}
