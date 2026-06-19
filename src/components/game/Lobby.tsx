'use client';

import { useState } from 'react';
import type { Room, Player } from '@/types';

interface LobbyProps {
  room: Room;
  players: Player[];
  myPlayer: Player | null;
}

function PlayerCard({ player, isMe }: { player: Player; isMe: boolean }) {
  return (
    <div className="card-sm p-4 flex items-center gap-3 animate-fade-in hover:border-[var(--purple)]/30 transition-all">
      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md"
          style={{ backgroundColor: player.color }}>
          {player.name.charAt(0).toUpperCase()}
        </div>
        {player.is_host && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-md bg-yellow-400 flex items-center justify-center text-[10px] shadow-md border-2 border-[var(--bg-card)] animate-bounce-in">
            👑
          </div>
        )}
        {isMe && (
          <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[7px] text-white shadow-md border-2 border-[var(--bg-card)]">
            ●
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text)] text-sm font-bold truncate">
          {player.name}
          {isMe && <span className="text-[var(--text-muted)] font-normal text-xs ml-1">(você)</span>}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div className={`w-2 h-2 rounded-full ${player.is_connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-[var(--text-muted)]">{player.is_connected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>
      {player.is_host && (
        <span className="tag bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 text-[10px]">HOST</span>
      )}
    </div>
  );
}

export function Lobby({ room, players, myPlayer }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStart() {
    if (!myPlayer?.is_host || starting) return;
    setStarting(true);
    try {
      await fetch('/api/rooms/' + room.code + '/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayer.id, roomCode: room.code }),
      });
    } finally {
      setStarting(false);
    }
  }

  async function handleLeave() {
    localStorage.removeItem('player_id');
    localStorage.removeItem('player_name');
    window.location.href = '/gartic';
  }

  const canStart = players.filter(p => p.is_connected).length >= 2;

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 gap-5 max-w-4xl mx-auto w-full animate-fade-in-up">
      <div className="card p-6 lg:p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 mb-4 border border-purple-500/20">
          <span className="text-3xl">🎨</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black mb-1">
          <span className="text-gradient">Resenha do 9B</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-sm mb-6">Compartilhe o código com seus amigos</p>

        <div className="inline-flex items-center gap-3 bg-[var(--bg-input)] rounded-lg px-6 py-4 border border-[var(--border)]">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">Código</span>
          <span className="text-3xl font-black tracking-[0.2em] text-[var(--text)]">{room.code}</span>
          <button onClick={handleCopy}
            className="btn btn-primary text-xs py-2 px-4">
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="card p-6 lg:p-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-black text-[var(--text-secondary)] uppercase tracking-wider">
            Jogadores <span className="text-[var(--text-muted)] font-normal normal-case">({players.length})</span>
          </h2>
          <button onClick={handleLeave}
            className="btn btn-secondary text-xs py-1.5 px-3">
            Sair
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {players.map((p, i) => (
            <div key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <PlayerCard player={p} isMe={p.id === myPlayer?.id} />
            </div>
          ))}
        </div>

        {players.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[var(--text-muted)] text-sm">Nenhum jogador na sala</p>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        {myPlayer?.is_host ? (
          <button onClick={handleStart} disabled={!canStart || starting}
            className="btn btn-success text-base px-12 py-4">
            {starting ? (
              <span className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Iniciando...
              </span>
            ) : canStart ? 'Iniciar Jogo' : 'Aguardando jogadores...'}
          </button>
        ) : (
          <div className="card-sm px-10 py-5 text-center">
            <p className="text-[var(--text-secondary)] text-sm font-semibold">Aguardando o host iniciar o jogo</p>
            <div className="flex justify-center gap-1.5 mt-3">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
