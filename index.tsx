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

type TerrainPreset = 'normal' | 'flat' | 'chaos';

type WorldSettings = {
    terrain: TerrainPreset;
    showHud: boolean;
};

type WorldProfile = {
    id: string;
    name: string;
    seed: string;
    createdAt: number;
    updatedAt: number;
    settings: WorldSettings;
};

type WorldSeedOffsets = {
    biomeShiftX: number;
    biomeShiftZ: number;
    moistureShiftX: number;
    moistureShiftZ: number;
    terrainShiftX: number;
    terrainShiftZ: number;
};

const DEFAULT_WORLD_SETTINGS: WorldSettings = { terrain: 'normal', showHud: true };
const WORLD_META_LS_KEY = 'blockworld_worlds_meta_v1';
const WORLD_EDIT_PREFIX = 'blockworld_world_edits_v1:';
const WORLD_LAST_KEY = 'blockworld_last_world_v1';

function cloneSettings(settings?: Partial<WorldSettings>): WorldSettings {
    return {
        terrain: settings?.terrain ?? DEFAULT_WORLD_SETTINGS.terrain,
        showHud: settings?.showHud ?? DEFAULT_WORLD_SETTINGS.showHud,
    };
}

function generateWorldId() {
    return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateSeedSuggestion() {
    const syllables = ['mori', 'saba', 'kaze', 'yuki', 'sora', 'umi', 'ishi', 'hana', 'asa', 'yoru'];
    const pick = () => syllables[Math.floor(Math.random() * syllables.length)];
    return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

function sanitizeSeed(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : generateSeedSuggestion();
}

function hashString32(input: string, salt = 0): number {
    let hash = 2166136261 ^ salt;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function toUnitFloat(hash: number) {
    return (hash & 0xffffffff) / 0xffffffff;
}

function computeSeedOffsets(seed: string): WorldSeedOffsets {
    return {
        biomeShiftX: toUnitFloat(hashString32(seed, 11)) * 480,
        biomeShiftZ: toUnitFloat(hashString32(seed, 17)) * 480,
        moistureShiftX: toUnitFloat(hashString32(seed, 23)) * 360,
        moistureShiftZ: toUnitFloat(hashString32(seed, 29)) * 360,
        terrainShiftX: toUnitFloat(hashString32(seed, 37)) * 520,
        terrainShiftZ: toUnitFloat(hashString32(seed, 43)) * 520,
    };
}

type EditMap = { [posKey: string]: string | null };

let worlds: WorldProfile[] = [];
let currentWorld: WorldProfile | null = null;
let selectedWorldId: string | null = null;
let creatingWorld = false;
let currentOffsets: WorldSeedOffsets = computeSeedOffsets('default');
let currentEdits: EditMap = {};
let pendingMenuOpen = false;

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

function sampleBiome(x: number, z: number, offsets: WorldSeedOffsets): BiomeProfile {
    const heat = Math.sin((x + offsets.biomeShiftX) / 24) + Math.cos((z + offsets.biomeShiftZ) / 31);
    const moisture = Math.sin(((x + offsets.moistureShiftX) + (z + offsets.moistureShiftZ)) / 37)
        + Math.cos(((x + offsets.moistureShiftX) - (z + offsets.moistureShiftZ)) / 29);
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

function loadWorldMetaFromStorage(): WorldProfile[] {
    try {
        const raw = JSON.parse(localStorage.getItem(WORLD_META_LS_KEY) ?? '[]');
        if (!Array.isArray(raw)) return [];
        const list: WorldProfile[] = [];
        for (const entry of raw) {
            if (!entry || typeof entry !== 'object') continue;
            const id = typeof entry.id === 'string' ? entry.id : generateWorldId();
            const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `ワールド-${list.length + 1}`;
            const seed = typeof entry.seed === 'string' ? sanitizeSeed(entry.seed) : generateSeedSuggestion();
            const createdAt = typeof entry.createdAt === 'number' ? entry.createdAt : Date.now();
            const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : createdAt;
            const settings = cloneSettings(entry.settings);
            list.push({ id, name, seed, createdAt, updatedAt, settings });
        }
        return list;
    } catch {
        return [];
    }
}

function saveWorldMetaToStorage(list: WorldProfile[]): void {
    try {
        localStorage.setItem(WORLD_META_LS_KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
}

function ensureWorldCatalog(): WorldProfile[] {
    const existing = loadWorldMetaFromStorage();
    if (existing.length > 0) {
        return existing;
    }
    const timestamp = Date.now();
    const starter: WorldProfile = {
        id: generateWorldId(),
        name: 'プレイグラウンド',
        seed: generateSeedSuggestion(),
        createdAt: timestamp,
        updatedAt: timestamp,
        settings: cloneSettings(),
    };
    saveWorldMetaToStorage([starter]);
    return [starter];
}

function mergeWorldMeta(updated: WorldProfile) {
    const index = worlds.findIndex((w) => w.id === updated.id);
    if (index >= 0) {
        worlds[index] = { ...updated };
    } else {
        worlds.push({ ...updated });
    }
    saveWorldMetaToStorage(worlds);
}

function worldEditsKey(worldId: string): string {
    return `${WORLD_EDIT_PREFIX}${worldId}`;
}

function loadEditsForWorld(worldId: string): EditMap {
    try {
        const raw = localStorage.getItem(worldEditsKey(worldId));
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        const result: EditMap = {};
        const entries = Object.entries(parsed as Record<string, unknown>);
        for (const [pos, value] of entries) {
            if (value === null) {
                result[pos] = null;
            } else if (typeof value === 'string') {
                result[pos] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

function saveEditsForWorld(worldId: string, map: EditMap): void {
    try {
        localStorage.setItem(worldEditsKey(worldId), JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

function clearEditsForWorld(worldId: string): void {
    try {
        localStorage.removeItem(worldEditsKey(worldId));
    } catch {
        /* ignore */
    }
}

function clearSceneTerrain(): void {
    for (const obj of objects) {
        scene.remove(obj);
    }
    objects.length = 0;
}

type TerrainParams = {
    amplitude: number;
    period: number;
    baseHeight: number;
};

function resolveTerrainParams(preset: TerrainPreset): TerrainParams {
    switch (preset) {
        case 'flat':
            return { amplitude: 2.0, period: 14, baseHeight: 7.5 };
        case 'chaos':
            return { amplitude: 6.0, period: 6, baseHeight: 8.5 };
        default:
            return { amplitude: 3.5, period: 8, baseHeight: 8.0 };
    }
}

function rebuildWorldTerrain(world: WorldProfile): void {
    clearSceneTerrain();
    currentOffsets = computeSeedOffsets(world.seed);
    const params = resolveTerrainParams(world.settings.terrain);
    for (let x = -worldSize / 2; x < worldSize / 2; x++) {
        for (let z = -worldSize / 2; z < worldSize / 2; z++) {
            const biome = sampleBiome(x, z, currentOffsets);
            const waveX = Math.cos((x + currentOffsets.terrainShiftX) / params.period) * params.amplitude;
            const waveZ = Math.sin((z + currentOffsets.terrainShiftZ) / params.period) * (params.amplitude * 0.82);
            const wobble = Math.sin((x + z + currentOffsets.terrainShiftX * 0.35) / (params.period * 0.9)) * (params.amplitude * 0.35);
            const height = Math.max(2, Math.floor(params.baseHeight + biome.heightOffset + waveX + waveZ + wobble));
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
}

function applyEditsToScene(map: EditMap): void {
    const eps = 1e-6;
    const findAt = (x: number, y: number, z: number) => objects.find((o: any) => Math.abs(o.position.x - x) < eps && Math.abs(o.position.y - y) < eps && Math.abs(o.position.z - z) < eps);
    for (const [key, value] of Object.entries(map)) {
        const [sx, sy, sz] = key.split(',').map(Number);
        const target = findAt(sx, sy, sz);
        if (value === null) {
            if (target) {
                scene.remove(target);
                const idx = objects.indexOf(target);
                if (idx >= 0) {
                    objects.splice(idx, 1);
                }
            }
            continue;
        }
        const material = materialFor(value);
        if (target) {
            target.material = material;
            target.userData.blockKey = value;
        } else {
            const cube = new THREE.Mesh(cubeGeometry, material);
            cube.position.set(sx, sy, sz);
            cube.castShadow = true;
            cube.receiveShadow = true;
            cube.userData.blockKey = value;
            scene.add(cube);
            objects.push(cube);
        }
    }
}

function setCurrentWorld(world: WorldProfile, options: { rebuild?: boolean } = {}): void {
    const rebuild = options.rebuild ?? true;
    currentWorld = {
        ...world,
        settings: cloneSettings(world.settings),
    };
    currentOffsets = computeSeedOffsets(currentWorld.seed);
    currentEdits = loadEditsForWorld(currentWorld.id);
    if (rebuild || objects.length === 0) {
        rebuildWorldTerrain(currentWorld);
    }
    applyEditsToScene(currentEdits);
    currentWorld.updatedAt = Date.now();
    mergeWorldMeta(currentWorld);
    localStorage.setItem(WORLD_LAST_KEY, currentWorld.id);
    applyHudVisibility(currentWorld.settings.showHud);
}

function deleteWorldMeta(worldId: string): void {
    clearEditsForWorld(worldId);
    worlds = worlds.filter((w) => w.id !== worldId);
    saveWorldMetaToStorage(worlds);
    if (localStorage.getItem(WORLD_LAST_KEY) === worldId) {
        localStorage.removeItem(WORLD_LAST_KEY);
    }
}

loadHotbarFromStorage();
// ワールドの生成はメニュー初期化時に行う。

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
const mainMenu = document.getElementById('main-menu');
const worldListEl = document.getElementById('world-list');
const worldNameInput = document.getElementById('world-name-input') as HTMLInputElement | null;
const worldSeedInput = document.getElementById('world-seed-input') as HTMLInputElement | null;
const terrainSelect = document.getElementById('world-terrain-select') as HTMLSelectElement | null;
const hudToggle = document.getElementById('world-hud-toggle') as HTMLInputElement | null;
const menuHint = document.getElementById('menu-hint');
const validationEl = document.createElement('div');
validationEl.id = 'validation';
validationEl.style.marginTop = '6px';
validationEl.style.opacity = '0.85';
validationEl.textContent = 'Validation: (T=both / Y=auto / U=fps)';
hud?.appendChild(validationEl);

let inventoryOpen = false;
let pendingInventoryKey: string | null = null;
let relockAfterInventory = false;
let lastMenuReason: 'boot' | 'pause' | null = null;

function applyHudVisibility(show: boolean) {
    if (hud) {
        hud.style.display = show ? 'block' : 'none';
    }
    if (hotbarEl) {
        hotbarEl.style.display = show ? 'flex' : 'none';
    }
    if (crosshair) {
        if (show && controls.isLocked && !inventoryOpen) {
            crosshair.style.display = 'block';
        } else {
            crosshair.style.display = 'none';
        }
    }
}

function menuIsOpen() {
    return Boolean(mainMenu?.classList.contains('open'));
}

function setMenuHint(text: string) {
    if (menuHint) {
        menuHint.textContent = text;
    }
}

function formatWorldMetaLine(world: WorldProfile) {
    const date = new Date(world.updatedAt);
    if (Number.isNaN(date.getTime())) {
        return `シード ${world.seed}`;
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `更新 ${yyyy}/${mm}/${dd} ${hh}:${mi} ｜ シード ${world.seed}`;
}

function refreshWorldListUI() {
    if (!worldListEl) return;
    worldListEl.innerHTML = '';
    const sorted = [...worlds].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const world of sorted) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-item';
        btn.dataset.id = world.id;
        btn.setAttribute('role', 'option');
        const active = !creatingWorld && selectedWorldId === world.id;
        if (active) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.setAttribute('aria-selected', 'false');
        }
        const nameEl = document.createElement('strong');
        nameEl.textContent = world.name;
        const metaEl = document.createElement('span');
        metaEl.textContent = formatWorldMetaLine(world);
        btn.appendChild(nameEl);
        btn.appendChild(metaEl);
        btn.addEventListener('click', () => {
            selectWorld(world.id);
        });
        li.appendChild(btn);
        worldListEl.appendChild(li);
    }
}

function setMenuFormFromWorld(world: WorldProfile) {
    creatingWorld = false;
    if (worldNameInput) worldNameInput.value = world.name;
    if (worldSeedInput) worldSeedInput.value = world.seed;
    if (terrainSelect) terrainSelect.value = world.settings.terrain;
    if (hudToggle) hudToggle.checked = world.settings.showHud;
}

function selectWorld(worldId: string) {
    const target = worlds.find((w) => w.id === worldId);
    if (!target) return;
    selectedWorldId = worldId;
    setMenuFormFromWorld(target);
    refreshWorldListUI();
    setMenuHint('設定を調整して「変更を保存」か「プレイ開始」を押してください。');
}

function enterCreateMode() {
    creatingWorld = true;
    selectedWorldId = null;
    if (worldNameInput) worldNameInput.value = `新しいワールド ${worlds.length + 1}`;
    if (worldSeedInput) worldSeedInput.value = generateSeedSuggestion();
    if (terrainSelect) terrainSelect.value = 'normal';
    if (hudToggle) hudToggle.checked = true;
    refreshWorldListUI();
    setMenuHint('作成するワールドの情報を設定してください。');
}

type WorldFormState = {
    name: string;
    seed: string;
    terrain: TerrainPreset;
    showHud: boolean;
};

function readWorldForm(): WorldFormState {
    const nameRaw = worldNameInput?.value ?? '';
    const trimmedName = nameRaw.trim().substring(0, 32);
    const seedValue = worldSeedInput?.value ?? '';
    const terrainValue = terrainSelect?.value as TerrainPreset | undefined;
    return {
        name: trimmedName.length > 0 ? trimmedName : '新しいワールド',
        seed: sanitizeSeed(seedValue),
        terrain: terrainValue === 'flat' || terrainValue === 'chaos' ? terrainValue : 'normal',
        showHud: hudToggle ? hudToggle.checked : true,
    };
}

function applyFormToExistingWorld(world: WorldProfile, form: WorldFormState) {
    const updated: WorldProfile = {
        ...world,
        name: form.name,
        seed: form.seed,
        updatedAt: Date.now(),
        settings: cloneSettings({ terrain: form.terrain, showHud: form.showHud }),
    };
    const needsRebuild = world.seed !== updated.seed || world.settings.terrain !== updated.settings.terrain;
    const hudChanged = world.settings.showHud !== updated.settings.showHud;
    const nameChanged = world.name !== updated.name;
    return { updated, needsRebuild, hudChanged, nameChanged };
}

function handleWorldApply(closeAfter: boolean) {
    const form = readWorldForm();
    if (creatingWorld) {
        const timestamp = Date.now();
        const newWorld: WorldProfile = {
            id: generateWorldId(),
            name: form.name,
            seed: form.seed,
            createdAt: timestamp,
            updatedAt: timestamp,
            settings: cloneSettings({ terrain: form.terrain, showHud: form.showHud }),
        };
        mergeWorldMeta(newWorld);
        selectedWorldId = newWorld.id;
        creatingWorld = false;
        setCurrentWorld(newWorld, { rebuild: true });
        refreshWorldListUI();
        setMenuFormFromWorld(newWorld);
        setMenuHint(closeAfter ? '新しいワールドでプレイを開始します。' : '新しいワールドを作成しました。');
        if (closeAfter) {
            closeMainMenu();
        }
        return;
    }
    const targetId = selectedWorldId ?? currentWorld?.id;
    if (!targetId) return;
    const existing = worlds.find((w) => w.id === targetId);
    if (!existing) return;
    const { updated, needsRebuild, hudChanged, nameChanged } = applyFormToExistingWorld(existing, form);
    const switchingWorld = !currentWorld || currentWorld.id !== updated.id;
    mergeWorldMeta(updated);
    selectedWorldId = updated.id;
    setCurrentWorld(updated, { rebuild: switchingWorld || needsRebuild });
    if (!switchingWorld && !needsRebuild && hudChanged) {
        applyHudVisibility(updated.settings.showHud);
    }
    refreshWorldListUI();
    setMenuFormFromWorld(updated);
    setMenuHint(closeAfter
        ? '設定を適用しました。'
        : ((switchingWorld || needsRebuild || hudChanged || nameChanged) ? 'ワールド設定を保存しました。' : '変更はありませんでした。'));
    if (closeAfter) {
        closeMainMenu();
    }
}

function handleWorldReset() {
    const targetId = selectedWorldId ?? currentWorld?.id;
    if (!targetId) return;
    const world = worlds.find((w) => w.id === targetId);
    if (!world) return;
    if (!window.confirm(`${world.name} の編集履歴をすべて削除しますか？`)) {
        return;
    }
    clearEditsForWorld(targetId);
    const updatedWorld: WorldProfile = {
        ...world,
        updatedAt: Date.now(),
        settings: cloneSettings(world.settings),
    };
    mergeWorldMeta(updatedWorld);
    if (currentWorld && currentWorld.id === targetId) {
        currentEdits = {};
        setCurrentWorld(updatedWorld, { rebuild: true });
    } else {
        setMenuFormFromWorld(updatedWorld);
    }
    refreshWorldListUI();
    setMenuHint('ワールドを初期化しました。');
}

function handleWorldDelete() {
    const targetId = selectedWorldId ?? currentWorld?.id;
    if (!targetId) return;
    if (worlds.length <= 1) {
        setMenuHint('最後のワールドは削除できません。');
        return;
    }
    const world = worlds.find((w) => w.id === targetId);
    if (!world) return;
    if (!window.confirm(`${world.name} を削除しますか？`)) {
        return;
    }
    deleteWorldMeta(world.id);
    if (worlds.length === 0) {
        worlds = ensureWorldCatalog();
    }
    const fallback = worlds[0];
    selectedWorldId = fallback?.id ?? null;
    if (currentWorld && currentWorld.id === world.id) {
        if (fallback) {
            setCurrentWorld(fallback, { rebuild: true });
        } else {
            creatingWorld = true;
        }
    }
    if (fallback) {
        setMenuFormFromWorld(fallback);
    } else {
        enterCreateMode();
    }
    refreshWorldListUI();
    setMenuHint('ワールドを削除しました。');
}

function openMainMenu(reason: 'boot' | 'pause') {
    if (!mainMenu) return;
    lastMenuReason = reason;
    mainMenu.classList.add('open');
    mainMenu.setAttribute('aria-hidden', 'false');
    if (blocker) {
        blocker.style.display = 'none';
    }
    if (crosshair) {
        crosshair.style.display = 'none';
    }
    refreshWorldListUI();
    if (!creatingWorld && selectedWorldId) {
        const selected = worlds.find((w) => w.id === selectedWorldId);
        if (selected) {
            setMenuFormFromWorld(selected);
        }
    } else if (creatingWorld) {
        setMenuHint('作成するワールドの情報を設定してください。');
    }
}

function closeMainMenu() {
    if (!mainMenu) return;
    mainMenu.classList.remove('open');
    mainMenu.setAttribute('aria-hidden', 'true');
    lastMenuReason = null;
    if (!controls.isLocked && !inventoryOpen) {
        if (blocker) {
            blocker.style.display = 'flex';
        }
    }
}

function bootstrapWorldSystem() {
    worlds = ensureWorldCatalog();
    const lastId = localStorage.getItem(WORLD_LAST_KEY);
    const initial = (lastId && worlds.find((w) => w.id === lastId)) ?? worlds[0];
    if (initial) {
        selectedWorldId = initial.id;
        setCurrentWorld(initial, { rebuild: true });
        setMenuFormFromWorld(initial);
        refreshWorldListUI();
        setMenuHint('ワールドを選択しました。プレイ準備が整っています。');
    } else {
        enterCreateMode();
        setMenuHint('最初のワールドを作成しましょう。');
    }
    openMainMenu('boot');
}

mainMenu?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
        case 'menu-close':
            closeMainMenu();
            break;
        case 'world-create':
            enterCreateMode();
            break;
        case 'world-play':
            handleWorldApply(true);
            break;
        case 'world-apply':
            handleWorldApply(false);
            break;
        case 'world-reset':
            handleWorldReset();
            break;
        case 'world-delete':
            handleWorldDelete();
            break;
        default:
            break;
    }
});

instructions?.addEventListener('click', () => { controls.lock(); }, false);
controls.addEventListener('lock', () => {
    pendingMenuOpen = false;
    if (menuIsOpen()) {
        closeMainMenu();
    }
    if (blocker) {
        blocker.style.display = 'none';
    }
    if (crosshair) {
        crosshair.style.display = (!inventoryOpen && (currentWorld?.settings.showHud ?? true)) ? 'block' : 'none';
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
    if (pendingMenuOpen) {
        pendingMenuOpen = false;
        openMainMenu('pause');
        return;
    }
    if (menuIsOpen()) {
        if (blocker) {
            blocker.style.display = 'none';
        }
        if (crosshair) {
            crosshair.style.display = 'none';
        }
        return;
    }
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
        const allowCrosshair = !inventoryOpen && (currentWorld?.settings.showHud ?? true) && controls.isLocked && !menuIsOpen();
        crosshair.style.display = allowCrosshair ? 'block' : 'none';
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
    if (event.code === 'Escape') {
        if (inventoryOpen) {
            return;
        }
        if (menuIsOpen()) {
            event.preventDefault();
            closeMainMenu();
            return;
        }
        if (controls.isLocked) {
            pendingMenuOpen = true;
            event.preventDefault();
            controls.unlock();
        } else {
            event.preventDefault();
            openMainMenu('pause');
        }
        return;
    }
    if (event.code === 'KeyM') {
        if (inventoryOpen) {
            return;
        }
        if (menuIsOpen()) {
            event.preventDefault();
            closeMainMenu();
            return;
        }
        if (controls.isLocked) {
            pendingMenuOpen = true;
            event.preventDefault();
            controls.unlock();
        } else {
            event.preventDefault();
            openMainMenu('pause');
        }
    }
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE') {
        event.preventDefault();
        if (inventoryOpen) { closeInventory(); } else { openInventory(); }
        return;
    }
    if (menuIsOpen()) {
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
    if (menuIsOpen()) return;
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

function keyFromPos(p: any) {
    return `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000},${Math.round(p.z * 1000) / 1000}`;
}

function persistEdit(pos: any, type: string | null) {
    if (!currentWorld) return;
    const key = keyFromPos(pos);
    currentEdits[key] = type;
    saveEditsForWorld(currentWorld.id, currentEdits);
    currentWorld.updatedAt = Date.now();
    mergeWorldMeta(currentWorld);
}

bootstrapWorldSystem();

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
