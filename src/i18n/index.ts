import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const STORAGE_KEY = 'algotrader.language';

const getInitialLanguage = (): 'zh' | 'en' => {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  }
  return 'zh';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh }
    },
    lng: getInitialLanguage(),
    fallbackLng: 'zh',
    interpolation: { escapeValue: false }
  });

export const setLanguage = (lng: 'zh' | 'en'): void => {
  i18n.changeLanguage(lng);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, lng);
  }
};

export default i18n;
export { useTranslation } from 'react-i18next';