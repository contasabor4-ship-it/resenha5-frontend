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
  private players3D: Map<string, THREE.Object3D> = new Map();
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
  private hostNickname: string = '';

  constructor(container: HTMLElement, onStateChange?: (state: GameState, data?: any) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.init();
    this.setupEventListeners();
    this.animate();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8e3);
    this.scene.fog = new THREE.Fog(0x7ec8e3, 30, 80);

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x555555, 0.5);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff5e6, 0.9);
    dir.position.set(30, 50, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 150;
    dir.shadow.camera.left = -60;
    dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60;
    dir.shadow.camera.bottom = -60;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x556655 });
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);

    const wallGeo = new THREE.BoxGeometry(120, 1.5, 0.4);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
    for (const side of [-60, 60]) {
      const wallN = new THREE.Mesh(wallGeo, wallMat);
      wallN.position.set(0, 0.75, side);
      this.scene.add(wallN);
      const wallS = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 120), wallMat);
      wallS.position.set(side, 0.75, 0);
      this.scene.add(wallS);
    }
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
      this.hostNickname = data.room.hostNickname || '';
      this.players = data.room.players;
      this.map = data.room.map;
      this.state = 'lobby';
      this.onStateChange?.('lobby', { players: this.players, code: this.code, hostId: this.hostId, playerId: this.playerId, hostNickname: this.hostNickname });
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
    const nickname = localStorage.getItem('nickname') || 'Player';
    this.socket?.emit('start_game', { code: this.code, nickname });
  }

  getHostId() { return this.hostId; }
  getPlayerId() { return this.playerId; }
  isHostByName() {
    const nickname = localStorage.getItem('nickname') || 'Player';
    if (this.hostId === this.playerId) return true;
    if (this.hostNickname && this.hostNickname === nickname) return true;
    if (this.players.length > 0 && this.players[0].id === this.playerId) return true;
    return false;
  }

  leaveRoom() {
    this.socket?.emit('leave_room', { code: this.code });
    this.socket?.disconnect();
  }

  private buildMap() {
    for (const block of this.blocks3D) this.scene.remove(block.mesh);
    this.blocks3D = [];

    for (const block of this.map) {
      const group = new THREE.Group();
      const baseColor = new THREE.Color(block.color);

      const mainBlock = new THREE.Mesh(
        new THREE.BoxGeometry(block.w, block.h, block.d),
        new THREE.MeshLambertMaterial({ color: baseColor })
      );
      mainBlock.castShadow = true;
      mainBlock.receiveShadow = true;
      group.add(mainBlock);

      const edgeMat = new THREE.MeshLambertMaterial({ color: baseColor.clone().multiplyScalar(0.7) });
      const edgeT = 0.05;
      const topEdge = new THREE.Mesh(new THREE.BoxGeometry(block.w + edgeT * 2, edgeT, block.d + edgeT * 2), edgeMat);
      topEdge.position.y = block.h / 2 + edgeT / 2;
      group.add(topEdge);

      if (block.h > 1) {
        for (const side of [-1, 1]) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(block.w + 0.02, 0.06, block.d + 0.02),
            new THREE.MeshLambertMaterial({ color: baseColor.clone().multiplyScalar(1.2) })
          );
          stripe.position.y = block.h * 0.3;
          group.add(stripe);
        }
      }

      group.position.set(block.x, block.y, block.z);
      this.scene.add(group);
      this.blocks3D.push({ mesh: group as any, w: block.w, h: block.h, d: block.d });
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
        const group = new THREE.Group();
        const color = new THREE.Color(p.currentColor);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.4), new THREE.MeshLambertMaterial({ color }));
        body.position.y = 1.15;
        body.castShadow = true;
        group.add(body);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0xdeb887 }));
        head.position.y = 1.7;
        head.castShadow = true;
        group.add(head);

        const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
        for (const side of [-1, 1]) {
          const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), eyeWhite);
          eyeW.position.set(side * 0.06, 1.73, -0.18);
          group.add(eyeW);
          const pup = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), pupil);
          pup.position.set(side * 0.06, 1.73, -0.195);
          group.add(pup);
        }

        for (const side of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), new THREE.MeshLambertMaterial({ color }));
          arm.position.set(side * 0.42, 1.15, 0);
          group.add(arm);
        }

        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), new THREE.MeshLambertMaterial({ color: 0x333355 }));
          leg.position.set(side * 0.12, 0.4, 0);
          group.add(leg);
        }

        for (const side of [-1, 1]) {
          const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.22), new THREE.MeshLambertMaterial({ color: 0x222222 }));
          shoe.position.set(side * 0.12, 0.04, -0.03);
          group.add(shoe);
        }

        if (p.isSeeker) {
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
          antenna.position.set(0, 2.0, 0);
          group.add(antenna);
          const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
          light.position.set(0, 2.2, 0);
          group.add(light);
        }

        mesh = group;
        this.scene.add(mesh);
        this.players3D.set(p.id, mesh);
      }

      const matMesh = mesh as THREE.Group;
      const bodyMesh = matMesh.children[0] as THREE.Mesh;
      if (bodyMesh) {
        (bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(p.currentColor);
      }

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
      const bx = block.mesh.position.x;
      const bz = block.mesh.position.z;
      const bMin = new THREE.Vector3(
        bx - block.w / 2,
        block.mesh.position.y - block.h / 2,
        bz - block.d / 2
      );
      const bMax = new THREE.Vector3(
        bx + block.w / 2,
        block.mesh.position.y + block.h / 2,
        bz + block.d / 2
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
