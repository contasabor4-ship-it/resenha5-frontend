'use client';

import { useRef, useEffect } from 'react';

interface ChatProps {
  messages: Array<{ id: string; player_name: string; message: string }>;
  onSend: (message: string) => void;
  playerName: string;
}

export function Chat({ messages, onSend }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const colors = ['#9b59ff', '#ff5e9e', '#00d4ff', '#f1c40f', '#2ecc71', '#e67e22', '#e84393', '#00cec9'];
  function nameColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {messages.length === 0 && (
          <div className="text-center pt-8">
            <p className="text-[var(--text-muted)] text-xs font-semibold">Nenhuma mensagem ainda</p>
            <p className="text-[var(--text-muted)]/60 text-[10px] mt-1">Seja o primeiro a dizer algo!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in text-sm px-2 py-1.5 rounded-md hover:bg-[var(--bg-input)] transition-colors">
            <span className="font-bold" style={{ color: nameColor(msg.player_name) }}>
              {msg.player_name}:
            </span>{' '}
            <span className="text-[var(--text-secondary)]">{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
          if (input.value.trim()) {
            onSend(input.value.trim());
            input.value = '';
          }
        }}
        className="flex gap-2 pt-3 mt-2 border-t border-[var(--border)]"
      >
        <input type="text" name="message"
          placeholder="Mensagem..."
          className="flex-1 px-3 py-2.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--purple)] transition-all"
          maxLength={200}
        />
        <button type="submit"
          className="btn btn-primary text-sm py-2 px-4 min-w-[44px]">
          →
        </button>
      </form>
    </div>
  );
}
