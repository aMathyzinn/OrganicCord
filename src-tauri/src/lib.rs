mod commands;
mod session;
mod storage;
mod http_client;
mod gateway;
mod rate_limit;

use tauri::Manager;

#[cfg(target_os = "windows")]
fn register_app_user_model_id() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    unsafe {
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
        }
        let app_id: Vec<u16> = OsStr::new("com.organiccord.app")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let _ = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

pub fn run() {
    env_logger::init();

    #[cfg(target_os = "windows")]
    register_app_user_model_id();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(session::SessionManager::new())
        .manage(gateway::GatewayManager::new())
        .manage(commands::qr_login::new_qr_handle())
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
            commands::discord::get_forum_threads,
            commands::discord::create_forum_post,
            commands::discord::search_messages,
            commands::discord::get_messages,
            commands::discord::send_message,
            commands::discord::edit_message,
            commands::discord::delete_message,
            commands::discord::send_interaction,
            commands::discord::send_message_with_attachment,
            commands::discord::send_voice_message,
            commands::discord::get_dms,
            commands::discord::create_dm,
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
            commands::ai::ai_generate,
            commands::ai::ai_test_config,
            commands::ai::discord_send_text,
            commands::ai::discord_trigger_typing,
            commands::ai::discord_add_reaction,
            commands::ai::discord_remove_reaction,
            commands::presence::gateway_connect,
            commands::presence::gateway_set_status,
            commands::presence::gateway_set_custom_activity,
            commands::presence::gateway_disconnect,
            commands::presence::gateway_get_status,
            commands::auth_webview::start_discord_login,
            commands::auth_webview::discord_login_success,
            commands::voice::gateway_join_voice,
            commands::voice::start_voice_connection,
            commands::audio::get_audio_devices,
            commands::unread::mark_channel_as_read,
            commands::unread::get_unread_state,
        ])
        .setup(|app| {
            use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
            
            let window = app.get_webview_window("main").unwrap();
            window.set_decorations(false)?;
            
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
                    } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running OrganicCord");
}
