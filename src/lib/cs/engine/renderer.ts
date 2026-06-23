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
  renderHitSpark(x: number, y: number, z: number): void;
  renderWallImpact(x: number, y: number, z: number): void;
  setRecoil(amount: number): void;
  updateCamera(pos: { x: number; y: number; z: number }, yaw: number, pitch: number, crouching: boolean): void;
  resize(): void;
  dispose(): void;
  switchWeapon(weapon: WeaponType): void;
  updateParticles(dt: number): void;
  showHitMarker(): void;
  getHitMarkerAlpha(): number;
}

const MAX_BULLET_HOLES = 100;
const MAX_BULLET_LINES = 20;
const MAX_PARTICLES = 80;

const WEAPON_OFFSETS: Record<WeaponType, { x: number; y: number; z: number }> = {
  ak47: { x: 0.22, y: -0.25, z: -0.55 },
  m4a1: { x: 0.22, y: -0.25, z: -0.55 },
  deagle: { x: 0.18, y: -0.22, z: -0.4 },
  knife: { x: 0.15, y: -0.22, z: -0.25 },
};

const WEAPON_ROTATIONS: Record<WeaponType, { x: number; y: number; z: number }> = {
  ak47: { x: -0.08, y: 0.35, z: 0.03 },
  m4a1: { x: -0.08, y: 0.35, z: 0.03 },
  deagle: { x: -0.05, y: 0.25, z: 0.08 },
  knife: { x: -0.5, y: 0.8, z: 0.3 },
};

export function createCSRenderer(): CSRenderer {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let mapGroup: THREE.Group;
  let enemiesGroup: THREE.Group;
  let effectsGroup: THREE.Group;
  let crosshair: HTMLDivElement;
  let bulletHoles: THREE.Mesh[] = [];
  let bulletLines: THREE.Object3D[] = [];
  let particles: THREE.Object3D[] = [];
  let recoilOffset = 0;
  let muzzleFlash: THREE.PointLight | null = null;
  let mapBoxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }> = [];
  let container: HTMLElement;
  let weaponModel: THREE.Group = new THREE.Group();
  let gunBobPhase = 0;
  let gunBobAmount = 0;
  let hitMarkerAlpha = 0;
  let currentWeapon: WeaponType = 'ak47';

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
    const weaponLight = new THREE.PointLight(0xffffff, 3.0, 8);
    weaponLight.position.set(0.3, 0.2, -0.5);
    camera.add(weaponLight);
    const weaponLight2 = new THREE.PointLight(0xffffff, 1.5, 5);
    weaponLight2.position.set(-0.2, 0.3, 0.1);
    camera.add(weaponLight2);
    const weaponLight3 = new THREE.PointLight(0xffffff, 2.0, 6);
    weaponLight3.position.set(0.1, -0.1, -0.2);
    camera.add(weaponLight3);

    mapGroup = new THREE.Group();
    scene.add(mapGroup);
    enemiesGroup = new THREE.Group();
    scene.add(enemiesGroup);
    effectsGroup = new THREE.Group();
    scene.add(effectsGroup);

    camera.add(weaponModel);
    scene.add(camera);

    crosshair = document.createElement('div');
    crosshair.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:100;';
    c.style.position = 'relative';
    c.appendChild(crosshair);

    switchWeapon('ak47');
  }

  function buildWeaponModel(weapon: WeaponType): THREE.Group {
    const group = new THREE.Group();
    const darkMetal = new THREE.MeshPhongMaterial({ color: 0x3a3a3a, specular: 0x222222, shininess: 30 });
    const metal = new THREE.MeshPhongMaterial({ color: 0x5a5a5a, specular: 0x333333, shininess: 50 });
    const lightMetal = new THREE.MeshPhongMaterial({ color: 0x888888, specular: 0x444444, shininess: 60 });
    const wood = new THREE.MeshPhongMaterial({ color: 0x9B6A3F, specular: 0x111111, shininess: 10 });
    const woodDark = new THREE.MeshPhongMaterial({ color: 0x7A4A25, specular: 0x111111, shininess: 10 });
    const gripMat = new THREE.MeshPhongMaterial({ color: 0x444444, specular: 0x222222, shininess: 20 });

    if (weapon === 'knife') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.04), woodDark);
      const wrap1 = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.03, 0.043), wood);
      wrap1.position.y = 0.02;
      const wrap2 = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.03, 0.043), wood);
      wrap2.position.y = -0.02;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.05), metal);
      guard.position.y = 0.075;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.24, 0.025), lightMetal);
      blade.position.y = 0.21;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.22, 0.028), metal);
      edge.position.set(0.005, 0.21, 0);
      group.add(handle, wrap1, wrap2, guard, blade, edge);
    } else if (weapon === 'deagle') {
      const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), gripMat);
      gripMesh.position.set(0, -0.1, 0.03);
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.03), metal);
      trigger.position.set(0, -0.06, -0.01);
      const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.05), metal);
      triggerGuard.position.set(0, -0.08, 0);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.055, 0.3), metal);
      slide.position.set(0, 0.01, -0.12);
      const slideTop = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.01, 0.28), lightMetal);
      slideTop.position.set(0, 0.04, -0.12);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.15, 8), darkMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.0, -0.28);
      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.012), lightMetal);
      frontSight.position.set(0, 0.05, -0.24);
      const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.015), lightMetal);
      rearSight.position.set(0, 0.05, -0.04);
      const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 0.015), metal);
      hammer.position.set(0, 0.04, 0.05);
      group.add(gripMesh, trigger, triggerGuard, slide, slideTop, barrel, frontSight, rearSight, hammer);
    } else {
      const isM4 = weapon === 'm4a1';
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.065, 0.16), isM4 ? metal : wood);
      stock.position.set(0, -0.01, 0.14);
      const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.02), isM4 ? gripMat : woodDark);
      stockPad.position.set(0, -0.01, 0.22);
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.06, 0.2), metal);
      receiver.position.set(0, 0.01, -0.02);
      const receiverTop = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.18), lightMetal);
      receiverTop.position.set(0, 0.045, -0.02);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.044, 0.22), isM4 ? metal : wood);
      handguard.position.set(0, 0.0, -0.23);
      const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, 0.3, 8), darkMetal);
      barrelMesh.rotation.x = Math.PI / 2;
      barrelMesh.position.set(0, 0.005, -0.34);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.03, 8), metal);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.005, -0.5);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.04), isM4 ? metal : darkMetal);
      mag.position.set(0, -0.06, -0.0);
      const gripM = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.04), gripMat);
      gripM.position.set(0, -0.06, 0.06);
      const trigger2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.025), metal);
      trigger2.position.set(0, -0.04, 0.03);
      const frontSight2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.008), lightMetal);
      frontSight2.position.set(0, 0.04, -0.34);
      const rearSight2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.015, 0.012), lightMetal);
      rearSight2.position.set(0, 0.055, 0.02);
      group.add(stock, stockPad, receiver, receiverTop, handguard, barrelMesh, muzzle, mag, gripM, trigger2, frontSight2, rearSight2);
    }
    return group;
  }

  function attachWeaponModel(weapon: WeaponType) {
    while (weaponModel.children.length) weaponModel.remove(weaponModel.children[0]);

    const model = buildWeaponModel(weapon);
    weaponModel.add(model);

    const off = WEAPON_OFFSETS[weapon];
    const rot = WEAPON_ROTATIONS[weapon];
    weaponModel.position.set(off.x, off.y, off.z);
    weaponModel.rotation.set(rot.x, rot.y, rot.z);
    console.log('[CS WEAPON] attachWeaponModel:', weapon, 'children:', model.children.length, 'pos:', off, 'rot:', rot);
  }

  function switchWeapon(weapon: WeaponType) {
    currentWeapon = weapon;
    attachWeaponModel(weapon);
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

  const enemyMeshPool: THREE.Group[] = [];

  function renderEnemies(enemies: CSPlayerState[], localTeam: string) {
    while (enemiesGroup.children.length) {
      enemiesGroup.remove(enemiesGroup.children[0]);
    }

    for (const e of enemies) {
      if (!e.isAlive) continue;

      const bodyColor = e.team === localTeam ? 0x2244aa : 0xaa4422;
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
    const dir = new THREE.Vector3(bullet.dx, bullet.dy, bullet.dz).normalize();
    const len = Math.min(def.range, 60);

    const tracerGeo = new THREE.CylinderGeometry(0.02, 0.02, len, 4);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
    const tracer = new THREE.Mesh(tracerGeo, tracerMat);
    tracer.position.copy(start).add(dir.clone().multiplyScalar(len / 2));
    tracer.lookAt(start.clone().add(dir));
    effectsGroup.add(tracer);
    bulletLines.push(tracer);

    const flashGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(start);
    effectsGroup.add(flash);

    setTimeout(() => {
      effectsGroup.remove(tracer);
      effectsGroup.remove(flash);
      tracerGeo.dispose();
      tracerMat.dispose();
      flashGeo.dispose();
      flashMat.dispose();
    }, 150);

    while (bulletLines.length > MAX_BULLET_LINES) {
      const old = bulletLines.shift();
      if (old) {
        effectsGroup.remove(old);
      }
    }
  }

  function renderHitSpark(x: number, y: number, z: number) {
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: i < 6 ? 0xff4444 : 0xff8800 });
      const spark = new THREE.Mesh(geo, mat);
      spark.position.set(x, y, z);
      const vx = (Math.random() - 0.5) * 4;
      const vy = Math.random() * 3 + 1;
      const vz = (Math.random() - 0.5) * 4;
      (spark as any)._vx = vx;
      (spark as any)._vy = vy;
      (spark as any)._vz = vz;
      (spark as any)._life = 0.4;
      (spark as any)._startTime = performance.now();
      effectsGroup.add(spark);
      particles.push(spark);
    }
  }

  function renderWallImpact(x: number, y: number, z: number) {
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.SphereGeometry(0.02 + Math.random() * 0.02, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x888877 });
      const spark = new THREE.Mesh(geo, mat);
      spark.position.set(x, y, z);
      const vx = (Math.random() - 0.5) * 3;
      const vy = Math.random() * 2;
      const vz = (Math.random() - 0.5) * 3;
      (spark as any)._vx = vx;
      (spark as any)._vy = vy;
      (spark as any)._vz = vz;
      (spark as any)._life = 0.3;
      (spark as any)._startTime = performance.now();
      effectsGroup.add(spark);
      particles.push(spark);
    }
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const elapsed = (performance.now() - (p as any)._startTime) / 1000;
      const life = (p as any)._life;
      if (elapsed >= life) {
        effectsGroup.remove(p);
        particles.splice(i, 1);
        continue;
      }
      (p as any)._vy -= 12 * dt;
      p.position.x += (p as any)._vx * dt;
      p.position.y += (p as any)._vy * dt;
      p.position.z += (p as any)._vz * dt;
      const scale = 1 - elapsed / life;
      p.scale.setScalar(scale);
    }
    while (particles.length > MAX_PARTICLES) {
      const old = particles.shift();
      if (old) effectsGroup.remove(old);
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

  function getHitMarkerAlpha() {
    const v = hitMarkerAlpha;
    hitMarkerAlpha *= 0.85;
    return v;
  }

  function showHitMarker() {
    hitMarkerAlpha = 1;
  }

  function updateCamera(pos: { x: number; y: number; z: number }, yaw: number, pitch: number, crouching: boolean) {
    const eyeHeight = crouching ? 1.2 : 1.6;
    camera.position.set(pos.x, pos.y + eyeHeight, pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch + recoilOffset;

    gunBobPhase += 0.08;
    gunBobAmount *= 0.9;
    const off = WEAPON_OFFSETS[currentWeapon];
    const bobX = Math.sin(gunBobPhase) * gunBobAmount * 0.01;
    const bobY = Math.abs(Math.cos(gunBobPhase)) * gunBobAmount * 0.008;
    weaponModel.position.set(off.x + bobX, off.y + bobY, off.z);
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
    renderBullet, renderMuzzleFlash, renderHitSpark, renderWallImpact,
    setRecoil, updateCamera, resize, dispose,
    switchWeapon, updateParticles, showHitMarker, getHitMarkerAlpha,
  };
}
