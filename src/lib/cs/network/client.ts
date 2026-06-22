import { io, Socket } from 'socket.io-client';
import { CSPlayerState, CSRoomState, WeaponType } from '../types';

export interface CSNetworkClient {
  socket: Socket;
  connect(url: string, nickname: string): void;
  createRoom(team: 'CT' | 'T'): void;
  joinRoom(code: string, team: 'CT' | 'T'): void;
  leaveRoom(): void;
  sendState(state: Partial<CSPlayerState>): void;
  shoot(data: { x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType; hitId?: string }): void;
  onRoomCreated(cb: (data: { code: string }) => void): void;
  onRoomJoined(cb: (data: { room: CSRoomState; playerId: string }) => void): void;
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

  function createRoom(team: 'CT' | 'T') {
    socket?.emit('create_room', { team });
  }

  function joinRoom(code: string, team: 'CT' | 'T') {
    socket?.emit('join_room', { code, team });
  }

  function leaveRoom() {
    socket?.emit('leave_room');
  }

  function sendState(state: Partial<CSPlayerState>) {
    socket?.emit('player_state', state);
  }

  function shoot(data: { x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponType; hitId?: string }) {
    socket?.emit('shoot', data);
  }

  function onRoomCreated(cb: (data: { code: string }) => void) { on('room_created', cb); }
  function onRoomJoined(cb: (data: { room: CSRoomState; playerId: string }) => void) { on('room_joined', cb); }
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
    connect, createRoom, joinRoom, leaveRoom, sendState, shoot,
    onRoomCreated, onRoomJoined, onPlayersUpdate, onGameState,
    onPlayerDied, onRoundEnd, onMatchEnd, onBullet, onKillfeed,
    onCountdown, onError, disconnect,
  };
}
