-- 1. Crear Enum para los tipos de seguimiento de ejercicios
CREATE TYPE tracking_type_enum AS ENUM ('WEIGHT_REPS', 'TIME_VARIANT', 'HEIGHT_CONTACTS');

-- 2. Crear Tabla de Ejercicios (Ejercicios predefinidos y personalizados)
CREATE TABLE public.exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    muscle_group TEXT NOT NULL,
    tracking_type tracking_type_enum NOT NULL,
    bodyweight_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en exercises
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para exercises:
-- Cualquier usuario autenticado puede leer ejercicios
CREATE POLICY "Permitir lectura de ejercicios a usuarios autenticados" 
ON public.exercises FOR SELECT 
TO authenticated 
USING (true);

-- 3. Crear Tabla de Entrenamientos (Workouts)
CREATE TABLE public.workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en workouts
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para workouts (los usuarios solo acceden a sus propios datos)
CREATE POLICY "Permitir a usuarios CRUD sobre sus propios entrenamientos" 
ON public.workouts FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 4. Crear Tabla de Bloques de Entrenamiento (Workout Blocks)
CREATE TABLE public.workout_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
    "order" INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_workout_exercise_order UNIQUE (workout_id, "order")
);

-- Habilitar RLS en workout_blocks
ALTER TABLE public.workout_blocks ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para workout_blocks
CREATE POLICY "Permitir CRUD de bloques si el entrenamiento pertenece al usuario" 
ON public.workout_blocks FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.workouts w 
        WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workouts w 
        WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
);

-- 5. Crear Tabla de Series (Sets) con la columna JSONB
CREATE TABLE public.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID NOT NULL REFERENCES public.workout_blocks(id) ON DELETE CASCADE,
    set_number INT NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'NORMAL', -- 'NORMAL', 'WARMUP', 'DROP', 'FAILURE'
    rpe REAL CONSTRAINT check_rpe CHECK (rpe >= 1.0 AND rpe <= 10.0),
    metrics JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_block_set_number UNIQUE (block_id, set_number)
);

-- Habilitar RLS en sets
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para sets
CREATE POLICY "Permitir CRUD de series si el bloque pertenece a un entrenamiento del usuario" 
ON public.sets FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.workout_blocks wb
        JOIN public.workouts w ON wb.workout_id = w.id
        WHERE wb.id = block_id AND w.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workout_blocks wb
        JOIN public.workouts w ON wb.workout_id = w.id
        WHERE wb.id = block_id AND w.user_id = auth.uid()
    )
);

-- 6. Insertar algunos ejercicios básicos por defecto
INSERT INTO public.exercises (name, muscle_group, tracking_type, bodyweight_used) VALUES
('Squat', 'Quads', 'WEIGHT_REPS', false),
('Bench Press', 'Chest', 'WEIGHT_REPS', false),
('Deadlift', 'Back', 'WEIGHT_REPS', false),
('Pull Up', 'Back', 'TIME_VARIANT', true),
('Plank', 'Core', 'TIME_VARIANT', true),
('L-Sit', 'Core', 'TIME_VARIANT', true),
('Box Jump', 'Legs', 'HEIGHT_CONTACTS', true),
('Depth Jump', 'Legs', 'HEIGHT_CONTACTS', true)
ON CONFLICT (name) DO NOTHING;
