-- SCRIPT DE SEMILLA: Generar 1 Año de Entrenamientos Variados para mockuser@strongerapp.com
-- Ejecuta este script en el editor de consultas SQL (SQL Editor) de tu Supabase Dashboard.

DO $$
DECLARE
    v_user_id UUID;
    v_squat_id UUID;
    v_bench_id UUID;
    v_deadlift_id UUID;
    v_pullup_id UUID;
    
    v_workout_id UUID;
    v_block_id UUID;
    
    v_date TIMESTAMP WITH TIME ZONE;
    v_weeks INT;
    v_days INT;
    
    -- Cargas iniciales base
    v_squat_weight REAL := 60.0;
    v_bench_weight REAL := 40.0;
    v_deadlift_weight REAL := 70.0;
    v_pullup_seconds INT := 20;
    
    -- Factores de progresión/fase
    v_cur_squat REAL;
    v_cur_bench REAL;
    v_cur_deadlift REAL;
    v_cur_pullup INT;
    
    v_rpe REAL;
    v_days_trained INT;
    v_volume_mult REAL := 1.0;
BEGIN
    -- 1. Obtener la ID del usuario mock
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'mockuser@strongerapp.com';
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE '⚠️ ERROR: El usuario mockuser@strongerapp.com no existe. Abre la aplicación en tu emulador primero para registrarlo automáticamente y luego vuelve a ejecutar este script.';
        RETURN;
    END IF;

    -- 2. Limpiar registros previos para evitar duplicados en la prueba
    DELETE FROM public.workouts WHERE user_id = v_user_id;

    -- 3. Obtener IDs de los ejercicios predefinidos
    SELECT id INTO v_squat_id FROM public.exercises WHERE name = 'Squat';
    SELECT id INTO v_bench_id FROM public.exercises WHERE name = 'Bench Press';
    SELECT id INTO v_deadlift_id FROM public.exercises WHERE name = 'Deadlift';
    SELECT id INTO v_pullup_id FROM public.exercises WHERE name = 'Pull Up';

    RAISE NOTICE 'Generando historial de 1 año para el usuario %...', v_user_id;

    -- 4. Bucle principal de 52 semanas
    FOR v_weeks IN 1..52 LOOP
        
        -- Definimos la fase de entrenamiento y aplicamos progresión/estancamiento/declive
        IF v_weeks BETWEEN 1 AND 12 THEN
            -- Fase 1: Progresión constante inicial
            v_cur_squat := v_squat_weight + ((v_weeks - 1) * 1.5);
            v_cur_bench := v_bench_weight + ((v_weeks - 1) * 1.0);
            v_cur_deadlift := v_deadlift_weight + ((v_weeks - 1) * 2.0);
            v_cur_pullup := v_pullup_seconds + (v_weeks - 1);
            v_days_trained := 5; -- Entrena 5 veces por semana
            v_rpe := 7.5;
            
        ELSIF v_weeks BETWEEN 13 AND 16 THEN
            -- Fase 2: Estancamiento (Plateau). Se mantienen los pesos máximos de la sem 12, RPE sube por fatiga
            v_cur_squat := v_squat_weight + (11 * 1.5);
            v_cur_bench := v_bench_weight + (11 * 1.0);
            v_cur_deadlift := v_deadlift_weight + (11 * 2.0);
            v_cur_pullup := v_pullup_seconds + 11;
            v_days_trained := 4; -- Baja la asistencia a 4 días por fatiga
            v_rpe := 9.5; -- Máximo esfuerzo percibido (estancado)
            
        ELSIF v_weeks BETWEEN 17 AND 18 THEN
            -- Fase 3: Descarga (Deload). Caída del 15% en carga para recuperación, RPE bajo
            v_cur_squat := (v_squat_weight + (11 * 1.5)) * 0.85;
            v_cur_bench := (v_bench_weight + (11 * 1.0)) * 0.85;
            v_cur_deadlift := (v_deadlift_weight + (11 * 2.0)) * 0.85;
            v_cur_pullup := (v_pullup_seconds + 11) - 5;
            v_days_trained := 3; -- Frecuencia reducida
            v_rpe := 6.0; -- Descanso activo
            
        ELSIF v_weeks BETWEEN 19 AND 30 THEN
            -- Fase 4: Nueva progresión superando marcas anteriores (se toma como base la sem 12)
            v_cur_squat := (v_squat_weight + (11 * 1.5)) + ((v_weeks - 19) * 1.25);
            v_cur_bench := (v_bench_weight + (11 * 1.0)) + ((v_weeks - 19) * 0.75);
            v_cur_deadlift := (v_deadlift_weight + (11 * 2.0)) + ((v_weeks - 19) * 1.75);
            v_cur_pullup := (v_pullup_seconds + 11) + (v_weeks - 19);
            v_days_trained := 5;
            v_rpe := 8.0;
            
        ELSIF v_weeks BETWEEN 31 AND 34 THEN
            -- Fase 5: Vacaciones / Fallos en entrenamiento (Lesión/Falta de tiempo).
            -- Entrena solo 2 o 3 días por semana, pesos caen un 10%.
            v_cur_squat := ((v_squat_weight + (11 * 1.5)) + (11 * 1.25)) * 0.90;
            v_cur_bench := ((v_bench_weight + (11 * 1.0)) + (11 * 0.75)) * 0.90;
            v_cur_deadlift := ((v_deadlift_weight + (11 * 2.0)) + (11 * 1.75)) * 0.90;
            v_cur_pullup := ((v_pullup_seconds + 11) + 11) - 4;
            v_days_trained := 2; -- Frecuencia baja
            v_rpe := 7.0;
            
        ELSE
            -- Fase 6: Cierre de año a máxima intensidad (progresión final sobre la base previa a vacaciones)
            v_cur_squat := ((v_squat_weight + (11 * 1.5)) + (11 * 1.25)) + ((v_weeks - 35) * 1.5);
            v_cur_bench := ((v_bench_weight + (11 * 1.0)) + (11 * 0.75)) + ((v_weeks - 35) * 1.0);
            v_cur_deadlift := ((v_deadlift_weight + (11 * 2.0)) + (11 * 1.75)) + ((v_weeks - 35) * 2.0);
            v_cur_pullup := ((v_pullup_seconds + 11) + 11) + (v_weeks - 35);
            v_days_trained := 5;
            v_rpe := 8.5;
        END IF;

        -- Redondeamos los pesos a 1 decimal
        v_cur_squat := round(v_cur_squat::numeric, 1);
        v_cur_bench := round(v_cur_bench::numeric, 1);
        v_cur_deadlift := round(v_cur_deadlift::numeric, 1);

        -- Bucle para cada día de entrenamiento activo en la semana
        FOR v_days IN 1..v_days_trained LOOP
            -- Calcular la fecha del entrenamiento (hace X semanas, día Y)
            -- Entrenamientos a las 18:00 (6:00 PM) para simular realismo
            v_date := now() - (53 - v_weeks) * INTERVAL '7 days' + (v_days - 1) * INTERVAL '1 day' + INTERVAL '18 hours';

            -- 1. Insertar el Entrenamiento
            INSERT INTO public.workouts (user_id, start_time, end_time, name)
            VALUES (
                v_user_id, 
                v_date, 
                v_date + INTERVAL '1 hour', 
                'Entrenamiento - Sem. ' || v_weeks || ' Día ' || v_days
            )
            RETURNING id INTO v_workout_id;

            -- 2. Insertar los Bloques de Ejercicio según el Día (Rutinas alternadas)
            IF v_days = 1 OR v_days = 4 THEN
                -- Día de Piernas / Jalón: Squats + Pull Ups
                
                -- BLOQUE SQUAT
                INSERT INTO public.workout_blocks (workout_id, exercise_id, "order")
                VALUES (v_workout_id, v_squat_id, 1)
                RETURNING id INTO v_block_id;

                -- Series Squat
                -- Serie 1 (Calentamiento - W)
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 1, 'WARMUP', 6.0, json_build_object('weight', round((v_cur_squat * 0.8)::numeric, 1), 'reps', 10));
                -- Serie 2 (Trabajo Normal)
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 2, 'NORMAL', v_rpe, json_build_object('weight', v_cur_squat, 'reps', 8));
                -- Serie 3 (Trabajo Normal)
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 3, 'NORMAL', LEAST(v_rpe + 0.5, 10.0), json_build_object('weight', v_cur_squat, 'reps', 8));

                -- BLOQUE PULL UPS
                INSERT INTO public.workout_blocks (workout_id, exercise_id, "order")
                VALUES (v_workout_id, v_pullup_id, 2)
                RETURNING id INTO v_block_id;

                -- Series Pull Ups
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 1, 'NORMAL', v_rpe, json_build_object('duration_seconds', v_cur_pullup, 'added_weight', 0));
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 2, 'NORMAL', LEAST(v_rpe + 1.0, 10.0), json_build_object('duration_seconds', v_cur_pullup - 2, 'added_weight', 0));

            ELSIF v_days = 2 OR v_days = 5 THEN
                -- Día de Empuje: Bench Press
                
                -- BLOQUE BENCH PRESS
                INSERT INTO public.workout_blocks (workout_id, exercise_id, "order")
                VALUES (v_workout_id, v_bench_id, 1)
                RETURNING id INTO v_block_id;

                -- Series Bench Press
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 1, 'WARMUP', 6.0, json_build_object('weight', round((v_cur_bench * 0.8)::numeric, 1), 'reps', 10));
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 2, 'NORMAL', v_rpe, json_build_object('weight', v_cur_bench, 'reps', 8));
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 3, 'NORMAL', LEAST(v_rpe + 0.5, 10.0), json_build_object('weight', v_cur_bench, 'reps', 8));

            ELSE
                -- Día de Tracción Pesada: Deadlifts
                
                -- BLOQUE DEADLIFT
                INSERT INTO public.workout_blocks (workout_id, exercise_id, "order")
                VALUES (v_workout_id, v_deadlift_id, 1)
                RETURNING id INTO v_block_id;

                -- Series Deadlift
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 1, 'WARMUP', 6.0, json_build_object('weight', round((v_cur_deadlift * 0.8)::numeric, 1), 'reps', 8));
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 2, 'NORMAL', v_rpe, json_build_object('weight', v_cur_deadlift, 'reps', 5));
                INSERT INTO public.sets (block_id, set_number, set_type, rpe, metrics)
                VALUES (v_block_id, 3, 'FAILURE', 10.0, json_build_object('weight', v_cur_deadlift, 'reps', 5));

            END IF;

        END LOOP;
    END LOOP;

    RAISE NOTICE '¡Generación completada! Se insertaron 52 semanas de historial de entrenamientos.';
END $$;
