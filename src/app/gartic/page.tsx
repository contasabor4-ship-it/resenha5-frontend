'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function FloatingEmojis() {
  const items = [
    { emoji: '✏️', size: 24, x: 8, y: 18, delay: 0, duration: 5 },
    { emoji: '🎨', size: 30, x: 90, y: 15, delay: 0.3, duration: 6 },
    { emoji: '🖌️', size: 22, x: 12, y: 80, delay: 0.8, duration: 5.5 },
    { emoji: '🌈', size: 26, x: 82, y: 82, delay: 0.2, duration: 7 },
    { emoji: '⭐', size: 20, x: 52, y: 5, delay: 0.5, duration: 4.5 },
    { emoji: '💜', size: 22, x: 5, y: 50, delay: 0.6, duration: 5.8 },
    { emoji: '🎯', size: 18, x: 35, y: 90, delay: 1, duration: 5.2 },
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {items.map((item, i) => (
        <div key={i}
          className="absolute animate-float"
          style={{
            left: `${item.x}%`, top: `${item.y}%`,
            fontSize: item.size,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            opacity: 0.12,
          }}>
          {item.emoji}
        </div>
      ))}
    </div>
  );
}

export default function GarticHome() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const authNick = localStorage.getItem('r5_nickname');
    if (!authNick) { router.replace('/'); return; }
    const stored = localStorage.getItem('player_name');
    setNickname(stored || authNick);
  }, [router]);

  function validateNickname(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return 'Digite um nickname';
    if (trimmed.length < 2) return 'Nickname muito curto';
    if (trimmed.length > 16) return 'Nickname muito longo';
    if (/\s/.test(trimmed)) return 'Nickname não pode conter espaços';
    return null;
  }

  async function handleCreate() {
    setError('');
    const nameErr = validateNickname(nickname);
    if (nameErr) { setError(nameErr); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao criar sala'); return; }

      localStorage.setItem('player_name', nickname.trim());

      const joinRes = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: data.code, nickname: nickname.trim(), isHost: true }),
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) { setError(joinData.error || 'Erro ao entrar na sala'); return; }

      localStorage.setItem('player_id', joinData.player.id);
      localStorage.setItem('player_name', nickname.trim());
      router.push(`/room/${data.code}`);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    setError('');
    const nameErr = validateNickname(nickname);
    if (nameErr) { setError(nameErr); return; }
    if (!joinCode.trim()) { setError('Digite o código da sala'); return; }

    const code = joinCode.trim();
    setLoading(true);
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, nickname: nickname.trim(), isHost: false }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao entrar na sala'); return; }

      localStorage.setItem('player_id', data.player.id);
      localStorage.setItem('player_name', nickname.trim());
      router.push(`/room/${code}`);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 relative">
      <FloatingEmojis />
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <a href="/" className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--purple)] transition-colors mb-8 text-sm font-semibold">
          <span>←</span> Voltar
        </a>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-xl shadow-purple-500/30 mb-5 animate-bounce-in">
            <span className="text-4xl">🎨</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-1">
            <span className="text-gradient">Resenha do 9B</span>
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">Desenhe, adivinhe, se divirta</p>
        </div>

        <div className="card overflow-hidden">
          <div className="flex bg-[var(--bg-secondary)]">
            <button onClick={() => { setTab('create'); setError(''); }}
              className={`flex-1 py-3.5 text-sm font-bold transition-all relative ${
                tab === 'create' ? 'text-[var(--purple)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}>
              Criar Sala
              {tab === 'create' && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500" />
              )}
            </button>
            <button onClick={() => { setTab('join'); setError(''); }}
              className={`flex-1 py-3.5 text-sm font-bold transition-all relative ${
                tab === 'join' ? 'text-[var(--purple)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}>
              Entrar
              {tab === 'join' && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500" />
              )}
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-bold uppercase tracking-wider">Seu Nickname</label>
              <input type="text" value={nickname}
                onChange={(e) => setNickname(e.target.value.replace(/\s/g, '').slice(0, 16))}
                placeholder="Sem espaços" maxLength={16}
                className="w-full px-4 py-3 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--purple)] focus:ring-2 focus:ring-purple-500/20 text-sm transition-all" />
            </div>

            {tab === 'join' && (
              <div className="animate-fade-in">
                <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-bold uppercase tracking-wider">Código da Sala</label>
                <input type="text" value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="0000" maxLength={4} autoFocus
                  className="w-full px-4 py-4 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--purple)] focus:ring-2 focus:ring-purple-500/20 text-sm text-center tracking-[0.5em] font-bold text-2xl transition-all" />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-lg px-3 py-2.5 border border-red-500/20 animate-fade-in">{error}</p>
            )}

            <button onClick={tab === 'create' ? handleCreate : handleJoin} disabled={loading}
              className="btn btn-primary w-full text-base">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Aguarde...
                </span>
              ) : tab === 'create' ? 'Criar Sala' : 'Entrar na Sala'}
            </button>
          </div>
        </div>

        <p className="text-center text-[var(--text-muted)] text-xs mt-6">
          Compartilhe o código de 4 dígitos com seus amigos
        </p>
      </div>
    </div>
  );
}
