// src/context/ThemeContext.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ThemeContext = createContext();

export const themeColors = {
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    iconBg: '#F1F5F9',
    primary: '#A78BFA', // Purple accent
    buttonBg: '#0F172A',
    buttonText: '#FFFFFF',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
    overlay: 'rgba(15, 23, 42, 0.75)'
  },
  dark: {
    background: '#060913',
    surface: '#0B132B',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    border: '#1E293B',
    iconBg: '#1E293B',
    primary: '#C084FC', // Brighter purple for dark mode
    buttonBg: '#FFFFFF',
    buttonText: '#060913',
    success: '#34D399',
    danger: '#F87171',
    warning: '#FBBF24',
    info: '#60A5FA',
    overlay: 'rgba(6, 9, 19, 0.85)'
  }
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true); // Default to dark mode

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('app_theme');
        if (savedTheme === 'light') setIsDark(false);
        else setIsDark(true);
      } catch (e) {
        console.log('Failed to load theme', e);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    await AsyncStorage.setItem('app_theme', newTheme ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};