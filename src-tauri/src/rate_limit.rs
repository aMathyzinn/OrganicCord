/// Rate limiting module for Discord API compliance.
///
/// Discord's rate limits (official documented limits):
///   - Global: 50 requests/second across all routes
///   - Messages POST: 5/5s per channel
///   - DELETE messages: 5/1s per channel (recent), 1/1s (old >2 weeks)
///   - Typing: 1/5s per channel (no need to spam)
///   - Reactions: 1/0.25s per message
///   - DMs: 2/1s for message creates
///
/// This module implements:
///   1. Per-route/bucket sliding window counters
///   2. Automatic `Retry-After` header parsing on 429 responses
///   3. Pre-emptive back-off before hitting limits
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// A per-bucket rate limit state.
#[derive(Debug)]
struct BucketState {
    /// Maximum requests allowed in the window
    limit: u32,
    /// Remaining requests in current window
    remaining: u32,
    /// When the current window resets (Instant)
    reset_at: Instant,
    /// If we received a 429, sleep until this instant before retrying
    retry_after: Option<Instant>,
}

impl BucketState {
    fn new(limit: u32, window_secs: u64) -> Self {
        Self {
            limit,
            remaining: limit,
            reset_at: Instant::now() + Duration::from_secs(window_secs),
            retry_after: None,
        }
    }

    /// Advance window if expired, then check if we can proceed.
    fn can_proceed(&mut self, window_secs: u64) -> bool {
        let now = Instant::now();

        // If there's a retry_after lock, wait
        if let Some(until) = self.retry_after {
            if now < until {
                return false;
            }
            self.retry_after = None;
        }

        // Reset window if expired
        if now >= self.reset_at {
            self.remaining = self.limit;
            self.reset_at = now + Duration::from_secs(window_secs);
        }

        if self.remaining > 0 {
            self.remaining -= 1;
            true
        } else {
            false
        }
    }

    /// Wait duration before next request is allowed.
    fn wait_duration(&self) -> Duration {
        let now = Instant::now();
        if let Some(until) = self.retry_after {
            if until > now {
                return until - now;
            }
        }
        if self.reset_at > now {
            self.reset_at - now
        } else {
            Duration::ZERO
        }
    }

    /// Record a 429 response with optional Retry-After seconds.
    fn record_429(&mut self, retry_after_secs: f64) {
        let wait = Duration::from_millis((retry_after_secs * 1000.0) as u64 + 100);
        self.retry_after = Some(Instant::now() + wait);
        self.remaining = 0;
    }

    /// Update from Discord response headers.
    fn update_from_headers(&mut self, headers: &reqwest::header::HeaderMap) {
        if let Some(remaining) = headers
            .get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u32>().ok())
        {
            self.remaining = remaining;
        }
        if let Some(reset_after) = headers
            .get("x-ratelimit-reset-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<f64>().ok())
        {
            self.reset_at = Instant::now() + Duration::from_millis((reset_after * 1000.0) as u64);
        }
    }
}

/// Categorizes a URL into a rate limit bucket key.
/// For Discord, the "bucket" is typically per-channel or per-guild per route.
fn bucket_key(route: &str, resource_id: &str) -> String {
    format!("{}:{}", route, resource_id)
}

/// Global rate limiter — singleton managed by Tauri state.
pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, BucketState>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Wait until we can make a request for this bucket.
    /// `limit` = max requests, `window_secs` = window size in seconds.
    pub async fn acquire(&self, bucket: &str, limit: u32, window_secs: u64) {
        loop {
            let wait = {
                let mut buckets = self.buckets.lock().await;
                let state = buckets
                    .entry(bucket.to_string())
                    .or_insert_with(|| BucketState::new(limit, window_secs));

                if state.can_proceed(window_secs) {
                    break;
                }
                state.wait_duration()
            };

            if wait > Duration::ZERO {
                log::debug!("[rate_limit] Bucket {} — waiting {}ms", bucket, wait.as_millis());
                tokio::time::sleep(wait).await;
            }
        }
    }

    /// Record a 429 response for a bucket with optional Retry-After header.
    pub async fn record_429(&self, bucket: &str, headers: &reqwest::header::HeaderMap) {
        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(1.0);

        log::warn!("[rate_limit] 429 on bucket {} — retry_after={:.2}s", bucket, retry_after);

        let mut buckets = self.buckets.lock().await;
        let state = buckets
            .entry(bucket.to_string())
            .or_insert_with(|| BucketState::new(5, 5));
        state.record_429(retry_after);
    }

    /// Update bucket state from successful response headers.
    pub async fn update_from_response(
        &self,
        bucket: &str,
        headers: &reqwest::header::HeaderMap,
    ) {
        let mut buckets = self.buckets.lock().await;
        if let Some(state) = buckets.get_mut(bucket) {
            state.update_from_headers(headers);
        }
    }
}

/// Rate-limit aware GET with full 429 handling including Retry-After.
pub async fn rate_limited_get<T>(
    client: &reqwest::Client,
    rl: &RateLimiter,
    url: &str,
    bucket: &str,
    limit: u32,
    window_secs: u64,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    const MAX_ATTEMPTS: u32 = 4;

    for attempt in 0..MAX_ATTEMPTS {
        // Pre-emptive rate limit wait
        rl.acquire(bucket, limit, window_secs).await;

        let resp = client
            .get(url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let headers = resp.headers().clone();

        if status == 429 {
            rl.record_429(bucket, &headers).await;
            if attempt + 1 < MAX_ATTEMPTS {
                continue;
            }
            return Err(format!("Rate limited on {} after {} attempts", url, MAX_ATTEMPTS));
        }

        rl.update_from_response(bucket, &headers).await;

        let body = resp.text().await.unwrap_or_default();
        if status.is_success() {
            return serde_json::from_str::<T>(&body)
                .map_err(|e| format!("Parse error: {} | body: {}", e, &body[..body.len().min(300)]));
        }

        // Non-retryable error
        return Err(format!(
            "Discord API error {} {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            &body[..body.len().min(300)]
        ));
    }

    Err(format!("Max attempts reached for {}", url))
}

/// Rate-limit aware POST JSON with full 429 handling.
pub async fn rate_limited_post<T>(
    client: &reqwest::Client,
    rl: &RateLimiter,
    url: &str,
    body: &serde_json::Value,
    bucket: &str,
    limit: u32,
    window_secs: u64,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    const MAX_ATTEMPTS: u32 = 4;

    for attempt in 0..MAX_ATTEMPTS {
        rl.acquire(bucket, limit, window_secs).await;

        let resp = client
            .post(url)
            .json(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let headers = resp.headers().clone();

        if status == 429 {
            rl.record_429(bucket, &headers).await;
            if attempt + 1 < MAX_ATTEMPTS {
                continue;
            }
            return Err(format!("Rate limited on {} after {} attempts", url, MAX_ATTEMPTS));
        }

        rl.update_from_response(bucket, &headers).await;

        let body_text = resp.text().await.unwrap_or_default();
        if status.is_success() {
            return serde_json::from_str::<T>(&body_text).map_err(|e| {
                format!("Parse error: {} | body: {}", e, &body_text[..body_text.len().min(300)])
            });
        }

        return Err(format!(
            "Discord API error {} {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            &body_text[..body_text.len().min(300)]
        ));
    }

    Err(format!("Max attempts reached for {}", url))
}

/// Rate-limit aware DELETE with full 429 handling.
pub async fn rate_limited_delete(
    client: &reqwest::Client,
    rl: &RateLimiter,
    url: &str,
    bucket: &str,
    limit: u32,
    window_secs: u64,
) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 4;

    for attempt in 0..MAX_ATTEMPTS {
        rl.acquire(bucket, limit, window_secs).await;

        let resp = client
            .delete(url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let headers = resp.headers().clone();

        if status == 429 {
            rl.record_429(bucket, &headers).await;
            if attempt + 1 < MAX_ATTEMPTS {
                continue;
            }
            return Err(format!("Rate limited on {} after {} attempts", url, MAX_ATTEMPTS));
        }

        rl.update_from_response(bucket, &headers).await;

        if status.is_success() || status.as_u16() == 204 {
            return Ok(());
        }

        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Discord API error {} {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            &body_text[..body_text.len().min(300)]
        ));
    }

    Err(format!("Max attempts reached for {}", url))
}

/// Rate-limit aware PATCH with full 429 handling.
pub async fn rate_limited_patch<T>(
    client: &reqwest::Client,
    rl: &RateLimiter,
    url: &str,
    body: &serde_json::Value,
    bucket: &str,
    limit: u32,
    window_secs: u64,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    const MAX_ATTEMPTS: u32 = 4;

    for attempt in 0..MAX_ATTEMPTS {
        rl.acquire(bucket, limit, window_secs).await;

        let resp = client
            .patch(url)
            .json(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let headers = resp.headers().clone();

        if status == 429 {
            rl.record_429(bucket, &headers).await;
            if attempt + 1 < MAX_ATTEMPTS {
                continue;
            }
            return Err(format!("Rate limited on {} after {} attempts", url, MAX_ATTEMPTS));
        }

        rl.update_from_response(bucket, &headers).await;

        let body_text = resp.text().await.unwrap_or_default();
        if status.is_success() {
            return serde_json::from_str::<T>(&body_text).map_err(|e| {
                format!("Parse error: {} | body: {}", e, &body_text[..body_text.len().min(300)])
            });
        }

        return Err(format!(
            "Discord API error {} {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            &body_text[..body_text.len().min(300)]
        ));
    }

    Err(format!("Max attempts reached for {}", url))
}

/// Rate-limit aware PUT with full 429 handling, returns raw success bool.
pub async fn rate_limited_put_empty(
    client: &reqwest::Client,
    rl: &RateLimiter,
    url: &str,
    body: Option<&serde_json::Value>,
    bucket: &str,
    limit: u32,
    window_secs: u64,
) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 4;

    for attempt in 0..MAX_ATTEMPTS {
        rl.acquire(bucket, limit, window_secs).await;

        let req = client.put(url);
        let req = if let Some(b) = body { req.json(b) } else { req };
        let resp = req.send().await.map_err(|e| e.to_string())?;

        let status = resp.status();
        let headers = resp.headers().clone();

        if status == 429 {
            rl.record_429(bucket, &headers).await;
            if attempt + 1 < MAX_ATTEMPTS {
                continue;
            }
            return Err(format!("Rate limited on {} after {} attempts", url, MAX_ATTEMPTS));
        }

        rl.update_from_response(bucket, &headers).await;

        if status.is_success() || status.as_u16() == 204 {
            return Ok(());
        }

        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Discord API error {} {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            &body_text[..body_text.len().min(300)]
        ));
    }

    Err(format!("Max attempts reached for {}", url))
}

/// Discord rate limit presets (documented + conservative estimates).
pub mod limits {
    /// Messages: 5 sends per 5 seconds per channel
    pub const MSG_SEND: (u32, u64) = (5, 5);
    /// Message edit: 5 edits per 5 seconds per channel
    pub const MSG_EDIT: (u32, u64) = (5, 5);
    /// Message delete: 5 deletes per second per channel (recent messages)
    pub const MSG_DELETE: (u32, u64) = (4, 2);
    /// Typing indicator: 1 per 8 seconds per channel (Discord shows for 10s, so 1 send is enough)
    pub const TYPING: (u32, u64) = (1, 8);
    /// Reactions: 4 per second per message (conservative)
    pub const REACTION: (u32, u64) = (4, 1);
    /// DM create: 5 per 5 seconds
    pub const DM_CREATE: (u32, u64) = (5, 5);
    /// Relationships (block/unblock/friend): 5 per 5 seconds
    pub const RELATIONSHIP: (u32, u64) = (5, 5);
    /// Profile fetch: 10 per 10 seconds
    pub const PROFILE_FETCH: (u32, u64) = (10, 10);
    /// General read (GET) endpoints: 10 per 5 seconds
    pub const GENERAL_GET: (u32, u64) = (10, 5);
    /// Forum post create: 5 per 30 seconds (forum channel)
    pub const FORUM_POST: (u32, u64) = (5, 30);
    /// Invite create: 3 per 10 seconds
    pub const INVITE_CREATE: (u32, u64) = (3, 10);
    /// Pin/unpin: 5 per 5 seconds
    pub const PIN: (u32, u64) = (5, 5);
}
