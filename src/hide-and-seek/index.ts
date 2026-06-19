import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

type GameState = 'lobby' | 'prep' | 'playing' | 'results' | 'connecting';

interface PlayerData {
  id: string;
  nickname: string;
  x: number; y: number; z: number;
  rotation: number;
  color: number;
  currentColor: number;
  isSeeker: boolean;
  isAlive: boolean;
}

interface BlockData {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: number;
}

export default class HNSGame {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private socket: Socket | null = null;
  private state: GameState = 'connecting';
  private playerId: string = '';
  private players: PlayerData[] = [];
  private map: BlockData[] = [];
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mouseX = 0; mouseY = 0;
  private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private players3D: Map<string, THREE.Mesh> = new Map();
  private blocks3D: { mesh: THREE.Mesh; w: number; h: number; d: number }[] = [];
  private playerHeight = 1.7;
  private velocity = new THREE.Vector3();
  private isGrounded = true;
  private gravity = -15;
  private jumpSpeed = 7;
  private moveSpeed = 8;
  private clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private onStateChange?: (state: GameState, data?: any) => void;
  private code: string = '';
  private prepTimeLeft = 10;
  private roundTimeLeft = 120;
  private colorChangeCooldown = 0;
  private seekerIDs: string[] = [];
  private hiderIDs: string[] = [];
  private currentPhase: string = 'lobby';
  private groundPlane!: THREE.Mesh;
  private hostId: string = '';

  constructor(container: HTMLElement, onStateChange?: (state: GameState, data?: any) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.init();
    this.setupEventListeners();
    this.animate();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 30, 80);

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(30, 50, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 150;
    dir.shadow.camera.left = -60;
    dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60;
    dir.shadow.camera.bottom = -60;
    this.scene.add(dir);

    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);
  }

  connectToRoom(code: string, nickname: string) {
    this.code = code;
    const serverUrl = (window as any).__HNS_SERVER_URL || 'http://localhost:3001';
    this.socket = io(serverUrl + '/hns', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 120000,
    });

    this.socket.on('connect', () => {
      this.state = 'connecting';
      this.onStateChange?.('connecting');
      this.socket?.emit('join_room', { code, nickname });
    });

    this.socket.on('room_joined', (data: any) => {
      this.playerId = data.playerId;
      this.hostId = data.room.host;
      this.players = data.room.players;
      this.map = data.room.map;
      this.state = 'lobby';
      this.onStateChange?.('lobby', { players: this.players, code: this.code, hostId: this.hostId, playerId: this.playerId });
      this.buildMap();
      this.updatePlayers3D();
    });

    this.socket.on('players_update', (players: PlayerData[]) => {
      this.players = players;
      this.updatePlayers3D();
      if (this.state === 'lobby') this.onStateChange?.('lobby', { players: this.players, code: this.code, hostId: this.hostId, playerId: this.playerId });
    });

    this.socket.on('game_start', (data: any) => {
      this.state = 'prep';
      this.currentPhase = 'prep';
      this.prepTimeLeft = data.prepTime;
      this.roundTimeLeft = data.roundTime;
      this.seekerIDs = data.seekers;
      this.hiderIDs = data.hiders;
      this.players = data.players;
      this.map = data.map;
      this.onStateChange?.('prep', { round: data.round, maxRounds: data.maxRounds });
      this.buildMap();
      this.updatePlayers3D();
    });

    this.socket.on('timer_update', (data: any) => {
      this.prepTimeLeft = data.prep;
      this.roundTimeLeft = data.round;
      this.currentPhase = data.phase;
      this.onStateChange?.(data.phase as GameState, {
        prep: this.prepTimeLeft, round: this.roundTimeLeft,
        seekers: this.seekerIDs, hiders: this.hiderIDs,
      });
    });

    this.socket.on('phase_change', (data: any) => {
      this.currentPhase = data.phase;
      this.onStateChange?.(data.phase as GameState, { phase: data.phase });
    });

    this.socket.on('player_tagged', (data: any) => {
      const tagger = this.players.find(p => p.id === data.taggerId);
      const tagged = this.players.find(p => p.id === data.taggedId);
      if (tagger && tagged) {
        tagged.isSeeker = true;
        tagged.color = 0xff0000;
        tagged.currentColor = 0xff0000;
        this.seekerIDs.push(data.taggedId);
        this.hiderIDs = this.hiderIDs.filter(id => id !== data.taggedId);
      }
    });

    this.socket.on('player_color_change', (data: any) => {
      const player = this.players.find(p => p.id === data.id);
      if (player) player.currentColor = data.color;
    });

    this.socket.on('round_end', (data: any) => {
      this.state = 'results';
      this.onStateChange?.('results', data);
    });

    this.socket.on('game_end', (data: any) => {
      this.state = 'lobby';
      this.onStateChange?.('lobby', data);
    });

    this.socket.on('error_msg', (msg: string) => {
      console.error('HNS error:', msg);
      this.onStateChange?.('lobby', { error: msg, players: this.players, code: this.code, hostId: this.hostId, playerId: this.playerId });
    });

    this.socket.on('disconnect', () => {
      console.log('HNS disconnected');
    });
  }

  startGame() {
    this.socket?.emit('start_game', { code: this.code });
  }

  getHostId() { return this.hostId; }
  getPlayerId() { return this.playerId; }

  leaveRoom() {
    this.socket?.emit('leave_room', { code: this.code });
    this.socket?.disconnect();
  }

  private buildMap() {
    for (const block of this.blocks3D) this.scene.remove(block.mesh);
    this.blocks3D = [];

    for (const block of this.map) {
      const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
      const mat = new THREE.MeshLambertMaterial({ color: block.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(block.x, block.y, block.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.blocks3D.push({ mesh, w: block.w, h: block.h, d: block.d });
    }
  }

  private updatePlayers3D() {
    for (const [id, mesh] of this.players3D) {
      if (!this.players.find(p => p.id === id)) {
        this.scene.remove(mesh);
        this.players3D.delete(id);
      }
    }
    for (const p of this.players) {
      let mesh = this.players3D.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.8, 0.8),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(p.currentColor) })
        );
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.players3D.set(p.id, mesh);
      }
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.color.setHex(p.currentColor);
      if (p.id === this.playerId) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.rotation || 0;
      }
    }
  }

  private setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.isGrounded) {
        this.velocity.y = this.jumpSpeed;
        this.isGrounded = false;
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.pointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document as any).pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.state !== 'playing') return;
      this.mouseX = e.movementX || 0;
      this.mouseY = e.movementY || 0;
    });

    window.addEventListener('resize', () => {
      this.camera!.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera!.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.state === 'playing') {
      this.handleMovement(delta);
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera!);
  };

  private handleMovement(delta: number) {
    const player = this.players.find(p => p.id === this.playerId);
    if (!player) return;

    this.cameraEuler.setFromQuaternion(this.camera!.quaternion, 'YXZ');
    this.cameraEuler.y -= this.mouseX * 0.002;
    this.cameraEuler.x -= this.mouseY * 0.002;
    this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    this.camera!.quaternion.setFromEuler(this.cameraEuler);
    this.mouseX = 0;
    this.mouseY = 0;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera!.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.camera!.quaternion);
    right.y = 0;
    right.normalize();

    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW']) moveDir.add(forward);
    if (this.keys['KeyS']) moveDir.sub(forward);
    if (this.keys['KeyA']) moveDir.sub(right);
    if (this.keys['KeyD']) moveDir.add(right);

    if (moveDir.length() > 0) {
      moveDir.normalize();
      player.x += moveDir.x * this.moveSpeed * delta;
      player.z += moveDir.z * this.moveSpeed * delta;
      player.rotation = Math.atan2(moveDir.x, moveDir.z);
    }

    this.velocity.y += this.gravity * delta;
    player.y += this.velocity.y * delta;

    if (player.y <= 1) {
      player.y = 1;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    for (const block of this.blocks3D) {
      const bMin = new THREE.Vector3(
        block.mesh.position.x - block.w / 2,
        block.mesh.position.y - block.h / 2,
        block.mesh.position.z - block.d / 2
      );
      const bMax = new THREE.Vector3(
        block.mesh.position.x + block.w / 2,
        block.mesh.position.y + block.h / 2,
        block.mesh.position.z + block.d / 2
      );

      if (player.x > bMin.x - 0.4 && player.x < bMax.x + 0.4 &&
          player.z > bMin.z - 0.4 && player.z < bMax.z + 0.4) {
        if (player.y - 1 < bMax.y && player.y > bMax.y - 0.5 && this.velocity.y <= 0) {
          player.y = bMax.y + 1;
          this.velocity.y = 0;
          this.isGrounded = true;
        }
      }
    }

    this.socket?.emit('position', {
      x: player.x, y: player.y, z: player.z,
      rotation: player.rotation,
    });
  }

  private updateCamera() {
    const player = this.players.find(p => p.id === this.playerId);
    if (!player) return;
    this.camera!.position.set(player.x, player.y + 0.5, player.z);
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.socket?.disconnect();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
