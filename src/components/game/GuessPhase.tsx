'use client';

import { useState, useEffect, useRef } from 'react';
import { Timer } from '@/components/ui/Timer';

interface GuessPhaseProps {
  drawingUrl: string;
  phaseEndAt: string | null;
  onTimeUp: () => void;
  onSubmit: (text: string) => Promise<void>;
  hasSubmitted: boolean;
}

export function GuessPhase({ drawingUrl, phaseEndAt, onTimeUp, onSubmit, hasSubmitted }: GuessPhaseProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isSubmitted = hasSubmitted || locallySubmitted;

  useEffect(() => {
    if (!isSubmitted) inputRef.current?.focus();
  }, [isSubmitted]);

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
            <span className="text-4xl">💡</span>
          </div>
          <h2 className="text-2xl font-black text-[var(--text)] mb-2">Palpite enviado!</h2>
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
    <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center p-4 gap-6 animate-fade-in-up max-w-5xl mx-auto w-full">
      <div className="flex-1 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-[var(--text)]">O que é esse desenho?</h2>
          <Timer phaseEndAt={phaseEndAt} onTimeUp={onTimeUp} isActive={true} />
        </div>

        <div className="bg-white rounded-lg overflow-hidden flex items-center justify-center shadow-lg"
          style={{ minHeight: 350 }}>
          <img src={drawingUrl} alt="Desenho para adivinhar"
            className="max-w-full max-h-[55vh] object-contain p-4" />
        </div>

        <div className="card p-5 mt-4">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 100))}
            placeholder="Digite seu palpite..."
            className="w-full h-24 bg-[var(--bg-input)] rounded-lg p-3 text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-[var(--purple)] border border-[var(--border)] resize-none text-sm leading-relaxed transition-all"
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between pt-3">
            <span className="text-xs text-[var(--text-muted)]">{text.length}/100</span>
            <button onClick={handleSubmit} disabled={!text.trim() || sending}
              className="btn btn-primary text-sm py-2.5 px-6">
              {sending ? 'Enviando...' : 'Enviar Palpite'}
            </button>
          </div>
        </div>
      </div>

      <div className="card-sm p-5 w-full max-w-xs shrink-0 self-start">
        <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-4">Dicas</h3>
        <div className="space-y-3">
          <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Pense em</p>
            <p className="text-sm text-[var(--text)] font-semibold">O que poderia ser isso?</p>
          </div>
          <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] mb-1">Observe</p>
            <p className="text-sm text-[var(--text)] font-semibold">Cores, formas e detalhes</p>
          </div>
          <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
            <p className="text-xs text-purple-400 mb-1">Dica</p>
            <p className="text-sm text-purple-300 font-semibold">Seja criativo!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
