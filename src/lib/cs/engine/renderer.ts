import * as THREE from 'three';
import { CSMapDef, CSPlayerState, BulletHole, BulletFireEvent, WeaponType } from '../types';
import { WEAPONS } from '../types';

export interface CSRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  mapGroup: THREE.Group;
  enemiesGroup: THREE.Group;
  effectsGroup: THREE.Group;
  crosshair: HTMLDivElement;
  init(container: HTMLElement): void;
  buildMap(map: CSMapDef): void;
  renderMap(): void;
  getMapBoxes(): Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>;
  renderEnemies(enemies: CSPlayerState[], localTeam: string): void;
  addBulletHole(hole: BulletHole): void;
  renderBullet(bullet: BulletFireEvent): void;
  renderMuzzleFlash(x: number, y: number, z: number): void;
  setRecoil(amount: number): void;
  updateCamera(pos: { x: number; y: number; z: number }, yaw: number, pitch: number, crouching: boolean): void;
  resize(): void;
  dispose(): void;
  switchWeapon(weapon: WeaponType): void;
}

const MAX_BULLET_HOLES = 100;
const MAX_BULLET_LINES = 20;

export function createCSRenderer(): CSRenderer {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let mapGroup: THREE.Group;
  let enemiesGroup: THREE.Group;
  let effectsGroup: THREE.Group;
  let crosshair: HTMLDivElement;
  let bulletHoles: THREE.Mesh[] = [];
  let bulletLines: THREE.Line[] = [];
  let recoilOffset = 0;
  let muzzleFlash: THREE.PointLight | null = null;
  let mapBoxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }> = [];
  let container: HTMLElement;
  let weaponModel: THREE.Group;
  let gunBobPhase = 0;
  let gunBobAmount = 0;

  function init(c: HTMLElement) {
    container = c;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 60, 120);

    camera = new THREE.PerspectiveCamera(75, c.clientWidth / c.clientHeight, 0.1, 200);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(c.clientWidth, c.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    c.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff5e1, 0.9);
    dirLight.position.set(30, 50, 20);
    scene.add(dirLight);

    mapGroup = new THREE.Group();
    scene.add(mapGroup);
    enemiesGroup = new THREE.Group();
    scene.add(enemiesGroup);
    effectsGroup = new THREE.Group();
    scene.add(effectsGroup);

    weaponModel = createWeaponModel('ak47');
    camera.add(weaponModel);
    scene.add(camera);

    crosshair = document.createElement('div');
    crosshair.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:100;';
    crosshair.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="4" x2="12" y2="10" stroke="#0f0" stroke-width="1.5" opacity="0.9"/>
        <line x1="12" y1="14" x2="12" y2="20" stroke="#0f0" stroke-width="1.5" opacity="0.9"/>
        <line x1="4" y1="12" x2="10" y2="12" stroke="#0f0" stroke-width="1.5" opacity="0.9"/>
        <line x1="14" y1="12" x2="20" y2="12" stroke="#0f0" stroke-width="1.5" opacity="0.9"/>
        <circle cx="12" cy="12" r="2" fill="none" stroke="#0f0" stroke-width="0.8" opacity="0.6"/>
      </svg>
    `;
    c.style.position = 'relative';
    c.appendChild(crosshair);
  }

  function createWeaponModel(weapon: WeaponType): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

    if (weapon === 'knife') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), woodMat);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.03), accentMat);
      blade.position.y = 0.16;
      group.add(handle, blade);
    } else if (weapon === 'deagle') {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.04), bodyMat);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.14), accentMat);
      slide.position.set(0, 0.05, -0.05);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08), bodyMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.05, -0.14);
      group.add(grip, slide, barrel);
    } else {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), weapon === 'm4a1' ? bodyMat : woodMat);
      stock.position.set(0, -0.01, 0.08);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.18), bodyMat);
      body.position.set(0, 0.02, -0.02);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.16), accentMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, -0.18);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.03), bodyMat);
      mag.position.set(0, -0.05, -0.02);
      mag.rotation.x = 0.15;
      group.add(stock, body, barrel, mag);
    }

    group.position.set(0.25, -0.22, -0.4);
    return group;
  }

  function switchWeapon(weapon: WeaponType) {
    if (weaponModel.parent) weaponModel.parent.remove(weaponModel);
    weaponModel = createWeaponModel(weapon);
    camera.add(weaponModel);
  }

  function buildMap(map: CSMapDef) {
    while (mapGroup.children.length) mapGroup.remove(mapGroup.children[0]);
    mapBoxes = [];

    const groundGeo = new THREE.PlaneGeometry(map.floors[0].w, map.floors[0].d);
    const groundMat = new THREE.MeshLambertMaterial({ color: map.floors[0].color });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.floors[0].x, 0, map.floors[0].z);
    mapGroup.add(ground);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const box of map.boxes) {
      const mat = new THREE.MeshLambertMaterial({ color: box.color });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(box.w, box.h, box.d);
      mesh.position.set(box.x, box.y, box.z);
      mapGroup.add(mesh);
      mapBoxes.push(box);
    }

    const borderW = map.floors[0].w + 4;
    const borderD = map.floors[0].d + 4;
    const wallH = 8;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const walls = [
      { x: 0, y: wallH / 2, z: -borderD / 2, w: borderW, h: wallH, d: 1 },
      { x: 0, y: wallH / 2, z: borderD / 2, w: borderW, h: wallH, d: 1 },
      { x: -borderW / 2, y: wallH / 2, z: 0, w: 1, h: wallH, d: borderD },
      { x: borderW / 2, y: wallH / 2, z: 0, w: 1, h: wallH, d: borderD },
    ];
    for (const w of walls) {
      const mesh = new THREE.Mesh(boxGeo, wallMat);
      mesh.scale.set(w.w, w.h, w.d);
      mesh.position.set(w.x, w.y, w.z);
      mapGroup.add(mesh);
      mapBoxes.push(w);
    }

    const ceilGeo = new THREE.PlaneGeometry(borderW, borderD);
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, wallH, 0);
    mapGroup.add(ceil);
  }

  function renderMap() {
    renderer.render(scene, camera);
  }

  function renderEnemies(enemies: CSPlayerState[], localTeam: string) {
    while (enemiesGroup.children.length) enemiesGroup.remove(enemiesGroup.children[0]);

    for (const e of enemies) {
      if (!e.isAlive) continue;

      const bodyColor = e.team === 'CT' ? 0x2244aa : 0xaa4422;
      const group = new THREE.Group();

      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.4),
        new THREE.MeshLambertMaterial({ color: bodyColor })
      );
      torso.position.y = 1.2;
      group.add(torso);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffcc99 })
      );
      head.position.y = 1.85;
      group.add(head);

      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.6, 0.15),
          new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        arm.position.set(side * 0.4, 1.1, 0);
        group.add(arm);
      }

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.7, 0.18),
          new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        leg.position.set(side * 0.15, 0.35, 0);
        group.add(leg);
      }

      group.position.set(e.x, e.y, e.z);
      group.rotation.y = e.yaw;
      enemiesGroup.add(group);

      if (e.health < 100) {
        const barBg = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 0.08),
          new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })
        );
        barBg.position.set(e.x, e.y + 2.3, e.z);
        barBg.lookAt(camera.position);
        enemiesGroup.add(barBg);

        const barFg = new THREE.Mesh(
          new THREE.PlaneGeometry(e.health / 100, 0.06),
          new THREE.MeshBasicMaterial({ color: e.health > 50 ? 0x00ff00 : e.health > 25 ? 0xffff00 : 0xff0000, side: THREE.DoubleSide })
        );
        barFg.position.set(e.x - (1 - e.health / 100) * 0.5, e.y + 2.3, e.z + 0.01);
        barFg.lookAt(camera.position);
        enemiesGroup.add(barFg);
      }
    }
  }

  function addBulletHole(hole: BulletHole) {
    const geo = new THREE.CircleGeometry(0.06, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(hole.x + hole.nx * 0.01, hole.y + hole.ny * 0.01, hole.z + hole.nz * 0.01);
    mesh.lookAt(hole.x + hole.nx, hole.y + hole.ny, hole.z + hole.nz);
    effectsGroup.add(mesh);
    bulletHoles.push(mesh);
    if (bulletHoles.length > MAX_BULLET_HOLES) {
      const old = bulletHoles.shift();
      if (old) effectsGroup.remove(old);
    }
  }

  function renderBullet(bullet: BulletFireEvent) {
    const def = WEAPONS[bullet.weapon];
    const start = new THREE.Vector3(bullet.x, bullet.y, bullet.z);
    const dir = new THREE.Vector3(bullet.dx, bullet.dy, bullet.dz);
    const end = start.clone().add(dir.multiplyScalar(def.range));

    const points = [start, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    effectsGroup.add(line);
    bulletLines.push(line);

    setTimeout(() => {
      effectsGroup.remove(line);
      geo.dispose();
      mat.dispose();
    }, 80);

    while (bulletLines.length > MAX_BULLET_LINES) {
      const old = bulletLines.shift();
      if (old) {
        effectsGroup.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
    }
  }

  function renderMuzzleFlash(x: number, y: number, z: number) {
    if (muzzleFlash) {
      effectsGroup.remove(muzzleFlash);
      muzzleFlash.dispose();
    }
    muzzleFlash = new THREE.PointLight(0xffaa00, 3, 5);
    muzzleFlash.position.set(x, y, z);
    effectsGroup.add(muzzleFlash);
    setTimeout(() => {
      if (muzzleFlash) {
        effectsGroup.remove(muzzleFlash);
        muzzleFlash.dispose();
        muzzleFlash = null;
      }
    }, 50);
  }

  function setRecoil(amount: number) {
    recoilOffset = amount;
  }

  function updateCamera(pos: { x: number; y: number; z: number }, yaw: number, pitch: number, crouching: boolean) {
    const eyeHeight = crouching ? 1.2 : 1.6;
    camera.position.set(pos.x, pos.y + eyeHeight, pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch + recoilOffset;

    gunBobPhase += 0.08;
    gunBobAmount *= 0.9;
    const bobX = Math.sin(gunBobPhase) * gunBobAmount * 0.01;
    const bobY = Math.abs(Math.cos(gunBobPhase)) * gunBobAmount * 0.008;
    weaponModel.position.set(0.25 + bobX, -0.22 + bobY, -0.4);
  }

  function resize() {
    if (!container || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function dispose() {
    renderer.dispose();
    crosshair.remove();
  }

  function getMapBoxes() { return mapBoxes; }

  return {
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get mapGroup() { return mapGroup; },
    get enemiesGroup() { return enemiesGroup; },
    get effectsGroup() { return effectsGroup; },
    get crosshair() { return crosshair; },
    init, buildMap, renderMap, getMapBoxes, renderEnemies, addBulletHole,
    renderBullet, renderMuzzleFlash, setRecoil, updateCamera, resize, dispose,
    switchWeapon,
  };
}
