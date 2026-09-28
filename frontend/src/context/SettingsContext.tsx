import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';

export interface SystemSettings {
  system_title: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  profile_pic_url: string;
  current_school_year: string;
  previous_school_year: string | null;
  last_rollover_timestamp: string | null;
}

interface SettingsContextType {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  fetchGlobalSettings: () => Promise<void>;
}

const defaultSettings: SystemSettings = {
  system_title: 'CPM&RM System',
  primary_color: '#2563EB',
  secondary_color: '#0a0a0a',
  logo_url: '',
  profile_pic_url: '',
  current_school_year: '2026-2027',
  previous_school_year: null,
  last_rollover_timestamp: null,
};

export const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  setSettings: () => {},
  fetchGlobalSettings: async () => {},
});

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);

  const fetchGlobalSettings = async () => {
    try {
      const response = await api.get('/api/settings');
      if (response.status === 200) {
        setSettings({
          system_title: response.data.system_title || defaultSettings.system_title,
          primary_color: response.data.primary_color || defaultSettings.primary_color,
          secondary_color: response.data.secondary_color || defaultSettings.secondary_color,
          logo_url: response.data.logo_url || '',
          profile_pic_url: response.data.profile_pic_url || '',
          current_school_year: response.data.current_school_year || defaultSettings.current_school_year,
          previous_school_year: response.data.previous_school_year || null,
          last_rollover_timestamp: response.data.last_rollover_timestamp || null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch global settings.', err);
    }
  };

  useEffect(() => {
    fetchGlobalSettings();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', settings.primary_color);
    document.documentElement.style.setProperty('--secondary-color', settings.secondary_color);
  }, [settings.primary_color, settings.secondary_color]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings, fetchGlobalSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
