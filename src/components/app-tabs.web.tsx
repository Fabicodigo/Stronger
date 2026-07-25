import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme, Text } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#1C1C1E',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
          tabBarStyle: { display: 'none' }
        }}
      />
    </Tabs>
  );
}
