'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HideAndSeekLobby() {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const joinRoom = () => {
    if (!code.trim() || !nickname.trim()) return;
    setLoading(true);
    setError('');
    localStorage.setItem('nickname', nickname);
    (window as any).__HNS_SERVER_URL = process.env.NEXT_PUBLIC_HNS_SERVER_URL || 'http://localhost:3001';
    router.push(`/hide-and-seek/${code.trim()}`);
  };

  const createRoom = async () => {
    if (!nickname.trim()) return;
    setLoading(true);
    setError('');
    localStorage.setItem('nickname', nickname);
    (window as any).__HNS_SERVER_URL = process.env.NEXT_PUBLIC_HNS_SERVER_URL || 'http://localhost:3001';

    try {
      const { io } = await import('socket.io-client');
      const serverUrl = process.env.NEXT_PUBLIC_HNS_SERVER_URL || 'http://localhost:3001';
      const socket = io(serverUrl + '/hns', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 15000,
        timeout: 120000,
      });

      let attemptCount = 0;

      socket.on('connect', () => {
        attemptCount = 0;
        setError('');
        socket.emit('create_room');
      });

      socket.on('room_created', (data: { code: string }) => {
        socket.disconnect();
        router.push(`/hide-and-seek/${data.code}`);
      });

      socket.on('connect_error', () => {
        attemptCount++;
        if (attemptCount <= 3) {
          setError(`Servidor dormindo, acordando... (tentativa ${attemptCount})`);
        } else {
          setError('Servidor iniciando, aguarde...');
        }
      });

      socket.on('reconnect_attempt', (attempt: number) => {
        setError(` Reconectando... (tentativa ${attempt})`);
      });

      setTimeout(() => {
        if (!socket.connected) {
          setError('Servidor demorou para responder. Tente novamente.');
          setLoading(false);
          socket.disconnect();
        }
      }, 180000);
    } catch {
      setError('Erro ao criar sala');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-green-700">
        <h1 className="text-3xl font-bold text-green-400 text-center mb-2">Esconde-Esconde</h1>
        <p className="text-gray-400 text-center mb-6">Encontre os escondidos!</p>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Seu nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-green-500"
          />
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Codigo da sala"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            maxLength={4}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-center text-2xl tracking-widest focus:outline-none focus:border-green-500"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded-lg text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        <button
          onClick={joinRoom}
          disabled={!code.trim() || !nickname.trim() || loading}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg mb-3 transition-colors"
        >
          {loading ? 'Conectando...' : 'Entrar na Sala'}
        </button>

        <button
          onClick={createRoom}
          disabled={!nickname.trim() || loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
        >
          {loading ? 'Criando...' : 'Criar Nova Sala'}
        </button>

        <div className="mt-6 text-center">
          <a href="/" className="text-gray-400 hover:text-white text-sm">← Voltar ao Hub</a>
        </div>
      </div>
    </div>
  );
}
