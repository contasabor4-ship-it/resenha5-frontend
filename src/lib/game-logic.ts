import type { Player } from '@/types';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateRoomCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return digits.toString();
}

export function createAssignments(
  players: Player[],
  roundNumber: number,
  phase: 'drawing' | 'guessing',
  sourceIds: string[]
): Array<{
  player_id: string;
  source_id: string;
  source_type: 'phrase' | 'drawing';
}> {
  const playerIds = players.map((p) => p.id);

  if (sourceIds.length !== playerIds.length) {
    throw new Error('sourceIds length must match players length');
  }

  let shuffledSources = shuffleArray(sourceIds);
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    let hasConflict = false;
    for (let i = 0; i < playerIds.length; i++) {
      if (shuffledSources[i] === sourceIds[i]) {
        hasConflict = true;
        break;
      }
    }
    if (!hasConflict) break;
    shuffledSources = shuffleArray(sourceIds);
    attempts++;
  }

  if (attempts >= maxAttempts) {
    const reversed = [...sourceIds].reverse();
    for (let i = 0; i < playerIds.length; i++) {
      if (reversed[i] === sourceIds[i] && playerIds.length > 1) {
        [reversed[0], reversed[i]] = [reversed[i], reversed[0]];
      }
    }
    shuffledSources = reversed;
  }

  return playerIds.map((playerId, i) => ({
    player_id: playerId,
    source_id: shuffledSources[i],
    source_type: phase === 'drawing' ? 'phrase' as const : 'drawing' as const,
  }));
}

export function calculatePhaseEnd(durationSeconds: number): string {
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}

export function getRemainingSeconds(phaseEndAt: string): number {
  const end = new Date(phaseEndAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function generatePlayerColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
    '#F1948A', '#85929E', '#73C6B6', '#E59866',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
