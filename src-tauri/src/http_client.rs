use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use std::time::Duration;

/// Returns a Discord-ready reqwest Client authenticated with the given token.
/// Includes the standard browser User-Agent and Content-Type headers.
/// Each call builds a new Client, but reqwest Client is cheaply cloneable and
/// they all share the underlying OS TCP connection pool.
pub fn discord_client(token: &str) -> Result<Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(token).map_err(|e| format!("invalid token header: {e}"))?,
    );
    
    // Stealth: Imitando um Client Web Oficial (Chrome 124 no Win 10)
    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    
    headers.insert(
        "User-Agent",
        HeaderValue::from_static(user_agent),
    );
    headers.insert(
        "sec-ch-ua",
        HeaderValue::from_static(r#""Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99""#),
    );
    headers.insert(
        "sec-ch-ua-mobile",
        HeaderValue::from_static("?0"),
    );
    headers.insert(
        "sec-ch-ua-platform",
        HeaderValue::from_static(r#""Windows""#),
    );

    // X-Super-Properties JSON base64 encoded
    // {"os":"Windows","browser":"Chrome","device":"","system_locale":"pt-BR","browser_user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36","browser_version":"124.0.0.0","os_version":"10","referrer":"","referring_domain":"","referrer_current":"","referring_domain_current":"","release_channel":"stable","client_build_number":287661,"client_event_source":null}
    let super_properties = "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6InB0LUJSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyNC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTI0LjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI4NzY2MSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=";
    
    headers.insert(
        "X-Super-Properties",
        HeaderValue::from_static(super_properties),
    );

    Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("failed to build discord client: {e}"))
}

/// Retry configuration for HTTP requests.
#[derive(Clone, Copy)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 500,
            max_delay_ms: 10_000,
        }
    }
}

/// Returns true if the HTTP status warrants a retry (transient errors only).
pub fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504)
}

/// Computes the next backoff delay in ms using exponential backoff with ±20% jitter.
/// `attempt` is 0-based.
pub fn backoff_ms(attempt: u32, config: &RetryConfig) -> u64 {
    let exp = config.base_delay_ms.saturating_mul(1u64 << attempt.min(10));
    let capped = exp.min(config.max_delay_ms);
    // ±20% jitter using rand::random (0.0..1.0)
    let jitter_ratio = (rand::random::<f64>() - 0.5) * 0.4; // -0.2 to +0.2
    let jitter_ms = (capped as f64 * jitter_ratio) as i64;
    ((capped as i64) + jitter_ms).max(100) as u64
}
