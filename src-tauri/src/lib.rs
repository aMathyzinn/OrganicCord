mod commands;
mod gateway;
mod http_client;
mod rate_limit;
mod session;
mod storage;

use std::fs::OpenOptions;
use std::path::PathBuf;
use tauri::Manager;

const DIAGNOSTIC_LOG_FILE: &str = "organiccord.log";

fn initialize_logging() -> Option<PathBuf> {
    let log_directory = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("OrganicCord")
        .join("logs");
    if let Err(error) = std::fs::create_dir_all(&log_directory) {
        eprintln!("OrganicCord não conseguiu criar a pasta de diagnóstico: {error}");
        let mut builder = organiccord_log_builder();
        let _ = builder.try_init();
        return None;
    }

    let log_path = log_directory.join(DIAGNOSTIC_LOG_FILE);
    let file = match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
    {
        Ok(file) => file,
        Err(error) => {
            eprintln!("OrganicCord não conseguiu abrir o diagnóstico local: {error}");
            let mut builder = organiccord_log_builder();
            let _ = builder.try_init();
            return None;
        }
    };

    let mut builder = organiccord_log_builder();
    builder.target(env_logger::Target::Pipe(Box::new(file)));
    if let Err(error) = builder.try_init() {
        eprintln!("OrganicCord não conseguiu inicializar o diagnóstico local: {error}");
        return None;
    }
    Some(log_path)
}

fn organiccord_log_builder() -> env_logger::Builder {
    let mut builder = env_logger::Builder::new();
    builder
        .filter_level(log::LevelFilter::Warn)
        .filter_module("organic_cord", log::LevelFilter::Info)
        .filter_module("organic_cord_lib", log::LevelFilter::Info);
    builder
}

#[cfg(target_os = "windows")]
fn register_app_user_model_id() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    unsafe {
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
        }
        let app_id: Vec<u16> = OsStr::new("com.organiccord.desktop")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let _ = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

#[cfg(target_os = "windows")]
fn configure_main_webview_permissions(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
            COREWEBVIEW2_PERMISSION_STATE_DENY,
        },
        PermissionRequestedEventHandler,
    };

    // WebView2's default permission sheet brands this native app as a browser. The
    // main window only hosts first-party UI, so allow its two required media APIs
    // and reject every other WebView permission before WebView2 can render a prompt.
    window.with_webview(|webview| unsafe {
        let result = webview.controller().CoreWebView2().and_then(|core| {
            let mut token = 0;
            core.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                    args.PermissionKind(&mut kind)?;
                    let state = if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                        || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                    {
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW
                    } else {
                        COREWEBVIEW2_PERMISSION_STATE_DENY
                    };
                    args.SetState(state)?;
                    Ok(())
                })),
                &mut token,
            )
        });
        if let Err(error) = result {
            log::error!("[webview] Não foi possível configurar as permissões nativas: {error}");
        }
    })
}

pub fn run() {
    let diagnostic_log = initialize_logging();
    log::info!(
        "[app] state=starting version={} diagnostic_log={}",
        env!("CARGO_PKG_VERSION"),
        diagnostic_log
            .as_deref()
            .map_or_else(|| "stderr".into(), |path| path.display().to_string())
    );

    #[cfg(target_os = "windows")]
    register_app_user_model_id();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(session::SessionManager::new())
        .manage(gateway::GatewayManager::new())
        .manage(commands::games::GameDetectionManager::new())
        .manage(commands::discord_rpc::DiscordRpcManager::new())
        .manage(commands::qr_login::new_qr_handle())
        .manage(commands::attachments::AttachmentRegistry::new())
        .manage(commands::voice::VoiceManager::new())
        .manage(commands::stream::StreamManager::new())
        .manage(rate_limit::RateLimiter::new())
        .invoke_handler(tauri::generate_handler![
            commands::account::add_account,
            commands::account::remove_account,
            commands::account::list_accounts,
            commands::account::validate_token,
            commands::account::get_account_info,
            commands::session::connect_account,
            commands::session::disconnect_account,
            commands::session::get_session_status,
            commands::discord::get_guilds,
            commands::discord::get_channels,
            commands::discord::get_current_guild_member,
            commands::discord::get_forum_threads,
            commands::discord::create_forum_post,
            commands::discord::search_messages,
            commands::discord::get_messages,
            commands::discord::send_message,
            commands::discord::edit_message,
            commands::discord::delete_message,
            commands::discord::send_interaction,
            commands::discord::send_message_with_attachment,
            commands::attachments::select_attachment,
            commands::attachments::select_profile_image,
            commands::discord::send_voice_message,
            commands::discord::get_dms,
            commands::discord::create_dm,
            commands::discord::start_dm_call,
            commands::discord::stop_dm_call,
            commands::discord::get_relationships,
            commands::discord::remove_relationship,
            commands::discord::block_user,
            commands::discord::set_user_note,
            commands::discord::create_channel_invite,
            commands::discord::fetch_user_profile,
            commands::discord::update_user_profile,
            commands::discord::get_user_info,
            commands::discord::get_self_profile,
            commands::discord::get_recent_mentions,
            commands::discord::get_auth_sessions,
            commands::discord::revoke_auth_session,
            commands::discord::get_gateway_presences,
            commands::discord::set_status,
            commands::discord::discord_subscribe_guild,
            commands::discord::set_custom_status,
            commands::discord::trigger_typing,
            commands::discord::clear_custom_status,
            commands::discord::close_dm,
            commands::discord::get_pinned_messages,
            commands::discord::pin_message,
            commands::discord::unpin_message,
            commands::window::minimize_window,
            commands::window::maximize_window,
            commands::window::close_window,
            commands::window::focus_window,
            commands::qr_login::start_qr_login,
            commands::qr_login::cancel_qr_login,
            commands::discord::discord_add_reaction,
            commands::discord::discord_remove_reaction,
            commands::presence::gateway_connect,
            commands::presence::gateway_set_status,
            commands::presence::gateway_set_custom_activity,
            commands::presence::gateway_disconnect,
            commands::presence::gateway_get_status,
            commands::presence::gateway_set_game_activity,
            commands::games::game_detection_get_settings,
            commands::games::game_detection_set_enabled,
            commands::games::game_detection_update_game,
            commands::games::game_detection_remove_game,
            commands::games::game_detection_scan,
            commands::discord_rpc::discord_rpc_get_settings,
            commands::discord_rpc::discord_rpc_update_settings,
            commands::discord_rpc::discord_rpc_publish_game,
            commands::discord_rpc::discord_rpc_clear_game,
            commands::discord_rpc::discord_rpc_test,
            commands::auth_webview::start_discord_login,
            commands::auth_webview::discord_login_success,
            commands::auth_webview::cancel_discord_login,
            commands::voice::gateway_join_voice,
            commands::voice::prepare_voice_connection,
            commands::voice::set_voice_controls,
            commands::voice::set_voice_output_device,
            commands::voice::stop_voice_connection,
            commands::stream::start_screen_share,
            commands::stream::stop_screen_share,
            commands::audio::get_audio_devices,
            commands::unread::mark_channel_as_read,
            commands::unread::get_unread_state,
        ])
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
            };

            let window = app.get_webview_window("main").ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "a janela principal não foi criada",
                )
            })?;
            window.set_decorations(false)?;
            #[cfg(target_os = "windows")]
            configure_main_webview_permissions(&window)?;

            let open_i = MenuItem::with_id(app, "open", "Abrir", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
                // Fallback Se não houver ícone default, mas Tauri deve ter se configurado no tauri.conf.json
                tauri::image::Image::new(&[], 0, 0)
            });

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("OrganicCord encerrou com erro: {error}");
    }
}
