'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createCSNetworkClient } from '../../../lib/cs/network/client';
import { WeaponType, WEAPONS } from '../../../lib/cs/types';
import { DUST2 } from '../../../lib/cs/maps/dust2';

const CS_SERVER_URL = process.env.NEXT_PUBLIC_CS_SERVER_URL || process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

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

  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const netRef = useRef<any>(null);
  const lpRef = useRef<any>(null);
  const enemiesRef = useRef<any>({ enemies: [] });
  const inputRef = useRef({ forward: false, backward: false, left: false, right: false, jump: false, crouch: false, sprint: false, shooting: false, yaw: 0, pitch: 0, weapon: 'ak47' as WeaponType });
  const recoilRef = useRef(0);
  const lastSendRef = useRef(0);
  const plLockedRef = useRef(false);
  const gameRunningRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('r5_nickname');
    if (!saved) { router.push('/'); return; }
    setNickname(saved);
  }, []);

  useEffect(() => { plLockedRef.current = pointerLocked; }, [pointerLocked]);

  const startGame = useCallback(async (selectedTeam: 'CT' | 'T') => {
    setTeam(selectedTeam);
    setStatus('connecting');

    const { createCSRenderer } = await import('../../../lib/cs/engine/renderer');
    const { createLocalPlayer } = await import('../../../lib/cs/engine/player');
    const { createEnemyManager } = await import('../../../lib/cs/engine/enemies');

    const renderer = createCSRenderer();
    renderer.init(canvasRef.current!);
    renderer.buildMap(DUST2);
    renderer.switchWeapon(selectedTeam === 'CT' ? 'm4a1' : 'ak47');
    rendererRef.current = renderer;

    const defaultWeapon: WeaponType = selectedTeam === 'CT' ? 'm4a1' : 'ak47';
    const spawn = selectedTeam === 'CT' ? DUST2.spawnCT : DUST2.spawnT;
    lpRef.current = createLocalPlayer(spawn, selectedTeam);
    enemiesRef.current = createEnemyManager();

    const net = createCSNetworkClient();
    netRef.current = net;

    net.onMatchJoined((data: any) => {
      const me = data.players.find((p: any) => p.id === data.playerId);
      if (me) {
        lpRef.current.x = me.x; lpRef.current.y = me.y; lpRef.current.z = me.z;
        lpRef.current.health = me.health; lpRef.current.weapon = me.weapon; lpRef.current.ammo = me.ammo;
        setHealth(me.health); setAmmo(me.ammo); setWeapon(me.weapon);
      }
      if (data.match.phase === 'playing') {
        setStatus('playing');
        setGameStarted(true);
      } else {
        setStatus('playing');
      }
      setRound(data.match.round || 0);
      setMaxRounds(data.match.maxRounds || 15);
      setCtScore(data.match.ctScore || 0);
      setTScore(data.match.tScore || 0);
      setTimeLeft(data.match.timeLeft || 0);
    });

    net.onPlayersUpdate((players: any[]) => {
      const myId = net.socket.id;
      enemiesRef.current.update(players.filter((p: any) => p.id !== myId));
      const me = players.find((p: any) => p.id === myId);
      if (me) {
        setIsAlive(me.isAlive);
        if (me.isAlive) { setHealth(me.health); setAmmo(me.ammo); setWeapon(me.weapon); setArmor(me.armor); }
      }
    });

    net.onGameState((state: any) => {
      setRound(state.round); setMaxRounds(state.maxRounds);
      setCtScore(state.ctScore); setTScore(state.tScore);
      setTimeLeft(state.timeLeft);
    });

    net.onBullet((data: any) => rendererRef.current?.renderBullet(data));

    net.onKillfeed((data: any) => setKillfeed(prev => [data, ...prev].slice(0, 5)));

    net.onPlayerDied((data: any) => { if (data.victimId === net.socket.id) setIsAlive(false); });

    net.onCountdown((data: any) => {
      setCountdown(data.seconds);
      if (data.seconds <= 0) { setCountdown(null); setStatus('playing'); setIsAlive(true); }
    });

    net.onRoundEnd((data: any) => {
      setStatus('team_select');
      setCtScore(data.ctScore); setTScore(data.tScore); setRound(data.round);
    });

    net.onMatchEnd((data: any) => {
      setStatus('team_select');
      setCtScore(data.ctScore); setTScore(data.tScore);
    });

    net.onError((msg: string) => console.error('CS error:', msg));

    net.connect(CS_SERVER_URL, nickname);
    setTimeout(() => net.joinMatch(selectedTeam), 500);

    gameRunningRef.current = true;
    requestAnimationFrame(gameLoop);

    const onKey = (e: KeyboardEvent) => {
      const down = e.type === 'keydown';
      const i = inputRef.current;
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

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    document.addEventListener('mousemove', onMouse);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPtrLock);
    window.addEventListener('resize', onResize);

    (window as any).__csCleanup = () => {
      gameRunningRef.current = false;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPtrLock);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      net.disconnect();
      (window as any).__csRenderer = null;
    };
  }, [nickname]);

  const setGameStarted = useCallback((v: boolean) => {}, []);

  function gameLoop() {
    if (!gameRunningRef.current) return;
    const now = performance.now();

    const lp = lpRef.current;
    const r = rendererRef.current;
    if (lp && r) {
      if (lp.alive) {
        const lastWeapon = lp.weapon;
        if (inputRef.current.weapon !== lastWeapon) {
          lp.weapon = inputRef.current.weapon;
          lp.ammo = WEAPONS[inputRef.current.weapon].ammo;
          r.switchWeapon(inputRef.current.weapon);
          setWeapon(inputRef.current.weapon);
          setAmmo(WEAPONS[inputRef.current.weapon].ammo);
        }

        const { updateLocalPlayer } = require('../../../lib/cs/engine/player');
        updateLocalPlayer(lp, inputRef.current, 1 / 60, () => DUST2.boxes);

        setHealth(lp.health);
        setAmmo(lp.ammo);
        setArmor(lp.armor);

        if (inputRef.current.shooting) {
          const { WEAPONS: W } = require('../../../lib/cs/types');
          const def = W[lp.weapon];
          if (now - (lp._lastShot || 0) >= def.fireRate && lp.ammo > 0) {
            lp._lastShot = now;
            if (lp.weapon !== 'knife') lp.ammo--;

            const THREE = require('three');
            const eyeY = lp.position.y + (inputRef.current.crouch ? 1.2 : 1.6);
            const fwd = new THREE.Vector3(0, 0, -1);
            fwd.applyEuler(new THREE.Euler(lp.pitch, lp.yaw, 0, 'YXZ'));
            fwd.x += (Math.random() - 0.5) * def.spread;
            fwd.y += (Math.random() - 0.5) * def.spread;
            fwd.z += (Math.random() - 0.5) * def.spread;
            fwd.normalize();

            let hitId: string | undefined;
            for (const e of enemiesRef.current.enemies) {
              const ePos = new THREE.Vector3(e.x, e.y + 1, e.z);
              const origin = new THREE.Vector3(lp.position.x, eyeY, lp.position.z);
              const toEnemy = ePos.clone().sub(origin);
              const dot = toEnemy.dot(fwd);
              if (dot > 0 && dot < def.range) {
                const closest = origin.clone().add(fwd.clone().multiplyScalar(dot));
                if (closest.distanceTo(ePos) < 0.6) { hitId = e.id; break; }
              }
            }

            netRef.current?.shoot({
              x: lp.position.x, y: eyeY, z: lp.position.z,
              dx: fwd.x, dy: fwd.y, dz: fwd.z,
              weapon: lp.weapon, hitId,
            });

            r.renderMuzzleFlash(lp.position.x + fwd.x * 0.5, eyeY + fwd.y * 0.5, lp.position.z + fwd.z * 0.5);
            recoilRef.current = def.recoilY;
          }
        }

        recoilRef.current *= 0.88;
        r.updateCamera(lp.position, lp.yaw, lp.pitch + recoilRef.current, inputRef.current.crouch);
        r.renderEnemies(enemiesRef.current.enemies, lp.team || 'CT');
      }

      if (now - lastSendRef.current > 50 && lp) {
        netRef.current?.sendState({ x: lp.position.x, y: lp.position.y, z: lp.position.z, yaw: lp.yaw, pitch: lp.pitch, health: lp.health, armor: lp.armor, weapon: lp.weapon, ammo: lp.ammo, isAlive: lp.alive });
        lastSendRef.current = now;
      }

      r.renderMap();
    }

    requestAnimationFrame(gameLoop);
  }

  const handleClick = useCallback(() => {
    if (!pointerLocked && isAlive && status === 'playing') canvasRef.current?.requestPointerLock();
  }, [pointerLocked, isAlive, status]);

  useEffect(() => {
    return () => { (window as any).__csCleanup?.(); };
  }, []);

  if (!nickname) return null;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', position: 'relative', fontFamily: 'monospace' }}>
      {status === 'team_select' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)', zIndex: 30,
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <h1 style={{ fontSize: 42, fontWeight: 900, color: '#ff6b6b', marginBottom: 8 }}>CS RESENHA</h1>
            <p style={{ color: '#888', marginBottom: 32, fontSize: 14 }}>Escolha seu time</p>
            {ctScore > 0 || tScore > 0 ? (
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 24 }}>
                <span style={{ color: '#4488ff', fontSize: 24, fontWeight: 'bold' }}>CT {ctScore}</span>
                <span style={{ color: '#666', fontSize: 18 }}>x</span>
                <span style={{ color: '#ff6b35', fontSize: 24, fontWeight: 'bold' }}>{tScore} T</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={() => startGame('CT')} style={{
                padding: '20px 48px', borderRadius: 12, border: '2px solid #4488ff',
                background: 'rgba(68,136,255,0.15)', color: '#4488ff', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 20,
              }}>CT<div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>M4A1</div></button>
              <button onClick={() => startGame('T')} style={{
                padding: '20px 48px', borderRadius: 12, border: '2px solid #ff6b35',
                background: 'rgba(255,107,53,0.15)', color: '#ff6b35', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 20,
              }}>T<div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>AK-47</div></button>
            </div>
            <p style={{ color: '#555', marginTop: 24, fontSize: 12 }}>{nickname}</p>
            <button onClick={() => router.push('/')} style={{ marginTop: 16, padding: '8px 20px', background: '#333', color: '#aaa', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Voltar ao Hub</button>
          </div>
        </div>
      )}

      {status === 'connecting' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', zIndex: 30,
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #ff6b6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p>Conectando ao servidor...</p>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(0,0,0,0.6)',
        padding: '6px 20px', borderRadius: 8, zIndex: 10, pointerEvents: 'none',
      }}>
        <div style={{ color: '#4488ff', fontWeight: 'bold', fontSize: 20 }}>{ctScore}</div>
        <div style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>
          <div>Round {round}/{maxRounds}</div>
          <div style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{timeLeft}s</div>
        </div>
        <div style={{ color: '#ff6b35', fontWeight: 'bold', fontSize: 20 }}>{tScore}</div>
      </div>

      {/* Killfeed */}
      <div style={{ position: 'absolute', top: 60, right: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 280, zIndex: 10, pointerEvents: 'none' }}>
        {killfeed.slice(0, 5).map((k, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 4, fontSize: 11, color: '#ccc', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#ff6b6b' }}>{k.killer}</span>
            <span style={{ color: '#888' }}> [{k.weapon}{k.headshot ? ' HS' : ''}] </span>
            <span style={{ color: '#4488ff' }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* Health / Armor */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ff4444', fontSize: 24 }}>♥</span>
          <span style={{ color: health > 50 ? '#0f0' : health > 25 ? '#ff0' : '#f00', fontSize: 24, fontWeight: 'bold' }}>{health}</span>
        </div>
        {armor > 0 && <div style={{ color: '#4488ff', fontSize: 14, marginTop: 2 }}>🛡 {armor}</div>}
      </div>

      {/* Ammo */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, textAlign: 'right', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>{weapon === 'knife' ? '∞' : ammo}</div>
        <div style={{ color: '#888', fontSize: 12 }}>{WEAPONS[weapon].name}</div>
      </div>

      {/* Crosshair */}
      {status === 'playing' && isAlive && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, pointerEvents: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <line x1="12" y1="4" x2="12" y2="10" stroke="#0f0" strokeWidth="1.5" opacity="0.9"/>
            <line x1="12" y1="14" x2="12" y2="20" stroke="#0f0" strokeWidth="1.5" opacity="0.9"/>
            <line x1="4" y1="12" x2="10" y2="12" stroke="#0f0" strokeWidth="1.5" opacity="0.9"/>
            <line x1="14" y1="12" x2="20" y2="12" stroke="#0f0" strokeWidth="1.5" opacity="0.9"/>
            <circle cx="12" cy="12" r="2" fill="none" stroke="#0f0" strokeWidth="0.8" opacity="0.6"/>
          </svg>
        </div>
      )}

      {/* Click to play overlay */}
      {status === 'playing' && !pointerLocked && isAlive && (
        <div onClick={handleClick} style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', zIndex: 20, cursor: 'pointer',
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 20, fontWeight: 'bold' }}>Clique para jogar</p>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>WASD + Mouse | 1/2/3 Armas | Shift Correr | Ctrl Agachar</p>
          </div>
        </div>
      )}

      {/* Dead overlay */}
      {!isAlive && status === 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(180,0,0,0.3)', zIndex: 20, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4444' }}>ELIMINADO</p>
            <p style={{ fontSize: 14, color: '#aaa', marginTop: 8 }}>Aguardando proximo round...</p>
          </div>
        </div>
      )}

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 25, pointerEvents: 'none' }}>
          <div style={{ fontSize: 64, fontWeight: 'bold', color: '#fff' }}>{countdown}</div>
        </div>
      )}

      {/* Three.js Canvas */}
      <div ref={canvasRef} onClick={handleClick} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
