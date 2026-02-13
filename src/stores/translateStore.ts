import { create } from 'zustand';
import { baiduTranslate } from '../services/tauri';
import { useConfigStore } from './configStore';

export type TranslateDirection = 'toEn' | 'toZh';

export interface TranslateHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  direction: TranslateDirection;
  timestamp: number;
}

interface TranslateState {
  sourceText: string;
  translatedText: string;
  direction: TranslateDirection;
  isTranslating: boolean;
  error: string | null;
  history: TranslateHistoryItem[];
  maxHistory: number;
}

interface TranslateActions {
  setSourceText: (text: string) => void;
  setDirection: (direction: TranslateDirection) => void;
  translate: () => Promise<void>;
  clearResult: () => void;
  addToHistory: (item: Omit<TranslateHistoryItem, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  setTranslatedText: (text: string) => void;
}

export type TranslateStore = TranslateState & TranslateActions;

export const useTranslateStore = create<TranslateStore>((set, get) => ({
  sourceText: '',
  translatedText: '',
  direction: 'toEn',
  isTranslating: false,
  error: null,
  history: [],
  maxHistory: 50,

  setSourceText: (text) => set({ sourceText: text, error: null }),

  setDirection: (direction) => set({ direction }),

  setTranslatedText: (text) => set({ translatedText: text }),

  translate: async () => {
    const { sourceText, direction } = get();
    if (!sourceText.trim()) return;

    const config = useConfigStore.getState().config;
    const baiduConfig = config?.baiduTranslate;

    if (!baiduConfig?.appId || !baiduConfig?.secretKey) {
      set({ error: '请先在设置中配置百度翻译 API' });
      return;
    }

    const to = direction === 'toEn' ? 'en' : 'zh';

    set({ isTranslating: true, error: null });

    try {
      const result = await baiduTranslate(
        sourceText,
        baiduConfig.appId,
        baiduConfig.secretKey,
        to
      );

      if (result.success && result.result) {
        set({ translatedText: result.result, isTranslating: false });

        get().addToHistory({
          sourceText,
          translatedText: result.result,
          direction,
        });
      } else {
        set({
          error: result.error || '翻译失败',
          isTranslating: false
        });
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '翻译请求失败',
        isTranslating: false
      });
    }
  },

  clearResult: () => set({ sourceText: '', translatedText: '', error: null }),

  addToHistory: (item) => {
    const { history, maxHistory } = get();
    const newItem: TranslateHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const newHistory = [newItem, ...history].slice(0, maxHistory);
    set({ history: newHistory });
  },

  clearHistory: () => set({ history: [] }),

  removeFromHistory: (id) => {
    set((state) => ({
      history: state.history.filter((item) => item.id !== id),
    }));
  },
}));
