import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from './screens/HomeScreen';
import ResearchScreen from './screens/ResearchScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: true,
            tabBarIcon: ({ focused, color, size }) => {
              let iconName: keyof typeof Ionicons.glyphMap = 'home';

              if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
              else if (route.name === 'Research') iconName = focused ? 'search' : 'search-outline';
              else if (route.name === 'History') iconName = focused ? 'time' : 'time-outline';
              else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';

              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#3b82f6',
            tabBarInactiveTintColor: '#64748b',
            headerStyle: {
              backgroundColor: '#1e293b',
              borderBottomColor: '#334155',
              borderBottomWidth: 1,
            },
            headerTitleStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 'bold',
            },
            headerTintColor: '#ffffff',
          })}
        >
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'ResearchMind' }}
          />
          <Tab.Screen
            name="Research"
            component={ResearchScreen}
            options={{ title: 'Active Research' }}
          />
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: 'History' }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
