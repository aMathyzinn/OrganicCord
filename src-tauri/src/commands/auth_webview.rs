use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};
use tauri::Emitter;
use std::time::Duration;

#[tauri::command]
pub async fn start_discord_login(app: AppHandle) -> Result<(), String> {
    // Verificar se já existe a janela
    if app.get_webview_window("discord_login").is_some() {
        return Ok(());
    }

    let url: WebviewUrl = tauri::WebviewUrl::External("https://discord.com/login".parse().unwrap());
    
    let _window = WebviewWindowBuilder::new(&app, "discord_login", url)
        .title("Login do Discord")
        .inner_size(480.0, 720.0)
        .resizable(false)
        .incognito(true)
        .build()
        .map_err(|e| format!("Erro ao criar janela: {}", e))?;

    // O on_navigation no tauri v2 pode ser escutado via event ou builder
    // Para simplificar a extração, vamos rodar um loop simples checando a URL do webview
    // E injetando código quando a URL for channels/@me.
    
    let app_clone = app.clone();
    
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(500)).await;
            
            let win = match app_clone.get_webview_window("discord_login") {
                Some(w) => w,
                None => break, // Janela foi fechada
            };
            
            let current_url = match win.url() {
                Ok(url) => url.to_string(),
                Err(_) => continue,
            };

            if current_url.contains("/channels/") || current_url.contains("/app") {
                // Chegou na tela principal do Discord!
                println!("[auth] Detectado redirect para {}. Extraindo token...", current_url);
                
                let js = r#"
                    (function() {
                        try {
                            const iframe = document.createElement('iframe');
                            document.body.appendChild(iframe);
                            const token = iframe.contentWindow.localStorage.token;
                            iframe.remove();
                            if (token) {
                                window.__TAURI_INTERNALS__.invoke("discord_login_success", { token: token.replace(/^"|"$/g, '') });
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    })();
                "#;
                
                let _ = win.eval(js);
                
                // Vamos dar um tempinho pro JS rodar e fechar a janela. Mas não fechamos aqui para não matar o JS
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn discord_login_success(
    token: String,
    app: AppHandle,
) -> Result<(), String> {
    println!("[auth] Token extraído com sucesso!");
    
    // Fechar a janela de login
    if let Some(win) = app.get_webview_window("discord_login") {
        let _ = win.close();
    }
    
    // Adicionar a conta usando a mesma lógica do account.rs (que podemos chamar aqui)
    // Para agora vamos emitir um evento para o frontend passar o fluxo
    let _ = app.emit("discord-token-extracted", serde_json::json!({ "token": token }));
    
    Ok(())
}
