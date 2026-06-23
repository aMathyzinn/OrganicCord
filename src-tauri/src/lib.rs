mod commands;
mod session;
mod storage;
mod http_client;
mod gateway;

use tauri::Manager;

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(session::SessionManager::new())
        .manage(gateway::GatewayManager::new())
        .manage(commands::qr_login::new_qr_handle())
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
            commands::discord::search_messages,
            commands::discord::get_messages,
            commands::discord::send_message,
            commands::discord::send_interaction,
            commands::discord::send_message_with_attachment,
            commands::discord::get_dms,
            commands::discord::create_dm,
            commands::discord::get_relationships,
            commands::discord::fetch_user_profile,
            commands::discord::get_user_info,
            commands::discord::get_self_profile,
            commands::discord::start_dm_call,
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
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_decorations(false)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OrganicCord");
}
