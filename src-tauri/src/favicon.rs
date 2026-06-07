use base64::prelude::*;
use image::imageops::FilterType;
use std::io::Cursor;
use std::time::Duration;

/// Fetch the favicon for the website at `url`, normalise it to a 32×32 PNG, and
/// return it base64-encoded. Mirrors KeeWeb's "download favicon" feature.
#[tauri::command]
pub async fn fetch_favicon(url: String) -> Result<String, String> {
    let raw = download_favicon_bytes(&url).await?;

    // Decode whatever the site served (ICO / PNG / JPEG / GIF / WebP),
    // resize to a consistent 32×32, and re-encode as PNG for storage.
    let img = image::load_from_memory(&raw)
        .map_err(|e| format!("Downloaded data is not a valid image: {e}"))?;
    let resized = img.resize(32, 32, FilterType::Lanczos3);

    let mut png: Vec<u8> = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(BASE64_STANDARD.encode(&png))
}

/// Reduce a user-entered URL to its scheme + host (+ port), e.g.
/// "https://example.com/login?x=1" → "https://example.com".
fn normalize_base(url: &str) -> Result<String, String> {
    let u = url.trim();
    if u.is_empty() {
        return Err("This entry has no URL to fetch a favicon from".to_string());
    }
    let with_scheme = if u.starts_with("http://") || u.starts_with("https://") {
        u.to_string()
    } else {
        format!("https://{u}")
    };
    let parsed = reqwest::Url::parse(&with_scheme).map_err(|e| format!("Invalid URL: {e}"))?;
    let scheme = parsed.scheme();
    let host = parsed.host_str().ok_or("URL has no host")?;
    let port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    Ok(format!("{scheme}://{host}{port}"))
}

async fn download_favicon_bytes(url: &str) -> Result<Vec<u8>, String> {
    let base = normalize_base(url)?;
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (KeeRust favicon fetcher)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Parse the homepage for a <link rel="icon"> declaration
    if let Ok(resp) = client.get(&base).send().await {
        if resp.status().is_success() {
            if let Ok(html) = resp.text().await {
                if let Some(icon_url) = find_icon_link(&html, &base) {
                    if let Some(bytes) = try_fetch_image(&client, &icon_url).await {
                        return Ok(bytes);
                    }
                }
            }
        }
    }

    // 2. Fall back to the conventional /favicon.ico location
    let fallback = format!("{base}/favicon.ico");
    if let Some(bytes) = try_fetch_image(&client, &fallback).await {
        return Ok(bytes);
    }

    Err("Could not find a favicon for this site".to_string())
}

async fn try_fetch_image(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    if bytes.is_empty() {
        return None;
    }
    Some(bytes.to_vec())
}

/// Scan HTML for the first `<link rel="...icon...">` and return its resolved href.
fn find_icon_link(html: &str, base: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<link") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|e| start + e).unwrap_or(lower.len());
        let tag = &html[start..end]; // original case (for href value)
        let tag_lower = &lower[start..end];
        from = end + 1;

        if tag_lower.contains("rel=") && tag_lower.contains("icon") {
            if let Some(href) = extract_attr(tag, "href") {
                if !href.is_empty() {
                    return Some(resolve_url(&href, base));
                }
            }
        }
    }
    None
}

/// Extract a quoted attribute value (e.g. href="...") from a single tag string.
fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let key = format!("{attr}=");
    let pos = lower.find(&key)? + key.len();
    let rest = &tag[pos..];
    let bytes = rest.as_bytes();
    let (quote, start) = match bytes.first() {
        Some(b'"') => ('"', 1),
        Some(b'\'') => ('\'', 1),
        _ => return None, // unquoted attribute values are not handled
    };
    let end = rest[start..].find(quote)? + start;
    Some(rest[start..end].to_string())
}

/// Resolve an href against the site base, handling absolute / protocol-relative /
/// root-relative / relative forms.
fn resolve_url(href: &str, base: &str) -> String {
    let h = href.trim();
    if h.starts_with("http://") || h.starts_with("https://") {
        h.to_string()
    } else if let Some(rest) = h.strip_prefix("//") {
        format!("https://{rest}")
    } else if h.starts_with('/') {
        format!("{base}{h}")
    } else {
        format!("{base}/{h}")
    }
}
