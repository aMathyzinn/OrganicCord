use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub fn load_unread_from_store(app: &tauri::AppHandle) -> Result<HashMap<String, HashMap<String, String>>, String> {
    let store = tauri_plugin_store::StoreBuilder::new(app, "unread.json")
        .build()
        .map_err(|e| format!("Erro ao abrir store unread: {}", e))?;

    match store.get("unread") {
        Some(val) => serde_json::from_value(val.clone())
            .map_err(|e| format!("Erro ao parsear unread: {}", e)),
        None => Ok(HashMap::new()),
    }
}

pub fn save_unread_to_store(
    app: &tauri::AppHandle,
    unread_map: &HashMap<String, HashMap<String, String>>,
) -> Result<(), String> {
    let store = tauri_plugin_store::StoreBuilder::new(app, "unread.json")
        .build()
        .map_err(|e| format!("Erro ao abrir store unread: {}", e))?;

    let val = serde_json::to_value(unread_map)
        .map_err(|e| format!("Erro ao serializar unread: {}", e))?;

    store.set("unread", val);
    store.save().map_err(|e| format!("Erro ao salvar store unread: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn mark_channel_as_read(
    app: tauri::AppHandle,
    account_id: String,
    channel_id: String,
    message_id: String,
) -> Result<(), String> {
    let mut unread_map = load_unread_from_store(&app)?;
    
    let account_map = unread_map.entry(account_id).or_insert_with(HashMap::new);
    account_map.insert(channel_id, message_id);
    
    save_unread_to_store(&app, &unread_map)
}

#[tauri::command]
pub async fn get_unread_state(
    app: tauri::AppHandle,
    account_id: String,
) -> Result<HashMap<String, String>, String> {
    let unread_map = load_unread_from_store(&app)?;
    
    if let Some(account_map) = unread_map.get(&account_id) {
        Ok(account_map.clone())
    } else {
        Ok(HashMap::new())
    }
}
