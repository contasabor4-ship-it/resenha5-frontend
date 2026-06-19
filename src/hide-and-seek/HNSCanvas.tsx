'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import HNSGame from '@/hide-and-seek/index';

interface HNSCanvasProps {
  code: string;
  onStateChange?: (state: string, data?: any) => void;
}

const HNSCanvas = forwardRef<any, HNSCanvasProps>(({ code, onStateChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HNSGame | null>(null);
  const callbackRef = useRef(onStateChange);
  callbackRef.current = onStateChange;

  useImperativeHandle(ref, () => ({
    startGame: () => gameRef.current?.startGame(),
    leaveRoom: () => gameRef.current?.leaveRoom(),
    getHostId: () => gameRef.current?.getHostId() || '',
    getPlayerId: () => gameRef.current?.getPlayerId() || '',
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new HNSGame(containerRef.current, (state, data) => {
      callbackRef.current?.(state, data);
    });
    gameRef.current = game;

    const nickname = localStorage.getItem('nickname') || 'Player';
    game.connectToRoom(code, nickname);

    return () => {
      game.destroy();
    };
  }, [code]);

  return <div ref={containerRef} className="w-full h-full" />;
});

HNSCanvas.displayName = 'HNSCanvas';
export default HNSCanvas;
