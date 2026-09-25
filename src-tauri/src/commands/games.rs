use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::State;
use tauri_plugin_store::StoreBuilder;
use uuid::Uuid;

const STORE_FILE: &str = "registered_games.json";
const DETECTION_DEBOUNCE_MS: i64 = 3_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredGame {
    pub id: String,
    pub executable: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDetectionSettings {
    pub enabled: bool,
    pub games: Vec<RegisteredGame>,
}

impl Default for GameDetectionSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            games: vec![
                registered("valorant", "VALORANT-Win64-Shipping.exe", "VALORANT"),
                registered("league-of-legends", "LeagueClient.exe", "League of Legends"),
                registered("minecraft-bedrock", "Minecraft.Windows.exe", "Minecraft"),
                registered("fortnite", "FortniteClient-Win64-Shipping.exe", "Fortnite"),
                registered("cs2", "cs2.exe", "Counter-Strike 2"),
                registered("dota-2", "dota2.exe", "Dota 2"),
                registered("overwatch", "Overwatch.exe", "Overwatch"),
                registered("roblox", "RobloxPlayerBeta.exe", "Roblox"),
                registered("gta-v", "GTA5.exe", "Grand Theft Auto V"),
            ],
        }
    }
}

fn registered(id: &str, executable: &str, name: &str) -> RegisteredGame {
    RegisteredGame {
        id: id.to_string(),
        executable: executable.to_string(),
        name: name.to_string(),
        enabled: true,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub process_id: String,
    pub started_at: i64,
}

#[derive(Debug, Clone)]
struct ObservedGame {
    game: DetectedGame,
    first_seen_at: i64,
    last_seen_at: i64,
}

pub struct GameDetectionManager {
    settings: Arc<Mutex<Option<GameDetectionSettings>>>,
    observed: Arc<Mutex<HashMap<String, ObservedGame>>>,
}

impl GameDetectionManager {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(None)),
            observed: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn settings(&self, app: &tauri::AppHandle) -> Result<GameDetectionSettings, String> {
        let mut cached = self
            .settings
            .lock()
            .map_err(|_| "Game settings lock poisoned")?;
        if let Some(settings) = cached.as_ref() {
            return Ok(settings.clone());
        }

        let store = StoreBuilder::new(app, STORE_FILE)
            .build()
            .map_err(|error| format!("Não foi possível abrir os jogos registrados: {error}"))?;
        let settings: GameDetectionSettings = store
            .get("settings")
            .map(|value| serde_json::from_value(value.clone()))
            .transpose()
            .map_err(|error| format!("Não foi possível ler os jogos registrados: {error}"))?
            .unwrap_or_default();
        *cached = Some(settings.clone());
        Ok(settings)
    }

    fn save_settings(
        &self,
        app: &tauri::AppHandle,
        settings: GameDetectionSettings,
    ) -> Result<(), String> {
        let store = StoreBuilder::new(app, STORE_FILE)
            .build()
            .map_err(|error| format!("Não foi possível abrir os jogos registrados: {error}"))?;
        let value = serde_json::to_value(&settings)
            .map_err(|error| format!("Não foi possível salvar os jogos registrados: {error}"))?;
        store.set("settings", value);
        store
            .save()
            .map_err(|error| format!("Não foi possível salvar os jogos registrados: {error}"))?;
        *self
            .settings
            .lock()
            .map_err(|_| "Game settings lock poisoned")? = Some(settings);
        Ok(())
    }

    pub fn get_settings(&self, app: &tauri::AppHandle) -> Result<GameDetectionSettings, String> {
        self.settings(app)
    }

    pub fn set_enabled(
        &self,
        app: &tauri::AppHandle,
        enabled: bool,
    ) -> Result<GameDetectionSettings, String> {
        let mut settings = self.settings(app)?;
        settings.enabled = enabled;
        self.save_settings(app, settings.clone())?;
        if !enabled {
            self.observed
                .lock()
                .map_err(|_| "Game detector lock poisoned")?
                .clear();
        }
        Ok(settings)
    }

    pub fn update_game(
        &self,
        app: &tauri::AppHandle,
        game: RegisteredGame,
    ) -> Result<GameDetectionSettings, String> {
        let executable = normalize_registered_executable(&game.executable)
            .ok_or("Informe o nome do executável, por exemplo: game.exe")?;
        let name = game.name.trim();
        if name.is_empty() {
            return Err("Informe o nome que será exibido para o jogo.".to_string());
        }

        let mut settings = self.settings(app)?;
        let replacement = RegisteredGame {
            id: if game.id.trim().is_empty() {
                Uuid::new_v4().to_string()
            } else {
                game.id
            },
            executable,
            name: name.to_string(),
            enabled: game.enabled,
        };
        if settings.games.iter().any(|item| {
            item.id != replacement.id
                && normalize_process_name(&item.executable).as_deref()
                    == normalize_process_name(&replacement.executable).as_deref()
        }) {
            return Err("Este executável já está registrado.".to_string());
        }
        if let Some(existing) = settings
            .games
            .iter_mut()
            .find(|item| item.id == replacement.id)
        {
            *existing = replacement;
        } else {
            settings.games.push(replacement);
        }
        self.save_settings(app, settings.clone())?;
        Ok(settings)
    }

    pub fn remove_game(
        &self,
        app: &tauri::AppHandle,
        game_id: &str,
    ) -> Result<GameDetectionSettings, String> {
        let mut settings = self.settings(app)?;
        settings.games.retain(|game| game.id != game_id);
        self.save_settings(app, settings.clone())?;
        Ok(settings)
    }

    pub fn scan(&self, app: &tauri::AppHandle) -> Result<Option<DetectedGame>, String> {
        let settings = self.settings(app)?;
        if !settings.enabled {
            self.observed
                .lock()
                .map_err(|_| "Game detector lock poisoned")?
                .clear();
            return Ok(None);
        }

        let now = Utc::now().timestamp_millis();
        let enabled_games: HashMap<String, &RegisteredGame> = settings
            .games
            .iter()
            .filter(|game| game.enabled)
            .filter_map(|game| normalize_process_name(&game.executable).map(|key| (key, game)))
            .collect();
        let mut system = System::new_all();
        system.refresh_processes();

        let mut seen = HashSet::new();
        let mut observed = self
            .observed
            .lock()
            .map_err(|_| "Game detector lock poisoned")?;
        for (pid, process) in system.processes() {
            let executable = process
                .exe()
                .and_then(|path| path.file_name())
                .and_then(|name| name.to_str())
                .map(str::to_string)
                .unwrap_or_else(|| process.name().to_string());
            let Some(key) = normalize_process_name(&executable) else {
                continue;
            };
            let Some(registered) = enabled_games.get(&key) else {
                continue;
            };

            let observation_key = format!("{}:{}", registered.id, pid);
            seen.insert(observation_key.clone());
            let entry = observed
                .entry(observation_key)
                .or_insert_with(|| ObservedGame {
                    game: DetectedGame {
                        id: registered.id.clone(),
                        name: registered.name.clone(),
                        executable: registered.executable.clone(),
                        process_id: pid.to_string(),
                        started_at: now,
                    },
                    first_seen_at: now,
                    last_seen_at: now,
                });
            entry.last_seen_at = now;
        }

        observed.retain(|key, entry| {
            seen.contains(key)
                && now.saturating_sub(entry.last_seen_at) <= DETECTION_DEBOUNCE_MS * 2
        });
        let detected = observed
            .values()
            .filter(|entry| now.saturating_sub(entry.first_seen_at) >= DETECTION_DEBOUNCE_MS)
            .max_by_key(|entry| entry.first_seen_at)
            .map(|entry| entry.game.clone());
        Ok(detected)
    }
}

fn normalize_registered_executable(value: &str) -> Option<String> {
    let filename = executable_filename(value)?;
    if !filename.to_ascii_lowercase().ends_with(".exe") {
        return None;
    }
    Some(filename.to_string())
}

/// Windows can hide the executable path of protected games. In that case sysinfo
/// provides a process name without `.exe`, so comparison deliberately uses a stem.
fn normalize_process_name(value: &str) -> Option<String> {
    let filename = executable_filename(value)?;
    let normalized = filename.to_ascii_lowercase();
    let stem = normalized.strip_suffix(".exe").unwrap_or(&normalized);
    if stem.is_empty() {
        return None;
    }
    Some(stem.to_string())
}

fn executable_filename(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    let filename = std::path::Path::new(trimmed)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(trimmed)
        .trim();
    if filename.is_empty() || filename.len() > 260 {
        return None;
    }
    Some(filename)
}

#[tauri::command]
pub fn game_detection_get_settings(
    manager: State<'_, GameDetectionManager>,
    app: tauri::AppHandle,
) -> Result<GameDetectionSettings, String> {
    manager.get_settings(&app)
}

#[tauri::command]
pub fn game_detection_set_enabled(
    enabled: bool,
    manager: State<'_, GameDetectionManager>,
    app: tauri::AppHandle,
) -> Result<GameDetectionSettings, String> {
    manager.set_enabled(&app, enabled)
}

#[tauri::command]
pub fn game_detection_update_game(
    game: RegisteredGame,
    manager: State<'_, GameDetectionManager>,
    app: tauri::AppHandle,
) -> Result<GameDetectionSettings, String> {
    manager.update_game(&app, game)
}

#[tauri::command]
pub fn game_detection_remove_game(
    game_id: String,
    manager: State<'_, GameDetectionManager>,
    app: tauri::AppHandle,
) -> Result<GameDetectionSettings, String> {
    manager.remove_game(&app, &game_id)
}

#[tauri::command]
pub fn game_detection_scan(
    manager: State<'_, GameDetectionManager>,
    app: tauri::AppHandle,
) -> Result<Option<DetectedGame>, String> {
    manager.scan(&app)
}

#[cfg(test)]
mod tests {
    use super::{normalize_process_name, normalize_registered_executable};

    #[test]
    fn normalizes_only_executable_filenames() {
        assert_eq!(
            normalize_registered_executable(" C:\\Riot Games\\VALORANT-Win64-Shipping.exe "),
            Some("VALORANT-Win64-Shipping.exe".to_string())
        );
        assert_eq!(
            normalize_process_name("VALORANT-Win64-Shipping"),
            Some("valorant-win64-shipping".to_string())
        );
        assert_eq!(
            normalize_process_name("VALORANT-Win64-Shipping.exe"),
            Some("valorant-win64-shipping".to_string())
        );
        assert_eq!(normalize_registered_executable("not-a-program"), None);
    }
}
