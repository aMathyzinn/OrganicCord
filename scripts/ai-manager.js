const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_AI_DIR = path.join(ROOT, '.local-ai');

const TARGETS = [
  {
    type: 'dir',
    src: 'src/components/ai',
    backup: 'components/ai',
    dummyFiles: {
      'AiConfigModal.tsx': 'export const AiConfigModal: any = (props: any) => null;\n',
      'AiConversationModal.tsx': 'export const AiConversationModal: any = (props: any) => null;\n',
      'AiConversationPanel.tsx': 'export const AiConversationPanel: any = (props: any) => null;\n',
      'ChatAiButtons.tsx': 'export const ChatAiButtons: any = (props: any) => null;\n',
      'DmAiFeature.tsx': 'export const DmAiFeature: any = (props: any) => null;\nexport const processFreshMessagesForDmAi: any = () => {};\n',
      'index.ts': ''
    }
  },
  {
    type: 'dir',
    src: 'src/stores/ai',
    backup: 'stores/ai',
    dummyFiles: {
      'engine.ts': 'export const noop = {};\n',
      'orchestrator.ts': 'export const noop = {};\n',
      'prompts.ts': 'export const noop = {};\n',
      'store.ts': 'export const useAiConversationStore = () => ({ conversations: [], runtimeStatus: {} });\n',
      'types.ts': 'export type AiConversation = any; export type RuntimeState = any; export type ChannelMessage = any; export type ParticipantMemory = any;\n'
    }
  },
  {
    type: 'file',
    src: 'src/stores/aiStore.ts',
    backup: 'stores/aiStore.ts',
    dummyContent: 'import { create } from "zustand";\nexport type AiConfig = any;\nexport type AiProvider = any;\nexport type AiMessage = any;\nexport type DmAiRule = { id: string; enabled: boolean; label: string; };\nexport type AiAutoReplyRule = { id: string; account_id: string; channel_id: string; enabled: boolean; };\nexport const useAiStore: any = create(() => ({ rules: [] as AiAutoReplyRule[], dmRules: [] as DmAiRule[], handleIncomingDm: () => {}, setDmRule: () => {}, removeDmRule: () => {}, toggleDmRule: () => {}, addRule: () => {}, toggleRule: () => {}, globalConfig: {} }));\nexport const makeDefaultConfig: any = () => ({});\nexport const OPENROUTER_MODELS: any = [];\nexport const GOOGLE_MODELS: any = [];\n'
  },
  {
    type: 'file',
    src: 'src/stores/aiConversationStore.ts',
    backup: 'stores/aiConversationStore.ts',
    dummyContent: 'import { create } from "zustand";\nexport type AiConversation = { id: string; channel_id: string; };\nexport const useAiConversationStore: any = create(() => ({ conversations: [] as AiConversation[], runtimeStatus: {} }));\n'
  },
  {
    type: 'file',
    src: 'src-tauri/src/commands/ai.rs',
    backup: 'tauri/ai.rs',
    dummyContent: `use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiGeneratePayload {
    pub config: AiConfig,
    pub messages: Vec<AiMessage>,
    pub account_id: String,
    pub channel_id: String,
    pub send: bool,
    pub reply_to: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiGenerateResult {
    pub text: String,
    pub sent: bool,
}

#[tauri::command]
pub async fn ai_generate(payload: AiGeneratePayload, app: tauri::AppHandle, _state: tauri::State<'_, crate::session::SessionManager>) -> Result<AiGenerateResult, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn ai_test_config(config: AiConfig, test_message: String) -> Result<String, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn discord_send_text(account_id: String, channel_id: String, content: String, reply_to: Option<String>, app: tauri::AppHandle) -> Result<String, String> { Err("Disabled".to_string()) }

#[tauri::command]
pub async fn discord_trigger_typing(account_id: String, channel_id: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_add_reaction(account_id: String, channel_id: String, message_id: String, emoji: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_remove_reaction(account_id: String, channel_id: String, message_id: String, emoji: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }
`
  }
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function disableAI() {
  console.log("Desativando IA...");
  for (const target of TARGETS) {
    const srcPath = path.join(ROOT, target.src);
    const backupPath = path.join(LOCAL_AI_DIR, target.backup);
    ensureDir(path.dirname(backupPath));

    if (fs.existsSync(srcPath)) {
      if (target.type === 'dir') {
        // Backup the directory
        if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
        fs.cpSync(srcPath, backupPath, { recursive: true });
        // Empty the src directory
        fs.rmSync(srcPath, { recursive: true, force: true });
        fs.mkdirSync(srcPath, { recursive: true });
        // Inject dummies
        for (const [file, content] of Object.entries(target.dummyFiles)) {
          fs.writeFileSync(path.join(srcPath, file), content);
        }
      } else {
        // Backup the file
        fs.copyFileSync(srcPath, backupPath);
        // Inject dummy
        fs.writeFileSync(srcPath, target.dummyContent);
      }
    }
  }
  console.log("IA desativada! (Dummies injetados)");
}

function enableAI() {
  console.log("Ativando IA...");
  for (const target of TARGETS) {
    const srcPath = path.join(ROOT, target.src);
    const backupPath = path.join(LOCAL_AI_DIR, target.backup);

    if (fs.existsSync(backupPath)) {
      if (target.type === 'dir') {
        // Restore directory
        fs.rmSync(srcPath, { recursive: true, force: true });
        fs.cpSync(backupPath, srcPath, { recursive: true });
      } else {
        // Restore file
        fs.copyFileSync(backupPath, srcPath);
      }
    }
  }
  console.log("IA ativada! (Arquivos originais restaurados)");
}

const arg = process.argv[2];
if (arg === 'enable') enableAI();
else if (arg === 'disable') disableAI();
else console.log("Uso: node ai-manager.js [enable|disable]");
