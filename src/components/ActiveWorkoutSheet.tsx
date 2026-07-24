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
  StatusBar
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { Exercise, TrackingType, WorkoutSet, SetMetrics } from '@/types/database';
import { BottomTabInset } from '@/constants/theme';
import ExerciseInfoModal from './ExerciseInfoModal';

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
    cancelWorkout 
  } = useWorkoutStore();

  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Temporizador de descanso (Rest Timer)
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restModalVisible, setRestModalVisible] = useState(false);

  // Estados para detalles de ejercicio
  const [selectedExerciseForInfo, setSelectedExerciseForInfo] = useState<Exercise | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);

  // Estados para selección de tipo de serie
  const [selectedSetForTypeChange, setSelectedSetForTypeChange] = useState<{ blockId: string; setId: string; currentType: string } | null>(null);
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  // Estados para selección de RPE
  const [selectedSetForRpe, setSelectedSetForRpe] = useState<{ blockId: string; setId: string; currentRpe: number | null } | null>(null);
  const [rpeModalVisible, setRpeModalVisible] = useState(false);

  // Sincronizar cronómetro con la hora real de inicio
  useEffect(() => {
    if (!activeWorkout) return;

    const updateTimer = () => {
      const start = new Date(activeWorkout.start_time).getTime();
      const now = Date.now();
      setSecondsElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Conteo regresivo de descanso
  useEffect(() => {
    if (restSeconds === null) return;
    if (restSeconds <= 0) {
      setRestSeconds(null);
      Alert.alert('¡Descanso Terminado!', 'Prepárate para la siguiente serie.');
      return;
    }
    const interval = setInterval(() => {
      setRestSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [restSeconds]);

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

  const handleFinish = async () => {
    if (activeBlocks.length === 0) {
      Alert.alert(
        'Entrenamiento vacío',
        'No has añadido ningún ejercicio. ¿Deseas cancelarlo?',
        [
          { text: 'Seguir editando', style: 'cancel' },
          { text: 'Cancelar entrenamiento', style: 'destructive', onPress: () => cancelWorkout() }
        ]
      );
      return;
    }

    const success = await finishWorkout();
    if (!success) {
      Alert.alert('Error', 'Hubo un problema al guardar en Supabase.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancelar rutina',
      '¿Seguro que deseas cancelar este entrenamiento? Se borrarán los datos de esta sesión.',
      [
        { text: 'Continuar entrenando', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelWorkout() }
      ]
    );
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

  const filteredExercises = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRpeColor = (rpe: number) => {
    if (rpe >= 9) return '#FF453A'; // Muy pesado / Fallo
    if (rpe >= 7.5) return '#FFD60A'; // Esfuerzo alto
    if (rpe >= 6) return '#30D158'; // Moderado
    return '#8E8E93'; // Ligero
  };

  const renderMetricInputs = (blockId: string, set: WorkoutSet, type: TrackingType) => {
    switch (type) {
      case 'WEIGHT_REPS': {
        const metrics = set.metrics as { weight: number; reps: number };
        return (
          <View style={styles.metricsRow}>
            <TextInput
              style={styles.metricInput}
              keyboardType="decimal-pad"
              placeholder="Kg"
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
              placeholder="+Kg"
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
            <TextInput
              style={[styles.metricInput, { width: 44 }]}
              keyboardType="number-pad"
              placeholder="ms"
              placeholderTextColor="#48484A"
              value={metrics.ground_contact_time_ms ? String(metrics.ground_contact_time_ms) : ''}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                updateSet(blockId, set.id, { metrics: { ...metrics, ground_contact_time_ms: val } });
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

  // 1. RENDERIZADO DEL ESTADO EXPANDIDO (Modal Pantalla Completa)
  if (activeWorkoutExpanded) {
    return (
      <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalScreenContainer}>
          <StatusBar barStyle="light-content" />
          
          {/* Cabecera del Entrenamiento Activo */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.minimizeBtn} onPress={() => setActiveWorkoutExpanded(false)}>
              <Text style={styles.minimizeBtnText}>Minimizar</Text>
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.timerText}>{formatTime(secondsElapsed)}</Text>
              <Text style={styles.workoutName}>{activeWorkout.name}</Text>
            </View>

            <TouchableOpacity style={styles.finishBtn} onPress={handleFinish} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.finishBtnText}>Terminar</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Listado de Ejercicios en Scroll */}
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {activeBlocks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Registra tu primer ejercicio agregándolo desde el botón inferior.</Text>
              </View>
            ) : (
              activeBlocks.map((block) => (
                <View key={block.id} style={styles.blockCard}>
                  {/* Encabezado del bloque de ejercicio */}
                  <View style={styles.blockHeader}>
                    <TouchableOpacity 
                      onPress={() => handleExerciseTitlePress(block.exercise)}
                      style={{ flex: 1 }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.exerciseTitle}>
                        {block.exercise.name} <Text style={styles.infoLinkIcon}>ℹ️</Text>
                      </Text>
                      <Text style={styles.exerciseSubtitle}>{block.exercise.muscle_group}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => removeExerciseFromWorkout(block.id)}
                      style={styles.removeExerciseBtn}
                    >
                      <Text style={styles.removeExerciseText}>Quitar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Encabezados de Tabla */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.colHeader, { width: 35 }]}>Ser.</Text>
                    <Text style={[styles.colHeader, { width: 55 }]}>Tipo</Text>
                    <Text style={[styles.colHeader, { flex: 1 }]}>Registro de Métricas</Text>
                    <Text style={[styles.colHeader, { width: 45, textAlign: 'center' }]}>RPE</Text>
                    <Text style={[styles.colHeader, { width: 25 }]}></Text>
                  </View>

                  {/* Series */}
                  {block.sets.map((set) => (
                    <View key={set.id} style={styles.setRow}>
                      <TouchableOpacity 
                        style={styles.setNumberCol}
                        onPress={() => {
                          setRestSeconds(90);
                          setRestModalVisible(true);
                        }}
                      >
                        <Text style={styles.setNumberText}>{set.set_number}</Text>
                      </TouchableOpacity>

                      {/* Tipo de Serie - Abre Popover Modal */}
                      <TouchableOpacity
                        style={styles.setTypeCol}
                        onPress={() => {
                          setSelectedSetForTypeChange({ blockId: block.id, setId: set.id, currentType: set.set_type });
                          setTypeModalVisible(true);
                        }}
                      >
                        <Text style={[
                          styles.setTypeText,
                          set.set_type === 'WARMUP' && { color: '#FFD60A' },
                          set.set_type === 'DROP' && { color: '#BF5AF2' },
                          set.set_type === 'FAILURE' && { color: '#FF453A' }
                        ]}>
                          {set.set_type.substring(0, 4)}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flex: 1 }}>
                        {renderMetricInputs(block.id, set, block.exercise.tracking_type)}
                      </View>

                      {/* Botón Selector RPE */}
                      <TouchableOpacity 
                        style={styles.rpePickerBtn}
                        onPress={() => {
                          setSelectedSetForRpe({ blockId: block.id, setId: set.id, currentRpe: set.rpe });
                          setRpeModalVisible(true);
                        }}
                      >
                        <Text style={[
                          styles.rpePickerText, 
                          set.rpe !== null && { color: getRpeColor(set.rpe), fontWeight: '800' }
                        ]}>
                          {set.rpe !== null ? String(set.rpe) : '-'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.deleteSetBtn}
                        onPress={() => removeSetFromBlock(block.id, set.id)}
                      >
                        <Text style={styles.deleteSetText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity 
                    style={styles.addSetBtn} 
                    onPress={() => addSetToBlock(block.id)}
                  >
                    <Text style={styles.addSetText}>+ Añadir Serie</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {/* Temporizador de descanso flotante (Pulsa para ver reloj dinámico) */}
          {restSeconds !== null && (
            <TouchableOpacity 
              style={styles.restTimerFloat}
              onPress={() => setRestModalVisible(true)}
              activeOpacity={0.9}
            >
              <View style={styles.restTimerFloatLeft}>
                <Text style={styles.restTimerFloatTitle}>⏱️ Descanso en curso:</Text>
                <Text style={styles.restTimerFloatVal}>{restSeconds}s</Text>
              </View>
              <TouchableOpacity style={styles.restTimerSkip} onPress={() => setRestSeconds(null)}>
                <Text style={styles.restTimerSkipText}>Omitir</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* Acciones del pie de página */}
          <View style={styles.actionFooter}>
            <TouchableOpacity 
              style={styles.cancelBtn}
              onPress={handleCancel}
            >
              <Text style={styles.cancelBtnText}>Cancelar Rutina</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.addExerciseBtn}
              onPress={() => setExerciseModalVisible(true)}
            >
              <Text style={styles.addExerciseBtnText}>+ Agregar Ejercicio</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.manualRestBtn}
              onPress={handleManualRestPress}
            >
              <Text style={styles.manualRestBtnText}>⏱️ Descanso</Text>
            </TouchableOpacity>
          </View>

          {/* Visor de Detalles e Historial de Ejercicio */}
          <ExerciseInfoModal 
            exercise={selectedExerciseForInfo}
            visible={infoModalVisible}
            onClose={() => {
              setInfoModalVisible(false);
              setSelectedExerciseForInfo(null);
            }}
          />

          {/* MODAL: SELECCIÓN DE TIPO DE SERIE CON EXPLICACIÓN */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={typeModalVisible}
            onRequestClose={() => setTypeModalVisible(false)}
          >
            <View style={styles.popoverOverlay}>
              <View style={styles.popoverContent}>
                <Text style={styles.popoverTitle}>Seleccionar Tipo de Serie</Text>
                
                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('NORMAL')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#30D158' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>NORMAL</Text>
                    <Text style={styles.typeOptionDesc}>Serie de trabajo principal para progresar.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('WARMUP')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#FFD60A' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>CALENTAMIENTO (Warmup)</Text>
                    <Text style={styles.typeOptionDesc}>Preparación para las series pesadas sin fatiga extrema.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('DROP')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#BF5AF2' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>DROPSET</Text>
                    <Text style={styles.typeOptionDesc}>Serie de bajada de peso inmediatamente después de otra.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeOptionCard} onPress={() => handleTypeSelect('FAILURE')}>
                  <View style={[styles.typeIndicatorDot, { backgroundColor: '#FF453A' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeOptionName}>FALLO (Failure)</Text>
                    <Text style={styles.typeOptionDesc}>Llevar la serie al límite muscular absoluto de repeticiones.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelPopoverBtn} onPress={() => setTypeModalVisible(false)}>
                  <Text style={styles.cancelPopoverText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* MODAL: SELECTOR DE RPE EN REJILLA */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={rpeModalVisible}
            onRequestClose={() => setRpeModalVisible(false)}
          >
            <View style={styles.popoverOverlay}>
              <View style={styles.bottomSheetRpe}>
                <Text style={styles.popoverTitle}>Seleccionar Esfuerzo Percibido (RPE)</Text>
                <Text style={styles.rpeSubtitle}>Indica qué tan cerca estuviste del fallo muscular (10 = Límite)</Text>
                
                <ScrollView contentContainerStyle={styles.rpeGrid}>
                  {rpeOptions.map(val => (
                    <TouchableOpacity 
                      key={val} 
                      style={[
                        styles.rpeGridCell, 
                        { borderColor: getRpeColor(val) },
                        selectedSetForRpe?.currentRpe === val && { backgroundColor: getRpeColor(val) }
                      ]}
                      onPress={() => handleRpeSelect(val)}
                    >
                      <Text style={[
                        styles.rpeGridCellText,
                        selectedSetForRpe?.currentRpe === val && { color: '#000000', fontWeight: '800' }
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
              </View>
            </View>
          </Modal>

          {/* MODAL: TEMPORIZADOR DE DESCANSO DINÁMICO (Reloj Pulsante) */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={restModalVisible}
            onRequestClose={() => setRestModalVisible(false)}
          >
            <View style={styles.popoverOverlay}>
              <View style={styles.restModalContent}>
                <Text style={styles.restModalHeaderTitle}>Temporizador de Descanso</Text>

                {restSeconds !== null && restSeconds > 0 ? (
                  /* VISTA DE CRONÓMETRO DINÁMICO */
                  <View style={styles.restTimerActiveView}>
                    <View style={styles.timerCircle}>
                      <Text style={styles.timerCircleLabel}>Restando</Text>
                      <Text style={styles.timerCircleVal}>{formatTime(restSeconds)}</Text>
                    </View>

                    {/* Botones de ajuste dinámico +/- 30s */}
                    <View style={styles.restAdjustersRow}>
                      <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustRestTime(-30)}>
                        <Text style={styles.adjustBtnText}>- 30s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.adjustBtn, styles.adjustBtnAdd]} onPress={() => adjustRestTime(30)}>
                        <Text style={[styles.adjustBtnText, styles.adjustBtnTextAdd]}>+ 30s</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.stopRestBtn} onPress={() => setRestSeconds(null)}>
                      <Text style={styles.stopRestBtnText}>Detener Descanso</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* VISTA DE PREAJUSTES (INACTIVO) */
                  <View style={styles.restPresetsView}>
                    <Text style={styles.presetsInstructions}>Selecciona un tiempo para comenzar el descanso:</Text>
                    
                    <View style={styles.presetsGrid}>
                      <TouchableOpacity style={styles.presetTimeCard} onPress={() => setRestSeconds(60)}>
                        <Text style={styles.presetTimeVal}>1:00</Text>
                        <Text style={styles.presetTimeSub}>1 minuto</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.presetTimeCard} onPress={() => setRestSeconds(120)}>
                        <Text style={styles.presetTimeVal}>2:00</Text>
                        <Text style={styles.presetTimeSub}>2 minutos</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.presetTimeCard} onPress={() => setRestSeconds(180)}>
                        <Text style={styles.presetTimeVal}>3:00</Text>
                        <Text style={styles.presetTimeSub}>3 minutos</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.presetTimeCard} onPress={() => setRestSeconds(240)}>
                        <Text style={styles.presetTimeVal}>4:00</Text>
                        <Text style={styles.presetTimeSub}>4 minutos</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity style={styles.closeRestModalBtn} onPress={() => setRestModalVisible(false)}>
                  <Text style={styles.closeRestModalBtnText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal de selección de ejercicios */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={exerciseModalVisible}
            onRequestClose={() => setExerciseModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.catalogModalContent}>
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
                  <ActivityIndicator color="#208AEF" style={styles.modalLoader} />
                ) : (
                  <ScrollView contentContainerStyle={styles.modalList}>
                    {filteredExercises.length === 0 ? (
                      <Text style={styles.modalEmptyText}>No se encontraron ejercicios</Text>
                    ) : (
                      filteredExercises.map((ex) => (
                        <TouchableOpacity
                          key={ex.id}
                          style={styles.modalItem}
                          onPress={() => {
                            addExerciseToWorkout(ex);
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
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </Modal>
    );
  }

  // 2. RENDERIZADO DEL ESTADO COLAPSADO (Barra Flotante)
  const bottomPosition = BottomTabInset + 10;
  return (
    <TouchableOpacity 
      style={[styles.collapsedBar, { bottom: bottomPosition }]}
      onPress={() => setActiveWorkoutExpanded(true)}
      activeOpacity={0.9}
    >
      <View style={styles.collapsedLeft}>
        <View style={styles.pulseDot} />
        <Text style={styles.collapsedTitle} numberOfLines={1}>
          Entrenamiento activo: {activeWorkout.name}
        </Text>
      </View>
      <Text style={styles.collapsedTimer}>{formatTime(secondsElapsed)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalScreenContainer: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerCenter: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#30D158',
  },
  workoutName: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
  },
  minimizeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#212225',
  },
  minimizeBtnText: {
    color: '#208AEF',
    fontSize: 14,
    fontWeight: '600',
  },
  finishBtn: {
    backgroundColor: '#30D158',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  finishBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 130,
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
  blockCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderColor: '#2C2C2E',
    borderWidth: 0.5,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  infoLinkIcon: {
    fontSize: 14,
    color: '#208AEF',
  },
  exerciseSubtitle: {
    fontSize: 12,
    color: '#208AEF',
    fontWeight: '600',
    marginTop: 2,
  },
  removeExerciseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#2E3135',
  },
  removeExerciseText: {
    color: '#FF453A',
    fontSize: 12,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    marginBottom: 8,
    gap: 8,
  },
  colHeader: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
    gap: 8,
  },
  setNumberCol: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  setTypeCol: {
    width: 50,
    backgroundColor: '#2C2C2E',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  setTypeText: {
    color: '#30D158',
    fontSize: 10,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricInput: {
    width: 40,
    height: 32,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
  },
  metricDivider: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#8E8E93',
    fontSize: 10,
    marginRight: 2,
  },
  rpePickerBtn: {
    width: 38,
    height: 32,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpePickerText: {
    color: '#48484A',
    fontSize: 13,
    fontWeight: '500',
  },
  rpeInput: {
    width: 38,
    height: 32,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
  },
  deleteSetBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteSetText: {
    color: '#FF453A',
    fontSize: 20,
    fontWeight: '400',
  },
  addSetBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#212225',
  },
  addSetText: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '600',
  },
  // Temporizador flotante de la barra colapsada
  restTimerFloat: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    left: 20,
    backgroundColor: '#151517',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderColor: '#30D158',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  restTimerFloatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restTimerFloatTitle: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  restTimerFloatVal: {
    color: '#30D158',
    fontSize: 18,
    fontWeight: '800',
  },
  restTimerSkip: {
    backgroundColor: '#FF453A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  restTimerSkipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0C0C0E',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    backgroundColor: '#212225',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '700',
  },
  addExerciseBtn: {
    flex: 1,
    backgroundColor: '#208AEF',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addExerciseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  manualRestBtn: {
    backgroundColor: '#2C2C2E',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  manualRestBtnText: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '700',
  },
  // Popover / Modales flotantes RPE, Tipo de Serie y Descanso
  popoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  popoverContent: {
    backgroundColor: '#1C1C1E',
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
    backgroundColor: '#2C2C2E',
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
    backgroundColor: '#2C2C2E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelPopoverText: {
    color: '#FF453A',
    fontSize: 15,
    fontWeight: '700',
  },
  // Selector RPE Bottom Sheet
  bottomSheetRpe: {
    backgroundColor: '#1C1C1E',
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
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
    backgroundColor: '#2C2C2E',
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
    backgroundColor: '#208AEF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rpeCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // MODAL DESCANSO (Reloj Dinámico y Preajustes)
  restModalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: 'center',
    minHeight: '45%',
  },
  restModalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  restTimerActiveView: {
    alignItems: 'center',
    width: '100%',
  },
  timerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#30D158',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#213326',
    shadowColor: '#30D158',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  timerCircleLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timerCircleVal: {
    color: '#30D158',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 4,
  },
  restAdjustersRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 20,
    width: '70%',
  },
  adjustBtn: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustBtnAdd: {
    backgroundColor: '#213326',
    borderColor: '#30D158',
    borderWidth: 0.5,
  },
  adjustBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  adjustBtnTextAdd: {
    color: '#30D158',
  },
  stopRestBtn: {
    backgroundColor: '#FF453A',
    width: '70%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopRestBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  restPresetsView: {
    alignItems: 'center',
    width: '100%',
  },
  presetsInstructions: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  presetTimeCard: {
    width: '45%',
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  presetTimeVal: {
    color: '#30D158',
    fontSize: 20,
    fontWeight: '800',
  },
  presetTimeSub: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  closeRestModalBtn: {
    marginTop: 20,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  closeRestModalBtnText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal de Selección de Ejercicios
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  catalogModalContent: {
    backgroundColor: '#1C1C1E',
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
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeModalText: {
    color: '#208AEF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSearch: {
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
  },
  modalSearchInput: {
    height: 40,
    backgroundColor: '#2C2C2E',
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
    backgroundColor: '#2C2C2E',
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
    color: '#208AEF',
    fontWeight: '700',
  },
  // ESTILOS BARRA COLAPSADA
  collapsedBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 52,
    backgroundColor: '#1C2E4A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#208AEF',
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
});
