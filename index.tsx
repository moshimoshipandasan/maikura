/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// THREEとPointerLockControlsはCDNからロードされるため、
// 型エラーを避けるためにTypeScriptにグローバル変数として宣言します。
declare const THREE: any;
import { formatFps, formatCoords } from './src/world/hud.ts';
import { FpsLogger, AutoPlayer, installValidationHotkeys, registerValidationContext, runEditStressTest } from './src/world/validation.ts';
import { BlockId, CHUNK_SIZE, CHUNK_HEIGHT } from './src/world/types.ts';
import { generateChunk } from './src/world/generator.ts';

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
// 色空間・トーンマッピング設定（発色とダイナミックレンジの改善）
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

// --- ライティング ---
// ベースは環境＋半球＋平行光の3点構成
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x444422, 0.45); // 空色/地面反射
scene.add(hemi);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.bias = -0.0005; // シャドウアクネ軽減
scene.add(directionalLight);

// --- ワールド生成 ---
const objects: any[] = [];
const blockMeshes = new Map<string, THREE.Mesh>();
const chunkRadius = 0;
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
// マテリアルは再利用してメモリとパフォーマンスを最適化
// ---- テクスチャ生成（外部アセットが無い環境でも動く簡易版）----
function makeCanvas(w:number, h:number) {
    const c = document.createElement('canvas'); c.width=w; c.height=h; return c;
}
function lerp(a:number,b:number,t:number){ return a+(b-a)*t; }
function rgb(r:number,g:number,b:number){ return `rgb(${r|0},${g|0},${b|0})`; }
function noiseTex(c1:[number,number,number], c2:[number,number,number], w=32, h=32, bias=0.5, contrast=1.1, gamma=1.0) {
    const c = makeCanvas(w,h); const ctx = c.getContext('2d')!; const img = ctx.createImageData(w,h);
    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            let t = Math.min(1, Math.max(0, (Math.random()*0.8 + bias)));
            // コントラストとガンマ（見た目のノリを調整）
            t = Math.pow((t-0.5)*contrast + 0.5, gamma);
            const r = lerp(c1[0], c2[0], t);
            const g = lerp(c1[1], c2[1], t);
            const b = lerp(c1[2], c2[2], t);
            const i = (y*w + x)*4; img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
        }
    }
    ctx.putImageData(img,0,0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}
function grassTopTex(){ return noiseTex([40,140,40],[90,200,90], 32,32, 0.33, 1.15, 1.0); }
function dirtTex(){ return noiseTex([78,50,38],[125,90,65], 32,32, 0.55, 1.12, 1.0); }
function stoneTex(){ return noiseTex([120,120,120],[175,175,175], 32,32, 0.50, 1.18, 1.0); }
function sandTex(){ return noiseTex([212,198,150],[238,226,184], 32,32, 0.58, 1.08, 1.0); }
function woodSideTex(){
    const c = makeCanvas(32,32); const ctx = c.getContext('2d')!;
    ctx.fillStyle = rgb(140,110,90); ctx.fillRect(0,0,32,32);
    ctx.fillStyle = rgb(110,85,70);
    for(let x=0;x<32;x+=4){ ctx.fillRect(x,0,2,32); }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter; return tex;
}
function woodTopTex(){
    const c = makeCanvas(32,32); const ctx = c.getContext('2d')!;
    ctx.fillStyle = rgb(160,125,95); ctx.fillRect(0,0,32,32);
    ctx.strokeStyle = rgb(120,95,75); ctx.lineWidth = 1;
    for(let r=2;r<16;r+=3){ ctx.beginPath(); ctx.arc(16,16,r,0,Math.PI*2); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter; return tex;
}

// テクスチャ付きマテリアル（Lambert）
const matGrassTop  = new THREE.MeshLambertMaterial({ map: grassTopTex() });
const matGrassSide = new THREE.MeshLambertMaterial({ map: (function(){
    // 側面は緑→土の縦グラデーション風
    const c = makeCanvas(32,32); const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0,0,0,32);
    g.addColorStop(0, rgb(90,200,90));
    g.addColorStop(0.5, rgb(80,150,80));
    g.addColorStop(0.55, rgb(120,85,60));
    g.addColorStop(1, rgb(100,70,50));
    ctx.fillStyle = g; ctx.fillRect(0,0,32,32);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter; tex.encoding = THREE.sRGBEncoding; return tex;
})() });
const matDirt  = new THREE.MeshLambertMaterial({ map: dirtTex() });
const matStone = new THREE.MeshLambertMaterial({ map: stoneTex() });
const matSand  = new THREE.MeshLambertMaterial({ map: sandTex() });
const matWoodSide = new THREE.MeshLambertMaterial({ map: woodSideTex() });
const matWoodTop  = new THREE.MeshLambertMaterial({ map: woodTopTex() });
const matMagma = new THREE.MeshLambertMaterial({ color: 0xff5722, emissive: 0x991700 });
const matObsidian = new THREE.MeshLambertMaterial({ color: 0x2d2d46 });

// ブロック種別（グラスは面ごとに異素材、他は単一）
const grassMaterials = [
    matGrassSide, // +X 右
    matGrassSide, // -X 左
    matGrassTop,  // +Y 上
    matDirt,      // -Y 下（土）
    matGrassSide, // +Z 前
    matGrassSide, // -Z 後
];
const woodMaterials = [
    matWoodSide, matWoodSide, matWoodTop, matWoodTop, matWoodSide, matWoodSide
];
const waterMaterial = new THREE.MeshLambertMaterial({ color: 0x3f76e4, transparent: true, opacity: 0.65, depthWrite: false });

const OBSIDIAN_DEPTH = 3;

const palette = [
  { key: 'grass', label: 'Grass', block: BlockId.Grass, mat: grassMaterials },
  { key: 'dirt', label: 'Dirt', block: BlockId.Dirt, mat: matDirt },
  { key: 'stone', label: 'Stone', block: BlockId.Stone, mat: matStone },
  { key: 'sand', label: 'Sand', block: BlockId.Sand, mat: matSand },
  { key: 'wood', label: 'Wood', block: BlockId.Wood, mat: woodMaterials },
  { key: 'magma', label: 'Magma', block: BlockId.Magma, mat: matMagma },
  { key: 'obsidian', label: 'Obsidian', block: BlockId.Obsidian, mat: matObsidian },
  { key: 'water', label: 'Water', block: BlockId.Water, mat: waterMaterial },
];
let selectedIndex = 2;
const paletteByKey = new Map(palette.map(p => [p.key, p]));

const hotbarEl = document.getElementById('hotbar');
if (hotbarEl) {
  hotbarEl.innerHTML = palette.map((entry, i) => `
    <div class="slot${i === selectedIndex ? ' active' : ''}" data-slot="${i + 1}">${i + 1}<br/>${entry.label}</div>
  `).join('');
}
reflectHotbar();

function materialFor(block: BlockId): any {
  switch (block) {
    case BlockId.Grass: return grassMaterials;
    case BlockId.Dirt: return matDirt;
    case BlockId.Sand: return matSand;
    case BlockId.Wood: return woodMaterials;
    case BlockId.Magma: return matMagma;
    case BlockId.Obsidian: return matObsidian;
    case BlockId.Water: return waterMaterial;
    case BlockId.Stone:
    default: return matStone;
  }
}

function meshKey(wx: number, wy: number, wz: number) {
  return `${wx},${wy},${wz}`;
}

function placeBlockMesh(wx: number, wy: number, wz: number, block: BlockId) {
  if (block === BlockId.Air) return;
  removeBlockMesh(wx, wy, wz);
  const mat = materialFor(block);
  const mesh = new THREE.Mesh(cubeGeometry, mat);
  mesh.position.set(wx, wy, wz);
  if (block === BlockId.Water) {
    mesh.renderOrder = 1;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
  } else {
    mesh.receiveShadow = true;
  }
  scene.add(mesh);
  if (block !== BlockId.Water) objects.push(mesh);
  blockMeshes.set(meshKey(wx, wy, wz), mesh);
}

function removeBlockMesh(wx: number, wy: number, wz: number) {
  const key = meshKey(wx, wy, wz);
  const mesh = blockMeshes.get(key);
  if (!mesh) return;
  scene.remove(mesh);
  const idx = objects.indexOf(mesh);
  if (idx >= 0) objects.splice(idx, 1);
  blockMeshes.delete(key);
}

function populateWorld() {
  for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
    for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
      const chunk = generateChunk('world-seed', cx, cz);
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            const block = chunk.get(x, y, z);
            if (block === BlockId.Air) continue;
            const wy = y + 0.5;
            placeBlockMesh(wx, wy, wz, block);
          }
        }
      }
    }
  }
}

populateWorld();


// --- プレイヤーコントロールと物理演算 ---
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
        case 'Digit6': selectHotbar(5); break;
        case 'Digit7': selectHotbar(6); break;
        case 'Digit8': selectHotbar(7); break;
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

// 物理・接地判定用レイ（編集とは別に持つ）
const groundRay = new THREE.Raycaster();
const sideRay = new THREE.Raycaster();
const upRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

document.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) return; // 届く範囲を制限

        const normal = intersect.face?.normal;
        if (!normal) return;
        if (event.button === 2) { // place
            const selected = palette[selectedIndex];
            const newCenter = intersect.object.position.clone().add(normal);
            const wx = Math.round(newCenter.x);
            const wy = Math.round(newCenter.y * 10) / 10;
            const wz = Math.round(newCenter.z);
            removeBlockMesh(wx, wy, wz);
            placeBlockMesh(wx, wy, wz, selected.block);
            persistEdit({ x: wx, y: wy, z: wz }, selected.key);
        } else if (event.button === 0) { // break
            const center = intersect.object.position;
            const wx = Math.round(center.x);
            const wy = Math.round(center.y * 10) / 10;
            const wz = Math.round(center.z);
            removeBlockMesh(wx, wy, wz);
            persistEdit({ x: wx, y: wy, z: wz }, null);
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

        // ---- 安全な水平移動の算出（壁めり込み防止 + ステップアップ対応）----
        const playerObj = controls.getObject();
        const playerPos = playerObj.position;
        const playerHeight = 1.75;   // 目線高（カメラ基準）
        const playerRadius = 0.35;   // カプセル半径相当（壁との最小距離）
        const smallStep = 0.15;      // 微小段差（そのまま踏破）
        const maxAutoJump = 1.2;     // オートジャンプで越えられる最大段差（~1ブロック）
        const jumpImpulse = 10;      // Space と同じジャンプ力
        const autoJumpEnabled = true;

        // 提案水平移動量（カメラ軸）
        let dx = -playerVelocity.x * delta; // 右(+)/左(-)
        let dz = -playerVelocity.z * delta; // 前(+)/後(-)

        // カメラ軸 → ワールド軸に変換して実際の移動方向を得る
        const camForward = new THREE.Vector3();
        controls.getDirection(camForward); camForward.y = 0; camForward.normalize();
        const camRight = new THREE.Vector3().copy(camForward).cross(UP).normalize();
        const moveWorld = new THREE.Vector3().addScaledVector(camRight, dx).addScaledVector(camForward, dz);

        // 横壁ヒット時にスライド/停止させる（足元高さでチェック）
        const footY = playerPos.y - (playerHeight - 0.2);
        const moveLen = moveWorld.length();
        let blocked = false;
        if (moveLen > 1e-6) {
            const dir = moveWorld.clone().divideScalar(moveLen);
            sideRay.set(new THREE.Vector3(playerPos.x, footY, playerPos.z), dir);
            sideRay.near = 0;
            sideRay.far = moveLen + playerRadius;
            const hits = sideRay.intersectObjects(objects, false);
            if (hits.length > 0) {
                const h = hits[0];
                const allow = Math.max(0, h.distance - playerRadius);
                // 許容移動ベクトル（ワールド）をカメラ軸へ逆投影して moveRight/moveForward に反映
                const allowedWorld = dir.clone().multiplyScalar(allow);
                dx = allowedWorld.dot(camRight);
                dz = allowedWorld.dot(camForward);
                blocked = allow + 0.02 < moveLen; // 進行量が抑制された（ヒステリシス）
            }
        }

        // 先の足元で接地面が少し高い場合はステップアップ
        const aheadProbe = moveLen > 1e-6 ? moveWorld.clone().setLength(playerRadius + 0.1) : new THREE.Vector3();
        const probeX = playerPos.x + aheadProbe.x;
        const probeZ = playerPos.z + aheadProbe.z;
        const currentGround = (() => {
            groundRay.set(new THREE.Vector3(playerPos.x, playerPos.y + 0.5, playerPos.z), DOWN);
            groundRay.near = 0; groundRay.far = playerHeight + 2;
            const g = groundRay.intersectObjects(objects, false);
            return g.length ? g[0].point.y : -Infinity;
        })();
        const aheadGround = (() => {
            groundRay.set(new THREE.Vector3(probeX, playerPos.y + 0.5, probeZ), DOWN);
            groundRay.near = 0; groundRay.far = playerHeight + 2;
            const g = groundRay.intersectObjects(objects, false);
            return g.length ? g[0].point.y : -Infinity;
        })();
        if (aheadGround > -Infinity && currentGround > -Infinity) {
            const diff = aheadGround - currentGround;
            if (diff > 0 && diff <= smallStep && playerVelocity.y <= 0.01) {
                // ごく小さい段差は滑らかに乗り越え
                playerPos.y = aheadGround + playerHeight;
                playerVelocity.y = 0;
                canJump = true;
            } else if (
                autoJumpEnabled && blocked && canJump && playerVelocity.y <= 0.01 &&
                diff > smallStep && diff <= maxAutoJump
            ) {
                // 1ブロック程度の段差は自動ジャンプで越える
                // 事前に頭上クリアランスを確認
                const headOrigin = new THREE.Vector3(probeX, currentGround + playerHeight * 0.5, probeZ);
                upRay.set(headOrigin, UP);
                upRay.near = 0; upRay.far = playerHeight;
                const headHits = upRay.intersectObjects(objects, false);
                const hasClearance = headHits.length === 0 || headHits[0].distance > playerHeight * 0.8;
                if (hasClearance) {
                    playerVelocity.y = Math.max(playerVelocity.y, jumpImpulse);
                    canJump = false;
                }
            }
        }

        // 移動を適用（安全に制限された dx/dz を使用）
        if (dx) controls.moveRight(dx);
        if (dz) controls.moveForward(dz);
        playerObj.position.y += playerVelocity.y * delta;
        
        // 衝突判定
        const playerPos2 = controls.getObject().position;
        groundRay.set(playerPos2, DOWN);
        groundRay.near = 0; groundRay.far = playerHeight + 2;
        const groundIntersections = groundRay.intersectObjects(objects, false);

        if (groundIntersections.length > 0 && groundIntersections[0].distance < playerHeight) {
            playerPos2.y = groundIntersections[0].point.y + playerHeight;
            playerVelocity.y = 0;
            canJump = true;
        }

        if (playerPos2.y < -20) { // ワールドから落ちた場合のリセット
            playerVelocity.y = 0;
            playerPos2.set(0, 20, 0);
        }
        
        // ブロック設置/破壊用のヘルパー表示
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(objects, false);
        if (intersects.length > 0 && intersects[0].distance < 8) {
            const intersect = intersects[0];
            const normal = intersect.face?.normal;
            if (normal) {
                const preview = intersect.object.position.clone().add(normal);
                rollOverMesh.position.set(
                    Math.round(preview.x),
                    Math.round(preview.y * 10) / 10,
                    Math.round(preview.z)
                );
            }
            rollOverMesh.visible = true;
        } else {
            rollOverMesh.visible = false;
        }
    }

    renderer.render(scene, camera);

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
    placeMaterial: matStone,
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
function selectHotbar(i: number) { selectedIndex = Math.max(0, Math.min(palette.length - 1, i)); reflectHotbar(); }

// ---- 簡易永続化（localStorage） ----
type EditMap = { [posKey: string]: string | null };
function keyFromPos(x: number, y: number, z: number) { return `${x},${y},${z}`; }
const LS_KEY = 'blockworld_edits_v1';
function loadEdits(): EditMap { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveEdits(map: EditMap) { try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* ignore */ } }

const editState: EditMap = loadEdits();

function persistEdit(coords: { x: number; y: number; z: number }, key: string | null) {
  const posKey = keyFromPos(coords.x, coords.y, coords.z);
  if (key === null) delete editState[posKey];
  else editState[posKey] = key;
  saveEdits(editState);
}

function applyEdits() {
  for (const [posKey, blockKey] of Object.entries(editState)) {
    const [x, y, z] = posKey.split(',').map(Number);
    removeBlockMesh(x, y, z);
    if (blockKey) {
      const entry = paletteByKey.get(blockKey);
      if (entry) placeBlockMesh(x, y, z, entry.block);
    }
  }
}

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
