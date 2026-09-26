import { AnimationStep, GameConfig, MoveExecutionResult, MoveHistoryEntry, Pit, Player } from './types';
import { getNextPit } from './rules';
import { applyCapture, calculateCapture } from './capture';
import { checkGameOver, getPlayerTotalSeeds } from './winConditions';

/**
 * Returns all legal starting pit IDs for the given player.
 * By default in Ntxuva, a player can only pick a pit with 2 or more seeds.
 */
export function getLegalMoves(
  board: Pit[],
  player: Player,
  config: GameConfig
): number[] {
  const minSeeds = config.initialSeedsPerPit === 1 ? 1 : 2;
  const eligiblePits = board.filter(
    (pit) => pit.owner === player && pit.seeds >= minSeeds
  );

  return eligiblePits.map((pit) => pit.id);
}

/**
 * Checks if a specific pit is a legal starting move.
 */
export function isValidMove(
  board: Pit[],
  pitId: number,
  player: Player,
  config: GameConfig
): boolean {
  const legalMoves = getLegalMoves(board, player, config);
  return legalMoves.includes(pitId);
}

export interface SimulationResult {
  newBoard: Pit[];
  totalCaptured: number;
  capturedPitIds: number[];
  capturedColumns: number[];
  laps: number;
  totalSeedsDistributed: number;
  finalPitId: number;
  animationSteps: AnimationStep[];
}

/**
 * Executes a move in a pure function, producing the next board state,
 * detailed statistics, and a sequence of animation snapshots for UI playback.
 */
export function executeMove(
  board: Pit[],
  startPitId: number,
  player: Player,
  config: GameConfig
): SimulationResult {
  if (!isValidMove(board, startPitId, player, config)) {
    throw new Error(`Cava inválida ${startPitId} para o jogador ${player}`);
  }

  const currentBoard: Pit[] = board.map((pit) => ({ ...pit }));
  const animationSteps: AnimationStep[] = [];

  let seedsInHand = currentBoard[startPitId].seeds;
  currentBoard[startPitId].seeds = 0;

  let totalSeedsDistributed = 0;
  let laps = 1;
  let currentPitId = startPitId;
  let totalCaptured = 0;
  const capturedPitIds: number[] = [];
  const capturedColumns: number[] = [];

  // Initial pickup step
  animationSteps.push({
    type: 'pickup',
    pitId: startPitId,
    handSeeds: seedsInHand,
    boardState: currentBoard.map((p) => ({ ...p })),
    description: `Colheu ${seedsInHand} sementes da cava #${startPitId}`,
  });

  const MAX_STEPS = 500; // Protection against infinite cycles
  let stepCount = 0;

  while (seedsInHand > 0 && stepCount < MAX_STEPS) {
    stepCount++;
    currentPitId = getNextPit(currentPitId, player, config);
    currentBoard[currentPitId].seeds += 1;
    seedsInHand--;
    totalSeedsDistributed++;

    animationSteps.push({
      type: 'drop',
      pitId: currentPitId,
      handSeeds: seedsInHand,
      boardState: currentBoard.map((p) => ({ ...p })),
    });

    // Check if the current lap's hand is exhausted
    if (seedsInHand === 0) {
      // 1. Check for capture (landing in inner row facing opponent seeds)
      const captureInfo = calculateCapture(currentBoard, currentPitId, player, config);

      if (captureInfo.canCapture) {
        totalCaptured += captureInfo.capturedSeedsCount;
        capturedPitIds.push(...captureInfo.capturedPitIds);
        if (!capturedColumns.includes(captureInfo.opposingCol)) {
          capturedColumns.push(captureInfo.opposingCol);
        }

        // Apply capture to board
        for (const cPitId of captureInfo.capturedPitIds) {
          currentBoard[cPitId].seeds = 0;
        }

        animationSteps.push({
          type: 'capture',
          pitId: currentPitId,
          handSeeds: 0,
          boardState: currentBoard.map((p) => ({ ...p })),
          capturedSeeds: {
            player,
            count: captureInfo.capturedSeedsCount,
            pits: captureInfo.capturedPitIds,
          },
          description: `Capturou ${captureInfo.capturedSeedsCount} sementes na coluna ${captureInfo.opposingCol + 1}!`,
        });

        // In standard Ntxuva, a successful capture concludes the turn.
        break;
      }

      // 2. Multiple sowing / Re-sow check:
      // If the pit already contained seeds before this last seed was dropped
      // (meaning currentBoard[currentPitId].seeds > 1) and multipleSowing is active:
      if (config.multipleSowing && currentBoard[currentPitId].seeds > 1) {
        seedsInHand = currentBoard[currentPitId].seeds;
        currentBoard[currentPitId].seeds = 0;
        laps++;

        animationSteps.push({
          type: 'resow',
          pitId: currentPitId,
          handSeeds: seedsInHand,
          boardState: currentBoard.map((p) => ({ ...p })),
          description: `Relançamento: colheu ${seedsInHand} sementes da cava #${currentPitId}`,
        });
      }
      // If currentBoard[currentPitId].seeds === 1, the pit was empty before this drop. Turn ends naturally.
    }
  }

  return {
    newBoard: currentBoard,
    totalCaptured,
    capturedPitIds,
    capturedColumns,
    laps,
    totalSeedsDistributed,
    finalPitId: currentPitId,
    animationSteps,
  };
}
