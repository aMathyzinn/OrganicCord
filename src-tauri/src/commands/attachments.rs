use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use uuid::Uuid;

pub const MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;
const ATTACHMENT_HANDLE_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone)]
pub struct PendingAttachment {
    pub path: PathBuf,
    pub name: String,
    created_at: Instant,
}

#[derive(Default)]
pub struct AttachmentRegistry {
    entries: Mutex<HashMap<String, PendingAttachment>>,
}

impl AttachmentRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    fn register(&self, path: PathBuf, name: String) -> Result<String, String> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| "O registro de anexos ficou indisponível.".to_string())?;
        entries.retain(|_, entry| entry.created_at.elapsed() < ATTACHMENT_HANDLE_TTL);

        let handle = Uuid::new_v4().to_string();
        entries.insert(
            handle.clone(),
            PendingAttachment {
                path,
                name,
                created_at: Instant::now(),
            },
        );
        Ok(handle)
    }

    pub fn take(&self, handle: &str) -> Result<PendingAttachment, String> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| "O registro de anexos ficou indisponível.".to_string())?;
        let entry = entries
            .remove(handle)
            .ok_or_else(|| "O anexo expirou. Selecione o arquivo novamente.".to_string())?;

        if entry.created_at.elapsed() >= ATTACHMENT_HANDLE_TTL {
            return Err("O anexo expirou. Selecione o arquivo novamente.".to_string());
        }
        Ok(entry)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedAttachment {
    pub handle: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedProfileImage {
    pub data_url: String,
}

const MAX_PROFILE_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

#[tauri::command]
pub async fn select_profile_image(app: AppHandle) -> Result<Option<SelectedProfileImage>, String> {
    let (sender, receiver) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Escolher imagem de perfil")
        .add_filter("Imagens", &["png", "jpg", "jpeg", "gif", "webp"])
        .pick_file(move |selection| {
            let _ = sender.send(selection);
        });

    let Some(selection) = receiver
        .await
        .map_err(|_| "O seletor de imagem foi interrompido.".to_string())?
    else {
        return Ok(None);
    };

    let path = selection
        .into_path()
        .map_err(|_| "A imagem selecionada não possui um caminho local válido.".to_string())?;
    let path = tokio::fs::canonicalize(path)
        .await
        .map_err(|_| "Não foi possível acessar a imagem selecionada.".to_string())?;
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|_| "Não foi possível ler a imagem selecionada.".to_string())?;

    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_PROFILE_IMAGE_BYTES {
        return Err("Escolha uma imagem entre 1 byte e 8 MB.".to_string());
    }

    let mime_type = match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => return Err("Use uma imagem PNG, JPG, GIF ou WebP.".to_string()),
    };
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|_| "Não foi possível carregar a imagem selecionada.".to_string())?;

    Ok(Some(SelectedProfileImage {
        data_url: format!("data:{mime_type};base64,{}", BASE64.encode(bytes)),
    }))
}

#[tauri::command]
pub async fn select_attachment(
    app: AppHandle,
    registry: State<'_, AttachmentRegistry>,
) -> Result<Option<SelectedAttachment>, String> {
    let (sender, receiver) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Selecionar anexo")
        .pick_file(move |selection| {
            let _ = sender.send(selection);
        });

    let Some(selection) = receiver
        .await
        .map_err(|_| "O seletor de arquivos foi interrompido.".to_string())?
    else {
        return Ok(None);
    };

    let path = selection
        .into_path()
        .map_err(|_| "O arquivo selecionado não possui um caminho local válido.".to_string())?;
    let path = tokio::fs::canonicalize(path)
        .await
        .map_err(|_| "Não foi possível acessar o arquivo selecionado.".to_string())?;
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|_| "Não foi possível ler o arquivo selecionado.".to_string())?;

    if !metadata.is_file() {
        return Err("Selecione um arquivo válido.".to_string());
    }
    if metadata.len() == 0 {
        return Err("Não é possível enviar um arquivo vazio.".to_string());
    }
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err("O arquivo excede o limite de 25 MB do OrganicCord.".to_string());
    }

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "O nome do arquivo selecionado é inválido.".to_string())?
        .to_string();
    let handle = registry.register(path, name.clone())?;

    Ok(Some(SelectedAttachment {
        handle,
        name,
        size: metadata.len(),
    }))
}
