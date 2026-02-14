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

export interface ParagraphTranslationState {
  messageId: string;
  paragraphIndex: number;
  originalText: string;
  translatedText: string;
  tagName: string;
  status: TranslationStatus;
}

interface MessageTranslationState {
  translations: Map<string, MessageTranslation>;
  translatingMessages: Set<string>;
  translationProgress: Map<string, TranslationProgress>;
  paragraphTranslations: Map<string, Map<number, ParagraphTranslationState>>;
  translatingParagraphs: Map<string, Set<number>>;
}

interface MessageTranslationActions {
  translateMessage: (
    messageId: string,
    paragraphs: Array<{ originalText: string; tagName: string }>
  ) => Promise<void>;
  translateParagraph: (
    messageId: string,
    paragraphIndex: number,
    originalText: string,
    tagName: string
  ) => Promise<void>;
  getTranslation: (messageId: string) => MessageTranslation | undefined;
  getProgress: (messageId: string) => TranslationProgress | undefined;
  getParagraphTranslation: (messageId: string, paragraphIndex: number) => ParagraphTranslationState | undefined;
  isTranslating: (messageId: string) => boolean;
  isParagraphTranslating: (messageId: string, paragraphIndex: number) => boolean;
  clearTranslation: (messageId: string) => void;
  clearAll: () => void;
}

export type MessageTranslationStore = MessageTranslationState & MessageTranslationActions;

export const useMessageTranslationStore = create<MessageTranslationStore>((set, get) => ({
  translations: new Map(),
  translatingMessages: new Set(),
  translationProgress: new Map(),
  paragraphTranslations: new Map(),
  translatingParagraphs: new Map(),

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

  translateParagraph: async (messageId, paragraphIndex, originalText, tagName) => {
    const existing = get().getParagraphTranslation(messageId, paragraphIndex);
    if (existing && existing.status === 'done') {
      return;
    }

    if (get().isParagraphTranslating(messageId, paragraphIndex)) {
      return;
    }

    const config = useConfigStore.getState().config;
    const baiduConfig = config?.baiduTranslate;

    if (!baiduConfig?.appId || !baiduConfig?.secretKey) {
      set((state) => {
        const newParagraphTranslations = new Map(state.paragraphTranslations);
        if (!newParagraphTranslations.has(messageId)) {
          newParagraphTranslations.set(messageId, new Map());
        }
        newParagraphTranslations.get(messageId)!.set(paragraphIndex, {
          messageId,
          paragraphIndex,
          originalText,
          translatedText: '',
          tagName,
          status: 'error',
        });
        return { paragraphTranslations: newParagraphTranslations };
      });
      return;
    }

    set((state) => {
      const newTranslatingParagraphs = new Map(state.translatingParagraphs);
      if (!newTranslatingParagraphs.has(messageId)) {
        newTranslatingParagraphs.set(messageId, new Set());
      }
      newTranslatingParagraphs.get(messageId)!.add(paragraphIndex);

      const newParagraphTranslations = new Map(state.paragraphTranslations);
      if (!newParagraphTranslations.has(messageId)) {
        newParagraphTranslations.set(messageId, new Map());
      }
      newParagraphTranslations.get(messageId)!.set(paragraphIndex, {
        messageId,
        paragraphIndex,
        originalText,
        translatedText: '',
        tagName,
        status: 'pending',
      });

      return { 
        translatingParagraphs: newTranslatingParagraphs,
        paragraphTranslations: newParagraphTranslations 
      };
    });

    try {
      const result = await baiduTranslate(
        originalText,
        baiduConfig.appId,
        baiduConfig.secretKey,
        'zh'
      );

      set((state) => {
        const newParagraphTranslations = new Map(state.paragraphTranslations);
        if (!newParagraphTranslations.has(messageId)) {
          newParagraphTranslations.set(messageId, new Map());
        }
        newParagraphTranslations.get(messageId)!.set(paragraphIndex, {
          messageId,
          paragraphIndex,
          originalText,
          translatedText: result.success && result.result ? result.result.trim() : '[翻译失败]',
          tagName,
          status: 'done',
        });

        const newTranslatingParagraphs = new Map(state.translatingParagraphs);
        if (newTranslatingParagraphs.has(messageId)) {
          newTranslatingParagraphs.get(messageId)!.delete(paragraphIndex);
        }

        return { 
          paragraphTranslations: newParagraphTranslations,
          translatingParagraphs: newTranslatingParagraphs 
        };
      });
    } catch (error) {
      set((state) => {
        const newParagraphTranslations = new Map(state.paragraphTranslations);
        if (!newParagraphTranslations.has(messageId)) {
          newParagraphTranslations.set(messageId, new Map());
        }
        newParagraphTranslations.get(messageId)!.set(paragraphIndex, {
          messageId,
          paragraphIndex,
          originalText,
          translatedText: '',
          tagName,
          status: 'error',
        });

        const newTranslatingParagraphs = new Map(state.translatingParagraphs);
        if (newTranslatingParagraphs.has(messageId)) {
          newTranslatingParagraphs.get(messageId)!.delete(paragraphIndex);
        }

        return { 
          paragraphTranslations: newParagraphTranslations,
          translatingParagraphs: newTranslatingParagraphs 
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

  getParagraphTranslation: (messageId, paragraphIndex) => {
    return get().paragraphTranslations.get(messageId)?.get(paragraphIndex);
  },

  isTranslating: (messageId) => {
    return get().translatingMessages.has(messageId);
  },

  isParagraphTranslating: (messageId, paragraphIndex) => {
    return get().translatingParagraphs.get(messageId)?.has(paragraphIndex) ?? false;
  },

  clearTranslation: (messageId) => {
    set((state) => {
      const newTranslations = new Map(state.translations);
      newTranslations.delete(messageId);
      const newTranslatingMessages = new Set(state.translatingMessages);
      newTranslatingMessages.delete(messageId);
      const newProgress = new Map(state.translationProgress);
      newProgress.delete(messageId);
      const newParagraphTranslations = new Map(state.paragraphTranslations);
      newParagraphTranslations.delete(messageId);
      const newTranslatingParagraphs = new Map(state.translatingParagraphs);
      newTranslatingParagraphs.delete(messageId);
      return { 
        translations: newTranslations, 
        translatingMessages: newTranslatingMessages,
        translationProgress: newProgress,
        paragraphTranslations: newParagraphTranslations,
        translatingParagraphs: newTranslatingParagraphs
      };
    });
  },

  clearAll: () => {
    set({
      translations: new Map(),
      translatingMessages: new Set(),
      translationProgress: new Map(),
      paragraphTranslations: new Map(),
      translatingParagraphs: new Map(),
    });
  },
}));
