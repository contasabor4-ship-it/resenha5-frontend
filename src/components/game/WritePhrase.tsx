'use client';

import { useState } from 'react';
import { Timer } from '@/components/ui/Timer';

interface WritePhraseProps {
  phaseEndAt: string | null;
  onTimeUp: () => void;
  onSubmit: (text: string) => Promise<void>;
  hasSubmitted: boolean;
}

const SUGGESTIONS = [
  'Um gato astronauta', 'A pizza mais cara do mundo',
  'O dia que o sol caiu', 'Uma banana dançante',
  'O peixe que andava', 'A nuvem de algodão doce',
  'O dragão fofinho', 'Uma pizza voadora',
];

export function WritePhrase({ phaseEndAt, onTimeUp, onSubmit, hasSubmitted }: WritePhraseProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  const isSubmitted = hasSubmitted || locallySubmitted;

  async function handleSubmit() {
    if (!text.trim() || sending || isSubmitted) return;
    setSending(true);
    try {
      await onSubmit(text.trim());
      setLocallySubmitted(true);
    } catch {
    } finally {
      setSending(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 animate-fade-in-up">
        <div className="card p-10 text-center max-w-sm">
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-5 animate-bounce-in border border-green-500/30">
            <span className="text-4xl">✏️</span>
          </div>
          <h2 className="text-2xl font-black text-[var(--text)] mb-2">Frase enviada!</h2>
          <p className="text-[var(--text-secondary)] text-sm">Aguardando os outros jogadores...</p>
          <div className="flex justify-center gap-2 mt-6">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 animate-fade-in-up">
      <div className="w-full max-w-lg">
        <div className="card p-6 lg:p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-[var(--text)]">Escreva uma frase</h2>
              <p className="text-[var(--text-secondary)] text-sm mt-1">Alguém vai desenhar isso!</p>
            </div>
            <Timer phaseEndAt={phaseEndAt} onTimeUp={onTimeUp} isActive={true} />
          </div>

          <div className="bg-[var(--bg-input)] rounded-lg p-4 mb-4 border border-[var(--border)]">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 100))}
              placeholder="Digite sua frase aqui..."
              className="w-full h-32 bg-transparent text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none resize-none text-sm leading-relaxed"
              maxLength={100}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
              <span className="text-xs text-[var(--text-muted)]">{text.length}/100</span>
              <button onClick={handleSubmit} disabled={!text.trim() || sending}
                className="btn btn-primary text-sm py-2.5 px-6">
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setText(s)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--purple)] bg-[var(--bg-input)] hover:bg-purple-500/10 px-3 py-1.5 rounded-lg transition-all border border-[var(--border)] hover:border-[var(--purple)]/30 font-semibold">
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
