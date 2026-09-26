import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Achievement,
  AIDifficulty,
  AISpeed,
  AnimationStep,
  AnimationStepType,
  GameConfig,
  GameMode,
  GameState,
  MoveHistoryEntry,
  Pit,
  Player,
  PlayerStats,
} from '../game/types';
import { initGameState, playMove } from '../game/gameEngine';
import {
  DEFAULT_GAME_CONFIG,
  getNextPit,
  loadSavedConfig,
  RULE_PRESETS,
  saveConfig,
} from '../game/rules';
import { calculateAIMove, calculateHintMove, getAIMove } from '../game/ai';
import { getLegalMoves, isValidMove } from '../game/moves';
import { calculateCapture } from '../game/capture';
import { checkGameOver, getPlayerTotalSeeds } from '../game/winConditions';
import {
  checkAchievementsOnGameEnd,
  checkAchievementsOnMove,
  loadAchievements,
  loadPlayerStats,
} from '../game/achievements';
import { useSound } from './useSound';

const AI_SPEED_STORAGE_KEY = 'ntxuva_ai_speed_v1';
const MANUAL_MODE_STORAGE_KEY = 'ntxuva_manual_mode_v1';

export interface ManualMoveState {
  isActive: boolean;
  player: Player;
  startPitId: number;
  currentPitId: number;
  nextTargetPitId: number | null;
  seedsInHand: number;
  laps: number;
  totalSeedsDistributed: number;
  totalCaptured: number;
  capturedColumns: number[];
}

export function useGame(
  initialMode: GameMode = 'ai',
  initialDifficulty: AIDifficulty = 'medium',
  options?: { onGameOver?: (finalState: GameState) => void }
) {
  // Load saved rule config or default
  const [config, setConfig] = useState<GameConfig>(() => loadSavedConfig());

  // Load saved AI speed ('fast' or 'normal')
  const [aiSpeed, setAiSpeedState] = useState<AISpeed>(() => {
    try {
      const stored = localStorage.getItem(AI_SPEED_STORAGE_KEY);
      return stored === 'fast' || stored === 'normal' ? stored : 'normal';
    } catch {
      return 'normal';
    }
  });

  // Modo Manual (Passo a Passo)
  const [isManualMode, setIsManualMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(MANUAL_MODE_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const toggleManualMode = useCallback((val?: boolean) => {
    setIsManualMode((prev) => {
      const next = typeof val === 'boolean' ? val : !prev;
      try {
        localStorage.setItem(MANUAL_MODE_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const [gameState, setGameState] = useState<GameState>(() =>
    initGameState(initialMode, initialDifficulty, config, aiSpeed)
  );

  // Visual active board that updates during animation playback
  const [displayBoard, setDisplayBoard] = useState<Pit[]>(gameState.board);
  const [activeHighlightPitId, setActiveHighlightPitId] = useState<number | null>(null);
  const [currentStepType, setCurrentStepType] = useState<AnimationStepType | null>(null);
  const [handSeedCount, setHandSeedCount] = useState<number | null>(null);
  const [lastCaptureInfo, setLastCaptureInfo] = useState<{
    count: number;
    player: Player;
    pits: number[];
  } | null>(null);

  // Manual Distribution State
  const [manualMoveState, setManualMoveState] = useState<ManualMoveState>({
    isActive: false,
    player: 'player1',
    startPitId: 0,
    currentPitId: 0,
    nextTargetPitId: null,
    seedsInHand: 0,
    laps: 1,
    totalSeedsDistributed: 0,
    totalCaptured: 0,
    capturedColumns: [],
  });
  const [manualInvalidPitId, setManualInvalidPitId] = useState<number | null>(null);
  const [manualWarningMessage, setManualWarningMessage] = useState<string | null>(null);
  const manualWarningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Achievements & Stats system
  const [achievements, setAchievements] = useState<Achievement[]>(() => loadAchievements());
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadPlayerStats());
  const [newlyUnlockedAchievement, setNewlyUnlockedAchievement] = useState<Achievement | null>(null);

  // Hint (Dica) System: Cava recomendada com a lógica 'Fácil' da IA
  const [hintPitId, setHintPitId] = useState<number | null>(null);

  const sound = useSound();
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const postMovePauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Intervalo fixo de 400ms a 500ms (450ms) entre cada cova do circuito:
  const SOWING_STEP_DELAY_MS = 450;
  // Pausa pós-jogada de 1 segundo (1000ms) após a conclusão da semeadura ou captura:
  const POST_MOVE_PAUSE_MS = 1000;

  const triggerGentleWarning = useCallback(
    (message: string, pitId?: number) => {
      sound.playInvalid();
      setManualWarningMessage(message);
      if (pitId !== undefined) {
        setManualInvalidPitId(pitId);
      }
      if (manualWarningTimeoutRef.current) clearTimeout(manualWarningTimeoutRef.current);
      manualWarningTimeoutRef.current = setTimeout(() => {
        setManualWarningMessage(null);
        setManualInvalidPitId(null);
      }, 2200);
    },
    [sound]
  );

  // Sync displayBoard when game board updates
  useEffect(() => {
    if (!manualMoveState.isActive && !gameState.isAnimating) {
      setDisplayBoard(gameState.board);
    }
  }, [gameState.board, manualMoveState.isActive, gameState.isAnimating]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);
      if (manualWarningTimeoutRef.current) clearTimeout(manualWarningTimeoutRef.current);
    };
  }, []);

  const triggerAchievementUnlocked = useCallback(
    (unlockedList: Achievement[]) => {
      if (unlockedList.length === 0) return;
      const latest = unlockedList[unlockedList.length - 1];
      setNewlyUnlockedAchievement(latest);
      sound.playAchievement();
    },
    [sound]
  );

  const dismissAchievementNotification = useCallback(() => {
    setNewlyUnlockedAchievement(null);
  }, []);

  /**
   * Finalizes move completion, updates achievements, and triggers victory/defeat if game ended.
   */
  const handleMoveFinalState = useCallback(
    (finalState: GameState, historyEntry?: MoveHistoryEntry) => {
      setActiveHighlightPitId(null);
      setCurrentStepType(null);
      setHandSeedCount(null);
      setHintPitId(null);
      setGameState(finalState);

      if (finalState.gameStatus === 'game_over') {
        if (finalState.winner === 'player1') {
          sound.playVictory();
        } else {
          sound.playDefeat();
        }

        const endAchResult = checkAchievementsOnGameEnd(
          playerStats,
          achievements,
          finalState.winner,
          finalState.winReason,
          finalState.gameMode,
          finalState.difficulty,
          finalState.aiSpeed,
          finalState.config
        );
        setPlayerStats(endAchResult.updatedStats);
        setAchievements(endAchResult.updatedAchievements);
        if (endAchResult.newlyUnlocked.length > 0) {
          triggerAchievementUnlocked(endAchResult.newlyUnlocked);
        }

        if (options?.onGameOver) {
          options.onGameOver(finalState);
        }
      }
    },
    [achievements, playerStats, sound, triggerAchievementUnlocked, options]
  );

  /**
   * Executa a semeadura sequencial com tempo de espera fixo (450ms entre 400ms e 500ms) entre cada cova do circuito.
   * Renderiza progressivamente o estado do tabuleiro e a contagem de sementes a cada passo individual.
   * Adiciona uma pausa de 1 segundo após a conclusão da semeadura ou captura antes de permitir a próxima jogada.
   */
  const runAnimationSequence = useCallback(
    (
      steps: AnimationStep[],
      finalState: GameState,
      historyEntry: MoveHistoryEntry,
      onFinished?: () => void
    ) => {
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);

      isProcessingRef.current = true;
      setGameState((prev) => ({ ...prev, isAnimating: true }));

      let stepIndex = 0;

      const runStep = () => {
        if (stepIndex >= steps.length) {
          // Pausa pós-jogada: Adiciona uma pausa de 1 segundo após a conclusão da semeadura ou captura
          // antes de permitir a próxima jogada do Jogador 2 (ou Jogador 1)
          postMovePauseTimeoutRef.current = setTimeout(() => {
            setActiveHighlightPitId(null);
            setCurrentStepType(null);
            setHandSeedCount(null);
            isProcessingRef.current = false;

            handleMoveFinalState(finalState, historyEntry);

            if (onFinished) {
              onFinished();
            }
          }, POST_MOVE_PAUSE_MS);
          return;
        }

        const step = steps[stepIndex];

        // Atualização progressiva da interface a cada passo individual
        setDisplayBoard(step.boardState);
        setActiveHighlightPitId(step.pitId);
        setCurrentStepType(step.type);
        setHandSeedCount(step.handSeeds > 0 ? step.handSeeds : null);

        if (step.type === 'pickup') {
          sound.playPickup();
        } else if (step.type === 'drop') {
          sound.playDrop(step.handSeeds);
        } else if (step.type === 'resow') {
          sound.playResow();
        } else if (step.type === 'capture' && step.capturedSeeds) {
          sound.playCapture();
          setLastCaptureInfo(step.capturedSeeds);
          setTimeout(() => setLastCaptureInfo(null), 3000);
        }

        stepIndex++;

        // Intervalo fixo de 450ms entre cada cova (400ms a 500ms)
        const delay = step.type === 'pickup' ? 400 : SOWING_STEP_DELAY_MS;
        animationTimeoutRef.current = setTimeout(runStep, delay);
      };

      runStep();
    },
    [sound, handleMoveFinalState]
  );

  /**
   * Executa a jogada da IA com semeadura sequencial progressiva (450ms) e pausa pós-jogada de 1s.
   */
  const makeAIMove = useCallback(
    (currentState: GameState) => {
      if (
        currentState.gameMode !== 'ai' ||
        currentState.currentPlayer !== 'player2' ||
        currentState.gameStatus !== 'in_progress' ||
        isProcessingRef.current
      ) {
        return;
      }

      setGameState((prev) => ({ ...prev, isAIThinking: false }));

      const chosenPitId = calculateAIMove(
        currentState.board,
        currentState.difficulty,
        currentState.config
      );

      if (chosenPitId === null) {
        const gameOverState: GameState = {
          ...currentState,
          gameStatus: 'game_over',
          winner: 'player1',
          winReason: 'Imobilização Total: Nyami não possui mais jogadas válidas.',
          isAIThinking: false,
          isAnimating: false,
        };
        setDisplayBoard(gameOverState.board);
        setGameState(gameOverState);
        handleMoveFinalState(gameOverState);
        return;
      }

      try {
        const { nextState: aiNextState, animationSteps: aiSteps, historyEntry: aiHistory } = playMove(currentState, chosenPitId);

        // Execução sequencial progressiva da semeadura da IA com pausa pós-jogada de 1s
        runAnimationSequence(aiSteps, aiNextState, aiHistory);
      } catch (err) {
        console.error('Erro ao executar jogada da IA:', err);
        isProcessingRef.current = false;
        setGameState((prev) => ({ ...prev, isAnimating: false }));
      }
    },
    [handleMoveFinalState, runAnimationSequence]
  );

  /**
   * Conclui a jogada manual após o término da semeadura, captura ou relançamentos.
   */
  const finalizeManualMove = useCallback(
    (
      finalBoard: Pit[],
      player: Player,
      startPitId: number,
      totalSeedsDistributed: number,
      laps: number,
      totalCaptured: number,
      capturedColumns: number[]
    ) => {
      setManualMoveState({
        isActive: false,
        player: 'player1',
        startPitId: 0,
        currentPitId: 0,
        nextTargetPitId: null,
        seedsInHand: 0,
        laps: 1,
        totalSeedsDistributed: 0,
        totalCaptured: 0,
        capturedColumns: [],
      });
      setHandSeedCount(null);
      setActiveHighlightPitId(null);
      setManualWarningMessage(null);
      setManualInvalidPitId(null);

      const p1Total = getPlayerTotalSeeds(finalBoard, 'player1');
      const p2Total = getPlayerTotalSeeds(finalBoard, 'player2');
      const newCaptured = {
        ...gameState.capturedSeeds,
        [player]: gameState.capturedSeeds[player] + totalCaptured,
      };

      const pit = gameState.board[startPitId];
      const historyEntry: MoveHistoryEntry = {
        id: `move-${gameState.turnCount}-${Date.now()}`,
        moveNumber: gameState.turnCount,
        player,
        startPitId,
        startRow: pit?.row ?? 0,
        startCol: pit?.col ?? 0,
        seedsDistributed: totalSeedsDistributed,
        laps,
        captured: totalCaptured,
        capturedColumns,
        timestamp: Date.now(),
        description:
          totalCaptured > 0
            ? `${player === 'player1' ? 'Jogador 1' : 'Jogador 2'} colheu cava (${pit?.row ?? 0}, ${pit?.col ?? 0}) e capturou ${totalCaptured} sementes!`
            : `${player === 'player1' ? 'Jogador 1' : 'Jogador 2'} semeou manualmente ${totalSeedsDistributed} sementes em ${laps} ${laps === 1 ? 'volta' : 'voltas'}.`,
      };

      if (player === 'player1') {
        const moveAchResult = checkAchievementsOnMove(
          playerStats,
          achievements,
          totalCaptured,
          laps,
          player
        );
        if (moveAchResult.newlyUnlocked.length > 0) {
          setPlayerStats(moveAchResult.updatedStats);
          setAchievements(moveAchResult.updatedAchievements);
          triggerAchievementUnlocked(moveAchResult.newlyUnlocked);
        }
      }

      const nextPlayer: Player = player === 'player1' ? 'player2' : 'player1';
      const nextLegalMoves = getLegalMoves(finalBoard, nextPlayer, gameState.config);
      const winCheck = checkGameOver(finalBoard, nextPlayer, nextLegalMoves.length);

      const nextState: GameState = {
        ...gameState,
        board: finalBoard,
        currentPlayer: winCheck.gameOver ? player : nextPlayer,
        scores: {
          player1: p1Total,
          player2: p2Total,
        },
        capturedSeeds: newCaptured,
        moveHistory: [historyEntry, ...gameState.moveHistory],
        gameStatus: winCheck.gameOver ? 'game_over' : 'in_progress',
        winner: winCheck.winner,
        winReason: winCheck.reason,
        turnCount: gameState.turnCount + 1,
        selectedPitId: null,
        isAnimating: false,
        isAIThinking: false,
      };

      // Pausa pós-jogada de 1 segundo antes de permitir a próxima jogada
      isProcessingRef.current = true;
      setGameState((prev) => ({ ...prev, isAnimating: true }));

      if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);
      postMovePauseTimeoutRef.current = setTimeout(() => {
        isProcessingRef.current = false;
        handleMoveFinalState(nextState, historyEntry);

        if (
          nextState.gameMode === 'ai' &&
          nextState.currentPlayer === 'player2' &&
          nextState.gameStatus === 'in_progress'
        ) {
          if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
          aiTimeoutRef.current = setTimeout(() => {
            makeAIMove(nextState);
          }, 150);
        }
      }, POST_MOVE_PAUSE_MS);
    },
    [
      gameState,
      playerStats,
      achievements,
      triggerAchievementUnlocked,
      handleMoveFinalState,
      makeAIMove,
    ]
  );

  /**
   * Conclui automaticamente uma jogada manual em andamento com semeadura sequencial.
   */
  const completeManualMoveAuto = useCallback(() => {
    if (!manualMoveState.isActive || manualMoveState.nextTargetPitId === null) return;

    const currentBoard = displayBoard.map((p) => ({ ...p }));
    let seedsInHand = manualMoveState.seedsInHand;
    let currentPitId = manualMoveState.currentPitId;
    let totalSeedsDistributed = manualMoveState.totalSeedsDistributed;
    let laps = manualMoveState.laps;
    let totalCaptured = manualMoveState.totalCaptured;
    const capturedColumns: number[] = [...manualMoveState.capturedColumns];
    const remainingAnimationSteps: AnimationStep[] = [];

    const player = manualMoveState.player;
    const config = gameState.config;

    const MAX_STEPS = 500;
    let stepCount = 0;

    while (seedsInHand > 0 && stepCount < MAX_STEPS) {
      stepCount++;
      currentPitId = getNextPit(currentPitId, player, config);
      currentBoard[currentPitId].seeds += 1;
      seedsInHand--;
      totalSeedsDistributed++;

      remainingAnimationSteps.push({
        type: 'drop',
        pitId: currentPitId,
        handSeeds: seedsInHand,
        boardState: currentBoard.map((p) => ({ ...p })),
      });

      if (seedsInHand === 0) {
        const captureInfo = calculateCapture(currentBoard, currentPitId, player, config);

        if (captureInfo.canCapture) {
          totalCaptured += captureInfo.capturedSeedsCount;
          if (!capturedColumns.includes(captureInfo.opposingCol)) {
            capturedColumns.push(captureInfo.opposingCol);
          }

          for (const cPitId of captureInfo.capturedPitIds) {
            currentBoard[cPitId].seeds = 0;
          }

          remainingAnimationSteps.push({
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
          break;
        }

        if (config.multipleSowing && currentBoard[currentPitId].seeds > 1) {
          seedsInHand = currentBoard[currentPitId].seeds;
          currentBoard[currentPitId].seeds = 0;
          laps++;

          remainingAnimationSteps.push({
            type: 'resow',
            pitId: currentPitId,
            handSeeds: seedsInHand,
            boardState: currentBoard.map((p) => ({ ...p })),
            description: `Relançamento: colheu ${seedsInHand} sementes da cava #${currentPitId}`,
          });
        }
      }
    }

    setManualMoveState({
      isActive: false,
      player: 'player1',
      startPitId: 0,
      currentPitId: 0,
      nextTargetPitId: null,
      seedsInHand: 0,
      laps: 1,
      totalSeedsDistributed: 0,
      totalCaptured: 0,
      capturedColumns: [],
    });
    setManualWarningMessage(null);
    setManualInvalidPitId(null);

    const p1Total = getPlayerTotalSeeds(currentBoard, 'player1');
    const p2Total = getPlayerTotalSeeds(currentBoard, 'player2');
    const newCaptured = {
      ...gameState.capturedSeeds,
      [player]: gameState.capturedSeeds[player] + totalCaptured,
    };

    const pit = gameState.board[manualMoveState.startPitId];
    const historyEntry: MoveHistoryEntry = {
      id: `move-${gameState.turnCount}-${Date.now()}`,
      moveNumber: gameState.turnCount,
      player,
      startPitId: manualMoveState.startPitId,
      startRow: pit?.row ?? 0,
      startCol: pit?.col ?? 0,
      seedsDistributed: totalSeedsDistributed,
      laps,
      captured: totalCaptured,
      capturedColumns,
      timestamp: Date.now(),
      description:
        totalCaptured > 0
          ? `${player === 'player1' ? 'Jogador 1' : 'Jogador 2'} colheu cava (${pit?.row ?? 0}, ${pit?.col ?? 0}) e capturou ${totalCaptured} sementes!`
          : `${player === 'player1' ? 'Jogador 1' : 'Jogador 2'} semeou ${totalSeedsDistributed} sementes em ${laps} ${laps === 1 ? 'volta' : 'voltas'}.`,
    };

    const nextPlayer: Player = player === 'player1' ? 'player2' : 'player1';
    const nextLegalMoves = getLegalMoves(currentBoard, nextPlayer, config);
    const winCheck = checkGameOver(currentBoard, nextPlayer, nextLegalMoves.length);

    const nextState: GameState = {
      ...gameState,
      board: currentBoard,
      currentPlayer: winCheck.gameOver ? player : nextPlayer,
      scores: {
        player1: p1Total,
        player2: p2Total,
      },
      capturedSeeds: newCaptured,
      moveHistory: [historyEntry, ...gameState.moveHistory],
      gameStatus: winCheck.gameOver ? 'game_over' : 'in_progress',
      winner: winCheck.winner,
      winReason: winCheck.reason,
      turnCount: gameState.turnCount + 1,
      selectedPitId: null,
      isAnimating: false,
      isAIThinking: false,
    };

    runAnimationSequence(remainingAnimationSteps, nextState, historyEntry, () => {
      if (
        nextState.gameMode === 'ai' &&
        nextState.currentPlayer === 'player2' &&
        nextState.gameStatus === 'in_progress'
      ) {
        if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = setTimeout(() => {
          makeAIMove(nextState);
        }, 100);
      }
    });
  }, [
    manualMoveState,
    displayBoard,
    gameState,
    runAnimationSequence,
    makeAIMove,
  ]);

  /**
   * Avança um passo no Modo Manual (compatibilidade)
   */
  const advanceManualStep = useCallback(() => {}, []);

  /**
   * Permite avançar tocando na próxima cava (delega para handleSelectPit)
   */
  const handleManualAdvanceTarget = useCallback(
    (pitId: number) => {
      handleSelectPit(pitId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Handles user selecting a pit.
   * Suporta:
   * 1. Distribuição Manual (toque a toque com sementes na mão, realce da próxima cava, relançamento automático e capturas).
   * 2. Semeadura Sequencial Automática com delay de 450ms e pausa pós-jogada de 1s.
   */
  const handleSelectPit = useCallback(
    (pitId: number) => {
      setHintPitId(null);

      if (
        gameState.gameStatus !== 'in_progress' ||
        gameState.isAnimating ||
        isProcessingRef.current
      ) {
        return;
      }

      // Se for a vez da IA, ignora toques
      if (gameState.gameMode === 'ai' && gameState.currentPlayer === 'player2') {
        return;
      }

      // ----------------------------------------------------
      // CASO 1: SEMEADURA MANUAL EM ANDAMENTO (Mecânica de toque manual)
      // ----------------------------------------------------
      if (manualMoveState.isActive) {
        // Indicador visual da próxima cava: Se o jogador tocar noutra cava que não seja a correta do circuito,
        // exibe um aviso suave de jogada inválida.
        if (pitId !== manualMoveState.nextTargetPitId) {
          triggerGentleWarning(
            'Toque na cava indicada a verde no circuito para depositar a semente!',
            pitId
          );
          return;
        }

        // Tocou na cava correta do circuito! Deposita 1 semente.
        const updatedBoard = displayBoard.map((p) => ({ ...p }));
        updatedBoard[pitId].seeds += 1;
        const remainingSeeds = manualMoveState.seedsInHand - 1;
        const totalDistributed = manualMoveState.totalSeedsDistributed + 1;

        sound.playDrop(remainingSeeds);
        setDisplayBoard(updatedBoard);
        setActiveHighlightPitId(pitId);
        setHandSeedCount(remainingSeeds > 0 ? remainingSeeds : null);
        setManualWarningMessage(null);
        setManualInvalidPitId(null);

        // Se ainda houver sementes na mão, avança o ponteiro para a próxima cava do circuito
        if (remainingSeeds > 0) {
          const nextTarget = getNextPit(
            pitId,
            manualMoveState.player,
            gameState.config
          );
          setManualMoveState((prev) => ({
            ...prev,
            currentPitId: pitId,
            nextTargetPitId: nextTarget,
            seedsInHand: remainingSeeds,
            totalSeedsDistributed: totalDistributed,
          }));
          return;
        }

        // ----------------------------------------------------
        // Última semente depositada! (Continuação automática e capturas)
        // ----------------------------------------------------
        // 1. Verificação de Captura
        const captureInfo = calculateCapture(
          updatedBoard,
          pitId,
          manualMoveState.player,
          gameState.config
        );

        if (captureInfo.canCapture) {
          // Caso faça captura, o sistema executa a captura e passa a vez ao adversário
          for (const cPitId of captureInfo.capturedPitIds) {
            updatedBoard[cPitId].seeds = 0;
          }
          setDisplayBoard(updatedBoard);
          sound.playCapture();
          setLastCaptureInfo({
            player: manualMoveState.player,
            count: captureInfo.capturedSeedsCount,
            pits: captureInfo.capturedPitIds,
          });
          setTimeout(() => setLastCaptureInfo(null), 3000);

          finalizeManualMove(
            updatedBoard,
            manualMoveState.player,
            manualMoveState.startPitId,
            totalDistributed,
            manualMoveState.laps,
            manualMoveState.totalCaptured + captureInfo.capturedSeedsCount,
            [...manualMoveState.capturedColumns, captureInfo.opposingCol]
          );
          return;
        }

        // 2. Semeadura Múltipla / Relançamento automático
        // Quando o jogador depositar a última semente da mão numa cava ocupada (semeadura múltipla),
        // o sistema recolhe automaticamente essas sementes para a mão do jogador continuar a distribuir.
        if (gameState.config.multipleSowing && updatedBoard[pitId].seeds > 1) {
          const reSowSeeds = updatedBoard[pitId].seeds;
          updatedBoard[pitId].seeds = 0;
          setDisplayBoard([...updatedBoard]);
          sound.playResow();
          setHandSeedCount(reSowSeeds);

          const nextTarget = getNextPit(
            pitId,
            manualMoveState.player,
            gameState.config
          );

          setManualMoveState((prev) => ({
            ...prev,
            currentPitId: pitId,
            nextTargetPitId: nextTarget,
            seedsInHand: reSowSeeds,
            laps: prev.laps + 1,
            totalSeedsDistributed: totalDistributed,
          }));
          return;
        }

        // 3. Queda em cava vazia (semente única sem captura): passa a vez ao adversário
        finalizeManualMove(
          updatedBoard,
          manualMoveState.player,
          manualMoveState.startPitId,
          totalDistributed,
          manualMoveState.laps,
          manualMoveState.totalCaptured,
          manualMoveState.capturedColumns
        );
        return;
      }

      // ----------------------------------------------------
      // CASO 2: ESCOLHA DA CAVA INICIAL
      // ----------------------------------------------------
      if (!isValidMove(gameState.board, pitId, gameState.currentPlayer, gameState.config)) {
        triggerGentleWarning(
          'Cava inválida! Escolha uma cava sua com 2 ou mais sementes.',
          pitId
        );
        return;
      }

      // Se o Modo Manual estiver ativo:
      if (isManualMode) {
        // As sementes ficam 'na mão'. O jogador precisa de tocar na cava seguinte válida para depositar 1 semente de cada vez.
        const currentBoard = gameState.board.map((p) => ({ ...p }));
        const seedsToPickup = currentBoard[pitId].seeds;
        currentBoard[pitId].seeds = 0;

        sound.playPickup();
        setDisplayBoard(currentBoard);
        setHandSeedCount(seedsToPickup);

        const firstTarget = getNextPit(pitId, gameState.currentPlayer, gameState.config);

        setManualMoveState({
          isActive: true,
          player: gameState.currentPlayer,
          startPitId: pitId,
          currentPitId: pitId,
          nextTargetPitId: firstTarget,
          seedsInHand: seedsToPickup,
          laps: 1,
          totalSeedsDistributed: 0,
          totalCaptured: 0,
          capturedColumns: [],
        });
        return;
      }

      // Se o Modo Manual estiver desativado: Execução sequencial automática (450ms)
      try {
        const { nextState, animationSteps, historyEntry } = playMove(gameState, pitId);

        // Atualização de conquistas do jogador 1
        const moveAchResult = checkAchievementsOnMove(
          playerStats,
          achievements,
          historyEntry.captured,
          historyEntry.laps,
          gameState.currentPlayer
        );

        if (moveAchResult.newlyUnlocked.length > 0) {
          setPlayerStats(moveAchResult.updatedStats);
          setAchievements(moveAchResult.updatedAchievements);
          triggerAchievementUnlocked(moveAchResult.newlyUnlocked);
        }

        // Inicia a semeadura sequencial progressiva para todos os modos (inclusive 2 Jogadores)
        runAnimationSequence(animationSteps, nextState, historyEntry, () => {
          if (
            nextState.gameMode === 'ai' &&
            nextState.currentPlayer === 'player2' &&
            nextState.gameStatus === 'in_progress'
          ) {
            if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
            aiTimeoutRef.current = setTimeout(() => {
              makeAIMove(nextState);
            }, 100);
          }
        });
      } catch (err) {
        console.error('Erro ao executar jogada:', err);
        isProcessingRef.current = false;
        setGameState((prev) => ({ ...prev, isAnimating: false }));
      }
    },
    [
      gameState,
      manualMoveState,
      displayBoard,
      isManualMode,
      sound,
      triggerGentleWarning,
      finalizeManualMove,
      playerStats,
      achievements,
      triggerAchievementUnlocked,
      runAnimationSequence,
      makeAIMove,
    ]
  );

  /**
   * Monitoriza a vez da IA, garantindo que a sua jogada só inicie após a conclusão
   * completa da semeadura e da pausa de 1 segundo pós-jogada do Jogador 1.
   */
  useEffect(() => {
    if (
      gameState.gameMode === 'ai' &&
      gameState.currentPlayer === 'player2' &&
      gameState.gameStatus === 'in_progress' &&
      !gameState.isAnimating &&
      !isProcessingRef.current
    ) {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = setTimeout(() => {
        makeAIMove(gameState);
      }, 150);
    }

    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [
    gameState.currentPlayer,
    gameState.gameMode,
    gameState.gameStatus,
    gameState.isAnimating,
    makeAIMove,
    gameState,
  ]);

  /**
   * Ativa ou desativa o sistema de 'Dica' para o turno atual do utilizador.
   * Calcula o melhor movimento possível utilizando a lógica da IA de dificuldade 'Fácil'.
   */
  const requestHint = useCallback(() => {
    if (
      gameState.gameStatus !== 'in_progress' ||
      gameState.isAnimating ||
      gameState.isAIThinking ||
      manualMoveState.isActive
    ) {
      return;
    }

    // Se estiver no turno da IA, a dica não se aplica
    if (gameState.gameMode === 'ai' && gameState.currentPlayer === 'player2') {
      return;
    }

    // Se a dica já estiver ativa, desliga-a (comportamento de alternância)
    if (hintPitId !== null) {
      setHintPitId(null);
      return;
    }

    // Calcula a cava recomendada segundo a IA Fácil
    const bestPitId = calculateHintMove(
      gameState.board,
      gameState.currentPlayer,
      gameState.config
    );

    if (bestPitId !== null) {
      setHintPitId(bestPitId);
      sound.playHint();
    }
  }, [
    gameState.gameStatus,
    gameState.isAnimating,
    gameState.isAIThinking,
    gameState.gameMode,
    gameState.currentPlayer,
    gameState.board,
    gameState.config,
    manualMoveState.isActive,
    hintPitId,
    sound,
  ]);

  const clearHint = useCallback(() => {
    setHintPitId(null);
  }, []);

  /**
   * Restart game
   */
  const restart = useCallback(() => {
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);
    isProcessingRef.current = false;

    setActiveHighlightPitId(null);
    setCurrentStepType(null);
    setHandSeedCount(null);
    setLastCaptureInfo(null);
    setHintPitId(null);

    const fresh = initGameState(gameState.gameMode, gameState.difficulty, gameState.config, gameState.aiSpeed);
    setGameState(fresh);
    setDisplayBoard(fresh.board);
    setManualMoveState({
      isActive: false,
      player: 'player1',
      startPitId: 0,
      currentPitId: 0,
      nextTargetPitId: null,
      seedsInHand: 0,
      laps: 1,
      totalSeedsDistributed: 0,
      totalCaptured: 0,
      capturedColumns: [],
    });
    setManualWarningMessage(null);
    setManualInvalidPitId(null);
    if (manualWarningTimeoutRef.current) clearTimeout(manualWarningTimeoutRef.current);
  }, [gameState.gameMode, gameState.difficulty, gameState.config, gameState.aiSpeed]);

  /**
   * Change Game Mode
   */
  const setGameMode = useCallback((mode: GameMode) => {
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);
    isProcessingRef.current = false;

    setActiveHighlightPitId(null);
    setCurrentStepType(null);
    setHandSeedCount(null);
    setLastCaptureInfo(null);
    setHintPitId(null);

    setGameState((prev) => {
      const fresh = initGameState(mode, prev.difficulty, prev.config, prev.aiSpeed);
      setDisplayBoard(fresh.board);
      return fresh;
    });

    setManualMoveState({
      isActive: false,
      player: 'player1',
      startPitId: 0,
      currentPitId: 0,
      nextTargetPitId: null,
      seedsInHand: 0,
      laps: 1,
      totalSeedsDistributed: 0,
      totalCaptured: 0,
      capturedColumns: [],
    });
    setManualWarningMessage(null);
    setManualInvalidPitId(null);
    if (manualWarningTimeoutRef.current) clearTimeout(manualWarningTimeoutRef.current);
  }, []);

  /**
   * Change AI Difficulty
   */
  const setDifficulty = useCallback((diff: AIDifficulty) => {
    setGameState((prev) => ({
      ...prev,
      difficulty: diff,
    }));
  }, []);

  /**
   * Toggle AI Speed (Fast vs Normal)
   */
  const setAiSpeed = useCallback((speed: AISpeed) => {
    setAiSpeedState(speed);
    try {
      localStorage.setItem(AI_SPEED_STORAGE_KEY, speed);
    } catch {
      // ignore
    }
    setGameState((prev) => ({
      ...prev,
      aiSpeed: speed,
    }));
  }, []);

  /**
   * Update full game configuration and apply it
   */
  const updateConfig = useCallback((newConfig: GameConfig) => {
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    if (postMovePauseTimeoutRef.current) clearTimeout(postMovePauseTimeoutRef.current);
    isProcessingRef.current = false;

    setConfig(newConfig);
    saveConfig(newConfig);

    setActiveHighlightPitId(null);
    setCurrentStepType(null);
    setHandSeedCount(null);
    setLastCaptureInfo(null);
    setHintPitId(null);

    setGameState((prev) => {
      const fresh = initGameState(prev.gameMode, prev.difficulty, newConfig, prev.aiSpeed);
      setDisplayBoard(fresh.board);
      return fresh;
    });

    setManualMoveState({
      isActive: false,
      player: 'player1',
      startPitId: 0,
      currentPitId: 0,
      nextTargetPitId: null,
      seedsInHand: 0,
      laps: 1,
      totalSeedsDistributed: 0,
      totalCaptured: 0,
      capturedColumns: [],
    });
    setManualWarningMessage(null);
    setManualInvalidPitId(null);
    if (manualWarningTimeoutRef.current) clearTimeout(manualWarningTimeoutRef.current);
  }, []);

  /**
   * Apply a preset rule set
   */
  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = RULE_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        updateConfig(preset.config);
      }
    },
    [updateConfig]
  );

  const legalMoves = getLegalMoves(
    gameState.board,
    gameState.currentPlayer,
    gameState.config
  );

  return {
    gameState,
    displayBoard,
    activeHighlightPitId,
    currentStepType,
    nextTargetPitId: manualMoveState.isActive ? manualMoveState.nextTargetPitId : null,
    manualInvalidPitId,
    manualWarningMessage,
    handSeedCount,
    lastCaptureInfo,
    legalMoves,
    hintPitId,
    requestHint,
    clearHint,
    sound,
    makeAIMove,
    handleSelectPit,
    handleManualAdvanceTarget,
    isManualMode,
    toggleManualMode,
    manualMoveState,
    advanceManualStep,
    completeManualMoveAuto,
    restart,
    setGameMode,
    setDifficulty,
    aiSpeed,
    setAiSpeed,
    config: gameState.config,
    updateConfig,
    applyPreset,
    achievements,
    playerStats,
    newlyUnlockedAchievement,
    dismissAchievementNotification,
  };
}
