import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { 
  Exercise, 
  Workout, 
  WorkoutBlock, 
  WorkoutSet, 
  TrackingType, 
  SetMetrics,
  WorkoutTemplate
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

  // Modo edición e historial
  editingWorkoutId: string | null;
  customTemplates: WorkoutTemplate[];

  // Configuraciones personalizadas por ejercicio
  exerciseUnits: Record<string, 'Kg' | 'Lb'>;
  exerciseRestDurations: Record<string, number>;

  setExerciseUnit: (exerciseId: string, unit: 'Kg' | 'Lb') => void;
  setExerciseRestDuration: (exerciseId: string, seconds: number) => void;

  // Acciones globales
  fetchExercises: () => Promise<void>;
  addCustomExercise: (name: string, muscleGroup: string, trackingType: TrackingType, bodyweightUsed: boolean) => Promise<boolean>;
  fetchWorkoutsHistory: () => Promise<void>;
  deleteWorkoutFromHistory: (workoutId: string) => Promise<boolean>;

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

  updateBlockNotes: (blockId: string, notes: string) => void;
  toggleBlockSuperset: (blockId: string, partnerBlockId: string | null) => void;
  reorderExercises: (startIndex: number, endIndex: number) => void;
  replaceExerciseInBlock: (blockId: string, nextExercise: Exercise) => void;

  // Gestión de plantillas
  startEditingWorkout: (workoutId: string) => void;
  saveWorkoutAsTemplate: (name: string) => void;
  startWorkoutFromTemplate: (template: WorkoutTemplate) => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  exercises: [],
  workoutsHistory: [],
  activeWorkout: null,
  activeBlocks: [],
  activeWorkoutExpanded: false,
  loading: false,
  error: null,

  editingWorkoutId: null,
  customTemplates: [],

  exerciseUnits: {},
  exerciseRestDurations: {},

  setExerciseUnit: (exerciseId, unit) => {
    const prevUnit = get().exerciseUnits[exerciseId] || 'Kg';
    if (prevUnit === unit) return;

    set((state) => {
      const updatedBlocks = state.activeBlocks.map(block => {
        if (block.exercise_id !== exerciseId) return block;
        return {
          ...block,
          sets: block.sets.map(set => {
            if (block.exercise.tracking_type === 'WEIGHT_REPS') {
              const m = set.metrics as { weight: number; reps: number };
              const nextWeight = unit === 'Lb'
                ? Math.round(m.weight * 2.20462 * 10) / 10
                : Math.round(m.weight / 2.20462 * 10) / 10;
              return {
                ...set,
                metrics: { ...m, weight: nextWeight }
              };
            } else if (block.exercise.tracking_type === 'TIME_VARIANT') {
              const m = set.metrics as { duration_seconds: number; added_weight?: number };
              if (m.added_weight !== undefined) {
                const nextWeight = unit === 'Lb'
                  ? Math.round(m.added_weight * 2.20462 * 10) / 10
                  : Math.round(m.added_weight / 2.20462 * 10) / 10;
                return {
                  ...set,
                  metrics: { ...m, added_weight: nextWeight }
                };
              }
            }
            return set;
          })
        };
      });

      return {
        exerciseUnits: {
          ...state.exerciseUnits,
          [exerciseId]: unit,
        },
        activeBlocks: updatedBlocks
      };
    });
  },

  setExerciseRestDuration: (exerciseId, seconds) => {
    set((state) => ({
      exerciseRestDurations: {
        ...state.exerciseRestDurations,
        [exerciseId]: seconds,
      },
    }));
  },

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
      set({ exercises: data || [], loading: false });
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

      const { data, error } = await supabase
        .from('workouts')
        .select(`
          *,
          blocks:workout_blocks(
            *,
            exercise:exercises(*),
            sets(*)
          )
        `)
        .eq('user_id', user.id)
        .order('start_time', { ascending: false });

      if (error) throw error;

      // Ordenar las series dentro de cada bloque por set_number
      const formattedData = (data || []).map((w: any) => ({
        ...w,
        blocks: (w.blocks || []).map((b: any) => ({
          ...b,
          sets: (b.sets || []).sort((x: any, y: any) => x.set_number - y.set_number)
        })).sort((x: any, y: any) => x.order - y.order)
      }));

      set({ workoutsHistory: formattedData, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  deleteWorkoutFromHistory: async (workoutId) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('id', workoutId);
        
      if (error) throw error;
      await get().fetchWorkoutsHistory();
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  startWorkout: (name) => {
    const workoutId = uuidv4();
    const startTime = new Date().toISOString();
    
    set({
      activeWorkout: {
        id: workoutId,
        user_id: '', // Se asignará en Supabase
        name,
        start_time: startTime,
        end_time: null,
        created_at: startTime,
      },
      activeBlocks: [],
      editingWorkoutId: null,
      activeWorkoutExpanded: true,
    });
  },

  cancelWorkout: () => {
    set({
      activeWorkout: null,
      activeBlocks: [],
      activeWorkoutExpanded: false,
      editingWorkoutId: null,
    });
  },

  addExerciseToWorkout: (exercise) => {
    const { activeWorkout, activeBlocks, workoutsHistory } = get();
    if (!activeWorkout) return;

    const blockId = uuidv4();
    const order = activeBlocks.length + 1;

    // Buscar la última nota registrada para este ejercicio en el historial
    let lastNote = '';
    for (const w of workoutsHistory) {
      const b = w.blocks.find(bk => bk.exercise_id === exercise.id);
      if (b && b.notes) {
        lastNote = b.notes;
        break;
      }
    }

    const newBlock: ActiveWorkoutBlock = {
      id: blockId,
      workout_id: activeWorkout.id,
      exercise_id: exercise.id,
      order,
      created_at: new Date().toISOString(),
      exercise,
      sets: [],
      notes: lastNote || null,
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

  updateBlockNotes: (blockId, notes) => {
    const { activeBlocks } = get();
    const updated = activeBlocks.map((b) => 
      b.id === blockId ? { ...b, notes } : b
    );
    set({ activeBlocks: updated });
  },

  toggleBlockSuperset: (blockId, partnerBlockId) => {
    const { activeBlocks } = get();
    if (partnerBlockId) {
      const partnerBlock = activeBlocks.find(b => b.id === partnerBlockId);
      const supersetId = partnerBlock?.superset_id || uuidv4();
      
      const updated = activeBlocks.map((b) => {
        if (b.id === blockId || b.id === partnerBlockId) {
          return { ...b, superset_id: supersetId };
        }
        return b;
      });
      set({ activeBlocks: updated });
    } else {
      const updated = activeBlocks.map((b) => 
        b.id === blockId ? { ...b, superset_id: null } : b
      );
      set({ activeBlocks: updated });
    }
  },

  reorderExercises: (startIndex, endIndex) => {
    const { activeBlocks } = get();
    const result = [...activeBlocks];
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    
    const reordered = result.map((b, idx) => ({
      ...b,
      order: idx + 1
    }));
    set({ activeBlocks: reordered });
  },

  replaceExerciseInBlock: (blockId, nextExercise) => {
    const { activeBlocks } = get();
    const updated = activeBlocks.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          exercise_id: nextExercise.id,
          exercise: nextExercise,
          sets: b.sets.map((s) => {
            let initialMetrics: SetMetrics;
            switch (nextExercise.tracking_type) {
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
            return {
              ...s,
              metrics: initialMetrics
            } as WorkoutSet;
          })
        };
      }
      return b;
    });
    set({ activeBlocks: updated });
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
        completed: false,
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
    const { activeWorkout, activeBlocks, editingWorkoutId } = get();
    if (!activeWorkout) return false;

    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const isEditing = editingWorkoutId !== null;
      const endTime = activeWorkout.end_time || new Date().toISOString();

      if (isEditing) {
        // 1. Actualizar el entrenamiento existente en Supabase
        const { error: workoutError } = await supabase
          .from('workouts')
          .update({
            name: activeWorkout.name,
            start_time: activeWorkout.start_time,
            end_time: endTime,
          })
          .eq('id', editingWorkoutId);

        if (workoutError) throw workoutError;

        // 2. Eliminar bloques existentes de este entrenamiento (cascade borrará las series)
        const { error: deleteBlocksError } = await supabase
          .from('workout_blocks')
          .delete()
          .eq('workout_id', editingWorkoutId);

        if (deleteBlocksError) throw deleteBlocksError;
      } else {
        // 1. Insertar el nuevo entrenamiento
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
      }

      // Si no hay bloques, terminamos aquí
      if (activeBlocks.length === 0) {
        set({ 
          activeWorkout: null, 
          activeBlocks: [], 
          activeWorkoutExpanded: false, 
          editingWorkoutId: null,
          loading: false 
        });
        await get().fetchWorkoutsHistory();
        return true;
      }

      // 2. Guardar los bloques del entrenamiento (con notas y superserie)
      const blocksToInsert = activeBlocks.map((b) => ({
        id: b.id,
        workout_id: activeWorkout.id,
        exercise_id: b.exercise_id,
        order: b.order,
        notes: b.notes || null,
        superset_id: b.superset_id || null,
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
        editingWorkoutId: null,
        loading: false 
      });
      await get().fetchWorkoutsHistory();
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  startEditingWorkout: (workoutId) => {
    const { workoutsHistory } = get();
    const workoutToEdit = workoutsHistory.find((w) => w.id === workoutId);
    if (!workoutToEdit) return;

    // Clonamos en memoria
    const clonedWorkout: Workout = {
      id: workoutToEdit.id,
      user_id: workoutToEdit.user_id,
      name: workoutToEdit.name,
      start_time: workoutToEdit.start_time,
      end_time: workoutToEdit.end_time || new Date().toISOString(),
      created_at: workoutToEdit.created_at
    };

    const clonedBlocks: ActiveWorkoutBlock[] = workoutToEdit.blocks.map((b) => ({
      id: b.id,
      workout_id: b.workout_id,
      exercise_id: b.exercise_id,
      order: b.order,
      created_at: b.created_at,
      exercise: b.exercise,
      sets: b.sets.map((s) => ({
        id: s.id,
        block_id: s.block_id,
        set_number: s.set_number,
        set_type: s.set_type,
        rpe: s.rpe,
        metrics: { ...s.metrics },
        completed: true, // Por defecto se asumen completadas las series históricas
        created_at: s.created_at
      })) as WorkoutSet[]
    }));

    set({
      activeWorkout: clonedWorkout,
      activeBlocks: clonedBlocks,
      editingWorkoutId: workoutId,
      activeWorkoutExpanded: true
    });
  },

  saveWorkoutAsTemplate: (name) => {
    const { activeBlocks } = get();
    if (activeBlocks.length === 0) return;

    const templateId = uuidv4();
    const newTemplate: WorkoutTemplate = {
      id: templateId,
      name,
      exercises: activeBlocks.map((b) => ({
        exercise_id: b.exercise_id,
        exercise: b.exercise,
        sets: b.sets.map((s) => ({
          set_number: s.set_number,
          set_type: s.set_type,
          metrics: { ...s.metrics },
          rpe: s.rpe
        }))
      }))
    };

    set((state) => ({
      customTemplates: [...state.customTemplates, newTemplate]
    }));
  },

  startWorkoutFromTemplate: (template) => {
    const workoutId = uuidv4();
    const startTime = new Date().toISOString();

    const cleanName = template.name
      .replace(' (Pectoral)', '')
      .replace(' (Espalda)', '')
      .replace(' (Enfoque Cuádriceps)', '')
      .replace(' (Enfoque Femoral / Posterior)', '');

    const newWorkout: Workout = {
      id: workoutId,
      user_id: '',
      name: `${cleanName} #${get().workoutsHistory.length + 1}`,
      start_time: startTime,
      end_time: null,
      created_at: startTime
    };

    const activeBlocks: ActiveWorkoutBlock[] = template.exercises.map((ex, idx) => {
      const blockId = uuidv4();
      return {
        id: blockId,
        workout_id: workoutId,
        exercise_id: ex.exercise_id,
        order: idx + 1,
        created_at: startTime,
        exercise: ex.exercise,
        sets: ex.sets.map((s) => ({
          id: uuidv4(),
          block_id: blockId,
          set_number: s.set_number,
          set_type: s.set_type,
          metrics: { ...s.metrics },
          rpe: s.rpe,
          completed: false, // Inician sin completar
          created_at: startTime
        })) as WorkoutSet[]
      };
    });

    set({
      activeWorkout: newWorkout,
      activeBlocks,
      editingWorkoutId: null,
      activeWorkoutExpanded: true
    });
  }
}));
