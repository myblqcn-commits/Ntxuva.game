import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isOfflineError } from './config';
import { FirebaseMatchRecord, FirebasePlayerProfile, LeaderboardPlayer } from './types';

const LOCAL_PLAYER_ID_KEY = 'ntxuva_player_uid_v1';
const LOCAL_PLAYER_NAME_KEY = 'ntxuva_player_name_v1';
const LOCAL_PROFILE_KEY = 'ntxuva_cached_player_profile_v1';
const LOCAL_LEADERBOARD_KEY = 'ntxuva_cached_leaderboard_v1';

export function getLocalPlayerId(): string {
  try {
    let id = localStorage.getItem(LOCAL_PLAYER_ID_KEY);
    if (!id) {
      id = `guest_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
      localStorage.setItem(LOCAL_PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `guest_${Date.now()}`;
  }
}

export function getLocalPlayerName(): string {
  try {
    return localStorage.getItem(LOCAL_PLAYER_NAME_KEY) || 'Jogador Ntxuva';
  } catch {
    return 'Jogador Ntxuva';
  }
}

export function setLocalPlayerName(name: string): void {
  try {
    localStorage.setItem(LOCAL_PLAYER_NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function getCachedProfile(playerId: string): FirebasePlayerProfile | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_PROFILE_KEY}_${playerId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

export function setCachedProfile(profile: FirebasePlayerProfile): void {
  try {
    localStorage.setItem(`${LOCAL_PROFILE_KEY}_${profile.id}`, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function calculateLevelInfo(xp: number): {
  level: number;
  title: string;
  nextLevelXp: number;
  currentLevelBaseXp: number;
} {
  // 200 XP por nível
  const XP_PER_LEVEL = 200;
  const level = Math.max(1, 1 + Math.floor(xp / XP_PER_LEVEL));
  const currentLevelBaseXp = (level - 1) * XP_PER_LEVEL;
  const nextLevelXp = level * XP_PER_LEVEL;

  let title = 'Iniciante das Cavas';
  if (level >= 16) {
    title = 'Lenda Viva de Ntxuva';
  } else if (level >= 12) {
    title = 'Guardião do Tabuleiro';
  } else if (level >= 8) {
    title = 'Mestre da Semeadura';
  } else if (level >= 5) {
    title = 'Estrategista de Maputo';
  } else if (level >= 3) {
    title = 'Aprendiz de Ntxuva';
  }

  return { level, title, nextLevelXp, currentLevelBaseXp };
}

/**
 * Obtém ou cria o perfil do jogador no Firestore (com suporte offline resiliente)
 */
export async function getOrCreatePlayerProfile(
  userId?: string | null,
  displayName?: string | null,
  photoURL?: string | null
): Promise<FirebasePlayerProfile> {
  const targetId = userId || getLocalPlayerId();
  const cached = getCachedProfile(targetId);
  const resolvedName = displayName || cached?.displayName || getLocalPlayerName();
  const now = new Date().toISOString();
  const { level, title } = calculateLevelInfo(cached?.experiencePoints || 0);

  const fallbackProfile: FirebasePlayerProfile = cached || {
    id: targetId,
    displayName: resolvedName.substring(0, 50),
    photoURL: photoURL ? photoURL.substring(0, 500) : '',
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    seedsCaptured: 0,
    experiencePoints: 0,
    level,
    levelTitle: title,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, 'players', targetId);

    // Timeout de segurança para evitar bloquear se a rede estiver instável
    const getPromise = getDoc(docRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore getDoc timeout (offline fallback)')), 3000)
    );

    let snap;
    try {
      snap = await Promise.race([getPromise, timeoutPromise]);
    } catch (fetchErr) {
      // Em modo offline ou timeout, usa o perfil local sem falhar
      if (isOfflineError(fetchErr) || (fetchErr instanceof Error && fetchErr.message.includes('timeout'))) {
        setCachedProfile(fallbackProfile);
        return fallbackProfile;
      }
      throw fetchErr;
    }

    if (snap && snap.exists()) {
      const data = snap.data() as FirebasePlayerProfile;
      // Atualiza nome ou foto se fornecidos pelo login
      if (displayName && data.displayName !== displayName) {
        try {
          await updateDoc(docRef, {
            displayName,
            photoURL: photoURL || data.photoURL || '',
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // ignora se offline
        }
        const updated = {
          ...data,
          displayName,
          photoURL: photoURL || data.photoURL,
        };
        setCachedProfile(updated);
        return updated;
      }
      setCachedProfile(data);
      return data;
    }

    // Perfil inicial no Firestore
    try {
      await setDoc(docRef, fallbackProfile);
    } catch (setErr) {
      console.warn('Gravação do perfil adiada para quando o Firestore estiver online:', setErr);
    }
    setCachedProfile(fallbackProfile);
    return fallbackProfile;
  } catch (error) {
    console.warn('Acedendo ao perfil em modo offline:', error);
    setCachedProfile(fallbackProfile);
    return fallbackProfile;
  }
}

/**
 * Atualiza estatísticas do jogador após a conclusão de uma partida
 */
export async function updatePlayerStatsAfterGame(params: {
  playerId: string;
  playerName: string;
  gameMode: 'ai' | 'two_player' | 'pass_and_play';
  difficulty?: string;
  winner: 'player1' | 'player2' | 'draw';
  seedsCaptured: number;
  totalTurns: number;
  winReason?: string | null;
}): Promise<{ profile: FirebasePlayerProfile; gainedXp: number }> {
  const {
    playerId,
    playerName,
    gameMode,
    difficulty = 'médio',
    winner,
    seedsCaptured,
    totalTurns,
    winReason = 'Fim da Partida',
  } = params;

  const isWin = winner === 'player1';
  const isDraw = winner === 'draw';
  const isLoss = winner === 'player2';

  // Vitória: 120 XP, Empate: 50 XP, Derrota: 35 XP, +2 XP por semente capturada
  const baseGameXp = isWin ? 120 : isDraw ? 50 : 35;
  const seedXp = Math.max(0, seedsCaptured * 2);
  const gainedXp = baseGameXp + seedXp;

  const currentProfile = getCachedProfile(playerId) || {
    id: playerId,
    displayName: playerName ? playerName.substring(0, 50) : getLocalPlayerName(),
    photoURL: '',
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    seedsCaptured: 0,
    experiencePoints: 0,
    level: 1,
    levelTitle: 'Iniciante das Cavas',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const newWins = currentProfile.wins + (isWin ? 1 : 0);
  const newLosses = currentProfile.losses + (isLoss ? 1 : 0);
  const newDraws = (currentProfile.draws || 0) + (isDraw ? 1 : 0);
  const newTotalGames = currentProfile.totalGames + 1;
  const newSeedsCaptured = currentProfile.seedsCaptured + Math.max(0, seedsCaptured);
  const newXp = currentProfile.experiencePoints + gainedXp;
  const { level, title } = calculateLevelInfo(newXp);
  const now = new Date().toISOString();

  const updatedProfile: FirebasePlayerProfile = {
    ...currentProfile,
    displayName: playerName ? playerName.substring(0, 50) : currentProfile.displayName,
    wins: newWins,
    losses: newLosses,
    draws: newDraws,
    totalGames: newTotalGames,
    seedsCaptured: newSeedsCaptured,
    experiencePoints: newXp,
    level,
    levelTitle: title,
    updatedAt: now,
  };

  // 1. Guarda imediatamente na cache local
  setCachedProfile(updatedProfile);

  // 2. Persiste no Firestore em segundo plano
  try {
    const docRef = doc(db, 'players', playerId);
    await setDoc(docRef, updatedProfile);

    // Grava também o registo individual da partida na coleção 'matches'
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const matchDoc: FirebaseMatchRecord = {
      id: matchId,
      playerId,
      playerName: (playerName || currentProfile.displayName).substring(0, 50),
      gameMode,
      difficulty: difficulty.substring(0, 30),
      winner,
      isWinner: isWin,
      seedsCaptured: Math.max(0, seedsCaptured),
      totalTurns,
      winReason: (winReason || 'Fim da Partida').substring(0, 200),
      createdAt: now,
    };

    try {
      await setDoc(doc(db, 'matches', matchId), matchDoc);
    } catch {
      // silencioso se offline
    }
  } catch (err) {
    console.warn('Sincronização com Firestore pendente (offline):', err);
  }

  return { profile: updatedProfile, gainedXp };
}

/**
 * Atualiza o nome de exibição do jogador
 */
export async function updatePlayerDisplayName(
  playerId: string,
  newDisplayName: string
): Promise<FirebasePlayerProfile> {
  const trimmed = newDisplayName.trim().substring(0, 50);
  if (!trimmed) throw new Error('Nome inválido');

  setLocalPlayerName(trimmed);

  const current = getCachedProfile(playerId) || {
    id: playerId,
    displayName: trimmed,
    photoURL: '',
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    seedsCaptured: 0,
    experiencePoints: 0,
    level: 1,
    levelTitle: 'Iniciante das Cavas',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updated: FirebasePlayerProfile = {
    ...current,
    displayName: trimmed,
    updatedAt: new Date().toISOString(),
  };

  setCachedProfile(updated);

  try {
    const docRef = doc(db, 'players', playerId);
    await updateDoc(docRef, {
      displayName: trimmed,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Nome atualizado localmente; sincronização com Firestore pendente:', error);
  }

  return updated;
}

/**
 * Consulta a tabela de classificação dos melhores jogadores com fallback local e cache
 */
export async function getLeaderboard(
  limitCount: number = 25,
  sortBy: 'wins' | 'experiencePoints' | 'seedsCaptured' = 'wins'
): Promise<LeaderboardPlayer[]> {
  const defaultChampions: LeaderboardPlayer[] = [
    {
      id: 'bot_nyami_master',
      displayName: 'Mestre Nyami (Inhambane)',
      wins: 48,
      losses: 5,
      draws: 3,
      totalGames: 56,
      seedsCaptured: 1420,
      experiencePoints: 6800,
      level: 34,
      levelTitle: 'Lenda Viva de Ntxuva',
      rank: 1,
      winRate: 86,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'bot_maputo_pro',
      displayName: 'Kutxuvana Maputo',
      wins: 35,
      losses: 12,
      draws: 4,
      totalGames: 51,
      seedsCaptured: 980,
      experiencePoints: 4900,
      level: 25,
      levelTitle: 'Guardião do Tabuleiro',
      rank: 2,
      winRate: 69,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'bot_xai_xai',
      displayName: 'Semeador de Gaza',
      wins: 22,
      losses: 14,
      draws: 2,
      totalGames: 38,
      seedsCaptured: 640,
      experiencePoints: 3100,
      level: 16,
      levelTitle: 'Mestre da Semeadura',
      rank: 3,
      winRate: 58,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  try {
    const colRef = collection(db, 'players');
    const q = query(colRef, orderBy(sortBy, 'desc'), limit(limitCount));

    const snapPromise = getDocs(q);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Leaderboard timeout')), 3500)
    );

    const snap = await Promise.race([snapPromise, timeoutPromise]);

    const players: LeaderboardPlayer[] = [];
    let rank = 1;

    snap.forEach((docSnap) => {
      const data = docSnap.data() as FirebasePlayerProfile;
      const total = (data.wins || 0) + (data.losses || 0) + (data.draws || 0);
      const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;

      players.push({
        ...data,
        rank: rank++,
        winRate,
      });
    });

    if (players.length > 0) {
      try {
        localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(players));
      } catch {
        // ignore
      }
      return players;
    }
  } catch (error) {
    console.warn('Leaderboard offline ou timeout, recorrendo à cache e campeões locais:', error);
  }

  // Tentar carregar da cache local
  try {
    const cached = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // Incluir o perfil local atual
  const localId = getLocalPlayerId();
  const currentProfile = getCachedProfile(localId);
  const list = [...defaultChampions];

  if (currentProfile) {
    const total = currentProfile.wins + currentProfile.losses + (currentProfile.draws || 0);
    const winRate = total > 0 ? Math.round((currentProfile.wins / total) * 100) : 0;
    list.push({
      ...currentProfile,
      rank: list.length + 1,
      winRate,
    });
  }

  list.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  list.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  return list;
}

