// 1. Tipos de seguimiento admitidos
export type TrackingType = 'WEIGHT_REPS' | 'TIME_VARIANT' | 'HEIGHT_CONTACTS';

// 2. Estructuras del JSONB de métricas dinámicas
export interface WeightRepsMetrics {
  weight: number; // Peso utilizado (kg o lbs)
  reps: number;   // Repeticiones realizadas
}

export interface TimeVariantMetrics {
  duration_seconds: number; // Duración en segundos
  added_weight?: number;    // Peso adicional lastrado (opcional)
  assisted_weight?: number; // Peso asistido con bandas/polea (opcional)
}

export interface HeightContactsMetrics {
  height_cm: number;               // Altura del salto o cajón en cm
  contacts: number;                // Número de contactos/repeticiones
  ground_contact_time_ms?: number; // Tiempo de contacto en el suelo en milisegundos (opcional)
}

// 3. Unión discriminada de métricas
export type SetMetrics = WeightRepsMetrics | TimeVariantMetrics | HeightContactsMetrics;

// 4. Interfaces para los registros de las tablas
export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  tracking_type: TrackingType;
  bodyweight_used: boolean;
  created_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  name: string;
  created_at: string;
}

export interface WorkoutBlock {
  id: string;
  workout_id: string;
  exercise_id: string;
  order: number;
  created_at: string;
  notes?: string | null;
  superset_id?: string | null;
}

// Interfaces específicas de series según su tipo de seguimiento
export interface BaseSet {
  id: string;
  block_id: string;
  set_number: number;
  set_type: string; // 'NORMAL' | 'WARMUP' | 'DROP' | 'FAILURE'
  rpe: number | null;
  completed?: boolean;
  created_at: string;
}

export interface WeightRepsSet extends BaseSet {
  metrics: WeightRepsMetrics;
}

export interface TimeVariantSet extends BaseSet {
  metrics: TimeVariantMetrics;
}

export interface HeightContactsSet extends BaseSet {
  metrics: HeightContactsMetrics;
}

// Unión discriminada de Series (Set) para tipado estricto
export type WorkoutSet = WeightRepsSet | TimeVariantSet | HeightContactsSet;

// Estructura de Plantillas de entrenamiento (Workout Templates)
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: {
    exercise_id: string;
    exercise: Exercise;
    sets: {
      set_number: number;
      set_type: string;
      metrics: SetMetrics;
      rpe: number | null;
    }[];
  }[];
}
