'use client';

import { useEffect, useState } from 'react';
import type { Player, Room } from '@/types';

interface ChainLink {
  type: 'phrase' | 'drawing' | 'guess';
  playerName: string;
  playerColor: string;
  content: string;
}

interface PlayerChain {
  playerName: string;
  playerColor: string;
  originalPhrase: string;
  links: ChainLink[];
}

interface ResultsProps {
  room: Room;
  players: Player[];
}

function Confetti() {
  const colors = ['#9b59ff', '#ff5e9e', '#00d4ff', '#f1c40f', '#2ecc71', '#e67e22', '#e84393'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map((p) => (
        <div key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.left}%`,
            top: '-5%',
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s infinite`,
            transform: `rotate(${p.id * 37}deg)`,
            opacity: 0.8,
          }} />
      ))}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-1">
      <div className="w-0.5 h-6 bg-gradient-to-b from-purple-500/40 to-purple-500/10 rounded-full relative">
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-purple-500/40" />
      </div>
    </div>
  );
}

export function Results({ room, players }: ResultsProps) {
  const [chains, setChains] = useState<PlayerChain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResults();
  }, [room.code]);

  async function loadResults() {
    try {
      const res = await fetch(`/api/rooms/${room.code}/results`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setChains(data.chains || []);
    } catch (e) {
      console.error('Error loading results:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Carregando resultados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 relative">
      <Confetti />
      <div className="max-w-2xl mx-auto animate-fade-in-up pb-10">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl lg:text-4xl font-black text-[var(--text)]">Resultado Final</h1>
        </div>

        {chains.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-[var(--text-muted)]">Nenhuma cadeia encontrada.</p>
          </div>
        )}

        <div className="space-y-6">
          {chains.map((chain, i) => (
            <div key={i}
              className="card overflow-hidden animate-slide-up"
              style={{ animationDelay: `${i * 100}ms` }}>

              <div className="px-5 py-4 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/5 to-pink-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: chain.playerColor }}>
                    {chain.playerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Frase Original</p>
                    <p className="text-[var(--text)] font-medium italic">&ldquo;{chain.originalPhrase}&rdquo;</p>
                    <p className="text-xs text-[var(--text-muted)]">por {chain.playerName}</p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3">
                {chain.links.map((link, idx) => (
                  <div key={idx}>
                    <Arrow />
                    <div className="animate-fade-in" style={{ animationDelay: `${idx * 60}ms` }}>
                      {link.type === 'drawing' ? (
                        <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-white shadow-sm">
                          <div className="px-3 py-1.5 bg-[var(--bg-input)] border-b border-[var(--border)] flex items-center gap-2">
                            <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: link.playerColor }}>
                              {link.playerName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                              Desenho de {link.playerName}
                            </span>
                          </div>
                          <img src={link.content} alt="" className="w-full max-h-72 object-contain bg-white" />
                        </div>
                      ) : (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: link.playerColor }}>
                              {link.playerName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                              Palpite de {link.playerName}
                            </span>
                          </div>
                          <p className="text-[var(--text)] italic text-sm">&ldquo;{link.content}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chain.links.length === 0 && (
                  <p className="text-[var(--text-muted)] text-xs text-center py-4">Sem cadeia nesta frase</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
