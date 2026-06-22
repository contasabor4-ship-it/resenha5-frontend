'use client';
import { useState } from 'react';

interface LobbyProps {
  nickname: string;
  onCreateRoom: (team: 'CT' | 'T') => void;
  onJoinRoom: (code: string, team: 'CT' | 'T') => void;
  onBack: () => void;
}

export default function Lobby({ nickname, onCreateRoom, onJoinRoom, onBack }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<'CT' | 'T'>('CT');
  const [showJoin, setShowJoin] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#fff',
    }}>
      <div style={{ textAlign: 'center', width: 420 }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 20, left: 20,
          padding: '6px 16px', background: '#333', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
        }}>Voltar</button>

        <h1 style={{ fontSize: 36, marginBottom: 4, color: '#ff6b6b', fontWeight: 900 }}>
          CS RESENHA
        </h1>
        <p style={{ color: '#888', marginBottom: 30, fontSize: 14 }}>Counter-Strike estilo Resenha</p>

        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#aaa', marginBottom: 10, fontSize: 13 }}>Escolha seu time:</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setSelectedTeam('CT')} style={{
              padding: '12px 32px', borderRadius: 8, border: selectedTeam === 'CT' ? '2px solid #4488ff' : '2px solid #444',
              background: selectedTeam === 'CT' ? 'rgba(68,136,255,0.2)' : '#222',
              color: selectedTeam === 'CT' ? '#4488ff' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 16,
            }}>
              CT
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>M4A1</div>
            </button>
            <button onClick={() => setSelectedTeam('T')} style={{
              padding: '12px 32px', borderRadius: 8, border: selectedTeam === 'T' ? '2px solid #ff6b35' : '2px solid #444',
              background: selectedTeam === 'T' ? 'rgba(255,107,53,0.2)' : '#222',
              color: selectedTeam === 'T' ? '#ff6b35' : '#888', cursor: 'pointer', fontWeight: 'bold', fontSize: 16,
            }}>
              T
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>AK-47</div>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => onCreateRoom(selectedTeam)} style={{
            padding: '14px 24px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(90deg, #ff6b6b, #ff8e53)',
            color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer',
          }}>
            Criar Sala
          </button>

          {!showJoin ? (
            <button onClick={() => setShowJoin(true)} style={{
              padding: '14px 24px', borderRadius: 8, border: '1px solid #444',
              background: '#222', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}>
              Entrar em Sala
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Codigo da sala"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #444',
                  background: '#222', color: '#fff', fontSize: 16, textAlign: 'center',
                  letterSpacing: 4,
                }}
              />
              <button
                onClick={() => joinCode.length >= 4 && onJoinRoom(joinCode, selectedTeam)}
                disabled={joinCode.length < 4}
                style={{
                  padding: '12px 20px', borderRadius: 8, border: 'none',
                  background: joinCode.length >= 4 ? '#4488ff' : '#333',
                  color: '#fff', fontSize: 14, fontWeight: 'bold',
                  cursor: joinCode.length >= 4 ? 'pointer' : 'default',
                }}
              >
                Entrar
              </button>
            </div>
          )}
        </div>

        <p style={{ color: '#555', marginTop: 30, fontSize: 11 }}>
          {nickname} · WASD + Mouse · Team Deathmatch
        </p>
      </div>
    </div>
  );
}
