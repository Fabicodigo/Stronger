import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { 
  Exercise, 
  Workout, 
  WorkoutBlock, 
  WorkoutSet, 
  TrackingType, 
  SetMetrics 
} from '@/types/database';

// Generador de UUID v4 simple para IDs locales
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export interface ActiveWorkoutBlock extends WorkoutBlock {
  exercise: Exercise;
  sets: WorkoutSet[];
}

interface WorkoutState {
  exercises: Exercise[];
  workoutsHistory: (Workout & {
    blocks: (WorkoutBlock & {
      exercise: Exercise;
      sets: WorkoutSet[];
    })[];
  })[];
  activeWorkout: Workout | null;
  activeBlocks: ActiveWorkoutBlock[];
  activeWorkoutExpanded: boolean;
  loading: boolean;
  error: string | null;

  // Acciones globales
  fetchExercises: () => Promise<void>;
  addCustomExercise: (name: string, muscleGroup: string, trackingType: TrackingType, bodyweightUsed: boolean) => Promise<boolean>;
  fetchWorkoutsHistory: () => Promise<void>;

  // Flujo de Entrenamiento Activo
  startWorkout: (name: string) => void;
  cancelWorkout: () => void;
  setActiveWorkoutExpanded: (expanded: boolean) => void;
  addExerciseToWorkout: (exercise: Exercise) => void;
  removeExerciseFromWorkout: (blockId: string) => void;
  addSetToBlock: (blockId: string) => void;
  updateSet: (blockId: string, setId: string, updatedFields: Partial<WorkoutSet>) => void;
  removeSetFromBlock: (blockId: string, setId: string) => void;
  finishWorkout: () => Promise<boolean>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  exercises: [],
  workoutsHistory: [],
  activeWorkout: null,
  activeBlocks: [],
  activeWorkoutExpanded: false,
  loading: false,
  error: null,

  setActiveWorkoutExpanded: (expanded) => {
    set({ activeWorkoutExpanded: expanded });
  },

  fetchExercises: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      set({ exercises: data as Exercise[], loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  addCustomExercise: async (name, muscleGroup, trackingType, bodyweightUsed) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase
        .from('exercises')
        .insert({
          name,
          muscle_group: muscleGroup,
          tracking_type: trackingType,
          bodyweight_used: bodyweightUsed,
        });

      if (error) throw error;
      
      // Recargar catálogo
      await get().fetchExercises();
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  fetchWorkoutsHistory: async () => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Consultar entrenamientos con bloques y series ordenados por fecha
      const { data: workoutsData, error: workoutsError } = await supabase
        .from('workouts')
        .select(`
          *,
          workout_blocks (
            *,
            exercises (*),
            sets (*)
          )
        `)
        .eq('user_id', user.id)
        .order('start_time', { ascending: false });

      if (workoutsError) throw workoutsError;

      // Formatear y ordenar los bloques internos por "order" y las series por "set_number"
      const formattedHistory = (workoutsData || []).map((w: any) => {
        const sortedBlocks = (w.workout_blocks || [])
          .map((b: any) => ({
            id: b.id,
            workout_id: b.workout_id,
            exercise_id: b.exercise_id,
            order: b.order,
            created_at: b.created_at,
            exercise: b.exercises as Exercise,
            sets: (b.sets || []).sort((s1: any, s2: any) => s1.set_number - s2.set_number) as WorkoutSet[],
          }))
          .sort((b1: any, b2: any) => b1.order - b2.order);

        return {
          id: w.id,
          user_id: w.user_id,
          start_time: w.start_time,
          end_time: w.end_time,
          name: w.name,
          created_at: w.created_at,
          blocks: sortedBlocks,
        };
      });

      set({ workoutsHistory: formattedHistory, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  startWorkout: (name) => {
    const workoutId = uuidv4();
    const newWorkout: Workout = {
      id: workoutId,
      user_id: '', // Se asignará del auth en Supabase al guardar
      name: name || `Workout ${new Date().toLocaleDateString()}`,
      start_time: new Date().toISOString(),
      end_time: null,
      created_at: new Date().toISOString(),
    };

    set({
      activeWorkout: newWorkout,
      activeBlocks: [],
      activeWorkoutExpanded: true,
    });
  },

  cancelWorkout: () => {
    set({
      activeWorkout: null,
      activeBlocks: [],
      activeWorkoutExpanded: false,
    });
  },

  addExerciseToWorkout: (exercise) => {
    const { activeWorkout, activeBlocks } = get();
    if (!activeWorkout) return;

    const blockId = uuidv4();
    const order = activeBlocks.length + 1;

    const newBlock: ActiveWorkoutBlock = {
      id: blockId,
      workout_id: activeWorkout.id,
      exercise_id: exercise.id,
      order,
      created_at: new Date().toISOString(),
      exercise,
      sets: [],
    };

    set({ activeBlocks: [...activeBlocks, newBlock] });
    
    // Añadimos la primera serie automáticamente para facilitar la UI
    get().addSetToBlock(blockId);
  },

  removeExerciseFromWorkout: (blockId) => {
    const { activeBlocks } = get();
    const updatedBlocks = activeBlocks
      .filter((b) => b.id !== blockId)
      .map((b, idx) => ({ ...b, order: idx + 1 })); // Reajustar orden
    set({ activeBlocks: updatedBlocks });
  },

  addSetToBlock: (blockId) => {
    const { activeBlocks } = get();
    const updatedBlocks = activeBlocks.map((block) => {
      if (block.id !== blockId) return block;

      const nextSetNumber = block.sets.length + 1;
      const setId = uuidv4();

      // Métricas iniciales por defecto dependiendo del tipo de ejercicio
      let initialMetrics: SetMetrics;
      switch (block.exercise.tracking_type) {
        case 'WEIGHT_REPS':
          initialMetrics = { weight: 0, reps: 0 };
          break;
        case 'TIME_VARIANT':
          initialMetrics = { duration_seconds: 0, added_weight: 0 };
          break;
        case 'HEIGHT_CONTACTS':
          initialMetrics = { height_cm: 0, contacts: 0, ground_contact_time_ms: 0 };
          break;
      }

      const newSet: WorkoutSet = {
        id: setId,
        block_id: blockId,
        set_number: nextSetNumber,
        set_type: 'NORMAL',
        rpe: null,
        metrics: initialMetrics,
        created_at: new Date().toISOString(),
      } as WorkoutSet;

      return {
        ...block,
        sets: [...block.sets, newSet],
      };
    });

    set({ activeBlocks: updatedBlocks });
  },

  updateSet: (blockId, setId, updatedFields) => {
    const { activeBlocks } = get();
    const updatedBlocks = activeBlocks.map((block) => {
      if (block.id !== blockId) return block;

      const updatedSets = block.sets.map((set) => {
        if (set.id !== setId) return set;
        
        // Unir campos modificados asegurando que no perdamos las sub-métricas
        const nextSet = {
          ...set,
          ...updatedFields,
          metrics: {
            ...set.metrics,
            ...(updatedFields.metrics || {}),
          },
        } as WorkoutSet;

        return nextSet;
      });

      return {
        ...block,
        sets: updatedSets,
      };
    });

    set({ activeBlocks: updatedBlocks });
  },

  removeSetFromBlock: (blockId, setId) => {
    const { activeBlocks } = get();
    const updatedBlocks = activeBlocks.map((block) => {
      if (block.id !== blockId) return block;

      const updatedSets = block.sets
        .filter((set) => set.id !== setId)
        .map((set, idx) => ({ ...set, set_number: idx + 1 })); // Reajustar numeración

      return {
        ...block,
        sets: updatedSets,
      };
    });

    set({ activeBlocks: updatedBlocks });
  },

  finishWorkout: async () => {
    const { activeWorkout, activeBlocks } = get();
    if (!activeWorkout) return false;

    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const endTime = new Date().toISOString();

      // 1. Guardar el entrenamiento
      const { error: workoutError } = await supabase
        .from('workouts')
        .insert({
          id: activeWorkout.id,
          user_id: user.id,
          name: activeWorkout.name,
          start_time: activeWorkout.start_time,
          end_time: endTime,
        });

      if (workoutError) throw workoutError;

      // Si no hay bloques, terminamos aquí
      if (activeBlocks.length === 0) {
        set({ 
          activeWorkout: null, 
          activeBlocks: [], 
          activeWorkoutExpanded: false, 
          loading: false 
        });
        await get().fetchWorkoutsHistory();
        return true;
      }

      // 2. Guardar los bloques del entrenamiento
      const blocksToInsert = activeBlocks.map((b) => ({
        id: b.id,
        workout_id: activeWorkout.id,
        exercise_id: b.exercise_id,
        order: b.order,
      }));

      const { error: blocksError } = await supabase
        .from('workout_blocks')
        .insert(blocksToInsert);

      if (blocksError) throw blocksError;

      // 3. Guardar las series de todos los bloques
      const setsToInsert = activeBlocks.flatMap((b) => 
        b.sets.map((s) => ({
          id: s.id,
          block_id: b.id,
          set_number: s.set_number,
          set_type: s.set_type,
          rpe: s.rpe,
          metrics: s.metrics,
        }))
      );

      if (setsToInsert.length > 0) {
        const { error: setsError } = await supabase
          .from('sets')
          .insert(setsToInsert);

        if (setsError) throw setsError;
      }

      // Limpiar estado y refrescar historial
      set({ 
        activeWorkout: null, 
        activeBlocks: [], 
        activeWorkoutExpanded: false, 
        loading: false 
      });
      await get().fetchWorkoutsHistory();
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },
}));
