/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// THREEとPointerLockControlsはCDNからロードされるため、
// 型エラーを避けるためにTypeScriptにグローバル変数として宣言します。
declare const THREE: any;
import { formatFps, formatCoords } from './src/world/hud.ts';
import { FpsLogger, AutoPlayer, installValidationHotkeys, registerValidationContext, runEditStressTest } from './src/world/validation.ts';

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

// --- ワールド生成 ---
const objects = [];
// ワールドを拡張（元: 32）。描画/操作の安定性と相談し 64 に調整。
const worldSize = 64;
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
// マテリアルは再利用してメモリとパフォーマンスを最適化
// ---- テクスチャ生成（外部アセットが無い環境でも動く簡易版）----
function makeCanvas(w:number, h:number) {
    const c = document.createElement('canvas'); c.width=w; c.height=h; return c;
}
function rand(n:number){ return Math.floor(Math.random()*n); }
function lerp(a:number,b:number,t:number){ return a+(b-a)*t; }
function rgb(r:number,g:number,b:number){ return `rgb(${r|0},${g|0},${b|0})`; }
function noiseTex(c1:[number,number,number], c2:[number,number,number], w=32, h=32, bias=0.5) {
    const c = makeCanvas(w,h); const ctx = c.getContext('2d')!; const img = ctx.createImageData(w,h);
    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            const t = Math.min(1, Math.max(0, (Math.random()*0.8 + bias)));
            const r = lerp(c1[0], c2[0], t);
            const g = lerp(c1[1], c2[1], t);
            const b = lerp(c1[2], c2[2], t);
            const i = (y*w + x)*4; img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
        }
    }
    ctx.putImageData(img,0,0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter;
    return tex;
}
function grassTopTex(){ return noiseTex([40,140,40],[90,200,90], 32,32, 0.35); }
function dirtTex(){ return noiseTex([80,52,40],[120,85,60], 32,32, 0.55); }
function stoneTex(){ return noiseTex([110,110,110],[160,160,160], 32,32, 0.5); }
function sandTex(){ return noiseTex([212,198,150],[236,224,180], 32,32, 0.55); }
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
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter; return tex;
})() });
const matDirt  = new THREE.MeshLambertMaterial({ map: dirtTex() });
const matStone = new THREE.MeshLambertMaterial({ map: stoneTex() });
const matSand  = new THREE.MeshLambertMaterial({ map: sandTex() });
const matWoodSide = new THREE.MeshLambertMaterial({ map: woodSideTex() });
const matWoodTop  = new THREE.MeshLambertMaterial({ map: woodTopTex() });

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
const materials = [
  { key: 'grass', label: 'Grass', mat: grassMaterials },
  { key: 'dirt',  label: 'Dirt',  mat: matDirt       },
  { key: 'stone', label: 'Stone', mat: matStone      },
  { key: 'sand',  label: 'Sand',  mat: matSand       },
  { key: 'wood',  label: 'Wood',  mat: woodMaterials },
];
let selectedIndex = 2; // Stone
function getSelectedMaterial() { return materials[selectedIndex].mat; }

for (let x = -worldSize / 2; x < worldSize / 2; x++) {
    for (let z = -worldSize / 2; z < worldSize / 2; z++) {
        // sinとcosを使って滑らかな地形を生成
        const height = Math.floor(Math.cos(x / 8) * 4 + Math.sin(z / 8) * 4) + 8;
        for (let y = 0; y < height; y++) {
            const material = y === height - 1 ? grassMaterial : (y > height - 4 ? dirtMaterial : stoneMaterial); // 草、土、石
            const cube = new THREE.Mesh(cubeGeometry, material);
            cube.position.set(x, y + 0.5, z);
            // 静的ブロックは影のキャストを無効化（大量オブジェクトでのコスト削減）
            cube.castShadow = false;
            cube.receiveShadow = true;
            scene.add(cube);
            objects.push(cube);
        }
    }
}


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

        if (event.button === 2) { // 右クリック: ブロックを置く
            const newCube = new THREE.Mesh(cubeGeometry, getSelectedMaterial());
            newCube.position.copy(intersect.object.position).add(intersect.face.normal);
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
            rollOverMesh.position.copy(intersect.object.position).add(intersect.face.normal);
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
