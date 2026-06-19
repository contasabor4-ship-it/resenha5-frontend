'use client';

import { useEffect, useState, useRef } from 'react';

interface TimerProps {
  phaseEndAt: string | null;
  onTimeUp: () => void;
  isActive: boolean;
}

export function Timer({ phaseEndAt, onTimeUp, isActive }: TimerProps) {
  const [remaining, setRemaining] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!phaseEndAt || !isActive) return;
    firedRef.current = false;
    const endMs = new Date(phaseEndAt).getTime();
    function tick() {
      const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeUp();
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [phaseEndAt, isActive, onTimeUp]);

  if (!isActive) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining <= 30;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold tabular-nums text-sm transition-all ${
        isUrgent
          ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse-soft'
          : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border)]'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${isUrgent ? 'bg-red-400' : 'bg-[var(--text-muted)]'}`} />
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}
