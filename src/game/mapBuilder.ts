import * as THREE from 'three';

export interface MapData {
  houseBounds: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  buildingFloors: {
    minX: number; maxX: number; minZ: number; maxZ: number;
    groundY: number; floorH: number; floors: number;
    stairX: number; stairZ: number;
    stairDirX: number; stairDirZ: number; stairLen: number;
  }[];
}

interface HouseInfo {
  id: string;
  name: string;
  x: number; z: number;
  w: number; h: number; d: number;
  color: number;
  roofColor?: number;
  doorSide?: number;
}

const WORLD_SIZE = 800;
const CROSS_ROADS = [-300, -150, 150, 300];
const FLOOR_H = 3.5;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function buildNewMap(scene: THREE.Scene, houses: HouseInfo[]): MapData {
  const data: MapData = { houseBounds: [], buildingFloors: [] };

  createGround(scene);
  createRoads(scene);
  createPlaza(scene);

  for (const h of houses) {
    createHouse(scene, h, data);
  }

  createEnvironment(scene, data.houseBounds);
  return data;
}

function createGround(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x4a8c3f }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createRoads(scene: THREE.Scene) {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const swMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });

  const addRoad = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), roadMat);
    m.position.set(cx, 0.04, cz);
    m.receiveShadow = true;
    scene.add(m);
  };
  const addSW = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), swMat);
    m.position.set(cx, 0.09, cz);
    m.receiveShadow = true;
    scene.add(m);
  };
  const addDash = (cx: number, cz: number, horiz: boolean) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 4 : 0.15, 0.09, horiz ? 0.15 : 4), dashMat);
    m.position.set(cx, 0.1, cz);
    scene.add(m);
  };
  const addEdge = (cx: number, cz: number, horiz: boolean, len: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.08, 0.09, horiz ? 0.08 : len), edgeMat);
    m.position.set(cx, 0.1, cz);
    scene.add(m);
  };

  addRoad(0, 0, 30, WORLD_SIZE);
  addSW(-16.5, 0, 3, WORLD_SIZE);
  addSW(16.5, 0, 3, WORLD_SIZE);
  addEdge(-14.8, 0, false, WORLD_SIZE);
  addEdge(14.8, 0, false, WORLD_SIZE);
  for (let z = -400; z < 400; z += 30) addDash(0, z, false);

  for (const cz of CROSS_ROADS) {
    addRoad(0, cz, WORLD_SIZE, 12);
    addSW(0, cz - 7.5, WORLD_SIZE, 3);
    addSW(0, cz + 7.5, WORLD_SIZE, 3);
    addEdge(0, cz - 5.8, true, WORLD_SIZE);
    addEdge(0, cz + 5.8, true, WORLD_SIZE);
    for (let x = -400; x < 400; x += 30) addDash(x, cz, true);
  }

  for (const sx of [-18, 18]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, WORLD_SIZE), curbMat);
    curb.position.set(sx + (sx < 0 ? -1.5 : 1.5), 0.18, 0);
    scene.add(curb);
  }
}

function createPlaza(scene: THREE.Scene) {
  const plazaGeo = new THREE.CircleGeometry(45, 32);
  plazaGeo.rotateX(-Math.PI / 2);
  const plaza = new THREE.Mesh(plazaGeo, new THREE.MeshLambertMaterial({ color: 0x666666 }));
  plaza.position.set(0, 0.06, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);

  const fMat = new THREE.MeshLambertMaterial({ color: 0x889999 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.8, 24), fMat);
  base.position.set(0, 0.4, 0);
  base.castShadow = true;
  scene.add(base);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.0, 12), fMat);
  pillar.position.set(0, 1.8, 0);
  pillar.castShadow = true;
  scene.add(pillar);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.2, 0.5, 16), fMat);
  top.position.set(0, 3.0, 0);
  top.castShadow = true;
  scene.add(top);

  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3388cc, transparent: true, opacity: 0.7 });
  const water1 = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.2, 24), waterMat);
  water1.position.set(0, 0.85, 0);
  scene.add(water1);
  const water2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.1, 16), waterMat);
  water2.position.set(0, 3.3, 0);
  scene.add(water2);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    createBench(scene, Math.cos(a) * 15, Math.sin(a) * 15, a + Math.PI / 2);
  }
}

function createBench(scene: THREE.Scene, x: number, z: number, rot: number) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x444444 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.45), wood);
  seat.position.y = 0.45;
  seat.castShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.05), wood);
  back.position.set(0, 0.7, 0.2);
  back.rotation.x = -0.15;
  back.castShadow = true;
  g.add(back);

  for (const sx of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal);
    leg.position.set(sx, 0.22, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), metal);
    arm.position.set(sx, 0.55, 0.18);
    g.add(arm);
  }

  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}

function createHouse(scene: THREE.Scene, house: HouseInfo, data: MapData) {
  const group = new THREE.Group();
  const { x, z, w, h, d, color, roofColor } = house;
  const wt = 0.35;
  const hh = h;
  const hw = w / 2;
  const hd = d / 2;
  const doorSide = house.doorSide ?? 0;
  const doorW = 2.2;
  const floors = Math.max(1, Math.round(hh / FLOOR_H));
  const groundY = 0;

  const wallMat = new THREE.MeshLambertMaterial({ color });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x998877 });
  const roofMat = new THREE.MeshLambertMaterial({ color: roofColor ?? 0x555555 });
  const stairMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const trimMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.85).getHex() });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.6 });
  const windowFrameMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const doorFrameMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });

  const addBox = (cx: number, cy: number, cz: number, bw: number, bh: number, bd: number, mat: THREE.Material, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x + cx, cy, z + cz);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  for (let f = 0; f <= floors; f++) {
    const fy = groundY + f * FLOOR_H;
    const isTop = f === floors;
    addBox(0, fy + 0.075, 0, w, 0.15, d, isTop ? roofMat : floorMat);
  }

  const wallSegs: { x: number; z: number; w: number; d: number }[] = [];
  for (let side = 0; side < 4; side++) {
    if (side === doorSide) {
      const totalLen = side === 0 || side === 2 ? w : d;
      const segLen = (totalLen - doorW) / 2;
      if (side === 0) {
        wallSegs.push({ x: -hw + segLen / 2, z: -hd, w: segLen, d: wt });
        wallSegs.push({ x: hw - segLen / 2, z: -hd, w: segLen, d: wt });
      } else if (side === 1) {
        wallSegs.push({ x: hw, z: -hd + segLen / 2, w: wt, d: segLen });
        wallSegs.push({ x: hw, z: hd - segLen / 2, w: wt, d: segLen });
      } else if (side === 2) {
        wallSegs.push({ x: -hw + segLen / 2, z: hd, w: segLen, d: wt });
        wallSegs.push({ x: hw - segLen / 2, z: hd, w: segLen, d: wt });
      } else {
        wallSegs.push({ x: -hw, z: -hd + segLen / 2, w: wt, d: segLen });
        wallSegs.push({ x: -hw, z: hd - segLen / 2, w: wt, d: segLen });
      }
    } else {
      if (side === 0 || side === 2) {
        const sz = side === 0 ? -hd : hd;
        wallSegs.push({ x: 0, z: sz, w: w, d: wt });
      } else {
        const sx = side === 1 ? hw : -hw;
        wallSegs.push({ x: sx, z: 0, w: wt, d: d });
      }
    }
  }

  for (const seg of wallSegs) {
    addBox(seg.x, groundY + hh / 2, seg.z, seg.w, hh, seg.d, wallMat);
    data.houseBounds.push({
      minX: x + seg.x - seg.w / 2 - 0.3,
      maxX: x + seg.x + seg.w / 2 + 0.3,
      minZ: z + seg.z - seg.d / 2 - 0.3,
      maxZ: z + seg.z + seg.d / 2 + 0.3,
    });
  }

  const trimH = 0.12;
  addBox(0, groundY + trimH / 2, -hd - 0.01, w + 0.1, trimH, 0.06, trimMat);
  addBox(0, groundY + trimH / 2, hd + 0.01, w + 0.1, trimH, 0.06, trimMat);
  addBox(-hw - 0.01, groundY + trimH / 2, 0, 0.06, trimH, d + 0.1, trimMat);
  addBox(hw + 0.01, groundY + trimH / 2, 0, 0.06, trimH, d + 0.1, trimMat);

  for (let f = 0; f < floors; f++) {
    const fy = groundY + f * FLOOR_H + FLOOR_H * 0.5;
    if (fy > groundY + hh - 0.5) continue;
    const windowW = 0.6;
    const windowH = 0.8;
    const windowFrameT = 0.06;

    for (let side = 0; side < 4; side++) {
      if (side === doorSide && f === 0) {
        const dw = 1.0;
        const dh = 2.2;
        let doorX = 0, doorZ = 0;
        if (side === 0) { doorX = 0; doorZ = -hd - 0.02; }
        else if (side === 1) { doorX = hw + 0.02; doorZ = 0; }
        else if (side === 2) { doorX = 0; doorZ = hd + 0.02; }
        else { doorX = -hw - 0.02; doorZ = 0; }

        addBox(doorX, groundY + dh / 2, doorZ, dw + 0.15, dh + 0.08, 0.1, doorFrameMat, false);
        addBox(doorX, groundY + dh / 2, doorZ, dw, dh, 0.08, doorMat, false);
        const knobSide = side === 1 ? 0.05 : side === 3 ? -0.05 : (side === 0 ? 0.35 : -0.35);
        const knobD = side === 0 ? -0.05 : side === 2 ? 0.05 : 0;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshLambertMaterial({ color: 0xccaa44 }));
        knob.position.set(x + doorX + knobSide, groundY + 1.1, z + doorZ + knobD);
        group.add(knob);
      } else {
        const winCount = (side === 0 || side === 2) ? Math.max(1, Math.floor(w / 3)) : Math.max(1, Math.floor(d / 3));
        for (let wi = 0; wi < winCount; wi++) {
          const totalSide = (side === 0 || side === 2) ? w : d;
          const spacing = totalSide / (winCount + 1);
          const offset = -totalSide / 2 + spacing * (wi + 1);
          let wx = 0, wz = 0, wrY = 0;
          if (side === 0) { wx = offset; wz = -hd - 0.02; }
          else if (side === 1) { wx = hw + 0.02; wz = offset; wrY = Math.PI / 2; }
          else if (side === 2) { wx = offset; wz = hd + 0.02; wrY = Math.PI; }
          else { wx = -hw - 0.02; wz = offset; wrY = -Math.PI / 2; }

          const frame = new THREE.Mesh(new THREE.BoxGeometry(windowW + windowFrameT * 2, windowH + windowFrameT * 2, 0.08), windowFrameMat);
          frame.position.set(x + wx, fy, z + wz);
          frame.rotation.y = wrY;
          group.add(frame);

          const glass = new THREE.Mesh(new THREE.BoxGeometry(windowW, windowH, 0.05), windowMat);
          glass.position.set(x + wx, fy, z + wz);
          glass.rotation.y = wrY;
          group.add(glass);
        }
      }
    }
  }

  if (floors >= 2) {
    const stairW = 1.8;
    const stairLen = Math.min(w, d) * 0.6;
    const stepsPerFloor = 8;
    const stepH = FLOOR_H / stepsPerFloor;
    const stepD = stairLen / stepsPerFloor;

    let stairX = 0, stairZ = 0, stairDirX = 0, stairDirZ = 1;
    switch (doorSide) {
      case 0: stairX = -hw + 2; stairZ = -hd + stairLen / 2 + 1; stairDirZ = 1; break;
      case 1: stairX = hw - stairLen / 2 - 1; stairZ = -hd + 2; stairDirX = -1; break;
      case 2: stairX = hw - 2; stairZ = hd - stairLen / 2 - 1; stairDirZ = -1; break;
      case 3: stairX = -hw + stairLen / 2 + 1; stairZ = hd - 2; stairDirX = 1; break;
    }

    data.buildingFloors.push({
      minX: x - hw, maxX: x + hw,
      minZ: z - hd, maxZ: z + hd,
      groundY, floorH: FLOOR_H, floors,
      stairX: x + stairX, stairZ: z + stairZ,
      stairDirX, stairDirZ, stairLen,
    });

    for (let f = 0; f < floors; f++) {
      const baseY = groundY + f * FLOOR_H;
      for (let s = 0; s < stepsPerFloor; s++) {
        const sy = baseY + stepH / 2 + s * stepH;
        const sx = stairX + stairDirX * (s * stepD + stepD / 2);
        const sz = stairZ + stairDirZ * (s * stepD + stepD / 2);
        addBox(sx, sy, sz, stairW, stepH + 0.05, stepD, stairMat);
      }
    }

    const pWallH = 0.9;
    const roofY = groundY + hh;
    addBox(0, roofY + pWallH / 2, -hd, w + 0.4, pWallH, 0.2, wallMat);
    addBox(0, roofY + pWallH / 2, hd, w + 0.4, pWallH, 0.2, wallMat);
    addBox(-hw, roofY + pWallH / 2, 0, 0.2, pWallH, d, wallMat);
    addBox(hw, roofY + pWallH / 2, 0, 0.2, pWallH, d, wallMat);
  }

  if (floors === 1 && hh <= 4) {
    const roofY = groundY + hh;
    const overhang = 0.5;
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const ry = roofY + t * 1.2;
      const rw = w + overhang * 2 * (1 - t);
      const rd = d + overhang * 2 * (1 - t);
      addBox(0, ry + 0.08, 0, rw, 0.16, rd, roofMat);
    }
  }

  group.position.set(0, 0, 0);
  scene.add(group);
}

function createEnvironment(scene: THREE.Scene, houseBounds: MapData['houseBounds']) {
  const rand = seededRandom(42);

  const treePositions: [number, number, number][] = [];
  for (let i = 0; i < 35; i++) {
    const tx = (rand() - 0.5) * (WORLD_SIZE * 1.6);
    const tz = (rand() - 0.5) * (WORLD_SIZE * 1.6);
    const onRoad = Math.abs(tx) < 18 || Math.abs(tz) < 8 || CROSS_ROADS.some(rz => Math.abs(tz - rz) < 8);
    const onPlaza = Math.hypot(tx, tz) < 50;
    let inHouse = false;
    for (const b of houseBounds) {
      if (tx > b.minX - 3 && tx < b.maxX + 3 && tz > b.minZ - 3 && tz < b.maxZ + 3) {
        inHouse = true;
        break;
      }
    }
    if (onRoad || onPlaza || inHouse) continue;
    treePositions.push([tx, tz, 0.7 + rand() * 0.8]);
  }

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x228B22 }),
    new THREE.MeshLambertMaterial({ color: 0x2E8B57 }),
    new THREE.MeshLambertMaterial({ color: 0x3CB371 }),
  ];

  for (const [tx, tz, ts] of treePositions) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * ts, 0.25 * ts, 2.5 * ts, 6), trunkMat);
    trunk.position.y = 1.25 * ts;
    g.add(trunk);
    const leafMat = leafMats[Math.floor(rand() * leafMats.length)];
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.8 * ts, 3.5 * ts, 6), leafMat);
    leaves.position.y = 4.0 * ts;
    g.add(leaves);
    g.position.set(tx, 0, tz);
    scene.add(g);
  }

  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
  const lightPositions: [number, number][] = [];
  for (let lz = -350; lz <= 350; lz += 80) {
    if (Math.abs(lz) < 20) continue;
    lightPositions.push([-18, lz]);
    lightPositions.push([18, lz]);
  }
  for (let lx = -350; lx <= 350; lx += 80) {
    if (Math.abs(lx) < 20) continue;
    lightPositions.push([lx, -18]);
    lightPositions.push([lx, 18]);
  }
  for (const [lx, lz] of lightPositions) {
    let blocked = false;
    for (const b of houseBounds) {
      if (lx > b.minX - 1 && lx < b.maxX + 1 && lz > b.minZ - 1 && lz < b.maxZ + 1) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), poleMat);
    pole.position.set(0, 3, 0);
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.2), poleMat);
    arm.position.set(0, 5.8, 0.6);
    g.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), lightMat);
    lamp.position.set(0, 5.7, 1.2);
    g.add(lamp);
    g.position.set(lx, 0, lz);
    scene.add(g);
  }

  const trashMat = new THREE.MeshLambertMaterial({ color: 0x336633 });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  for (let i = 0; i < 8; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 50 + rand() * 100;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    if (Math.hypot(bx, bz) < 50) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.65, 10), trashMat);
    body.position.y = 0.32;
    body.castShadow = true;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 12), rimMat);
    rim.position.y = 0.65;
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 10), rimMat);
    lid.position.y = 0.67;
    g.add(lid);
    g.position.set(bx, 0, bz);
    scene.add(g);
  }
}
