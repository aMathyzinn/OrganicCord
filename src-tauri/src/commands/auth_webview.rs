use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Emitter;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use zeroize::Zeroize;

use crate::commands::account::add_account_from_token;

static LOGIN_SUCCESS: AtomicBool = AtomicBool::new(false);
static IS_EXTRACTING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn start_discord_login(app: AppHandle) -> Result<(), String> {
    // Se já existir a janela (ou estiver fechando), fechar para recriar limpa
    if let Some(win) = app.get_webview_window("discord_login") {
        let _ = win.close();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    LOGIN_SUCCESS.store(false, Ordering::SeqCst);
    IS_EXTRACTING.store(false, Ordering::SeqCst);

    let login_url: tauri::Url = "https://discord.com/login"
        .parse()
        .map_err(|error| format!("URL de login inválida: {error}"))?;
    let url: WebviewUrl = tauri::WebviewUrl::External(login_url);

    let _window = WebviewWindowBuilder::new(&app, "discord_login", url)
        .title("Login do Discord")
        .inner_size(480.0, 720.0)
        .resizable(false)
        .incognito(true)
        .build()
        .map_err(|e| format!("Erro ao criar janela: {}", e))?;

    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(400)).await;

            // Se já concluiu ou já iniciou a extração, encerrar a checagem
            if LOGIN_SUCCESS.load(Ordering::SeqCst) || IS_EXTRACTING.load(Ordering::SeqCst) {
                break;
            }

            let win = match app_clone.get_webview_window("discord_login") {
                Some(w) => w,
                None => {
                    // Janela foi fechada pelo usuário ou pelo sistema
                    if !LOGIN_SUCCESS.load(Ordering::SeqCst) {
                        println!("[auth] Janela de login fechada sem concluir.");
                        let _ = app_clone.emit(
                            "discord-login-cancelled",
                            serde_json::json!({ "cancelled": true }),
                        );
                    }
                    break;
                }
            };

            let current_url = match win.url() {
                Ok(url) => url.to_string(),
                Err(_) => continue,
            };

            if current_url.contains("/channels/") || current_url.contains("/app") {
                if IS_EXTRACTING.swap(true, Ordering::SeqCst) {
                    break;
                }

                println!(
                    "[auth] Detectado redirect para {}. Extraindo token...",
                    current_url
                );

                let js = r#"
                    (function() {
                        try {
                            let token = null;
                            try {
                                const iframe = document.createElement('iframe');
                                document.body.appendChild(iframe);
                                token = iframe.contentWindow.localStorage.token || iframe.contentWindow.localStorage.getItem('token');
                                iframe.remove();
                            } catch (err) {}

                            if (!token) {
                                token = window.localStorage.getItem('token') || window.localStorage.token;
                            }

                            if (token) {
                                window.__TAURI_INTERNALS__.invoke("discord_login_success", { token: token.replace(/^"|"$/g, '') });
                            }
                        } catch (e) {
                            console.error("[auth script error]", e);
                        }
                    })();
                "#;

                let _ = win.eval(js);
                break; // Finaliza o loop para não reenviar script
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn discord_login_success(
    mut token: String,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    if window.label() != "discord_login" {
        token.zeroize();
        return Err("Origem de autenticação inválida.".to_string());
    }

    if LOGIN_SUCCESS.load(Ordering::SeqCst) {
        token.zeroize();
        return Ok(());
    }

    let result = add_account_from_token(&token, &app).await;
    token.zeroize();

    if let Some(win) = app.get_webview_window("discord_login") {
        let _ = win.close();
    }

    match result {
        Ok(account) => {
            LOGIN_SUCCESS.store(true, Ordering::SeqCst);
            let _ = app.emit(
                "discord-account-added",
                serde_json::json!({ "account": account }),
            );
            Ok(())
        }
        Err(error) => {
            IS_EXTRACTING.store(false, Ordering::SeqCst);
            let _ = app.emit(
                "discord-login-error",
                serde_json::json!({ "message": &error }),
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn cancel_discord_login(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("discord_login") {
        let _ = win.close();
    }
    let _ = app.emit(
        "discord-login-cancelled",
        serde_json::json!({ "cancelled": true }),
    );
    Ok(())
}
