export type Player = 'player1' | 'player2';

export type GameMode = 'ai' | 'pass_and_play';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type AISpeed = 'fast' | 'normal';

export type GameStatus = 'not_started' | 'in_progress' | 'game_over';

export interface Pit {
  id: number;
  row: number; // 0: P2 outer, 1: P2 inner, 2: P1 inner, 3: P1 outer (or 0: P2, 1: P1 for 2 rows)
  col: number; // 0 to columns - 1
  owner: Player;
  seeds: number;
  isInner: boolean;
}

export interface GameConfig {
  presetId?: string;
  rows: number; // standard 4 rows, or 2 rows
  columns: number; // 6, 8, 10, 12
  initialSeedsPerPit: number; // standard: 2, can be 1 or 3
  multipleSowing: boolean; // standard Ntxuva: true (re-sow on occupied pit)
  doubleCapture: boolean; // standard Ntxuva: true (takes inner + outer)
}

export interface RulePreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  config: GameConfig;
  badge?: string;
}

export interface MoveHistoryEntry {
  id: string;
  moveNumber: number;
  player: Player;
  startPitId: number;
  startRow: number;
  startCol: number;
  seedsDistributed: number;
  laps: number;
  captured: number;
  capturedColumns: number[];
  timestamp: number;
  description: string;
}

export type AnimationStepType =
  | 'pickup'
  | 'drop'
  | 'resow'
  | 'capture';

export interface AnimationStep {
  type: AnimationStepType;
  pitId: number;
  handSeeds: number;
  boardState: Pit[];
  capturedSeeds?: { player: Player; count: number; pits: number[] };
  description?: string;
}

export interface MoveExecutionResult {
  nextState: GameState;
  animationSteps: AnimationStep[];
  moveSummary: MoveHistoryEntry;
}

export interface WinConditionResult {
  gameOver: boolean;
  winner: Player | 'draw' | null;
  reason: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: 'victory' | 'mastery' | 'harvest' | 'streak';
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
  progress: number;
  maxProgress: number;
  rewardPoints: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  aiHardWins: number;
  totalSeedsCaptured: number;
  maxCapturedInSingleMove: number;
  maxLapsInSingleMove: number;
  winStreak: number;
  highestWinStreak: number;
  customRulesPlayed: number;
}

export interface GameState {
  board: Pit[];
  currentPlayer: Player;
  scores: {
    player1: number;
    player2: number;
  };
  capturedSeeds: {
    player1: number;
    player2: number;
  };
  gameMode: GameMode;
  difficulty: AIDifficulty;
  aiSpeed: AISpeed;
  gameStatus: GameStatus;
  moveHistory: MoveHistoryEntry[];
  selectedPitId: number | null;
  isAnimating: boolean;
  isAIThinking: boolean;
  winner: Player | 'draw' | null;
  winReason: string | null;
  config: GameConfig;
  turnCount: number;
}
