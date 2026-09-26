import {
  AIDifficulty,
  AISpeed,
  AnimationStep,
  GameConfig,
  GameMode,
  GameState,
  MoveHistoryEntry,
  Player,
} from './types';
import { createInitialBoard, DEFAULT_GAME_CONFIG } from './rules';
import { executeMove, getLegalMoves } from './moves';
import { checkGameOver, getPlayerTotalSeeds } from './winConditions';

/**
 * Initializes a fresh GameState.
 */
export function initGameState(
  gameMode: GameMode = 'ai',
  difficulty: AIDifficulty = 'medium',
  config: GameConfig = DEFAULT_GAME_CONFIG,
  aiSpeed: AISpeed = 'normal'
): GameState {
  const board = createInitialBoard(config);
  const p1Seeds = getPlayerTotalSeeds(board, 'player1');
  const p2Seeds = getPlayerTotalSeeds(board, 'player2');

  return {
    board,
    currentPlayer: 'player1',
    scores: {
      player1: p1Seeds,
      player2: p2Seeds,
    },
    capturedSeeds: {
      player1: 0,
      player2: 0,
    },
    gameMode,
    difficulty,
    aiSpeed,
    gameStatus: 'in_progress',
    moveHistory: [],
    selectedPitId: null,
    isAnimating: false,
    isAIThinking: false,
    winner: null,
    winReason: null,
    config,
    turnCount: 1,
  };
}

export interface PlayMoveOutcome {
  nextState: GameState;
  animationSteps: AnimationStep[];
  historyEntry: MoveHistoryEntry;
}

/**
 * Executes a player turn, updates scores, checks win conditions,
 * and toggles currentPlayer if game is not over.
 */
export function playMove(
  state: GameState,
  startPitId: number
): PlayMoveOutcome {
  const { board, currentPlayer, config, turnCount, capturedSeeds } = state;
  const pit = board[startPitId];

  if (!pit || pit.owner !== currentPlayer) {
    throw new Error('Cava selecionada não pertence ao jogador atual.');
  }

  // Execute simulation & animations
  const sim = executeMove(board, startPitId, currentPlayer, config);

  // New captured count
  const newCaptured = {
    ...capturedSeeds,
    [currentPlayer]: capturedSeeds[currentPlayer] + sim.totalCaptured,
  };

  // Update total seeds
  const p1Total = getPlayerTotalSeeds(sim.newBoard, 'player1');
  const p2Total = getPlayerTotalSeeds(sim.newBoard, 'player2');

  const historyEntry: MoveHistoryEntry = {
    id: `move-${turnCount}-${Date.now()}`,
    moveNumber: turnCount,
    player: currentPlayer,
    startPitId,
    startRow: pit.row,
    startCol: pit.col,
    seedsDistributed: sim.totalSeedsDistributed,
    laps: sim.laps,
    captured: sim.totalCaptured,
    capturedColumns: sim.capturedColumns,
    timestamp: Date.now(),
    description:
      sim.totalCaptured > 0
        ? `${currentPlayer === 'player1' ? 'Jogador 1' : 'Jogador 2'} colheu cava (${pit.row}, ${pit.col}) e capturou ${sim.totalCaptured} sementes!`
        : `${currentPlayer === 'player1' ? 'Jogador 1' : 'Jogador 2'} semeou ${sim.totalSeedsDistributed} sementes em ${sim.laps} ${sim.laps === 1 ? 'volta' : 'voltas'}.`,
  };

  // Check next player and game over
  const nextPlayer: Player = currentPlayer === 'player1' ? 'player2' : 'player1';
  const nextLegalMoves = getLegalMoves(sim.newBoard, nextPlayer, config);
  const winCheck = checkGameOver(sim.newBoard, nextPlayer, nextLegalMoves.length);

  const nextState: GameState = {
    ...state,
    board: sim.newBoard,
    currentPlayer: winCheck.gameOver ? currentPlayer : nextPlayer,
    scores: {
      player1: p1Total,
      player2: p2Total,
    },
    capturedSeeds: newCaptured,
    moveHistory: [historyEntry, ...state.moveHistory],
    gameStatus: winCheck.gameOver ? 'game_over' : 'in_progress',
    winner: winCheck.winner,
    winReason: winCheck.reason,
    turnCount: turnCount + 1,
    selectedPitId: null,
    isAnimating: false,
    isAIThinking: false,
  };

  return {
    nextState,
    animationSteps: sim.animationSteps,
    historyEntry,
  };
}
