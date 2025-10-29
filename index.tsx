/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- Scene, camera, renderer setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 0, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// --- Voxel terrain generation ---
const objects: THREE.Mesh[] = [];
const worldSize = 48;
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });

for (let x = -worldSize / 2; x < worldSize / 2; x++) {
    for (let z = -worldSize / 2; z < worldSize / 2; z++) {
        const height = Math.floor(Math.cos(x / 8) * 4 + Math.sin(z / 8) * 4) + 8;
        for (let y = 0; y < height; y++) {
            const material = new THREE.MeshLambertMaterial({
                color: y === height - 1 ? 0x4caf50 : (y > height - 4 ? 0x795548 : 0x808080)
            });
            const cube = new THREE.Mesh(cubeGeometry, material);
            cube.position.set(x, y + 0.5, z);
            cube.castShadow = true;
            cube.receiveShadow = true;
            scene.add(cube);
            objects.push(cube);
        }
    }
}

// --- Pointer lock controls and HUD wiring ---
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const crosshair = document.getElementById('crosshair');

if (!blocker || !instructions || !crosshair) {
    throw new Error('Required HUD elements are missing from index.html');
}

const controls = new PointerLockControls(camera, document.body);

instructions.addEventListener('click', () => {
    controls.lock();
});
controls.addEventListener('lock', () => {
    blocker.style.display = 'none';
    crosshair.style.display = 'block';
});
controls.addEventListener('unlock', () => {
    blocker.style.display = 'flex';
    crosshair.style.display = 'none';
});

scene.add(controls.getObject());

const moveState = { forward: false, backward: false, left: false, right: false };
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const playerSpeed = 10;
const gravity = 30;
let canJump = false;

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space':
            if (canJump) {
                playerVelocity.y += 10;
            }
            canJump = false;
            break;
        default:
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
        default:
            break;
    }
});

// --- Block placement/removal helpers ---
const raycaster = new THREE.Raycaster();
const rollOverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.01, 1.01, 1.01),
    new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
);
scene.add(rollOverMesh);

document.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) {
        return;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 8) {
            return;
        }

        if (event.button === 2) {
            const newCube = new THREE.Mesh(cubeGeometry, stoneMaterial);
            newCube.position.copy(intersect.object.position).add(intersect.face?.normal ?? new THREE.Vector3());
            newCube.castShadow = true;
            newCube.receiveShadow = true;
            scene.add(newCube);
            objects.push(newCube);
        } else if (event.button === 0) {
            if (intersect.object instanceof THREE.Mesh) {
                scene.remove(intersect.object);
                const index = objects.indexOf(intersect.object);
                if (index >= 0) {
                    objects.splice(index, 1);
                }
            }
        }
    }
});

document.addEventListener('contextmenu', (event) => event.preventDefault());

// --- Resize handling ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main render loop ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (controls.isLocked) {
        playerVelocity.x -= playerVelocity.x * 10 * delta;
        playerVelocity.z -= playerVelocity.z * 10 * delta;
        playerVelocity.y -= gravity * delta;

        playerDirection.z = Number(moveState.forward) - Number(moveState.backward);
        playerDirection.x = Number(moveState.right) - Number(moveState.left);
        playerDirection.normalize();

        if (moveState.forward || moveState.backward) {
            playerVelocity.z -= playerDirection.z * playerSpeed * delta * 10;
        }
        if (moveState.left || moveState.right) {
            playerVelocity.x -= playerDirection.x * playerSpeed * delta * 10;
        }

        controls.moveRight(-playerVelocity.x * delta);
        controls.moveForward(-playerVelocity.z * delta);
        controls.getObject().position.y += playerVelocity.y * delta;

        const playerPos = controls.getObject().position;
        raycaster.set(playerPos, new THREE.Vector3(0, -1, 0));
        const groundIntersections = raycaster.intersectObjects(objects, false);

        if (groundIntersections.length > 0 && groundIntersections[0].distance < 1.75) {
            playerPos.y = groundIntersections[0].point.y + 1.75;
            playerVelocity.y = 0;
            canJump = true;
        }

        if (playerPos.y < -20) {
            playerVelocity.y = 0;
            playerPos.set(0, 20, 0);
        }

        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycaster.intersectObjects(objects, false);
        if (intersects.length > 0 && intersects[0].distance < 8) {
            const intersect = intersects[0];
            rollOverMesh.position.copy(intersect.object.position).add(intersect.face?.normal ?? new THREE.Vector3());
            rollOverMesh.visible = true;
        } else {
            rollOverMesh.visible = false;
        }
    }

    renderer.render(scene, camera);
}

animate();
