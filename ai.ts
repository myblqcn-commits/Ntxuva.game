import { AIDifficulty, GameConfig, Pit, Player } from './types';
import { executeMove, getLegalMoves } from './moves';
import { getPlayerTotalSeeds } from './winConditions';

export interface AIMoveEvaluation {
  pitId: number;
  score: number;
  capturedSeeds: number;
}

/**
 * Verifica se uma cava pertence às cavas superiores (território do Jogador 2).
 */
export function isUpperPit(pit: Pit, config: GameConfig): boolean {
  if (config.rows === 2) {
    return pit.row === 0 && pit.owner === 'player2';
  }
  return (pit.row === 0 || pit.row === 1) && pit.owner === 'player2';
}

/**
 * Retorna todas as jogadas válidas do Jogador 2 (IA) exclusivamente nas cavas superiores.
 * Uma cava superior é válida se pertencer ao Jogador 2 e tiver sementes suficientes (>= minSeeds).
 */
export function getAIUpperLegalMoves(
  board: Pit[],
  config: GameConfig
): number[] {
  const minSeeds = config.initialSeedsPerPit === 1 ? 1 : 2;
  return board
    .filter(
      (pit) =>
        isUpperPit(pit, config) &&
        pit.owner === 'player2' &&
        pit.seeds >= minSeeds
    )
    .map((pit) => pit.id);
}

/**
 * Calcula uma jogada válida nas cavas superiores para o Jogador 2 (IA).
 * Avalia as opções disponíveis conforme o nível de dificuldade selecionado.
 * Retorna o ID da cava superior escolhida, ou null se não houver jogadas válidas.
 */
export function calculateAIMove(
  board: Pit[],
  difficulty: AIDifficulty,
  config: GameConfig
): number | null {
  let validMoves = getAIUpperLegalMoves(board, config);

  // Se não houver jogadas válidas estritamente nas cavas superiores, expande para todas as cavas legais do Jogador 2
  if (validMoves.length === 0) {
    validMoves = getLegalMoves(board, 'player2', config);
  }

  // Se ainda estiver vazio (ex: apenas cavas com 1 semente no final do jogo), procura qualquer cava com sementes
  if (validMoves.length === 0) {
    const singletons = board
      .filter((pit) => pit.owner === 'player2' && pit.seeds >= 1)
      .map((pit) => pit.id);
    if (singletons.length > 0) {
      return singletons[0];
    }
    return null;
  }

  if (validMoves.length === 1) {
    return validMoves[0];
  }

  switch (difficulty) {
    case 'easy':
      return getEasyMove(validMoves, board, config);
    case 'medium':
      return getMediumMove(validMoves, board, config);
    case 'hard':
      return getHardMove(validMoves, board, config);
    default:
      return validMoves[0];
  }
}

/**
 * Alias de calculateAIMove para compatibilidade.
 */
export function getAIMove(
  board: Pit[],
  difficulty: AIDifficulty,
  config: GameConfig
): number | null {
  return calculateAIMove(board, difficulty, config);
}

/**
 * Easy: 70% random, 30% picks any move that captures seeds.
 */
function getEasyMove(
  legalMoves: number[],
  board: Pit[],
  config: GameConfig
): number {
  if (Math.random() < 0.7) {
    const randomIndex = Math.floor(Math.random() * legalMoves.length);
    return legalMoves[randomIndex];
  }

  // Look for any capture
  for (const pitId of legalMoves) {
    try {
      const sim = executeMove(board, pitId, 'player2', config);
      if (sim.totalCaptured > 0) {
        return pitId;
      }
    } catch {
      // ignore
    }
  }

  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

/**
 * Medium: 1-ply greedy evaluation balancing capture, mobilization, and inner row defense.
 */
function getMediumMove(
  legalMoves: number[],
  board: Pit[],
  config: GameConfig
): number {
  let bestScore = -Infinity;
  let bestMoves: number[] = [];

  for (const pitId of legalMoves) {
    try {
      const sim = executeMove(board, pitId, 'player2', config);
      let score = 0;

      // Direct capture value
      score += sim.totalCaptured * 20;

      // Reward multi-lap momentum
      score += sim.laps * 3;

      // Total seeds remaining on AI territory
      const aiRemaining = getPlayerTotalSeeds(sim.newBoard, 'player2');
      score += aiRemaining * 2;

      // Slight bonus if ending safely (not leaving inner row overloaded facing opponent)
      const finalPit = sim.newBoard[sim.finalPitId];
      if (finalPit && finalPit.isInner && finalPit.seeds > 4) {
        score -= 5; // Risk of being counter-captured
      }

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [pitId];
      } else if (score === bestScore) {
        bestMoves.push(pitId);
      }
    } catch {
      // ignore
    }
  }

  if (bestMoves.length === 0) return legalMoves[0];
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * Hard: 2-ply lookahead simulating opponent counter-attacks and maximizing board control.
 */
function getHardMove(
  legalMoves: number[],
  board: Pit[],
  config: GameConfig
): number {
  let bestScore = -Infinity;
  let bestMoves: number[] = [];

  for (const pitId of legalMoves) {
    try {
      const sim = executeMove(board, pitId, 'player2', config);
      let score = 0;

      // 1. Direct capture reward
      score += sim.totalCaptured * 30;

      // 2. Material balance after the move
      const aiSeeds = getPlayerTotalSeeds(sim.newBoard, 'player2');
      const humanSeeds = getPlayerTotalSeeds(sim.newBoard, 'player1');
      score += (aiSeeds - humanSeeds) * 4;

      // 3. Lookahead: How much can the Human (Player 1) capture on their immediate response?
      const humanResponses = getLegalMoves(sim.newBoard, 'player1', config);
      let maxHumanCounterCapture = 0;

      for (const hMove of humanResponses) {
        try {
          const counterSim = executeMove(sim.newBoard, hMove, 'player1', config);
          if (counterSim.totalCaptured > maxHumanCounterCapture) {
            maxHumanCounterCapture = counterSim.totalCaptured;
          }
        } catch {
          // ignore
        }
      }

      // Heavily penalize leaving AI exposed to brutal counter-captures
      score -= maxHumanCounterCapture * 35;

      // 4. Opponent mobility restriction (imobilização pressure)
      if (humanResponses.length <= 2) {
        score += (4 - humanResponses.length) * 15;
      }

      // 5. Momentum bonus
      score += sim.laps * 4;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [pitId];
      } else if (score === bestScore) {
        bestMoves.push(pitId);
      }
    } catch {
      // ignore
    }
  }

  if (bestMoves.length === 0) return legalMoves[0];
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * Calcula a jogada recomendada (Dica) para o jogador atual utilizando a lógica da IA no modo 'Fácil'.
 * Avalia as jogadas válidas do jogador priorizando capturas imediatas e amplitude de semeadura.
 */
export function calculateHintMove(
  board: Pit[],
  player: Player,
  config: GameConfig
): number | null {
  const legalMoves = getLegalMoves(board, player, config);
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return legalMoves[0];

  // Lógica da IA 'Fácil':
  // 1. Procura jogadas que realizam capturas
  const captureMoves: { pitId: number; captured: number }[] = [];
  const standardMoves: number[] = [];

  for (const pitId of legalMoves) {
    try {
      const sim = executeMove(board, pitId, player, config);
      if (sim.totalCaptured > 0) {
        captureMoves.push({ pitId, captured: sim.totalCaptured });
      } else {
        standardMoves.push(pitId);
      }
    } catch {
      standardMoves.push(pitId);
    }
  }

  // Se houver jogadas com captura, recomenda a que captura mais sementes
  if (captureMoves.length > 0) {
    captureMoves.sort((a, b) => b.captured - a.captured);
    return captureMoves[0].pitId;
  }

  // Se não houver capturas, prioriza cavas com maior número de sementes (maior mobilidade)
  standardMoves.sort((a, b) => {
    const pitA = board.find((p) => p.id === a);
    const pitB = board.find((p) => p.id === b);
    return (pitB?.seeds || 0) - (pitA?.seeds || 0);
  });

  return standardMoves[0] ?? legalMoves[0];
}
