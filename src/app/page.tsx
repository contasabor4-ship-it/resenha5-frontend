'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Hub() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [logged, setLogged] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('r5_nickname');
    if (saved) {
      fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: saved }),
      }).then(res => {
        if (res.ok) { setNickname(saved); setLogged(true); }
        else localStorage.removeItem('r5_nickname');
      }).finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleAuth = async () => {
    setError('');
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length < 2) { setError('Nickname precisa de pelo menos 2 caracteres'); return; }
    if (/\s/.test(trimmed)) { setError('Nickname nao pode ter espacos'); return; }
    if (!password) { setError('Digite sua senha'); return; }
    if (isSignup && password.length < 3) { setError('Senha precisa de pelo menos 3 caracteres'); return; }

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/signin';
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: trimmed, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao autenticar'); return; }
      localStorage.setItem('r5_nickname', trimmed);
      setNickname(trimmed);
      setLogged(true);
    } catch { setError('Erro de conexao'); }
  };

  const handleLogout = () => { localStorage.removeItem('r5_nickname'); setLogged(false); setNickname(''); setPassword(''); };

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #ff6b6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!logged) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ background: 'rgba(20,20,30,0.9)', padding: '40px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', width: '380px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', marginBottom: '8px', background: 'linear-gradient(90deg, #ff6b6b, #ffa500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Resenha 5
          </h1>
          <p style={{ color: '#888', marginBottom: '30px', fontSize: '14px' }}>Hub de Jogos Multiplayer</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => { setIsSignup(false); setError(''); setPassword(''); }} style={{ flex: 1, padding: '8px', background: !isSignup ? '#ff6b6b' : '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Entrar</button>
            <button onClick={() => { setIsSignup(true); setError(''); setPassword(''); }} style={{ flex: 1, padding: '8px', background: isSignup ? '#ff6b6b' : '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Criar Conta</button>
          </div>
          <input type="text" placeholder="Nickname" value={nickname} onChange={e => setNickname(e.target.value.replace(/\s/g, '').slice(0, 16))} maxLength={16} style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
          <input type="password" placeholder={isSignup ? 'Minimo 3 caracteres' : 'Sua senha'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} minLength={3} style={{ width: '100%', padding: '12px', marginBottom: '16px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
          {error && <p style={{ color: '#ff4444', marginBottom: '12px', fontSize: '13px' }}>{error}</p>}
          <button onClick={handleAuth} style={{ width: '100%', padding: '12px', background: 'linear-gradient(90deg, #ff6b6b, #ff8e53)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            {isSignup ? 'Criar Conta' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  const games = [
    {
      name: 'Gartic',
      emoji: '🎨',
      desc: 'Desenhe, adivinhe e se divirta! Modo classico de desenhar e adivinhar frases.',
      color: '#4a9eff',
      borderColor: 'rgba(74,158,255,0.3)',
      hoverBorder: 'rgba(74,158,255,0.8)',
      path: '/gartic',
    },
    {
      name: 'Resenha 5',
      emoji: '🏴',
      desc: 'Mundo aberto 3D multiplayer. Missoes, assaltos, veiculos e muito mais.',
      color: '#ff6b6b',
      borderColor: 'rgba(255,100,100,0.3)',
      hoverBorder: 'rgba(255,100,100,0.8)',
      path: '/resenha5',
    },
    {
      name: 'Esconde-Esconde',
      emoji: '🫣',
      desc: '3D multiplayer. Esconda-se ou encontre os outros! Mude de cor para camuflar.',
      color: '#4caf50',
      borderColor: 'rgba(76,175,80,0.3)',
      hoverBorder: 'rgba(76,175,80,0.8)',
      path: '/hide-and-seek',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '900px', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', background: 'linear-gradient(90deg, #ff6b6b, #ffa500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Resenha 5
        </h1>
        <div>
          <span style={{ color: '#aaa', marginRight: '16px' }}>{nickname}</span>
          <button onClick={handleLogout} style={{ padding: '6px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Sair</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '900px', width: '100%' }}>
        {games.map((game) => (
          <div key={game.name} onClick={() => router.push(game.path)} style={{ background: 'rgba(20,20,30,0.9)', padding: '30px', borderRadius: '16px', border: `1px solid ${game.borderColor}`, cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s, border-color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; (e.currentTarget as HTMLDivElement).style.borderColor = game.hoverBorder; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.borderColor = game.borderColor; }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>{game.emoji}</div>
            <h2 style={{ fontSize: '22px', color: game.color, marginBottom: '8px' }}>{game.name}</h2>
            <p style={{ color: '#888', fontSize: '13px' }}>{game.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
