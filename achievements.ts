import { Achievement, AIDifficulty, AISpeed, GameConfig, GameMode, Player, PlayerStats } from './types';

const STATS_STORAGE_KEY = 'ntxuva_player_stats_v1';
const ACHIEVEMENTS_STORAGE_KEY = 'ntxuva_achievements_v1';

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_sowing',
    title: 'Primeira Semeadura',
    description: 'Concluir a sua primeira partida de Ntxuva.',
    category: 'mastery',
    icon: 'sprout',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 50,
  },
  {
    id: 'beat_ai_hard',
    title: 'Vitória sobre o Mestre',
    description: 'Vencer uma partida contra o Mestre Nyami na dificuldade Difícil.',
    category: 'victory',
    icon: 'trophy',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 200,
  },
  {
    id: 'master_harvest',
    title: 'Grande Colheita',
    description: 'Capturar 10 ou mais sementes num único lance fulminante.',
    category: 'harvest',
    icon: 'swords',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 100,
  },
  {
    id: 'whirlwind_laps',
    title: 'Dança dos Ventos',
    description: 'Efetuar uma semeadura com 3 ou mais voltas (relançamentos) consecutivas.',
    category: 'mastery',
    icon: 'wind',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 100,
  },
  {
    id: 'win_streak_3',
    title: 'Sequência Dourada',
    description: 'Alcançar uma sequência de 3 vitórias consecutivas contra a IA.',
    category: 'streak',
    icon: 'flame',
    unlocked: false,
    progress: 0,
    maxProgress: 3,
    rewardPoints: 150,
  },
  {
    id: 'total_captures_50',
    title: 'Senhor das Conchas',
    description: 'Acumular 50 sementes capturadas no total da sua carreira.',
    category: 'harvest',
    icon: 'sparkles',
    unlocked: false,
    progress: 0,
    maxProgress: 50,
    rewardPoints: 150,
  },
  {
    id: 'veteran_5',
    title: 'Guardião da Tradição',
    description: 'Completar 5 partidas no tabuleiro de Ntxuva.',
    category: 'mastery',
    icon: 'shield',
    unlocked: false,
    progress: 0,
    maxProgress: 5,
    rewardPoints: 100,
  },
  {
    id: 'clean_sweep',
    title: 'Imobilização Magistral',
    description: 'Vencer o adversário por Imobilização Total das suas cavas.',
    category: 'victory',
    icon: 'lock',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 120,
  },
  {
    id: 'custom_explorer',
    title: 'Explorador de Regras',
    description: 'Jogar uma partida com um conjunto de regras personalizado ou alternativo.',
    category: 'mastery',
    icon: 'compass',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 80,
  },
  {
    id: 'speed_demon',
    title: 'Mente Relâmpago',
    description: 'Vencer uma partida utilizando a IA com Resposta Rápida ativada.',
    category: 'victory',
    icon: 'zap',
    unlocked: false,
    progress: 0,
    maxProgress: 1,
    rewardPoints: 100,
  },
];

export const INITIAL_PLAYER_STATS: PlayerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  aiHardWins: 0,
  totalSeedsCaptured: 0,
  maxCapturedInSingleMove: 0,
  maxLapsInSingleMove: 0,
  winStreak: 0,
  highestWinStreak: 0,
  customRulesPlayed: 0,
};

export function loadPlayerStats(): PlayerStats {
  if (typeof window === 'undefined') return INITIAL_PLAYER_STATS;
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return INITIAL_PLAYER_STATS;
    return { ...INITIAL_PLAYER_STATS, ...JSON.parse(raw) };
  } catch {
    return INITIAL_PLAYER_STATS;
  }
}

export function savePlayerStats(stats: PlayerStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export function loadAchievements(): Achievement[] {
  if (typeof window === 'undefined') return INITIAL_ACHIEVEMENTS;
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return INITIAL_ACHIEVEMENTS;
    const saved: Record<string, Partial<Achievement>> = JSON.parse(raw);

    return INITIAL_ACHIEVEMENTS.map((ach) => {
      const s = saved[ach.id];
      if (s) {
        return {
          ...ach,
          unlocked: s.unlocked ?? ach.unlocked,
          unlockedAt: s.unlockedAt ?? ach.unlockedAt,
          progress: Math.min(s.progress ?? ach.progress, ach.maxProgress),
        };
      }
      return ach;
    });
  } catch {
    return INITIAL_ACHIEVEMENTS;
  }
}

export function saveAchievements(achievements: Achievement[]): void {
  if (typeof window === 'undefined') return;
  try {
    const map: Record<string, Partial<Achievement>> = {};
    for (const ach of achievements) {
      map[ach.id] = {
        unlocked: ach.unlocked,
        unlockedAt: ach.unlockedAt,
        progress: ach.progress,
      };
    }
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export interface AchievementCheckResult {
  updatedStats: PlayerStats;
  updatedAchievements: Achievement[];
  newlyUnlocked: Achievement[];
}

/**
 * Checks and updates achievements when a move is executed.
 */
export function checkAchievementsOnMove(
  currentStats: PlayerStats,
  currentAchievements: Achievement[],
  captured: number,
  laps: number,
  player: Player
): AchievementCheckResult {
  if (player !== 'player1') {
    return {
      updatedStats: currentStats,
      updatedAchievements: currentAchievements,
      newlyUnlocked: [],
    };
  }

  const newStats: PlayerStats = {
    ...currentStats,
    totalSeedsCaptured: currentStats.totalSeedsCaptured + captured,
    maxCapturedInSingleMove: Math.max(currentStats.maxCapturedInSingleMove, captured),
    maxLapsInSingleMove: Math.max(currentStats.maxLapsInSingleMove, laps),
  };

  const newlyUnlocked: Achievement[] = [];

  const updatedAchievements = currentAchievements.map((ach) => {
    if (ach.unlocked) return ach;

    let progress = ach.progress;
    let unlocked = false;

    if (ach.id === 'master_harvest' && captured >= 10) {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'whirlwind_laps' && laps >= 3) {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'total_captures_50') {
      progress = Math.min(newStats.totalSeedsCaptured, ach.maxProgress);
      if (progress >= ach.maxProgress) unlocked = true;
    }

    if (unlocked && !ach.unlocked) {
      const uAch = { ...ach, unlocked: true, unlockedAt: Date.now(), progress: ach.maxProgress };
      newlyUnlocked.push(uAch);
      return uAch;
    }

    return { ...ach, progress };
  });

  savePlayerStats(newStats);
  saveAchievements(updatedAchievements);

  return {
    updatedStats: newStats,
    updatedAchievements,
    newlyUnlocked,
  };
}

/**
 * Checks and updates achievements when a game ends.
 */
export function checkAchievementsOnGameEnd(
  currentStats: PlayerStats,
  currentAchievements: Achievement[],
  winner: Player | 'draw' | null,
  winReason: string | null,
  gameMode: GameMode,
  difficulty: AIDifficulty,
  aiSpeed: AISpeed,
  config: GameConfig
): AchievementCheckResult {
  const isP1Winner = winner === 'player1';
  const isCustomRule = config.presetId !== 'ntxuva_standard';

  const newGamesPlayed = currentStats.gamesPlayed + 1;
  const newGamesWon = isP1Winner ? currentStats.gamesWon + 1 : currentStats.gamesWon;
  const newWinStreak = isP1Winner ? currentStats.winStreak + 1 : 0;
  const newHighestStreak = Math.max(currentStats.highestWinStreak, newWinStreak);
  const newAiHardWins =
    isP1Winner && gameMode === 'ai' && difficulty === 'hard'
      ? currentStats.aiHardWins + 1
      : currentStats.aiHardWins;
  const newCustomPlayed = isCustomRule
    ? currentStats.customRulesPlayed + 1
    : currentStats.customRulesPlayed;

  const newStats: PlayerStats = {
    ...currentStats,
    gamesPlayed: newGamesPlayed,
    gamesWon: newGamesWon,
    winStreak: newWinStreak,
    highestWinStreak: newHighestStreak,
    aiHardWins: newAiHardWins,
    customRulesPlayed: newCustomPlayed,
  };

  const newlyUnlocked: Achievement[] = [];

  const updatedAchievements = currentAchievements.map((ach) => {
    if (ach.unlocked) return ach;

    let progress = ach.progress;
    let unlocked = false;

    if (ach.id === 'first_sowing') {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'veteran_5') {
      progress = Math.min(newGamesPlayed, ach.maxProgress);
      if (progress >= ach.maxProgress) unlocked = true;
    } else if (ach.id === 'beat_ai_hard' && isP1Winner && gameMode === 'ai' && difficulty === 'hard') {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'win_streak_3') {
      progress = Math.min(newWinStreak, ach.maxProgress);
      if (progress >= ach.maxProgress) unlocked = true;
    } else if (ach.id === 'clean_sweep' && isP1Winner && winReason?.toLowerCase().includes('imobiliza')) {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'custom_explorer' && isCustomRule) {
      progress = 1;
      unlocked = true;
    } else if (ach.id === 'speed_demon' && isP1Winner && gameMode === 'ai' && aiSpeed === 'fast') {
      progress = 1;
      unlocked = true;
    }

    if (unlocked && !ach.unlocked) {
      const uAch = { ...ach, unlocked: true, unlockedAt: Date.now(), progress: ach.maxProgress };
      newlyUnlocked.push(uAch);
      return uAch;
    }

    return { ...ach, progress };
  });

  savePlayerStats(newStats);
  saveAchievements(updatedAchievements);

  return {
    updatedStats: newStats,
    updatedAchievements,
    newlyUnlocked,
  };
}
