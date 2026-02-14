import { create } from 'zustand';
import { baiduTranslate } from '../services/tauri';
import { useConfigStore } from './configStore';

export type TranslationStatus = 'idle' | 'pending' | 'done' | 'error';

export interface ParagraphTranslation {
  originalText: string;
  translatedText: string;
  tagName: string;
}

export interface MessageTranslation {
  messageId: string;
  status: TranslationStatus;
  paragraphs: ParagraphTranslation[];
  error?: string;
  targetLang: 'en' | 'zh';
  timestamp: number;
}

export interface TranslationProgress {
  current: number;
  total: number;
}

interface MessageTranslationState {
  translations: Map<string, MessageTranslation>;
  translatingMessages: Set<string>;
  translationProgress: Map<string, TranslationProgress>;
}

interface MessageTranslationActions {
  translateMessage: (
    messageId: string,
    paragraphs: Array<{ originalText: string; tagName: string }>
  ) => Promise<void>;
  getTranslation: (messageId: string) => MessageTranslation | undefined;
  getProgress: (messageId: string) => TranslationProgress | undefined;
  isTranslating: (messageId: string) => boolean;
  clearTranslation: (messageId: string) => void;
  clearAll: () => void;
}

export type MessageTranslationStore = MessageTranslationState & MessageTranslationActions;

export const useMessageTranslationStore = create<MessageTranslationStore>((set, get) => ({
  translations: new Map(),
  translatingMessages: new Set(),
  translationProgress: new Map(),

  translateMessage: async (messageId, paragraphs) => {
    const existing = get().translations.get(messageId);
    if (existing && existing.status === 'done') {
      return;
    }

    if (get().translatingMessages.has(messageId)) {
      return;
    }

    const config = useConfigStore.getState().config;
    const baiduConfig = config?.baiduTranslate;

    if (!baiduConfig?.appId || !baiduConfig?.secretKey) {
      set((state) => {
        const newTranslations = new Map(state.translations);
        newTranslations.set(messageId, {
          messageId,
          status: 'error',
          paragraphs: [],
          error: '翻译服务未配置',
          targetLang: 'zh',
          timestamp: Date.now(),
        });
        return { translations: newTranslations };
      });
      return;
    }

    set((state) => {
      const newTranslatingMessages = new Set(state.translatingMessages);
      newTranslatingMessages.add(messageId);
      const newProgress = new Map(state.translationProgress);
      newProgress.set(messageId, { current: 0, total: paragraphs.length });
      return { 
        translatingMessages: newTranslatingMessages,
        translationProgress: newProgress 
      };
    });

    try {
      const results: ParagraphTranslation[] = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        
        const result = await baiduTranslate(
          paragraph.originalText,
          baiduConfig.appId,
          baiduConfig.secretKey,
          'zh'
        );

        if (result.success && result.result) {
          results.push({
            originalText: paragraph.originalText,
            translatedText: result.result.trim(),
            tagName: paragraph.tagName,
          });
        } else {
          results.push({
            originalText: paragraph.originalText,
            translatedText: `[翻译失败]`,
            tagName: paragraph.tagName,
          });
        }

        set((state) => {
          const newProgress = new Map(state.translationProgress);
          newProgress.set(messageId, { current: i + 1, total: paragraphs.length });
          return { translationProgress: newProgress };
        });
      }

      set((state) => {
        const newTranslations = new Map(state.translations);
        newTranslations.set(messageId, {
          messageId,
          status: 'done',
          paragraphs: results,
          targetLang: 'zh',
          timestamp: Date.now(),
        });
        const newTranslatingMessages = new Set(state.translatingMessages);
        newTranslatingMessages.delete(messageId);
        const newProgress = new Map(state.translationProgress);
        newProgress.delete(messageId);
        return { 
          translations: newTranslations, 
          translatingMessages: newTranslatingMessages,
          translationProgress: newProgress
        };
      });
    } catch (error) {
      set((state) => {
        const newTranslations = new Map(state.translations);
        newTranslations.set(messageId, {
          messageId,
          status: 'error',
          paragraphs: [],
          error: error instanceof Error ? error.message : '翻译失败',
          targetLang: 'zh',
          timestamp: Date.now(),
        });
        const newTranslatingMessages = new Set(state.translatingMessages);
        newTranslatingMessages.delete(messageId);
        const newProgress = new Map(state.translationProgress);
        newProgress.delete(messageId);
        return { 
          translations: newTranslations, 
          translatingMessages: newTranslatingMessages,
          translationProgress: newProgress
        };
      });
    }
  },

  getTranslation: (messageId) => {
    return get().translations.get(messageId);
  },

  getProgress: (messageId) => {
    return get().translationProgress.get(messageId);
  },

  isTranslating: (messageId) => {
    return get().translatingMessages.has(messageId);
  },

  clearTranslation: (messageId) => {
    set((state) => {
      const newTranslations = new Map(state.translations);
      newTranslations.delete(messageId);
      const newTranslatingMessages = new Set(state.translatingMessages);
      newTranslatingMessages.delete(messageId);
      const newProgress = new Map(state.translationProgress);
      newProgress.delete(messageId);
      return { 
        translations: newTranslations, 
        translatingMessages: newTranslatingMessages,
        translationProgress: newProgress
      };
    });
  },

  clearAll: () => {
    set({
      translations: new Map(),
      translatingMessages: new Set(),
      translationProgress: new Map(),
    });
  },
}));
