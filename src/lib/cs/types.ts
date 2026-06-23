export type Team = 'CT' | 'T';

export type WeaponType = 'ak47' | 'm4a1' | 'deagle' | 'knife';

export type GamePhase = 'waiting' | 'playing' | 'round_end' | 'match_end';

export interface WeaponDef {
  name: string;
  damage: number;
  fireRate: number;
  ammo: number;
  reloadTime: number;
  spread: number;
  recoilY: number;
  recoilX: number;
  range: number;
  headMultiplier: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  ak47: { name: 'AK-47', damage: 36, fireRate: 100, ammo: 30, reloadTime: 2500, spread: 0.025, recoilY: 0.04, recoilX: 0.015, range: 80, headMultiplier: 4.0 },
  m4a1: { name: 'M4A1', damage: 33, fireRate: 90, ammo: 30, reloadTime: 2200, spread: 0.02, recoilY: 0.035, recoilX: 0.01, range: 80, headMultiplier: 4.0 },
  deagle: { name: 'Desert Eagle', damage: 63, fireRate: 400, ammo: 7, reloadTime: 2000, spread: 0.03, recoilY: 0.06, recoilX: 0.02, range: 60, headMultiplier: 4.0 },
  knife: { name: 'Faca', damage: 40, fireRate: 500, ammo: 999, reloadTime: 0, spread: 0, recoilY: 0, recoilX: 0, range: 3, headMultiplier: 1.0 },
};

export interface Vec3 { x: number; y: number; z: number; }

export interface PlayerInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  yaw: number;
  pitch: number;
  shooting: boolean;
  weapon: WeaponType;
}

export interface BulletHole {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  time: number;
}

export interface HitEvent {
  victimId: string;
  damage: number;
  headshot: boolean;
}

export interface KillEvent {
  killerId: string;
  victimId: string;
  killerName: string;
  victimName: string;
  weapon: WeaponType;
  headshot: boolean;
  time: number;
}

export interface CSPlayerState {
  id: string;
  nickname: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  weapon: WeaponType;
  ammo: number;
  isAlive: boolean;
  kills: number;
  deaths: number;
  ping: number;
}

export interface CSRoomState {
  code: string;
  phase: GamePhase;
  timeLeft: number;
  ctScore: number;
  tScore: number;
  players: CSPlayerState[];
  round: number;
  maxRounds: number;
}

export interface CSMapDef {
  name: string;
  spawnCT: Vec3;
  spawnT: Vec3;
  glbPath?: string;
  boxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number; color: number }>;
  floors: Array<{ x: number; z: number; w: number; d: number; color: number }>;
}

export interface BulletFireEvent {
  id: string;
  ownerId: string;
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  weapon: WeaponType;
  time: number;
}
