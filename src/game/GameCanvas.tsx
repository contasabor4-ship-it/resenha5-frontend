'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Game from '@/game/index';

interface GameCanvasProps {
  onStateChange?: (state: string) => void;
}

const GameCanvas = forwardRef<any, GameCanvasProps>(({ onStateChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useImperativeHandle(ref, () => ({}));

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Game(containerRef.current, onStateChange as any);
    gameRef.current = game;

    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

GameCanvas.displayName = 'GameCanvas';
export default GameCanvas;
