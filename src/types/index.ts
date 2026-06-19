export type GamePhase =
  | 'lobby'
  | 'writing'
  | 'drawing'
  | 'guessing'
  | 'results';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface Room {
  code: string;
  host_player_id: string;
  max_players: number;
  status: RoomStatus;
  current_round: number;
  total_rounds: number;
  current_phase: GamePhase;
  phase_end_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Player {
  id: string;
  room_code: string;
  name: string;
  is_host: boolean;
  color: string;
  is_connected: boolean;
  has_submitted: boolean;
  score: number;
  created_at: string;
}

export interface Phrase {
  id: string;
  room_code: string;
  round_number: number;
  author_id: string;
  text: string;
  is_initial: boolean;
  created_at: string;
}

export interface Drawing {
  id: string;
  room_code: string;
  round_number: number;
  phrase_id: string;
  drawer_id: string;
  image_url: string;
  created_at: string;
}

export interface Guess {
  id: string;
  room_code: string;
  round_number: number;
  drawing_id: string;
  guesser_id: string;
  text: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  room_code: string;
  round_number: number;
  phase: 'drawing' | 'guessing';
  player_id: string;
  source_id: string;
  source_type: 'phrase' | 'drawing';
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_code: string;
  player_id: string;
  player_name: string;
  message: string;
  created_at: string;
}

export interface GameState {
  room: Room;
  players: Player[];
  myPlayer: Player | null;
  currentAssignment: Assignment | null;
  assignedPhrase: Phrase | null;
  assignedDrawing: Drawing | null;
}

export interface ChainLink {
  type: 'phrase' | 'drawing' | 'guess';
  playerName: string;
  content: string;
}

export interface PlayerChain {
  playerName: string;
  playerColor: string;
  originalPhrase: string;
  links: ChainLink[];
}
