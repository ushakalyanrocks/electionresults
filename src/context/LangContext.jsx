import { createContext, useContext, useState } from 'react';
import { STRINGS } from '../lib/format';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('tj_lang') || 'en'; } catch { return 'en'; }
  });

  const toggle = () => {
    setLang(prev => {
      const next = prev === 'en' ? 'ta' : 'en';
      try { localStorage.setItem('tj_lang', next); } catch { /* ignore */ }
      return next;
    });
  };

  const t = (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;

  return (
    <LangContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
