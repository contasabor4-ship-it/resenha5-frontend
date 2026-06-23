'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { createCSNetworkClient } from '../../../lib/cs/network/client';
import { WeaponType, WEAPONS } from '../../../lib/cs/types';
import { DUST2 } from '../../../lib/cs/maps/dust2';
import { createCSRenderer } from '../../../lib/cs/engine/renderer';
import { createLocalPlayer, updateLocalPlayer } from '../../../lib/cs/engine/player';
import { createEnemyManager } from '../../../lib/cs/engine/enemies';
import MobileControls, { isMobileDevice, MobileInput } from '../../../lib/cs/engine/MobileControls';

const CS_SERVER_URL = process.env.NEXT_PUBLIC_CS_SERVER_URL || process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

const WEAPON_ICONS: Record<string, string> = {
  ak47: 'AK-47',
  m4a1: 'M4A1',
  deagle: 'DEAGLE',
  knife: 'FACA',
};

export default function CSGamePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [team, setTeam] = useState<'CT' | 'T' | null>(null);
  const [status, setStatus] = useState<'team_select' | 'connecting' | 'playing'>('team_select');
  const [health, setHealth] = useState(100);
  const [armor, setArmor] = useState(0);
  const [ammo, setAmmo] = useState(30);
  const [weapon, setWeapon] = useState<WeaponType>('ak47');
  const [ctScore, setCtScore] = useState(0);
  const [tScore, setTScore] = useState(0);
  const [round, setRound] = useState(0);
  const [maxRounds, setMaxRounds] = useState(15);
  const [timeLeft, setTimeLeft] = useState(0);
  const [killfeed, setKillfeed] = useState<Array<{ killer: string; victim: string; weapon: WeaponType; headshot: boolean }>>([]);
  const [isAlive, setIsAlive] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hitMarker, setHitMarker] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const netRef = useRef<any>(null);
  const lpRef = useRef<any>(null);
  const enemiesRef = useRef<any>({ enemies: [], update: () => {}, getEnemyAt: () => null });
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false, jump: false, crouch: false, sprint: false, shooting: false, yaw: 0, pitch: 0, weapon: 'ak47' as WeaponType });
  const recoilRef = useRef(0);
  const lastSendRef = useRef(0);
  const plLockedRef = useRef(false);
  const gameRunningRef = useRef(false);
  const hitMarkerTimeoutRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    const saved = localStorage.getItem('r5_nickname');
    if (!saved) { router.push('/'); return; }
    setNickname(saved);
    setIsMobile(isMobileDevice());
  }, []);

  useEffect(() => { plLockedRef.current = pointerLocked; }, [pointerLocked]);

  useEffect(() => {
    return () => {
      gameRunningRef.current = false;
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (hitMarkerTimeoutRef.current) clearTimeout(hitMarkerTimeoutRef.current);
      netRef.current?.disconnect();
      rendererRef.current?.dispose();
    };
  }, []);

  const startGame = useCallback((selectedTeam: 'CT' | 'T') => {
    setTeam(selectedTeam);
    setStatus('connecting');

    try {
      const renderer = createCSRenderer();
      if (canvasRef.current) {
        renderer.init(canvasRef.current);
      } else {
        console.error('Canvas ref is null');
      }
      renderer.buildMap(DUST2);
      renderer.switchWeapon(selectedTeam === 'CT' ? 'm4a1' : 'ak47');
      rendererRef.current = renderer;

      const spawn = selectedTeam === 'CT' ? DUST2.spawnCT : DUST2.spawnT;
      const lp = createLocalPlayer(spawn, selectedTeam);
      lpRef.current = lp;
      enemiesRef.current = createEnemyManager();

      setWeapon(selectedTeam === 'CT' ? 'm4a1' : 'ak47');
      setAmmo(WEAPONS[selectedTeam === 'CT' ? 'm4a1' : 'ak47'].ammo);
      setHealth(100);
      setArmor(0);

      const net = createCSNetworkClient();
      netRef.current = net;

      net.onMatchJoined((data: any) => {
        console.log('CS: match_joined received', JSON.stringify({ playerId: data.playerId, players: data.players.map((p:any)=>({id:p.id,nick:p.nickname,team:p.team,isAlive:p.isAlive})) }));
        const me = data.players.find((p: any) => p.id === data.playerId);
        if (me) {
          console.log('[CS DEBUG] match_joined: pos=' + me.x + ',' + me.y + ',' + me.z + ' alive=' + me.isAlive + ' weapon=' + me.weapon);
          lp.position.x = me.x; lp.position.y = me.y; lp.position.z = me.z;
          lp.health = me.health; lp.weapon = me.weapon; lp.ammo = me.ammo;
          lp.team = me.team;
          lp.alive = me.isAlive;
          lp.velocityY = 0; lp.grounded = true;
          setHealth(me.health); setAmmo(me.ammo); setWeapon(me.weapon);
        } else {
          console.error('[CS DEBUG] match_joined: player NOT found! playerId=' + data.playerId);
        }
        (rendererRef.current?.camera as any).__ownerId = data.playerId;
        setRound(data.match.round || 0);
        setMaxRounds(data.match.maxRounds || 15);
        setCtScore(data.match.ctScore || 0);
        setTScore(data.match.tScore || 0);
        setTimeLeft(data.match.timeLeft || 0);
        setStatus('playing');
        setIsAlive(true);
      });

      net.onPlayersUpdate((players: any[]) => {
        const myId = net.socket?.id;
        enemiesRef.current.update(players.filter((p: any) => p.id !== myId));
        const me = players.find((p: any) => p.id === myId);
        if (me) {
          const wasAlive = lp.alive;
          if (wasAlive !== me.isAlive) {
            console.log('[CS DEBUG] alive changed: ' + wasAlive + ' -> ' + me.isAlive + ' (from server)');
          }
          lp.alive = me.isAlive;
          setIsAlive(me.isAlive);
          lp.team = me.team;
          setHealth(me.health);
          setArmor(me.armor);
          lp.weapon = me.weapon;
          lp.ammo = me.ammo;
          setWeapon(me.weapon);
          setAmmo(me.ammo);
          if (lp.reloading && me.ammo >= WEAPONS[me.weapon as WeaponType]?.ammo) {
            lp.reloading = false;
            setReloading(false);
            setReloadProgress(0);
          }
          if (!wasAlive && me.isAlive) {
            console.log('[CS DEBUG] respawned at', me.x, me.y, me.z);
            lp.position.x = me.x; lp.position.y = me.y; lp.position.z = me.z;
            lp.velocityY = 0; lp.grounded = true;
          }
        } else {
          console.log('[CS DEBUG] my player NOT found in players_update! myId=' + myId + ' players=' + players.map((p:any)=>p.id).join(','));
        }
      });

      net.onGameState((state: any) => {
        setRound(state.round); setMaxRounds(state.maxRounds);
        setCtScore(state.ctScore); setTScore(state.tScore);
        setTimeLeft(state.timeLeft);
      });

      net.onBullet((data: any) => rendererRef.current?.renderBullet(data));

      net.onHitEffect((data: any) => {
        rendererRef.current?.renderHitSpark(data.x, data.y, data.z);
        const myId = net.socket?.id;
        if (data.targetId === myId) {
          setHitMarker(true);
          if (hitMarkerTimeoutRef.current) clearTimeout(hitMarkerTimeoutRef.current);
          hitMarkerTimeoutRef.current = setTimeout(() => setHitMarker(false), 150);
        }
      });

      net.onKillfeed((data: any) => setKillfeed(prev => [data, ...prev].slice(0, 5)));
      net.onPlayerDied((data: any) => {
        console.log('[CS DEBUG] player_died:', data.victimId, 'my id:', net.socket?.id);
        if (data.victimId === net.socket?.id) {
          setIsAlive(false);
          lp.alive = false;
          console.log('[CS DEBUG] I died! lp.alive = false');
        }
      });

      net.onCountdown((data: any) => {
        console.log('[CS DEBUG] countdown received:', data.seconds);
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        const startSec = data.seconds;
        setCountdown(startSec);
        if (startSec <= 0) {
          setCountdown(null);
          setStatus('playing');
          setIsAlive(true);
          lp.alive = true;
          lp.velocityY = 0;
          lp.grounded = true;
          console.log('[CS DEBUG] countdown 0: lp.alive set to true');
        } else {
          countdownTimerRef.current = setInterval(() => {
            setCountdown(prev => {
              if (prev === null || prev <= 1) {
                if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
                lp.alive = true;
                lp.velocityY = 0;
                lp.grounded = true;
                console.log('[CS DEBUG] countdown finished: lp.alive set to true');
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
      });

      net.onRoundEnd((data: any) => {
        setCtScore(data.ctScore); setTScore(data.tScore); setRound(data.round);
      });

      net.onMatchEnd((data: any) => {
        setCtScore(data.ctScore); setTScore(data.tScore);
        setStatus('team_select');
        gameRunningRef.current = false;
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        net.disconnect();
        rendererRef.current?.dispose();
      });

      net.onError((msg: string) => {
        console.error('CS error:', msg);
        setStatus('team_select');
      });

      net.connect(CS_SERVER_URL, nickname);
      console.log('CS: connecting to', CS_SERVER_URL);

      setTimeout(() => {
        console.log('CS: sending join_match', selectedTeam);
        net.joinMatch(selectedTeam);
      }, 1000);

      gameRunningRef.current = true;
      requestAnimationFrame(gameLoop);

      const onKey = (e: KeyboardEvent) => {
        const down = e.type === 'keydown';
        const i = inputRef.current;
        if (down) console.log('[CS KEY] keydown:', e.code, 'lp.alive=' + lp.alive);
        switch (e.code) {
          case 'KeyW': i.forward = down; break;
          case 'KeyS': i.backward = down; break;
          case 'KeyA': i.left = down; break;
          case 'KeyD': i.right = down; break;
          case 'Space': i.jump = down; break;
          case 'ControlLeft': i.crouch = down; break;
          case 'ShiftLeft': i.sprint = down; break;
          case 'Digit1': i.weapon = 'knife'; break;
          case 'Digit2': i.weapon = selectedTeam === 'CT' ? 'm4a1' : 'ak47'; break;
          case 'Digit3': i.weapon = 'deagle'; break;
          case 'KeyR':
            if (lp.ammo < WEAPONS[lp.weapon as WeaponType].ammo && lp.weapon !== 'knife' && !lp.reloading) {
              lp.reloading = true;
              lp.reloadStartTime = performance.now();
              setReloading(true);
              setReloadProgress(0);
            }
            break;
        }
      };

      const onMouse = (e: MouseEvent) => {
        if (!plLockedRef.current) return;
        inputRef.current.yaw -= e.movementX * 0.002;
        inputRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, inputRef.current.pitch - e.movementY * 0.002));
      };

      const onMouseDown = (e: MouseEvent) => { if (e.button === 0) inputRef.current.shooting = true; };
      const onMouseUp = (e: MouseEvent) => { if (e.button === 0) inputRef.current.shooting = false; };
      const onPtrLock = () => setPointerLocked(!!document.pointerLockElement);
      const onResize = () => renderer.resize();

      const onTouchAim = (e: TouchEvent) => {
        if (!isMobileDevice()) return;
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          const x = (touch.clientX / window.innerWidth) * 2 - 1;
          const y = (touch.clientY / window.innerHeight) * 2 - 1;
          if (x > -0.2) {
            inputRef.current.yaw -= (touch as any)._dx * 0.004 || 0;
            inputRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2,
              inputRef.current.pitch - (touch as any)._dy * 0.004 || 0));
          }
        }
      };

      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKey);
      document.addEventListener('mousemove', onMouse);
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('pointerlockchange', onPtrLock);
      window.addEventListener('resize', onResize);
      if (isMobileDevice()) {
        document.addEventListener('touchmove', onTouchAim, { passive: false });
      }

    } catch (err) {
      console.error('CS: startGame error', err);
      setStatus('team_select');
    }
  }, [nickname]);

  const debugFrameCountRef = useRef(0);

  function gameLoop() {
    if (!gameRunningRef.current) return;
    const now = performance.now();
    const rawDt = (now - lastFrameTimeRef.current) / 1000;
    const dt = Math.min(rawDt, 0.05);
    lastFrameTimeRef.current = now;

    const lp = lpRef.current;
    const r = rendererRef.current;

    if (!lp || !r) {
      r?.renderMap();
      requestAnimationFrame(gameLoop);
      return;
    }

    debugFrameCountRef.current++;
    if (debugFrameCountRef.current % 120 === 0) {
      console.log('[CS DEBUG] alive=' + lp.alive + ' pos=' + JSON.stringify(lp.position) +
        ' input: F=' + inputRef.current.forward + ' B=' + inputRef.current.backward +
        ' L=' + inputRef.current.left + ' R=' + inputRef.current.right +
        ' weapon=' + lp.weapon + ' ammo=' + lp.ammo);
    }

    if (lp.alive) {
      if (inputRef.current.weapon !== lp.weapon) {
        lp.weapon = inputRef.current.weapon;
        lp.ammo = WEAPONS[inputRef.current.weapon as WeaponType].ammo;
        r.switchWeapon(inputRef.current.weapon);
        setWeapon(inputRef.current.weapon);
        setAmmo(WEAPONS[inputRef.current.weapon as WeaponType].ammo);
      }

      const inp = inputRef.current;
      const result = updateLocalPlayer(lp, inp, dt, () => DUST2.boxes);

      if (debugFrameCountRef.current % 30 === 0) {
        console.log('[CS MOVE] alive=' + lp.alive + ' inp:F=' + inp.forward + ' B=' + inp.backward + ' L=' + inp.left + ' R=' + inp.right +
          ' pos=' + lp.position.x.toFixed(1) + ',' + lp.position.y.toFixed(1) + ',' + lp.position.z.toFixed(1) +
          ' shot=' + result.shot + ' dt=' + dt.toFixed(3));
      }

      setHealth(lp.health);
      setAmmo(lp.ammo);
      setArmor(lp.armor);

      if (!lp.reloading && reloading) {
        setReloading(false);
        setReloadProgress(0);
      }

      if (lp.reloading) {
        const def = WEAPONS[lp.weapon as WeaponType];
        const elapsed = now - lp.reloadStartTime;
        const progress = Math.min(elapsed / def.reloadTime, 1);
        setReloadProgress(progress);
      }

      if (result.shot && lp.weapon !== 'knife') {
          const def = WEAPONS[lp.weapon as WeaponType];
          const eyeY = lp.position.y + (inputRef.current.crouch ? 1.2 : 1.6);
          const fwd = new THREE.Vector3(0, 0, -1);
          fwd.applyEuler(new THREE.Euler(lp.pitch, lp.yaw, 0, 'YXZ'));
          fwd.x += (Math.random() - 0.5) * def.spread;
          fwd.y += (Math.random() - 0.5) * def.spread;
          fwd.z += (Math.random() - 0.5) * def.spread;
          fwd.normalize();

          let hitId: string | undefined;
          let hitY = 0;
          const origin = new THREE.Vector3(lp.position.x, eyeY, lp.position.z);
          for (const e of enemiesRef.current.enemies) {
            const bodyPos = new THREE.Vector3(e.x, e.y + 1.2, e.z);
            const headPos = new THREE.Vector3(e.x, e.y + 1.85, e.z);
            const toBody = bodyPos.clone().sub(origin);
            const dotBody = toBody.dot(fwd);
            if (dotBody > 0 && dotBody < def.range) {
              const closest = origin.clone().add(fwd.clone().multiplyScalar(dotBody));
              if (closest.distanceTo(bodyPos) < 0.6) { hitId = e.id; hitY = bodyPos.y; break; }
            }
            const toHead = headPos.clone().sub(origin);
            const dotHead = toHead.dot(fwd);
            if (dotHead > 0 && dotHead < def.range) {
              const closestH = origin.clone().add(fwd.clone().multiplyScalar(dotHead));
              if (closestH.distanceTo(headPos) < 0.35) { hitId = e.id; hitY = headPos.y; break; }
            }
          }

          netRef.current?.shoot({ x: origin.x, y: eyeY, z: origin.z, dx: fwd.x, dy: fwd.y, dz: fwd.z, weapon: lp.weapon, hitId, hitY });
          r.renderMuzzleFlash(origin.x + fwd.x * 0.5, eyeY + fwd.y * 0.5, origin.z + fwd.z * 0.5);
          recoilRef.current = def.recoilY;
      } else if (result.shot && lp.weapon === 'knife') {
          const eyeY = lp.position.y + 1;
          const origin = new THREE.Vector3(lp.position.x, eyeY, lp.position.z);
          for (const e of enemiesRef.current.enemies) {
            const ePos = new THREE.Vector3(e.x, e.y + 1, e.z);
            if (origin.distanceTo(ePos) < 3) {
              netRef.current?.shoot({ x: origin.x, y: eyeY, z: origin.z, dx: 0, dy: 0, dz: -1, weapon: 'knife', hitId: e.id, hitY: eyeY });
              break;
            }
          }
      }

      recoilRef.current *= 0.88;
    }

    r.updateCamera(lp.position, lp.yaw, lp.pitch + recoilRef.current, inputRef.current.crouch);
    r.renderEnemies(enemiesRef.current.enemies, lp.team || 'CT');
    r.updateParticles(dt);

    if (now - lastSendRef.current > 50) {
      netRef.current?.sendState({ x: lp.position.x, y: lp.position.y, z: lp.position.z, yaw: lp.yaw, pitch: lp.pitch, weapon: lp.weapon });
      lastSendRef.current = now;
    }

    r.renderMap();
    requestAnimationFrame(gameLoop);
  }

  const handleClick = useCallback(() => {
    if (!isMobile && !pointerLocked && isAlive && status === 'playing') canvasRef.current?.requestPointerLock();
  }, [pointerLocked, isAlive, status, isMobile]);

  const mobileInputRef = useRef({ lastX: 0, lastY: 0 });

  const handleMobileInput = useCallback((input: Partial<MobileInput>) => {
    if (input.forward !== undefined) inputRef.current.forward = input.forward;
    if (input.backward !== undefined) inputRef.current.backward = input.backward;
    if (input.left !== undefined) inputRef.current.left = input.left;
    if (input.right !== undefined) inputRef.current.right = input.right;
    if (input.yaw !== undefined) inputRef.current.yaw += input.yaw;
    if (input.pitch !== undefined) {
      inputRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, inputRef.current.pitch + input.pitch));
    }
  }, []);

  if (!nickname) return null;

  const weaponDef = WEAPONS[weapon];
  const maxAmmo = weaponDef.ammo;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', position: 'relative', fontFamily: 'monospace' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes hitFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes reloadPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>

      {status === 'team_select' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)', zIndex: 30,
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <h1 style={{ fontSize: 42, fontWeight: 900, color: '#ff6b6b', marginBottom: 8, textShadow: '0 0 20px rgba(255,107,107,0.5)' }}>CS RESENHA</h1>
            <p style={{ color: '#888', marginBottom: 32, fontSize: 14 }}>Escolha seu time</p>
            {ctScore > 0 || tScore > 0 ? (
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 24 }}>
                <span style={{ color: '#4488ff', fontSize: 24, fontWeight: 'bold' }}>CT {ctScore}</span>
                <span style={{ color: '#666', fontSize: 18 }}>x</span>
                <span style={{ color: '#ff6b35', fontSize: 24, fontWeight: 'bold' }}>{tScore} T</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={() => startGame('CT')} style={{ padding: '20px 48px', borderRadius: 12, border: '2px solid #4488ff', background: 'rgba(68,136,255,0.15)', color: '#4488ff', cursor: 'pointer', fontWeight: 'bold', fontSize: 20, transition: 'all 0.2s' }}>CT<div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>M4A1</div></button>
              <button onClick={() => startGame('T')} style={{ padding: '20px 48px', borderRadius: 12, border: '2px solid #ff6b35', background: 'rgba(255,107,53,0.15)', color: '#ff6b35', cursor: 'pointer', fontWeight: 'bold', fontSize: 20, transition: 'all 0.2s' }}>T<div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>AK-47</div></button>
            </div>
            <p style={{ color: '#555', marginTop: 24, fontSize: 12 }}>{nickname}</p>
            <button onClick={() => router.push('/')} style={{ marginTop: 16, padding: '8px 20px', background: '#333', color: '#aaa', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Voltar ao Hub</button>
          </div>
        </div>
      )}

      {status === 'connecting' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', zIndex: 30 }}>
          <div style={{ width: 40, height: 40, border: '3px solid #ff6b6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#fff', marginBottom: 16 }}>Conectando ao servidor...</p>
          <button onClick={() => { setStatus('team_select'); netRef.current?.disconnect(); }} style={{ padding: '8px 20px', background: '#333', color: '#aaa', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
        </div>
      )}

      {/* === TOP SCOREBOARD === */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.75)', borderRadius: '0 0 12px 12px', overflow: 'hidden', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ padding: '8px 24px', background: 'rgba(68,136,255,0.3)', textAlign: 'center', minWidth: 70 }}>
          <div style={{ color: '#4488ff', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{ctScore}</div>
          <div style={{ color: '#4488ff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 }}>CT</div>
        </div>
        <div style={{ padding: '8px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 100 }}>
          <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 1 }}>ROUND {round}/{maxRounds}</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', lineHeight: 1.2 }}>{timeLeft}s</div>
        </div>
        <div style={{ padding: '8px 24px', background: 'rgba(255,107,53,0.3)', textAlign: 'center', minWidth: 70 }}>
          <div style={{ color: '#ff6b35', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{tScore}</div>
          <div style={{ color: '#ff6b35', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 }}>T</div>
        </div>
      </div>

      {/* === KILL FEED === */}
      <div style={{ position: 'absolute', top: 70, right: 12, display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 300, zIndex: 10, pointerEvents: 'none' }}>
        {killfeed.slice(0, 5).map((k, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.6)', padding: '3px 10px', borderRadius: 4, fontSize: 11, color: '#ccc', whiteSpace: 'nowrap', animation: 'hitFlash 0.3s ease-out' }}>
            <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>{k.killer}</span>
            <span style={{ color: '#888', margin: '0 4px' }}>[{WEAPON_ICONS[k.weapon] || k.weapon}{k.headshot ? ' HS' : ''}]</span>
            <span style={{ color: '#4488ff', fontWeight: 'bold' }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* === CROSSHIT HIT MARKER === */}
      {hitMarker && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 15, pointerEvents: 'none' }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <line x1="10" y1="10" x2="14" y2="14" stroke="#ff4444" strokeWidth="2.5" />
            <line x1="22" y1="10" x2="18" y2="14" stroke="#ff4444" strokeWidth="2.5" />
            <line x1="10" y1="22" x2="14" y2="18" stroke="#ff4444" strokeWidth="2.5" />
            <line x1="22" y1="22" x2="18" y2="18" stroke="#ff4444" strokeWidth="2.5" />
          </svg>
        </div>
      )}

      {/* === CROSSHAIR === */}
      {status === 'playing' && isAlive && !hitMarker && countdown === null && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, pointerEvents: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <line x1="12" y1="4" x2="12" y2="10" stroke="#0f0" strokeWidth="1.5" opacity="0.8"/>
            <line x1="12" y1="14" x2="12" y2="20" stroke="#0f0" strokeWidth="1.5" opacity="0.8"/>
            <line x1="4" y1="12" x2="10" y2="12" stroke="#0f0" strokeWidth="1.5" opacity="0.8"/>
            <line x1="14" y1="12" x2="20" y2="12" stroke="#0f0" strokeWidth="1.5" opacity="0.8"/>
            <circle cx="12" cy="12" r="2" fill="none" stroke="#0f0" strokeWidth="0.8" opacity="0.5"/>
          </svg>
        </div>
      )}

      {/* === BOTTOM HUD === */}
      {status === 'playing' && isAlive && (
        <>
          {/* Health + Armor - Bottom Left */}
          <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#ff4444', fontSize: 20 }}>+</span>
              <div style={{ width: 120, height: 14, background: 'rgba(0,0,0,0.6)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ width: `${health}%`, height: '100%', background: health > 50 ? 'linear-gradient(90deg, #0a0, #0f0)' : health > 25 ? 'linear-gradient(90deg, #aa0, #ff0)' : 'linear-gradient(90deg, #a00, #f00)', transition: 'width 0.1s' }} />
              </div>
              <span style={{ color: health > 50 ? '#0f0' : health > 25 ? '#ff0' : '#f00', fontSize: 16, fontWeight: 'bold', minWidth: 28, textAlign: 'right' }}>{health}</span>
            </div>
            {armor > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#4488ff', fontSize: 16 }}>&#9650;</span>
                <div style={{ width: 120, height: 10, background: 'rgba(0,0,0,0.6)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ width: `${armor}%`, height: '100%', background: 'linear-gradient(90deg, #226, #48f)', transition: 'width 0.1s' }} />
                </div>
                <span style={{ color: '#4488ff', fontSize: 13, fontWeight: 'bold', minWidth: 28, textAlign: 'right' }}>{armor}</span>
              </div>
            )}
          </div>

          {/* Weapon + Ammo - Bottom Right */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, textAlign: 'right', zIndex: 10, pointerEvents: 'none' }}>
            {reloading && (
              <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <span style={{ color: '#ff0', fontSize: 11, animation: 'reloadPulse 1s infinite' }}>RECARREGANDO</span>
                <div style={{ width: 80, height: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ width: `${reloadProgress * 100}%`, height: '100%', background: '#ff0', transition: 'width 0.05s' }} />
                </div>
              </div>
            )}
            <div style={{ color: '#fff', fontSize: 36, fontWeight: 900, lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              {weapon === 'knife' ? (
                <span style={{ color: '#aaa' }}>&infin;</span>
              ) : (
                <>
                  <span style={{ color: ammo <= 5 ? '#f00' : '#fff' }}>{ammo}</span>
                  <span style={{ color: '#666', fontSize: 20, margin: '0 2px' }}>/</span>
                  <span style={{ color: '#888', fontSize: 20 }}>{maxAmmo}</span>
                </>
              )}
            </div>
            <div style={{ color: '#aaa', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginTop: 2 }}>{WEAPON_ICONS[weapon] || weapon}</div>
            {ammo === 0 && weapon !== 'knife' && !reloading && (
              <div style={{ color: '#ff0', fontSize: 11, marginTop: 4, animation: 'reloadPulse 1s infinite' }}>Pressione R para recarregar</div>
            )}
          </div>

          {/* Controls hint */}
          <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none', textAlign: 'center' }}>
            {!isMobile ? (
              <span style={{ color: '#555', fontSize: 10, letterSpacing: 0.5 }}>WASD Mover | Shift Correr | Ctrl Agachar | 1/2/3 Armas | R Recarregar</span>
            ) : (
              <span style={{ color: '#555', fontSize: 10, letterSpacing: 0.5 }}>Joystick Mover | Toque Direito Mirar | Botao Atirar</span>
            )}
          </div>
        </>
      )}

      {/* === CLICK TO PLAY OVERLAY === */}
      {status === 'playing' && !pointerLocked && isAlive && !isMobile && (
        <div onClick={handleClick} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 20, cursor: 'pointer' }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 24, fontWeight: 'bold' }}>Clique para jogar</p>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>WASD + Mouse | 1/2/3 Armas | R Recarregar</p>
          </div>
        </div>
      )}

      {/* === DEATH SCREEN === */}
      {!isAlive && status === 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(180,0,0,0.3)', zIndex: 20, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 32, fontWeight: 'bold', color: '#ff4444', textShadow: '0 0 20px rgba(255,0,0,0.5)' }}>ELIMINADO</p>
            <p style={{ fontSize: 14, color: '#aaa', marginTop: 8 }}>Aguardando proximo round...</p>
          </div>
        </div>
      )}

      {/* === COUNTDOWN === */}
      {countdown !== null && countdown > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 25, pointerEvents: 'none' }}>
          <div style={{ fontSize: 72, fontWeight: 'bold', color: '#fff', textShadow: '0 0 30px rgba(255,255,255,0.5)' }}>{countdown}</div>
        </div>
      )}

      {/* === MOBILE CONTROLS === */}
      {isMobile && status === 'playing' && (
        <MobileControls
          onInput={handleMobileInput}
          onShootStart={() => { inputRef.current.shooting = true; }}
          onShootEnd={() => { inputRef.current.shooting = false; }}
          onJump={() => { inputRef.current.jump = true; setTimeout(() => { inputRef.current.jump = false; }, 100); }}
          onCrouch={(down) => { inputRef.current.crouch = down; }}
          onReload={() => {
            const lp = lpRef.current;
            if (lp && lp.ammo < WEAPONS[lp.weapon as WeaponType].ammo && lp.weapon !== 'knife' && !lp.reloading) {
              lp.reloading = true;
              lp.reloadStartTime = performance.now();
              setReloading(true);
              setReloadProgress(0);
            }
          }}
          onWeapon={(w) => {
            inputRef.current.weapon = w;
            const lp = lpRef.current;
            if (lp) {
              lp.weapon = w;
              lp.ammo = WEAPONS[w].ammo;
              rendererRef.current?.switchWeapon(w);
              setWeapon(w);
              setAmmo(WEAPONS[w].ammo);
            }
          }}
          isAlive={isAlive}
        />
      )}

      <div ref={canvasRef} onClick={handleClick} style={{ width: '100%', height: '100%', touchAction: isMobile ? 'none' : 'auto' }} />
    </div>
  );
}
