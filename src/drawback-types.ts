import type { Color, Game, Kind, Move } from './game';

export interface RuleParameters {
  square: number;
  move: number;
  color: number;
  rank: number;
  parity: number;
  piece: 'n' | 'b' | 'r';
}

export interface PieceMemory {
  id: number;
  fatigued?: boolean;
  penitent?: boolean;
  frozen?: boolean;
  queenMode?: 'r' | 'b';
}

export interface RuleEvent {
  color: Color;
  kind: Kind;
  pieceId: number;
  from: number;
  to: number;
  capture?: number;
  captured?: Kind;
  promotion?: Move['promotion'];
  castle?: Move['castle'];
  gaveCheck?: boolean;
}

export interface PlayerMemory {
  checks: number;
  kissed: Kind[];
  studied: Kind[];
  studying: Kind[];
  central: number[];
  shape: Kind;
  achieved: string[];
}

export interface RuleState {
  seed: number;
  params: Record<Color, RuleParameters>;
  pieces: Record<number, PieceMemory>;
  players: Record<Color, PlayerMemory>;
  events: RuleEvent[];
  engineBans: Record<number, string>;
}

export interface RuleContext {
  g: Game;
  color: Color;
  moves: Move[];
  state: RuleState;
  params: RuleParameters;
  own: RuleEvent[];
  enemy: RuleEvent[];
  last: RuleEvent | undefined;
  lastEnemy: RuleEvent | undefined;
  after(move: Move): Game;
}
