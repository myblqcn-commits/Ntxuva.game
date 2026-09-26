import { GameConfig, Pit, Player, RulePreset } from './types';

export const CONFIG_STORAGE_KEY = 'ntxuva_rules_config_v1';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  presetId: 'ntxuva_standard',
  rows: 4,
  columns: 8,
  initialSeedsPerPit: 2,
  multipleSowing: true,
  doubleCapture: true,
};

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'ntxuva_standard',
    name: 'Ntxuva Clássico Moçambicano',
    shortName: 'Clássico 4×8',
    description: 'A regra tradicional mais jogada em Moçambique: 4 fileiras de 8 cavas, 2 sementes por cava, semeadura contínua e captura dupla.',
    badge: 'Oficial',
    config: {
      presetId: 'ntxuva_standard',
      rows: 4,
      columns: 8,
      initialSeedsPerPit: 2,
      multipleSowing: true,
      doubleCapture: true,
    },
  },
  {
    id: 'ntxuva_masters',
    name: 'Conselho dos Mestres (4×10)',
    shortName: 'Mestres 4×10',
    description: 'Tabuleiro expandido com 40 cavas no total (80 sementes). Exige cálculo profundo e visão panorâmica de longo alcance.',
    badge: 'Avançado',
    config: {
      presetId: 'ntxuva_masters',
      rows: 4,
      columns: 10,
      initialSeedsPerPit: 2,
      multipleSowing: true,
      doubleCapture: true,
    },
  },
  {
    id: 'ntxuva_fast',
    name: 'Duelo Rápido (4×6)',
    shortName: 'Rápido 4×6',
    description: 'Tabuleiro compacto de 24 cavas. Partidas dinâmicas e frenéticas ideais para duelos ágeis no smartphone.',
    badge: 'Ágil',
    config: {
      presetId: 'ntxuva_fast',
      rows: 4,
      columns: 6,
      initialSeedsPerPit: 2,
      multipleSowing: true,
      doubleCapture: true,
    },
  },
  {
    id: 'ntxuva_heavy',
    name: 'Guerra de Tinsongo (3 Sementes)',
    shortName: 'Guerra 3 Sementes',
    description: 'Inicia com 3 sementes por cava (96 sementes ao todo). Produz relançamentos monumentais com grande volume de sementes.',
    badge: 'Intenso',
    config: {
      presetId: 'ntxuva_heavy',
      rows: 4,
      columns: 8,
      initialSeedsPerPit: 3,
      multipleSowing: true,
      doubleCapture: true,
    },
  },
  {
    id: 'ntxuva_single_capture',
    name: 'Captura Simples (Apenas Fila Interior)',
    shortName: 'Captura Simples',
    description: 'Semelhante a variantes regionais onde o ataque colhe apenas a cava interior adversária, sem captura na fileira exterior.',
    badge: 'Táctico',
    config: {
      presetId: 'ntxuva_single_capture',
      rows: 4,
      columns: 8,
      initialSeedsPerPit: 2,
      multipleSowing: true,
      doubleCapture: false,
    },
  },
  {
    id: 'ntxuva_no_resow',
    name: 'Semeadura Simples (Sem Relançamento)',
    shortName: 'Sem Relançamento',
    description: 'Cada lance realiza apenas 1 volta; não há recolha nem semeadura múltipla quando a última semente cai em cava ocupada.',
    badge: 'Didático',
    config: {
      presetId: 'ntxuva_no_resow',
      rows: 4,
      columns: 8,
      initialSeedsPerPit: 2,
      multipleSowing: false,
      doubleCapture: true,
    },
  },
];

/**
 * Loads saved rule configuration from localStorage, or returns default.
 */
export function loadSavedConfig(): GameConfig {
  if (typeof window === 'undefined') return DEFAULT_GAME_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_CONFIG;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.columns === 'number' && typeof parsed.rows === 'number') {
      return {
        presetId: parsed.presetId || 'custom',
        rows: parsed.rows === 2 ? 2 : 4,
        columns: Math.min(Math.max(parsed.columns, 6), 12),
        initialSeedsPerPit: Math.min(Math.max(parsed.initialSeedsPerPit || 2, 1), 4),
        multipleSowing: parsed.multipleSowing ?? true,
        doubleCapture: parsed.doubleCapture ?? true,
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_GAME_CONFIG;
}

/**
 * Saves rule configuration to localStorage.
 */
export function saveConfig(config: GameConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

/**
 * Creates the initial board based on the given configuration.
 */
export function createInitialBoard(config: GameConfig = DEFAULT_GAME_CONFIG): Pit[] {
  const board: Pit[] = [];
  const { rows, columns, initialSeedsPerPit } = config;

  if (rows === 2) {
    // 2 rows variant: Row 0 is Player 2, Row 1 is Player 1
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < columns; c++) {
        const id = r * columns + c;
        const owner: Player = r === 0 ? 'player2' : 'player1';
        board.push({
          id,
          row: r,
          col: c,
          owner,
          seeds: initialSeedsPerPit,
          isInner: true,
        });
      }
    }
    return board;
  }

  // 4 rows standard Ntxuva:
  // Row 0: Player 2 Outer
  // Row 1: Player 2 Inner
  // Row 2: Player 1 Inner
  // Row 3: Player 1 Outer
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < columns; c++) {
      const id = r * columns + c;
      const owner: Player = r < 2 ? 'player2' : 'player1';
      const isInner = r === 1 || r === 2;

      board.push({
        id,
        row: r,
        col: c,
        owner,
        seeds: initialSeedsPerPit,
        isInner,
      });
    }
  }

  return board;
}

/**
 * Returns the sequential array of pit IDs for a player's circuit.
 */
export function getPlayerPath(player: Player, config: GameConfig = DEFAULT_GAME_CONFIG): number[] {
  const { rows, columns } = config;
  const path: number[] = [];

  if (rows === 2) {
    // 2-row closed loop for player
    if (player === 'player1') {
      for (let c = 0; c < columns; c++) {
        path.push(1 * columns + c);
      }
    } else {
      for (let c = columns - 1; c >= 0; c--) {
        path.push(0 * columns + c);
      }
    }
    return path;
  }

  // 4 rows standard:
  if (player === 'player1') {
    // Outer row 3, left to right
    for (let c = 0; c < columns; c++) {
      path.push(3 * columns + c);
    }
    // Inner row 2, right to left
    for (let c = columns - 1; c >= 0; c--) {
      path.push(2 * columns + c);
    }
  } else {
    // Outer row 0, right to left
    for (let c = columns - 1; c >= 0; c--) {
      path.push(0 * columns + c);
    }
    // Inner row 1, left to right
    for (let c = 0; c < columns; c++) {
      path.push(1 * columns + c);
    }
  }

  return path;
}

/**
 * Returns the next pit ID along the player's circuit.
 */
export function getNextPit(
  currentPitId: number,
  player: Player,
  config: GameConfig = DEFAULT_GAME_CONFIG
): number {
  const path = getPlayerPath(player, config);
  const currentIndex = path.indexOf(currentPitId);
  if (currentIndex === -1) {
    throw new Error(`Pit ${currentPitId} does not belong to ${player}'s circuit`);
  }
  const nextIndex = (currentIndex + 1) % path.length;
  return path[nextIndex];
}

/**
 * Given a pit in the player's inner row, returns the opposing pits eligible for capture:
 */
export function getOpposingPits(
  pitId: number,
  player: Player,
  config: GameConfig = DEFAULT_GAME_CONFIG
): { innerId: number; outerId: number } | null {
  const { rows, columns } = config;
  const row = Math.floor(pitId / columns);
  const col = pitId % columns;

  if (rows === 2) {
    if (player === 'player1' && row === 1) {
      return {
        innerId: 0 * columns + col,
        outerId: 0 * columns + col,
      };
    }
    if (player === 'player2' && row === 0) {
      return {
        innerId: 1 * columns + col,
        outerId: 1 * columns + col,
      };
    }
    return null;
  }

  // 4 rows standard:
  // Player 1's inner row is Row 2. Opponent inner is Row 1, outer is Row 0.
  if (player === 'player1' && row === 2) {
    return {
      innerId: 1 * columns + col,
      outerId: 0 * columns + col,
    };
  }

  // Player 2's inner row is Row 1. Opponent inner is Row 2, outer is Row 3.
  if (player === 'player2' && row === 1) {
    return {
      innerId: 2 * columns + col,
      outerId: 3 * columns + col,
    };
  }

  return null;
}
