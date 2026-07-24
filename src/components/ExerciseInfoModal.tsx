import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TouchableOpacity, 
  ScrollView, 
  TextInput,
  Platform
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { Exercise, WorkoutSet } from '@/types/database';

interface ExerciseInfoModalProps {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}

type TabType = 'summary' | 'history' | 'instructions';

export default function ExerciseInfoModal({ exercise, visible, onClose }: ExerciseInfoModalProps) {
  const { workoutsHistory } = useWorkoutStore();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [weightUnit, setWeightUnit] = useState<'Kg' | 'Lb'>('Kg');

  if (!exercise) return null;

  // -------------------------------------------------------------
  // 1. EXTRACT PERFORMANCE HISTORY & RECORDS
  // -------------------------------------------------------------
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
      sets: block.sets
    }));
  }).filter(item => item.sets.length > 0)
    .sort((a, b) => b.timestamp - a.timestamp); // Ordenar por fecha descendente

  // -------------------------------------------------------------
  // 2. DYNAMIC CALCULATIONS (PERSONAL RECORDS)
  // -------------------------------------------------------------
  let heaviestWeight = 0;
  let best1RM = 0;
  let bestSetVolume = 0;
  let bestSessionVolume = 0;
  
  // RPE personal best por número de repeticiones
  const personalBestsByReps: Record<number, number> = {};

  exerciseHistory.forEach(session => {
    let sessionVolume = 0;
    
    session.sets.forEach(set => {
      // 1. Cálculos específicos de Peso y Repeticiones (Powerlifting)
      if (exercise.tracking_type === 'WEIGHT_REPS') {
        const m = set.metrics as { weight: number; reps: number };
        if (m.weight > heaviestWeight) heaviestWeight = m.weight;
        
        const volume = m.weight * m.reps;
        sessionVolume += volume;
        if (volume > bestSetVolume) bestSetVolume = volume;

        // Fórmulas de estimación 1RM (Epley)
        if (m.reps > 0) {
          const oneRM = m.weight * (1 + m.reps / 30);
          if (oneRM > best1RM) best1RM = oneRM;

          // Mejor carga por reps
          if (!personalBestsByReps[m.reps] || m.weight > personalBestsByReps[m.reps]) {
            personalBestsByReps[m.reps] = m.weight;
          }
        }
      }
      // 2. Cálculos para Isométricos (Tiempo)
      else if (exercise.tracking_type === 'TIME_VARIANT') {
        const m = set.metrics as { duration_seconds: number; added_weight?: number };
        const weightVal = m.added_weight || 0;
        if (weightVal > heaviestWeight) heaviestWeight = weightVal;

        const volume = m.duration_seconds * weightVal;
        sessionVolume += volume;
        if (volume > bestSetVolume) bestSetVolume = volume;

        // Mejor duración por peso lastrado
        if (!personalBestsByReps[weightVal] || m.duration_seconds > personalBestsByReps[weightVal]) {
          personalBestsByReps[weightVal] = m.duration_seconds;
        }
      }
      // 3. Pliometría (Altura y contactos)
      else if (exercise.tracking_type === 'HEIGHT_CONTACTS') {
        const m = set.metrics as { height_cm: number; contacts: number };
        if (m.height_cm > heaviestWeight) heaviestWeight = m.height_cm;

        const volume = m.height_cm * m.contacts;
        sessionVolume += volume;
        if (volume > bestSetVolume) bestSetVolume = volume;

        // Mejor altura por contactos
        if (!personalBestsByReps[m.contacts] || m.height_cm > personalBestsByReps[m.contacts]) {
          personalBestsByReps[m.contacts] = m.height_cm;
        }
      }
    });

    if (sessionVolume > bestSessionVolume) {
      bestSessionVolume = sessionVolume;
    }
  });

  // Convertir registros por repeticiones en array ordenado
  const sortedSetRecords = Object.keys(personalBestsByReps)
    .map(key => ({
      keyVal: parseInt(key),
      recordVal: personalBestsByReps[parseInt(key)]
    }))
    .sort((a, b) => a.keyVal - b.keyVal);

  // Mapeo anatómico de músculos primarios y secundarios
  const getAnatomyDetails = () => {
    const nameLower = exercise.name.toLowerCase();
    if (nameLower.includes('squat') || nameLower.includes('sentadilla')) {
      return { primary: 'Cuádriceps', secondary: 'Glúteos, Femorales, Abductores' };
    }
    if (nameLower.includes('bench') || nameLower.includes('banca') || nameLower.includes('chest')) {
      return { primary: 'Pectorales (Pecho)', secondary: 'Tríceps, Deltoides Anterior' };
    }
    if (nameLower.includes('deadlift') || nameLower.includes('peso muerto')) {
      return { primary: 'Isquiotibiales, Glúteos, Erectores Espinales', secondary: 'Trapecios, Dorsales, Antebrazos' };
    }
    if (nameLower.includes('pull up') || nameLower.includes('dominada') || nameLower.includes('row')) {
      return { primary: 'Dorsal Ancho (Lats)', secondary: 'Bíceps, Braquial, Deltoides Posterior' };
    }
    if (nameLower.includes('plank') || nameLower.includes('plancha') || nameLower.includes('l-sit')) {
      return { primary: 'Abdomen (Recto Abdominal, Core)', secondary: 'Oblicuos, Hombros, Flexores de Cadera' };
    }
    if (nameLower.includes('jump') || nameLower.includes('salto') || nameLower.includes('pliometr')) {
      return { primary: 'Cuádriceps, Gemelos (Pliometría)', secondary: 'Glúteos, Femorales' };
    }
    return { primary: exercise.muscle_group, secondary: 'Estabilizadores generales' };
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
            <TouchableOpacity style={styles.backArrow} onPress={onClose}>
              <Text style={styles.backArrowText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
            <View style={{ width: 44 }} /> {/* Equilibrador de espacio */}
          </View>

          {/* Menú de Pestañas */}
          <View style={styles.tabsRow}>
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'summary' && styles.tabActive]}
              onPress={() => setActiveTab('summary')}
            >
              <Text style={[styles.tabText, activeTab === 'summary' && styles.tabTextActive]}>Resumen</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'history' && styles.tabActive]}
              onPress={() => setActiveTab('history')}
            >
              <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Historial</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tab, activeTab === 'instructions' && styles.tabActive]}
              onPress={() => setActiveTab('instructions')}
            >
              <Text style={[styles.tabText, activeTab === 'instructions' && styles.tabTextActive]}>Instrucciones</Text>
            </TouchableOpacity>
          </View>

          {/* Cuerpo Scroll */}
          <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            
            {/* ========================================================= */}
            {/* PESTAÑA 1: RESUMEN (Summary - HEVY STYLE) */}
            {/* ========================================================= */}
            {activeTab === 'summary' && (
              <View style={styles.tabContent}>
                
                {/* Anatomía / Muscle Targets (Ilustración placeholder elegante) */}
                <View style={styles.muscleIllustrationCard}>
                  <View style={styles.musclePlaceholderBody}>
                    <Text style={styles.anatomyGraphicTitle}>🎯 ZONAS OBJETIVO</Text>
                    <View style={styles.muscleHighlightedRow}>
                      <Text style={styles.muscleHighlightedLabel}>Primario:</Text>
                      <Text style={styles.muscleHighlightedVal}>{anatomy.primary}</Text>
                    </View>
                    <View style={styles.muscleHighlightedRow}>
                      <Text style={styles.muscleHighlightedLabel}>Secundario:</Text>
                      <Text style={styles.muscleHighlightedValSecondary}>{anatomy.secondary}</Text>
                    </View>
                  </View>
                </View>

                {/* Título & Detalle */}
                <View style={styles.anatomyTextCard}>
                  <Text style={styles.exerciseNameText}>{exercise.name}</Text>
                  <Text style={styles.anatomyTextRow}><Text style={styles.anatomyBold}>Músculo Principal:</Text> {anatomy.primary}</Text>
                  <Text style={styles.anatomyTextRow}><Text style={styles.anatomyBold}>Estabilizadores:</Text> {anatomy.secondary}</Text>
                </View>

                {/* Unidad de Peso */}
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, weightUnit === 'Kg' && styles.toggleBtnActive]}
                    onPress={() => setWeightUnit('Kg')}
                  >
                    <Text style={[styles.toggleBtnText, weightUnit === 'Kg' && styles.toggleBtnTextActive]}>Métricas en Kg</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, weightUnit === 'Lb' && styles.toggleBtnActive]}
                    onPress={() => setWeightUnit('Lb')}
                  >
                    <Text style={[styles.toggleBtnText, weightUnit === 'Lb' && styles.toggleBtnTextActive]}>Métricas en Lb</Text>
                  </TouchableOpacity>
                </View>

                {/* Records Personales (Hevy Style) */}
                <View style={styles.recordsSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.recordsSectionTitle}>🏆 Récords Personales</Text>
                  </View>

                  <View style={styles.recordRow}>
                    <Text style={styles.recordLabel}>Mayor Peso Levantado</Text>
                    <Text style={styles.recordValue}>{heaviestWeight} {weightUnit}</Text>
                  </View>

                  {exercise.tracking_type === 'WEIGHT_REPS' && (
                    <View style={styles.recordRow}>
                      <Text style={styles.recordLabel}>Mejor 1RM Estimado</Text>
                      <Text style={styles.recordValue}>{best1RM.toFixed(1)} {weightUnit}</Text>
                    </View>
                  )}

                  <View style={styles.recordRow}>
                    <Text style={styles.recordLabel}>Mejor Volumen de Serie</Text>
                    <Text style={styles.recordValue}>
                      {exercise.tracking_type === 'WEIGHT_REPS' ? `${bestSetVolume} ${weightUnit}` : 
                       exercise.tracking_type === 'TIME_VARIANT' ? `${bestSetVolume} seg·${weightUnit}` : 
                       `${bestSetVolume} cm·contactos`}
                    </Text>
                  </View>

                  <View style={styles.recordRow}>
                    <Text style={styles.recordLabel}>Mejor Volumen de Sesión</Text>
                    <Text style={styles.recordValue}>
                      {exercise.tracking_type === 'WEIGHT_REPS' ? `${bestSessionVolume} ${weightUnit}` : 
                       exercise.tracking_type === 'TIME_VARIANT' ? `${bestSessionVolume} seg·${weightUnit}` : 
                       `${bestSessionVolume} cm·contactos`}
                    </Text>
                  </View>
                </View>

                {/* Set Records (Hevy Style: Reps vs. Personal Best) */}
                <View style={styles.recordsSection}>
                  <Text style={styles.recordsSectionTitle}>📊 Récords por Repeticiones</Text>
                  
                  {sortedSetRecords.length === 0 ? (
                    <Text style={styles.noRecordsText}>Sin marcas registradas en este período</Text>
                  ) : (
                    <View style={styles.table}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableColHeader, { flex: 1 }]}>
                          {exercise.tracking_type === 'WEIGHT_REPS' ? 'Repeticiones' : 
                           exercise.tracking_type === 'TIME_VARIANT' ? 'Peso Lastrado' : 
                           'Contactos'}
                        </Text>
                        <Text style={[styles.tableColHeader, { width: 120, textAlign: 'right' }]}>Récord Personal</Text>
                      </View>

                      {sortedSetRecords.map((rec, index) => (
                        <View key={index} style={styles.tableRow}>
                          <Text style={styles.tableCellLabel}>
                            {exercise.tracking_type === 'WEIGHT_REPS' ? `${rec.keyVal} reps` : 
                             exercise.tracking_type === 'TIME_VARIANT' ? `${rec.keyVal} ${weightUnit}` : 
                             `${rec.keyVal} saltos`}
                          </Text>
                          <Text style={styles.tableCellVal}>
                            {exercise.tracking_type === 'WEIGHT_REPS' ? `${rec.recordVal} ${weightUnit}` : 
                             exercise.tracking_type === 'TIME_VARIANT' ? `${rec.recordVal} seg` : 
                             `${rec.recordVal} cm`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ========================================================= */}
            {/* PESTAÑA 2: HISTORIAL (History - HEVY STYLE) */}
            {/* ========================================================= */}
            {activeTab === 'history' && (
              <View style={styles.tabContent}>
                
                {exerciseHistory.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <Text style={styles.emptyHistoryText}>No hay datos registrados aún</Text>
                    <Text style={styles.emptyHistorySub}>Tus entrenamientos aparecerán aquí cuando guardes una sesión.</Text>
                  </View>
                ) : (
                  exerciseHistory.map((session, index) => (
                    <View key={`${session.id}-${index}`} style={styles.historyCard}>
                      {/* Cabecera del Workout */}
                      <View style={styles.historyCardHeader}>
                        <View>
                          <Text style={styles.historyWorkoutName}>{session.workoutName}</Text>
                          <Text style={styles.historyDate}>{session.date}</Text>
                        </View>
                        <Text style={styles.historyHeaderUnit}>SET   {exercise.tracking_type === 'WEIGHT_REPS' ? 'PESO Y REPS' : exercise.tracking_type === 'TIME_VARIANT' ? 'TIEMPO Y PESO' : 'ALTURA Y REPS'}</Text>
                      </View>

                      {/* Lista de series */}
                      <View style={styles.historySetsList}>
                        {session.sets.map((set, sIdx) => {
                          const isWarmup = set.set_type === 'WARMUP';
                          const isDropset = set.set_type === 'DROP';
                          const isFailure = set.set_type === 'FAILURE';
                          
                          // Determinar si esta serie es un Récord Personal
                          let isRecord = false;
                          if (exercise.tracking_type === 'WEIGHT_REPS') {
                            const m = set.metrics as { weight: number; reps: number };
                            isRecord = m.weight === heaviestWeight && m.weight > 0;
                          } else if (exercise.tracking_type === 'TIME_VARIANT') {
                            const m = set.metrics as { duration_seconds: number; added_weight?: number };
                            isRecord = (m.added_weight || 0) === heaviestWeight && (m.added_weight || 0) > 0;
                          }

                          let metricText = '';
                          if (exercise.tracking_type === 'WEIGHT_REPS') {
                            const m = set.metrics as { weight: number; reps: number };
                            metricText = `${m.weight} kg × ${m.reps}`;
                          } else if (exercise.tracking_type === 'TIME_VARIANT') {
                            const m = set.metrics as { duration_seconds: number; added_weight?: number };
                            metricText = `${m.duration_seconds}s${m.added_weight ? ` (+${m.added_weight} kg)` : ''}`;
                          } else if (exercise.tracking_type === 'HEIGHT_CONTACTS') {
                            const m = set.metrics as { height_cm: number; contacts: number };
                            metricText = `${m.height_cm} cm × ${m.contacts}`;
                          }

                          return (
                            <View 
                              key={set.id} 
                              style={[
                                styles.historySetRow, 
                                sIdx % 2 !== 0 && styles.historySetRowAlt
                              ]}
                            >
                              {/* Indicador de Tipo de Serie (Hevy Style: W, 1, 2, D, F) */}
                              <View style={[
                                styles.setIndicatorBadge,
                                isWarmup && styles.badgeWarmup,
                                isDropset && styles.badgeDropset,
                                isFailure && styles.badgeFailure
                              ]}>
                                <Text style={[
                                  styles.setIndicatorBadgeText,
                                  (isWarmup || isDropset || isFailure) && { color: '#FFFFFF' }
                                ]}>
                                  {isWarmup ? 'W' : isDropset ? 'D' : isFailure ? 'F' : String(set.set_number)}
                                </Text>
                              </View>

                              {/* Métricas y Valores */}
                              <View style={styles.historySetMiddle}>
                                <Text style={styles.historySetMetricsText}>{metricText}</Text>
                                {isRecord && (
                                  <View style={styles.prBadge}>
                                    <Text style={styles.prBadgeText}>👑 Récord</Text>
                                  </View>
                                )}
                              </View>

                              {/* RPE */}
                              {set.rpe && (
                                <Text style={styles.historySetRpeText}>RPE {set.rpe}</Text>
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

            {/* ========================================================= */}
            {/* PESTAÑA 3: INSTRUCCIONES (How to / Video) */}
            {/* ========================================================= */}
            {activeTab === 'instructions' && (
              <View style={styles.tabContent}>
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.playIcon}>▶</Text>
                  <Text style={styles.videoText}>Video de Ejecución</Text>
                  <Text style={styles.videoSubtext}>Muestra del movimiento correcto y errores comunes.</Text>
                </View>

                <Text style={styles.sectionTitle}>Pasos de Ejecución</Text>
                {[
                  `Comienza adoptando la postura de inicio sugerida para ${exercise.name}.`,
                  "Baja el peso controlando la carga lentamente en un lapso de 2 a 3 segundos.",
                  "Mantén la contracción durante un instante en el rango máximo del movimiento.",
                  "Empuja con explosividad para regresar a la posición inicial, exhalando el aire."
                ].map((step, idx) => (
                  <View key={idx} style={styles.stepRow}>
                    <View style={styles.stepNumberBadge}>
                      <Text style={styles.stepNumberText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
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
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  backArrow: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backArrowText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#208AEF',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#208AEF',
    fontWeight: '700',
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 20,
  },
  // Ilustración de músculos Hevy-style
  muscleIllustrationCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  musclePlaceholderBody: {
    alignItems: 'center',
    width: '100%',
  },
  anatomyGraphicTitle: {
    color: '#208AEF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  muscleHighlightedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  muscleHighlightedLabel: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '700',
  },
  muscleHighlightedVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  muscleHighlightedValSecondary: {
    color: '#B0B4BA',
    fontSize: 13,
    fontWeight: '500',
  },
  anatomyTextCard: {
    backgroundColor: '#0F0F11',
    borderColor: '#1C1C1E',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  exerciseNameText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  anatomyTextRow: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  anatomyBold: {
    color: '#E5E5EA',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    padding: 4,
    borderRadius: 10,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#208AEF',
  },
  toggleBtnText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Sección de Récords
  recordsSection: {
    backgroundColor: '#0A0A0C',
  },
  recordsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  recordLabel: {
    fontSize: 14,
    color: '#E5E5EA',
  },
  recordValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#208AEF',
  },
  noRecordsText: {
    color: '#48484A',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  // Tabla de records por reps
  table: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2E3135',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableColHeader: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
  },
  tableCellLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  tableCellVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    width: 120,
    textAlign: 'right',
  },
  // Historial Hevy-style
  emptyHistory: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
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
  historyCard: {
    backgroundColor: '#0C0C0E',
    marginBottom: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
    paddingBottom: 16,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
  },
  historyWorkoutName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  historyDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  historyHeaderUnit: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historySetsList: {
    gap: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  historySetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1C1C1E',
  },
  historySetRowAlt: {
    backgroundColor: '#222326',
  },
  setIndicatorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2E3135',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeWarmup: {
    backgroundColor: '#FFD60A',
  },
  badgeDropset: {
    backgroundColor: '#BF5AF2',
  },
  badgeFailure: {
    backgroundColor: '#FF453A',
  },
  setIndicatorBadgeText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
  },
  historySetMiddle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  historySetMetricsText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  prBadge: {
    backgroundColor: '#FFD60A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  prBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  historySetRpeText: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '700',
  },
  // Instrucciones
  videoPlaceholder: {
    height: 180,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  playIcon: {
    fontSize: 36,
    color: '#208AEF',
    marginBottom: 8,
  },
  videoText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  videoSubtext: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#1C1C1E',
    padding: 14,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C2E',
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#208AEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepText: {
    color: '#E5E5EA',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
