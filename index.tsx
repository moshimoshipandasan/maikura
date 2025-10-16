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
const dropGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
type DropItem = { mesh: any; key: string; velocity: any; ttl: number };
const dropItems: DropItem[] = [];
const DROP_GRAVITY = 18;
const DROP_DAMPING = 0.65;
const DROP_BOUNCE = 0.35;
const DROP_GROUND_Y = 0.3;
const DROP_LIFETIME = 45;
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

const matSnow = new THREE.MeshLambertMaterial({ map: snowTex() });
const matMud  = new THREE.MeshLambertMaterial({ map: mudTex() });
const matMoss = new THREE.MeshLambertMaterial({ map: mossTex() });
const matObsidian = new THREE.MeshLambertMaterial({ map: obsidianTex() });

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
  { key: 'obsidian', label: 'Obsidian', mat: matObsidian, iconClass: 'icon-obsidian' },
];

const blockMap = new Map(blockCatalog.map((entry) => [entry.key, entry]));

const HOTBAR_SLOT_COUNT = 9;
const HOTBAR_STACK_LIMIT = 64;
const DEFAULT_HOTBAR: (string | null)[] = Array(HOTBAR_SLOT_COUNT).fill(null);
const DEFAULT_INVENTORY: InventoryCounts = {
    grass: HOTBAR_STACK_LIMIT,
    dirt: HOTBAR_STACK_LIMIT,
    stone: HOTBAR_STACK_LIMIT,
    sand: HOTBAR_STACK_LIMIT,
    wood: HOTBAR_STACK_LIMIT,
    snow: HOTBAR_STACK_LIMIT,
    mud: HOTBAR_STACK_LIMIT,
    moss: HOTBAR_STACK_LIMIT,
    obsidian: HOTBAR_STACK_LIMIT,
};
const HOTBAR_LS_KEY = 'blockworld_hotbar_v2';
const INVENTORY_LS_KEY = 'blockworld_inventory_v1';

type HotbarSlot = { key: string | null; count: number };
type InventoryCounts = { [key: string]: number };

let hotbarSlots: HotbarSlot[] = Array.from({ length: HOTBAR_SLOT_COUNT }, () => ({ key: null, count: 0 }));
let selectedHotbarIndex = 0;
let inventoryCounts: InventoryCounts = {};

function getBlockDef(key: string): BlockDef {
    return blockMap.get(key) ?? blockMap.get('stone')!;
}

function materialFor(key: string) {
    return getBlockDef(key).mat;
}

function getSelectedHotbarSlot(): HotbarSlot {
    return hotbarSlots[selectedHotbarIndex] ?? { key: null, count: 0 };
}

function getSelectedBlockKey(): string | null {
    return getSelectedHotbarSlot().key;
}

function getSelectedMaterial() {
    const key = getSelectedBlockKey();
    return materialFor(key ?? 'stone');
}

function loadInventoryFromStorage() {
    inventoryCounts = {};
    try {
        const raw = localStorage.getItem(INVENTORY_LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                    if (blockMap.has(key)) {
                        const count = Number(value);
                        if (Number.isFinite(count) && count > 0) {
                            inventoryCounts[key] = Math.floor(count);
                        }
                    }
                }
            }
        }
    } catch {
        inventoryCounts = {};
    }
    if (Object.keys(inventoryCounts).length === 0) {
        inventoryCounts = { ...DEFAULT_INVENTORY };
    }
}

function saveInventoryToStorage() {
    try {
        const cleaned: InventoryCounts = {};
        for (const [key, value] of Object.entries(inventoryCounts)) {
            if (value > 0) cleaned[key] = value;
        }
        localStorage.setItem(INVENTORY_LS_KEY, JSON.stringify(cleaned));
    } catch {
        /* ignore */
    }
}

function loadHotbarFromStorage() {
    try {
        const raw = localStorage.getItem(HOTBAR_LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (let i = 0; i < HOTBAR_SLOT_COUNT; i++) {
                    const entry = parsed[i];
                    if (entry && typeof entry === 'object' && 'key' in entry) {
                        const key = (entry as any).key;
                        const count = Number((entry as any).count);
                        if (typeof key === 'string' && blockMap.has(key)) {
                            const safeCount = Number.isFinite(count) ? Math.max(0, Math.min(HOTBAR_STACK_LIMIT, Math.floor(count))) : HOTBAR_STACK_LIMIT;
                            hotbarSlots[i] = { key, count: safeCount };
                            continue;
                        }
                    }
                    if (typeof entry === 'string' && blockMap.has(entry)) {
                        hotbarSlots[i] = { key: entry, count: HOTBAR_STACK_LIMIT };
                        continue;
                    }
                    const fallbackKey = DEFAULT_HOTBAR[i] ?? null;
                    hotbarSlots[i] = fallbackKey ? { key: fallbackKey, count: HOTBAR_STACK_LIMIT } : { key: null, count: 0 };
                }
                return;
            }
        }
    } catch {
        /* ignore */
    }
    hotbarSlots = Array.from({ length: HOTBAR_SLOT_COUNT }, () => ({ key: null, count: 0 }));
}

function saveHotbarToStorage() {
    try {
        const payload = hotbarSlots.map((slot) => slot.key ? { key: slot.key, count: slot.count } : { key: null, count: 0 });
        localStorage.setItem(HOTBAR_LS_KEY, JSON.stringify(payload));
    } catch {
        /* ignore */
    }
}

function getInventoryCount(key: string) {
    return inventoryCounts[key] ?? 0;
}

function increaseInventoryCount(key: string, amount: number) {
    if (!blockMap.has(key) || amount <= 0) return;
    inventoryCounts[key] = (inventoryCounts[key] ?? 0) + amount;
    saveInventoryToStorage();
    reflectInventoryCounts();
}

function decreaseInventoryCount(key: string, amount: number) {
    if (amount <= 0) return false;
    const current = inventoryCounts[key] ?? 0;
    if (current < amount) return false;
    const next = current - amount;
    if (next > 0) inventoryCounts[key] = next;
    else delete inventoryCounts[key];
    saveInventoryToStorage();
    reflectInventoryCounts();
    return true;
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

loadInventoryFromStorage();
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

const inventoryButtons = new Map<string, HTMLButtonElement>();

let inventoryOpen = false;
let pendingInventoryKey: string | null = null;
let pendingSourceSlot: number | null = null;
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
    const currentKey = getSelectedBlockKey();
    if (currentKey && getInventoryCount(currentKey) > 0) {
        setPendingInventoryKey(currentKey);
    } else {
        setPendingInventoryKey(null);
    }
    applyInventoryVisibility();
}

function closeInventory() {
    if (!inventoryOpen) return;
    inventoryOpen = false;
    applyInventoryVisibility();
    clearPendingSelections();
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
    if (!key || !blockMap.has(key)) return;
    if (pendingSourceSlot !== null) {
        moveSlotToInventory(pendingSourceSlot);
        pendingSourceSlot = null;
        reflectInventorySelection();
        return;
    }
    if (getInventoryCount(key) <= 0) return;
    if (event.shiftKey) {
        setPendingInventoryKey(key);
        return;
    }
    const assigned = assignHotbarSlot(selectedHotbarIndex, key);
    if (!assigned) {
        setPendingInventoryKey(key);
    }
});

hotbarEl?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.slot') as HTMLElement | null;
    if (!target) return;
    event.preventDefault();
    const index = Number(target.dataset.index ?? '-1');
    if (Number.isNaN(index)) return;
    const slot = hotbarSlots[index];
    if (pendingInventoryKey) {
        const assigned = assignHotbarSlot(index, pendingInventoryKey);
        if (assigned && pendingInventoryKey && getInventoryCount(pendingInventoryKey) <= 0) {
            pendingInventoryKey = null;
        }
        reflectInventorySelection();
        reflectHotbar();
    } else if (pendingSourceSlot !== null) {
        if (pendingSourceSlot === index) {
            pendingSourceSlot = null;
            reflectHotbar();
        } else {
            moveHotbarSlot(pendingSourceSlot, index);
        }
        reflectInventorySelection();
    } else if (inventoryOpen) {
        if (event.shiftKey) {
            moveSlotToInventory(index);
            reflectInventorySelection();
        } else if (slot.key) {
            pendingSourceSlot = index;
            reflectInventorySelection();
            reflectHotbar();
        } else {
            selectHotbar(index);
        }
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
        case 'Digit6': selectHotbar(5); break;
        case 'Digit7': selectHotbar(6); break;
        case 'Digit8': selectHotbar(7); break;
        case 'Digit9': selectHotbar(8); break;
        case 'KeyQ':
            if (controls.isLocked) {
                event.preventDefault();
                const slot = getSelectedHotbarSlot();
                if (slot.key && slot.count > 0) {
                    if (event.shiftKey) {
                        dropSelectedHotbarItem(slot.count);
                    } else {
                        dropSelectedHotbarItem(1);
                    }
                }
            }
            break;
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

document.addEventListener('wheel', (event) => {
    if (inventoryOpen) return;
    if (!controls.isLocked) return;
    if (event.deltaY === 0) return;
    event.preventDefault();
    cycleHotbar(event.deltaY > 0 ? 1 : -1);
}, { passive: false });


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
            const slot = getSelectedHotbarSlot();
            const blockKey = slot.key;
            if (!blockKey || slot.count <= 0) return;
            const material = materialFor(blockKey);
            const newCube = new THREE.Mesh(cubeGeometry, material);
            newCube.position.copy(intersect.object.position).add(intersect.face.normal);
            newCube.castShadow = true;
            newCube.receiveShadow = true;
            newCube.userData.blockKey = blockKey;
            scene.add(newCube);
            objects.push(newCube);
            persistEdit(newCube.position, blockKey);
            consumeHotbarItem(selectedHotbarIndex, 1);
        } else if (event.button === 0) { // 左クリック: ブロックを壊す
            if (intersect.object !== scene) {
                const dropKey = typeof intersect.object.userData?.blockKey === 'string'
                    ? intersect.object.userData.blockKey
                    : 'stone';
                persistEdit(intersect.object.position, null);
                scene.remove(intersect.object);
                const idx = objects.indexOf(intersect.object);
                if (idx >= 0) objects.splice(idx, 1);
                if (dropKey) {
                    const dropPos = intersect.object.position.clone().add(new THREE.Vector3(0, 0.6, 0));
                    spawnDrop(dropPos, dropKey);
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

updateDrops(delta);

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
    inventoryButtons.clear();
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

        const count = document.createElement('span');
        count.className = 'item-count';

        button.append(icon, count);
        inventoryButtons.set(block.key, button);
        inventoryGrid.appendChild(button);
    });
    reflectInventoryCounts();
    reflectInventorySelection();
}

function reflectInventoryCounts() {
    inventoryButtons.forEach((button, key) => {
        const count = getInventoryCount(key);
        const countEl = button.querySelector('.item-count') as HTMLElement | null;
        if (countEl) {
            countEl.textContent = count > 0 ? String(count) : '';
        }
        const isEmpty = count <= 0;
        button.classList.toggle('empty', isEmpty);
        button.disabled = isEmpty;
    });
}

function reflectInventorySelection() {
    inventoryButtons.forEach((button, key) => {
        button.classList.toggle('selected', pendingInventoryKey === key);
    });
    if (inventoryHint) {
        if (pendingInventoryKey) {
            const block = getBlockDef(pendingInventoryKey);
            inventoryHint.textContent = `${block.label} を選択中 (ホットバーをクリック / Shift+クリックで戻す)`;
        } else if (pendingSourceSlot !== null) {
            inventoryHint.textContent = '移動先のホットバースロットを選択してください (Shift+クリックで倉庫へ戻す)';
        } else {
            inventoryHint.textContent = 'クリックで選択中のホットバースロットへ補充 (Shift+クリックでスロット選択モード)';
        }
    }
}

function reflectHotbar() {
    const slots = Array.from(document.querySelectorAll('#hotbar .slot')) as HTMLElement[];
    slots.forEach((el, i) => {
        const slot = hotbarSlots[i] ?? { key: null, count: 0 };
        const key = slot.key;
        el.dataset.index = String(i);
        el.dataset.key = key ?? '';
        const icon = el.querySelector('.slot-icon') as HTMLElement | null;
        const def = key ? getBlockDef(key) : null;
        if (icon) {
            if (def) {
                icon.className = `slot-icon item-icon ${def.iconClass}`;
                icon.setAttribute('title', def.label);
                icon.dataset.key = def.key;
            } else {
                icon.className = 'slot-icon';
                icon.removeAttribute('title');
                icon.dataset.key = '';
            }
            icon.setAttribute('aria-hidden', 'true');
        }
        let countEl = el.querySelector('.slot-count') as HTMLElement | null;
        if (!countEl) {
            countEl = document.createElement('span');
            countEl.className = 'slot-count';
            el.appendChild(countEl);
        }
        countEl.textContent = key && slot.count > 0 ? String(slot.count) : '';
        const hasItem = !!key && slot.count > 0;
        el.classList.toggle('active', i === selectedHotbarIndex);
        el.classList.toggle('empty', !hasItem);
        el.classList.toggle('has-item', hasItem);
        el.classList.toggle('pending', pendingSourceSlot === i);
        el.setAttribute('aria-label', `スロット${i + 1}: ${def ? def.label : '空'}`);
    });
}

function clearPendingSelections() {
    pendingInventoryKey = null;
    pendingSourceSlot = null;
    reflectInventorySelection();
    reflectHotbar();
}

function selectHotbar(i: number) {
    selectedHotbarIndex = Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, i));
    pendingSourceSlot = null;
    reflectHotbar();
}

function cycleHotbar(delta: number) {
    const total = HOTBAR_SLOT_COUNT;
    const next = (selectedHotbarIndex + delta + total) % total;
    selectHotbar(next);
}

function moveSlotToInventory(index: number, opts: { skipReflect?: boolean } = {}) {
    const slot = hotbarSlots[index];
    if (!slot) return;
    if (pendingSourceSlot === index) {
        pendingSourceSlot = null;
    }
    if (slot.key && slot.count > 0) {
        increaseInventoryCount(slot.key, slot.count);
    }
    hotbarSlots[index] = { key: null, count: 0 };
    saveHotbarToStorage();
    if (!opts.skipReflect) {
        reflectHotbar();
        reflectInventoryCounts();
    }
}

function moveHotbarSlot(from: number, to: number) {
    if (from === to) return;
    const tmp = hotbarSlots[to];
    hotbarSlots[to] = hotbarSlots[from];
    hotbarSlots[from] = tmp;
    selectedHotbarIndex = to;
    saveHotbarToStorage();
    pendingSourceSlot = null;
    reflectHotbar();
}

function assignHotbarSlot(index: number, key: string) {
    if (!blockMap.has(key)) return false;
    const clamped = Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, index));
    const slot = hotbarSlots[clamped];
    const available = getInventoryCount(key);
    let assigned = false;
    if (slot.key === key) {
        if (available <= 0) return false;
        const needed = HOTBAR_STACK_LIMIT - slot.count;
        if (needed <= 0) return false;
        const amount = Math.min(available, needed);
        if (decreaseInventoryCount(key, amount)) {
            slot.count += amount;
            saveHotbarToStorage();
            reflectHotbar();
            reflectInventoryCounts();
            assigned = true;
        }
    } else {
        moveSlotToInventory(clamped, { skipReflect: true });
        if (available <= 0) {
            reflectHotbar();
            reflectInventoryCounts();
            return false;
        }
        const amount = Math.min(available, HOTBAR_STACK_LIMIT);
        if (decreaseInventoryCount(key, amount)) {
            hotbarSlots[clamped] = { key, count: amount };
            saveHotbarToStorage();
            reflectHotbar();
            reflectInventoryCounts();
            assigned = true;
        }
    }
    if (assigned) {
        selectedHotbarIndex = clamped;
        if (getInventoryCount(key) <= 0) {
            pendingInventoryKey = null;
        }
        reflectInventorySelection();
        return true;
    }
    return false;
}

function consumeHotbarItem(index: number, amount: number) {
    const slot = hotbarSlots[index];
    if (!slot || !slot.key || slot.count < amount) return false;
    slot.count -= amount;
    if (slot.count <= 0) {
        slot.key = null;
        slot.count = 0;
    }
    saveHotbarToStorage();
    reflectHotbar();
    return true;
}

function addToHotbarOrInventory(key: string, amount: number) {
    if (!blockMap.has(key) || amount <= 0) return;
    let remaining = amount;
    let updatedHotbar = false;
    for (const slot of hotbarSlots) {
        if (slot.key === key && slot.count < HOTBAR_STACK_LIMIT) {
            const add = Math.min(HOTBAR_STACK_LIMIT - slot.count, remaining);
            slot.count += add;
            remaining -= add;
            if (add > 0) updatedHotbar = true;
            if (remaining <= 0) break;
        }
    }
    if (remaining > 0) {
        for (const slot of hotbarSlots) {
            if (!slot.key || slot.count <= 0) {
                const add = Math.min(HOTBAR_STACK_LIMIT, remaining);
                slot.key = key;
                slot.count = add;
                remaining -= add;
                updatedHotbar = true;
                if (remaining <= 0) break;
            }
        }
    }
    if (updatedHotbar) {
        saveHotbarToStorage();
        reflectHotbar();
    }
    if (remaining > 0) {
        increaseInventoryCount(key, remaining);
    }
}

function dropSelectedHotbarItem(amount = 1) {
    const slot = getSelectedHotbarSlot();
    if (!slot.key || slot.count < amount) return false;
    const key = slot.key;
    if (!consumeHotbarItem(selectedHotbarIndex, amount)) return false;
    const origin = controls.getObject().position.clone();
    origin.y += 1.2;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.setY(0);
    if (forward.lengthSq() < 1e-3) forward.set(0, 0, -1);
    forward.normalize();
    for (let i = 0; i < amount; i++) {
        const impulse = new THREE.Vector3(
            forward.x + (Math.random() - 0.5) * 0.6,
            1.5 + Math.random() * 0.5,
            forward.z + (Math.random() - 0.5) * 0.6
        ).multiplyScalar(2.2);
        spawnDrop(origin.clone(), key, impulse);
    }
    return true;
}

function setPendingInventoryKey(key: string | null) {
    pendingInventoryKey = key && blockMap.has(key) ? key : null;
    pendingSourceSlot = null;
    reflectInventorySelection();
    reflectHotbar();
}

function spawnDrop(position: any, key: string, initialVelocity?: any) {
    if (!blockMap.has(key)) return;
    const mesh = new THREE.Mesh(dropGeometry, materialFor(key));
    mesh.scale.setScalar(0.6);
    mesh.position.copy(position);
    mesh.position.x += (Math.random() - 0.5) * 0.2;
    mesh.position.z += (Math.random() - 0.5) * 0.2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const velocity = initialVelocity ? initialVelocity.clone() : new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random(), (Math.random() - 0.5) * 2);
    dropItems.push({ mesh, key, velocity, ttl: DROP_LIFETIME });
}

function collectDrop(index: number, opts: { autoAdd?: boolean } = {}) {
    const drop = dropItems[index];
    if (!drop) return;
    scene.remove(drop.mesh);
    dropItems.splice(index, 1);
    if (opts.autoAdd === false) return;
    addToHotbarOrInventory(drop.key, 1);
}

function updateDrops(delta: number) {
    const playerPos = controls.getObject().position;
    for (let i = dropItems.length - 1; i >= 0; i--) {
        const item = dropItems[i];
        item.velocity.y -= DROP_GRAVITY * delta;
        item.mesh.position.addScaledVector(item.velocity, delta);
        item.velocity.x *= Math.pow(DROP_DAMPING, delta);
        item.velocity.z *= Math.pow(DROP_DAMPING, delta);
        if (item.mesh.position.y < DROP_GROUND_Y) {
            item.mesh.position.y = DROP_GROUND_Y;
            if (item.velocity.y < 0) {
                item.velocity.y *= -DROP_BOUNCE;
            }
            item.velocity.x *= DROP_DAMPING;
            item.velocity.z *= DROP_DAMPING;
        }
        item.mesh.rotation.x += delta * 2;
        item.mesh.rotation.y += delta * 1.5;
        item.ttl -= delta;
        if (item.mesh.position.distanceTo(playerPos) < 1.3) {
            collectDrop(i);
            continue;
        }
        if (item.ttl <= 0) {
            collectDrop(i, { autoAdd: false });
        }
    }
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
