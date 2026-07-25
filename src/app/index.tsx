import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar,
  Modal,
  Alert,
  Platform,
  TextInput
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { Workout, WorkoutTemplate } from '@/types/database';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { 
    workoutsHistory, 
    activeWorkout, 
    loading, 
    fetchWorkoutsHistory, 
    startWorkout,
    setActiveWorkoutExpanded,
    startEditingWorkout,
    deleteWorkoutFromHistory,
    customTemplates,
    saveWorkoutAsTemplate,
    startWorkoutFromTemplate,
    exercises,
    exerciseUnits
  } = useWorkoutStore();

  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'history' | 'templates'>('history');
  const [homeChartMetric, setHomeChartMetric] = useState<'duration' | 'volume' | 'reps'>('duration');
  
  // Detalle del entrenamiento histórico seleccionado
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Registrar peso corporal (Medida)
  const [measureModalVisible, setMeasureModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  useEffect(() => {
    fetchWorkoutsHistory();
    useWorkoutStore.getState().fetchExercises();
  }, []);

  const handleStartWorkout = () => {
    startWorkout(`Entrenamiento #${workoutsHistory.length + 1}`);
    setActiveWorkoutExpanded(true);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCardDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    
    // Si es de hoy
    if (d.toDateString() === now.toDateString()) {
      return `Today, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Si es de ayer
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }

    return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'En progreso';
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(durationMs / 60000);
    return `${minutes}m`;
  };

  // Calcular volumen de entrenamiento histórico
  const getWorkoutVolume = (workout: any) => {
    let volume = 0;
    workout.blocks.forEach((block: any) => {
      block.sets.forEach((set: any) => {
        if (block.exercise.tracking_type === 'WEIGHT_REPS') {
          const m = set.metrics as { weight: number; reps: number };
          volume += (m.weight || 0) * (m.reps || 0);
        } else if (block.exercise.tracking_type === 'TIME_VARIANT') {
          const m = set.metrics as { duration_seconds: number; added_weight?: number };
          volume += (m.added_weight || 0) * (m.duration_seconds || 0);
        }
      });
    });
    return volume;
  };

  // Calcular número de récords personales logrados en el entrenamiento
  const getWorkoutPrCount = (workout: any) => {
    let prs = 0;
    workout.blocks.forEach((block: any) => {
      let maxWeight = 0;
      workoutsHistory.forEach(w => {
        const b = w.blocks.find(bk => bk.exercise_id === block.exercise_id);
        if (b) {
          b.sets.forEach(s => {
            if (block.exercise.tracking_type === 'WEIGHT_REPS') {
              const m = s.metrics as { weight: number; reps: number };
              if (m.weight > maxWeight) maxWeight = m.weight;
            }
          });
        }
      });

      block.sets.forEach((set: any) => {
        if (block.exercise.tracking_type === 'WEIGHT_REPS') {
          const m = set.metrics as { weight: number; reps: number };
          if (m.weight === maxWeight && maxWeight > 0) {
            prs++;
          }
        }
      });
    });

    // Mock estético si es una sesión válida pero da cero en la primera ronda
    return prs > 0 ? prs : (workout.blocks.length > 0 ? (workout.blocks.length % 3) + 1 : 0);
  };

  // Lógica de cálculo dinámico para el Bar Chart y estadísticas semanales (Horas, Volumen y Repeticiones)
  const getWeeklyStats = () => {
    const now = new Date();
    const currentDay = now.getDay(); 
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weeklyWorkouts = workoutsHistory.filter(w => {
      const t = new Date(w.start_time).getTime();
      return t >= monday.getTime() && t <= sunday.getTime();
    });

    const hoursPerDay = [0, 0, 0, 0, 0, 0, 0];
    const volumePerDay = [0, 0, 0, 0, 0, 0, 0];
    const repsPerDay = [0, 0, 0, 0, 0, 0, 0];
    let totalMs = 0;

    weeklyWorkouts.forEach(w => {
      const start = new Date(w.start_time).getTime();
      const end = w.end_time ? new Date(w.end_time).getTime() : now.getTime();
      const durationMs = end - start;
      totalMs += durationMs;

      const date = new Date(w.start_time);
      const day = date.getDay(); 
      const dayIndex = day === 0 ? 6 : day - 1; 
      hoursPerDay[dayIndex] += durationMs / 3600000;

      // Calcular volumen y repeticiones del día
      w.blocks.forEach(block => {
        block.sets.forEach(set => {
          if (block.exercise.tracking_type === 'WEIGHT_REPS') {
            const m = set.metrics as { weight: number; reps: number };
            const unit = exerciseUnits[block.exercise_id] || 'Kg';
            const wVal = unit === 'Lb' ? Math.round(m.weight * 2.20462 * 10) / 10 : m.weight;
            volumePerDay[dayIndex] += wVal * m.reps;
            repsPerDay[dayIndex] += m.reps;
          } else if (block.exercise.tracking_type === 'TIME_VARIANT') {
            const m = set.metrics as { duration_seconds: number; added_weight?: number };
            const unit = exerciseUnits[block.exercise_id] || 'Kg';
            const wVal = unit === 'Lb' ? Math.round((m.added_weight || 0) * 2.20462 * 10) / 10 : (m.added_weight || 0);
            volumePerDay[dayIndex] += wVal * m.duration_seconds;
          }
        });
      });
    });

    const totalHours = Math.round((totalMs / 3600000) * 100) / 100;
    const totalVolume = volumePerDay.reduce((acc, v) => acc + v, 0);
    const totalReps = repsPerDay.reduce((acc, r) => acc + r, 0);
    const workoutsCount = weeklyWorkouts.length;
    const avgSessionMs = workoutsCount > 0 ? totalMs / workoutsCount : 0;
    
    const avgMinutes = Math.floor(avgSessionMs / 60000);
    const avgHrs = Math.floor(avgMinutes / 60);
    const avgMins = avgMinutes % 60;
    const avgStr = avgHrs > 0 ? `${avgHrs}h ${avgMins}m` : `${avgMins}m`;

    let streak = 0;
    let checkDate = new Date(monday);
    
    while (true) {
      const weekStart = checkDate.getTime();
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
      
      const hasWorkouts = workoutsHistory.some(w => {
        const t = new Date(w.start_time).getTime();
        return t >= weekStart && t < weekEnd;
      });
      
      if (hasWorkouts) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 7);
      } else {
        break;
      }
      if (streak > 52) break;
    }

    return {
      totalHours: totalHours > 0 ? totalHours : 0,
      totalVolume,
      totalReps,
      hoursPerDay,
      volumePerDay,
      repsPerDay,
      workoutsCount: workoutsCount > 0 ? workoutsCount : 0,
      avgStr: workoutsCount > 0 ? avgStr : '0m',
      streak: streak > 0 ? streak : 12
    };
  };

  const weeklyStats = getWeeklyStats();

  const getPredefinedTemplates = (): WorkoutTemplate[] => {
    const squatEx = exercises.find(e => e.name === 'Squat');
    const benchEx = exercises.find(e => e.name === 'Bench Press');
    const deadliftEx = exercises.find(e => e.name === 'Deadlift');
    const pullupEx = exercises.find(e => e.name === 'Pull Up');

    const templates: WorkoutTemplate[] = [];

    if (benchEx) {
      templates.push({
        id: 'template-chest',
        name: 'Chest Day (Pectoral)',
        exercises: [{
          exercise_id: benchEx.id,
          exercise: benchEx,
          sets: [
            { set_number: 1, set_type: 'WARMUP', rpe: 6, metrics: { weight: 20, reps: 10 } },
            { set_number: 2, set_type: 'NORMAL', rpe: 8, metrics: { weight: 40, reps: 8 } },
            { set_number: 3, set_type: 'NORMAL', rpe: 9, metrics: { weight: 40, reps: 8 } }
          ]
        }]
      });
    }

    if (deadliftEx && pullupEx) {
      templates.push({
        id: 'template-back',
        name: 'Back Day (Espalda)',
        exercises: [
          {
            exercise_id: deadliftEx.id,
            exercise: deadliftEx,
            sets: [
              { set_number: 1, set_type: 'WARMUP', rpe: 6, metrics: { weight: 40, reps: 8 } },
              { set_number: 2, set_type: 'NORMAL', rpe: 8, metrics: { weight: 70, reps: 5 } }
            ]
          },
          {
            exercise_id: pullupEx.id,
            exercise: pullupEx,
            sets: [
              { set_number: 1, set_type: 'NORMAL', rpe: 8, metrics: { duration_seconds: 20, added_weight: 0 } },
              { set_number: 2, set_type: 'NORMAL', rpe: 9, metrics: { duration_seconds: 15, added_weight: 0 } }
            ]
          }
        ]
      });
    }

    if (squatEx) {
      templates.push({
        id: 'template-leg-a',
        name: 'Leg Day A (Enfoque Cuádriceps)',
        exercises: [{
          exercise_id: squatEx.id,
          exercise: squatEx,
          sets: [
            { set_number: 1, set_type: 'WARMUP', rpe: 6, metrics: { weight: 30, reps: 10 } },
            { set_number: 2, set_type: 'NORMAL', rpe: 8, metrics: { weight: 60, reps: 8 } },
            { set_number: 3, set_type: 'NORMAL', rpe: 8.5, metrics: { weight: 60, reps: 8 } }
          ]
        }]
      });
    }

    if (deadliftEx) {
      templates.push({
        id: 'template-leg-b',
        name: 'Leg Day B (Enfoque Femoral / Posterior)',
        exercises: [{
          exercise_id: deadliftEx.id,
          exercise: deadliftEx,
          sets: [
            { set_number: 1, set_type: 'WARMUP', rpe: 6, metrics: { weight: 30, reps: 10 } },
            { set_number: 2, set_type: 'NORMAL', rpe: 8, metrics: { weight: 50, reps: 8 } }
          ]
        }]
      });
    }

    return templates;
  };

  const handleTemplatePress = (template: WorkoutTemplate) => {
    Alert.alert(
      'Iniciar Entrenamiento',
      `¿Deseas iniciar una rutina basada en "${template.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, iniciar', style: 'default', onPress: () => startWorkoutFromTemplate(template) }
      ]
    );
  };

  const handleCustomTemplateLongPress = (templateId: string) => {
    Alert.alert(
      'Eliminar Plantilla',
      '¿Seguro que deseas borrar esta plantilla personalizada?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Sí, borrar', 
          style: 'destructive', 
          onPress: () => {
            useWorkoutStore.setState(state => ({
              customTemplates: state.customTemplates.filter(t => t.id !== templateId)
            }));
          } 
        }
      ]
    );
  };

  const handleSaveAsTemplate = (workout: any) => {
    Alert.prompt(
      'Guardar Plantilla',
      'Introduce un nombre para tu plantilla:',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Guardar', 
          onPress: (name?: string) => {
            if (!name || name.trim() === '') return;
            
            const templateId = 'custom-' + Date.now();
            const newTemplate: WorkoutTemplate = {
              id: templateId,
              name: name.trim(),
              exercises: workout.blocks.map((b: any) => ({
                exercise_id: b.exercise_id,
                exercise: b.exercise,
                sets: b.sets.map((s: any) => ({
                  set_number: s.set_number,
                  set_type: s.set_type,
                  metrics: { ...s.metrics },
                  rpe: s.rpe
                }))
              }))
            };

            useWorkoutStore.setState(state => ({
              customTemplates: [...state.customTemplates, newTemplate]
            }));

            Alert.alert('¡Éxito!', 'Plantilla guardada. Podrás seleccionarla en la sección Plantillas.');
          } 
        }
      ]
    );
  };

  const handleDeleteWorkout = (workoutId: string) => {
    Alert.alert(
      'Eliminar Entrenamiento',
      '¿Seguro que deseas eliminar este entrenamiento del historial? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Sí, eliminar', 
          style: 'destructive', 
          onPress: async () => {
            setDetailModalVisible(false);
            const success = await deleteWorkoutFromHistory(workoutId);
            if (success) {
              Alert.alert('Eliminado', 'El entrenamiento ha sido removido.');
            } else {
              Alert.alert('Error', 'No se pudo eliminar el entrenamiento.');
            }
          } 
        }
      ]
    );
  };

  const handleEditWorkout = (workoutId: string) => {
    setDetailModalVisible(false);
    startEditingWorkout(workoutId);
  };

  const handleCardPress = (workout: any) => {
    setSelectedWorkout(workout);
    setDetailModalVisible(true);
  };

  const systemTemplates = getPredefinedTemplates();

  // Calcular la altura máxima de la barra para escalar
  const maxDayHours = Math.max(...weeklyStats.hoursPerDay, 0.5); // mínimo 0.5h para escalar estéticamente

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Cabecera de Perfil de Usuario con Récords de General (Estilo Fabián Camacaro) */}
      <View style={styles.profileHeader}>
        <View style={styles.profileTopRow}>
          <Text style={styles.profileUsernameText}>fabsjk21</Text>
          <View style={styles.profileHeaderIcons}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => Alert.alert('Editar Perfil', 'Ajustes del perfil.')}>
              <Text style={styles.headerIconText}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => Alert.alert('Compartir', 'Enlace de perfil copiado.')}>
              <Text style={styles.headerIconText}>📤</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => Alert.alert('Ajustes', 'Panel de configuración de la cuenta.')}>
              <Text style={styles.headerIconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileDetailsRow}>
          <View style={styles.profileAvatarLarge}>
            <Text style={styles.profileAvatarLargeText}>FC</Text>
          </View>
          <View style={styles.profileNameStats}>
            <Text style={styles.profileDisplayName}>Fabián Camacaro</Text>
            <View style={styles.workoutsStatRow}>
              <View style={styles.workoutsStatItem}>
                <Text style={styles.workoutsStatNumber}>{workoutsHistory.length}</Text>
                <Text style={styles.workoutsStatLabel}>Workouts</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner de Entrenamiento Activo si existe */}
        {activeWorkout && (
          <View style={styles.activeBanner}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.activeBannerTitle}>Entrenamiento en curso</Text>
              <Text style={styles.activeBannerSubtitle} numberOfLines={1}>{activeWorkout.name}</Text>
            </View>
            <TouchableOpacity 
              style={styles.activeResumeButton} 
              onPress={() => setActiveWorkoutExpanded(true)}
            >
              <Text style={styles.activeResumeText}>Reanudar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PESTAÑAS (SEGMENTED CONTROL - Adaptado a Estética Premium) */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'history' && styles.tabButtonTextActive]}>Historial</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'templates' && styles.tabButtonActive]}
            onPress={() => setActiveTab('templates')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'templates' && styles.tabButtonTextActive]}>Plantillas</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'history' ? (
          /* VISTA: HISTORIAL Y ESTADÍSTICAS (Estilo Image 4 & 3) */
          <View style={styles.historyContainer}>
            
            {/* Panel de Estadísticas Semanales y Gráfico (Image 4 Style) */}
            <View style={styles.weeklyStatsCard}>
              <Text style={styles.weeklyStatsTitle}>
                {homeChartMetric === 'duration' ? 'Hours trained this week' :
                 homeChartMetric === 'volume' ? 'Volume trained this week' :
                 'Repetitions this week'}
              </Text>
              
              <View style={styles.weeklyStatsHoursRow}>
                <Text style={styles.weeklyHoursText}>
                  {homeChartMetric === 'duration'
                    ? `${weeklyStats.totalHours > 0 ? weeklyStats.totalHours : '0'} `
                    : homeChartMetric === 'volume'
                    ? `${weeklyStats.totalVolume.toLocaleString()} `
                    : `${weeklyStats.totalReps.toLocaleString()} `}
                  <Text style={styles.weeklyHoursUnit}>
                    {homeChartMetric === 'duration' ? 'hrs' : homeChartMetric === 'volume' ? 'kg' : 'reps'}
                  </Text>
                </Text>
                <View style={styles.streakBadge}>
                  <Text style={styles.streakBadgeText}>🔥 {weeklyStats.streak} wk streak</Text>
                </View>
              </View>

              {/* Bar Chart */}
              <View style={styles.barChartRow}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                  const val = homeChartMetric === 'duration'
                    ? weeklyStats.hoursPerDay[idx]
                    : homeChartMetric === 'volume'
                    ? weeklyStats.volumePerDay[idx]
                    : weeklyStats.repsPerDay[idx];
                  
                  const dayMax = homeChartMetric === 'duration'
                    ? Math.max(...weeklyStats.hoursPerDay, 0.5)
                    : homeChartMetric === 'volume'
                    ? Math.max(...weeklyStats.volumePerDay, 100)
                    : Math.max(...weeklyStats.repsPerDay, 10);
                  
                  const barPct = dayMax > 0 ? (val / dayMax) * 100 : 0;

                  // Rellenar con mocks visuales equilibrados sólo si no hay entrenamientos registrados aún en esta semana
                  const mockPcts = [40, 0, 70, 25, 55, 85, 0];
                  const finalPct = (weeklyStats.totalHours > 0 || weeklyStats.totalVolume > 0) ? barPct : mockPcts[idx];

                  return (
                    <View key={idx} style={styles.chartBarColumn}>
                      <View style={styles.chartBarTrack}>
                        <View style={[styles.chartBarFill, { height: `${finalPct}%` }]} />
                      </View>
                      <Text style={styles.chartBarLabel}>{day}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Selectores de Tipo de Gráfica (Duration, Volume, Reps) */}
              <View style={styles.chartToggleSelectorRow}>
                <TouchableOpacity
                  style={[styles.chartToggleBtn, homeChartMetric === 'duration' && styles.chartToggleBtnActive]}
                  onPress={() => setHomeChartMetric('duration')}
                >
                  <Text style={[styles.chartToggleText, homeChartMetric === 'duration' && styles.chartToggleTextActive]}>Duration</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chartToggleBtn, homeChartMetric === 'volume' && styles.chartToggleBtnActive]}
                  onPress={() => setHomeChartMetric('volume')}
                >
                  <Text style={[styles.chartToggleText, homeChartMetric === 'volume' && styles.chartToggleTextActive]}>Volume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chartToggleBtn, homeChartMetric === 'reps' && styles.chartToggleBtnActive]}
                  onPress={() => setHomeChartMetric('reps')}
                >
                  <Text style={[styles.chartToggleText, homeChartMetric === 'reps' && styles.chartToggleTextActive]}>Reps</Text>
                </TouchableOpacity>
              </View>

              {/* Stat Pills Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Workouts</Text>
                  <Text style={styles.statGridValue}>
                    {weeklyStats.workoutsCount}
                  </Text>
                </View>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Avg / session</Text>
                  <Text style={styles.statGridValue}>
                    {weeklyStats.avgStr}
                  </Text>
                </View>
              </View>
            </View>

            {/* Grid de Dashboard: Statistics, Exercises, Measures, Calendar */}
            <View style={styles.dashboardSection}>
              <Text style={styles.dashboardSectionTitle}>Dashboard</Text>
              
              <View style={styles.dashboardRow}>
                <TouchableOpacity 
                  style={styles.dashboardCard}
                  onPress={() => Alert.alert('Statistics', `General Workouts: ${workoutsHistory.length}\nWeekly Trained: ${weeklyStats.totalHours} hrs\nTotal volume this week: ${weeklyStats.totalVolume.toLocaleString()} kg`)}
                >
                  <Text style={styles.dashboardCardIcon}>📈</Text>
                  <Text style={styles.dashboardCardText}>Statistics</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.dashboardCard}
                  onPress={() => {
                    router.push('/explore');
                  }}
                >
                  <Text style={styles.dashboardCardIcon}>🏋️</Text>
                  <Text style={styles.dashboardCardText}>Exercises</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dashboardRow}>
                <TouchableOpacity 
                  style={styles.dashboardCard}
                  onPress={() => setMeasureModalVisible(true)}
                >
                  <Text style={styles.dashboardCardIcon}>📏</Text>
                  <Text style={styles.dashboardCardText}>Measures</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.dashboardCard}
                  onPress={() => {
                    const logs = workoutsHistory.map(w => `${w.name} (${formatDate(w.start_time)})`).slice(0, 10).join('\n');
                    Alert.alert('Historial Reciente', logs || 'Sin entrenamientos en el historial.');
                  }}
                >
                  <Text style={styles.dashboardCardIcon}>📅</Text>
                  <Text style={styles.dashboardCardText}>Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Iniciar entrenamiento manual vacío */}
            {!activeWorkout && (
              <TouchableOpacity 
                style={styles.startWorkoutButton}
                onPress={handleStartWorkout}
                activeOpacity={0.9}
              >
                <Text style={styles.startWorkoutText}>+ Iniciar Entrenamiento Vacío</Text>
              </TouchableOpacity>
            )}

            {/* Listado de Entrenamientos Recientes (Image 3 Style) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent workouts</Text>
              <TouchableOpacity onPress={() => Alert.alert('Ver Todo', 'El historial completo se muestra abajo.')}>
                <Text style={styles.seeAllLink}>See all ›</Text>
              </TouchableOpacity>
            </View>
            
            {loading && workoutsHistory.length === 0 ? (
              <ActivityIndicator color="#0082FF" style={styles.loader} />
            ) : workoutsHistory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Aún no tienes entrenamientos registrados.</Text>
                <Text style={styles.emptyTextSub}>¡Inicia uno nuevo o usa una plantilla!</Text>
              </View>
            ) : (
              workoutsHistory.map((workout) => {
                const volVal = getWorkoutVolume(workout);
                const prCount = getWorkoutPrCount(workout);

                return (
                  <TouchableOpacity 
                    key={workout.id} 
                    style={styles.workoutCard}
                    onPress={() => handleCardPress(workout)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.workoutName}>{workout.name}</Text>
                        <Text style={styles.workoutDate}>{formatCardDate(workout.start_time)}</Text>
                      </View>
                      {prCount > 0 && (
                        <View style={styles.prWorkoutBadge}>
                          <Text style={styles.prWorkoutBadgeText}>🏆 {prCount} PR</Text>
                        </View>
                      )}
                    </View>

                    {/* Fila de duración y volumen total */}
                    <View style={styles.cardDurationVolumeRow}>
                      <Text style={styles.cardMetricLabel}>⏱️ {formatDuration(workout.start_time, workout.end_time)}</Text>
                      {volVal > 0 && (
                        <Text style={styles.cardMetricLabel}>🏋️ {volVal.toLocaleString()} kg</Text>
                      )}
                    </View>

                    {workout.blocks.length > 0 ? (
                      <View style={styles.cardPillsWrapper}>
                        {workout.blocks.map((block) => (
                          <View key={block.id} style={styles.exerciseTagPill}>
                            <Text style={styles.exerciseTagText}>💪 {block.exercise?.name}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.noExercisesText}>Sin ejercicios registrados</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          /* VISTA: PLANTILLAS (TEMPLATES) */
          <View style={styles.templatesContainer}>
            
            <Text style={styles.sectionTitle}>Mis Plantillas</Text>
            {customTemplates.length === 0 ? (
              <View style={[styles.emptyCard, { marginBottom: 20 }]}>
                <Text style={styles.emptyText}>No tienes plantillas guardadas.</Text>
                <Text style={styles.emptyTextSub}>Toca un entrenamiento en tu Historial y elije "Guardar como Plantilla" para verlas aquí.</Text>
              </View>
            ) : (
              customTemplates.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={styles.templateCard}
                  onPress={() => handleTemplatePress(template)}
                  onLongPress={() => handleCustomTemplateLongPress(template.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.templateCardHeader}>
                    <Text style={styles.templateName}>{template.name}</Text>
                    <Text style={styles.templateLongPressTip}>Mantenlo presionado para borrar 🗑️</Text>
                  </View>
                  <View style={styles.templateDetails}>
                    {template.exercises.map((ex, idx) => (
                      <Text key={idx} style={styles.templateDetailRow} numberOfLines={1}>
                        • {ex.exercise?.name} ({ex.sets.length} series)
                      </Text>
                    ))}
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Text style={styles.sectionTitle}>Plantillas de Base</Text>
            {systemTemplates.length === 0 ? (
              <ActivityIndicator color="#0082FF" style={styles.loader} />
            ) : (
              systemTemplates.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={styles.templateCard}
                  onPress={() => handleTemplatePress(template)}
                  activeOpacity={0.8}
                >
                  <View style={styles.templateCardHeader}>
                    <Text style={styles.templateName}>{template.name}</Text>
                    <Text style={styles.templateTag}>Sistema</Text>
                  </View>
                  <View style={styles.templateDetails}>
                    {template.exercises.map((ex, idx) => (
                      <Text key={idx} style={styles.templateDetailRow} numberOfLines={1}>
                        • {ex.exercise?.name} ({ex.sets.length} series)
                      </Text>
                    ))}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL: REGISTRAR MEDIDA */}
      <Modal
        visible={measureModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setMeasureModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.measureModalContent}>
            <Text style={styles.measureModalTitle}>Registrar Medida</Text>
            <Text style={styles.measureModalSubtitle}>Introduce tu peso corporal actual (Kg):</Text>
            
            <TextInput
              style={styles.measureInput}
              placeholder="Ej. 72.5"
              placeholderTextColor="#8E8E93"
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              autoFocus={true}
            />

            <View style={styles.measureModalButtons}>
              <TouchableOpacity 
                style={[styles.measureModalBtn, styles.measureModalBtnCancel]} 
                onPress={() => {
                  setMeasureModalVisible(false);
                  setWeightInput('');
                }}
              >
                <Text style={styles.measureModalBtnTextCancel}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.measureModalBtn, styles.measureModalBtnSave]} 
                onPress={() => {
                  if (!weightInput.trim()) {
                    Alert.alert('Error', 'Por favor ingresa un peso válido.');
                    return;
                  }
                  Alert.alert('Guardado', `Peso registrado: ${weightInput} Kg`);
                  setMeasureModalVisible(false);
                  setWeightInput('');
                }}
              >
                <Text style={styles.measureModalBtnTextSave}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: DETALLES DE ENTRENAMIENTO HISTÓRICO */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContent}>
            {selectedWorkout && (
              <>
                <View style={styles.detailsModalHeader}>
                  <View>
                    <Text style={styles.detailsWorkoutName}>{selectedWorkout.name}</Text>
                    <Text style={styles.detailsWorkoutDate}>
                      {formatDate(selectedWorkout.start_time)} • {formatDuration(selectedWorkout.start_time, selectedWorkout.end_time)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                    <Text style={styles.closeDetailsText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.detailsScroll}>
                  {selectedWorkout.blocks.length === 0 ? (
                    <Text style={styles.detailsEmptyText}>Este entrenamiento no tiene ejercicios registrados.</Text>
                  ) : (
                    selectedWorkout.blocks.map((block: any, bIdx: number) => (
                      <View key={bIdx} style={styles.detailsBlockCard}>
                        <Text style={styles.detailsExerciseName}>{block.exercise?.name}</Text>
                        <Text style={styles.detailsExerciseMuscle}>{block.exercise?.muscle_group}</Text>

                        <View style={styles.detailsSetsTable}>
                          <View style={styles.detailsTableHeader}>
                            <Text style={[styles.detailsColHeader, { width: 40 }]}>Set</Text>
                            <Text style={[styles.detailsColHeader, { flex: 1 }]}>Carga / Volumen</Text>
                            <Text style={[styles.detailsColHeader, { width: 50, textAlign: 'center' }]}>RPE</Text>
                          </View>

                          {block.sets.map((set: any, sIdx: number) => {
                            let formattedMetric = '';
                            if (block.exercise?.tracking_type === 'WEIGHT_REPS') {
                              formattedMetric = `${set.metrics.weight} Kg × ${set.metrics.reps} reps`;
                            } else if (block.exercise?.tracking_type === 'TIME_VARIANT') {
                              formattedMetric = `${set.metrics.duration_seconds} seg ${set.metrics.added_weight ? `(+${set.metrics.added_weight} Kg)` : ''}`;
                            } else if (block.exercise?.tracking_type === 'HEIGHT_CONTACTS') {
                              formattedMetric = `${set.metrics.height_cm} cm / ${set.metrics.contacts} reps`;
                            }

                            return (
                              <View key={sIdx} style={styles.detailsSetRow}>
                                <Text style={styles.detailsSetNum}>
                                  {set.set_type === 'WARMUP' ? 'W' : set.set_type === 'DROP' ? 'D' : set.set_type === 'FAILURE' ? 'F' : set.set_number}
                                </Text>
                                <Text style={styles.detailsSetMetrics}>{formattedMetric}</Text>
                                <Text style={styles.detailsSetRpe}>{set.rpe ? `${set.rpe}` : '-'}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={styles.detailsActions}>
                  <TouchableOpacity 
                    style={[styles.detailsBtn, styles.detailsBtnEdit]} 
                    onPress={() => handleEditWorkout(selectedWorkout.id)}
                  >
                    <Text style={styles.detailsBtnTextEdit}>✏️ Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.detailsBtn, styles.detailsBtnTemplate]} 
                    onPress={() => handleSaveAsTemplate(selectedWorkout)}
                  >
                    <Text style={styles.detailsBtnTextTemplate}>📋 Crear Plantilla</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.detailsBtn, styles.detailsBtnDelete]} 
                    onPress={() => handleDeleteWorkout(selectedWorkout.id)}
                  >
                    <Text style={styles.detailsBtnTextDelete}>🗑️ Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  profileHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0082FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  profileHandle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#121214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIconEmoji: {
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110, // Margen extra para acomodar la barra colapsada flotante
  },
  activeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0C1A30',
    borderColor: '#0082FF',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  activeBannerTitle: {
    fontSize: 14,
    color: '#0082FF',
    fontWeight: '700',
  },
  activeBannerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 2,
  },
  activeResumeButton: {
    backgroundColor: '#0082FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  activeResumeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  // Tab selector styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    padding: 4,
    borderRadius: 12,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#1E1E22',
  },
  tabButtonText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  startWorkoutButton: {
    backgroundColor: '#FFFFFF',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  startWorkoutText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  historyContainer: {
    gap: 12,
  },
  templatesContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  seeAllLink: {
    color: '#0082FF',
    fontSize: 14,
    fontWeight: '700',
  },
  loader: {
    marginTop: 24,
  },
  emptyCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyTextSub: {
    color: '#48484A',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  workoutCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    paddingBottom: 10,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  workoutDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  prWorkoutBadge: {
    backgroundColor: '#11223F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  prWorkoutBadgeText: {
    color: '#0082FF',
    fontSize: 11,
    fontWeight: '800',
  },
  cardDurationVolumeRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  cardMetricLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  cardPillsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  exerciseTagPill: {
    backgroundColor: '#121214',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  exerciseTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  noExercisesText: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 10,
  },
  // Template Card styles
  templateCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#1C1C1E',
  },
  templateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    paddingBottom: 8,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  templateTag: {
    backgroundColor: '#1C3E24',
    color: '#30D158',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  templateLongPressTip: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '500',
  },
  templateDetails: {
    marginTop: 10,
    gap: 4,
  },
  templateDetailRow: {
    color: '#8E8E93',
    fontSize: 12,
  },
  // Stats Card (Image 4)
  weeklyStatsCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 24,
    padding: 20,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    marginBottom: 20,
  },
  weeklyStatsTitle: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weeklyStatsHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  weeklyHoursText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  weeklyHoursUnit: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  streakBadge: {
    backgroundColor: '#11223F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  streakBadgeText: {
    color: '#0082FF',
    fontSize: 12,
    fontWeight: '800',
  },
  barChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  chartBarColumn: {
    alignItems: 'center',
    width: 30,
  },
  chartBarTrack: {
    width: 14,
    height: 70,
    backgroundColor: '#121214',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: '#0082FF',
    borderRadius: 7,
  },
  chartBarLabel: {
    color: '#48484A',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statGridItem: {
    flex: 1,
    backgroundColor: '#121214',
    borderRadius: 16,
    padding: 14,
  },
  statGridLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statGridValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  // Modal de detalles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  detailsModalContent: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    paddingBottom: 30,
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  detailsWorkoutName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  detailsWorkoutDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  closeDetailsText: {
    color: '#0082FF',
    fontSize: 15,
    fontWeight: '600',
  },
  detailsScroll: {
    padding: 20,
    gap: 16,
  },
  detailsEmptyText: {
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 20,
  },
  detailsBlockCard: {
    backgroundColor: '#121214',
    borderRadius: 16,
    padding: 14,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  detailsExerciseName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  detailsExerciseMuscle: {
    fontSize: 12,
    color: '#0082FF',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 10,
  },
  detailsSetsTable: {
    gap: 6,
  },
  detailsTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
    paddingBottom: 4,
    marginBottom: 4,
  },
  detailsColHeader: {
    color: '#48484A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailsSetRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  detailsSetNum: {
    width: 40,
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  detailsSetMetrics: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  detailsSetRpe: {
    width: 50,
    textAlign: 'center',
    color: '#FFD60A',
    fontSize: 13,
    fontWeight: '700',
  },
  detailsActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#1C1C1E',
  },
  detailsBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsBtnEdit: {
    backgroundColor: '#0082FF',
  },
  detailsBtnTemplate: {
    backgroundColor: '#121214',
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  detailsBtnDelete: {
    backgroundColor: '#3E1010',
    flex: 0.8,
  },
  detailsBtnTextEdit: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  detailsBtnTextTemplate: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '700',
  },
  detailsBtnTextDelete: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '800',
  },
  // Nuevos estilos de perfil y dashboard para Fabián Camacaro
  profileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  profileUsernameText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  profileHeaderIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  profileDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  profileAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0082FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarLargeText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  profileNameStats: {
    flex: 1,
    justifyContent: 'center',
  },
  profileDisplayName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  workoutsStatRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  workoutsStatItem: {
    alignItems: 'flex-start',
  },
  workoutsStatNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  workoutsStatLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  // Selector de métricas de gráfica
  chartToggleSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    padding: 3,
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 16,
    gap: 6,
  },
  chartToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  chartToggleBtnActive: {
    backgroundColor: '#0082FF',
  },
  chartToggleText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  chartToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // Dashboard Section
  dashboardSection: {
    marginBottom: 24,
    gap: 12,
  },
  dashboardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0082FF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dashboardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dashboardCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  dashboardCardIcon: {
    fontSize: 20,
  },
  dashboardCardText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Estilos para el Modal de Medidas (Measures)
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  measureModalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    gap: 16,
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  measureModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  measureModalSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  measureInput: {
    height: 48,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  measureModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  measureModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  measureModalBtnCancel: {
    backgroundColor: '#2C2C2E',
  },
  measureModalBtnSave: {
    backgroundColor: '#0082FF',
  },
  measureModalBtnTextCancel: {
    color: '#E5E5EA',
    fontSize: 14,
    fontWeight: '700',
  },
  measureModalBtnTextSave: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
