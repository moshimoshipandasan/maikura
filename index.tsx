/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// THREEとPointerLockControlsはCDNからロードされるため、
// 型エラーを避けるためにTypeScriptにグローバル変数として宣言します。
declare const THREE: any;
import { formatFps, formatCoords } from './src/world/hud.ts';
import { FpsLogger, AutoPlayer, installValidationHotkeys, registerValidationContext, runEditStressTest } from './src/world/validation.ts';
import { ChunkManager } from './src/world/chunkManager.ts';
import { generateChunk } from './src/world/generator.ts';
import { meshChunk } from './src/world/mesher.ts';
import { CHUNK_SIZE } from './src/world/types.ts';

// --- シーン、カメラ、レンダラーのセットアップ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 空色
scene.fog = new THREE.Fog(0x87ceeb, 0, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- ライティング ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// --- ワールド（チャンク）生成 ---
const objects: any[] = []; // ユーザーが設置したブロック（個別メッシュ）
const terrainMeshes: any[] = []; // チャンクの地形メッシュ
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
// マテリアルは再利用してメモリとパフォーマンスを最適化
const grassMaterial = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
const dirtMaterial = new THREE.MeshLambertMaterial({ color: 0x795548 });
const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });
const sandMaterial  = new THREE.MeshLambertMaterial({ color: 0xE4D096 });
const woodMaterial  = new THREE.MeshLambertMaterial({ color: 0x8D6E63 });

const materials = [
  { key: 'grass', label: 'Grass', mat: grassMaterial },
  { key: 'dirt',  label: 'Dirt',  mat: dirtMaterial  },
  { key: 'stone', label: 'Stone', mat: stoneMaterial },
  { key: 'sand',  label: 'Sand',  mat: sandMaterial  },
  { key: 'wood',  label: 'Wood',  mat: woodMaterial  },
];
let selectedIndex = 2; // Stone
function getSelectedMaterial() { return materials[selectedIndex].mat; }

const chunkManager = new ChunkManager('seed1', 2);
const loadedChunks = new Map<string, any>(); // key: "cx,cz" → THREE.Mesh
function chunkKey(cx: number, cz: number) { return `${cx},${cz}`; }
function buildChunkMesh(cx: number, cz: number) {
  const gen = generateChunk(chunkManager.seed, cx, cz);
  const m = meshChunk(gen.blocks);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  geom.setIndex(new THREE.Uint32BufferAttribute(m.indices, 1));
  geom.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x66bb6a });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  mesh.receiveShadow = true;
  scene.add(mesh);
  terrainMeshes.push(mesh);
  loadedChunks.set(chunkKey(cx, cz), mesh);
  chunkManager.onChunkGenerated({ key: { seed: chunkManager.seed, cx, cz }, blocks: gen.blocks });
}
function unloadChunkByKey(k: string) {
  const mesh = loadedChunks.get(k);
  if (!mesh) return;
  scene.remove(mesh);
  const idx = terrainMeshes.indexOf(mesh);
  if (idx >= 0) terrainMeshes.splice(idx, 1);
  loadedChunks.delete(k);
  const [sx, sz] = k.split(',').map(Number);
  chunkManager.onChunkUnloaded(sx, sz);
}// --- プレイヤーコントロールと物理演算 ---
const controls = new THREE.PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const crosshair = document.getElementById('crosshair');
// 検証用表示領域（HUD下部に追加）
const hud = document.getElementById('hud');
const validationEl = document.createElement('div');
validationEl.id = 'validation';
validationEl.style.marginTop = '6px';
validationEl.style.opacity = '0.85';
validationEl.textContent = 'Validation: (T=both / Y=auto / U=fps)';
hud?.appendChild(validationEl);

instructions?.addEventListener('click', () => { controls.lock(); }, false);
controls.addEventListener('lock', () => {
    if (blocker && crosshair) {
        blocker.style.display = 'none';
        crosshair.style.display = 'block';
    }
    // URL パラメータでの自動テスト起動
    const params = new URLSearchParams(location.search);
    const auto = params.get('autotest');
    const secs = Number(params.get('secs') ?? '30');
    if (auto === '1' || auto === 'true') {
        if (!fpsLogger || !fpsLogger.isRunning()) { startFps(secs); }
        if (!autoPlayer.isRunning()) { autoPlayer.start(); }
    }
});
controls.addEventListener('unlock', () => {
    if (blocker && crosshair) {
        blocker.style.display = 'flex';
        crosshair.style.display = 'none';
    }
});

// --- バリデーション支援（FPSロガー & オートプレイ）---
let fpsLogger: FpsLogger | null = null;
const autoPlayer = new AutoPlayer();

function startFps(seconds: number) {
    const el = validationEl;
    fpsLogger = new FpsLogger(seconds, (stats) => {
        el.textContent = `Validation: done | avg=${stats.avg.toFixed(1)} min=${stats.min.toFixed(1)} samples=${stats.samples}`;
    });
    fpsLogger.start();
    validationEl.textContent = `Validation: running ${seconds}s...`;
}

installValidationHotkeys({
    onToggleAuto: () => {
        if (autoPlayer.isRunning()) { autoPlayer.stop(); validationEl.textContent = 'Validation: auto=OFF'; }
        else { autoPlayer.start(); validationEl.textContent = 'Validation: auto=ON'; }
    },
    onStartFpsLog: (secs) => startFps(secs),
});

scene.add(controls.getObject());

const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const baseSpeed = 10.0;
const gravity = 30.0;
let canJump = false;

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'ShiftLeft': moveState.sprint = true; break;
        case 'Digit1': selectHotbar(0); break;
        case 'Digit2': selectHotbar(1); break;
        case 'Digit3': selectHotbar(2); break;
        case 'Digit4': selectHotbar(3); break;
        case 'Digit5': selectHotbar(4); break;
        case 'Space': if (canJump) { playerVelocity.y += 10; canJump = false; } break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
        case 'ShiftLeft': moveState.sprint = false; break;
    }
});


// --- ブロック操作 ---
const raycaster = new THREE.Raycaster();
const rollOverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.01, 1.01, 1.01),
    new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
);
scene.add(rollOverMesh);

document.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(terrainMeshes.concat(objects), false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) return; // 届く範囲を制限

        if (event.button === 2) { // 右クリック: ブロックを置く
            const newCube = new THREE.Mesh(cubeGeometry, getSelectedMaterial());
            { const p = intersect.point; const n = intersect.face.normal; const snap = new THREE.Vector3( Math.floor(p.x + n.x*0.5)+0.5, Math.floor(p.y + n.y*0.5)+0.5, Math.floor(p.z + n.z*0.5)+0.5 ); newCube.position.copy(snap); }
            newCube.castShadow = true;
            newCube.receiveShadow = true;
            scene.add(newCube);
            objects.push(newCube);
            persistEdit(newCube.position, materials[selectedIndex].key);
        } else if (event.button === 0) { // 左クリック: ブロックを壊す
            if (intersect.object !== scene) {
                persistEdit(intersect.object.position, null);
                scene.remove(intersect.object);
                objects.splice(objects.indexOf(intersect.object), 1);
            }
        }
    }
});
document.addEventListener('contextmenu', (event) => event.preventDefault());


// --- ウィンドウリサイズ対応 ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- レンダリングループ ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const fps = 1 / Math.max(delta, 1e-6);

    if (controls.isLocked) {
        // 摩擦と重力で速度を減衰
        playerVelocity.x -= playerVelocity.x * 10.0 * delta;
        playerVelocity.z -= playerVelocity.z * 10.0 * delta;
        playerVelocity.y -= gravity * delta;

        // 入力に基づいて移動方向を決定
        playerDirection.z = Number(moveState.forward) - Number(moveState.backward);
        playerDirection.x = Number(moveState.right) - Number(moveState.left);
        playerDirection.normalize(); // 斜め移動でも速度が同じになるように正規化

        const speed = baseSpeed * (moveState.sprint ? 1.8 : 1.0);
        if (moveState.forward || moveState.backward) playerVelocity.z -= playerDirection.z * speed * delta * 10;
        if (moveState.left || moveState.right) playerVelocity.x -= playerDirection.x * speed * delta * 10;

        // 移動を適用
        controls.moveRight(-playerVelocity.x * delta);
        controls.moveForward(-playerVelocity.z * delta);
        controls.getObject().position.y += playerVelocity.y * delta;
        
        // 衝突判定
        const playerPos = controls.getObject().position;
        raycaster.set(playerPos, new THREE.Vector3(0, -1, 0));
        const groundIntersections = raycaster.intersectObjects(terrainMeshes.concat(objects), false);

        if (groundIntersections.length > 0 && groundIntersections[0].distance < 1.75) {
            playerPos.y = groundIntersections[0].point.y + 1.75;
            playerVelocity.y = 0;
            canJump = true;
        }

        if (playerPos.y < -20) { // ワールドから落ちた場合のリセット
            playerVelocity.y = 0;
            playerPos.set(0, 20, 0);
        }
        
        // ブロック設置/破壊用のヘルパー表示
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(terrainMeshes.concat(objects), false);
        if (intersects.length > 0 && intersects[0].distance < 8) {
            const intersect = intersects[0];
            { const p = intersect.point; const n = intersect.face.normal; const snap = new THREE.Vector3( Math.floor(p.x + n.x*0.5)+0.5, Math.floor(p.y + n.y*0.5)+0.5, Math.floor(p.z + n.z*0.5)+0.5 ); rollOverMesh.position.copy(snap); }
            rollOverMesh.visible = true;
        } else {
            rollOverMesh.visible = false;
        }
    }

        // チャンクストリーミング（プレイヤー位置に追従）
    const upd = chunkManager.updatePlayerPosition(controls.getObject().position.x, controls.getObject().position.z);
    for (const k of upd.unload) unloadChunkByKey(k);
    let processed = 0; let req;
    while (processed < 1 && (req = chunkManager.nextRequest())) { buildChunkMesh(req.cx, req.cz); processed++; }renderer.render(scene, camera);

    // HUD 更新
    const fpsEl = document.getElementById('fps');
    const coordsEl = document.getElementById('coords');
    if (fpsEl && coordsEl) {
        const p = controls.getObject().position;
        fpsEl.textContent = formatFps(fps);
        coordsEl.textContent = formatCoords(p.x, p.y, p.z);
    }
    // 検証ログ
    if (fpsLogger && fpsLogger.isRunning()) {
        fpsLogger.tick(fps);
    }
}

animate();

// ---- Validation wiring ----
registerValidationContext({
    scene,
    camera,
    raycaster,
    objects,
    cubeGeometry,
    placeMaterial: stoneMaterial,
    getPlayerPosition: () => ({ ...controls.getObject().position })
});

function runAndReportEditStress(cycles:number) {
    const res = runEditStressTest(cycles);
    if (res) {
        const within = Math.abs(res.dx) <= 0.01 && Math.abs(res.dy) <= 0.01 && Math.abs(res.dz) <= 0.01;
        validationEl.textContent = `EditStress: done d=(${res.dx.toFixed(3)}, ${res.dy.toFixed(3)}, ${res.dz.toFixed(3)}) pass=${within}`;
        // eslint-disable-next-line no-console
        console.log('[EditStress] done', { ...res, pass: within });
    } else {
        validationEl.textContent = 'EditStress: ctx unavailable';
    }
}

installValidationHotkeys({
    onToggleAuto: () => {
        if (autoPlayer.isRunning()) { autoPlayer.stop(); validationEl.textContent = 'Validation: auto=OFF'; }
        else { autoPlayer.start(); validationEl.textContent = 'Validation: auto=ON'; }
    },
    onStartFpsLog: (secs) => startFps(secs),
    onEditStress: (cycles) => runAndReportEditStress(cycles),
});

// URL パラメータによる EditStress 起動（Pointer Lock 不要）
{
    const params = new URLSearchParams(location.search);
    const es = params.get('editstress');
    if (es) {
        const n = Math.max(1, Math.min(1000, Number(es)));
        setTimeout(() => runAndReportEditStress(n), 500);
    }
}

// ---- ホットバーの見た目更新と選択 ----
function reflectHotbar() {
    const slots = Array.from(document.querySelectorAll('#hotbar .slot')) as HTMLElement[];
    slots.forEach((el, i) => el.classList.toggle('active', i === selectedIndex));
}
function selectHotbar(i: number) { selectedIndex = Math.max(0, Math.min(materials.length - 1, i)); reflectHotbar(); }

// ---- 簡易永続化（localStorage） ----
type EditMap = { [posKey: string]: string | null };
function keyFromPos(p: any) { return `${Math.round(p.x*1000)/1000},${Math.round(p.y*1000)/1000},${Math.round(p.z*1000)/1000}`; }
const LS_KEY = 'blockworld_edits_v1';
function loadEdits(): EditMap { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveEdits(map: EditMap) { try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* ignore */ } }
function persistEdit(pos: any, type: string | null) { const map = loadEdits(); map[keyFromPos(pos)] = type; saveEdits(map); }
function applyEdits() {
    const map = loadEdits();
    const eps = 1e-6;
    const findAt = (x:number,y:number,z:number) => objects.find((o:any) => Math.abs(o.position.x - x)<eps && Math.abs(o.position.y - y)<eps && Math.abs(o.position.z - z)<eps);
    for (const [k, v] of Object.entries(map)) {
        const [x,y,z] = k.split(',').map(Number);
        const target = findAt(x,y,z);
        if (v === null) {
            if (target) { scene.remove(target); objects.splice(objects.indexOf(target),1); }
        } else {
            if (!target) {
                const idx = materials.findIndex(m=>m.key===v);
                const m = idx>=0? materials[idx].mat : stoneMaterial;
                const cube = new THREE.Mesh(cubeGeometry, m);
                cube.position.set(x,y,z);
                cube.castShadow = true; cube.receiveShadow = true;
                scene.add(cube); objects.push(cube);
            } else {
                const idx = materials.findIndex(m=>m.key===v);
                const mat = idx>=0? materials[idx].mat : stoneMaterial;
                target.material = mat;
            }
        }
    }
}

// 初期ロード時に反映
applyEdits();

// ---- E2E helpers (for Playwright) ----
// Expose minimal debug API to drive smoke interactions in tests.
(window as any).__e2e = {
    lock: () => controls.lock(),
    isLocked: () => controls.isLocked,
    getFpsText: () => document.getElementById('fps')?.textContent,
    getCoordsText: () => document.getElementById('coords')?.textContent,
    getObjectsCount: () => objects.length,
    rightClick: () => document.dispatchEvent(new MouseEvent('mousedown', { button: 2 })),
    leftClick: () => document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })),
};
