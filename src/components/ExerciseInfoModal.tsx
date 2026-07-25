import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TouchableOpacity, 
  ScrollView, 
  TextInput,
  Platform,
  Dimensions
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { Exercise, WorkoutSet } from '@/types/database';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

const screenWidth = Dimensions.get('window').width;

interface ExerciseInfoModalProps {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}

type TabType = 'summary' | 'history' | 'instructions';

export default function ExerciseInfoModal({ exercise, visible, onClose }: ExerciseInfoModalProps) {
  const { 
    workoutsHistory, 
    exerciseUnits, 
    setExerciseUnit, 
    exerciseRestDurations, 
    setExerciseRestDuration 
  } = useWorkoutStore();
  
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [chartMetric, setChartMetric] = useState<'1rm' | 'weight'>('1rm');

  if (!exercise) return null;

  const weightUnit = exerciseUnits[exercise.id] || 'Kg';
  const restDuration = exerciseRestDurations[exercise.id] || 90; // Por defecto 90s

  // 1. EXTRAER HISTORIAL DE ENTRENAMIENTOS PARA ESTE EJERCICIO
  const exerciseHistory = workoutsHistory.flatMap(workout => {
    const matchingBlocks = workout.blocks.filter(b => b.exercise_id === exercise.id);
    return matchingBlocks.map(block => ({
      id: workout.id,
      workoutName: workout.name,
      timestamp: new Date(workout.start_time).getTime(),
      date: new Date(workout.start_time).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      rawDate: new Date(workout.start_time),
      sets: block.sets
    }));
  }).filter(item => item.sets.length > 0)
    .sort((a, b) => b.timestamp - a.timestamp); // Ordenar por fecha descendente (más reciente primero)

  // Función de conversión
  const convertWeight = (weightInKg: number) => {
    if (weightUnit === 'Lb') {
      return Math.round(weightInKg * 2.20462 * 10) / 10;
    }
    return weightInKg;
  };

  // 2. CÁLCULO DE RÉCORDS Y DETALLES
  let heaviestWeight = 0;
  let heaviestWeightReps = 0;
  let best1RM = 0;
  let best1RMDate = '—';
  let bestSetVolume = 0;
  let bestSetVolumeDetail = '—';
  let bestSessionVolume = 0;
  let bestSessionVolumeDate = '—';
  
  const personalBestsByReps: Record<number, number> = {};

  exerciseHistory.forEach(session => {
    let sessionVolume = 0;
    const sessionDateFormatted = session.rawDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    session.sets.forEach(set => {
      if (exercise.tracking_type === 'WEIGHT_REPS') {
        const m = set.metrics as { weight: number; reps: number };
        const convertedW = convertWeight(m.weight);
        
        if (convertedW > heaviestWeight) {
          heaviestWeight = convertedW;
          heaviestWeightReps = m.reps;
        }
        
        const volume = convertedW * m.reps;
        sessionVolume += volume;
        if (volume > bestSetVolume) {
          bestSetVolume = volume;
          bestSetVolumeDetail = `${convertedW} ${weightUnit} × ${m.reps}`;
        }

        if (m.reps > 0) {
          const oneRM = convertedW * (1 + m.reps / 30);
          if (oneRM > best1RM) {
            best1RM = oneRM;
            best1RMDate = sessionDateFormatted;
          }

          if (!personalBestsByReps[m.reps] || convertedW > personalBestsByReps[m.reps]) {
            personalBestsByReps[m.reps] = convertedW;
          }
        }
      } else if (exercise.tracking_type === 'TIME_VARIANT') {
        const m = set.metrics as { duration_seconds: number; added_weight?: number };
        const convertedW = convertWeight(m.added_weight || 0);
        if (convertedW > heaviestWeight) {
          heaviestWeight = convertedW;
          heaviestWeightReps = m.duration_seconds;
        }

        const volume = m.duration_seconds * convertedW;
        sessionVolume += volume;
        if (volume > bestSetVolume) {
          bestSetVolume = volume;
          bestSetVolumeDetail = `${m.duration_seconds}s (+${convertedW} ${weightUnit})`;
        }

        if (!personalBestsByReps[convertedW] || m.duration_seconds > personalBestsByReps[convertedW]) {
          personalBestsByReps[convertedW] = m.duration_seconds;
        }
      }
    });

    if (sessionVolume > bestSessionVolume) {
      bestSessionVolume = sessionVolume;
      bestSessionVolumeDate = sessionDateFormatted;
    }
  });

  const sortedSetRecords = Object.keys(personalBestsByReps)
    .map(key => ({
      keyVal: parseInt(key),
      recordVal: personalBestsByReps[parseInt(key)]
    }))
    .sort((a, b) => a.keyVal - b.keyVal);

  // 3. DATOS DEL GRÁFICO (Últimas 8 sesiones, ordenadas cronológicamente)
  const chartData = [...exerciseHistory]
    .slice(0, 8)
    .reverse()
    .map(session => {
      let maxVal = 0;
      session.sets.forEach(set => {
        if (exercise.tracking_type === 'WEIGHT_REPS') {
          const m = set.metrics as { weight: number; reps: number };
          const convertedW = convertWeight(m.weight);
          if (chartMetric === '1rm') {
            const oneRM = convertedW * (1 + m.reps / 30);
            if (oneRM > maxVal) maxVal = oneRM;
          } else {
            if (convertedW > maxVal) maxVal = convertedW;
          }
        } else if (exercise.tracking_type === 'TIME_VARIANT') {
          const m = set.metrics as { duration_seconds: number; added_weight?: number };
          const w = convertWeight(m.added_weight || 0);
          if (chartMetric === '1rm') {
            if (w > maxVal) maxVal = w;
          } else {
            if (w > maxVal) maxVal = w;
          }
        }
      });

      return {
        val: Math.round(maxVal * 10) / 10,
        monthLabel: session.rawDate.toLocaleDateString(undefined, { month: 'short' })
      };
    }).filter(d => d.val > 0);

  // Cálculo de tendencia para el badge superior (+18 kg)
  let trendVal = 0;
  if (chartData.length >= 2) {
    const firstVal = chartData[0].val;
    const lastVal = chartData[chartData.length - 1].val;
    trendVal = Math.round((lastVal - firstVal) * 10) / 10;
  }

  // Generar rutas de gráfico SVG
  const chartWidth = screenWidth - 72;
  const chartHeight = 130;
  let linePath = '';
  let areaPath = '';
  let latestPoint = { x: 0, y: 0 };
  let minVal = 0;
  let maxVal = 0;

  if (chartData.length > 0) {
    const vals = chartData.map(d => d.val);
    minVal = Math.min(...vals) * 0.95;
    maxVal = Math.max(...vals) * 1.05;
    if (maxVal === minVal) {
      minVal -= 5;
      maxVal += 5;
    }

    const points = chartData.map((d, idx) => {
      const x = chartData.length > 1 
        ? (idx / (chartData.length - 1)) * (chartWidth - 20) + 10
        : chartWidth / 2;
      const y = chartHeight - 20 - ((d.val - minVal) / (maxVal - minVal)) * (chartHeight - 40);
      return { x, y };
    });

    linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    areaPath = chartData.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`
      : '';
    latestPoint = points[points.length - 1];
  }

  const getAnatomyDetails = () => {
    const nameLower = exercise.name.toLowerCase();
    if (nameLower.includes('squat') || nameLower.includes('sentadilla')) {
      return { primary: 'Cuádriceps', secondary: 'Glúteos, Femorales' };
    }
    if (nameLower.includes('bench') || nameLower.includes('banca') || nameLower.includes('chest')) {
      return { primary: 'Pectorales', secondary: 'Tríceps, Hombros' };
    }
    if (nameLower.includes('deadlift') || nameLower.includes('peso muerto')) {
      return { primary: 'Femorales, Glúteos', secondary: 'Espalda baja, Trapecios' };
    }
    if (nameLower.includes('pull up') || nameLower.includes('dominada') || nameLower.includes('row')) {
      return { primary: 'Dorsal Ancho', secondary: 'Bíceps, Espalda alta' };
    }
    return { primary: exercise.muscle_group, secondary: 'Estabilizadores' };
  };

  const anatomy = getAnatomyDetails();

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          
          {/* Cabecera del Modal (Hevy Style) */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerRoundBtn} onPress={onClose}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
              <Text style={styles.headerSubtitle}>{exercise.muscle_group} • {exercise.tracking_type === 'WEIGHT_REPS' ? 'Carga' : 'Duración'}</Text>
            </View>

            <TouchableOpacity style={styles.headerRoundBtn}>
              <Text style={styles.starText}>★</Text>
            </TouchableOpacity>
          </View>

          {/* Menú de Pestañas Hevy-Style */}
          <View style={styles.tabContainerWrapper}>
            <View style={styles.tabContainer}>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'summary' && styles.tabButtonActive]}
                onPress={() => setActiveTab('summary')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'summary' && styles.tabButtonTextActive]}>Summary</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
                onPress={() => setActiveTab('history')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'history' && styles.tabButtonTextActive]}>History</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'instructions' && styles.tabButtonActive]}
                onPress={() => setActiveTab('instructions')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'instructions' && styles.tabButtonTextActive]}>How to</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Cuerpo Scroll */}
          <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            
            {/* PESTAÑA: SUMMARY (Estadísticas y PRs en Grilla) */}
            {activeTab === 'summary' && (
              <View style={styles.tabContent}>
                
                {/* 1. Métrica de 1RM Estimada y Gráfico Sparkline */}
                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <View>
                      <Text style={styles.chartMetricTitle}>
                        {chartMetric === '1rm' ? 'Estimated 1RM' : 'Heaviest Weight'}
                      </Text>
                      <Text style={styles.chartMetricValue}>
                        {chartMetric === '1rm' ? Math.round(best1RM) : Math.round(heaviestWeight)} <Text style={styles.chartMetricUnit}>{weightUnit}</Text>
                      </Text>
                    </View>
                    {trendVal !== 0 && (
                      <View style={[styles.trendBadge, trendVal < 0 && styles.trendBadgeRed]}>
                        <Text style={styles.trendBadgeText}>
                          {trendVal > 0 ? `↗ +${trendVal}` : `↘ ${trendVal}`} {weightUnit}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* SVG Line Chart */}
                  {chartData.length > 0 ? (
                    <View style={styles.svgWrapper}>
                      <Svg width={chartWidth} height={chartHeight}>
                        <Defs>
                          <LinearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#0082FF" stopOpacity="0.4" />
                            <Stop offset="1" stopColor="#0082FF" stopOpacity="0.0" />
                          </LinearGradient>
                        </Defs>
                        {areaPath !== '' && (
                          <Path d={areaPath} fill="url(#blueGrad)" />
                        )}
                        <Path d={linePath} stroke="#0082FF" strokeWidth={3} fill="none" />
                        <Circle cx={latestPoint.x} cy={latestPoint.y} r={5} fill="#0082FF" />
                        <Circle cx={latestPoint.x} cy={latestPoint.y} r={10} stroke="#0082FF" strokeWidth={2} fill="none" />
                      </Svg>
                      
                      {/* Eje X de Meses */}
                      <View style={styles.chartLabelsRow}>
                        {chartData.map((d, idx) => (
                          <Text key={idx} style={styles.chartLabelText}>
                            {d.monthLabel}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.chartEmpty}>
                      <Text style={styles.chartEmptyText}>No hay entrenamientos en los últimos 3 meses</Text>
                    </View>
                  )}

                  {/* Selectores de Gráfico */}
                  <View style={styles.chartSelectorRow}>
                    <TouchableOpacity 
                      style={[styles.chartSelectBtn, chartMetric === '1rm' && styles.chartSelectBtnActive]}
                      onPress={() => setChartMetric('1rm')}
                    >
                      <Text style={[styles.chartSelectText, chartMetric === '1rm' && styles.chartSelectTextActive]}>1RM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.chartSelectBtn, chartMetric === 'weight' && styles.chartSelectBtnActive]}
                      onPress={() => setChartMetric('weight')}
                    >
                      <Text style={[styles.chartSelectText, chartMetric === 'weight' && styles.chartSelectTextActive]}>Heaviest Weight</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.chartPeriodLabel}>Last 3 months</Text>
                </View>

                {/* 2. Récords Personales (2x2 Grid de tarjetas Hevy) */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.iconTitle}>🏆 Personal Records</Text>
                </View>

                <View style={styles.recordsGrid}>
                  <View style={styles.recordsGridRow}>
                    <View style={styles.recordGridCard}>
                      <Text style={styles.recordGridLabel}>Estimated 1RM</Text>
                      <Text style={styles.recordGridValue}>{Math.round(best1RM)} {weightUnit}</Text>
                      <Text style={styles.recordGridSub}>{best1RMDate}</Text>
                    </View>
                    <View style={styles.recordGridCard}>
                      <Text style={styles.recordGridLabel}>Max weight</Text>
                      <Text style={styles.recordGridValue}>{heaviestWeight} {weightUnit}</Text>
                      <Text style={styles.recordGridSub}>{heaviestWeightReps} reps</Text>
                    </View>
                  </View>
                  
                  <View style={styles.recordsGridRow}>
                    <View style={styles.recordGridCard}>
                      <Text style={styles.recordGridLabel}>Best set volume</Text>
                      <Text style={styles.recordGridValue} numberOfLines={1}>{bestSetVolume} {weightUnit}</Text>
                      <Text style={styles.recordGridSub}>{bestSetVolumeDetail}</Text>
                    </View>
                    <View style={styles.recordGridCard}>
                      <Text style={styles.recordGridLabel}>Best session volume</Text>
                      <Text style={styles.recordGridValue} numberOfLines={1}>{bestSessionVolume} {weightUnit}</Text>
                      <Text style={styles.recordGridSub}>{bestSessionVolumeDate}</Text>
                    </View>
                  </View>
                </View>

                {/* 3. Panel de Configuración de Ejercicio (Unidad y Descanso) */}
                <View style={styles.settingsSectionCard}>
                  <Text style={styles.settingsCardTitle}>Configuraciones de Ejercicio</Text>
                  
                  <View style={styles.settingsSubRow}>
                    <Text style={styles.settingsLabel}>Unidad Preferida:</Text>
                    <View style={styles.unitPillsRow}>
                      <TouchableOpacity 
                        style={[styles.unitPill, weightUnit === 'Kg' && styles.unitPillActive]}
                        onPress={() => setExerciseUnit(exercise.id, 'Kg')}
                      >
                        <Text style={[styles.unitPillText, weightUnit === 'Kg' && styles.unitPillTextActive]}>Kg</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.unitPill, weightUnit === 'Lb' && styles.unitPillActive]}
                        onPress={() => setExerciseUnit(exercise.id, 'Lb')}
                      >
                        <Text style={[styles.unitPillText, weightUnit === 'Lb' && styles.unitPillTextActive]}>Lb</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.settingsSubRow}>
                    <Text style={styles.settingsLabel}>Temporizador de Descanso:</Text>
                    <TextInput 
                      style={styles.restInputStyle}
                      keyboardType="numeric"
                      value={String(restDuration)}
                      onChangeText={(text) => {
                        const val = parseInt(text) || 0;
                        setExerciseRestDuration(exercise.id, val);
                      }}
                    />
                    <Text style={styles.restInputUnitLabel}>seg</Text>
                  </View>
                </View>

                {/* 4. Tabla de marcas por Repetición (Set Records) */}
                <Text style={styles.sectionTitle}>Set Records</Text>
                {sortedSetRecords.length === 0 ? (
                  <Text style={styles.emptyText}>Sin marcas registradas en este período</Text>
                ) : (
                  <View style={styles.setRecordsTable}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCol, { flex: 1 }]}>Repeticiones</Text>
                      <Text style={[styles.tableHeaderCol, { width: 120, textAlign: 'right' }]}>Carga Récord</Text>
                    </View>
                    {sortedSetRecords.map((rec, index) => (
                      <View key={index} style={styles.tableRowStyle}>
                        <Text style={styles.tableLabelCell}>{rec.keyVal} reps</Text>
                        <Text style={styles.tableValueCell}>{rec.recordVal} {weightUnit}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* PESTAÑA: HISTORY (Historial Cronológico) */}
            {activeTab === 'history' && (
              <View style={styles.tabContent}>
                {exerciseHistory.length === 0 ? (
                  <View style={styles.emptyHistoryCard}>
                    <Text style={styles.emptyHistoryText}>No hay datos registrados aún</Text>
                    <Text style={styles.emptyHistorySub}>Tus entrenamientos aparecerán aquí cuando guardes una sesión.</Text>
                  </View>
                ) : (
                  exerciseHistory.map((session, index) => (
                    <View key={`${session.id}-${index}`} style={styles.historyWorkoutCard}>
                      <View style={styles.historyWorkoutHeader}>
                        <View>
                          <Text style={styles.historyWorkoutNameText}>{session.workoutName}</Text>
                          <Text style={styles.historyWorkoutDateText}>{session.date}</Text>
                        </View>
                      </View>

                      {/* Lista de series */}
                      <View style={styles.historySetsBlock}>
                        {session.sets.map((set, sIdx) => {
                          const isWarmup = set.set_type === 'WARMUP';
                          const isDropset = set.set_type === 'DROP';
                          const isFailure = set.set_type === 'FAILURE';
                          
                          let isRecord = false;
                          if (exercise.tracking_type === 'WEIGHT_REPS') {
                            const m = set.metrics as { weight: number; reps: number };
                            isRecord = convertWeight(m.weight) === heaviestWeight && m.weight > 0;
                          }

                          let metricText = '';
                          if (exercise.tracking_type === 'WEIGHT_REPS') {
                            const m = set.metrics as { weight: number; reps: number };
                            metricText = `${convertWeight(m.weight)} ${weightUnit} × ${m.reps}`;
                          } else if (exercise.tracking_type === 'TIME_VARIANT') {
                            const m = set.metrics as { duration_seconds: number; added_weight?: number };
                            metricText = `${m.duration_seconds}s${m.added_weight ? ` (+${convertWeight(m.added_weight)} ${weightUnit})` : ''}`;
                          }

                          return (
                            <View key={set.id} style={styles.historySetItemRow}>
                              <View style={[
                                styles.historySetBadge,
                                isWarmup && styles.badgeW,
                                isDropset && styles.badgeD,
                                isFailure && styles.badgeF
                              ]}>
                                <Text style={[
                                  styles.historySetBadgeText,
                                  (isWarmup || isDropset || isFailure) && { color: '#FFFFFF' }
                                ]}>
                                  {isWarmup ? 'W' : isDropset ? 'D' : isFailure ? 'F' : String(set.set_number)}
                                </Text>
                              </View>

                              <View style={styles.historySetValues}>
                                <Text style={styles.historySetValuesText}>{metricText}</Text>
                                {isRecord && (
                                  <View style={styles.prGoldBadge}>
                                    <Text style={styles.prGoldBadgeText}>🏆 PR</Text>
                                  </View>
                                )}
                              </View>

                              {set.rpe && (
                                <Text style={styles.historySetRpeVal}>RPE {set.rpe}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* PESTAÑA: HOW TO (Instrucciones) */}
            {activeTab === 'instructions' && (
              <View style={styles.tabContent}>
                
                {/* 1. Músculos involucrados (Primario / Secundario) */}
                <View style={styles.anatomySummaryCard}>
                  <Text style={styles.anatomyTitle}>Targets</Text>
                  <View style={styles.anatomyRow}>
                    <Text style={styles.anatomyLabel}>Primary muscle:</Text>
                    <Text style={styles.anatomyValue}>{anatomy.primary}</Text>
                  </View>
                  <View style={styles.anatomyRow}>
                    <Text style={styles.anatomyLabel}>Secondary muscle:</Text>
                    <Text style={styles.anatomyValue}>{anatomy.secondary}</Text>
                  </View>
                </View>

                {/* 2. Pasos de Ejecución */}
                <Text style={styles.sectionTitle}>Pasos de Ejecución</Text>
                {[
                  `Adopta la postura inicial para realizar ${exercise.name}.`,
                  "Ejecuta la fase concéntrica manteniendo un recorrido completo.",
                  "Mantén la contracción durante un instante en el punto de máximo esfuerzo.",
                  "Regresa de forma controlada a la posición inicial."
                ].map((step, idx) => (
                  <View key={idx} style={styles.stepContainerCard}>
                    <View style={styles.stepNumBadge}>
                      <Text style={styles.stepNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.stepDescText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: 16,
  },
  headerRoundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#121214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  starText: {
    fontSize: 18,
    color: '#0082FF',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  // Tabs Container
  tabContainerWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    padding: 3,
    borderRadius: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#1E1E22',
  },
  tabButtonText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 20,
  },
  // Gráfico de 1RM
  chartCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 20,
    padding: 20,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  chartMetricTitle: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartMetricValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  chartMetricUnit: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  trendBadge: {
    backgroundColor: '#1C3E24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  trendBadgeRed: {
    backgroundColor: '#3E1C1C',
  },
  trendBadgeText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '800',
  },
  svgWrapper: {
    alignItems: 'center',
    marginVertical: 10,
  },
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 10,
    marginTop: 8,
  },
  chartLabelText: {
    color: '#48484A',
    fontSize: 10,
    fontWeight: '700',
  },
  chartEmpty: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartEmptyText: {
    color: '#48484A',
    fontSize: 13,
  },
  chartSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    padding: 3,
    borderRadius: 10,
    marginTop: 16,
  },
  chartSelectBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  chartSelectBtnActive: {
    backgroundColor: '#1E1E22',
  },
  chartSelectText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  chartSelectTextActive: {
    color: '#FFFFFF',
  },
  chartPeriodLabel: {
    color: '#48484A',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  // Grilla de PRs
  iconTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  recordsGrid: {
    gap: 12,
  },
  recordsGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recordGridCard: {
    flex: 1,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  recordGridLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  recordGridValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 6,
  },
  recordGridSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '500',
  },
  // Configuraciones
  settingsSectionCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    gap: 14,
  },
  settingsCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0082FF',
    textTransform: 'uppercase',
  },
  settingsSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    color: '#E5E5EA',
    fontSize: 14,
    fontWeight: '500',
  },
  unitPillsRow: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    padding: 2,
    borderRadius: 8,
    width: 90,
  },
  unitPill: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
  },
  unitPillActive: {
    backgroundColor: '#1E1E22',
  },
  unitPillText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  unitPillTextActive: {
    color: '#FFFFFF',
  },
  restInputStyle: {
    backgroundColor: '#121214',
    width: 60,
    height: 32,
    borderRadius: 6,
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  restInputUnitLabel: {
    color: '#8E8E93',
    fontSize: 13,
    marginLeft: 6,
  },
  // Set records table
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
  },
  emptyText: {
    color: '#48484A',
    fontSize: 13,
  },
  setRecordsTable: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableHeaderCol: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRowStyle: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  tableLabelCell: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  tableValueCell: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    width: 120,
    textAlign: 'right',
  },
  // Historial
  emptyHistoryCard: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  emptyHistoryText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyHistorySub: {
    color: '#48484A',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  historyWorkoutCard: {
    backgroundColor: '#000000',
    marginBottom: 24,
  },
  historyWorkoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  historyWorkoutNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  historyWorkoutDateText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  historySetsBlock: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  historySetItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  historySetBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E1E22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeW: {
    backgroundColor: '#FF9500',
  },
  badgeD: {
    backgroundColor: '#BF5AF2',
  },
  badgeF: {
    backgroundColor: '#FF453A',
  },
  historySetBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  historySetValues: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  historySetValuesText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  prGoldBadge: {
    backgroundColor: '#1C3E24',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  prGoldBadgeText: {
    color: '#30D158',
    fontSize: 9,
    fontWeight: '800',
  },
  historySetRpeVal: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '700',
  },
  // Instrucciones
  anatomySummaryCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
    gap: 10,
  },
  anatomyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0082FF',
    textTransform: 'uppercase',
  },
  anatomyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  anatomyLabel: {
    color: '#8E8E93',
    fontSize: 13,
  },
  anatomyValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stepContainerCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#0C0C0E',
    padding: 16,
    borderRadius: 16,
    borderColor: '#1C1C1E',
    borderWidth: 0.5,
  },
  stepNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0082FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepDescText: {
    color: '#E5E5EA',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
