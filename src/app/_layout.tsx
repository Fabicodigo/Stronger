import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { useWorkoutStore } from '@/store/workoutStore';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import ActiveWorkoutSheet from '@/components/ActiveWorkoutSheet';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [authInitialized, setAuthInitialized] = useState(false);
  const fetchExercises = useWorkoutStore((state) => state.fetchExercises);

  useEffect(() => {
    const initAuth = async () => {
      const MOCK_EMAIL = 'mockuser@strongerapp.com';
      const MOCK_PASSWORD = 'MockPassword123!';

      try {
        // 1. Comprobar si ya existe una sesión persistente
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          await fetchExercises();
        } else {
          // 2. Intentar iniciar sesión con el usuario mock
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: MOCK_EMAIL,
            password: MOCK_PASSWORD,
          });

          if (signInError) {
            // Si el usuario no existe en Supabase, intentamos registrarlo automáticamente
            console.log('Usuario mock no encontrado, intentando registrarlo...');
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: MOCK_EMAIL,
              password: MOCK_PASSWORD,
            });

            if (signUpError) throw signUpError;

            // Si el registro da sesión directa, cargamos los datos
            if (signUpData.session) {
              await fetchExercises();
            } else {
              // Reintentar login tras registro exitoso
              const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
                email: MOCK_EMAIL,
                password: MOCK_PASSWORD,
              });
              if (retryError) throw retryError;
              if (retryData.session) await fetchExercises();
            }
          } else if (signInData.session) {
            await fetchExercises();
          }
        }
      } catch (err) {
        console.error('Error al inicializar la autenticación silenciosa:', err);
      } finally {
        setAuthInitialized(true);
      }
    };

    initAuth();

    // Escuchar cambios de sesión por si expira o cambia
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await fetchExercises();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!authInitialized) {
    return <AnimatedSplashOverlay />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
      <ActiveWorkoutSheet />
    </ThemeProvider>
  );
}
