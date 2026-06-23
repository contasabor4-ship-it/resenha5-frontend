'use client';
import { useRef, useCallback, useEffect, useState } from 'react';

export interface MobileInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  shooting: boolean;
  yaw: number;
  pitch: number;
}

interface MobileControlsProps {
  onInput: (input: Partial<MobileInput>) => void;
  onShootStart: () => void;
  onShootEnd: () => void;
  onJump: () => void;
  onCrouch: (down: boolean) => void;
  onReload: () => void;
  onWeapon: (weapon: 'knife' | 'ak47' | 'm4a1' | 'deagle') => void;
  isAlive: boolean;
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024);
}

export default function MobileControls({
  onInput, onShootStart, onShootEnd, onJump, onCrouch, onReload, onWeapon, isAlive
}: MobileControlsProps) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);
  const joystickTouchRef = useRef<number | null>(null);
  const aimTouchRef = useRef<number | null>(null);
  const lastAimRef = useRef({ x: 0, y: 0 });
  const aimSensitivity = 0.006;

  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystickTouchRef.current = touch.identifier;
    setJoystickActive(true);
    setJoystickPos({ x: 0, y: 0 });
  }, []);

  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchRef.current && joystickRef.current) {
        const rect = joystickRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = touch.clientX - cx;
        let dy = touch.clientY - cy;
        const maxDist = 40;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
        setJoystickPos({ x: dx, y: dy });
        onInput({
          forward: dy < -10,
          backward: dy > 10,
          left: dx < -10,
          right: dx > 10,
        });
      }
    }
  }, [onInput]);

  const handleJoystickEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchRef.current) {
        joystickTouchRef.current = null;
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
        onInput({ forward: false, backward: false, left: false, right: false });
      }
    }
  }, [onInput]);

  const handleAimStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    aimTouchRef.current = touch.identifier;
    lastAimRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleAimMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === aimTouchRef.current) {
        const dx = touch.clientX - lastAimRef.current.x;
        const dy = touch.clientY - lastAimRef.current.y;
        lastAimRef.current = { x: touch.clientX, y: touch.clientY };
        onInput({
          yaw: -dx * aimSensitivity,
          pitch: -dy * aimSensitivity,
        });
      }
    }
  }, [onInput]);

  const handleAimEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === aimTouchRef.current) {
        aimTouchRef.current = null;
      }
    }
  }, []);

  if (!isAlive) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}>
      {/* Joystick - left side */}
      <div
        ref={joystickRef}
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        style={{
          position: 'absolute', bottom: 80, left: 30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.2)',
          pointerEvents: 'auto', touchAction: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 50, height: 50, borderRadius: '50%',
          background: joystickActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
          transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
          transition: joystickActive ? 'none' : 'transform 0.1s',
        }} />
      </div>

      {/* Aim zone - right side background */}
      <div
        ref={aimRef}
        onTouchStart={handleAimStart}
        onTouchMove={handleAimMove}
        onTouchEnd={handleAimEnd}
        style={{
          position: 'absolute', top: 60, right: 0, bottom: 60, left: '40%',
          pointerEvents: 'auto', touchAction: 'none',
        }}
      />

      {/* Action buttons - right side */}
      <div style={{ position: 'absolute', bottom: 80, right: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', pointerEvents: 'auto' }}>
        {/* Fire button */}
        <div
          onTouchStart={(e) => { e.stopPropagation(); onShootStart(); }}
          onTouchEnd={(e) => { e.stopPropagation(); onShootEnd(); }}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,50,50,0.4)', border: '3px solid rgba(255,80,80,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff', fontWeight: 'bold', touchAction: 'none',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="2" fill="#fff"/>
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Jump */}
          <div
            onTouchStart={(e) => { e.stopPropagation(); onJump(); }}
            style={{
              width: 55, height: 55, borderRadius: 12,
              background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: '#aaa', touchAction: 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </div>

          {/* Crouch */}
          <div
            onTouchStart={(e) => { e.stopPropagation(); onCrouch(true); }}
            onTouchEnd={(e) => { e.stopPropagation(); onCrouch(false); }}
            style={{
              width: 55, height: 55, borderRadius: 12,
              background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: '#aaa', touchAction: 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </div>
        </div>

        {/* Reload */}
        <div
          onTouchStart={(e) => { e.stopPropagation(); onReload(); }}
          style={{
            width: 55, height: 55, borderRadius: 12,
            background: 'rgba(255,255,0,0.15)', border: '2px solid rgba(255,255,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#ff0', fontWeight: 'bold', touchAction: 'none',
          }}
        >
          R
        </div>
      </div>

      {/* Weapon switch - top right */}
      <div style={{ position: 'absolute', top: 70, left: 12, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
        {([
          { key: 'knife', label: '1', sub: 'Faca' },
          { key: 'ak47', label: '2', sub: 'AK-47' },
          { key: 'deagle', label: '3', sub: 'Deagle' },
        ] as const).map(w => (
          <div
            key={w.key}
            onTouchStart={(e) => { e.stopPropagation(); onWeapon(w.key === 'ak47' ? 'ak47' : w.key); }}
            style={{
              width: 48, height: 48, borderRadius: 8,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none',
            }}
          >
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{w.label}</span>
            <span style={{ color: '#888', fontSize: 7 }}>{w.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
