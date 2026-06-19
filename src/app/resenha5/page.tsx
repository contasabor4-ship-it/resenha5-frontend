'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const GameCanvas = dynamic(() => import('@/game/GameCanvas'), { ssr: false });

export default function Resenha5Page() {
  const [gameState, setGameState] = useState<'loading' | 'connecting' | 'playing' | 'dead' | 'menu'>('menu');
  const [showControls, setShowControls] = useState(true);
  const [nickname, setNickname] = useState('');
  const gameRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('nickname');
    if (saved) setNickname(saved);
  }, []);

  const startGame = () => {
    if (!nickname.trim()) return;
    setShowControls(false);
    setGameState('connecting');
    (window as any).__GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'http://localhost:3001';
  };

  const stateLabels: Record<string, string> = {
    loading: 'Carregando...',
    connecting: 'Conectando ao servidor...',
    playing: 'Jogando',
    dead: '',
    menu: 'Menu',
  };

  const stateColors: Record<string, string> = {
    loading: 'text-yellow-400',
    connecting: 'text-blue-400',
    playing: 'text-green-400',
    dead: 'text-red-500',
    menu: 'text-white',
  };

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center relative">
      {showControls ? (
        <div className="text-center text-white max-w-lg mx-auto p-6">
          <h1 className="text-4xl font-bold mb-2 text-red-500">Resenha 5</h1>
          <p className="text-gray-400 mb-6">GTA Style - Primeira Pessoa</p>

          {nickname ? (
            <div className="mb-6 bg-gray-900 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Conectando como</p>
              <p className="text-xl font-bold text-white">{nickname}</p>
            </div>
          ) : (
            <div className="mb-6 bg-gray-900 rounded-lg p-4">
              <p className="text-red-400 text-sm">Faca login para jogar</p>
              <a href="/auth/login" className="text-blue-400 hover:underline text-sm mt-2 inline-block">Ir para login</a>
            </div>
          )}

          <div className="bg-gray-900 rounded-lg p-4 mb-6 text-left text-sm space-y-2">
            <p><span className="text-green-400 font-bold">WASD</span> — Mover</p>
            <p><span className="text-green-400 font-bold">Mouse</span> — Olhar (clique para ativar)</p>
            <p><span className="text-green-400 font-bold">Click</span> — Atirar</p>
            <p><span className="text-green-400 font-bold">E</span> — Entrar no veiculo</p>
            <p><span className="text-green-400 font-bold">F</span> — Sair do veiculo</p>
            <p><span className="text-green-400 font-bold">1-4</span> — Trocar arma</p>
            <p><span className="text-green-400 font-bold">R</span> — Renascer (ao morrer)</p>
            <hr className="border-gray-700 my-2" />
            <p className="text-gray-400">Mate jogadores para ganhar $500 por kill</p>
            <p className="text-gray-400">Use o dinheiro na Resenha 5 Store</p>
          </div>

          <button
            onClick={startGame}
            disabled={!nickname.trim()}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg text-lg transition-colors"
          >
            JOGAR
          </button>
        </div>
      ) : (
        <>
          <div className="absolute top-4 left-4 z-20 flex items-center gap-4">
            <button
              onClick={() => { setShowControls(true); setGameState('menu'); }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
            >
              ← Voltar
            </button>
            <span className={`text-sm font-bold ${stateColors[gameState]}`}>
              {stateLabels[gameState]}
            </span>
          </div>

          {(gameState === 'connecting' || gameState === 'loading') && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/80">
              <div className="text-center">
                <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-white text-lg">{stateLabels[gameState]}</p>
                <p className="text-gray-400 text-sm mt-2">Render pode levar 30-60s no primeiro acesso</p>
              </div>
            </div>
          )}

          <GameCanvas
            ref={gameRef}
            onStateChange={(s: string) => setGameState(s as any)}
          />
        </>
      )}
    </div>
  );
}
