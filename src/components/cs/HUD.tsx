'use client';
import { CSPlayerState, CSRoomState, WeaponType, WEAPONS } from '../../lib/cs/types';

interface HUDProps {
  room: CSRoomState | null;
  localPlayer: { health: number; armor: number; ammo: number; weapon: WeaponType } | null;
  killfeed: Array<{ killer: string; victim: string; weapon: WeaponType; headshot: boolean }>;
}

export default function HUD({ room, localPlayer, killfeed }: HUDProps) {
  if (!room || !localPlayer) return null;

  const weaponDef = WEAPONS[localPlayer.weapon];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'monospace', zIndex: 10 }}>
      {/* Scoreboard top */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(0,0,0,0.6)',
        padding: '6px 20px', borderRadius: 8,
      }}>
        <div style={{ color: '#4488ff', fontWeight: 'bold', fontSize: 20 }}>{room.ctScore}</div>
        <div style={{ color: '#666', fontSize: 12 }}>
          <div>Round {room.round}/{room.maxRounds}</div>
          <div style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{room.timeLeft}s</div>
        </div>
        <div style={{ color: '#ff6b35', fontWeight: 'bold', fontSize: 20 }}>{room.tScore}</div>
      </div>

      {/* Killfeed top-right */}
      <div style={{ position: 'absolute', top: 60, right: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 280 }}>
        {killfeed.slice(0, 5).map((k, i) => (
          <div key={i} style={{
            background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 4,
            fontSize: 11, color: '#ccc', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#ff6b6b' }}>{k.killer}</span>
            <span style={{ color: '#888' }}> [{k.weapon}{k.headshot ? ' HS' : ''}] </span>
            <span style={{ color: '#4488ff' }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* Health & armor bottom-left */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ff4444', fontSize: 24, fontWeight: 'bold' }}>♥</span>
          <span style={{ color: localPlayer.health > 50 ? '#0f0' : localPlayer.health > 25 ? '#ff0' : '#f00', fontSize: 24, fontWeight: 'bold' }}>
            {localPlayer.health}
          </span>
        </div>
        {localPlayer.armor > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#4488ff', fontSize: 16 }}>🛡</span>
            <span style={{ color: '#4488ff', fontSize: 16 }}>{localPlayer.armor}</span>
          </div>
        )}
      </div>

      {/* Ammo bottom-right */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        textAlign: 'right',
      }}>
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>
          {localPlayer.weapon === 'knife' ? '∞' : localPlayer.ammo}
        </div>
        <div style={{ color: '#888', fontSize: 12 }}>{weaponDef.name}</div>
      </div>

      {/* Player list bottom-center */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 12, fontSize: 11, color: '#888',
      }}>
        <div>CT: {room.players.filter(p => p.team === 'CT' && p.isAlive).length}</div>
        <div>T: {room.players.filter(p => p.team === 'T' && p.isAlive).length}</div>
      </div>
    </div>
  );
}
