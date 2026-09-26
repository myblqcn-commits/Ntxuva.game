import { GameConfig, Pit, Player } from './types';
import { getOpposingPits } from './rules';

export interface CaptureResult {
  canCapture: boolean;
  capturedSeedsCount: number;
  capturedPitIds: number[];
  opposingCol: number;
}

/**
 * Checks whether the landing pit triggers a valid capture according to Ntxuva rules.
 */
export function canCapture(
  board: Pit[],
  landingPitId: number,
  player: Player,
  config: GameConfig
): boolean {
  const landingPit = board[landingPitId];
  if (!landingPit || landingPit.owner !== player || !landingPit.isInner) {
    return false;
  }

  const opposing = getOpposingPits(landingPitId, player, config);
  if (!opposing) return false;

  const innerOpponent = board[opposing.innerId];
  return innerOpponent && innerOpponent.seeds > 0;
}

/**
 * Calculates capture details without modifying the board.
 */
export function calculateCapture(
  board: Pit[],
  landingPitId: number,
  player: Player,
  config: GameConfig
): CaptureResult {
  if (!canCapture(board, landingPitId, player, config)) {
    return {
      canCapture: false,
      capturedSeedsCount: 0,
      capturedPitIds: [],
      opposingCol: -1,
    };
  }

  const landingPit = board[landingPitId];
  const opposing = getOpposingPits(landingPitId, player, config)!;
  const capturedPitIds: number[] = [opposing.innerId];
  let count = board[opposing.innerId].seeds;

  if (config.doubleCapture && board[opposing.outerId].seeds > 0) {
    capturedPitIds.push(opposing.outerId);
    count += board[opposing.outerId].seeds;
  }

  return {
    canCapture: true,
    capturedSeedsCount: count,
    capturedPitIds,
    opposingCol: landingPit.col,
  };
}

/**
 * Applies the capture to the board (pure function, returns cloned board and captured amount).
 */
export function applyCapture(
  board: Pit[],
  landingPitId: number,
  player: Player,
  config: GameConfig
): { newBoard: Pit[]; capturedCount: number; capturedPitIds: number[] } {
  const captureInfo = calculateCapture(board, landingPitId, player, config);
  if (!captureInfo.canCapture) {
    return { newBoard: board, capturedCount: 0, capturedPitIds: [] };
  }

  const newBoard = board.map((pit) => ({ ...pit }));
  for (const pitId of captureInfo.capturedPitIds) {
    newBoard[pitId].seeds = 0;
  }

  return {
    newBoard,
    capturedCount: captureInfo.capturedSeedsCount,
    capturedPitIds: captureInfo.capturedPitIds,
  };
}
