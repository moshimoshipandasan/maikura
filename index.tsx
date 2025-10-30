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

function snowTex(){ return noiseTex([225, 230, 240],[255,255,255],32,32,0.65,1.02,1.1); }
function mudTex(){ return noiseTex([62,45,32],[90,65,48],32,32,0.55,1.18,0.9); }
function mossTex(){ return noiseTex([35,90,45],[70,150,80],32,32,0.45,1.2,1.05); }
function obsidianTex(){ return noiseTex([25, 20, 45],[55, 40, 85],32,32,0.45,1.25,1.2); }
function tntTex(lit = false) {
    const c = makeCanvas(32,32); const ctx = c.getContext('2d')!;
    ctx.fillStyle = lit ? '#ff5a3c' : '#c4281c';
    ctx.fillRect(0,0,32,32);
    ctx.fillStyle = lit ? '#fff4d0' : '#f8f8f8';
    for(let x=0;x<32;x+=6){ ctx.fillRect(x,0,3,32); }
    ctx.fillStyle = lit ? '#311a0f' : '#22140c';
    ctx.fillRect(0,12,32,8);
    ctx.fillStyle = lit ? '#fff4d0' : '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 16, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipMapNearestFilter; tex.encoding = THREE.sRGBEncoding;
    return tex;
}

const matSnow = new THREE.MeshLambertMaterial({ map: snowTex() });
const matMud  = new THREE.MeshLambertMaterial({ map: mudTex() });
const matMoss = new THREE.MeshLambertMaterial({ map: mossTex() });
const matObsidian = new THREE.MeshLambertMaterial({ map: obsidianTex() });
const matTnt = new THREE.MeshLambertMaterial({ map: tntTex(false), emissive: new THREE.Color(0x2d0500), emissiveIntensity: 0.1 });
const matTntLit = new THREE.MeshLambertMaterial({ map: tntTex(true), emissive: new THREE.Color(0xff5a20), emissiveIntensity: 0.6 });

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
type BlockDef = {
    key: string;
    label: string;
    mat: any;
    iconClass: string;
};

const blockCatalog: BlockDef[] = [
  { key: 'grass', label: 'Grass', mat: grassMaterials, iconClass: 'icon-grass' },
  { key: 'dirt',  label: 'Dirt',  mat: matDirt,        iconClass: 'icon-dirt' },
  { key: 'stone', label: 'Stone', mat: matStone,       iconClass: 'icon-stone' },
  { key: 'sand',  label: 'Sand',  mat: matSand,        iconClass: 'icon-sand' },
  { key: 'wood',  label: 'Wood',  mat: woodMaterials,  iconClass: 'icon-wood' },
  { key: 'snow',  label: 'Snow',  mat: matSnow,        iconClass: 'icon-snow' },
  { key: 'mud',   label: 'Mud',   mat: matMud,         iconClass: 'icon-mud' },
  { key: 'moss',  label: 'Moss',  mat: matMoss,        iconClass: 'icon-moss' },
  { key: 'tnt',   label: 'TNT',   mat: matTnt,         iconClass: 'icon-tnt' },
  { key: 'obsidian', label: 'Obsidian', mat: matObsidian, iconClass: 'icon-obsidian' },
];

const blockMap = new Map(blockCatalog.map((entry) => [entry.key, entry]));

const DEFAULT_HOTBAR: string[] = ['grass', 'dirt', 'stone', 'sand', 'tnt'];
let hotbarKeys: string[] = [...DEFAULT_HOTBAR];
let selectedHotbarIndex = 2; // Stone
const HOTBAR_LS_KEY = 'blockworld_hotbar_v1';

function getBlockDef(key: string): BlockDef {
    return blockMap.get(key) ?? blockMap.get('stone')!;
}
function getSelectedBlockKey() { return hotbarKeys[selectedHotbarIndex]; }
function getSelectedMaterial() { return getBlockDef(getSelectedBlockKey()).mat; }

function loadHotbarFromStorage() {
    try {
        const raw = JSON.parse(localStorage.getItem(HOTBAR_LS_KEY) ?? '[]');
        if (Array.isArray(raw)) {
            for (let i = 0; i < hotbarKeys.length; i++) {
                const candidate = raw[i];
                hotbarKeys[i] = (typeof candidate === 'string' && blockMap.has(candidate)) ? candidate : DEFAULT_HOTBAR[i];
            }
        }
    } catch {
        hotbarKeys = [...DEFAULT_HOTBAR];
    }
}

function saveHotbarToStorage() {
    try {
        localStorage.setItem(HOTBAR_LS_KEY, JSON.stringify(hotbarKeys));
    } catch {
        /* ignore */
    }
}

type BiomeProfile = {
    top: string;
    subsurface: string;
    deep: string;
    transitionDepth: number;
    heightOffset: number;
};

function sampleBiome(x: number, z: number): BiomeProfile {
    const heat = Math.sin(x / 24) + Math.cos(z / 31);
    const moisture = Math.sin((x + z) / 37) + Math.cos((x - z) / 29);
    if (heat > 1.2) {
        return { top: 'sand', subsurface: 'sand', deep: 'stone', transitionDepth: 5, heightOffset: -1 };
    }
    if (heat < -1.1) {
        return { top: 'snow', subsurface: 'stone', deep: 'stone', transitionDepth: 4, heightOffset: 1 };
    }
    if (moisture > 1.0) {
        return { top: 'mud', subsurface: 'mud', deep: 'stone', transitionDepth: 4, heightOffset: -0.5 };
    }
    if (moisture < -1.0) {
        return { top: 'moss', subsurface: 'dirt', deep: 'stone', transitionDepth: 3, heightOffset: 0 };
    }
    return { top: 'grass', subsurface: 'dirt', deep: 'stone', transitionDepth: 3, heightOffset: 0 };
}

function materialFor(key: string) {
    return getBlockDef(key).mat;
}

loadHotbarFromStorage();

for (let x = -worldSize / 2; x < worldSize / 2; x++) {
    for (let z = -worldSize / 2; z < worldSize / 2; z++) {
        const biome = sampleBiome(x, z);
        const terrainBase = Math.cos(x / 8) * 3.5 + Math.sin(z / 8) * 3.5;
        const height = Math.max(2, Math.floor(terrainBase + 8 + biome.heightOffset));
        for (let y = 0; y < height; y++) {
            const layerFromTop = (height - 1) - y;
            let blockKey: string;
            if (y === height - 1) {
                blockKey = biome.top;
            } else if (layerFromTop < biome.transitionDepth) {
                blockKey = biome.subsurface;
            } else {
                blockKey = biome.deep;
            }
            if (y === 0) {
                blockKey = 'obsidian';
            }
            const material = materialFor(blockKey);
            const cube = new THREE.Mesh(cubeGeometry, material);
            cube.position.set(x, y + 0.5, z);
            cube.castShadow = false;
            cube.receiveShadow = true;
            cube.userData.blockKey = blockKey;
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
const hotbarEl = document.getElementById('hotbar');
const inventoryEl = document.getElementById('inventory');
const inventoryGrid = inventoryEl?.querySelector('.inventory-grid') as HTMLElement | null;
const inventoryCloseBtn = inventoryEl?.querySelector('[data-action="close"]') as HTMLButtonElement | null;
const inventoryHint = inventoryEl?.querySelector('.inventory-hint') as HTMLElement | null;
const validationEl = document.createElement('div');
validationEl.id = 'validation';
validationEl.style.marginTop = '6px';
validationEl.style.opacity = '0.85';
validationEl.textContent = 'Validation: (T=both / Y=auto / U=fps)';
hud?.appendChild(validationEl);

let inventoryOpen = false;
let pendingInventoryKey: string | null = null;
let relockAfterInventory = false;

instructions?.addEventListener('click', () => { controls.lock(); }, false);
controls.addEventListener('lock', () => {
    if (blocker) {
        blocker.style.display = 'none';
    }
    if (crosshair) {
        crosshair.style.display = inventoryOpen ? 'none' : 'block';
    }
    if (inventoryOpen) {
        applyInventoryVisibility();
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
    if (inventoryOpen) {
        if (blocker) {
            blocker.style.display = 'none';
        }
        if (crosshair) {
            crosshair.style.display = 'none';
        }
        applyInventoryVisibility();
    } else {
        if (blocker) {
            blocker.style.display = 'flex';
        }
        if (crosshair) {
            crosshair.style.display = 'none';
        }
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

function clearMovementState() {
    moveState.forward = false;
    moveState.backward = false;
    moveState.left = false;
    moveState.right = false;
    moveState.sprint = false;
}

function applyInventoryVisibility() {
    if (inventoryEl) {
        inventoryEl.classList.toggle('open', inventoryOpen);
        inventoryEl.setAttribute('aria-hidden', inventoryOpen ? 'false' : 'true');
    }
    document.body.classList.toggle('inventory-open', inventoryOpen);
    if (crosshair) {
        crosshair.style.display = inventoryOpen ? 'none' : (controls.isLocked ? 'block' : 'none');
    }
    if (blocker && inventoryOpen) {
        blocker.style.display = 'none';
    }
}

function openInventory() {
    if (inventoryOpen) return;
    inventoryOpen = true;
    relockAfterInventory = controls.isLocked;
    if (relockAfterInventory) {
        controls.unlock();
    }
    clearMovementState();
    playerVelocity.x = 0;
    playerVelocity.z = 0;
    setPendingInventoryKey(getSelectedBlockKey());
    applyInventoryVisibility();
}

function closeInventory() {
    if (!inventoryOpen) return;
    inventoryOpen = false;
    applyInventoryVisibility();
    setPendingInventoryKey(null);
    if (relockAfterInventory) {
        controls.lock();
    }
    relockAfterInventory = false;
}

applyInventoryVisibility();
buildInventoryGrid();
reflectInventorySelection();
selectHotbar(selectedHotbarIndex);

inventoryGrid?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.inventory-slot') as HTMLElement | null;
    if (!target) return;
    event.preventDefault();
    const key = target.dataset.key ?? null;
    if (!key) return;
    if (pendingInventoryKey === key && inventoryOpen) {
        assignHotbarSlot(selectedHotbarIndex, key);
    } else {
        setPendingInventoryKey(key);
    }
});

hotbarEl?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.slot') as HTMLElement | null;
    if (!target) return;
    event.preventDefault();
    const index = Number(target.dataset.index ?? '-1');
    if (Number.isNaN(index)) return;
    if (pendingInventoryKey) {
        assignHotbarSlot(index, pendingInventoryKey);
        setPendingInventoryKey(pendingInventoryKey);
    } else if (inventoryOpen) {
        const keyForSlot = hotbarKeys[index] ?? DEFAULT_HOTBAR[index] ?? 'stone';
        setPendingInventoryKey(keyForSlot);
        selectHotbar(index);
    } else {
        selectHotbar(index);
    }
});

inventoryCloseBtn?.addEventListener('click', () => closeInventory());
inventoryEl?.addEventListener('click', (event) => {
    if (event.target === inventoryEl) {
        closeInventory();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE') {
        event.preventDefault();
        if (inventoryOpen) { closeInventory(); } else { openInventory(); }
        return;
    }
    if (inventoryOpen) {
        if (event.code === 'Escape') {
            event.preventDefault();
            closeInventory();
        }
        return;
    }
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
    if (inventoryOpen) return;
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

const TNT_FUSE_MS = 2800;
const TNT_CHAIN_FUSE_MS = 1200;
const TNT_EXPLOSION_RADIUS = 3.5;
const activeTntFuses = new Map<any, number>();
const activeTntBlinkers = new Map<any, number>();

function isTntBlock(obj: any): boolean {
    return Boolean(obj?.userData?.blockKey === 'tnt');
}

function cancelTntTimers(target: any) {
    const fuse = activeTntFuses.get(target);
    if (fuse !== undefined) {
        window.clearTimeout(fuse);
        activeTntFuses.delete(target);
    }
    const blink = activeTntBlinkers.get(target);
    if (blink !== undefined) {
        window.clearInterval(blink);
        activeTntBlinkers.delete(target);
    }
    if (isTntBlock(target)) {
        target.material = matTnt;
    }
}

function removeBlock(mesh: any) {
    if (!mesh) return;
    cancelTntTimers(mesh);
    persistEdit(mesh.position, null);
    scene.remove(mesh);
    const idx = objects.indexOf(mesh);
    if (idx >= 0) objects.splice(idx, 1);
}

function igniteTnt(target: any, fuseMs = TNT_FUSE_MS) {
    if (!isTntBlock(target)) return;
    if (activeTntFuses.has(target)) return;
    target.material = matTntLit;
    let blinkState = false;
    if (fuseMs > 180) {
        const blinkId = window.setInterval(() => {
            blinkState = !blinkState;
            target.material = blinkState ? matTnt : matTntLit;
        }, Math.max(120, fuseMs / 6));
        activeTntBlinkers.set(target, blinkId);
    }
    const timeoutId = window.setTimeout(() => {
        activeTntFuses.delete(target);
        const blinkId = activeTntBlinkers.get(target);
        if (blinkId !== undefined) {
            window.clearInterval(blinkId);
            activeTntBlinkers.delete(target);
        }
        target.material = matTntLit;
        explodeTnt(target);
    }, fuseMs);
    activeTntFuses.set(target, timeoutId);
}

function explodeTnt(origin: any) {
    if (!origin || !origin.position) return;
    const center = origin.position.clone ? origin.position.clone() : new THREE.Vector3(origin.position.x, origin.position.y, origin.position.z);
    removeBlock(origin);
    createExplosionEffect(center);
    const radiusSq = TNT_EXPLOSION_RADIUS * TNT_EXPLOSION_RADIUS;
    const snapshot = objects.slice();
    snapshot.forEach((candidate) => {
        if (!candidate || !candidate.position) return;
        const dx = candidate.position.x - center.x;
        const dy = candidate.position.y - center.y;
        const dz = candidate.position.z - center.z;
        if ((dx * dx + dy * dy + dz * dz) > radiusSq) return;
        const key = candidate.userData?.blockKey;
        if (key === 'obsidian') return;
        if (key === 'tnt') {
            igniteTnt(candidate, Math.max(400, TNT_CHAIN_FUSE_MS));
            return;
        }
        removeBlock(candidate);
    });
}

function createExplosionEffect(center: any) {
    const light = new THREE.PointLight(0xffaa55, 2.8, TNT_EXPLOSION_RADIUS * 3.2);
    light.position.copy(center);
    scene.add(light);
    window.setTimeout(() => scene.remove(light), 200);
    const spriteMaterial = new THREE.SpriteMaterial({ color: 0xffaa55, transparent: true, opacity: 0.45, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(center);
    const size = TNT_EXPLOSION_RADIUS * 2;
    sprite.scale.set(size, size, 1);
    scene.add(sprite);
    window.setTimeout(() => {
        sprite.material.opacity = 0.2;
        sprite.scale.set(size * 1.35, size * 1.35, 1);
    }, 90);
    window.setTimeout(() => {
        scene.remove(sprite);
        spriteMaterial.dispose?.();
    }, 220);
}

// 物理・接地判定用レイ（編集とは別に持つ）
const groundRay = new THREE.Raycaster();
const sideRay = new THREE.Raycaster();
const upRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

document.addEventListener('mousedown', (event) => {
    if (inventoryOpen) {
        event.preventDefault();
        return;
    }
    if (!controls.isLocked) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) return; // 届く範囲を制限

        if (event.button === 2) { // 右クリック: ブロックを置く
            const blockKey = getSelectedBlockKey();
            const newCube = new THREE.Mesh(cubeGeometry, getSelectedMaterial());
            newCube.position.copy(intersect.object.position).add(intersect.face.normal);
            newCube.castShadow = true;
            newCube.receiveShadow = true;
            newCube.userData.blockKey = blockKey;
            scene.add(newCube);
            objects.push(newCube);
            persistEdit(newCube.position, blockKey);
        } else if (event.button === 0) { // 左クリック: ブロックを壊す / TNT を点火
            if (intersect.object !== scene) {
                const key = intersect.object.userData?.blockKey;
                if (key === 'tnt') {
                    igniteTnt(intersect.object);
                } else {
                    removeBlock(intersect.object);
                }
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
    placeMaterial: materialFor('stone'),
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

// ---- ホットバー & インベントリ ----
function buildInventoryGrid() {
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = '';
    blockCatalog.forEach((block) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-slot';
        button.dataset.key = block.key;
        button.setAttribute('aria-label', block.label);
        button.setAttribute('title', block.label);
        const icon = document.createElement('span');
        icon.className = `item-icon ${block.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        icon.dataset.key = block.key;
        button.appendChild(icon);
        inventoryGrid.appendChild(button);
    });
}

function reflectInventorySelection() {
    if (!inventoryGrid) return;
    const slots = Array.from(inventoryGrid.querySelectorAll('.inventory-slot')) as HTMLElement[];
    slots.forEach((slot) => {
        slot.classList.toggle('selected', pendingInventoryKey === slot.dataset.key);
    });
    if (inventoryHint) {
        if (pendingInventoryKey) {
            const block = getBlockDef(pendingInventoryKey);
            inventoryHint.textContent = `${block.label} を選択中 (ホットバーをクリック)`;
        } else {
            inventoryHint.textContent = 'アイテムをクリックしてホットバーへ移動 (E で閉じる)';
        }
    }
}

function reflectHotbar() {
    const slots = Array.from(document.querySelectorAll('#hotbar .slot')) as HTMLElement[];
    slots.forEach((el, i) => {
        const key = hotbarKeys[i] ?? DEFAULT_HOTBAR[i] ?? getSelectedBlockKey();
        const def = getBlockDef(key);
        const icon = el.querySelector('.slot-icon') as HTMLElement | null;
        if (icon) {
            icon.className = `slot-icon item-icon ${def.iconClass}`;
            icon.setAttribute('title', def.label);
            icon.setAttribute('aria-hidden', 'true');
            icon.dataset.key = def.key;
        }
        el.dataset.index = String(i);
        el.dataset.key = key;
        el.setAttribute('aria-label', `スロット${i + 1}: ${def.label}`);
        el.classList.toggle('active', i === selectedHotbarIndex);
    });
}

function selectHotbar(i: number) {
    selectedHotbarIndex = Math.max(0, Math.min(hotbarKeys.length - 1, i));
    reflectHotbar();
}

function assignHotbarSlot(index: number, key: string) {
    if (!blockMap.has(key)) return;
    const clamped = Math.max(0, Math.min(hotbarKeys.length - 1, index));
    hotbarKeys[clamped] = key;
    saveHotbarToStorage();
    selectHotbar(clamped);
}

function setPendingInventoryKey(key: string | null) {
    pendingInventoryKey = key && blockMap.has(key) ? key : null;
    reflectInventorySelection();
}

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
                const material = materialFor(v);
                const cube = new THREE.Mesh(cubeGeometry, material);
                cube.position.set(x,y,z);
                cube.castShadow = true; cube.receiveShadow = true;
                cube.userData.blockKey = v;
                scene.add(cube); objects.push(cube);
            } else {
                target.material = materialFor(v);
                target.userData.blockKey = v;
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
