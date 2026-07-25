import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Modal, 
  ActivityIndicator, 
  Alert,
  Platform,
  Dimensions,
  SafeAreaView,
  StatusBar,
  PanResponder
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { Exercise, TrackingType, WorkoutSet, SetMetrics } from '@/types/database';
import ExerciseInfoModal from './ExerciseInfoModal';
import Svg, { Path, G, Rect } from 'react-native-svg';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const screenWidth = Dimensions.get('window').width;
const rowWidth = screenWidth - 64; // Ajustado para padding horizontal de scrollContent (16) y blockCard (16)

export default function ActiveWorkoutSheet() {
  const { 
    activeWorkout, 
    activeBlocks, 
    activeWorkoutExpanded, 
    setActiveWorkoutExpanded,
    exercises, 
    loading, 
    addExerciseToWorkout, 
    removeExerciseFromWorkout, 
    addSetToBlock, 
    updateSet, 
    removeSetFromBlock, 
    finishWorkout,
    cancelWorkout,
    exerciseUnits,
    exerciseRestDurations,
    setExerciseRestDuration,
    setExerciseUnit,
    editingWorkoutId,
    workoutsHistory,
    updateBlockNotes,
    toggleBlockSuperset,
    reorderExercises,
    replaceExerciseInBlock,
  } = useWorkoutStore();

  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Temporizador de descanso (Rest Timer)
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [initialRestDuration, setInitialRestDuration] = useState(90);
  const [restModalVisible, setRestModalVisible] = useState(false);
  const [lastCompletedBlockId, setLastCompletedBlockId] = useState<string | null>(null);
  const [restingExerciseId, setRestingExerciseId] = useState<string | null>(null);

  // Estados para detalles de ejercicio
  const [selectedExerciseForInfo, setSelectedExerciseForInfo] = useState<Exercise | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [heatmapModalVisible, setHeatmapModalVisible] = useState(false);

  // Estados para menú de bloque (Reordenar, reemplazar, superset)
  const [activeBlockMenuId, setActiveBlockMenuId] = useState<string | null>(null);
  const [blockMenuModalVisible, setBlockMenuModalVisible] = useState(false);

  // Estados para confirmación personalizada (para no depender de Alert.alert)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    title: string;
    message: string;
    cancelText?: string;
    confirmText?: string;
    confirmStyle?: 'default' | 'destructive';
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = (data: {
    title: string;
    message: string;
    cancelText?: string;
    confirmText?: string;
    confirmStyle?: 'default' | 'destructive';
    onConfirm: () => void;
  }) => {
    setConfirmModalData(data);
    setConfirmModalVisible(true);
  };

  // Estados para selección de tipo de serie
  const [selectedSetForTypeChange, setSelectedSetForTypeChange] = useState<{ blockId: string; setId: string; currentType: string } | null>(null);
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  // Estados para selección de RPE
  const [selectedSetForRpe, setSelectedSetForRpe] = useState<{ blockId: string; setId: string; currentRpe: number | null } | null>(null);
  const [rpeModalVisible, setRpeModalVisible] = useState(false);

  // Estados para modal de información de columnas (SET, PREVIOUS, KG, REPS, RPE)
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const [infoSheetType, setInfoSheetType] = useState<'SET' | 'PREVIOUS' | 'KG' | 'REPS' | 'RPE' | null>(null);
  const [infoSheetExerciseId, setInfoSheetExerciseId] = useState<string | null>(null);

  const handleHeaderInfoPress = (type: 'SET' | 'PREVIOUS' | 'KG' | 'REPS' | 'RPE', exerciseId?: string) => {
    setInfoSheetType(type);
    if (exerciseId) {
      setInfoSheetExerciseId(exerciseId);
    } else {
      setInfoSheetExerciseId(null);
    }
    setInfoSheetVisible(true);
  };

  // Estados para modal de Reloj (Timer y Stopwatch de Cabecera)
  const [clockModalVisible, setClockModalVisible] = useState(false);
  const [clockActiveTab, setClockActiveTab] = useState<'timer' | 'stopwatch'>('timer');
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [configuredRestSeconds, setConfiguredRestSeconds] = useState(60);

  // Estados para cronómetro manual (Stopwatch) en el modal
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);

  // Conteo regresivo del cronómetro manual (Stopwatch)
  useEffect(() => {
    let interval: any = null;
    if (stopwatchRunning) {
      interval = setInterval(() => {
        setStopwatchSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [stopwatchRunning]);

  // Gestos para minimizar la sesión deslizando hacia abajo
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return gestureState.dy > 15 && Math.abs(gestureState.dx) < 15;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 100) {
          setActiveWorkoutExpanded(false);
        }
      },
    })
  ).current;

  // Sincronizar cronómetro con la hora real de inicio (solo si NO estamos editando)
  useEffect(() => {
    if (!activeWorkout) return;

    if (editingWorkoutId !== null) {
      // Si estamos editando, mostrar la duración total fija de la sesión
      const start = new Date(activeWorkout.start_time).getTime();
      const end = new Date(activeWorkout.end_time || new Date().toISOString()).getTime();
      setSecondsElapsed(Math.max(0, Math.floor((end - start) / 1000)));
      return;
    }

    const updateTimer = () => {
      const start = new Date(activeWorkout.start_time).getTime();
      const now = Date.now();
      setSecondsElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout, editingWorkoutId]);

  // Conteo regresivo de descanso
  useEffect(() => {
    if (restSeconds === null || isTimerPaused) return;
    if (restSeconds <= 0) {
      setRestSeconds(null);
      showConfirm({
        title: '¡Descanso Terminado!',
        message: 'Prepárate para la siguiente serie.',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }
    const interval = setInterval(() => {
      setRestSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [restSeconds, isTimerPaused]);

  if (!activeWorkout) return null;

  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const saveWorkoutDirectly = async () => {
    const success = await finishWorkout();
    if (success) {
      setRestSeconds(null);
    } else {
      showConfirm({
        title: 'Error',
        message: 'Hubo un problema al guardar en Supabase.',
        confirmText: 'Aceptar',
        onConfirm: () => {}
      });
    }
  };

  const handleFinish = async () => {
    if (activeBlocks.length === 0) {
      showConfirm({
        title: 'Entrenamiento vacío',
        message: 'No has añadido ningún ejercicio. ¿Deseas cancelarlo?',
        cancelText: 'Seguir editando',
        confirmText: 'Cancelar entrenamiento',
        confirmStyle: 'destructive',
        onConfirm: () => {
          cancelWorkout();
          setRestSeconds(null);
        }
      });
      return;
    }

    // Calcular duración en minutos para la advertencia
    const start = new Date(activeWorkout.start_time).getTime();
    const end = activeWorkout.end_time ? new Date(activeWorkout.end_time).getTime() : Date.now();
    const durationMinutes = (end - start) / 60000;

    if (durationMinutes < 30) {
      showConfirm({
        title: '¡Entrenamiento muy corto!',
        message: 'Esta sesión duró muy poco. ¿Deseas modificar la hora de finalización para corregirla?',
        cancelText: 'Corregir hora',
        confirmText: 'Guardar de todos modos',
        confirmStyle: 'default',
        onConfirm: saveWorkoutDirectly
      });
    } else {
      await saveWorkoutDirectly();
    }
  };

  const handleCancel = () => {
    const title = editingWorkoutId !== null ? 'Descartar cambios' : 'Cancelar rutina';
    const message = editingWorkoutId !== null 
      ? '¿Seguro que deseas descartar las modificaciones hechas a esta sesión?' 
      : '¿Seguro que deseas cancelar este entrenamiento? Se borrarán los datos de esta sesión.';
      
    showConfirm({
      title,
      message,
      cancelText: 'Continuar',
      confirmText: 'Sí, salir',
      confirmStyle: 'destructive',
      onConfirm: () => {
        cancelWorkout();
        setRestSeconds(null);
      }
    });
  };

  const handleManualRestPress = () => {
    setRestModalVisible(true);
  };

  const adjustRestTime = (amount: number) => {
    setRestSeconds((prev) => {
      if (prev === null) return null;
      const nextVal = prev + amount;
      return nextVal > 0 ? nextVal : 0;
    });
  };

  const handleExerciseTitlePress = (exercise: Exercise) => {
    setSelectedExerciseForInfo(exercise);
    setInfoModalVisible(true);
  };

  const handleTypeSelect = (type: string) => {
    if (!selectedSetForTypeChange) return;
    updateSet(selectedSetForTypeChange.blockId, selectedSetForTypeChange.setId, { set_type: type });
    setTypeModalVisible(false);
    setSelectedSetForTypeChange(null);
  };

  const handleRpeSelect = (rpe: number | null) => {
    if (!selectedSetForRpe) return;
    updateSet(selectedSetForRpe.blockId, selectedSetForRpe.setId, { rpe });
    setRpeModalVisible(false);
    setSelectedSetForRpe(null);
  };

  const toggleSetCompleted = (blockId: string, setId: string, currentCompleted: boolean, exerciseId: string) => {
    updateSet(blockId, setId, { completed: !currentCompleted });
    
    // Si se marca como completada, se inicia el temporizador (SOLO si NO estamos editando)
    if (!currentCompleted && editingWorkoutId === null) {
      const specificRest = exerciseRestDurations[exerciseId] || 90;
      setRestSeconds(specificRest);
      setInitialRestDuration(specificRest);
      setLastCompletedBlockId(blockId);
    }
  };

  // Buscar última marca de este set en el historial
  const getPreviousSetText = (exerciseId: string, setNumber: number) => {
    const unit = exerciseUnits[exerciseId] || 'Kg';
    for (const workout of workoutsHistory) {
      const block = workout.blocks.find(b => b.exercise_id === exerciseId);
      if (block) {
        const histSet = block.sets.find(s => s.set_number === setNumber);
        if (histSet) {
          if (block.exercise.tracking_type === 'WEIGHT_REPS') {
            const m = histSet.metrics as { weight: number; reps: number };
            // Hacer conversión dinámica si la unidad difiere
            const w = unit === 'Lb' ? Math.round(m.weight * 2.20462 * 10) / 10 : m.weight;
            return `${w} ${unit.toLowerCase()} × ${m.reps}`;
          } else if (block.exercise.tracking_type === 'TIME_VARIANT') {
            const m = histSet.metrics as { duration_seconds: number; added_weight?: number };
            return `${m.duration_seconds}s`;
          }
        }
      }
    }
    return '—';
  };

  const handleAutofillFromPrevious = (blockId: string, setId: string, exerciseId: string, setNumber: number) => {
    const prevText = getPreviousSetText(exerciseId, setNumber);
    if (!prevText || prevText === '—') return;
    
    const cleaned = prevText.toLowerCase().replace(/\s+/g, '');
    
    // Coincidir con WEIGHT_REPS (por ejemplo: "20kg×15" o "40kg×10@9.5rpe")
    const weightRepsMatch = cleaned.match(/^([\d.]+)(?:kg|lb)?(?:x|×)(\d+)(?:@([\d.,]+))?/);
    if (weightRepsMatch) {
      const weight = parseFloat(weightRepsMatch[1]) || 0;
      const reps = parseInt(weightRepsMatch[2], 10) || 0;
      const rpeStr = weightRepsMatch[3] ? weightRepsMatch[3].replace(',', '.') : null;
      const rpe = rpeStr ? parseFloat(rpeStr) : null;
      
      const targetBlock = activeBlocks.find(b => b.id === blockId);
      const targetSet = targetBlock?.sets.find(s => s.id === setId);
      if (targetSet) {
        const metrics = targetSet.metrics as { weight: number; reps: number };
        updateSet(blockId, setId, {
          metrics: { ...metrics, weight, reps },
          rpe: rpe !== null ? rpe : targetSet.rpe
        });
      }
      return;
    }
    
    // Coincidir con TIME_VARIANT (por ejemplo: "30s")
    const timeMatch = cleaned.match(/^(\d+)s$/);
    if (timeMatch) {
      const secs = parseInt(timeMatch[1], 10) || 0;
      const targetBlock = activeBlocks.find(b => b.id === blockId);
      const targetSet = targetBlock?.sets.find(s => s.id === setId);
      if (targetSet) {
        const metrics = targetSet.metrics as { duration_seconds: number; added_weight?: number };
        updateSet(blockId, setId, {
          metrics: { ...metrics, duration_seconds: secs }
        });
      }
      return;
    }
  };

  // Lógica para modificar la hora y minuto del entrenamiento histórico
  const handleTimeChange = (type: 'start' | 'end', part: 'hours' | 'minutes', value: string) => {
    if (!activeWorkout) return;
    const targetDateStr = type === 'start' ? activeWorkout.start_time : (activeWorkout.end_time || new Date().toISOString());
    const d = new Date(targetDateStr);
    
    const numVal = parseInt(value) || 0;
    if (part === 'hours') {
      d.setHours(Math.min(23, Math.max(0, numVal)));
    } else {
      d.setMinutes(Math.min(59, Math.max(0, numVal)));
    }
    
    useWorkoutStore.setState(state => ({
      activeWorkout: state.activeWorkout ? {
        ...state.activeWorkout,
        [type === 'start' ? 'start_time' : 'end_time']: d.toISOString()
      } : null
    }));

    const nextStart = type === 'start' ? d.getTime() : new Date(activeWorkout.start_time).getTime();
    const nextEnd = type === 'end' ? d.getTime() : new Date(activeWorkout.end_time || '').getTime();
    setSecondsElapsed(Math.max(0, Math.floor((nextEnd - nextStart) / 1000)));
  };

  const formatRestDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderMetricInputs = (blockId: string, set: WorkoutSet, type: TrackingType, exerciseId: string) => {
    const unit = exerciseUnits[exerciseId] || 'Kg';
    switch (type) {
      case 'WEIGHT_REPS': {
        const metrics = set.metrics as { weight: number; reps: number };
        return (
          <View style={styles.metricsRow}>
            <TextInput
              style={styles.metricInput}
              keyboardType="decimal-pad"
              placeholder={unit}
              placeholderTextColor="#48484A"
              value={metrics.weight ? String(metrics.weight) : ''}
              onChangeText={(text) => {
                const val = parseFloat(text.replace(',', '.')) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, weight: val } });
              }}
            />
            <Text style={styles.metricDivider}>×</Text>
            <TextInput
              style={styles.metricInput}
              keyboardType="number-pad"
              placeholder="Reps"
              placeholderTextColor="#48484A"
              value={metrics.reps ? String(metrics.reps) : ''}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, reps: val } });
              }}
            />
          </View>
        );
      }
      case 'TIME_VARIANT': {
        const metrics = set.metrics as { duration_seconds: number; added_weight?: number };
        return (
          <View style={styles.metricsRow}>
            <TextInput
              style={[styles.metricInput, { flex: 1.5 }]}
              keyboardType="number-pad"
              placeholder="Seg"
              placeholderTextColor="#48484A"
              value={metrics.duration_seconds ? String(metrics.duration_seconds) : ''}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, duration_seconds: val } });
              }}
            />
            <Text style={styles.metricLabel}>seg</Text>
            <TextInput
              style={styles.metricInput}
              keyboardType="decimal-pad"
              placeholder={`+${unit}`}
              placeholderTextColor="#48484A"
              value={metrics.added_weight ? String(metrics.added_weight) : ''}
              onChangeText={(text) => {
                const val = parseFloat(text.replace(',', '.')) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, added_weight: val } });
              }}
            />
          </View>
        );
      }
      case 'HEIGHT_CONTACTS': {
        const metrics = set.metrics as { height_cm: number; contacts: number; ground_contact_time_ms?: number };
        return (
          <View style={styles.metricsRow}>
            <TextInput
              style={styles.metricInput}
              keyboardType="number-pad"
              placeholder="Cm"
              placeholderTextColor="#48484A"
              value={metrics.height_cm ? String(metrics.height_cm) : ''}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, height_cm: val } });
              }}
            />
            <Text style={styles.metricDivider}>/</Text>
            <TextInput
              style={styles.metricInput}
              keyboardType="number-pad"
              placeholder="Reps"
              placeholderTextColor="#48484A"
              value={metrics.contacts ? String(metrics.contacts) : ''}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, contacts: val } });
              }}
            />
          </View>
        );
      }
    }
  };

  const rpeOptions = [
    1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 
    6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10
  ];

  const filteredExercises = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calcular completado de series totales
  const totalSetsCount = activeBlocks.reduce((acc, b) => acc + b.sets.length, 0);
  const completedSetsCount = activeBlocks.reduce((acc, b) => acc + b.sets.filter(s => s.completed).length, 0);
  const setsProgressPct = totalSetsCount > 0 ? completedSetsCount / totalSetsCount : 0;

  // Calcular volumen levantado acumulado en la sesión (solo para series completadas)
  const activeVolume = activeBlocks.reduce((sum, block) => {
    let blockVol = 0;
    block.sets.forEach((set) => {
      if (set.completed) {
        if (block.exercise.tracking_type === 'WEIGHT_REPS') {
          const m = set.metrics as { weight: number; reps: number };
          const unit = exerciseUnits[block.exercise_id] || 'Kg';
          const w = unit === 'Lb' ? Math.round(m.weight * 2.20462 * 10) / 10 : m.weight;
          blockVol += (w || 0) * (m.reps || 0);
        } else if (block.exercise.tracking_type === 'TIME_VARIANT') {
          const m = set.metrics as { duration_seconds: number; added_weight?: number };
          const unit = exerciseUnits[block.exercise_id] || 'Kg';
          const w = unit === 'Lb' ? Math.round((m.added_weight || 0) * 2.20462 * 10) / 10 : (m.added_weight || 0);
          blockVol += (w || 0) * (m.duration_seconds || 0);
        }
      }
    });
    return sum + blockVol;
  }, 0);

  // Calcular contribuciones musculares para el heatmap
  const getMuscleContributions = () => {
    const scores: Record<string, number> = {
      Chest: 0,
      Shoulders: 0,
      Triceps: 0,
      Back: 0,
      Biceps: 0,
      Forearms: 0,
      Quads: 0,
      Hamstrings: 0,
      Abs: 0,
      Glutes: 0,
    };

    activeBlocks.forEach((block) => {
      const completedSets = block.sets.filter((s) => s.completed).length;
      if (completedSets === 0) return;

      const m = block.exercise.muscle_group.toLowerCase();
      if (m.includes('chest') || m.includes('pecho') || m.includes('bench press')) {
        scores.Chest += completedSets;
        scores.Shoulders += completedSets * 0.5;
        scores.Triceps += completedSets * 0.5;
      } else if (m.includes('shoulder') || m.includes('hombro') || m.includes('press militar') || m.includes('lateral raise')) {
        scores.Shoulders += completedSets;
        scores.Triceps += completedSets * 0.5;
      } else if (m.includes('back') || m.includes('espalda') || m.includes('pull up') || m.includes('row') || m.includes('jalon') || m.includes('deadlift')) {
        scores.Back += completedSets;
        scores.Biceps += completedSets * 0.5;
        scores.Forearms += completedSets * 0.5;
      } else if (m.includes('quad') || m.includes('cuadriceps') || m.includes('squat') || m.includes('pierna') || m.includes('leg')) {
        scores.Quads += completedSets;
        scores.Hamstrings += completedSets * 0.5;
        scores.Glutes += completedSets * 0.5;
      } else if (m.includes('bicep')) {
        scores.Biceps += completedSets;
        scores.Forearms += completedSets * 0.3;
      } else if (m.includes('tricep')) {
        scores.Triceps += completedSets;
      } else if (m.includes('core') || m.includes('abs') || m.includes('abdominales')) {
        scores.Abs += completedSets;
      } else {
        const group = block.exercise.muscle_group;
        if (scores[group] !== undefined) {
          scores[group] += completedSets;
        } else {
          scores.Chest += completedSets;
        }
      }
    });

    return scores;
  };

  const muscleScores = getMuscleContributions();

  // 1. RENDERIZADO DEL ESTADO EXPANDIDO (Modal Pantalla Completa)
  if (activeWorkoutExpanded) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalScreenContainer}>
          <StatusBar barStyle="light-content" />
          
          {/* Barra superior de arrastre para minimizar con gesto */}
          <View style={styles.topDragIndicatorRow} {...panResponder.panHandlers}>
            <View style={styles.topDragPill} />
          </View>

          {/* Cabecera del Entrenamiento Activo (Image 1 Style) */}
          <View style={styles.premiumHeader} {...panResponder.panHandlers}>
            <TouchableOpacity onPress={() => setActiveWorkoutExpanded(false)} style={styles.headerChevronRow}>
              <Text style={styles.headerChevronSymbol}>∨</Text>
              <Text style={styles.headerLogTitle}>
                {editingWorkoutId !== null ? 'Edit Workout' : 'Log Workout'}
              </Text>
            </TouchableOpacity>

            <View style={styles.headerActionsRow}>
              <TouchableOpacity 
                style={styles.headerRoundPauseBtn}
                onPress={() => {
                  setClockModalVisible(true);
                }}
              >
                <Ionicons name="stopwatch-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.headerFinishPill} onPress={handleFinish} disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.headerFinishPillText}>Finish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Fila de Métricas Secundarias (Duration, Volume, Sets, Heatmap Icon) */}
          <View style={styles.sessionStatsHeaderRow}>
            <View style={styles.sessionStatCol}>
              <Text style={styles.sessionStatLabel}>Duration</Text>
              <Text style={styles.sessionStatValueBlue}>{formatTime(secondsElapsed)}</Text>
            </View>
            
            <View style={styles.sessionStatCol}>
              <Text style={styles.sessionStatLabel}>Volume</Text>
              <Text style={styles.sessionStatValue}>{activeVolume} kg</Text>
            </View>
            
            <View style={styles.sessionStatCol}>
              <Text style={styles.sessionStatLabel}>Sets</Text>
              <Text style={styles.sessionStatValue}>{completedSetsCount}</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.heatmapHeaderMiniTrigger} 
              onPress={() => setHeatmapModalVisible(true)}
            >
              <View style={styles.miniHeatmapGraphics}>
                <Ionicons name="body-outline" size={20} color="#0082FF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Barra de Progreso de Series (Image 1 Style) */}
          <View style={styles.setsProgressBarRow}>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${setsProgressPct * 100}%` }]} />
            </View>
            <Text style={styles.progressBarLabel}>{completedSetsCount}/{totalSetsCount} sets</Text>
          </View>

          {/* Listado de Ejercicios en Scroll */}
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent} 
            keyboardShouldPersistTaps="handled"
          >
            
            {/* PANEL DE EDICIÓN DE DETALLES DE SESIÓN (Solo en modo edición) */}
            {editingWorkoutId !== null && (
              <View style={styles.editDetailsCard}>
                <Text style={styles.editSectionTitle}>Editar Detalles de Sesión</Text>
                
                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Nombre:</Text>
                  <TextInput
                    style={styles.editInputName}
                    value={activeWorkout.name}
                    onChangeText={(text) => {
                      useWorkoutStore.setState(state => ({
                        activeWorkout: state.activeWorkout ? { ...state.activeWorkout, name: text } : null
                      }));
                    }}
                  />
                </View>

                <View style={styles.editTimeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editLabel}>Inicio (Hora:Min):</Text>
                    <View style={styles.timeInputs}>
                      <TextInput
                        style={styles.editTimeInput}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder="HH"
                        placeholderTextColor="#8E8E93"
                        value={new Date(activeWorkout.start_time).getHours().toString().padStart(2, '0')}
                        onChangeText={(text) => handleTimeChange('start', 'hours', text)}
                      />
                      <Text style={styles.timeDivider}>:</Text>
                      <TextInput
                        style={styles.editTimeInput}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder="MM"
                        placeholderTextColor="#8E8E93"
                        value={new Date(activeWorkout.start_time).getMinutes().toString().padStart(2, '0')}
                        onChangeText={(text) => handleTimeChange('start', 'minutes', text)}
                      />
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.editLabel}>Fin (Hora:Min):</Text>
                    <View style={styles.timeInputs}>
                      <TextInput
                        style={styles.editTimeInput}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder="HH"
                        placeholderTextColor="#8E8E93"
                        value={activeWorkout.end_time ? new Date(activeWorkout.end_time).getHours().toString().padStart(2, '0') : ''}
                        onChangeText={(text) => handleTimeChange('end', 'hours', text)}
                      />
                      <Text style={styles.timeDivider}>:</Text>
                      <TextInput
                        style={styles.editTimeInput}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder="MM"
                        placeholderTextColor="#8E8E93"
                        value={activeWorkout.end_time ? new Date(activeWorkout.end_time).getMinutes().toString().padStart(2, '0') : ''}
                        onChangeText={(text) => handleTimeChange('end', 'minutes', text)}
                      />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {activeBlocks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Registra tu primer ejercicio agregándolo desde el botón inferior.</Text>
              </View>
            ) : (
              activeBlocks.map((block) => {
                const exerciseRest = exerciseRestDurations[block.exercise.id] || 90;
                const completedSetsInBlock = block.sets.filter(s => s.completed).length;

                return (
                  <View 
                    key={block.id} 
                    style={[
                      styles.blockCard,
                      block.superset_id ? styles.blockCardSuperset : null
                    ]}
                  >
                    {/* Indicador de Superset */}
                    {block.superset_id && (
                      <View style={styles.supersetHeaderPill}>
                        <Text style={styles.supersetHeaderText}>Superset</Text>
                      </View>
                    )}

                    {/* Encabezado del bloque de ejercicio (Image 1 style) */}
                    <View style={styles.blockHeader}>
                      <View style={[
                        styles.exerciseRoundIcon,
                        block.superset_id ? { backgroundColor: '#8A2BE2' } : null
                      ]}>
                        <MaterialCommunityIcons name="dumbbell" size={18} color="#FFFFFF" />
                      </View>
                      
                      <TouchableOpacity 
                        onPress={() => handleExerciseTitlePress(block.exercise)}
                        style={{ flex: 1 }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.exerciseTitle}>{block.exercise.name}</Text>
                        <Text style={styles.exerciseSubtitle}>
                          {block.exercise.muscle_group} • {block.exercise.tracking_type === 'WEIGHT_REPS' ? 'Carga' : 'Duración'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        onPress={() => {
                          setActiveBlockMenuId(block.id);
                          setBlockMenuModalVisible(true);
                        }}
                        style={styles.moreOptionsBtn}
                      >
                        <Feather name="more-horizontal" size={20} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>

                    {/* Campo de Notas del Ejercicio (se arrastra al repetir ejercicio) */}
                    <View style={styles.blockNotesWrapper}>
                      <TextInput
                        style={styles.blockNotesInput}
                        placeholder="Add notes..."
                        placeholderTextColor="#48484A"
                        value={block.notes || ''}
                        onChangeText={(text) => updateBlockNotes(block.id, text)}
                        multiline={true}
                        numberOfLines={2}
                      />
                    </View>

                    {/* Fila de temporizador de descanso interno (Image 1 style) */}
                    <TouchableOpacity 
                      style={styles.blockRestRow}
                      onPress={() => {
                        setRestingExerciseId(block.exercise.id);
                        setRestModalVisible(true);
                      }}
                    >
                      {lastCompletedBlockId === block.id && restSeconds !== null && restSeconds > 0 && (
                        <View style={[styles.blockRestRowFill, { width: `${(restSeconds > 240 ? 1 : restSeconds / 240) * 100}%` }]} />
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 2 }}>
                        <Ionicons name="timer-outline" size={14} color="#8E8E93" />
                        <Text style={styles.blockRestLabel}>
                          {lastCompletedBlockId === block.id && restSeconds !== null && restSeconds > 0
                            ? `Rest: ${formatTime(restSeconds)}`
                            : `Rest ${formatRestDuration(exerciseRest)}`}
                        </Text>
                      </View>
                      <Text style={[styles.blockRestDone, { zIndex: 2 }]}>{completedSetsInBlock}/{block.sets.length} done</Text>
                    </TouchableOpacity>

                    {/* Encabezados de Tabla */}
                    <View style={styles.tableHeader}>
                      <TouchableOpacity onPress={() => handleHeaderInfoPress('SET')} style={{ width: 35 }}>
                        <Text style={[styles.colHeader, { textAlign: 'center' }]}>SET</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleHeaderInfoPress('PREVIOUS')} style={{ width: 90 }}>
                        <Text style={styles.colHeader}>PREVIOUS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleHeaderInfoPress('KG', block.exercise.id)} style={{ flex: 1 }}>
                        <Text style={[styles.colHeader, { textAlign: 'center' }]}>
                          {exerciseUnits[block.exercise.id] || 'KG'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleHeaderInfoPress('REPS')} style={{ flex: 1 }}>
                        <Text style={[styles.colHeader, { textAlign: 'center' }]}>REPS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleHeaderInfoPress('RPE')} style={{ width: 45 }}>
                        <Text style={[styles.colHeader, { textAlign: 'center' }]}>RPE</Text>
                      </TouchableOpacity>

                      <View style={{ width: 40 }} />
                    </View>

                    {/* Series con Deslizamiento (Swipe to Delete) */}
                    {block.sets.map((set) => (
                      <ScrollView
                        key={set.id}
                        horizontal={true}
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={70}
                        snapToAlignment="end"
                        decelerationRate="fast"
                        contentContainerStyle={styles.swipeContainer}
                        style={styles.swipeScrollView}
                      >
                        {/* Cuerpo Fijo de la Serie */}
                        <View style={[
                          styles.setRowContent,
                          set.completed ? styles.setRowContentCompleted : null
                        ]}>
                          
                          {/* Indicador de Tipo de Serie (Círculos coloridos en W o Números) */}
                          <TouchableOpacity
                            style={[
                              styles.setTypeBadgeCircle,
                              set.set_type === 'WARMUP' && styles.badgeCircleW,
                              set.set_type === 'DROP' && styles.badgeCircleD,
                              set.set_type === 'FAILURE' && styles.badgeCircleF
                            ]}
                            onPress={() => {
                              setSelectedSetForTypeChange({ blockId: block.id, setId: set.id, currentType: set.set_type });
                              setTypeModalVisible(true);
                            }}
                          >
                            <Text style={[
                              styles.setTypeBadgeText,
                              set.set_type === 'WARMUP' && { color: '#FF9500' },
                              (set.set_type === 'DROP' || set.set_type === 'FAILURE') && { color: '#FFFFFF' }
                            ]}>
                              {set.set_type === 'WARMUP' ? 'W' : set.set_type === 'DROP' ? 'D' : set.set_type === 'FAILURE' ? 'F' : set.set_number}
                            </Text>
                          </TouchableOpacity>

                          {/* Record Anterior Dinámico con Relleno Automático */}
                          <TouchableOpacity 
                            style={styles.previousRecordButton}
                            onPress={() => handleAutofillFromPrevious(block.id, set.id, block.exercise.id, set.set_number)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.previousRecordText} numberOfLines={1}>
                              {getPreviousSetText(block.exercise.id, set.set_number)}
                            </Text>
                          </TouchableOpacity>

                          {/* Campos de Métricas Integrados de Forma Limpia (Sin Bordes) */}
                          <View style={styles.metricsWrapperRow}>
                            {renderMetricInputs(block.id, set, block.exercise.tracking_type, block.exercise.id)}
                          </View>

                          {/* Botón Selector RPE */}
                          <TouchableOpacity 
                            style={styles.rpeButtonPill}
                            onPress={() => {
                              setSelectedSetForRpe({ blockId: block.id, setId: set.id, currentRpe: set.rpe });
                              setRpeModalVisible(true);
                            }}
                          >
                            <Text style={[
                              styles.rpeButtonText, 
                              set.rpe !== null && { color: '#FFD60A', fontWeight: '800' }
                            ]}>
                              {set.rpe !== null ? String(set.rpe) : '—'}
                            </Text>
                          </TouchableOpacity>

                          {/* Botón de Check Circular Verde */}
                          <TouchableOpacity 
                            style={[
                              styles.circleCheckButton,
                              set.completed && styles.circleCheckButtonActive
                            ]}
                            onPress={() => toggleSetCompleted(block.id, set.id, !!set.completed, block.exercise.id)}
                          >
                            {set.completed && (
                              <Text style={styles.circleCheckIcon}>✓</Text>
                            )}
                          </TouchableOpacity>
                        </View>

                        {/* Botón de eliminar oculto a la derecha */}
                        <TouchableOpacity 
                          style={styles.swipeDeleteAction}
                          onPress={() => removeSetFromBlock(block.id, set.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.swipeDeleteActionText}>Eliminar</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    ))}

                    <TouchableOpacity 
                      style={styles.addSetBtn} 
                      onPress={() => addSetToBlock(block.id)}
                    >
                      <Text style={styles.addSetText}>+ Add set</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Acciones del pie de página (Image 1 Style: Limpio) */}
          <View style={styles.actionFooter}>
            <TouchableOpacity 
              style={styles.cancelBtn}
              onPress={handleCancel}
            >
              <Text style={styles.cancelBtnText}>{editingWorkoutId !== null ? 'Discard' : 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.addExerciseBtn}
              onPress={() => setExerciseModalVisible(true)}
            >
              <Text style={styles.addExerciseBtnText}>+ Add exercise</Text>
            </TouchableOpacity>
          </View>

          {/* Panel Flotante de Temporizador de Descanso Manual (Estilo Image 2 al fondo) */}
          {restSeconds !== null && restSeconds > 0 && (() => {
            const progress = initialRestDuration > 0 ? (restSeconds / initialRestDuration) * 100 : 100;
            return (
              <View style={styles.footerRestBanner}>
                {/* Barra de progreso de descanso azul y fina arriba */}
                <View style={[styles.restProgressBarFill, { width: `${progress}%` }]} />
                
                <View style={styles.footerRestRowContent}>
                  <TouchableOpacity style={styles.adjustPillBtn} onPress={() => adjustRestTime(-15)}>
                    <Text style={styles.adjustPillText}>- 15</Text>
                  </TouchableOpacity>

                  <View style={styles.footerRestTimeBox}>
                    <Text style={styles.footerRestLabelTitle}>Resting</Text>
                    <Text style={styles.footerRestCounter}>{formatTime(restSeconds)}</Text>
                  </View>

                  <TouchableOpacity style={styles.adjustPillBtn} onPress={() => adjustRestTime(15)}>
                    <Text style={styles.adjustPillText}>+ 15</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.skipRestBtn} onPress={() => setRestSeconds(null)}>
                    <Text style={styles.skipRestBtnText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          {/* MODAL: MUSCLE HEATMAP / DISTRIBUTION (Image 3 Style) */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={heatmapModalVisible}
            onRequestClose={() => setHeatmapModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => setHeatmapModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.heatmapModalContent} onPress={() => {}}>
                <Text style={styles.heatmapModalTitle}>Muscle Distribution</Text>
                <Text style={styles.heatmapModalSubtitle}>Visual target summary for this session</Text>
                
                {/* Body Diagram Outlines (Side by Side) */}
                <View style={styles.heatmapBodyDiagramsRow}>
                  <View style={styles.diagramCol}>
                    <Text style={styles.diagramColLabel}>FRONT</Text>
                    <MuscleBodyHeatmap scores={muscleScores} type="front" />
                  </View>
                  <View style={styles.diagramCol}>
                    <Text style={styles.diagramColLabel}>BACK</Text>
                    <MuscleBodyHeatmap scores={muscleScores} type="back" />
                  </View>
                </View>

                {/* Muscle score progress bars */}
                <ScrollView style={styles.heatmapScoresList} contentContainerStyle={{ paddingBottom: 10 }}>
                  {Object.entries(muscleScores)
                    .filter(([_, val]) => val > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([muscle, score]) => {
                      const maxScore = Math.max(...Object.values(muscleScores), 1);
                      const pct = (score / maxScore) * 100;
                      return (
                        <View key={muscle} style={styles.muscleScoreRow}>
                          <View style={styles.muscleRowText}>
                            <Text style={styles.muscleNameLabel}>{muscle}</Text>
                            <Text style={styles.muscleScoreLabel}>{score} set{score !== 1 ? 's' : ''}</Text>
                          </View>
                          <View style={styles.muscleProgressBarTrack}>
                            <View style={[styles.muscleProgressBarFill, { width: `${pct}%` }]} />
                          </View>
                        </View>
                      );
                    })}
                  {Object.values(muscleScores).every(val => val === 0) && (
                    <Text style={styles.heatmapEmptyText}>Completa series de ejercicios para pintar el heatmap de esta rutina.</Text>
                  )}
                </ScrollView>

                <TouchableOpacity style={styles.heatmapCloseBtn} onPress={() => setHeatmapModalVisible(false)}>
                  <Text style={styles.heatmapCloseBtnText}>Cerrar Heatmap</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* MODAL DE MENÚ DE BLOQUE DE EJERCICIO (Reorder, Replace, Superset...) */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={blockMenuModalVisible}
            onRequestClose={() => {
              setBlockMenuModalVisible(false);
              setActiveBlockMenuId(null);
            }}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay}
              activeOpacity={1}
              onPress={() => {
                setBlockMenuModalVisible(false);
                setActiveBlockMenuId(null);
              }}
            >
              <TouchableOpacity activeOpacity={1} style={styles.popoverContent} onPress={() => {}}>
                <Text style={styles.popoverTitle}>Exercise Actions</Text>
                
                {/* Reorder Exercises option */}
                {(() => {
                  if (!activeBlockMenuId) return null;
                  const blockIdx = activeBlocks.findIndex(b => b.id === activeBlockMenuId);
                  return (
                    <View style={styles.reorderActionsRow}>
                      <TouchableOpacity 
                        style={[styles.reorderPill, blockIdx === 0 && styles.reorderPillDisabled]}
                        disabled={blockIdx === 0}
                        onPress={() => {
                          reorderExercises(blockIdx, blockIdx - 1);
                          setBlockMenuModalVisible(false);
                          setActiveBlockMenuId(null);
                        }}
                      >
                        <Feather name="chevron-up" size={16} color={blockIdx === 0 ? '#48484A' : '#FFFFFF'} />
                        <Text style={[styles.reorderText, blockIdx === 0 && { color: '#48484A' }]}>Move Up</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.reorderPill, blockIdx === activeBlocks.length - 1 && styles.reorderPillDisabled]}
                        disabled={blockIdx === activeBlocks.length - 1}
                        onPress={() => {
                          reorderExercises(blockIdx, blockIdx + 1);
                          setBlockMenuModalVisible(false);
                          setActiveBlockMenuId(null);
                        }}
                      >
                        <Feather name="chevron-down" size={16} color={blockIdx === activeBlocks.length - 1 ? '#48484A' : '#FFFFFF'} />
                        <Text style={[styles.reorderText, blockIdx === activeBlocks.length - 1 && { color: '#48484A' }]}>Move Down</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}

                {/* Replace Exercise option */}
                <TouchableOpacity 
                  style={styles.typeOptionCard}
                  onPress={() => {
                    setExerciseModalVisible(true);
                  }}
                >
                  <Feather name="refresh-cw" size={20} color="#0082FF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>Replace Exercise</Text>
                    <Text style={styles.typeOptionDesc}>Swap this exercise with another while keeping sets</Text>
                  </View>
                </TouchableOpacity>

                {/* Superset Link/Unlink option */}
                {(() => {
                  if (!activeBlockMenuId) return null;
                  const blockIdx = activeBlocks.findIndex(b => b.id === activeBlockMenuId);
                  const block = activeBlocks[blockIdx];
                  if (!block) return null;
                  const isSuperset = !!block.superset_id;
                  return (
                    <TouchableOpacity 
                      style={styles.typeOptionCard}
                      onPress={() => {
                        const partnerBlock = activeBlocks[blockIdx + 1] || activeBlocks[blockIdx - 1];
                        if (isSuperset) {
                          toggleBlockSuperset(activeBlockMenuId, null);
                        } else if (partnerBlock) {
                          toggleBlockSuperset(activeBlockMenuId, partnerBlock.id);
                        }
                        setBlockMenuModalVisible(false);
                        setActiveBlockMenuId(null);
                      }}
                    >
                      <Feather name="link" size={20} color={isSuperset ? '#FF453A' : '#30D158'} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.typeOptionName}>
                          {isSuperset ? 'Remove from Superset' : 'Add to Superset'}
                        </Text>
                        <Text style={styles.typeOptionDesc}>
                          {isSuperset ? 'Unlink this exercise block' : 'Link this exercise with back-to-back blocks'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })()}

                {/* Remove Exercise option */}
                <TouchableOpacity 
                  style={[styles.typeOptionCard, { borderColor: 'rgba(255, 69, 58, 0.2)', borderWidth: 1 }]}
                  onPress={() => {
                    setBlockMenuModalVisible(false);
                    if (activeBlockMenuId) {
                      removeExerciseFromWorkout(activeBlockMenuId);
                    }
                    setActiveBlockMenuId(null);
                  }}
                >
                  <Feather name="trash-2" size={20} color="#FF453A" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeOptionName, { color: '#FF453A' }]}>Remove Exercise</Text>
                    <Text style={styles.typeOptionDesc}>Delete this exercise block from the active session</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.cancelPopoverBtn} 
                  onPress={() => {
                    setBlockMenuModalVisible(false);
                    setActiveBlockMenuId(null);
                  }}
                >
                  <Text style={styles.cancelPopoverText}>Cancel</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* MODAL: RELOJ (Timer y Stopwatch de Cabecera) */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={clockModalVisible}
            onRequestClose={() => setClockModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => setClockModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.clockModalContent} onPress={() => {}}>
                <View style={styles.clockHeader}>
                  <View style={{ width: 24 }} />
                  <Text style={styles.clockHeaderTitle}>Clock</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Configuración', 'Las alertas de descanso y cronómetro están activadas por defecto.')}>
                    <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Selector de Pestañas (Timer / Stopwatch) */}
                <View style={styles.clockTabsContainer}>
                  <TouchableOpacity 
                    style={[styles.clockTabPill, clockActiveTab === 'timer' && styles.clockTabPillActive]}
                    onPress={() => setClockActiveTab('timer')}
                  >
                    <Text style={[styles.clockTabPillText, clockActiveTab === 'timer' && styles.clockTabPillTextActive]}>
                      Timer
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.clockTabPill, clockActiveTab === 'stopwatch' && styles.clockTabPillActive]}
                    onPress={() => setClockActiveTab('stopwatch')}
                  >
                    <Text style={[styles.clockTabPillText, clockActiveTab === 'stopwatch' && styles.clockTabPillTextActive]}>
                      Stopwatch
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* CONTENIDO DE PESTAÑA: TIMER */}
                {clockActiveTab === 'timer' && (
                  <View style={styles.clockTabContent}>
                    {/* Círculo de Cuenta Regresiva */}
                    <View style={styles.timerCircle}>
                      <Text style={styles.timerCircleText}>
                        {restSeconds !== null ? formatTime(restSeconds) : formatTime(configuredRestSeconds)}
                      </Text>
                    </View>

                    {/* Botones de Ajuste de Tiempo */}
                    <View style={styles.timerAdjustRow}>
                      <TouchableOpacity 
                        style={styles.timerAdjustBtn}
                        onPress={() => {
                          if (restSeconds !== null) {
                            setRestSeconds(prev => prev !== null ? Math.max(0, prev - 15) : null);
                          } else {
                            setConfiguredRestSeconds(prev => Math.max(15, prev - 15));
                          }
                        }}
                      >
                        <Text style={styles.timerAdjustText}>-15s</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.timerAdjustBtn}
                        onPress={() => {
                          if (restSeconds !== null) {
                            setRestSeconds(prev => prev !== null ? prev + 15 : null);
                          } else {
                            setConfiguredRestSeconds(prev => prev + 15);
                          }
                        }}
                      >
                        <Text style={styles.timerAdjustText}>+15s</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Botón Principal (Start / Pause / Resume) */}
                    <TouchableOpacity 
                      style={styles.timerStartBtn}
                      onPress={() => {
                        if (restSeconds !== null) {
                          setIsTimerPaused(!isTimerPaused);
                        } else {
                          setRestSeconds(configuredRestSeconds);
                          setIsTimerPaused(false);
                        }
                      }}
                    >
                      <Text style={styles.timerStartText}>
                        {restSeconds === null 
                          ? 'Start' 
                          : isTimerPaused 
                            ? 'Resume' 
                            : 'Pause'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* CONTENIDO DE PESTAÑA: STOPWATCH */}
                {clockActiveTab === 'stopwatch' && (
                  <View style={styles.clockTabContent}>
                    {/* Círculo de Cronómetro */}
                    <View style={[styles.timerCircle, { borderColor: '#3A3A3C' }]}>
                      <Text style={styles.timerCircleText}>{formatTime(stopwatchSeconds)}</Text>
                    </View>

                    <View style={styles.stopwatchControlsRow}>
                      <TouchableOpacity 
                        style={styles.stopwatchResetBtn}
                        onPress={() => {
                          setStopwatchRunning(false);
                          setStopwatchSeconds(0);
                        }}
                      >
                        <Text style={styles.stopwatchResetText}>Reset</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.stopwatchStartBtn}
                        onPress={() => setStopwatchRunning(!stopwatchRunning)}
                      >
                        <Text style={styles.stopwatchStartText}>
                          {stopwatchRunning ? 'Pause' : 'Start'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity 
                  style={styles.clockModalCloseBtn}
                  onPress={() => setClockModalVisible(false)}
                >
                  <Text style={styles.clockModalCloseText}>Close</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* MODAL DE CONFIRMACIÓN PERSONALIZADO (Nativo/Responsivo) */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={confirmModalVisible}
            onRequestClose={() => setConfirmModalVisible(false)}
          >
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>{confirmModalData?.title}</Text>
                <Text style={styles.confirmMessage}>{confirmModalData?.message}</Text>
                
                <View style={styles.confirmActionsRow}>
                  <TouchableOpacity 
                    style={styles.confirmCancelBtn} 
                    onPress={() => setConfirmModalVisible(false)}
                  >
                    <Text style={styles.confirmCancelText}>
                      {confirmModalData?.cancelText || 'Cancelar'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[
                      styles.confirmOkBtn, 
                      confirmModalData?.confirmStyle === 'destructive' && styles.confirmOkBtnDestructive
                    ]} 
                    onPress={() => {
                      setConfirmModalVisible(false);
                      if (confirmModalData?.onConfirm) {
                        confirmModalData.onConfirm();
                      }
                    }}
                  >
                    <Text style={styles.confirmOkText}>
                      {confirmModalData?.confirmText || 'Confirmar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* MODAL: INFORMACIÓN DE COLUMNA (Bottom Sheet) */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={infoSheetVisible}
            onRequestClose={() => {
              setInfoSheetVisible(false);
              setInfoSheetType(null);
              setInfoSheetExerciseId(null);
            }}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => {
                setInfoSheetVisible(false);
                setInfoSheetType(null);
                setInfoSheetExerciseId(null);
              }}
            >
              <View style={styles.bottomSheetInfo}>
                {/* Drag handle line on top */}
                <View style={styles.bottomSheetDragHandle} />

                {(() => {
                  if (infoSheetType === 'SET') {
                    return (
                      <View style={styles.infoSheetContent}>
                        <Text style={styles.infoSheetTitle}>Sets</Text>
                        <Text style={styles.infoSheetMessage}>
                          Sets are used to indicate in which cycle of the exercise you are in. The options are: warm up, normal, failure and drop set.
                        </Text>
                      </View>
                    );
                  }
                  if (infoSheetType === 'PREVIOUS') {
                    return (
                      <View style={styles.infoSheetContent}>
                        <Text style={styles.infoSheetTitle}>Previous</Text>
                        <Text style={styles.infoSheetMessage}>
                          In the "Previous" column, you will find your past performance of that exercise on that specific set.
                        </Text>
                      </View>
                    );
                  }
                  if (infoSheetType === 'KG') {
                    const currentUnit = infoSheetExerciseId ? (exerciseUnits[infoSheetExerciseId] || 'Kg') : 'Kg';
                    return (
                      <View style={styles.infoSheetContent}>
                        <Text style={styles.infoSheetTitle}>Weight Input</Text>
                        <Text style={styles.infoSheetMessage}>
                          We recommend inputting the total combined weight lifted in one rep of the exercise. For barbell exercises, input the weight of the bar plus all the plates.
                        </Text>

                        {infoSheetExerciseId && (
                          <TouchableOpacity 
                            style={styles.infoSheetUnitRow}
                            onPress={() => {
                              const nextUnit = currentUnit.toLowerCase() === 'kg' ? 'Lb' : 'Kg';
                              setExerciseUnit(infoSheetExerciseId, nextUnit);
                            }}
                          >
                            <Text style={styles.infoSheetUnitLabel}>Weight Unit</Text>
                            <View style={styles.infoSheetUnitValueContainer}>
                              <Text style={styles.infoSheetUnitValue}>
                                {currentUnit.toLowerCase() === 'kg' ? 'Default (kg)' : 'Default (lbs)'}
                              </Text>
                              <Text style={styles.infoSheetUnitChevron}>❯</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  }
                  if (infoSheetType === 'REPS') {
                    return (
                      <View style={styles.infoSheetContent}>
                        <Text style={styles.infoSheetTitle}>Repetitions</Text>
                        <Text style={styles.infoSheetMessage}>
                          Repetitions indicate how many times you performed that exercise per set. You should only log completed reps.
                        </Text>
                      </View>
                    );
                  }
                  if (infoSheetType === 'RPE') {
                    return (
                      <View style={styles.infoSheetContent}>
                        <Text style={styles.infoSheetTitle}>Rate of Perceived Exertion (RPE)</Text>
                        <Text style={styles.infoSheetMessage}>
                          RPE is a subjective 6–10 scale used to measure how hard your body is working during exercise.
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                <TouchableOpacity 
                  style={styles.infoSheetGotItBtn}
                  onPress={() => {
                    setInfoSheetVisible(false);
                    setInfoSheetType(null);
                    setInfoSheetExerciseId(null);
                  }}
                >
                  <Text style={styles.infoSheetGotItText}>Got it!</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* MODAL: CONFIGURAR TIEMPO DE DESCANSO (Rest Modal) */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={restModalVisible}
            onRequestClose={() => setRestModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => {
                setRestModalVisible(false);
                setRestingExerciseId(null);
              }}
            >
              <TouchableOpacity activeOpacity={1} style={styles.popoverContent} onPress={() => {}}>
                <Text style={styles.popoverTitle}>Rest Timer Settings</Text>
                <Text style={styles.rpeSubtitle}>Elige el tiempo de descanso predeterminado</Text>

                <View style={styles.restPresetsRow}>
                  {[60, 120, 180, 240].map((secs) => (
                    <TouchableOpacity
                      key={secs}
                      style={[
                        styles.restPresetPill,
                        restingExerciseId !== null && (exerciseRestDurations[restingExerciseId] || 90) === secs && styles.restPresetPillActive
                      ]}
                      onPress={() => {
                        if (restingExerciseId) {
                          setExerciseRestDuration(restingExerciseId, secs);
                        }
                      }}
                    >
                      <Text style={[
                        styles.restPresetText,
                        restingExerciseId !== null && (exerciseRestDurations[restingExerciseId] || 90) === secs && styles.restPresetTextActive
                      ]}>
                        {Math.floor(secs / 60)}:00
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Botones para sumar / restar 30 segundos */}
                <View style={styles.adjustRestRow}>
                  <TouchableOpacity
                    style={styles.adjustRestBtn}
                    onPress={() => {
                      if (restingExerciseId) {
                        const current = exerciseRestDurations[restingExerciseId] || 90;
                        setExerciseRestDuration(restingExerciseId, Math.max(0, current - 30));
                      }
                    }}
                  >
                    <Text style={styles.adjustRestText}>- 30s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.adjustRestBtn}
                    onPress={() => {
                      if (restingExerciseId) {
                        const current = exerciseRestDurations[restingExerciseId] || 90;
                        setExerciseRestDuration(restingExerciseId, current + 30);
                      }
                    }}
                  >
                    <Text style={styles.adjustRestText}>+ 30s</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={styles.cancelPopoverBtn} 
                  onPress={() => {
                    setRestModalVisible(false);
                    setRestingExerciseId(null);
                  }}
                >
                  <Text style={styles.cancelPopoverText}>Confirmar</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* Visor de Detalles e Historial de Ejercicio */}
          <ExerciseInfoModal 
            exercise={selectedExerciseForInfo}
            visible={infoModalVisible}
            onClose={() => {
              setInfoModalVisible(false);
              setSelectedExerciseForInfo(null);
            }}
          />

          {/* MODAL: SELECCIÓN DE TIPO DE SERIE */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={typeModalVisible}
            onRequestClose={() => setTypeModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => setTypeModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.popoverContent} onPress={() => {}}>
                <Text style={styles.popoverTitle}>Seleccionar Tipo de Serie</Text>
                
                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('NORMAL')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#8E8E93' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>NORMAL</Text>
                    <Text style={styles.typeOptionDesc}>Serie estándar para registrar marcas.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('WARMUP')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#FF9500' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>CALENTAMIENTO (W)</Text>
                    <Text style={styles.typeOptionDesc}>Preparación ligera antes del esfuerzo pesado.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('DROP')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#BF5AF2' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>DROPSET (D)</Text>
                    <Text style={styles.typeOptionDesc}>Serie consecutiva rebajando el peso levantado.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('FAILURE')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#FF453A' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>FALLO (F)</Text>
                    <Text style={styles.typeOptionDesc}>Llevar la serie al límite muscular de repeticiones.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelPopoverBtn} onPress={() => setTypeModalVisible(false)}>
                  <Text style={styles.cancelPopoverText}>Cancelar</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* MODAL: SELECTOR DE RPE */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={rpeModalVisible}
            onRequestClose={() => setRpeModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.popoverOverlay} 
              activeOpacity={1} 
              onPress={() => setRpeModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.bottomSheetRpe} onPress={() => {}}>
                <Text style={styles.popoverTitle}>Seleccionar Esfuerzo Percibido (RPE)</Text>
                <Text style={styles.rpeSubtitle}>Califica el nivel de esfuerzo entre 1 y 10</Text>
                
                <ScrollView contentContainerStyle={styles.rpeGrid}>
                  {rpeOptions.map(val => (
                    <TouchableOpacity 
                      key={val} 
                      style={[
                        styles.rpeGridCell, 
                        selectedSetForRpe?.currentRpe === val && { backgroundColor: '#0082FF', borderColor: '#0082FF' }
                      ]}
                      onPress={() => handleRpeSelect(val)}
                    >
                      <Text style={[
                        styles.rpeGridCellText,
                        selectedSetForRpe?.currentRpe === val && { color: '#FFFFFF', fontWeight: '800' }
                      ]}>
                        {val}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.rpeActions}>
                  <TouchableOpacity style={styles.rpeRemoveBtn} onPress={() => handleRpeSelect(null)}>
                    <Text style={styles.rpeRemoveBtnText}>Quitar RPE</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.rpeCloseBtn} onPress={() => setRpeModalVisible(false)}>
                    <Text style={styles.rpeCloseBtnText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* Modal de selección de ejercicios */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={exerciseModalVisible}
            onRequestClose={() => setExerciseModalVisible(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setExerciseModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.catalogModalContent} onPress={() => {}}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Ejercicios de la Biblioteca</Text>
                  <TouchableOpacity onPress={() => setExerciseModalVisible(false)}>
                    <Text style={styles.closeModalText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalSearch}>
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Buscar ejercicio..."
                    placeholderTextColor="#8E8E93"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                {loading ? (
                  <ActivityIndicator color="#0082FF" style={styles.modalLoader} />
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalList}>
                    {filteredExercises.length === 0 ? (
                      <Text style={styles.modalEmptyText}>No se encontraron ejercicios</Text>
                    ) : (
                      filteredExercises.map((ex) => (
                        <TouchableOpacity
                          key={ex.id}
                          style={styles.modalItem}
                          onPress={() => {
                            if (activeBlockMenuId) {
                              replaceExerciseInBlock(activeBlockMenuId, ex);
                              setActiveBlockMenuId(null);
                            } else {
                              addExerciseToWorkout(ex);
                            }
                            setExerciseModalVisible(false);
                            setSearchQuery('');
                          }}
                        >
                          <View>
                            <Text style={styles.modalItemName}>{ex.name}</Text>
                            <Text style={styles.modalItemMuscle}>{ex.muscle_group}</Text>
                          </View>
                          <Text style={styles.modalItemAdd}>+</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </SafeAreaView>
      </Modal>
    );
  }

  // 2. RENDERIZADO DEL ESTADO COLAPSADO (Barra Flotante)
  return (
    <TouchableOpacity 
      style={styles.collapsedBar}
      onPress={() => setActiveWorkoutExpanded(true)}
      activeOpacity={0.9}
    >
      <View style={styles.collapsedLeft}>
        <View style={styles.pulseDot} />
        <Text style={styles.collapsedTitle} numberOfLines={1}>
          {editingWorkoutId !== null ? `Editando: ${activeWorkout.name}` : activeWorkout.name}
        </Text>
      </View>
      {restSeconds !== null && restSeconds > 0 ? (
        <Text style={[styles.collapsedTimer, { color: '#FF9500' }]}>Descanso: {restSeconds}s</Text>
      ) : (
        <Text style={styles.collapsedTimer}>{formatTime(secondsElapsed)}</Text>
      )}
    </TouchableOpacity>
  );
}

interface MuscleBodyHeatmapProps {
  scores: Record<string, number>;
  type: 'front' | 'back';
}

function MuscleBodyHeatmap({ scores, type }: MuscleBodyHeatmapProps) {
  const getColor = (val: number) => (val > 0 ? '#0082FF' : '#3A3A3C');

  if (type === 'front') {
    return (
      <Svg width="110" height="150" viewBox="0 0 100 140">
        {/* Cabeza */}
        <Path d="M50,12 A7,7 0 1,1 50,26 A7,7 0 1,1 50,12" fill="#3A3A3C" />
        {/* Cuello */}
        <Path d="M48,26 L52,26 L52,30 L48,30 Z" fill="#3A3A3C" />
        {/* Pecho */}
        <Path 
          d="M38,32 Q50,34 62,32 L60,48 Q50,52 40,48 Z" 
          fill={getColor(scores.Chest)} 
        />
        {/* Abdomen */}
        <Path 
          d="M40,50 Q50,52 60,50 L58,74 Q50,76 42,74 Z" 
          fill={getColor(scores.Abs)} 
        />
        {/* Hombros */}
        <Path 
          d="M36,31 Q30,31 28,36 Q32,42 37,40 Z" 
          fill={getColor(scores.Shoulders)} 
        />
        <Path 
          d="M64,31 Q70,31 72,36 Q68,42 63,40 Z" 
          fill={getColor(scores.Shoulders)} 
        />
        {/* Bíceps */}
        <Path 
          d="M26,39 L22,54 Q25,58 29,54 L32,41 Z" 
          fill={getColor(scores.Biceps)} 
        />
        <Path 
          d="M74,39 L78,54 Q75,58 71,54 L68,41 Z" 
          fill={getColor(scores.Biceps)} 
        />
        {/* Antebrazos */}
        <Path 
          d="M21,56 L18,74 Q21,78 24,74 L27,58 Z" 
          fill={getColor(scores.Forearms)} 
        />
        <Path 
          d="M79,56 L82,74 Q79,78 76,74 L73,58 Z" 
          fill={getColor(scores.Forearms)} 
        />
        {/* Cuádriceps */}
        <Path 
          d="M41,77 Q45,77 49,77 L47,110 Q42,110 38,110 Z" 
          fill={getColor(scores.Quads)} 
        />
        <Path 
          d="M51,77 Q55,77 59,77 L62,110 Q58,110 53,110 Z" 
          fill={getColor(scores.Quads)} 
        />
        {/* Piernas inferiores */}
        <Path d="M38,112 L46,112 L43,138 L38,138 Z" fill="#3A3A3C" />
        <Path d="M54,112 L62,112 L62,138 L57,138 Z" fill="#3A3A3C" />
      </Svg>
    );
  }

  return (
    <Svg width="110" height="150" viewBox="0 0 100 140">
      {/* Cabeza */}
      <Path d="M50,12 A7,7 0 1,1 50,26 A7,7 0 1,1 50,12" fill="#3A3A3C" />
      {/* Cuello */}
      <Path d="M48,26 L52,26 L52,30 L48,30 Z" fill="#3A3A3C" />
      {/* Espalda Superior */}
      <Path 
        d="M38,32 Q50,34 62,32 L58,48 Q50,52 42,48 Z" 
        fill={getColor(scores.Back)} 
      />
      {/* Espalda Baja */}
      <Path 
        d="M42,50 Q50,52 58,50 L56,74 Q50,76 44,74 Z" 
        fill={getColor(scores.Back)} 
      />
      {/* Hombros */}
      <Path 
        d="M36,31 Q30,31 28,36 Q32,42 37,40 Z" 
        fill={getColor(scores.Shoulders)} 
      />
      <Path 
        d="M64,31 Q70,31 72,36 Q68,42 63,40 Z" 
        fill={getColor(scores.Shoulders)} 
      />
      {/* Tríceps */}
      <Path 
        d="M26,39 L22,54 Q25,58 29,54 L32,41 Z" 
        fill={getColor(scores.Triceps)} 
      />
      <Path 
        d="M74,39 L78,54 Q75,58 71,54 L68,41 Z" 
        fill={getColor(scores.Triceps)} 
      />
      {/* Antebrazos */}
      <Path d="M21,56 L18,74 Q21,78 24,74 L27,58 Z" fill="#3A3A3C" />
      <Path d="M79,56 L82,74 Q79,78 76,74 L73,58 Z" fill="#3A3A3C" />
      {/* Femorales / Glúteos */}
      <Path 
        d="M41,77 Q45,77 49,77 L47,110 Q42,110 38,110 Z" 
        fill={getColor(scores.Hamstrings || scores.Glutes)} 
      />
      <Path 
        d="M51,77 Q55,77 59,77 L62,110 Q58,110 53,110 Z" 
        fill={getColor(scores.Hamstrings || scores.Glutes)} 
      />
      {/* Pantorrillas */}
      <Path d="M38,112 L46,112 L43,138 L38,138 Z" fill="#3A3A3C" />
      <Path d="M54,112 L62,112 L62,138 L57,138 Z" fill="#3A3A3C" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  modalScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  premiumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerSubtitleText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTimerVal: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRoundPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#121214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPauseSymbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerFinishPill: {
    backgroundColor: '#0082FF',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  headerFinishPillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  // Barra de progreso sets
  setsProgressBarRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#1E1E22',
    borderRadius: 2,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0082FF',
    borderRadius: 2,
  },
  progressBarLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 150,
    gap: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Editar detalles del entrenamiento histórico
  editDetailsCard: {
    backgroundColor: '#0C0C0E',
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  editSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0082FF',
    textTransform: 'uppercase',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  editInputName: {
    flex: 1,
    height: 38,
    backgroundColor: '#121214',
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  editTimeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121214',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
    marginTop: 4,
  },
  editTimeInput: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    padding: 0,
  },
  timeDivider: {
    color: '#8E8E93',
    fontWeight: '800',
    fontSize: 14,
  },
  // Bloque Ejercicio
  blockCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 20,
    padding: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  exerciseRoundIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#11223F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseRoundIconEmoji: {
    fontSize: 16,
  },
  exerciseTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exerciseSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 1,
  },
  moreOptionsBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreOptionsText: {
    color: '#48484A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  blockRestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121214',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  blockRestRowFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 130, 255, 0.15)',
  },
  blockRestLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  blockRestDone: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    marginBottom: 8,
    gap: 8,
  },
  colHeader: {
    color: '#48484A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  swipeScrollView: {
    overflow: 'hidden',
    borderRadius: 8,
    marginBottom: 4,
  },
  swipeContainer: {
    alignItems: 'center',
  },
  setRowContent: {
    width: rowWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#0C0C0E',
    gap: 8,
  },
  swipeDeleteAction: {
    width: 70,
    height: '100%',
    backgroundColor: '#FF453A',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  swipeDeleteActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  // Circular set indicator badge
  setTypeBadgeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#121214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCircleW: {
    backgroundColor: '#3E2400',
  },
  badgeCircleD: {
    backgroundColor: '#2A103F',
  },
  badgeCircleF: {
    backgroundColor: '#3E1010',
  },
  setTypeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8E8E93',
  },
  previousRecordText: {
    width: 90,
    fontSize: 12,
    color: '#48484A',
    fontWeight: '600',
  },
  metricsWrapperRow: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  metricInput: {
    flex: 1,
    height: 32,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    padding: 0,
  },
  metricDivider: {
    color: '#48484A',
    fontSize: 13,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#48484A',
    fontSize: 11,
    fontWeight: '600',
  },
  rpeButtonPill: {
    width: 45,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeButtonText: {
    color: '#48484A',
    fontSize: 13,
    fontWeight: '700',
  },
  circleCheckButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#2C2C2E',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  circleCheckButtonActive: {
    backgroundColor: '#0082FF',
    borderColor: '#0082FF',
  },
  circleCheckIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  addSetBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#121214',
  },
  addSetText: {
    color: '#0082FF',
    fontSize: 13,
    fontWeight: '700',
  },
  // Pie de página
  actionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#1C1C1E',
    flexDirection: 'row',
    gap: 12,
    zIndex: 99,
  },
  cancelBtn: {
    backgroundColor: '#121214',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '700',
  },
  addExerciseBtn: {
    flex: 1,
    backgroundColor: '#0082FF',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addExerciseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Panel de Rest Timer flotante en footer (Estilo Image 1)
  footerRestBanner: {
    position: 'absolute',
    bottom: 76,
    left: 16,
    right: 16,
    backgroundColor: '#0C0C0E',
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  footerRestInfo: {
    flexDirection: 'column',
  },
  footerRestLabelTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  footerRestCounter: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  footerRestAdjusters: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustPillBtn: {
    backgroundColor: '#121214',
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  adjustPillBtnAdd: {
    borderColor: '#0082FF',
    borderWidth: 0.5,
  },
  adjustPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  adjustPillTextActive: {
    color: '#0082FF',
    fontSize: 12,
    fontWeight: '800',
  },
  // Popovers
  popoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  popoverContent: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  popoverTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  typeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121214',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  typeIndicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  typeOptionName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  typeOptionDesc: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 15,
  },
  cancelPopoverBtn: {
    marginTop: 10,
    backgroundColor: '#121214',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelPopoverText: {
    color: '#FF453A',
    fontSize: 15,
    fontWeight: '700',
  },
  restPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 10,
  },
  restPresetPill: {
    flex: 1,
    backgroundColor: '#121214',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  restPresetPillActive: {
    backgroundColor: '#0082FF',
    borderColor: '#0082FF',
  },
  restPresetText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  restPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  adjustRestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  adjustRestBtn: {
    flex: 1,
    backgroundColor: '#121214',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderColor: '#1C1C1E',
    borderWidth: 1,
  },
  adjustRestText: {
    color: '#0082FF',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomSheetRpe: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '65%',
  },
  rpeSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
  },
  rpeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 16,
  },
  rpeGridCell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121214',
  },
  rpeGridCellText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rpeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  rpeRemoveBtn: {
    flex: 1,
    backgroundColor: '#121214',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rpeRemoveBtnText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '700',
  },
  rpeCloseBtn: {
    flex: 1,
    backgroundColor: '#0082FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rpeCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  catalogModalContent: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeModalText: {
    color: '#0082FF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSearch: {
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  modalSearchInput: {
    height: 40,
    backgroundColor: '#121214',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  modalLoader: {
    marginTop: 40,
  },
  modalList: {
    padding: 16,
    gap: 12,
  },
  modalEmptyText: {
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 20,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121214',
    padding: 14,
    borderRadius: 12,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalItemMuscle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalItemAdd: {
    fontSize: 22,
    color: '#0082FF',
    fontWeight: '700',
  },
  collapsedBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 70, // Alineado sobre la pestaña de navegación
    height: 52,
    backgroundColor: '#0C1A30',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0082FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 99,
  },
  collapsedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#30D158',
  },
  collapsedTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  collapsedTimer: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '800',
  },
  // Chevron log title header
  headerChevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerChevronSymbol: {
    color: '#0082FF',
    fontSize: 22,
    fontWeight: '700',
  },
  headerLogTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  // Session secondary header stats
  sessionStatsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 12,
  },
  sessionStatCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  sessionStatLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sessionStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  sessionStatValueBlue: {
    color: '#0082FF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  heatmapHeaderMiniTrigger: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniHeatmapGraphics: {
    flexDirection: 'row',
    gap: 2,
  },
  miniHeatmapEmoji: {
    fontSize: 18,
  },
  // Block Card updates
  blockCardSuperset: {
    borderColor: '#8A2BE2',
    borderLeftWidth: 3.5,
  },
  supersetHeaderPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#8A2BE2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
    marginLeft: 12,
    marginTop: 4,
  },
  supersetHeaderText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  blockNotesWrapper: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#121214',
    borderRadius: 10,
    padding: 8,
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
  },
  blockNotesInput: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    minHeight: 34,
    textAlignVertical: 'top',
    padding: 0,
  },
  // Set Row Highlight Completed
  setRowContentCompleted: {
    backgroundColor: '#16371B',
  },
  previousRecordButton: {
    width: 90,
  },
  // Rest banner updates
  restProgressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 3,
    backgroundColor: '#0082FF',
    borderRadius: 1.5,
  },
  footerRestRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
  },
  footerRestTimeBox: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  skipRestBtn: {
    backgroundColor: '#0082FF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipRestBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  // Heatmap modal layout
  heatmapModalContent: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    width: '100%',
  },
  heatmapModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  heatmapModalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  heatmapBodyDiagramsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 10,
  },
  diagramCol: {
    alignItems: 'center',
    gap: 8,
  },
  diagramColLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heatmapScoresList: {
    marginTop: 16,
    maxHeight: 250,
  },
  muscleScoreRow: {
    marginBottom: 12,
  },
  muscleRowText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  muscleNameLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  muscleScoreLabel: {
    color: '#0082FF',
    fontSize: 12,
    fontWeight: '800',
  },
  muscleProgressBarTrack: {
    height: 5,
    backgroundColor: '#1C1C1E',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  muscleProgressBarFill: {
    height: '100%',
    backgroundColor: '#0082FF',
    borderRadius: 2.5,
  },
  heatmapEmptyText: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 18,
  },
  heatmapCloseBtn: {
    backgroundColor: '#121214',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  heatmapCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  // Confirm Modal styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmBox: {
    backgroundColor: '#0C0C0E',
    borderColor: '#1C1C1E',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 12,
  },
  confirmTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  confirmMessage: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#121214',
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCancelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmOkBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0082FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmOkBtnDestructive: {
    backgroundColor: '#FF453A',
  },
  confirmOkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Reorder row inside popover
  reorderActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 10,
  },
  reorderPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#121214',
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
    height: 44,
    borderRadius: 12,
  },
  reorderPillDisabled: {
    opacity: 0.4,
  },
  reorderText: {
    color: '#0082FF',
    fontSize: 13,
    fontWeight: '700',
  },
  // Info sheet styles
  bottomSheetInfo: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    gap: 16,
  },
  bottomSheetDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#48484A',
    marginBottom: 8,
  },
  infoSheetContent: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  infoSheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  infoSheetMessage: {
    fontSize: 14,
    color: '#E5E5EA',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  infoSheetUnitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#0C0C0E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  infoSheetUnitLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  infoSheetUnitValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoSheetUnitValue: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  infoSheetUnitChevron: {
    color: '#48484A',
    fontSize: 12,
  },
  infoSheetGotItBtn: {
    backgroundColor: '#0082FF',
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  infoSheetGotItText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Clock Modal (Timer & Stopwatch)
  clockModalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    gap: 20,
    alignItems: 'center',
  },
  clockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  clockHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  clockTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    borderRadius: 14,
    padding: 4,
    width: '100%',
    gap: 4,
  },
  clockTabPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockTabPillActive: {
    backgroundColor: '#0082FF',
  },
  clockTabPillText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '700',
  },
  clockTabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  clockTabContent: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
    marginVertical: 10,
  },
  timerCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: '#0082FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCircleText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  timerAdjustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
  },
  timerAdjustBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  timerAdjustText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0082FF',
  },
  timerStartBtn: {
    backgroundColor: '#0082FF',
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerStartText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stopwatchControlsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  stopwatchResetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#121214',
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopwatchResetText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stopwatchStartBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0082FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopwatchStartText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  clockModalCloseBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  clockModalCloseText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  topDragIndicatorRow: {
    width: '100%',
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  topDragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#48484A',
  },
});
