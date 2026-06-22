import { PlayerInput, WeaponType, WEAPONS, Vec3 } from '../types';

export interface LocalPlayerState {
  position: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  weapon: WeaponType;
  ammo: number;
  velocityY: number;
  grounded: boolean;
  lastShotTime: number;
  reloading: boolean;
  reloadStartTime: number;
  alive: boolean;
  team: 'CT' | 'T';
}

const GRAVITY = 18;
const JUMP_FORCE = 7;
const MOVE_SPEED = 8;
const SPRINT_MULT = 1.3;
const CROUCH_MULT = 0.5;
const MOUSE_SENSITIVITY = 0.002;

export function createLocalPlayer(spawn: Vec3, team: 'CT' | 'T' = 'CT'): LocalPlayerState {
  return {
    position: { ...spawn },
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    weapon: team === 'CT' ? 'm4a1' : 'ak47',
    ammo: WEAPONS[team === 'CT' ? 'm4a1' : 'ak47'].ammo,
    velocityY: 0,
    grounded: true,
    lastShotTime: 0,
    reloading: false,
    reloadStartTime: 0,
    alive: true,
    team,
  };
}

export function updateLocalPlayer(
  state: LocalPlayerState,
  input: PlayerInput,
  dt: number,
  getBoxes: () => Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>
): { shot: boolean; newPos: Vec3 } {
  if (!state.alive) return { shot: false, newPos: state.position };

  state.yaw = input.yaw;
  state.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, input.pitch));

  let speed = MOVE_SPEED;
  if (input.sprint) speed *= SPRINT_MULT;
  if (input.crouch) speed *= CROUCH_MULT;

  const forward = { x: -Math.sin(state.yaw), z: -Math.cos(state.yaw) };
  const right = { x: Math.cos(state.yaw), z: -Math.sin(state.yaw) };

  const moveDir = { x: 0, z: 0 };
  if (input.forward) { moveDir.x += forward.x; moveDir.z += forward.z; }
  if (input.backward) { moveDir.x -= forward.x; moveDir.z -= forward.z; }
  if (input.left) { moveDir.x -= right.x; moveDir.z -= right.z; }
  if (input.right) { moveDir.x += right.x; moveDir.z += right.z; }

  const len = Math.hypot(moveDir.x, moveDir.z);
  if (len > 0) {
    moveDir.x /= len;
    moveDir.z /= len;
  }

  const velocity: Vec3 = {
    x: moveDir.x * speed,
    y: state.velocityY,
    z: moveDir.z * speed,
  };

  if (input.jump && state.grounded) {
    velocity.y = JUMP_FORCE;
    state.grounded = false;
  }

  velocity.y -= GRAVITY * dt;
  state.velocityY = velocity.y;

  const boxes = getBoxes();

  const newPos: Vec3 = { x: state.position.x, y: state.position.y, z: state.position.z };
  newPos.x += velocity.x * dt;
  newPos.z += velocity.z * dt;
  newPos.y += velocity.y * dt;

  const playerH = input.crouch ? 1.2 : 1.8;
  const radius = 0.4;

  for (const box of boxes) {
    const halfW = box.w / 2 + radius;
    const halfD = box.d / 2 + radius;
    const boxMinX = box.x - halfW;
    const boxMaxX = box.x + halfW;
    const boxMinZ = box.z - halfD;
    const boxMaxZ = box.z + halfD;
    const boxMinY = box.y - box.h / 2;
    const boxMaxY = box.y + box.h / 2;

    if (
      newPos.x > boxMinX && newPos.x < boxMaxX &&
      newPos.z > boxMinZ && newPos.z < boxMaxZ &&
      newPos.y + playerH > boxMinY && newPos.y < boxMaxY
    ) {
      const overlapXMin = newPos.x - boxMinX;
      const overlapXMax = boxMaxX - newPos.x;
      const overlapZMin = newPos.z - boxMinZ;
      const overlapZMax = boxMaxZ - newPos.z;
      const minOverlap = Math.min(overlapXMin, overlapXMax, overlapZMin, overlapZMax);

      if (minOverlap === overlapXMin) newPos.x = boxMinX;
      else if (minOverlap === overlapXMax) newPos.x = boxMaxX;
      else if (minOverlap === overlapZMin) newPos.z = boxMinZ;
      else newPos.z = boxMaxZ;
    }
  }

  if (newPos.y < 0) { newPos.y = 0; state.velocityY = 0; state.grounded = true; }

  for (const box of boxes) {
    const halfW = box.w / 2 + 0.3;
    const halfD = box.d / 2 + 0.3;
    const topY = box.y + box.h / 2;
    if (
      newPos.x > box.x - halfW && newPos.x < box.x + halfW &&
      newPos.z > box.z - halfD && newPos.z < box.z + halfD &&
      Math.abs(newPos.y - topY) < 0.15
    ) {
      newPos.y = topY;
      state.velocityY = 0;
      state.grounded = true;
      break;
    }
  }

  if (Math.abs(newPos.y) < 0.15) {
    newPos.y = 0;
    state.grounded = true;
  }

  if (state.grounded && velocity.y < -1) {
    state.grounded = false;
  }

  state.position = newPos;

  let shot = false;
  const now = performance.now();
  if (state.reloading) {
    const def = WEAPONS[state.weapon];
    if (now - state.reloadStartTime >= def.reloadTime) {
      state.reloading = false;
      state.ammo = def.ammo;
    }
  }

  if (input.shooting && !state.reloading && state.ammo > 0 && state.weapon !== 'knife') {
    const def = WEAPONS[state.weapon];
    if (now - state.lastShotTime >= def.fireRate) {
      state.lastShotTime = now;
      state.ammo--;
      shot = true;
    }
  } else if (input.shooting && state.weapon === 'knife') {
    const def = WEAPONS[state.weapon];
    if (now - state.lastShotTime >= def.fireRate) {
      state.lastShotTime = now;
      shot = true;
    }
  }

  return { shot, newPos: state.position };
}
