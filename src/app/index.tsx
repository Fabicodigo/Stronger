import React, { useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar 
} from 'react-native';
import { router } from 'expo-router';
import { useWorkoutStore } from '@/store/workoutStore';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { 
    workoutsHistory, 
    activeWorkout, 
    loading, 
    fetchWorkoutsHistory, 
    startWorkout,
    setActiveWorkoutExpanded
  } = useWorkoutStore();

  useEffect(() => {
    fetchWorkoutsHistory();
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
      month: 'short' 
    });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'En progreso';
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(durationMs / 60000);
    return `${minutes} min`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stronger</Text>
          <Text style={styles.headerSubtitle}>Tus Entrenamientos</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner de Entrenamiento Activo si existe */}
        {activeWorkout && (
          <View style={styles.activeBanner}>
            <View>
              <Text style={styles.activeBannerTitle}>Tienes un entrenamiento activo</Text>
              <Text style={styles.activeBannerSubtitle}>{activeWorkout.name}</Text>
            </View>
            <TouchableOpacity 
              style={styles.activeResumeButton} 
              onPress={() => setActiveWorkoutExpanded(true)}
            >
              <Text style={styles.activeResumeText}>Reanudar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Panel de Estadísticas Rápidas */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{workoutsHistory.length}</Text>
            <Text style={styles.statLabel}>Total Sesiones</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>
              {workoutsHistory.filter(w => {
                const date = new Date(w.start_time);
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                return date >= oneWeekAgo;
              }).length}
            </Text>
            <Text style={styles.statLabel}>Esta Semana</Text>
          </View>
        </View>

        {/* Botón Principal para Empezar Entrenamiento */}
        {!activeWorkout && (
          <TouchableOpacity 
            style={styles.startWorkoutButton}
            onPress={handleStartWorkout}
            activeOpacity={0.9}
          >
            <Text style={styles.startWorkoutText}>+ Iniciar Nuevo Entrenamiento</Text>
          </TouchableOpacity>
        )}

        {/* Historial de Entrenamientos */}
        <View style={styles.historyContainer}>
          <Text style={styles.sectionTitle}>Historial Reciente</Text>
          
          {loading && workoutsHistory.length === 0 ? (
            <ActivityIndicator color="#208AEF" style={styles.loader} />
          ) : workoutsHistory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Aún no tienes entrenamientos registrados.</Text>
              <Text style={styles.emptyTextSub}>¡Crea uno nuevo presionando el botón superior!</Text>
            </View>
          ) : (
            workoutsHistory.map((workout) => (
              <View key={workout.id} style={styles.workoutCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.workoutName}>{workout.name}</Text>
                    <Text style={styles.workoutDate}>{formatDate(workout.start_time)}</Text>
                  </View>
                  <Text style={styles.workoutDuration}>
                    {formatDuration(workout.start_time, workout.end_time)}
                  </Text>
                </View>

                {workout.blocks.length > 0 ? (
                  <View style={styles.cardBlocks}>
                    {workout.blocks.slice(0, 3).map((block) => (
                      <Text key={block.id} style={styles.blockRow} numberOfLines={1}>
                        • {block.exercise?.name} ({block.sets.length} series)
                      </Text>
                    ))}
                    {workout.blocks.length > 3 && (
                      <Text style={styles.moreBlocksText}>
                        + {workout.blocks.length - 3} ejercicios más
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noExercisesText}>Sin ejercicios registrados</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#212225',
  },
  logoutText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  activeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2F4C',
    borderColor: '#208AEF',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  activeBannerTitle: {
    fontSize: 14,
    color: '#208AEF',
    fontWeight: '700',
  },
  activeBannerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 2,
  },
  activeResumeButton: {
    backgroundColor: '#208AEF',
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
    backgroundColor: '#1C1C1E',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  loader: {
    marginTop: 24,
  },
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#3A3A3C',
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
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    paddingBottom: 10,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  workoutDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  workoutDuration: {
    fontSize: 13,
    color: '#208AEF',
    fontWeight: '600',
  },
  cardBlocks: {
    marginTop: 10,
    gap: 4,
  },
  blockRow: {
    color: '#E5E5EA',
    fontSize: 13,
  },
  moreBlocksText: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 2,
  },
  noExercisesText: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 10,
  },
});
