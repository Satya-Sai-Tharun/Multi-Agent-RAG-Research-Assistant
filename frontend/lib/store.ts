import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Document } from './api';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  citations?: any[];
  subQueries?: string[];
  isMultiHop?: boolean;
  strategy?: string;
}

interface AppState {
  // Documents
  documents: Document[];
  setDocuments: (docs: Document[]) => void;
  
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: () => string;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;

  // Messages
  messages: Record<string, HistoryMessage[]>;
  appendMessage: (sessionId: string, msg: HistoryMessage) => void;
  updateMessage: (sessionId: string, msgId: string, updates: Partial<HistoryMessage>) => void;
  
  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  
  // Hydration
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      documents: [],
      setDocuments: (docs) => set({ documents: docs }),
      
      sessions: [],
      activeSessionId: null,
      
      createSession: () => {
        const newSession: ChatSession = {
          id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newSession.id,
          messages: { ...state.messages, [newSession.id]: [] }
        }));
        return newSession.id;
      },
      
      setActiveSession: (id) => set({ activeSessionId: id }),
      
      deleteSession: (id) => set((state) => {
        const newSessions = state.sessions.filter(s => s.id !== id);
        const newMessages = { ...state.messages };
        delete newMessages[id];
        return {
          sessions: newSessions,
          messages: newMessages,
          activeSessionId: state.activeSessionId === id 
            ? (newSessions[0]?.id || null) 
            : state.activeSessionId
        };
      }),

      updateSessionTitle: (id, title) => set((state) => ({
        sessions: state.sessions.map(s => 
          s.id === id ? { ...s, title: title.slice(0, 60), updatedAt: new Date().toISOString() } : s
        )
      })),

      messages: {},
      
      appendMessage: (sessionId, msg) => set((state) => {
        const sessionMsgs = state.messages[sessionId] || [];
        const newMsg = { ...msg, id: msg.id || `${msg.role}-${Date.now()}-${Math.random().toString(36).slice(2,6)}` };
        
        // Auto-title on first user message
        let newSessions = state.sessions;
        if (msg.role === 'user' && sessionMsgs.filter(m => m.role === 'user').length === 0) {
          newSessions = state.sessions.map(s => 
            s.id === sessionId ? { ...s, title: msg.content.slice(0, 60), updatedAt: new Date().toISOString() } : s
          );
        }

        return {
          sessions: newSessions,
          messages: {
            ...state.messages,
            [sessionId]: [...sessionMsgs, newMsg]
          }
        };
      }),

      updateMessage: (sessionId, msgId, updates) => set((state) => {
        const sessionMsgs = state.messages[sessionId] || [];
        return {
          messages: {
            ...state.messages,
            [sessionId]: sessionMsgs.map(m => m.id === msgId ? { ...m, ...updates } : m)
          }
        };
      }),
      
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'rag-app-storage',
      partialize: (state) => ({ 
        sessions: state.sessions, 
        messages: state.messages,
        isSidebarOpen: state.isSidebarOpen 
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
