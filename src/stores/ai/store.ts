import { create } from "zustand";
import { AiConversationStore } from "./types";

export const useAiConversationStore = create<AiConversationStore>()((set) => ({
  conversations: [],
  runtimeInfo: {},
  addConversation: () => {},
  updateConversation: () => {},
  removeConversation: () => {},
  startConversation: () => {},
  stopConversation: () => {},
  addLog: () => {},
  clearLogs: () => {},
  _setInfo: () => {},
}));
