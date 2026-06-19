'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const HNSCanvas = dynamic(() => import('@/hide-and-seek/HNSCanvas'), { ssr: false });

type RoomState = 'connecting' | 'lobby' | 'prep' | 'playing' | 'results';

export default function HideAndSeekRoom() {
  const params = useParams();
  const code = params.code as string;
  const [roomState, setRoomState] = useState<RoomState>('connecting');
  const [players, setPlayers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [gameData, setGameData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const gameRef = useRef<any>(null);

  useEffect(() => {
    const nickname = localStorage.getItem('nickname') || 'Player';
    (window as any).__HNS_SERVER_URL = process.env.NEXT_PUBLIC_HNS_SERVER_URL || 'http://localhost:3001';
  }, []);

  useEffect(() => {
    if (roomState !== 'lobby' || !gameRef.current) return;
    const interval = setInterval(() => {
      const hostId = gameRef.current?.getHostId?.() || '';
      const playerId = gameRef.current?.getPlayerId?.() || '';
      if (hostId && playerId) {
        setIsHost(hostId === playerId);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [roomState]);

  const handleStateChange = (state: string, data?: any) => {
    setRoomState(state as RoomState);
    if (data?.players) setPlayers(data.players);
    if (data?.code) setGameData(data);
    if (data?.prep !== undefined) setGameData(data);
    if (data?.round !== undefined) setGameData(data);
    if (data?.hostId && data?.playerId) {
      setIsHost(data.hostId === data.playerId);
    }
    if (data?.error) {
      setErrorMsg(data.error);
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const startGame = () => {
    gameRef.current?.startGame();
  };

  const leaveRoom = () => {
    gameRef.current?.leaveRoom();
    window.location.href = '/hide-and-seek';
  };

  const stateLabels: Record<string, string> = {
    connecting: 'Conectando...',
    lobby: 'Lobby',
    prep: 'Preparacao - Se esconda!',
    playing: 'Procurando!',
    results: 'Resultados',
  };

  return (
    <div className="w-full h-screen bg-black flex flex-col relative">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <button
          onClick={leaveRoom}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
        >
          ← Sair
        </button>
        <div className="bg-gray-900/80 px-4 py-2 rounded-lg">
          <span className="text-green-400 font-bold">Sala: {code}</span>
        </div>
        <div className="bg-gray-900/80 px-4 py-2 rounded-lg">
          <span className="text-white text-sm">{stateLabels[roomState]}</span>
        </div>
      </div>

      {roomState === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white text-lg">Conectando a sala {code}...</p>
            <p className="text-gray-400 text-sm mt-2">Render pode levar 30-60s no primeiro acesso</p>
          </div>
        </div>
      )}

      {roomState === 'lobby' && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/70">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-green-700">
            <h2 className="text-2xl font-bold text-green-400 text-center mb-4">Lobby - Sala {code}</h2>
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">Jogadores ({players.length}/16):</p>
              <div className="bg-gray-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `#${p.color.toString(16).padStart(6, '0')}` }}></div>
                    <span className="text-white text-sm">{p.nickname}</span>
                    {i === 0 && <span className="text-yellow-400 text-xs">(Host)</span>}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={startGame}
              disabled={!isHost || players.length < 2}
              className={`w-full py-3 font-bold rounded-lg transition-colors ${isHost && players.length >= 2 ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
            >
              {!isHost ? 'Apenas o host pode iniciar' : players.length < 2 ? 'Precisa de 2+ jogadores' : 'Iniciar Jogo'}
            </button>
            {errorMsg && (
              <p className="text-red-400 text-sm text-center mt-2">{errorMsg}</p>
            )}
          </div>
        </div>
      )}

      {(roomState === 'prep' || roomState === 'playing') && gameData && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-gray-900/80 px-6 py-3 rounded-xl flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                {roomState === 'prep' ? gameData.prep : gameData.round}
              </div>
              <div className="text-xs text-gray-400">{roomState === 'prep' ? 'Preparacao' : 'Restante'}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-red-400">Procuradores</div>
              <div className="text-white">{gameData.seekers?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-green-400">Escondidos</div>
              <div className="text-white">{gameData.hiders?.length || 0}</div>
            </div>
          </div>
        </div>
      )}

      {roomState === 'results' && gameData && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/70">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-green-700">
            <h2 className="text-2xl font-bold text-green-400 text-center mb-4">
              Rodada {gameData.round} - {gameData.hidersWon ? 'Escondidos Venceram!' : 'Procuradores Venceram!'}
            </h2>
            <div className="bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto">
              {Object.entries(gameData.scores || {})
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([id, score]) => {
                  const player = gameData.players?.find((p: any) => p.id === id);
                  return (
                    <div key={id} className="flex justify-between py-1">
                      <span className="text-white text-sm">{player?.nickname || id}</span>
                      <span className="text-green-400 font-bold">{score as number} pts</span>
                    </div>
                  );
                })}
            </div>
            <p className="text-gray-400 text-sm text-center mt-4">Proxima rodada em breve...</p>
          </div>
        </div>
      )}

      <HNSCanvas
        ref={gameRef}
        code={code}
        onStateChange={handleStateChange}
      />
    </div>
  );
}
