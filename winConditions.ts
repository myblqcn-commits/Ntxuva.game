import { GameState, Pit, Player, WinConditionResult } from './types';

/**
 * Calculates total seeds remaining on a player's territory.
 */
export function getPlayerTotalSeeds(board: Pit[], player: Player): number {
  return board
    .filter((pit) => pit.owner === player)
    .reduce((sum, pit) => sum + pit.seeds, 0);
}

/**
 * Checks if the game has ended and returns the winner and detailed reason.
 */
export function checkGameOver(
  board: Pit[],
  currentPlayer: Player,
  legalMovesCount: number
): WinConditionResult {
  const p1Seeds = getPlayerTotalSeeds(board, 'player1');
  const p2Seeds = getPlayerTotalSeeds(board, 'player2');

  // Condition 1: Player's territory completely cleared
  if (p2Seeds === 0) {
    return {
      gameOver: true,
      winner: 'player1',
      reason: 'Limpeza do Território: Todas as sementes do Jogador 2 foram capturadas.',
    };
  }

  if (p1Seeds === 0) {
    return {
      gameOver: true,
      winner: 'player2',
      reason: 'Limpeza do Território: Todas as sementes do Jogador 1 foram capturadas.',
    };
  }

  // Condition 2: Current player has no legal moves (only 0 or 1 seed per pit)
  if (legalMovesCount === 0) {
    const winner: Player = currentPlayer === 'player1' ? 'player2' : 'player1';
    const loserName = currentPlayer === 'player1' ? 'Jogador 1' : 'Jogador 2';
    return {
      gameOver: true,
      winner,
      reason: `Imobilização Total: ${loserName} não possui cavas com 2 ou mais sementes para semear.`,
    };
  }

  // Condition 3: Total seeds on either side is 1 (cannot initiate valid sowing anymore)
  if (p1Seeds <= 1) {
    return {
      gameOver: true,
      winner: 'player2',
      reason: 'Imobilização: Jogador 1 ficou com apenas 1 semente e não pode iniciar semeadura.',
    };
  }

  if (p2Seeds <= 1) {
    return {
      gameOver: true,
      winner: 'player1',
      reason: 'Imobilização: Jogador 2 ficou com apenas 1 semente e não pode iniciar semeadura.',
    };
  }

  return {
    gameOver: false,
    winner: null,
    reason: '',
  };
}
