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

interface MessageTranslationState {
  translations: Map<string, MessageTranslation>;
  translatingMessages: Set<string>;
}

interface MessageTranslationActions {
  translateMessage: (
    messageId: string,
    paragraphs: Array<{ originalText: string; tagName: string }>
  ) => Promise<void>;
  getTranslation: (messageId: string) => MessageTranslation | undefined;
  isTranslating: (messageId: string) => boolean;
  clearTranslation: (messageId: string) => void;
  clearAll: () => void;
}

export type MessageTranslationStore = MessageTranslationState & MessageTranslationActions;

export const useMessageTranslationStore = create<MessageTranslationStore>((set, get) => ({
  translations: new Map(),
  translatingMessages: new Set(),

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
      return { translatingMessages: newTranslatingMessages };
    });

    set((state) => {
      const newTranslations = new Map(state.translations);
      newTranslations.set(messageId, {
        messageId,
        status: 'pending',
        paragraphs: [],
        targetLang: 'zh',
        timestamp: Date.now(),
      });
      return { translations: newTranslations };
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
            translatedText: `[翻译失败: ${result.error || '未知错误'}]`,
            tagName: paragraph.tagName,
          });
        }

        if (i < paragraphs.length - 1) {
          set((state) => {
            const newTranslations = new Map(state.translations);
            newTranslations.set(messageId, {
              messageId,
              status: 'pending',
              paragraphs: [...results],
              targetLang: 'zh',
              timestamp: Date.now(),
            });
            return { translations: newTranslations };
          });
        }
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
        return { translations: newTranslations, translatingMessages: newTranslatingMessages };
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
        return { translations: newTranslations, translatingMessages: newTranslatingMessages };
      });
    }
  },

  getTranslation: (messageId) => {
    return get().translations.get(messageId);
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
      return { translations: newTranslations, translatingMessages: newTranslatingMessages };
    });
  },

  clearAll: () => {
    set({
      translations: new Map(),
      translatingMessages: new Set(),
    });
  },
}));
