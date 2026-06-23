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
  onHitEffect(cb: (data: { x: number; y: number; z: number; headshot: boolean; damage: number }) => void): void;
  onError(cb: (msg: string) => void): void;
  disconnect(): void;
}

export function createCSNetworkClient(): CSNetworkClient {
  let socket: Socket;
  let pendingTeam: 'CT' | 'T' | null = null;
  const pendingListeners: Array<{ event: string; cb: (...args: any[]) => void }> = [];

  function connect(url: string, nickname: string) {
    socket = io(url + '/cs', {
      transports: ['websocket', 'polling'],
      auth: { nickname },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    socket.on('connect', () => {
      console.log('CS connected:', socket.id);
      if (pendingTeam) {
        console.log('CS: re-sending join_match on reconnect:', pendingTeam);
        setTimeout(() => socket?.emit('join_match', { team: pendingTeam }), 200);
      }
    });
    socket.on('disconnect', (reason) => console.log('CS disconnected:', reason));
    socket.on('connect_error', (err) => console.error('CS connect_error:', err.message));

    for (const { event, cb } of pendingListeners) {
      socket.on(event, cb);
    }
    pendingListeners.length = 0;
  }

  function on(event: string, cb: (...args: any[]) => void) {
    if (socket) {
      socket.on(event, cb);
    } else {
      pendingListeners.push({ event, cb });
    }
  }

  function joinMatch(team: 'CT' | 'T') {
    pendingTeam = team;
    socket?.emit('join_match', { team });
  }

  function leaveMatch() {
    pendingTeam = null;
    socket?.emit('leave_match');
    socket?.disconnect();
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
  function onHitEffect(cb: (data: { x: number; y: number; z: number; headshot: boolean; damage: number }) => void) { on('hit_effect', cb); }
  function onError(cb: (msg: string) => void) { on('error_msg', cb); }

  function disconnect() {
    pendingTeam = null;
    socket?.disconnect();
  }

  return {
    get socket() { return socket!; },
    connect, joinMatch, leaveMatch, sendState, shoot,
    onMatchJoined, onPlayersUpdate, onGameState,
    onPlayerDied, onRoundEnd, onMatchEnd, onBullet, onKillfeed,
    onCountdown, onHitEffect, onError, disconnect,
  };
}
