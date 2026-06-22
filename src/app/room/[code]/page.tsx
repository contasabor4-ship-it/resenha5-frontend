'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRoom } from '@/lib/useRoom';
import { Lobby } from '@/components/game/Lobby';
import { WritePhrase } from '@/components/game/WritePhrase';
import { DrawingCanvas } from '@/components/game/DrawingCanvas';
import { GuessPhase } from '@/components/game/GuessPhase';
import { Results } from '@/components/game/Results';
import { Chat } from '@/components/ui/Chat';

export default function RoomPage() {
  const params = useParams();
  const roomCode = params.code as string;

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [showMobileChat, setShowMobileChat] = useState(false);

  const {
    room,
    players,
    myPlayer,
    chatMessages,
    currentAssignment,
    assignedPhrase,
    assignedDrawing,
    loading,
    sendMessage,
    advancePhase,
    submitPhrase,
    submitDrawing,
    submitGuess,
  } = useRoom(roomCode, playerId);

  useEffect(() => {
    const storedId = localStorage.getItem('player_id');
    const storedName = localStorage.getItem('player_name');
    if (storedId) setPlayerId(storedId);
    if (storedName) setPlayerName(storedName);
  }, []);

  const advanceAttemptedRef = useRef<string>('');

  useEffect(() => {
    if (!room || room.current_phase === 'lobby' || room.current_phase === 'results') return;
    const connectedPlayers = players.filter(p => p.is_connected);
    if (connectedPlayers.length === 0) return;
    const allDone = connectedPlayers.every(p => p.has_submitted);
    const advanceKey = `${room.current_phase}_${room.current_round}`;
    if (allDone && advanceAttemptedRef.current !== advanceKey) {
      advanceAttemptedRef.current = advanceKey;
      advancePhase();
    }
    if (!allDone) {
      advanceAttemptedRef.current = '';
    }
  }, [players, room, advancePhase]);

  const handleTimeUp = useCallback(() => {
    advancePhase(true);
  }, [advancePhase]);

  const handleSubmitPhrase = useCallback(async (text: string) => {
    await submitPhrase(text);
  }, [submitPhrase]);

  const handleSubmitDrawing = useCallback(async (imageData: string) => {
    if (!currentAssignment || !myPlayer) return;
    await submitDrawing(currentAssignment.source_id, imageData);
  }, [currentAssignment, myPlayer, submitDrawing]);

  const handleSubmitGuess = useCallback(async (text: string) => {
    if (!currentAssignment || !myPlayer) return;
    await submitGuess(currentAssignment.source_id, text);
  }, [currentAssignment, myPlayer, submitGuess]);

  const phaseLabels: Record<string, string> = {
    lobby: 'Sala de Espera',
    writing: 'Escrevendo',
    drawing: 'Desenhando',
    guessing: 'Adivinhando',
    results: 'Resultados',
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-sm">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
            <div className="w-8 h-8 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-[var(--text-secondary)] font-medium">Entrando na sala...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-sm animate-fade-in-up">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-yellow-500/20 to-red-500/20 flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
            <span className="text-2xl">🔍</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Sala não encontrada</h2>
          <p className="text-[var(--text-muted)] text-sm">Verifique o código e tente novamente.</p>
          <a href="/gartic" className="btn btn-primary mt-4 text-sm">Voltar</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-[var(--bg-secondary)] border-b border-[var(--border)] px-4 lg:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20 hover:opacity-90 transition-opacity">
              <span className="text-sm">🎨</span>
            </a>
            <div className="flex items-center gap-2 bg-[var(--bg-card)] rounded-lg px-3 py-1.5 border border-[var(--border)]">
              <span className="text-[11px] font-bold text-purple-400">9B</span>
              <span className="text-[var(--border)]">|</span>
              <span className="text-sm font-mono font-bold text-[var(--text)] tracking-wider">{roomCode}</span>
            </div>
            {room.current_phase !== 'lobby' && (
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-md px-2.5 py-1.5 border border-[var(--border)]">
                Rodada <span className="text-[var(--text)] font-semibold">{room.current_round}</span>
                <span className="text-[var(--border)]">/</span>
                <span className="text-[var(--text-muted)]">{room.total_rounds || '?'}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-[var(--text-muted)]">{phaseLabels[room.current_phase] || room.current_phase}</span>
            <div className="flex -space-x-2">
              {players.slice(0, 6).map((p) => (
                <div key={p.id}
                  className="w-8 h-8 rounded-lg border-2 border-[var(--bg-secondary)] flex items-center justify-center text-[11px] font-bold shadow-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: p.color }}
                  title={p.name}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {players.length > 6 && (
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border-2 border-[var(--bg-secondary)] flex items-center justify-center text-[10px] text-[var(--text-muted)] font-bold">
                  +{players.length - 6}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <main className="flex-1 flex flex-col min-w-0">
          {room.current_phase === 'lobby' && (
            <Lobby room={room} players={players} myPlayer={myPlayer} />
          )}

          {room.current_phase === 'writing' && (
            <WritePhrase
              phaseEndAt={room.phase_end_at}
              onTimeUp={handleTimeUp}
              onSubmit={handleSubmitPhrase}
              hasSubmitted={myPlayer?.has_submitted || false}
            />
          )}

          {room.current_phase === 'drawing' && assignedPhrase && (
            <DrawingCanvas
              phrase={assignedPhrase.text}
              phaseEndAt={room.phase_end_at}
              onTimeUp={handleTimeUp}
              onSubmit={handleSubmitDrawing}
              hasSubmitted={myPlayer?.has_submitted || false}
            />
          )}

          {room.current_phase === 'drawing' && !assignedPhrase && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="card p-8 text-center max-w-sm">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                  <div className="w-8 h-8 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-[var(--text-secondary)] font-medium">Aguardando atribuição...</p>
                <p className="text-[var(--text-muted)] text-sm mt-2">Preparando seu desenho</p>
              </div>
            </div>
          )}

          {room.current_phase === 'guessing' && assignedDrawing && (
            <GuessPhase
              drawingUrl={assignedDrawing.image_url}
              phaseEndAt={room.phase_end_at}
              onTimeUp={handleTimeUp}
              onSubmit={handleSubmitGuess}
              hasSubmitted={myPlayer?.has_submitted || false}
            />
          )}

          {room.current_phase === 'guessing' && !assignedDrawing && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="card p-8 text-center max-w-sm">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                  <div className="w-8 h-8 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-[var(--text-secondary)] font-medium">Aguardando atribuição...</p>
                <p className="text-[var(--text-muted)] text-sm mt-2">Preparando seu palpite</p>
              </div>
            </div>
          )}

          {room.current_phase === 'results' && (
            <Results room={room} players={players} />
          )}
        </main>

        <aside className="w-72 hidden lg:flex flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="p-3 border-b border-[var(--border)]">
            <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 px-1">
              Jogadores <span className="text-[var(--text-muted)]/60 font-normal normal-case">({players.length})</span>
            </h3>
            <div className="space-y-1">
              {players.map((p) => (
                <div key={p.id}
                  className="flex items-center gap-2.5 px-3 py-2 bg-[var(--bg-card)] rounded-lg text-sm border border-[var(--border)]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: p.color }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[var(--text-secondary)] flex-1 truncate text-xs">
                    {p.name}
                    {p.id === playerId && <span className="text-[var(--text-muted)] ml-1">(você)</span>}
                  </span>
                  {p.has_submitted && room.current_phase !== 'lobby' && (
                    <span className="text-green-400 text-xs font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col p-3 min-h-0">
            <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">Chat</h3>
            <div className="flex-1 min-h-0">
              <Chat messages={chatMessages} onSend={sendMessage} playerName={playerName} />
            </div>
          </div>
        </aside>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
        <button onClick={() => setShowMobileChat(!showMobileChat)}
          className="w-full py-3 bg-[var(--bg-secondary)] border-t border-[var(--border)] text-[var(--text)] text-sm font-bold flex items-center justify-center gap-2">
          <span>{showMobileChat ? '▼' : '▲'}</span>
          Chat ({chatMessages.length})
        </button>
        {showMobileChat && (
          <div className="h-64 bg-[var(--bg-secondary)] border-t border-[var(--border)] p-3 animate-slide-up">
            <Chat messages={chatMessages} onSend={sendMessage} playerName={playerName} />
          </div>
        )}
      </div>
    </div>
  );
}
