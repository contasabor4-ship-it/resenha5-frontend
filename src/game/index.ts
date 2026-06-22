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
  private playerAnimTime: Map<string, number> = new Map();
  private vehicles3D: Map<string, THREE.Group> = new Map();
  private houses3D: Map<string, THREE.Group> = new Map();
  private projectiles3D: Map<string, THREE.Mesh> = new Map();
  private weapons: Record<string, WeaponInfo> = {};
  private lastShot = 0;
  private nearbyVehicle: VehicleData | null = null;
  private worldSize = 400;
  private cameraHeight = 1.7;
  private clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private onStateChange?: (state: GameState) => void;
  private currentVehicle: VehicleData | null = null;
  private vehicleRotation = 0;
  private houseBounds: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private buildingFloors: { minX: number; maxX: number; minZ: number; maxZ: number; groundY: number; floorH: number; floors: number; stairX: number; stairZ: number; stairDirX: number; stairDirZ: number; stairLen: number }[] = [];
  private weaponArms: THREE.Group | null = null;
  private recoilAmount = 0;
  private vehicleDataMap: Map<string, VehicleData> = new Map();
  private vehicleTargetPos: Map<string, { x: number; y: number; z: number; rot: number }> = new Map();
  private currentWeaponModel = '';
  private muzzleFlash: THREE.Mesh | null = null;
  private muzzleFlashTimer = 0;
  private wastedOverlay: HTMLElement | null = null;
  private wastedText: HTMLElement | null = null;
  private wastedFadeTimer = 0;
  private deathAnimProgress = 0;
  private deathCamAngle = 0;
  private shopItems: { id: string; name: string; price: number; category: string }[] = [];
  private shopOpen = false;
  private terrainMesh: THREE.Mesh | null = null;

  constructor(container: HTMLElement, onStateChange?: (state: GameState) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.init();
    this.connectSocket();
    this.animate();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8e3);
    this.scene.fog = new THREE.Fog(0x7ec8e3, 200, 600);

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 2000);
    this.camera.position.set(0, this.cameraHeight, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a8c3f, 0.6);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff5e6, 1.0);
    dir.position.set(50, 80, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 500;
    dir.shadow.camera.left = -400;
    dir.shadow.camera.right = 400;
    dir.shadow.camera.top = 400;
    dir.shadow.camera.bottom = -400;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    this.createWeaponArms();
    this.createCrosshair();
    this.setupEventListeners();
    this.createTouchControls();
  }

  private isMobileDevice(): boolean {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || ('ontouchstart' in window && window.innerWidth < 1024);
  }

  private createTouchControls() {
    if (this.isMobileDevice()) {
      this.createJoystickLeft();
      this.createJoystickRight();
      this.createFireButton();
    }
  }

  private createJoystickLeft() {
    const joystick = document.createElement('div');
    joystick.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 30px;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: rgba(255,255,255,0.15);
      border: 2px solid rgba(255,255,255,0.3);
      touch-action: none;
      z-index: 100;
      cursor: pointer;
    `;
    joystick.id = 'joystick-left';
    document.body.appendChild(joystick);

    let isActive = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentZ = 0;

    const onTouchStart = (e: TouchEvent) => {
      isActive = true;
      const touch = e.touches[0];
      startX = touch.clientX - joystick.getBoundingClientRect().left;
      startY = touch.clientY - joystick.getBoundingClientRect().top;
      currentX = startX;
      currentZ = startY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isActive) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = joystick.getBoundingClientRect();
      currentX = touch.clientX - rect.left;
      currentZ = touch.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerZ = rect.height / 2;
      const dx = currentX - centerX;
      const dz = currentZ - centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const maxDistance = Math.min(centerX, centerZ) - 10;
      if (distance > maxDistance) {
        const angle = Math.atan2(dz, dx);
        currentX = centerX + Math.cos(angle) * maxDistance;
        currentZ = centerZ + Math.sin(angle) * maxDistance;
      }

      joystick.style.background = 'radial-gradient(rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 80%)';
      joystick.style.transform = `translate3d(${currentX - centerX}px, ${currentZ - centerZ}px, 0)`;

      const angle = Math.atan2(dx, -dz);
      const moveDir = angle + Math.PI / 2;
      this.keys['KeyW'] = Math.cos(moveDir) < -0.1;
      this.keys['KeyS'] = Math.cos(moveDir) > 0.1;
      this.keys['KeyA'] = Math.sin(moveDir) < -0.1;
      this.keys['KeyD'] = Math.sin(moveDir) > 0.1;
    };

    const onTouchEnd = () => {
      isActive = false;
      joystick.style.background = 'rgba(255,255,255,0.15)';
      joystick.style.transform = 'translate3d(0px, 0px, 0)';
      this.keys['KeyW'] = false;
      this.keys['KeyS'] = false;
      this.keys['KeyA'] = false;
      this.keys['KeyD'] = false;
    };

    joystick.addEventListener('touchstart', onTouchStart, { passive: false });
    joystick.addEventListener('touchmove', onTouchMove, { passive: false });
    joystick.addEventListener('touchend', onTouchEnd);
  }

  private createJoystickRight() {
    const joystick = document.createElement('div');
    joystick.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      border: 2px solid rgba(255,255,255,0.3);
      touch-action: none;
      z-index: 100;
      cursor: pointer;
    `;
    joystick.id = 'joystick-right';
    document.body.appendChild(joystick);

    let isActive = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentZ = 0;

    const onTouchStart = (e: TouchEvent) => {
      isActive = true;
      const touch = e.touches[0];
      startX = touch.clientX - joystick.getBoundingClientRect().left;
      startY = touch.clientY - joystick.getBoundingClientRect().top;
      currentX = startX;
      currentZ = startY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isActive) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = joystick.getBoundingClientRect();
      currentX = touch.clientX - rect.left;
      currentZ = touch.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerZ = rect.height / 2;
      const dx = currentX - centerX;
      const dz = currentZ - centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const maxDistance = Math.min(centerX, centerZ) - 10;
      if (distance > maxDistance) {
        const angle = Math.atan2(dz, dx);
        currentX = centerX + Math.cos(angle) * maxDistance;
        currentZ = centerZ + Math.sin(angle) * maxDistance;
      }

      joystick.style.background = 'radial-gradient(rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 80%)';
      joystick.style.transform = `translate3d(${currentX - centerX}px, ${currentZ - centerZ}px, 0)`;

      const angle = Math.atan2(dx, -dz);
      const moveDir = angle + Math.PI / 2;
      if (Math.sin(moveDir) < -0.1) this.keys['KeyW'] = true;
      if (Math.sin(moveDir) > 0.1) this.keys['KeyS'] = true;
      if (Math.cos(moveDir) < -0.1) this.keys['KeyA'] = true;
      if (Math.cos(moveDir) > 0.1) this.keys['KeyD'] = true;
    };

    const onTouchEnd = () => {
      isActive = false;
      joystick.style.background = 'rgba(255,255,255,0.1)';
      joystick.style.transform = 'translate3d(0px, 0px, 0)';
    };

    joystick.addEventListener('touchstart', onTouchStart, { passive: false });
    joystick.addEventListener('touchmove', onTouchMove, { passive: false });
    joystick.addEventListener('touchend', onTouchEnd);
  }

  private createFireButton() {
    const button = document.createElement('div');
    button.innerHTML = '🔫';
    button.style.cssText = `
      position: fixed;
      right: 30px;
      bottom: 200px;
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: rgba(255,0,0,0.4);
      border: 2px solid rgba(255,255,255,0.5);
      color: white;
      font-size: 24px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      touch-action: manipulation;
      z-index: 100;
    `;
    button.id = 'fire-button';
    document.body.appendChild(button);

    let isPressed = false;
    const onTouchStart = () => {
      if (isPressed) return;
      isPressed = true;
      button.style.background = 'rgba(255,0,0,0.7)';
      button.style.transform = 'scale(0.9)';
      if (this.state === 'playing' && this.playerData && !this.playerData.inVehicle) {
        this.shoot();
      }
    };

    const onTouchEnd = () => {
      if (!isPressed) return;
      isPressed = false;
      button.style.background = 'rgba(255,0,0,0.4)';
      button.style.transform = 'scale(1)';
    };

    button.addEventListener('touchstart', onTouchStart, { passive: false });
    button.addEventListener('touchend', onTouchEnd);
  }

  private createWeaponArms() {
    this.weaponArms = new THREE.Group();
    this.weaponArms.position.set(0.3, -0.28, -0.4);
    this.camera.add(this.weaponArms);
    this.scene.add(this.camera);

    const flashGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0.2, -0.01, -1.1);
    this.muzzleFlash.visible = false;
    this.weaponArms.add(this.muzzleFlash);

    this.buildWeaponModel('pistol');
  }

  private buildWeaponModel(weaponName: string) {
    if (!this.weaponArms) return;
    for (let i = this.weaponArms.children.length - 1; i >= 0; i--) {
      const c = this.weaponArms.children[i];
      if (c === this.muzzleFlash) continue;
      this.weaponArms.remove(c);
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    }

    const skinMat = new THREE.MeshLambertMaterial({ color: 0xdeb887 });
    const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.7 });
    const gunDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.3 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x334455 }));
    sleeve.position.set(0.2, -0.1, -0.35);
    sleeve.rotation.x = 0.2;
    this.weaponArms.add(sleeve);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.35, 8), skinMat);
    forearm.position.set(0.2, -0.08, -0.62);
    forearm.rotation.x = 0.05;
    this.weaponArms.add(forearm);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.065, 0.12), skinMat);
    hand.position.set(0.2, -0.06, -0.76);
    this.weaponArms.add(hand);

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
    } else if (weaponName === 'katana') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x2a1a0a }));
      handle.position.set(0.2, -0.1, -0.72);
      handle.rotation.x = 0.3;
      this.weaponArms.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), gunMetal);
      guard.position.set(0.2, -0.06, -0.82);
      this.weaponArms.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.55), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      blade.position.set(0.2, -0.01, -1.12);
      blade.rotation.x = -0.1;
      this.weaponArms.add(blade);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.065, 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      edge.position.set(0.2, -0.01, -1.12);
      edge.rotation.x = -0.1;
      this.weaponArms.add(edge);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.08, 4), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      tip.position.set(0.2, -0.01, -1.43);
      tip.rotation.x = Math.PI / 2 - 0.1;
      this.weaponArms.add(tip);
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
    if (this.muzzleFlash && this.muzzleFlash.visible) {
      this.muzzleFlashTimer -= 0.016;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.visible = false;
        (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
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

    this.socket.on('welcome', (data: { player: PlayerData; vehicles: VehicleData[]; houses: HouseData[]; weapons: Record<string, WeaponInfo>; shopItems: { id: string; name: string; price: number; category: string }[]; worldSize: number }) => {
      this.playerData = data.player;
      this.weapons = data.weapons;
      this.worldSize = data.worldSize;
      this.shopItems = data.shopItems || [];
      console.log('[GTA] Welcome received. shopItems:', this.shopItems.length, this.shopItems);
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
          this.playerAnimTime.delete(id);
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
          this.playerAnimTime.set(p.id, 0);
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
            const at = this.playerAnimTime.get(p.id) || 0;
            this.playerAnimTime.set(p.id, at + 0.016);
            this.animatePlayerModel(group, p.speed || 0, at);
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
      if (vehicle.driver !== this.socket?.id) {
        const corrected = this.checkHouseCollision(vehicle.x, vehicle.z, 1.5);
        vehicle.x = corrected.x;
        vehicle.z = corrected.z;
      }
      this.vehicleDataMap.set(vehicle.id, vehicle);
      const existing = this.vehicles3D.get(vehicle.id);
      if (existing) {
        this.vehicleTargetPos.set(vehicle.id, { x: vehicle.x, y: vehicle.y, z: vehicle.z, rot: vehicle.rotation });
      } else {
        this.createVehicle3D(vehicle);
        this.vehicleTargetPos.set(vehicle.id, { x: vehicle.x, y: vehicle.y, z: vehicle.z, rot: vehicle.rotation });
      }
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

    this.socket.on('shop_success', (data: { itemId: string; money: number }) => {
      if (this.playerData) this.playerData.money = data.money;
      this.updateHUD();
      this.showShopNotification(`Comprou ${this.shopItems.find(i => i.id === data.itemId)?.name || data.itemId}!`);
    });

    this.socket.on('shop_error', (msg: string) => {
      this.showShopNotification(msg);
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
    const pantsColor = new THREE.Color(0x333355);
    const shoeColor = new THREE.Color(0x222222);
    const hairColor = new THREE.Color(0x2a1a0a);
    const darkColor = color.clone().multiplyScalar(0.7);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), new THREE.MeshLambertMaterial({ color }));
    torso.position.y = 1.2;
    torso.castShadow = true;
    group.add(torso);

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), new THREE.MeshLambertMaterial({ color: darkColor }));
    collar.position.set(0, 1.48, -0.08);
    group.add(collar);

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.28), new THREE.MeshLambertMaterial({ color }));
    shoulders.position.y = 1.48;
    group.add(shoulders);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
    neck.position.y = 1.58;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: skinColor }));
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: hairColor }));
    hair.position.set(0, 1.97, -0.01);
    group.add(hair);

    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08), new THREE.MeshLambertMaterial({ color: hairColor }));
    hairBack.position.set(0, 1.89, 0.15);
    group.add(hairBack);

    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), eyeWhite);
      eyeW.position.set(side * 0.06, 1.83, -0.14);
      group.add(eyeW);
      const pup = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.02), pupil);
      pup.position.set(side * 0.06, 1.83, -0.155);
      group.add(pup);
    }

    const eyebrow = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), eyebrow);
      brow.position.set(side * 0.06, 1.87, -0.145);
      group.add(brow);
    }

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: skinColor.clone().multiplyScalar(0.9) }));
    nose.position.set(0, 1.79, -0.15);
    group.add(nose);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.02), new THREE.MeshBasicMaterial({ color: 0x8b4513 }));
    mouth.position.set(0, 1.73, -0.14);
    group.add(mouth);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshLambertMaterial({ color: skinColor }));
      ear.position.set(side * 0.16, 1.8, 0);
      group.add(ear);
    }

    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.3, 8), new THREE.MeshLambertMaterial({ color }));
      upperArm.position.set(side * 0.34, 1.25, 0);
      group.add(upperArm);
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
      forearm.position.set(side * 0.34, 0.78, 0);
      group.add(forearm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), new THREE.MeshLambertMaterial({ color: skinColor }));
      hand.position.set(side * 0.34, 0.6, -0.02);
      group.add(hand);
    }

    for (const side of [-1, 1]) {
      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.35, 8), new THREE.MeshLambertMaterial({ color: pantsColor }));
      upperLeg.position.set(side * 0.11, 0.58, 0);
      group.add(upperLeg);
      const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.35, 8), new THREE.MeshLambertMaterial({ color: pantsColor }));
      lowerLeg.position.set(side * 0.11, 0.25, 0);
      group.add(lowerLeg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), new THREE.MeshLambertMaterial({ color: shoeColor }));
      shoe.position.set(side * 0.11, 0.035, -0.03);
      group.add(shoe);
    }

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.32), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    belt.position.y = 0.92;
    group.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    buckle.position.set(0, 0.92, -0.17);
    group.add(buckle);

    const pocketL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), new THREE.MeshLambertMaterial({ color: darkColor }));
    pocketL.position.set(-0.14, 1.0, -0.16);
    group.add(pocketL);
    const pocketR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), new THREE.MeshLambertMaterial({ color: darkColor }));
    pocketR.position.set(0.14, 1.0, -0.16);
    group.add(pocketR);

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

  private animatePlayerModel(group: THREE.Group, speed: number, time: number) {
    const isMoving = speed > 0.5;
    const speedFactor = isMoving ? Math.min(speed / 10, 1.5) : 0.3;
    const freq = isMoving ? 8 + speedFactor * 4 : 2;
    const swing = Math.sin(time * freq) * speedFactor * 0.25;
    const armSwing = Math.sin(time * freq + Math.PI) * speedFactor * 0.15;

    const legL = group.children.find(c => c.position.x < -0.1 && c.position.y < 0.6 && c.type === 'Mesh');
    const legR = group.children.find(c => c.position.x > 0.1 && c.position.y < 0.6 && c.type === 'Mesh');
    const armL = group.children.find(c => c.position.x < -0.3 && c.position.y > 1.0 && c.type === 'Mesh');
    const armR = group.children.find(c => c.position.x > 0.3 && c.position.y > 1.0 && c.type === 'Mesh');

    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -armSwing;
    if (armR) armR.rotation.x = armSwing;

    if (isMoving) {
      group.position.y = Math.abs(Math.sin(time * freq * 2)) * 0.03;
    }
  }

  private getHeight(_x: number, _z: number): number {
    return 0;
  }

  private setupWorld(vehicles: VehicleData[], houses: HouseData[]) {
    this.houseBounds = [];
    this.buildingFloors = [];
    this.vehicleDataMap.clear();

    const geo = new THREE.PlaneGeometry(this.worldSize, this.worldSize);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0x4a8c3f })
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.terrainMesh = ground;

    this.createRoads();
    this.createPlaza();
    this.createEnvironment();

    for (const v of vehicles) {
      v.y = 0.5;
      this.createVehicle3D(v);
      this.vehicleDataMap.set(v.id, v);
    }

    this.playerData!.y = 0;

    for (const h of houses) {
      this.createHouse3D(h);
    }
  }

  private createRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bikeMat = new THREE.MeshBasicMaterial({ color: 0x44aa44 });

    const addRoad = (cx: number, cz: number, w: number, d: number) => {
      const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), roadMat);
      road.position.set(cx, 0.04, cz);
      road.receiveShadow = true;
      this.scene.add(road);
    };

    const addSidewalk = (cx: number, cz: number, w: number, d: number) => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), sidewalkMat);
      sw.position.set(cx, 0.09, cz);
      sw.receiveShadow = true;
      this.scene.add(sw);
    };

    const addDash = (cx: number, cz: number, horizontal: boolean) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? 4 : 0.15, 0.09, horizontal ? 0.15 : 4),
        dashMat
      );
      mesh.position.set(cx, 0.1, cz);
      this.scene.add(mesh);
    };

    const addEdgeLine = (cx: number, cz: number, horizontal: boolean, len: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? len : 0.08, 0.09, horizontal ? 0.08 : len),
        edgeLineMat
      );
      mesh.position.set(cx, 0.1, cz);
      this.scene.add(mesh);
    };

    addRoad(0, 0, 30, 800);
    addSidewalk(-16.5, 0, 3, 800);
    addSidewalk(16.5, 0, 3, 800);
    addEdgeLine(-14.8, 0, false, 800);
    addEdgeLine(14.8, 0, false, 800);
    for (let z = -400; z < 400; z += 10) {
      addDash(0, z, false);
    }

    const crossRoads = [-300, -150, 150, 300];
    for (const cz of crossRoads) {
      addRoad(0, cz, 800, 12);
      addSidewalk(0, cz - 7.5, 800, 3);
      addSidewalk(0, cz + 7.5, 800, 3);
      addEdgeLine(0, cz - 5.8, true, 800);
      addEdgeLine(0, cz + 5.8, true, 800);
      for (let x = -400; x < 400; x += 10) {
        addDash(x, cz, true);
      }
    }

    for (const sidewalkEdge of [-18, 18]) {
      for (let z = -400; z < 400; z += 2) {
        if (Math.abs(z) < 8) continue;
        let blocked = false;
        for (const cz of crossRoads) {
          if (Math.abs(z - cz) < 8) { blocked = true; break; }
        }
        if (blocked) continue;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 2), new THREE.MeshLambertMaterial({ color: 0xaaaaaa }));
        curb.position.set(sidewalkEdge + (sidewalkEdge < 0 ? -1.5 : 1.5), 0.18, z);
        this.scene.add(curb);
      }
    }
  }

  private createPlaza() {
    const plazaGeo = new THREE.CircleGeometry(45, 32);
    plazaGeo.rotateX(-Math.PI / 2);
    const plaza = new THREE.Mesh(plazaGeo, new THREE.MeshLambertMaterial({ color: 0x666666 }));
    plaza.position.set(0, 0.06, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    const fountainBaseMat = new THREE.MeshLambertMaterial({ color: 0x889999 });
    const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.8, 24), fountainBaseMat);
    fountainBase.position.set(0, 0.4, 0);
    fountainBase.castShadow = true;
    this.scene.add(fountainBase);

    const fountainPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.0, 12), fountainBaseMat);
    fountainPillar.position.set(0, 1.8, 0);
    fountainPillar.castShadow = true;
    this.scene.add(fountainPillar);

    const fountainTop = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.2, 0.5, 16), fountainBaseMat);
    fountainTop.position.set(0, 3.0, 0);
    fountainTop.castShadow = true;
    this.scene.add(fountainTop);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.2, 24),
      new THREE.MeshLambertMaterial({ color: 0x3388cc, transparent: true, opacity: 0.7 })
    );
    water.position.set(0, 0.85, 0);
    this.scene.add(water);

    const topWater = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.1, 16),
      new THREE.MeshLambertMaterial({ color: 0x3388cc, transparent: true, opacity: 0.7 })
    );
    topWater.position.set(0, 3.3, 0);
    this.scene.add(topWater);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bx = Math.cos(angle) * 15;
      const bz = Math.sin(angle) * 15;
      this.createBench(bx, bz, angle + Math.PI / 2);
    }

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lx = Math.cos(angle) * 25;
      const lz = Math.sin(angle) * 25;
      this.createStreetLight(lx, lz);
    }
  }

  private createBench(x: number, z: number, rotation: number) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.45), woodMat);
    seat.position.set(0, 0.45, 0);
    seat.castShadow = true;
    group.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.05), woodMat);
    back.position.set(0, 0.7, 0.2);
    back.rotation.x = -0.15;
    back.castShadow = true;
    group.add(back);

    for (const sx of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metalMat);
      leg.position.set(sx, 0.22, 0);
      group.add(leg);
    }

    for (const sx of [-0.55, 0.55]) {
      const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), metalMat);
      armrest.position.set(sx, 0.55, 0.18);
      group.add(armrest);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private createStreetLight(x: number, z: number) {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), poleMat);
    pole.position.set(0, 3, 0);
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.2), poleMat);
    arm.position.set(0, 5.8, 0.6);
    group.add(arm);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), lightMat);
    lamp.position.set(0, 5.7, 1.2);
    group.add(lamp);

    const pointLight = new THREE.PointLight(0xffffcc, 0.5, 20);
    pointLight.position.set(0, 5.5, 1.2);
    group.add(pointLight);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private createTree(x: number, z: number, scale: number = 1) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const leafMats = [
      new THREE.MeshLambertMaterial({ color: 0x228B22 }),
      new THREE.MeshLambertMaterial({ color: 0x2E8B57 }),
      new THREE.MeshLambertMaterial({ color: 0x3CB371 }),
    ];

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2.5 * scale, 8), trunkMat);
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    group.add(trunk);

    const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];

    for (let i = 0; i < 3; i++) {
      const radius = (1.8 - i * 0.4) * scale;
      const height = (1.5 - i * 0.2) * scale;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), leafMat);
      leaves.position.y = (3.0 + i * 1.0) * scale;
      leaves.castShadow = true;
      group.add(leaves);
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private createTrashCan(x: number, z: number) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x336633 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.65, 10), bodyMat);
    body.position.y = 0.32;
    body.castShadow = true;
    group.add(body);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 12), rimMat);
    rim.position.y = 0.65;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 10), rimMat);
    lid.position.y = 0.67;
    group.add(lid);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private createEnvironment() {
    const halfWorld = this.worldSize / 2;
    const treePositions: [number, number, number][] = [];
    const rng = (seed: number) => {
      let s = seed;
      return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    };
    const rand = rng(42);

    for (let i = 0; i < 80; i++) {
      const x = (rand() - 0.5) * (halfWorld * 1.6);
      const z = (rand() - 0.5) * (halfWorld * 1.6);
      const onRoad = Math.abs(x) < 18 || Math.abs(z) < 8 ||
        [-300, -150, 150, 300].some(rz => Math.abs(z - rz) < 8);
      const onPlaza = Math.hypot(x, z) < 50;
      let inHouse = false;
      for (const b of this.houseBounds) {
        if (x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3) {
          inHouse = true;
          break;
        }
      }
      if (onRoad || onPlaza || inHouse) continue;
      const scale = 0.7 + rand() * 0.8;
      treePositions.push([x, z, scale]);
    }

    for (const [tx, tz, ts] of treePositions) {
      this.createTree(tx, tz, ts);
    }

    const lightPositions: [number, number][] = [];
    for (let z = -350; z <= 350; z += 40) {
      if (Math.abs(z) < 20) continue;
      lightPositions.push([-18, z]);
      lightPositions.push([18, z]);
    }
    for (let x = -350; x <= 350; x += 40) {
      if (Math.abs(x) < 20) continue;
      lightPositions.push([x, -18]);
      lightPositions.push([x, 18]);
    }
    for (const [lx, lz] of lightPositions) {
      let blocked = false;
      for (const b of this.houseBounds) {
        if (lx > b.minX - 1 && lx < b.maxX + 1 && lz > b.minZ - 1 && lz < b.maxZ + 1) {
          blocked = true;
          break;
        }
      }
      if (!blocked) this.createStreetLight(lx, lz);
    }

    for (let i = 0; i < 20; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 50 + rand() * 100;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      if (Math.hypot(bx, bz) < 50) continue;
      this.createTrashCan(bx, bz);
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
    } else if (model === 'Pickup') {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), bodyMat);
      cabin.position.set(0, 0.55, -1.2);
      cabin.castShadow = true;
      group.add(cabin);
      const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.6), bodyMat);
      cabinRoof.position.set(0, 0.91, -1.2);
      group.add(cabinRoof);
      const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.05), glassMat);
      cabGlass.position.set(0, 0.65, -2.08);
      group.add(cabGlass);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 2.0), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      bed.position.set(0, 0.35, 0.8);
      group.add(bed);
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 2.0), blackMat);
      rail1.position.set(-0.85, 0.72, 0.8);
      group.add(rail1);
      const rail2 = rail1.clone();
      rail2.position.x = 0.85;
      group.add(rail2);
      const backGate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.05), blackMat);
      backGate.position.set(0, 0.65, 1.8);
      group.add(backGate);
      const sideStep1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 1.4), blackMat);
      sideStep1.position.set(-0.95, 0.18, -0.3);
      group.add(sideStep1);
      const sideStep2 = sideStep1.clone();
      sideStep2.position.x = 0.95;
      group.add(sideStep2);
      addWheels([[-0.9, 0.3, 1.3], [0.9, 0.3, 1.3], [-0.9, 0.3, -1.2], [0.9, 0.3, -1.2]]);
      addHeadlights(-2.1);
      addTailights(1.8);
      addBumper(-2.15);
    } else if (model === 'Van') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 4.5), bodyMat);
      body.position.y = 0.75;
      body.castShadow = true;
      group.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 4.3), bodyMat);
      roof.position.set(0, 1.34, 0);
      group.add(roof);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), glassMat);
      windshield.position.set(0, 0.85, -2.25);
      group.add(windshield);
      const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.05), glassMat);
      rearWindow.position.set(0, 0.9, 2.25);
      group.add(rearWindow);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.6), glassMat);
          sideWin.position.set(side * 1.01, 0.9, -1.0 + i * 1.2);
          group.add(sideWin);
        }
      }
      const sliding = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.4), new THREE.MeshLambertMaterial({ color: new THREE.Color(vehicle.color).multiplyScalar(0.9).getHex() }));
      sliding.position.set(1.03, 0.65, 0.5);
      group.add(sliding);
      addWheels([[-0.9, 0.3, 1.5], [0.9, 0.3, 1.5], [-0.9, 0.3, -1.5], [0.9, 0.3, -1.5]]);
      addHeadlights(-2.25);
      addTailights(2.25);
      addBumper(-2.3);
      addBumper(2.3);
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
    const { x, z, w, h, d, color, roofColor } = house;
    const wt = 0.35;
    const hh = h;
    const hw = w / 2;
    const hd = d / 2;
    const doorSide = house.doorSide ?? 0;
    const doorW = 2.2;
    const floorH = 3.5;
    const floors = Math.max(1, Math.round(hh / floorH));
    const groundY = this.getHeight(x, z);

    const wallMat = new THREE.MeshLambertMaterial({ color });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x998877 });
    const roofMat = new THREE.MeshLambertMaterial({ color: roofColor ?? 0x555555 });
    const stairMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const parapetMat = new THREE.MeshLambertMaterial({ color });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.6 });
    const windowFrameMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const doorFrameMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });
    const trimMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.85).getHex() });

    const addBox = (cx: number, cy: number, cz: number, bw: number, bh: number, bd: number, mat: THREE.Material, cast = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      mesh.position.set(x + cx, cy, z + cz);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    for (let f = 0; f <= floors; f++) {
      const fy = groundY + f * floorH;
      const isTop = f === floors;
      addBox(0, fy + 0.075, 0, w, 0.15, d, isTop ? roofMat : floorMat);
    }

    const wallSegs: { x: number; z: number; w: number; d: number }[] = [];
    const splitWall = (side: number) => {
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
    };

    splitWall(0);
    splitWall(1);
    splitWall(2);
    splitWall(3);

    for (const seg of wallSegs) {
      addBox(seg.x, groundY + hh / 2, seg.z, seg.w, hh, seg.d, wallMat);
      this.houseBounds.push({
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
      const fy = groundY + f * floorH + floorH * 0.5;
      if (fy > groundY + hh - 0.5) continue;

      const windowW = 0.6;
      const windowH = 0.8;
      const windowFrameT = 0.06;

      for (const side of [0, 1, 2, 3]) {
        if (side === doorSide && f === 0) {
          const dw = 1.0;
          const dh = 2.2;
          let doorX = 0, doorZ = 0, doorRotY = 0;
          if (side === 0) { doorX = 0; doorZ = -hd - 0.02; doorRotY = 0; }
          else if (side === 1) { doorX = hw + 0.02; doorZ = 0; doorRotY = Math.PI / 2; }
          else if (side === 2) { doorX = 0; doorZ = hd + 0.02; doorRotY = Math.PI; }
          else { doorX = -hw - 0.02; doorZ = 0; doorRotY = -Math.PI / 2; }

          addBox(doorX, groundY + dh / 2, doorZ, dw + 0.15, dh + 0.08, 0.1, doorFrameMat, false);
          addBox(doorX, groundY + dh / 2, doorZ, dw, dh, 0.08, doorMat, false);
          const knobX = doorX + (side === 1 ? 0.05 : side === 3 ? -0.05 : (side === 0 ? 0.35 : -0.35));
          const knobZ = doorZ + (side === 0 ? -0.05 : side === 2 ? 0.05 : 0);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshLambertMaterial({ color: 0xccaa44 }));
          knob.position.set(knobX, groundY + 1.1, knobZ);
          knob.castShadow = false;
          group.add(knob);
        } else {
          const winCount = (side === 0 || side === 2) ? Math.max(1, Math.floor(w / 3)) : Math.max(1, Math.floor(d / 3));
          for (let wi = 0; wi < winCount; wi++) {
            const totalSide = (side === 0 || side === 2) ? w : d;
            const spacing = totalSide / (winCount + 1);
            const offset = -totalSide / 2 + spacing * (wi + 1);
            let wx = 0, wz = 0, wrY = 0;
            if (side === 0) { wx = offset; wz = -hd - 0.02; wrY = 0; }
            else if (side === 1) { wx = hw + 0.02; wz = offset; wrY = Math.PI / 2; }
            else if (side === 2) { wx = offset; wz = hd + 0.02; wrY = Math.PI; }
            else { wx = -hw - 0.02; wz = offset; wrY = -Math.PI / 2; }

            const winFrame = new THREE.Mesh(new THREE.BoxGeometry(windowW + windowFrameT * 2, windowH + windowFrameT * 2, 0.08), windowFrameMat);
            winFrame.position.set(x + wx, fy, z + wz);
            winFrame.rotation.y = wrY;
            winFrame.castShadow = false;
            group.add(winFrame);

            const winGlass = new THREE.Mesh(new THREE.BoxGeometry(windowW, windowH, 0.05), windowMat);
            winGlass.position.set(x + wx, fy, z + wz);
            winGlass.rotation.y = wrY;
            winGlass.castShadow = false;
            group.add(winGlass);

            const crossH = new THREE.Mesh(new THREE.BoxGeometry(windowW, 0.03, 0.06), windowFrameMat);
            crossH.position.set(x + wx, fy, z + wz);
            crossH.rotation.y = wrY;
            crossH.castShadow = false;
            group.add(crossH);
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, windowH, 0.06), windowFrameMat);
            crossV.position.set(x + wx, fy, z + wz);
            crossV.rotation.y = wrY;
            crossV.castShadow = false;
            group.add(crossV);
          }
        }
      }
    }

    if (floors >= 2) {
      const stairW = 1.8;
      const stairLen = Math.min(w, d) * 0.6;
      const stepsPerFloor = 8;
      const stepH = floorH / stepsPerFloor;
      const stepD = stairLen / stepsPerFloor;

      let stairX = 0;
      let stairZ = 0;
      let stairDirX = 0;
      let stairDirZ = 1;

      switch (doorSide) {
        case 0: stairX = -hw + 2; stairZ = -hd + stairLen / 2 + 1; stairDirZ = 1; break;
        case 1: stairX = hw - stairLen / 2 - 1; stairZ = -hd + 2; stairDirX = -1; break;
        case 2: stairX = hw - 2; stairZ = hd - stairLen / 2 - 1; stairDirZ = -1; break;
        case 3: stairX = -hw + stairLen / 2 + 1; stairZ = hd - 2; stairDirX = 1; break;
      }

      this.buildingFloors.push({
        minX: x - hw, maxX: x + hw,
        minZ: z - hd, maxZ: z + hd,
        groundY, floorH, floors,
        stairX: x + stairX, stairZ: z + stairZ,
        stairDirX, stairDirZ, stairLen,
      });

      for (let f = 0; f < floors; f++) {
        const baseY = groundY + f * floorH;
        for (let s = 0; s < stepsPerFloor; s++) {
          const sy = baseY + stepH / 2 + s * stepH;
          const sx = stairX + stairDirX * (s * stepD + stepD / 2);
          const sz = stairZ + stairDirZ * (s * stepD + stepD / 2);
          addBox(sx, sy, sz, stairW, stepH + 0.05, stepD, stairMat);
        }
      }

      const pWallH = 0.9;
      const pWallT = 0.2;
      const roofY = groundY + hh;
      addBox(0, roofY + pWallH / 2, -hd, w + pWallT * 2, pWallH, pWallT, parapetMat);
      addBox(0, roofY + pWallH / 2, hd, w + pWallT * 2, pWallH, pWallT, parapetMat);
      addBox(-hw, roofY + pWallH / 2, 0, pWallT, pWallH, d, parapetMat);
      addBox(hw, roofY + pWallH / 2, 0, pWallT, pWallH, d, parapetMat);
    }

    if (floors === 1 && hh <= 4) {
      const roofY = groundY + hh;
      const roofPeak = roofY + 1.2;
      const roofOverhang = 0.5;
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const ry = roofY + t * 1.2;
        const rw = w + roofOverhang * 2 * (1 - t);
        const rd = d + roofOverhang * 2 * (1 - t);
        addBox(0, ry + 0.08, 0, rw, 0.16, rd, roofMat);
      }
    }

    group.position.set(0, 0, 0);
    this.scene.add(group);
    this.houses3D.set(house.id, group);
  }

  private updateVehicle3D(vehicle: VehicleData) {
    const existing = this.vehicles3D.get(vehicle.id);
    if (existing) {
      this.vehicleTargetPos.set(vehicle.id, { x: vehicle.x, y: vehicle.y, z: vehicle.z, rot: vehicle.rotation });
      return;
    }
    this.createVehicle3D(vehicle);
    this.vehicleTargetPos.set(vehicle.id, { x: vehicle.x, y: vehicle.y, z: vehicle.z, rot: vehicle.rotation });
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

  private updatePlayerHealthBars() {
    for (const [id, group] of this.players3D) {
      const hp = this.playerHealthMap.get(id) ?? 100;
      const hpRatio = hp / 100;
      const hpBarMesh = group.children.find(c => c.position.y > 2.1 && c.position.y < 2.3 && c.type === 'Mesh' && (c as THREE.Mesh).geometry.type === 'PlaneGeometry') as THREE.Mesh | undefined;
      if (!hpBarMesh) continue;
      const hpMat = hpBarMesh.material as THREE.MeshBasicMaterial;
      hpMat.color.setHex(hpRatio > 0.5 ? 0x4CAF50 : hpRatio > 0.25 ? 0xFF9800 : 0xf44336);
      const scaleX = 0.78 * hpRatio;
      hpBarMesh.scale.x = scaleX;
      hpBarMesh.position.x = -(0.78 * (1 - hpRatio)) / 2;
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
      const distSq = distX * distX + distZ * distZ;
      if (distSq < radius * radius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        newX += (distX / dist) * overlap;
        newZ += (distZ / dist) * overlap;
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
      else if (e.code === 'Digit5') this.switchWeapon('katana');
      else if (e.code === 'KeyR' && this.state === 'dead') {
        this.socket?.emit('respawn');
        this.state = 'playing';
        this.onStateChange?.('playing');
        this.hideWASTED();
      }
      else if (e.code === 'Tab' || e.code === 'Escape') {
        if (this.shopOpen) {
          e.preventDefault();
          this.closeShop();
        } else if (e.code === 'Tab' && this.state === 'playing') {
          e.preventDefault();
          this.openShop();
        }
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

    this.createTouchControls();
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
    if (spread > 0) {
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
    }
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
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = true;
      this.muzzleFlashTimer = 0.06;
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
    }
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
        <div>Tab - Loja</div>
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

    this.updateVehicleLerp(delta);
    this.updatePlayerHealthBars();
    this.renderer.render(this.scene, this.camera);
  };

  private updateVehicleLerp(delta: number) {
    const lerpFactor = Math.min(1, delta * 10);
    for (const [id, target] of this.vehicleTargetPos) {
      const mesh = this.vehicles3D.get(id);
      if (!mesh) continue;
      mesh.position.x += (target.x - mesh.position.x) * lerpFactor;
      mesh.position.y += (target.y - mesh.position.y) * lerpFactor;
      mesh.position.z += (target.z - mesh.position.z) * lerpFactor;
      let rotDiff = target.rot - mesh.rotation.y;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      mesh.rotation.y += rotDiff * lerpFactor;
    }
  }

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

    let baseY = this.getHeight(this.playerData.x, this.playerData.z);
    for (const bf of this.buildingFloors) {
      if (this.playerData.x >= bf.minX && this.playerData.x <= bf.maxX &&
          this.playerData.z >= bf.minZ && this.playerData.z <= bf.maxZ) {
        const dx = this.playerData.x - bf.stairX;
        const dz = this.playerData.z - bf.stairZ;
        const proj = dx * bf.stairDirX + dz * bf.stairDirZ;
        if (proj >= 0 && proj <= bf.stairLen) {
          const t = proj / bf.stairLen;
          const stairFloor = Math.floor(t * bf.floors);
          const stairT = (t * bf.floors) - stairFloor;
          baseY = bf.groundY + stairFloor * bf.floorH + stairT * bf.floorH;
        } else {
          baseY = bf.groundY;
        }
        break;
      }
    }
    this.playerData.y = baseY;
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

    const terrainH = this.getHeight(this.playerData.x, this.playerData.z);
    this.playerData.y = terrainH;
    vehicle.x = this.playerData.x;
    vehicle.y = terrainH + 0.5;
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
    const camY = this.getHeight(camX, camZ);
    this.camera.position.set(camX, camY + camHeight, camZ);

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

  private toggleShop() {
    if (this.shopOpen) {
      this.closeShop();
    } else {
      this.openShop();
    }
  }

  private openShop() {
    console.log('[GTA] openShop called. shopItems:', this.shopItems.length, 'shopOpen:', this.shopOpen);
    if (this.shopItems.length === 0) {
      console.warn('[GTA] No shop items available!');
    }
    this.shopOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();

    const existing = document.getElementById('resenha5-shop');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'resenha5-shop';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:60;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;pointer-events:auto;';
    overlay.tabIndex = 0;
    overlay.focus();

    const categories = [
      { key: 'arma', label: 'Armas', icon: '🔫' },
      { key: 'consumivel', label: 'Consumiveis', icon: '💊' },
      { key: 'skin', label: 'Skins', icon: '🎨' },
    ];

    let activeTab = 'arma';

    const render = () => {
      const money = this.playerData?.money || 0;
      const filtered = this.shopItems.filter(i => i.category === activeTab);

      overlay.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;padding:0;width:700px;max-height:80vh;overflow:hidden;border:2px solid #333;">
          <div style="background:linear-gradient(135deg,#16213e,#0f3460);padding:20px 24px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h2 style="color:#fff;margin:0;font-size:22px;">Resenha 5 Store</h2>
              <p style="color:#aaa;margin:4px 0 0;font-size:13px;">Compre itens com dinheiro dos kills</p>
            </div>
            <div style="text-align:right;">
              <div style="color:#4CAF50;font-size:24px;font-weight:bold;">$${money.toLocaleString()}</div>
              <div style="color:#888;font-size:12px;">Seu saldo</div>
            </div>
          </div>
          <div style="display:flex;border-bottom:1px solid #333;">
            ${categories.map(c => `
              <button data-tab="${c.key}" style="flex:1;padding:12px;background:${activeTab === c.key ? '#0f3460' : 'transparent'};color:${activeTab === c.key ? '#4FC3F7' : '#888'};border:none;cursor:pointer;font-size:14px;font-weight:bold;border-bottom:2px solid ${activeTab === c.key ? '#4FC3F7' : 'transparent'};">
                ${c.icon} ${c.label}
              </button>
            `).join('')}
          </div>
          <div style="padding:16px 20px;overflow-y:auto;max-height:calc(80vh - 140px);">
            ${filtered.length === 0 ? '<p style="color:#666;text-align:center;">Nenhum item</p>' :
            filtered.map(item => {
              const canBuy = money >= item.price;
              const owned = item.category === 'arma' && this.playerData?.weapon === item.id.replace('weapon_', '');
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:8px;background:${canBuy ? '#16213e' : '#111'};border-radius:10px;border:1px solid ${canBuy ? '#333' : '#222'};">
                  <div>
                    <div style="color:${canBuy ? '#fff' : '#666'};font-size:15px;font-weight:bold;">${item.name}</div>
                    <div style="color:#4CAF50;font-size:13px;margin-top:2px;">$${item.price.toLocaleString()}</div>
                  </div>
                  <button data-buy="${item.id}" ${!canBuy ? 'disabled' : ''} style="padding:8px 20px;background:${canBuy ? '#4CAF50' : '#333'};color:${canBuy ? '#fff' : '#666'};border:none;border-radius:8px;cursor:${canBuy ? 'pointer' : 'not-allowed'};font-weight:bold;font-size:13px;">
                    ${owned ? 'Equipado' : canBuy ? 'Comprar' : 'Sem grana'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
          <div style="padding:12px 20px;text-align:center;border-top:1px solid #333;">
            <span style="color:#888;font-size:13px;">Pressione <span style="color:#fff;font-weight:bold;">Tab</span> ou <span style="color:#fff;font-weight:bold;">Esc</span> para fechar</span>
          </div>
        </div>
      `;

      overlay.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeTab = (btn as HTMLElement).dataset.tab!;
          render();
        });
      });

      overlay.querySelectorAll('[data-buy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = (btn as HTMLElement).dataset.buy;
          if (itemId) this.socket?.emit('buy_item', { itemId });
        });
      });
    };

    render();
    document.body.appendChild(overlay);
  }

  private closeShop() {
    this.shopOpen = false;
    const el = document.getElementById('resenha5-shop');
    if (el) el.remove();
  }

  private showShopNotification(msg: string) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,0.85);padding:12px 28px;border-radius:10px;font-size:16px;font-family:Arial;z-index:70;border:1px solid #4CAF50;pointer-events:none;';
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
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
    const shop = document.getElementById('resenha5-shop');
    if (shop) shop.remove();
    this.vehicleTargetPos.clear();
    this.vehicles3D.clear();
    this.players3D.clear();
    this.projectiles3D.clear();
    this.houses3D.clear();
    this.vehicleDataMap.clear();
  }
}
