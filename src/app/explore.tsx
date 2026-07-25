import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Modal, 
  Switch, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar 
} from 'react-native';
import { useWorkoutStore } from '@/store/workoutStore';
import { TrackingType, Exercise } from '@/types/database';
import ExerciseInfoModal from '@/components/ExerciseInfoModal';
import { useRouter } from 'expo-router';

export default function ExploreScreen() {
  const { exercises, loading, fetchExercises, addCustomExercise } = useWorkoutStore();
  const router = useRouter();
  
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  
  // Estado para el modal de crear ejercicio
  const [modalVisible, setModalVisible] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState('Chest');
  const [newExTracking, setNewExTracking] = useState<TrackingType>('WEIGHT_REPS');
  const [newExBodyweight, setNewExBodyweight] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados para detalles e historial del ejercicio
  const [selectedExerciseForInfo, setSelectedExerciseForInfo] = useState<Exercise | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);

  const handleExercisePress = (ex: Exercise) => {
    setSelectedExerciseForInfo(ex);
    setInfoModalVisible(true);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const muscles = ['All', 'Chest', 'Back', 'Quads', 'Core', 'Legs', 'Arms', 'Shoulders'];

  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesMuscle = selectedMuscle === 'All' || ex.muscle_group.toLowerCase() === selectedMuscle.toLowerCase();
    return matchesSearch && matchesMuscle;
  });

  const handleCreateExercise = async () => {
    if (!newExName.trim()) {
      setErrorMsg('El nombre es obligatorio');
      return;
    }
    
    setCreating(true);
    setErrorMsg(null);
    
    const success = await addCustomExercise(
      newExName.trim(),
      newExMuscle,
      newExTracking,
      newExBodyweight
    );

    setCreating(false);
    if (success) {
      // Limpiar formulario y cerrar
      setNewExName('');
      setNewExMuscle('Chest');
      setNewExTracking('WEIGHT_REPS');
      setNewExBodyweight(false);
      setModalVisible(false);
    } else {
      setErrorMsg('Error al guardar el ejercicio (puede que ya exista).');
    }
  };

  const getTrackingLabel = (type: TrackingType) => {
    switch (type) {
      case 'WEIGHT_REPS': return 'Peso y Reps';
      case 'TIME_VARIANT': return 'Tiempo / Estáticos';
      case 'HEIGHT_CONTACTS': return 'Altura y Contactos';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Biblioteca</Text>
            <Text style={styles.headerSubtitle}>Catálogo de Ejercicios</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>Crear</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ejercicio..."
          placeholderTextColor="#8E8E93"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filtros de Músculos */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {muscles.map(m => (
            <TouchableOpacity
              key={m}
              style={[
                styles.filterChip,
                selectedMuscle === m && styles.filterChipActive
              ]}
              onPress={() => setSelectedMuscle(m)}
            >
              <Text 
                style={[
                  styles.filterChipText,
                  selectedMuscle === m && styles.filterChipTextActive
                ]}
              >
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista de Ejercicios */}
      {loading && exercises.length === 0 ? (
        <ActivityIndicator color="#208AEF" style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.exerciseList} showsVerticalScrollIndicator={false}>
          {filteredExercises.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No se encontraron ejercicios</Text>
            </View>
          ) : (
            filteredExercises.map(ex => (
              <TouchableOpacity 
                key={ex.id} 
                style={styles.exerciseCard}
                onPress={() => handleExercisePress(ex)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMuscle}>{ex.muscle_group}</Text>
                </View>
                <View style={styles.badgeContainer}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{getTrackingLabel(ex.tracking_type)}</Text>
                  </View>
                  {ex.bodyweight_used && (
                    <View style={styles.bwBadge}>
                      <Text style={styles.bwBadgeText}>Corporal</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* Modal para Crear Ejercicio */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Ejercicio</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeModalText}>Cancelar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {errorMsg && (
                <Text style={styles.modalError}>{errorMsg}</Text>
              )}

              {/* Nombre */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre del Ejercicio</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Push Up, Front Lever, Snatch"
                  placeholderTextColor="#48484A"
                  value={newExName}
                  onChangeText={setNewExName}
                />
              </View>

              {/* Grupo Muscular */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Grupo Muscular</Text>
                <View style={styles.selectRow}>
                  {['Chest', 'Back', 'Quads', 'Core', 'Legs', 'Arms', 'Shoulders'].map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.selectOption,
                        newExMuscle === m && styles.selectOptionActive
                      ]}
                      onPress={() => setNewExMuscle(m)}
                    >
                      <Text 
                        style={[
                          styles.selectOptionText,
                          newExMuscle === m && styles.selectOptionTextActive
                        ]}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Tipo de Métrica */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tipo de Registro / Métrica</Text>
                <View style={styles.trackingOptions}>
                  <TouchableOpacity
                    style={[
                      styles.trackingOptCard,
                      newExTracking === 'WEIGHT_REPS' && styles.trackingOptCardActive
                    ]}
                    onPress={() => setNewExTracking('WEIGHT_REPS')}
                  >
                    <Text style={styles.trackingOptTitle}>Peso y Reps</Text>
                    <Text style={styles.trackingOptDesc}>Powerlifting, series tradicionales.</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.trackingOptCard,
                      newExTracking === 'TIME_VARIANT' && styles.trackingOptCardActive
                    ]}
                    onPress={() => setNewExTracking('TIME_VARIANT')}
                  >
                    <Text style={styles.trackingOptTitle}>Tiempo / Isométricos</Text>
                    <Text style={styles.trackingOptDesc}>Plancha, L-Sit, agarres de tiempo.</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.trackingOptCard,
                      newExTracking === 'HEIGHT_CONTACTS' && styles.trackingOptCardActive
                    ]}
                    onPress={() => setNewExTracking('HEIGHT_CONTACTS')}
                  >
                    <Text style={styles.trackingOptTitle}>Altura y Contactos</Text>
                    <Text style={styles.trackingOptDesc}>Pliometría, saltos al cajón, rebotes.</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Usa Peso Corporal */}
              <View style={styles.switchGroup}>
                <View>
                  <Text style={styles.switchLabelTitle}>Usa Peso Corporal</Text>
                  <Text style={styles.switchLabelDesc}>Activar para Calistenia o pliometría libre.</Text>
                </View>
                <Switch
                  value={newExBodyweight}
                  onValueChange={setNewExBodyweight}
                  trackColor={{ false: '#2C2C2E', true: '#30D158' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Botón Guardar */}
              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleCreateExercise}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Guardar Ejercicio</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Visor de Detalles e Historial */}
      <ExerciseInfoModal 
        exercise={selectedExerciseForInfo}
        visible={infoModalVisible}
        onClose={() => {
          setInfoModalVisible(false);
          setSelectedExerciseForInfo(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#208AEF',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchSection: {
    padding: 16,
  },
  searchInput: {
    height: 48,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  filterChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  filterChipText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
  },
  loader: {
    marginTop: 40,
  },
  exerciseList: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  exerciseCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: '#2C2C2E',
    borderWidth: 0.5,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exerciseMuscle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  badgeContainer: {
    alignItems: 'flex-end',
    gap: 6,
  },
  typeBadge: {
    backgroundColor: '#212225',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  typeBadgeText: {
    color: '#208AEF',
    fontSize: 11,
    fontWeight: '700',
  },
  bwBadge: {
    backgroundColor: '#2E3135',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  bwBadgeText: {
    color: '#30D158',
    fontSize: 10,
    fontWeight: '700',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeModalText: {
    color: '#FF453A',
    fontSize: 15,
    fontWeight: '600',
  },
  modalForm: {
    padding: 20,
    gap: 20,
  },
  modalError: {
    color: '#FF453A',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E5EA',
  },
  input: {
    height: 48,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },
  selectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  selectOptionActive: {
    backgroundColor: '#208AEF',
  },
  selectOptionText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  selectOptionTextActive: {
    color: '#FFFFFF',
  },
  trackingOptions: {
    gap: 10,
  },
  trackingOptCard: {
    backgroundColor: '#2C2C2E',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  trackingOptCardActive: {
    borderColor: '#208AEF',
    backgroundColor: '#1E2D3E',
  },
  trackingOptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trackingOptDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    padding: 16,
    borderRadius: 12,
  },
  switchLabelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  switchLabelDesc: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#FFFFFF',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  backBtnText: {
    color: '#0082FF',
    fontSize: 20,
    fontWeight: '800',
  },
});
