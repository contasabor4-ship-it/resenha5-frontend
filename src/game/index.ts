import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

type GameState = 'loading' | 'connecting' | 'playing' | 'dead' | 'menu';

interface PlayerData {
  id: string;
  nickname: string;
  x: number; y: number; z: number;
  rotation: number;
  health: number; armor: number;
  money: number; kills: number; deaths: number;
  weapon: string; ammo: number;
  inVehicle: string | null;
  isAlive: boolean;
  speed: number;
  color: string;
}

interface VehicleData {
  id: string;
  model: string;
  x: number; y: number; z: number;
  rotation: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  handling: number;
  color: number;
  driver: string | null;
  health: number;
}

interface HouseData {
  id: string;
  name: string;
  x: number; z: number;
  w: number; h: number; d: number;
  color: number;
  roofColor?: number;
  doorSide?: number;
  isEasterEgg?: boolean;
}

interface WeaponInfo {
  damage: number;
  fireRate: number;
  ammo: number;
  spread: number;
  recoil: number;
}

export default class Game {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private socket: Socket | null = null;
  private state: GameState = 'loading';
  private playerData: PlayerData | null = null;
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private players3D: Map<string, THREE.Group> = new Map();
  private playerHealthMap: Map<string, number> = new Map();
  private vehicles3D: Map<string, THREE.Group> = new Map();
  private houses3D: Map<string, THREE.Group> = new Map();
  private projectiles3D: Map<string, THREE.Mesh> = new Map();
  private weapons: Record<string, WeaponInfo> = {};
  private lastShot = 0;
  private nearbyVehicle: VehicleData | null = null;
  private worldSize = 200;
  private cameraHeight = 1.7;
  private clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private onStateChange?: (state: GameState) => void;
  private currentVehicle: VehicleData | null = null;
  private vehicleRotation = 0;
  private houseBounds: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private weaponArms: THREE.Group | null = null;
  private recoilAmount = 0;
  private vehicleDataMap: Map<string, VehicleData> = new Map();
  private currentWeaponModel = '';
  private wastedOverlay: HTMLElement | null = null;
  private wastedText: HTMLElement | null = null;
  private wastedFadeTimer = 0;
  private deathAnimProgress = 0;
  private deathCamAngle = 0;

  constructor(container: HTMLElement, onStateChange?: (state: GameState) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.init();
    this.connectSocket();
    this.animate();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 50, this.worldSize * 0.8);

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 500);
    this.camera.position.set(0, this.cameraHeight, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, 80, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 300;
    dir.shadow.camera.left = -100;
    dir.shadow.camera.right = 100;
    dir.shadow.camera.top = 100;
    dir.shadow.camera.bottom = -100;
    this.scene.add(dir);

    const groundGeo = new THREE.PlaneGeometry(this.worldSize, this.worldSize);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a7d44 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.createWeaponArms();
    this.createCrosshair();
    this.setupEventListeners();
  }

  private createWeaponArms() {
    this.weaponArms = new THREE.Group();
    this.weaponArms.position.set(0.35, -0.35, -0.5);
    this.camera.add(this.weaponArms);
    this.scene.add(this.camera);
    this.buildWeaponModel('pistol');
  }

  private buildWeaponModel(weaponName: string) {
    if (!this.weaponArms) return;
    while (this.weaponArms.children.length > 0) {
      const c = this.weaponArms.children[0];
      this.weaponArms.remove(c);
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    }

    const skinMat = new THREE.MeshBasicMaterial({ color: 0xdeb887 });
    const gunMetal = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    const gunDark = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const woodMat = new THREE.MeshBasicMaterial({ color: 0x5c3a1e });

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.55), new THREE.MeshLambertMaterial({ color: 0x334455 }));
    sleeve.position.set(0.2, -0.15, -0.3);
    sleeve.rotation.x = 0.5;
    this.weaponArms.add(sleeve);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.4, 8), skinMat);
    forearm.position.set(0.2, -0.12, -0.58);
    forearm.rotation.x = 0.1;
    this.weaponArms.add(forearm);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.1), skinMat);
    hand.position.set(0.2, -0.1, -0.72);
    this.weaponArms.add(hand);

    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), skinMat);
    hand2.position.set(0.2, -0.08, -0.78);
    this.weaponArms.add(hand2);

    if (weaponName === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.28), gunDark);
      slide.position.set(0.2, -0.02, -0.82);
      this.weaponArms.add(slide);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, -0.01, -0.98);
      this.weaponArms.add(barrel);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), gunDark);
      grip.position.set(0.2, -0.14, -0.72);
      grip.rotation.x = 0.3;
      this.weaponArms.add(grip);
    } else if (weaponName === 'shotgun') {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.22), woodMat);
      stock.position.set(0.2, -0.12, -0.58);
      this.weaponArms.add(stock);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.18), gunDark);
      body.position.set(0.2, -0.06, -0.76);
      this.weaponArms.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, -0.04, -0.96);
      this.weaponArms.add(barrel);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.14), woodMat);
      pump.position.set(0.2, -0.05, -0.86);
      this.weaponArms.add(pump);
    } else if (weaponName === 'smg') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.22), gunDark);
      body.position.set(0.2, -0.05, -0.76);
      this.weaponArms.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, -0.035, -0.94);
      this.weaponArms.add(barrel);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.04), gunMetal);
      mag.position.set(0.2, -0.15, -0.74);
      mag.rotation.x = 0.15;
      this.weaponArms.add(mag);
      const stock2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), gunDark);
      stock2.position.set(0.2, -0.06, -0.62);
      this.weaponArms.add(stock2);
    } else if (weaponName === 'rifle') {
      const stock3 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.2), woodMat);
      stock3.position.set(0.2, -0.08, -0.56);
      this.weaponArms.add(stock3);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.28), gunDark);
      body.position.set(0.2, -0.05, -0.74);
      this.weaponArms.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 8), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, -0.035, -1.0);
      this.weaponArms.add(barrel);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), gunMetal);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.2, 0.0, -0.78);
      this.weaponArms.add(scope);
      const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 8), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 }));
      scopeLens.position.set(0.2, 0.0, -0.84);
      this.weaponArms.add(scopeLens);
      const mag2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), gunMetal);
      mag2.position.set(0.2, -0.14, -0.7);
      this.weaponArms.add(mag2);
    }
  }

  private createCrosshair() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 });
    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.008), mat);
    center.position.set(0, 0, -1);
    center.renderOrder = 999;
    this.camera.add(center);
  }

  private animateArms() {
    if (!this.weaponArms) return;
    if (this.recoilAmount > 0) {
      this.weaponArms.position.z = -0.5 + this.recoilAmount * 0.15;
      this.weaponArms.rotation.x = -this.recoilAmount * 0.1;
      this.recoilAmount *= 0.8;
      if (this.recoilAmount < 0.01) {
        this.recoilAmount = 0;
        this.weaponArms.position.z = -0.5;
        this.weaponArms.rotation.x = 0;
      }
    }
  }

  private connectSocket() {
    const serverUrl = (window as any).__GAME_SERVER_URL || 'http://localhost:3001';
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 120000,
    });

    this.socket.on('connect', () => {
      console.log('GTA connected');
      this.state = 'connecting';
      this.onStateChange?.('connecting');
      const nickname = localStorage.getItem('nickname') || 'Player';
      this.socket?.emit('join', { nickname });
    });

    this.socket.on('welcome', (data: { player: PlayerData; vehicles: VehicleData[]; houses: HouseData[]; weapons: Record<string, WeaponInfo>; worldSize: number }) => {
      this.playerData = data.player;
      this.weapons = data.weapons;
      this.worldSize = data.worldSize;
      this.state = 'playing';
      this.onStateChange?.('playing');
      this.setupWorld(data.vehicles, data.houses);
      this.currentWeaponModel = data.player.weapon;
      this.buildWeaponModel(data.player.weapon);
      this.updateHUD();
    });

    this.socket.on('players_update', (players: PlayerData[]) => {
      for (const [id, group] of this.players3D) {
        if (!players.find(p => p.id === id)) {
          this.scene.remove(group);
          this.players3D.delete(id);
          this.playerHealthMap.delete(id);
        }
      }
      for (const p of players) {
        if (p.id === this.socket?.id) continue;
        const prevHealth = this.playerHealthMap.get(p.id) || 100;
        let group = this.players3D.get(p.id);
        if (!group) {
          group = this.createPlayerModel(p);
          this.scene.add(group);
          this.players3D.set(p.id, group);
        }
        this.playerHealthMap.set(p.id, p.health);
        if (p.inVehicle) {
          group.visible = false;
        } else {
          group.visible = true;
          if (p.isAlive) {
            group.position.set(p.x, p.y, p.z);
            group.rotation.set(0, p.rotation, 0);
            group.rotation.x = 0;
            group.rotation.z = 0;
          } else {
            group.position.set(p.x, 0.3, p.z);
            group.rotation.x = -Math.PI / 2;
          }
        }
      }
      const me = players.find(p => p.id === this.socket?.id);
      if (me && this.playerData) {
        this.playerData.health = me.health;
        this.playerData.armor = me.armor;
        this.playerData.money = me.money;
        this.playerData.kills = me.kills;
        this.playerData.deaths = me.deaths;
        this.playerData.weapon = me.weapon;
        this.playerData.ammo = me.ammo;
        this.playerData.isAlive = me.isAlive;
        if (me.inVehicle !== this.playerData.inVehicle) {
          this.playerData.inVehicle = me.inVehicle;
          if (!me.inVehicle) this.currentVehicle = null;
        }
        this.updateHUD();
      }
    });

    this.socket.on('vehicle_update', (vehicle: VehicleData) => {
      this.vehicleDataMap.set(vehicle.id, vehicle);
      this.updateVehicle3D(vehicle);
    });

    this.socket.on('projectiles_update', (projectiles: { id: string; x: number; y: number; z: number }[]) => {
      this.updateProjectiles3D(projectiles);
    });

    this.socket.on('player_death', (data: { killerId: string; victimId: string; killerName: string; victimName: string; deathX: number; deathY: number; deathZ: number }) => {
      if (data.victimId === this.socket?.id) {
        this.state = 'dead';
        this.onStateChange?.('dead');
        if (document.pointerLockElement) document.exitPointerLock();
        this.showWASTED();
      }
    });

    this.socket.on('killfeed', (killfeed: any[]) => {
      this.updateKillfeed(killfeed);
    });

    this.socket.on('disconnect', () => {
      console.log('GTA disconnected');
      this.onStateChange?.('connecting');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      this.onStateChange?.('connecting');
    });
  }

  private createPlayerModel(p: PlayerData): THREE.Group {
    const group = new THREE.Group();
    const color = new THREE.Color(p.color);
    const skinColor = new THREE.Color(0xdeb887);
    const darkSkin = new THREE.Color(0xc49a6c);
    const pantsColor = new THREE.Color(0x333355);
    const shoeColor = new THREE.Color(0x222222);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.7, 12), new THREE.MeshLambertMaterial({ color }));
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), new THREE.MeshLambertMaterial({ color }));
    shoulders.position.y = 1.45;
    group.add(shoulders);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
    neck.position.y = 1.58;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshLambertMaterial({ color: skinColor }));
    head.position.y = 1.82;
    head.castShadow = true;
    group.add(head);

    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeWhite);
      eyeW.position.set(side * 0.07, 1.85, -0.16);
      group.add(eyeW);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), pupil);
      pup.position.set(side * 0.07, 1.85, -0.19);
      group.add(pup);
    }

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), new THREE.MeshBasicMaterial({ color: 0x8b4513 }));
    mouth.position.set(0, 1.75, -0.19);
    group.add(mouth);

    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.55, 8), new THREE.MeshLambertMaterial({ color }));
    lArm.position.set(-0.38, 1.15, 0);
    group.add(lArm);
    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
    lForearm.position.set(-0.38, 0.65, 0);
    group.add(lForearm);

    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.55, 8), new THREE.MeshLambertMaterial({ color }));
    rArm.position.set(0.38, 1.15, 0);
    group.add(rArm);
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
    rForearm.position.set(0.38, 0.65, 0);
    group.add(rForearm);

    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.55, 8), new THREE.MeshLambertMaterial({ color: pantsColor }));
    lLeg.position.set(-0.13, 0.5, 0);
    group.add(lLeg);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.55, 8), new THREE.MeshLambertMaterial({ color: pantsColor }));
    rLeg.position.set(0.13, 0.5, 0);
    group.add(rLeg);

    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), new THREE.MeshLambertMaterial({ color: shoeColor }));
    lShoe.position.set(-0.13, 0.04, -0.03);
    group.add(lShoe);
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), new THREE.MeshLambertMaterial({ color: shoeColor }));
    rShoe.position.set(0.13, 0.04, -0.03);
    group.add(rShoe);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    belt.position.y = 0.82;
    group.add(belt);

    const hpRatio = p.health / 100;
    const hpBarBg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide }));
    hpBarBg.position.set(0, 2.2, 0);
    hpBarBg.lookAt(new THREE.Vector3(0, 2.2, -10));
    group.add(hpBarBg);
    const hpBar = new THREE.Mesh(new THREE.PlaneGeometry(0.78 * hpRatio, 0.06), new THREE.MeshBasicMaterial({
      color: hpRatio > 0.5 ? 0x4CAF50 : hpRatio > 0.25 ? 0xFF9800 : 0xf44336,
      side: THREE.DoubleSide
    }));
    hpBar.position.set(-(0.78 * (1 - hpRatio)) / 2, 2.2, 0.001);
    hpBar.lookAt(new THREE.Vector3(0, 2.2, -10));
    group.add(hpBar);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.nickname, 128, 42);
    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.position.set(0, 2.5, 0);
    label.scale.set(2, 0.5, 1);
    group.add(label);

    return group;
  }

  private setupWorld(vehicles: VehicleData[], houses: HouseData[]) {
    this.houseBounds = [];
    this.vehicleDataMap.clear();
    for (const v of vehicles) {
      this.createVehicle3D(v);
      this.vehicleDataMap.set(v.id, v);
    }
    for (const h of houses) {
      this.createHouse3D(h);
    }

    for (let x = -this.worldSize / 2; x <= this.worldSize / 2; x += 20) {
      const roadGeo = new THREE.BoxGeometry(8, 0.05, this.worldSize);
      const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(x, 0.03, 0);
      this.scene.add(road);
      const lineGeo = new THREE.BoxGeometry(0.1, 0.06, this.worldSize);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(x, 0.06, 0);
      this.scene.add(line);
    }
    for (let z = -this.worldSize / 2; z <= this.worldSize / 2; z += 20) {
      const roadGeo = new THREE.BoxGeometry(this.worldSize, 0.05, 8);
      const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.position.set(0, 0.03, z);
      this.scene.add(road);
      const lineGeo = new THREE.BoxGeometry(this.worldSize, 0.06, 0.1);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, 0.06, z);
      this.scene.add(line);
    }
  }

  private createVehicle3D(vehicle: VehicleData) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: vehicle.color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.4 });
    const chromeMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });

    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);

    const addWheels = (positions: number[][]) => {
      for (const [wx, wy, wz] of positions) {
        const wheel = new THREE.Mesh(wheelGeo, blackMat);
        wheel.position.set(wx, wy, wz);
        wheel.rotation.z = Math.PI / 2;
        group.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.19, 8), chromeMat);
        hub.position.set(wx, wy, wz);
        hub.rotation.z = Math.PI / 2;
        group.add(hub);
      }
    };

    const addHeadlights = (z: number) => {
      for (const side of [-0.7, 0.7]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), headlightMat);
        hl.position.set(side, 0.45, z);
        group.add(hl);
      }
    };

    const addTailights = (z: number) => {
      for (const side of [-0.7, 0.7]) {
        const tl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        tl.position.set(side, 0.45, z);
        group.add(tl);
      }
    };

    const addBumper = (z: number) => {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.1), chromeMat);
      bumper.position.set(0, 0.2, z);
      group.add(bumper);
    };

    const model = vehicle.model;

    if (model === 'Sedan') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 4.2), bodyMat);
      body.position.y = 0.45;
      body.castShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.0), glassMat);
      cabin.position.set(0, 0.95, -0.2);
      group.add(cabin);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.0), bodyMat);
      trunk.position.set(0, 0.8, 1.2);
      group.add(trunk);
      addWheels([[-0.85, 0.28, 1.2], [0.85, 0.28, 1.2], [-0.85, 0.28, -1.2], [0.85, 0.28, -1.2]]);
      addHeadlights(-2.1);
      addTailights(2.1);
      addBumper(-2.15);
      addBumper(2.15);
    } else if (model === 'SUV') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
      body.position.y = 0.55;
      body.castShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.6), glassMat);
      cabin.position.set(0, 1.15, -0.1);
      group.add(cabin);
      const roofRail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.4), blackMat);
      roofRail.position.set(0, 1.48, -0.1);
      group.add(roofRail);
      addWheels([[-0.9, 0.32, 1.3], [0.9, 0.32, 1.3], [-0.9, 0.32, -1.3], [0.9, 0.32, -1.3]]);
      addHeadlights(-2.1);
      addTailights(2.1);
      addBumper(-2.15);
      addBumper(2.15);
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.6), blackMat);
      step.position.set(0, 0.16, 0);
      group.add(step);
    } else if (model === 'Sports') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 4.0), bodyMat);
      body.position.y = 0.35;
      body.castShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.5), glassMat);
      cabin.position.set(0, 0.7, -0.3);
      group.add(cabin);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 1.2), bodyMat);
      hood.position.set(0, 0.55, -1.2);
      hood.rotation.x = -0.1;
      group.add(hood);
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.2), blackMat);
      spoiler.position.set(0, 0.85, 1.8);
      group.add(spoiler);
      const spoilerStand1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), blackMat);
      spoilerStand1.position.set(-0.5, 0.75, 1.8);
      group.add(spoilerStand1);
      const spoilerStand2 = spoilerStand1.clone();
      spoilerStand2.position.x = 0.5;
      group.add(spoilerStand2);
      addWheels([[-0.8, 0.28, 1.1], [0.8, 0.28, 1.1], [-0.8, 0.28, -1.1], [0.8, 0.28, -1.1]]);
      addHeadlights(-2.0);
      addTailights(2.0);
    } else if (model === 'Truck') {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.0), bodyMat);
      cabin.position.set(0, 0.65, -1.0);
      cabin.castShadow = true;
      group.add(cabin);
      const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8), bodyMat);
      cabinRoof.position.set(0, 1.15, -1.0);
      group.add(cabinRoof);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.2), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      bed.position.set(0, 0.4, 1.1);
      group.add(bed);
      const bedRail1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 2.2), blackMat);
      bedRail1.position.set(-0.95, 0.85, 1.1);
      group.add(bedRail1);
      const bedRail2 = bedRail1.clone();
      bedRail2.position.x = 0.95;
      group.add(bedRail2);
      const bedBack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.06), blackMat);
      bedBack.position.set(0, 0.8, 2.2);
      group.add(bedBack);
      const bigWheels = new THREE.CylinderGeometry(0.35, 0.35, 0.22, 10);
      addWheels([[-1.0, 0.35, 1.2], [1.0, 0.35, 1.2], [-1.0, 0.35, -1.0], [1.0, 0.35, -1.0]]);
      addHeadlights(-2.0);
      addTailights(2.2);
      addBumper(-2.05);
    } else if (model === 'Muscle') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.2), bodyMat);
      body.position.y = 0.45;
      body.castShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.6), glassMat);
      cabin.position.set(0, 0.9, -0.2);
      group.add(cabin);
      const hood2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.5), bodyMat);
      hood2.position.set(0, 0.75, -1.2);
      group.add(hood2);
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.4), blackMat);
      scoop.position.set(0, 0.88, -1.0);
      group.add(scoop);
      const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 4.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      stripe1.position.set(-0.3, 0.71, 0);
      group.add(stripe1);
      const stripe2 = stripe1.clone();
      stripe2.position.x = 0.3;
      group.add(stripe2);
      addWheels([[-0.9, 0.28, 1.2], [0.9, 0.28, 1.2], [-0.9, 0.28, -1.2], [0.9, 0.28, -1.2]]);
      addHeadlights(-2.1);
      addTailights(2.1);
      addBumper(-2.15);
      addBumper(2.15);
    } else if (model === 'Coupe') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 3.6), bodyMat);
      body.position.y = 0.4;
      body.castShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), glassMat);
      cabin.position.set(0, 0.8, -0.1);
      group.add(cabin);
      const roof2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.6), bodyMat);
      roof2.position.set(0, 1.02, -0.1);
      group.add(roof2);
      addWheels([[-0.8, 0.26, 1.0], [0.8, 0.26, 1.0], [-0.8, 0.26, -1.0], [0.8, 0.26, -1.0]]);
      addHeadlights(-1.8);
      addTailights(1.8);
      addBumper(-1.85);
      addBumper(1.85);
    }

    const mirrorGeo = new THREE.BoxGeometry(0.08, 0.06, 0.12);
    for (const side of [-0.95, 0.95]) {
      const mirror = new THREE.Mesh(mirrorGeo, blackMat);
      mirror.position.set(side, 0.8, -0.5);
      group.add(mirror);
    }

    group.position.set(vehicle.x, vehicle.y, vehicle.z);
    group.rotation.y = vehicle.rotation;
    this.scene.add(group);
    this.vehicles3D.set(vehicle.id, group);
  }

  private createHouse3D(house: HouseData) {
    const group = new THREE.Group();
    const wt = 0.3;
    const hh = house.h;
    const hw = house.w / 2;
    const hd = house.d / 2;
    const doorSide = (house as any).doorSide ?? 0;
    const doorW = 2.0;

    const wallMat = new THREE.MeshLambertMaterial({ color: house.color });
    const innerMat = new THREE.MeshLambertMaterial({ color: 0xd2c4a8 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
    const ceilingMat = new THREE.MeshLambertMaterial({ color: 0xc8b89a });
    const furnitureMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const couchMat = new THREE.MeshLambertMaterial({ color: 0x4a6b8a });
    const tableMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
    const shelfMat = new THREE.MeshLambertMaterial({ color: 0x696969 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(house.w, 0.15, house.d), floorMat);
    floor.position.y = 0.075;
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(house.w, 0.15, house.d), ceilingMat);
    ceiling.position.y = hh;
    group.add(ceiling);

    const roofColor = house.roofColor || 0x8B0000;
    const roofGeo = new THREE.ConeGeometry(Math.max(house.w, house.d) * 0.72, 2.5, 4);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: roofColor }));
    roof.position.y = hh + 1.25;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    const addWall = (cx: number, cz: number, w: number, d: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wallMat);
      wall.position.set(cx, hh / 2, cz);
      wall.castShadow = true;
      group.add(wall);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.05), innerMat);
      inner.position.set(cx, hh / 2, cz);
      group.add(inner);
      this.houseBounds.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    };

    const addDoorWall = (cx: number, cz: number, wallW: number, wallD: number, isHorizontal: boolean) => {
      if (isHorizontal) {
        const segW = (wallW - doorW) / 2;
        if (segW > 0.1) {
          addWall(cx - wallW / 2 + segW / 2, cz, segW, wallD);
          addWall(cx + wallW / 2 - segW / 2, cz, segW, wallD);
        }
      } else {
        const segD = (wallD - doorW) / 2;
        if (segD > 0.1) {
          addWall(cx, cz - wallD / 2 + segD / 2, wallW, segD);
          addWall(cx, cz + wallD / 2 - segD / 2, wallW, segD);
        }
      }
    };

    switch (doorSide) {
      case 0: addWall(0, -hd, house.w, wt); addWall(hw, 0, wt, house.d); addWall(-hw, 0, wt, house.d); addDoorWall(0, hd, house.w, wt, true); break;
      case 1: addWall(hw, 0, wt, house.d); addWall(0, hd, house.w, wt); addWall(0, -hd, house.w, wt); addDoorWall(-hw, 0, wt, house.d, false); break;
      case 2: addWall(0, hd, house.w, wt); addWall(hw, 0, wt, house.d); addWall(-hw, 0, wt, house.d); addDoorWall(0, -hd, house.w, wt, true); break;
      case 3: addWall(-hw, 0, wt, house.d); addWall(0, hd, house.w, wt); addWall(0, -hd, house.w, wt); addDoorWall(hw, 0, wt, house.d, false); break;
    }

    const iw = hw - 1.5;
    const id = hd - 1.5;
    const addBox = (fx: number, fz: number, fw: number, fh: number, fd: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), mat);
      mesh.position.set(fx, fh / 2 + 0.08, fz);
      mesh.castShadow = true;
      group.add(mesh);
      this.houseBounds.push({ minX: fx - fw / 2, maxX: fx + fw / 2, minZ: fz - fd / 2, maxZ: fz + fd / 2 });
    };

    if (house.name === 'Casa') {
      addBox(-iw * 0.5, 0, 1.6, 0.7, 0.7, couchMat);
      addBox(iw * 0.4, -id * 0.3, 0.8, 0.45, 0.6, tableMat);
      addBox(iw * 0.6, id * 0.5, 0.5, 1.2, 0.3, shelfMat);
    } else if (house.name === 'Galpao') {
      addBox(-iw * 0.4, 0, 1.2, 0.5, 1.0, shelfMat);
      addBox(iw * 0.4, 0, 1.2, 0.5, 1.0, shelfMat);
      addBox(0, -id * 0.3, 1.5, 0.4, 0.6, furnitureMat);
    } else if (house.name === 'Loja') {
      addBox(-iw * 0.5, -id * 0.3, 1.8, 0.7, 0.7, couchMat);
      addBox(iw * 0.5, 0, 0.6, 1.5, 0.4, shelfMat);
      addBox(0, id * 0.4, 1.0, 0.45, 0.6, tableMat);
    } else if (house.name === 'Predio') {
      addBox(-iw * 0.5, -id * 0.5, 2.0, 0.7, 0.8, couchMat);
      addBox(iw * 0.5, -id * 0.5, 0.8, 1.5, 0.4, shelfMat);
      addBox(-iw * 0.5, id * 0.4, 1.5, 0.45, 0.8, tableMat);
      addBox(iw * 0.5, id * 0.4, 0.8, 1.2, 0.6, furnitureMat);
    } else if (house.name === 'Mansao') {
      addBox(-iw * 0.6, -id * 0.5, 2.5, 0.7, 1.0, couchMat);
      addBox(iw * 0.6, -id * 0.5, 1.0, 1.8, 0.5, shelfMat);
      addBox(-iw * 0.6, id * 0.4, 1.8, 0.45, 0.8, tableMat);
      addBox(iw * 0.4, id * 0.4, 1.2, 0.7, 0.7, couchMat);
      addBox(0, 0, 3.0, 0.04, 3.0, new THREE.MeshLambertMaterial({ color: 0x8b0000 }));
    }

    const roofLight = new THREE.PointLight(0xffe4b5, 0.5, 14);
    roofLight.position.set(0, hh - 0.3, 0);
    group.add(roofLight);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(house.name, 128, 40);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Zona de combate', 128, 70);
    if (house.isEasterEgg) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('Easter Egg!', 128, 100);
    }
    const texture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.position.set(0, hh + 3.5, 0);
    label.scale.set(4, 2, 1);
    group.add(label);

    if (house.isEasterEgg) {
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 0.15), frameMat);
      frame.position.set(0, hh * 0.6, -hd + 0.5);
      group.add(frame);
      const paintCanvas = document.createElement('canvas');
      paintCanvas.width = 512;
      paintCanvas.height = 360;
      const pctx = paintCanvas.getContext('2d')!;
      pctx.fillStyle = '#1a1a2e';
      pctx.fillRect(0, 0, 512, 360);
      pctx.fillStyle = '#FFD700';
      pctx.font = 'bold 28px Arial';
      pctx.textAlign = 'center';
      pctx.fillText('Feito por', 256, 50);
      pctx.fillStyle = '#ffffff';
      pctx.font = 'bold 36px Arial';
      pctx.fillText('Hugo O goat', 256, 100);
      pctx.font = '20px Arial';
      pctx.fillStyle = '#cccccc';
      const credits = ['Luiz', 'Henrique', 'Leo', 'Matheus', 'Pedro', 'Daniel', 'Gustavo', 'Haziel', 'Igor', 'Renan', 'Felipe', 'Joao', 'Maquinario', 'Berinjela'];
      for (let i = 0; i < credits.length; i++) {
        const col = i < 7 ? 0 : 1;
        const row = i % 7;
        pctx.fillText(credits[i], 128 + col * 256, 150 + row * 30);
      }
      const paintTexture = new THREE.CanvasTexture(paintCanvas);
      const paintMat = new THREE.MeshBasicMaterial({ map: paintTexture });
      const painting = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), paintMat);
      painting.position.set(0, hh * 0.6, -hd + 0.43);
      group.add(painting);
    }

    group.position.set(house.x, 0, house.z);
    group.userData = { name: house.name };
    this.scene.add(group);
    this.houses3D.set(house.id, group);
  }

  private updateVehicle3D(vehicle: VehicleData) {
    const existing = this.vehicles3D.get(vehicle.id);
    if (existing) this.scene.remove(existing);
    this.createVehicle3D(vehicle);
  }

  private updateProjectiles3D(projectiles: { id: string; x: number; y: number; z: number }[]) {
    for (const [id, mesh] of this.projectiles3D) {
      if (!projectiles.find(p => p.id === id)) {
        this.scene.remove(mesh);
        this.projectiles3D.delete(id);
      }
    }
    for (const p of projectiles) {
      let mesh = this.projectiles3D.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        this.scene.add(mesh);
        this.projectiles3D.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
    }
  }

  private checkHouseCollision(x: number, z: number, radius: number): { x: number; z: number } {
    let newX = x;
    let newZ = z;
    for (const b of this.houseBounds) {
      const closestX = Math.max(b.minX, Math.min(newX, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(newZ, b.maxZ));
      const distX = newX - closestX;
      const distZ = newZ - closestZ;
      const dist = Math.sqrt(distX * distX + distZ * distZ);
      if (dist < radius) {
        if (dist === 0) {
          const toLeft = newX - b.minX;
          const toRight = b.maxX - newX;
          const toFront = newZ - b.minZ;
          const toBack = b.maxZ - newZ;
          const minPen = Math.min(toLeft, toRight, toFront, toBack);
          if (minPen === toLeft) newX = b.minX - radius;
          else if (minPen === toRight) newX = b.maxX + radius;
          else if (minPen === toFront) newZ = b.minZ - radius;
          else newZ = b.maxZ + radius;
        } else {
          const overlap = radius - dist;
          newX += (distX / dist) * overlap;
          newZ += (distZ / dist) * overlap;
        }
      }
    }
    return { x: newX, z: newZ };
  }

  private setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE' && this.nearbyVehicle && !this.playerData?.inVehicle) {
        this.socket?.emit('vehicle_enter', { vehicleId: this.nearbyVehicle.id });
        this.currentVehicle = this.nearbyVehicle;
      } else if (e.code === 'KeyF' && this.playerData?.inVehicle) {
        this.socket?.emit('vehicle_exit');
        this.currentVehicle = null;
      } else if (e.code === 'Digit1') this.switchWeapon('pistol');
      else if (e.code === 'Digit2') this.switchWeapon('shotgun');
      else if (e.code === 'Digit3') this.switchWeapon('smg');
      else if (e.code === 'Digit4') this.switchWeapon('rifle');
      else if (e.code === 'KeyR' && this.state === 'dead') {
        this.socket?.emit('respawn');
        this.state = 'playing';
        this.onStateChange?.('playing');
        this.hideWASTED();
      }
    });

    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.pointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.state !== 'playing') return;
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      this.cameraEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.cameraEuler.y -= mx * 0.002;
      this.cameraEuler.x -= my * 0.002;
      this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
      this.camera.quaternion.setFromEuler(this.cameraEuler);
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.pointerLocked && this.state === 'playing') this.shoot();
    });

    window.addEventListener('resize', () => {
      if (!this.camera) return;
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });

    const eHint = document.createElement('div');
    eHint.style.cssText = 'position:fixed;bottom:20%;left:50%;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,0.8);padding:12px 24px;border-radius:10px;font-size:20px;font-family:Arial;display:none;z-index:20;pointer-events:none;';
    eHint.id = 'e-hint';
    eHint.textContent = 'Pressione E para entrar no veiculo';
    document.body.appendChild(eHint);
  }

  private switchWeapon(weapon: string) {
    if (!this.playerData || !this.weapons[weapon]) return;
    this.socket?.emit('weapon_switch', { weapon });
    this.playerData.weapon = weapon;
    this.playerData.ammo = this.weapons[weapon].ammo;
    if (this.currentWeaponModel !== weapon) {
      this.currentWeaponModel = weapon;
      this.buildWeaponModel(weapon);
    }
    this.updateHUD();
  }

  private shoot() {
    if (!this.playerData || !this.camera || this.playerData.inVehicle) return;
    const now = Date.now();
    const weapon = this.weapons[this.playerData.weapon];
    if (!weapon || now - this.lastShot < weapon.fireRate) return;
    if (this.playerData.ammo <= 0) return;

    this.lastShot = now;
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);

    const spread = weapon.spread;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    this.socket?.emit('shoot', {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      dirX: dir.x,
      dirY: dir.y,
      dirZ: dir.z,
    });

    this.playerData.ammo--;
    this.recoilAmount = 1;
    this.updateHUD();
  }

  private updateHUD() {
    const existing = document.getElementById('gta-hud');
    if (existing) existing.remove();
    if (!this.playerData) return;

    const weaponKeys = Object.keys(this.weapons);
    const weaponSlots = weaponKeys.map((k, i) => {
      const active = k === this.playerData!.weapon;
      return `<span style="color:${active ? '#fff' : '#666'};${active ? 'text-decoration:underline;' : ''}">${i + 1}:${k.toUpperCase()}</span>`;
    }).join(' | ');

    const hud = document.createElement('div');
    hud.id = 'gta-hud';
    hud.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:10;font-family:Arial,sans-serif;';
    hud.innerHTML = `
      <div style="position:absolute;top:20px;left:20px;color:#fff;text-shadow:2px 2px 4px #000;font-size:24px;font-weight:bold;">
        ${this.playerData.nickname} - Resenha 5
      </div>
      <div style="position:absolute;bottom:20px;left:20px;color:#fff;text-shadow:2px 2px 4px #000;font-size:16px;background:rgba(0,0,0,0.5);padding:12px;border-radius:8px;">
        <div style="margin-bottom:6px;"><span style="color:${this.playerData.health > 50 ? '#4CAF50' : this.playerData.health > 25 ? '#FF9800' : '#f44336'};font-size:20px;font-weight:bold;">HP: ${Math.round(this.playerData.health)}</span> <span style="color:#4FC3F7;">Armor: ${Math.round(this.playerData.armor)}</span></div>
        <div style="margin-bottom:6px;font-size:18px;">Weapon: <span style="color:#FFD700;font-weight:bold;">${this.playerData.weapon.toUpperCase()}</span> | Ammo: <span style="color:#FFD700;">${this.playerData.ammo}</span></div>
        <div style="margin-bottom:6px;"><span style="color:#4CAF50;font-weight:bold;">$${this.playerData.money.toLocaleString()}</span> | K/D: ${this.playerData.kills}/${this.playerData.deaths}</div>
        <div style="font-size:12px;color:#aaa;">${weaponSlots}</div>
      </div>
      <div style="position:absolute;bottom:20px;right:20px;color:#fff;text-shadow:2px 2px 4px #000;font-size:14px;text-align:right;background:rgba(0,0,0,0.5);padding:12px;border-radius:8px;">
        <div>WASD - Mover</div>
        <div>Mouse - Olhar</div>
        <div>Click - Atirar</div>
        <div>E - Veiculo</div>
        <div>F - Sair do veiculo</div>
        <div>1-4 - Trocar arma</div>
        <div>R - Renascer</div>
      </div>
    `;
    document.body.appendChild(hud);
  }

  private updateKillfeed(killfeed: any[]) {
    const existing = document.getElementById('killfeed');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'killfeed';
    div.style.cssText = 'position:fixed;top:80px;right:20px;color:#fff;text-shadow:2px 2px 4px #000;font-size:14px;font-family:Arial;z-index:10;';
    div.innerHTML = killfeed.slice(0, 5).map(k =>
      `<div style="margin-bottom:4px;background:rgba(0,0,0,0.5);padding:4px 8px;border-radius:4px;">${k.killer} [${k.weapon}] ${k.victim}</div>`
    ).join('');
    document.body.appendChild(div);
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    if (this.state === 'playing' && this.playerData) {
      if (this.playerData.inVehicle) {
        this.handleVehicleInput(delta);
      } else {
        this.handlePlayerInput(delta);
      }
      this.checkNearbyEntities();
      if (this.weaponArms) this.weaponArms.visible = !this.playerData.inVehicle;
      this.animateArms();
    } else if (this.state === 'dead') {
      this.animateDeathCamera(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private handlePlayerInput(delta: number) {
    if (!this.playerData || !this.camera) return;

    const speed = 10;
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW']) moveDir.add(forward);
    if (this.keys['KeyS']) moveDir.sub(forward);
    if (this.keys['KeyA']) moveDir.sub(right);
    if (this.keys['KeyD']) moveDir.add(right);

    if (moveDir.length() > 0) {
      moveDir.normalize();
      let newX = this.playerData.x + moveDir.x * speed * delta;
      let newZ = this.playerData.z + moveDir.z * speed * delta;
      const collided = this.checkHouseCollision(newX, newZ, 0.5);
      newX = collided.x;
      newZ = collided.z;
      this.playerData.x = newX;
      this.playerData.z = newZ;
      this.playerData.rotation = Math.atan2(moveDir.x, moveDir.z);
    }

    this.playerData.x = Math.max(-this.worldSize / 2, Math.min(this.worldSize / 2, this.playerData.x));
    this.playerData.z = Math.max(-this.worldSize / 2, Math.min(this.worldSize / 2, this.playerData.z));

    this.camera.position.set(this.playerData.x, this.playerData.y + this.cameraHeight, this.playerData.z);

    this.socket?.emit('position', {
      x: this.playerData.x, y: this.playerData.y, z: this.playerData.z,
      rotation: this.playerData.rotation, speed: moveDir.length() * speed,
    });
  }

  private handleVehicleInput(delta: number) {
    if (!this.playerData || !this.camera || !this.currentVehicle) return;

    const vehicle = this.currentVehicle;
    let speed = vehicle.speed;

    if (this.keys['KeyW']) speed = Math.min(speed + vehicle.acceleration * delta, vehicle.maxSpeed);
    else if (this.keys['KeyS']) speed = Math.max(speed - vehicle.acceleration * 1.5 * delta, -vehicle.maxSpeed * 0.3);
    else speed *= 0.98;

    if (Math.abs(speed) < 0.1) speed = 0;

    let turnAmount = 0;
    if (this.keys['KeyA']) turnAmount = 2.5 * delta;
    if (this.keys['KeyD']) turnAmount = -2.5 * delta;

    if (Math.abs(speed) > 0.5) {
      this.vehicleRotation += turnAmount * (speed > 0 ? 1 : -1) * vehicle.handling;
    }

    const dirX = Math.sin(this.vehicleRotation);
    const dirZ = Math.cos(this.vehicleRotation);

    let newX = this.playerData.x + dirX * speed * delta;
    let newZ = this.playerData.z + dirZ * speed * delta;
    const collided = this.checkHouseCollision(newX, newZ, 1.5);
    newX = collided.x;
    newZ = collided.z;
    this.playerData.x = newX;
    this.playerData.z = newZ;
    this.playerData.rotation = this.vehicleRotation;
    this.playerData.speed = Math.abs(speed);

    vehicle.x = this.playerData.x;
    vehicle.z = this.playerData.z;
    vehicle.rotation = this.vehicleRotation;
    vehicle.speed = speed;

    const carMesh = this.vehicles3D.get(vehicle.id);
    if (carMesh) {
      carMesh.position.set(vehicle.x, vehicle.y, vehicle.z);
      carMesh.rotation.y = vehicle.rotation;
    }

    const camDist = 6;
    const camHeight = 3;
    const camX = this.playerData.x - Math.sin(this.vehicleRotation) * camDist;
    const camZ = this.playerData.z - Math.cos(this.vehicleRotation) * camDist;
    this.camera.position.set(camX, this.playerData.y + camHeight, camZ);

    const lookX = this.playerData.x + Math.sin(this.vehicleRotation) * 3;
    const lookZ = this.playerData.z + Math.cos(this.vehicleRotation) * 3;
    this.camera.lookAt(lookX, this.playerData.y + 1.5, lookZ);

    this.socket?.emit('vehicle_position', {
      x: vehicle.x, y: vehicle.y, z: vehicle.z,
      rotation: vehicle.rotation, speed: vehicle.speed,
    });

    this.socket?.emit('position', {
      x: this.playerData.x, y: this.playerData.y, z: this.playerData.z,
      rotation: this.playerData.rotation, speed: vehicle.speed,
    });
  }

  private checkNearbyEntities() {
    if (!this.playerData) return;

    this.nearbyVehicle = null;
    const vehicles = Array.from(this.vehicles3D.entries());
    for (const [id, group] of vehicles) {
      const dist = Math.hypot(group.position.x - this.playerData.x, group.position.z - this.playerData.z);
      if (dist < 6) {
        this.nearbyVehicle = this.vehicleDataMap.get(id) || null;
        break;
      }
    }

    const eHint = document.getElementById('e-hint');
    if (eHint) eHint.style.display = this.nearbyVehicle && !this.playerData.inVehicle ? 'block' : 'none';
  }

  private showWASTED() {
    this.deathAnimProgress = 0;
    if (!this.wastedOverlay) {
      this.wastedOverlay = document.createElement('div');
      this.wastedOverlay.id = 'wasted-overlay';
      this.wastedOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(180,0,0,0);pointer-events:none;z-index:50;display:flex;align-items:center;justify-content:center;transition:background 2s ease;';
      this.wastedText = document.createElement('div');
      this.wastedText.style.cssText = 'font-family:Impact,Arial,sans-serif;font-size:120px;color:rgba(255,0,0,0);text-shadow:4px 4px 8px rgba(0,0,0,0.8);letter-spacing:12px;text-transform:uppercase;transition:color 1.5s ease,transform 1.5s ease;transform:scale(0.5);';
      this.wastedText.textContent = 'WASTED';
      this.wastedOverlay.appendChild(this.wastedText);
      document.body.appendChild(this.wastedOverlay);
    }
    this.wastedOverlay.style.display = 'flex';
    requestAnimationFrame(() => {
      if (this.wastedOverlay) this.wastedOverlay.style.background = 'rgba(180,0,0,0.3)';
      if (this.wastedText) {
        this.wastedText.style.color = 'rgba(200,0,0,0.9)';
        this.wastedText.style.transform = 'scale(1)';
      }
    });
  }

  private hideWASTED() {
    if (this.wastedOverlay) {
      this.wastedOverlay.style.background = 'rgba(180,0,0,0)';
      if (this.wastedText) {
        this.wastedText.style.color = 'rgba(255,0,0,0)';
        this.wastedText.style.transform = 'scale(1.2)';
      }
      setTimeout(() => {
        if (this.wastedOverlay) this.wastedOverlay.style.display = 'none';
      }, 2000);
    }
    this.deathAnimProgress = 0;
  }

  private animateDeathCamera(delta: number) {
    if (this.state !== 'dead' || !this.playerData) return;
    this.deathAnimProgress = Math.min(1, this.deathAnimProgress + delta * 0.5);
    const targetX = this.playerData.x;
    const targetY = this.playerData.y;
    const targetZ = this.playerData.z;
    const camDist = 5;
    this.deathCamAngle += delta * 0.3;
    const camX = targetX + Math.sin(this.deathCamAngle) * camDist;
    const camZ = targetZ + Math.cos(this.deathCamAngle) * camDist;
    const camY = targetY + 2 - this.deathAnimProgress * 1.2;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(targetX, targetY + 0.5, targetZ);
    if (this.weaponArms) this.weaponArms.visible = false;
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.socket?.disconnect();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    const hud = document.getElementById('gta-hud');
    if (hud) hud.remove();
    const killfeed = document.getElementById('killfeed');
    if (killfeed) killfeed.remove();
    const eHint = document.getElementById('e-hint');
    if (eHint) eHint.remove();
    if (this.wastedOverlay) this.wastedOverlay.remove();
  }
}
