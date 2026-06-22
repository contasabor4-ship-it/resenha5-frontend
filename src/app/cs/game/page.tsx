'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createCSNetworkClient, CSNetworkClient } from '../../../lib/cs/network/client';
import { CSRoomState, CSPlayerState, WeaponType, WEAPONS } from '../../../lib/cs/types';
import { DUST2 } from '../../../lib/cs/maps/dust2';
import { createLocalPlayer, updateLocalPlayer, LocalPlayerState } from '../../../lib/cs/engine/player';
import { createEnemyManager, EnemyManager } from '../../../lib/cs/engine/enemies';
import * as THREE from 'three';

const HUD = dynamic(() => import('../../../components/cs/HUD'), { ssr: false });

const CS_SERVER_URL = process.env.NEXT_PUBLIC_CS_SERVER_URL || process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

export default function CSGamePage() {
  const router = useRouter();
  const [room, setRoom] = useState<CSRoomState | null>(null);
  const [localHealth, setLocalHealth] = useState(100);
  const [localArmor, setLocalArmor] = useState(0);
  const [localAmmo, setLocalAmmo] = useState(30);
  const [localWeapon, setLocalWeapon] = useState<WeaponType>('ak47');
  const [killfeed, setKillfeed] = useState<Array<{ killer: string; victim: string; weapon: WeaponType; headshot: boolean }>>([]);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [alive, setAlive] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<CSNetworkClient | null>(null);
  const localPlayerRef = useRef<LocalPlayerState | null>(null);
  const enemyManagerRef = useRef<EnemyManager>(createEnemyManager());
  const pointerLockedRef = useRef(false);
  const inputRef = useRef({
    forward: false, backward: false, left: false, right: false,
    jump: false, crouch: false, sprint: false, shooting: false,
    yaw: 0, pitch: 0, weapon: 'ak47' as WeaponType,
  });
  const lastStateSendRef = useRef(0);
  const recoilRef = useRef(0);

  useEffect(() => {
    pointerLockedRef.current = pointerLocked;
  }, [pointerLocked]);

  useEffect(() => {
    const nickname = localStorage.getItem('r5_nickname');
    if (!nickname) { router.push('/cs'); return; }

    const net = createCSNetworkClient();
    networkRef.current = net;
    net.connect(CS_SERVER_URL, nickname);

    net.onRoomJoined((data) => {
      setRoom(data.room);
      const team = data.room.players.find(p => p.id === data.playerId)?.team || 'CT';
      const weapon: WeaponType = team === 'CT' ? 'm4a1' : 'ak47';
      localPlayerRef.current = createLocalPlayer(team === 'CT' ? DUST2.spawnCT : DUST2.spawnT, team);
      localPlayerRef.current.weapon = weapon;
      localPlayerRef.current.ammo = WEAPONS[weapon].ammo;
      setLocalWeapon(weapon);
      setLocalAmmo(WEAPONS[weapon].ammo);
      setAlive(true);
    });

    net.onPlayersUpdate((players) => {
      setRoom(prev => prev ? { ...prev, players } : null);
      const myId = networkRef.current?.socket.id;
      enemyManagerRef.current.update(players.filter(p => p.id !== myId));

      const me = players.find(p => p.id === myId);
      if (me && !me.isAlive) {
        setAlive(false);
      } else if (me && me.isAlive) {
        setAlive(true);
      }
    });

    net.onGameState((state) => {
      setRoom(state);
    });

    net.onBullet((data) => {
      const renderer = (window as any).__csRenderer;
      if (renderer) renderer.renderBullet(data);
    });

    net.onKillfeed((data) => {
      setKillfeed(prev => [data, ...prev].slice(0, 5));
    });

    net.onPlayerDied((data) => {
      if (data.victimId === networkRef.current?.socket.id) {
        setAlive(false);
      }
    });

    net.onCountdown((data) => {
      setCountdown(data.seconds);
      if (data.seconds <= 0) {
        setGameStarted(true);
        setCountdown(null);
        setAlive(true);
      }
    });

    net.onRoundEnd((data) => {
      setGameStarted(false);
      setRoom(prev => prev ? { ...prev, ctScore: data.ctScore, tScore: data.tScore, round: data.round } : null);
    });

    net.onMatchEnd((data) => {
      setGameStarted(false);
      setRoom(prev => prev ? { ...prev, ctScore: data.ctScore, tScore: data.tScore } : null);
    });

    net.onError((msg) => {
      console.error('CS error:', msg);
    });

    return () => { net.disconnect(); };
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !gameStarted) return;
    let running = true;
    let renderer: any = null;

    const initRenderer = async () => {
      const mod = await import('../../../lib/cs/engine/renderer');
      renderer = mod.createCSRenderer();
      renderer.init(canvasRef.current!);
      renderer.buildMap(DUST2);
      (window as any).__csRenderer = renderer;

      const onResize = () => renderer.resize();
      window.addEventListener('resize', onResize);

      const onKey = (e: KeyboardEvent) => {
        const down = e.type === 'keydown';
        switch (e.code) {
          case 'KeyW': inputRef.current.forward = down; break;
          case 'KeyS': inputRef.current.backward = down; break;
          case 'KeyA': inputRef.current.left = down; break;
          case 'KeyD': inputRef.current.right = down; break;
          case 'Space': inputRef.current.jump = down; break;
          case 'ControlLeft': inputRef.current.crouch = down; break;
          case 'ShiftLeft': inputRef.current.sprint = down; break;
          case 'Digit1': inputRef.current.weapon = 'knife'; break;
          case 'Digit2': inputRef.current.weapon = localPlayerRef.current?.team === 'CT' ? 'm4a1' : 'ak47'; break;
          case 'Digit3': inputRef.current.weapon = 'deagle'; break;
        }
      };

      const onMouse = (e: MouseEvent) => {
        if (!pointerLockedRef.current) return;
        inputRef.current.yaw -= e.movementX * 0.002;
        inputRef.current.pitch -= e.movementY * 0.002;
        inputRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, inputRef.current.pitch));
      };

      const onMouseDown = (e: MouseEvent) => {
        if (e.button === 0) inputRef.current.shooting = true;
      };

      const onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) inputRef.current.shooting = false;
      };

      const onPointerLockChange = () => {
        setPointerLocked(!!document.pointerLockElement);
      };

      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKey);
      document.addEventListener('mousemove', onMouse);
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('pointerlockchange', onPointerLockChange);

      let lastWeapon = inputRef.current.weapon;
      let lastTime = performance.now();

      const gameLoop = () => {
        if (!running) return;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const lp = localPlayerRef.current;
        if (lp && lp.alive) {
          if (inputRef.current.weapon !== lastWeapon) {
            lastWeapon = inputRef.current.weapon;
            lp.weapon = inputRef.current.weapon;
            lp.ammo = WEAPONS[inputRef.current.weapon].ammo;
            renderer.switchWeapon(inputRef.current.weapon);
            setLocalWeapon(inputRef.current.weapon);
            setLocalAmmo(WEAPONS[inputRef.current.weapon].ammo);
          }

          const { shot } = updateLocalPlayer(lp, inputRef.current, dt, () => DUST2.boxes);

          setLocalHealth(lp.health);
          setLocalArmor(lp.armor);
          setLocalAmmo(lp.ammo);

          if (shot) {
            const eyeY = lp.position.y + (inputRef.current.crouch ? 1.2 : 1.6);
            const origin = new THREE.Vector3(lp.position.x, eyeY, lp.position.z);
            const fwd = new THREE.Vector3(0, 0, -1);
            fwd.applyEuler(new THREE.Euler(lp.pitch, lp.yaw, 0, 'YXZ'));
            const spread = WEAPONS[lp.weapon].spread;
            fwd.x += (Math.random() - 0.5) * spread;
            fwd.y += (Math.random() - 0.5) * spread;
            fwd.z += (Math.random() - 0.5) * spread;
            fwd.normalize();

            let hitId: string | undefined;
            if (lp.weapon !== 'knife') {
              const hitEnemy = enemyManagerRef.current.getEnemyAt(0, 0, renderer.camera);
              hitId = hitEnemy?.id;
            } else {
              for (const e of enemyManagerRef.current.enemies) {
                const ePos = new THREE.Vector3(e.x, e.y + 1, e.z);
                const dist = origin.distanceTo(ePos);
                if (dist < 3) { hitId = e.id; break; }
              }
            }

            networkRef.current?.shoot({
              x: origin.x, y: eyeY, z: origin.z,
              dx: fwd.x, dy: fwd.y, dz: fwd.z,
              weapon: lp.weapon,
              hitId,
            });

            renderer.renderMuzzleFlash(origin.x + fwd.x * 0.5, eyeY + fwd.y * 0.5, origin.z + fwd.z * 0.5);
            recoilRef.current = WEAPONS[lp.weapon].recoilY;
          }

          recoilRef.current *= 0.88;

          renderer.updateCamera(lp.position, lp.yaw, lp.pitch + recoilRef.current, inputRef.current.crouch);
          renderer.renderEnemies(enemyManagerRef.current.enemies, lp.team || 'CT');
        }

        const timeSinceLastSend = now - lastStateSendRef.current;
        if (timeSinceLastSend > 50 && lp) {
          networkRef.current?.sendState({
            x: lp.position.x, y: lp.position.y, z: lp.position.z,
            yaw: lp.yaw, pitch: lp.pitch,
            health: lp.health, armor: lp.armor, weapon: lp.weapon,
            ammo: lp.ammo, isAlive: lp.alive,
          });
          lastStateSendRef.current = now;
        }

        renderer.renderMap();
        requestAnimationFrame(gameLoop);
      };

      requestAnimationFrame(gameLoop);

      return () => {
        running = false;
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        document.removeEventListener('mousemove', onMouse);
        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        (window as any).__csRenderer = null;
      };
    };

    const cleanup = initRenderer();
    return () => { running = false; cleanup.then(fn => fn?.()); };
  }, [gameStarted]);

  const handleCanvasClick = useCallback(() => {
    if (!pointerLocked && alive) {
      canvasRef.current?.requestPointerLock();
    }
  }, [pointerLocked, alive]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', position: 'relative' }}>
      <HUD
        room={room}
        localPlayer={{ health: localHealth, armor: localArmor, ammo: localAmmo, weapon: localWeapon }}
        killfeed={killfeed}
      />

      {!pointerLocked && alive && gameStarted && (
        <div onClick={handleCanvasClick} style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', zIndex: 20, cursor: 'pointer',
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 20, fontWeight: 'bold' }}>Clique para jogar</p>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>WASD + Mouse | 1/2/3 = Armas | Shift = Correr | Ctrl = Agachar</p>
          </div>
        </div>
      )}

      {!alive && gameStarted && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(180,0,0,0.3)', zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4444' }}>ELIMINADO</p>
            <p style={{ fontSize: 14, color: '#aaa', marginTop: 8 }}>Aguardando proximo round...</p>
          </div>
        </div>
      )}

      {countdown !== null && countdown > 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', zIndex: 25, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 64, fontWeight: 'bold', color: '#fff' }}>{countdown}</div>
        </div>
      )}

      <div ref={canvasRef} onClick={handleCanvasClick} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
