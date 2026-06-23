import { create } from "zustand";
export type AiConversation = { id: string; channel_id: string; };
export const useAiConversationStore: any = create(() => ({ conversations: [] as AiConversation[], runtimeStatus: {} }));
