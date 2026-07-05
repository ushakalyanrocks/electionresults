import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dayMode, setDayMode] = useState(() => {
    try { return localStorage.getItem('tj_theme') === 'day'; } catch { return false; }
  });

  useEffect(() => {
    document.body.classList.toggle('day-mode', dayMode);
    try { localStorage.setItem('tj_theme', dayMode ? 'day' : 'night'); } catch { /* ignore */ }
  }, [dayMode]);

  return (
    <ThemeContext.Provider value={{ dayMode, toggle: () => setDayMode(v => !v) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
