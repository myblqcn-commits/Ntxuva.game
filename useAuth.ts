import { useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider, isOfflineError } from './config';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirebasePlayerProfile } from './types';
import {
  getLocalPlayerId,
  getLocalPlayerName,
  getCachedProfile,
  getOrCreatePlayerProfile,
  updatePlayerDisplayName,
  updatePlayerStatsAfterGame,
} from './playerService';

export interface AuthWarning {
  code: string;
  title: string;
  message: string;
  currentDomain: string;
  consoleUrl: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [playerProfile, setPlayerProfile] = useState<FirebasePlayerProfile | null>(() => {
    try {
      const localId = getLocalPlayerId();
      return getCachedProfile(localId);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authWarning, setAuthWarning] = useState<AuthWarning | null>(null);

  const clearAuthWarning = useCallback(() => {
    setAuthWarning(null);
    setError(null);
  }, []);

  // Carrega perfil correspondente ao utilizador autenticado ou guest local
  const loadProfile = useCallback(async (currentUser: User | null) => {
    try {
      if (currentUser) {
        const profile = await getOrCreatePlayerProfile(
          currentUser.uid,
          currentUser.displayName,
          currentUser.photoURL
        );
        setPlayerProfile(profile);
      } else {
        const localId = getLocalPlayerId();
        const localName = getLocalPlayerName();
        const profile = await getOrCreatePlayerProfile(localId, localName);
        setPlayerProfile(profile);
      }
    } catch (err) {
      console.warn('Recorrendo a perfil local:', err);
      // Garantir que nunca fica nulo
      setPlayerProfile((prev) => {
        if (prev) return prev;
        const localId = getLocalPlayerId();
        return (
          getCachedProfile(localId) || {
            id: localId,
            displayName: getLocalPlayerName(),
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
          }
        );
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      await loadProfile(currentUser);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    setAuthWarning(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setAuthWarning(null);
        await loadProfile(result.user);
      }
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = err?.message || String(err);

      if (
        errCode === 'auth/unauthorized-domain' ||
        errMsg.includes('auth/unauthorized-domain')
      ) {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
        const projectId = firebaseConfig.projectId || 'ntxuva-e72a1';
        const consoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

        console.warn(
          `[Firebase Auth] O domínio '${currentDomain}' não está na lista de domínios autorizados do Firebase Console. Adicione-o em: ${consoleUrl}`
        );

        setAuthWarning({
          code: 'auth/unauthorized-domain',
          title: 'Domínio não autorizado para Login Google',
          message: `O domínio atual "${currentDomain}" necessita de ser adicionado aos Domínios Autorizados no Firebase Console para que o Login com Google funcione neste endereço.`,
          currentDomain,
          consoleUrl,
        });
        setError(`Domínio ${currentDomain} não autorizado no Firebase Console.`);
        return;
      }

      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('popup-closed-by-user')
      ) {
        // O utilizador fechou a janela de autenticação intencionalmente
        return;
      }

      console.warn('Aviso ao autenticar com Google:', err);
      setError('Não foi possível iniciar sessão com o Google no momento. Tente novamente mais tarde.');
    }
  }, [loadProfile]);

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      await signOut(auth);
      setUser(null);
      await loadProfile(null);
    } catch (err) {
      console.warn('Aviso ao terminar sessão:', err);
    }
  }, [loadProfile]);

  const updateName = useCallback(
    async (newName: string) => {
      const currentId = user ? user.uid : getLocalPlayerId();
      try {
        const updated = await updatePlayerDisplayName(currentId, newName);
        setPlayerProfile(updated);
      } catch (err) {
        console.warn('Aviso ao atualizar nome:', err);
        throw err;
      }
    },
    [user]
  );

  const recordGameResult = useCallback(
    async (params: {
      gameMode: 'ai' | 'two_player' | 'pass_and_play' | string;
      difficulty?: string;
      winner: 'player1' | 'player2' | 'draw' | null;
      seedsCaptured: number;
      totalTurns: number;
      winReason?: string | null;
    }) => {
      const currentId = user ? user.uid : getLocalPlayerId();
      const currentName = user?.displayName || playerProfile?.displayName || getLocalPlayerName();

      try {
        const normalizedWinner: 'player1' | 'player2' | 'draw' =
          params.winner === 'player1' || params.winner === 'player2' || params.winner === 'draw'
            ? params.winner
            : 'draw';

        const normalizedMode: 'ai' | 'two_player' | 'pass_and_play' =
          params.gameMode === 'ai' ? 'ai' : 'pass_and_play';

        const result = await updatePlayerStatsAfterGame({
          playerId: currentId,
          playerName: currentName,
          gameMode: normalizedMode,
          difficulty: params.difficulty,
          winner: normalizedWinner,
          seedsCaptured: params.seedsCaptured,
          totalTurns: params.totalTurns,
          winReason: params.winReason || 'Fim da Partida',
        });
        setPlayerProfile(result.profile);
        return result;
      } catch (err) {
        if (isOfflineError(err)) {
          console.warn('Resultado de partida guardado apenas localmente (offline):', err);
        } else {
          console.warn('Aviso ao registar resultado no Firebase:', err);
        }
        return null;
      }
    },
    [user, playerProfile]
  );

  return {
    user,
    playerProfile,
    loading,
    error,
    authWarning,
    clearAuthWarning,
    loginWithGoogle,
    signOut: handleSignOut,
    updateName,
    recordGameResult,
    refreshProfile: () => loadProfile(user),
  };
}
