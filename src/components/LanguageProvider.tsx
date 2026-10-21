'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { messages, type MessageKey, type UiLanguage } from '@/lib/i18n/messages';

type LanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: MessageKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage: UiLanguage }) {
  const [language, updateLanguage] = useState<UiLanguage>(initialLanguage);
  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    document.cookie = `civicpilot_language=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
    updateLanguage(nextLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key: MessageKey) => messages[language][key], [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
