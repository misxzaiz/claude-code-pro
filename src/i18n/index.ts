import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCNCommon from '../locales/zh-CN/common.json';
import zhCNSettings from '../locales/zh-CN/settings.json';
import zhCNTranslate from '../locales/zh-CN/translate.json';
import zhCNChat from '../locales/zh-CN/chat.json';
import zhCNMenu from '../locales/zh-CN/menu.json';
import zhCNTodo from '../locales/zh-CN/todo.json';
import zhCNErrors from '../locales/zh-CN/errors.json';

import enUSCommon from '../locales/en-US/common.json';
import enUSSettings from '../locales/en-US/settings.json';
import enUSTranslate from '../locales/en-US/translate.json';
import enUSChat from '../locales/en-US/chat.json';
import enUSMenu from '../locales/en-US/menu.json';
import enUSTodo from '../locales/en-US/todo.json';
import enUSErrors from '../locales/en-US/errors.json';

export const resources = {
  'zh-CN': {
    common: zhCNCommon,
    settings: zhCNSettings,
    translate: zhCNTranslate,
    chat: zhCNChat,
    menu: zhCNMenu,
    todo: zhCNTodo,
    errors: zhCNErrors,
  },
  'en-US': {
    common: enUSCommon,
    settings: enUSSettings,
    translate: enUSTranslate,
    chat: enUSChat,
    menu: enUSMenu,
    todo: enUSTodo,
    errors: enUSErrors,
  },
};

export const defaultNS = 'common';

i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  defaultNS,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
