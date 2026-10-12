import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import API, { errorMessage } from "../services/api";
export interface SystemSettings {
  system_title: string;
  school_name: string;
  principal_name: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  profile_pic_url: string | null;
  login_background: string | null;
  current_school_year: string;
  school_year_start_month: number;
  previous_school_year: string | null;
  last_rollover_timestamp: string | null;
  canRevertSchoolYear: boolean;
  daysRemaining: number;
}
const defaults: SystemSettings = {
  system_title: "ECCD Management System",
  school_name: "",
  principal_name: "",
  primary_color: "#2563eb",
  secondary_color: "#111827",
  logo_url: "",
  profile_pic_url: "",
  login_background: "",
  current_school_year: "",
  school_year_start_month: 8,
  previous_school_year: null,
  last_rollover_timestamp: null,
  canRevertSchoolYear: false,
  daysRemaining: 0,
};
interface SettingsState {
  settings: SystemSettings;
  isLoaded: boolean;
  settingsError: string;
  fetchGlobalSettings: () => Promise<void>;
}
export const SettingsContext = createContext<SettingsState>({
  settings: defaults,
  isLoaded: false,
  settingsError: "",
  fetchGlobalSettings: async () => {},
});
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(defaults);
  const [isLoaded, setIsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const requestId = useRef(0);
  const fetchGlobalSettings = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const response = await API.get<SystemSettings>("/api/settings");
      if (request !== requestId.current) return;
      const month = Number(response.data.school_year_start_month);
      setSettings({
        ...defaults,
        ...response.data,
        school_year_start_month:
          Number.isInteger(month) && month >= 1 && month <= 12 ? month : 8,
      });
      setIsLoaded(true);
      setSettingsError("");
    } catch (error) {
      if (request === requestId.current) setSettingsError(errorMessage(error));
      throw error;
    }
  }, []);
  useEffect(() => {
    void fetchGlobalSettings().catch(() => {});
  }, [fetchGlobalSettings]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--primary-color",
      settings.primary_color,
    );
    document.documentElement.style.setProperty(
      "--secondary-color",
      settings.secondary_color,
    );
    document.title = settings.system_title;
  }, [settings]);
  return (
    <SettingsContext.Provider
      value={{ settings, isLoaded, settingsError, fetchGlobalSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
export const useSettings = () => useContext(SettingsContext);
