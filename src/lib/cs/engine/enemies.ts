import { CSPlayerState } from '../types';
import * as THREE from 'three';

export interface EnemyManager {
  enemies: CSPlayerState[];
  update(states: CSPlayerState[]): void;
  getEnemyAt(screenX: number, screenY: number, camera: THREE.PerspectiveCamera): CSPlayerState | null;
}

export function createEnemyManager(): EnemyManager {
  const enemies: CSPlayerState[] = [];

  function update(states: CSPlayerState[]) {
    enemies.length = 0;
    for (const s of states) {
      if (s.isAlive) enemies.push(s);
    }
  }

  function getEnemyAt(screenX: number, screenY: number, camera: THREE.PerspectiveCamera): CSPlayerState | null {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(screenX, screenY);
    raycaster.setFromCamera(mouse, camera);

    let closest: CSPlayerState | null = null;
    let closestDist = Infinity;

    for (const e of enemies) {
      const bodyPos = new THREE.Vector3(e.x, e.y + 1.2, e.z);
      const toEnemy = bodyPos.clone().sub(camera.position);
      const dot = toEnemy.dot(raycaster.ray.direction);
      if (dot < 0) continue;

      const closestPoint = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(dot));
      const dist = closestPoint.distanceTo(bodyPos);

      const headPos = new THREE.Vector3(e.x, e.y + 1.85, e.z);
      const toHead = headPos.clone().sub(camera.position);
      const headDot = toHead.dot(raycaster.ray.direction);
      if (headDot > 0) {
        const headClosest = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(headDot));
        const headDist = headClosest.distanceTo(headPos);
        if (headDist < 0.35 && dot < closestDist) {
          closest = e;
          closestDist = dot;
          continue;
        }
      }

      if (dist < 0.6 && dot < closestDist) {
        closest = e;
        closestDist = dot;
      }
    }
    return closest;
  }

  return { enemies, update, getEnemyAt };
}
