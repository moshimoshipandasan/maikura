/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// THREEとPointerLockControlsはCDNからロードされるため、
// 型エラーを避けるためにTypeScriptにグローバル変数として宣言します。
declare const THREE: any;
import { formatFps, formatCoords } from './src/world/hud.ts';

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
const worldSize = 32; // パフォーマンス安定のため初期サイズを抑える
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
// マテリアルは再利用してメモリとパフォーマンスを最適化
const grassMaterial = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
const dirtMaterial = new THREE.MeshLambertMaterial({ color: 0x795548 });
const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });

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

instructions?.addEventListener('click', () => { controls.lock(); }, false);
controls.addEventListener('lock', () => {
    if (blocker && crosshair) {
        blocker.style.display = 'none';
        crosshair.style.display = 'block';
    }
});
controls.addEventListener('unlock', () => {
    if (blocker && crosshair) {
        blocker.style.display = 'flex';
        crosshair.style.display = 'none';
    }
});

scene.add(controls.getObject());

const moveState = { forward: false, backward: false, left: false, right: false };
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const playerSpeed = 10.0;
const gravity = 30.0;
let canJump = false;

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': if (canJump) playerVelocity.y += 10; canJump = false; break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
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
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) return; // 届く範囲を制限

        if (event.button === 2) { // 右クリック: ブロックを置く
            const newCube = new THREE.Mesh(cubeGeometry, stoneMaterial);
            newCube.position.copy(intersect.object.position).add(intersect.face.normal);
            newCube.castShadow = true;
            newCube.receiveShadow = true;
            scene.add(newCube);
            objects.push(newCube);
        } else if (event.button === 0) { // 左クリック: ブロックを壊す
            if (intersect.object !== scene) {
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

        if (moveState.forward || moveState.backward) playerVelocity.z -= playerDirection.z * playerSpeed * delta * 10;
        if (moveState.left || moveState.right) playerVelocity.x -= playerDirection.x * playerSpeed * delta * 10;

        // 移動を適用
        controls.moveRight(-playerVelocity.x * delta);
        controls.moveForward(-playerVelocity.z * delta);
        controls.getObject().position.y += playerVelocity.y * delta;
        
        // 衝突判定
        const playerPos = controls.getObject().position;
        raycaster.set(playerPos, new THREE.Vector3(0, -1, 0));
        const groundIntersections = raycaster.intersectObjects(objects, false);

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
}

animate();
