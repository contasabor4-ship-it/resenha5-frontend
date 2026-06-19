'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Timer } from '@/components/ui/Timer';

interface DrawingCanvasProps {
  phrase: string;
  onSubmit: (imageData: string) => Promise<void>;
  hasSubmitted: boolean;
  phaseEndAt: string | null;
  onTimeUp: () => void;
}

interface Point { x: number; y: number; }

const COLORS = [
  '#ffffff', '#000000', '#ff4444', '#ff8800', '#ffdd00', '#44cc44',
  '#00cccc', '#4488ff', '#4444ff', '#8844ff', '#ff44cc', '#cc4488',
  '#888888', '#555555', '#cc6666', '#ccaa66', '#cccc66', '#66cc66',
  '#66cccc', '#6688cc', '#6666cc', '#8866cc', '#cc66aa', '#aa6688',
  '#d4a373', '#e9c46a', '#f4a261', '#2a9d8f', '#264653', '#6b705c',
];

const LINE_WIDTHS = [3, 6, 10, 16, 24];

export function DrawingCanvas({ phrase, onSubmit, hasSubmitted, phaseEndAt, onTimeUp }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'bucket'>('brush');
  const [sending, setSending] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);
  const undoStack = useRef<string[]>([]);

  const isSubmitted = hasSubmitted || locallySubmitted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const size = Math.min(parent.clientWidth - 4, 640);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStack.current.push(canvas.toDataURL());
    if (undoStack.current.length > 30) undoStack.current.shift();
  }, []);

  const restoreState = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = dataUrl;
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: (touch.clientX - rect.left) * (canvas.width / rect.width),
        y: (touch.clientY - rect.top) * (canvas.height / rect.height),
      };
    }
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (isSubmitted) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    if (tool === 'bucket') { floodFill(pos); return; }
    saveState();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 3 : lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing || isSubmitted) return;
    const pos = getPos(e);
    if (!pos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 3 : lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIsDrawing(false);
  }

  function floodFill(startPos: Point) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveState();
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const si = (Math.floor(startPos.y) * w + Math.floor(startPos.x)) * 4;
    const tR = data[si], tG = data[si + 1], tB = data[si + 2];
    const fR = parseInt(color.slice(1, 3), 16), fG = parseInt(color.slice(3, 5), 16), fB = parseInt(color.slice(5, 7), 16);
    if (tR === fR && tG === fG && tB === fB) return;
    const stack: number[] = [Math.floor(startPos.x), Math.floor(startPos.y)];
    const visited = new Set<number>();
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      const idx = (y * w + x) * 4;
      if (visited.has(idx)) continue;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (data[idx] !== tR || data[idx + 1] !== tG || data[idx + 2] !== tB) continue;
      visited.add(idx);
      data[idx] = fR; data[idx + 1] = fG; data[idx + 2] = fB; data[idx + 3] = 255;
      stack.push(x + 1, y); stack.push(x - 1, y); stack.push(x, y + 1); stack.push(x, y - 1);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function handleUndo() {
    const state = undoStack.current.pop();
    if (!state) return;
    restoreState(state);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveState();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSubmit() {
    if (sending || isSubmitted) return;
    setSending(true);
    const canvas = canvasRef.current;
    if (!canvas) { setSending(false); return; }
    try {
      await onSubmit(canvas.toDataURL('image/png'));
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
            <span className="text-4xl">🎨</span>
          </div>
          <h2 className="text-2xl font-black text-[var(--text)] mb-2">Desenho enviado!</h2>
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
    <div className="flex-1 flex flex-col lg:flex-row p-4 gap-4 animate-fade-in-up max-w-6xl mx-auto w-full">
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0 flex-1 mr-4">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-0.5">Desenhe:</p>
              <p className="text-[var(--purple-light)] font-bold italic truncate">&ldquo;{phrase}&rdquo;</p>
            </div>
            <Timer phaseEndAt={phaseEndAt} onTimeUp={onTimeUp} isActive={true} />
          </div>

          <div className="bg-white rounded-lg overflow-hidden touch-none flex items-center justify-center shadow-inner"
            style={{ minHeight: 400 }}>
            <canvas ref={canvasRef}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              className="cursor-crosshair touch-none"
              style={{ maxWidth: '100%', maxHeight: '65vh' }} />
          </div>
        </div>

        <button onClick={handleSubmit} disabled={sending}
          className="btn btn-success w-full text-base py-3.5">
          {sending ? 'Enviando...' : 'Enviar Desenho'}
        </button>
      </div>

      <div className="lg:w-56 flex flex-col gap-3">
        <div className="card-sm p-4">
          <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-3">Ferramentas</h3>
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-2">
            {[
              { id: 'brush' as const, icon: '✏️', label: 'Pincel' },
              { id: 'bucket' as const, icon: '🪣', label: 'Balde' },
              { id: 'eraser' as const, icon: '🧹', label: 'Borracha' },
            ].map((t) => (
              <button key={t.id} onClick={() => setTool(t.id)}
                className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg transition-all ${
                  tool === t.id
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--purple)]/30'
                }`}>
                <span className="text-lg">{t.icon}</span>
                <span className="text-[10px] font-bold">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card-sm p-4">
          <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-3">Cores</h3>
          <div className="grid grid-cols-6 gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-full aspect-square rounded-md transition-all border-2 ${
                  color === c ? 'border-[var(--purple)] scale-110 shadow-md' : 'border-[var(--border)] hover:scale-105'
                }`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <div className="card-sm p-4">
          <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-3">Traço</h3>
          <div className="flex flex-col gap-2">
            {LINE_WIDTHS.map((w) => (
              <button key={w} onClick={() => setLineWidth(w)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  lineWidth === w
                    ? 'bg-purple-500/15 border border-purple-500/30'
                    : 'bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--purple)]/30'
                }`}>
                <div className="w-8 flex items-center justify-center">
                  <div className="rounded-full bg-[var(--text)]" style={{ width: Math.min(w, 16), height: Math.min(w, 16) }} />
                </div>
                <span className="text-xs text-[var(--text-secondary)] font-semibold">{w}px</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleUndo} disabled={undoStack.current.length === 0}
            className="btn btn-secondary flex-1 text-xs py-2.5 px-3 disabled:opacity-40">
            ↩ Desfazer
          </button>
          <button onClick={handleClear}
            className="btn btn-secondary flex-1 text-xs py-2.5 px-3 border-red-500/30 text-red-400 hover:border-red-500/50">
            🗑 Limpar
          </button>
        </div>
      </div>
    </div>
  );
}
