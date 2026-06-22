import { io, Socket } from 'socket.io-client';
import { CSPlayerState, CSRoomState, WeaponType } from '../types';

export interface CSNetworkClient {
  socket: Socket;
  connect(url: string, nickname: string): void;
  joinMatch(team: 'CT' | 'T'): void;
  leaveMatch(): void;
  sendState(state: Partial<CSPlayerState>): void;
  shoot(data: { x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType; hitId?: string }): void;
  onMatchJoined(cb: (data: { playerId: string; match: any; players: CSPlayerState[] }) => void): void;
  onPlayersUpdate(cb: (players: CSPlayerState[]) => void): void;
  onGameState(cb: (state: CSRoomState) => void): void;
  onPlayerDied(cb: (data: { victimId: string; killerId: string; headshot: boolean }) => void): void;
  onRoundEnd(cb: (data: { ctScore: number; tScore: number; round: number }) => void): void;
  onMatchEnd(cb: (data: { ctScore: number; tScore: number }) => void): void;
  onBullet(cb: (data: { id: string; ownerId: string; x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType }) => void): void;
  onKillfeed(cb: (data: { killer: string; victim: string; weapon: WeaponType; headshot: boolean }) => void): void;
  onCountdown(cb: (data: { seconds: number }) => void): void;
  onError(cb: (msg: string) => void): void;
  disconnect(): void;
}

export function createCSNetworkClient(): CSNetworkClient {
  let socket: Socket;
  const listeners: Array<() => void> = [];

  function connect(url: string, nickname: string) {
    socket = io(url + '/cs', {
      transports: ['websocket', 'polling'],
      auth: { nickname },
    });
    socket.on('connect', () => console.log('CS connected:', socket.id));
    socket.on('disconnect', () => console.log('CS disconnected'));
  }

  function on(event: string, cb: (...args: any[]) => void) {
    socket?.on(event, cb);
    listeners.push(() => socket?.off(event, cb));
  }

  function joinMatch(team: 'CT' | 'T') {
    socket?.emit('join_match', { team });
  }

  function leaveMatch() {
    socket?.emit('disconnect');
  }

  function sendState(state: Partial<CSPlayerState>) {
    socket?.emit('player_state', state);
  }

  function shoot(data: { x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType; hitId?: string }) {
    socket?.emit('shoot', data);
  }

  function onMatchJoined(cb: (data: { playerId: string; match: any; players: CSPlayerState[] }) => void) { on('match_joined', cb); }
  function onPlayersUpdate(cb: (players: CSPlayerState[]) => void) { on('players_update', cb); }
  function onGameState(cb: (state: CSRoomState) => void) { on('game_state', cb); }
  function onPlayerDied(cb: (data: { victimId: string; killerId: string; headshot: boolean }) => void) { on('player_died', cb); }
  function onRoundEnd(cb: (data: { ctScore: number; tScore: number; round: number }) => void) { on('round_end', cb); }
  function onMatchEnd(cb: (data: { ctScore: number; tScore: number }) => void) { on('match_end', cb); }
  function onBullet(cb: (data: { id: string; ownerId: string; x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType }) => void) { on('bullet', cb); }
  function onKillfeed(cb: (data: { killer: string; victim: string; weapon: WeaponType; headshot: boolean }) => void) { on('killfeed', cb); }
  function onCountdown(cb: (data: { seconds: number }) => void) { on('countdown', cb); }
  function onError(cb: (msg: string) => void) { on('error_msg', cb); }

  function disconnect() {
    for (const cleanup of listeners) cleanup();
    listeners.length = 0;
    socket?.disconnect();
  }

  return {
    get socket() { return socket!; },
    connect, joinMatch, leaveMatch, sendState, shoot,
    onMatchJoined, onPlayersUpdate, onGameState,
    onPlayerDied, onRoundEnd, onMatchEnd, onBullet, onKillfeed,
    onCountdown, onError, disconnect,
  };
}
