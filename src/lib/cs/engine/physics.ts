import * as THREE from 'three';
import { Vec3 } from '../types';

export function rayIntersectBoxes(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  boxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>,
  maxDist: number
): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
  const ray = new THREE.Ray(origin, direction);
  let closest: { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null = null;

  for (const box of boxes) {
    const halfW = box.w / 2;
    const halfH = box.h / 2;
    const halfD = box.d / 2;
    const min = new THREE.Vector3(box.x - halfW, box.y - halfH, box.z - halfD);
    const max = new THREE.Vector3(box.x + halfW, box.y + halfH, box.z + halfD);
    const box3 = new THREE.Box3(min, max);
    const intersection = new THREE.Vector3();
    const normal = new THREE.Vector3();
    if (ray.intersectBox(box3, intersection)) {
      const dist = origin.distanceTo(intersection);
      if (dist <= maxDist) {
        normal.subVectors(intersection, new THREE.Vector3(box.x, box.y, box.z)).normalize();
        if (!closest || dist < closest.distance) {
          closest = { hit: true, point: intersection.clone(), normal, distance: dist };
        }
      }
    }
  }
  return closest;
}

export function sweepCapsule(
  pos: Vec3,
  velocity: Vec3,
  dt: number,
  boxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>,
  radius = 0.4,
  height = 1.8
): Vec3 {
  const newPos = { x: pos.x, y: pos.y, z: pos.z };
  newPos.x += velocity.x * dt;
  newPos.z += velocity.z * dt;

  const playerMinY = pos.y;
  const playerMaxY = pos.y + height;

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
      playerMaxY > boxMinY && playerMinY < boxMaxY
    ) {
      const overlapX = Math.min(newPos.x - boxMinX, boxMaxX - newPos.x);
      const overlapZ = Math.min(newPos.z - boxMinZ, boxMaxZ - newPos.z);
      if (overlapX < overlapZ) {
        newPos.x = newPos.x < box.x ? boxMinX : boxMaxX;
      } else {
        newPos.z = newPos.z < box.z ? boxMinZ : boxMaxZ;
      }
    }
  }

  return newPos;
}

export function checkGround(pos: Vec3, boxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>): boolean {
  const feetY = pos.y;
  for (const box of boxes) {
    const halfW = box.w / 2 + 0.3;
    const halfD = box.d / 2 + 0.3;
    const topY = box.y + box.h / 2;
    if (
      pos.x > box.x - halfW && pos.x < box.x + halfW &&
      pos.z > box.z - halfD && pos.z < box.z + halfD &&
      Math.abs(feetY - topY) < 0.15
    ) {
      return true;
    }
  }
  return Math.abs(feetY) < 0.15;
}
