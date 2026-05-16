use reqwest::header::LOCATION;
use serde::{Deserialize, Serialize};
use std::{net::IpAddr, time::Duration};

const USER_AGENT: &str = "DebateOSSearchBot/0.1 (+https://debateos.local/bot)";
const MAX_BODY_BYTES: usize = 2_000_000; // 2 MB
const REQUEST_TIMEOUT_SECS: u64 = 15;
const MAX_REDIRECTS: usize = 5;

#[derive(Debug, Serialize, Deserialize)]
pub struct CrawlResponse {
    pub status: u16,
    pub body: String,
    pub final_url: String,
    pub content_type: String,
    pub truncated: bool,
}

fn is_restricted_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_broadcast()
                || ip.is_documentation()
                || {
                    // 100.64.0.0/10, carrier-grade NAT.
                    let octets = ip.octets();
                    octets[0] == 100 && (octets[1] & 0xc0) == 0x40
                }
        }
        IpAddr::V6(ip) => {
            if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
                return true;
            }

            let segments = ip.segments();
            if (segments[0] & 0xffc0) == 0xfe80 {
                return true;
            }
            if (segments[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            if segments[0] == 0x2001 && segments[1] == 0x0db8 {
                return true;
            }
            if let Some(v4) = ip.to_ipv4_mapped() {
                return is_restricted_ip(IpAddr::V4(v4));
            }

            false
        }
    }
}

/// SSRF check applied to the initial URL and every redirect hop.
/// Rejects non-http(s), restricted literal IPs, sentinel local hostnames, and
/// hostnames that resolve to restricted IPs.
fn check_url_safety(parsed: &url::Url) -> Result<(), String> {
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Unsupported URL scheme: {}", other)),
    }

    let host_str = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?
        .to_lowercase();

    match parsed.host() {
        Some(url::Host::Ipv4(ip)) => {
            if is_restricted_ip(IpAddr::V4(ip)) {
                return Err(format!("Refusing to crawl restricted IPv4: {}", ip));
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            if is_restricted_ip(IpAddr::V6(ip)) {
                return Err(format!("Refusing to crawl restricted IPv6: {}", ip));
            }
        }
        Some(url::Host::Domain(_)) => {
            if host_str == "localhost"
                || host_str.ends_with(".localhost")
                || host_str == "broadcasthost"
                || host_str == "ip6-localhost"
                || host_str == "ip6-loopback"
            {
                return Err("Refusing to crawl local hostname".into());
            }
        }
        None => return Err("URL has no host".into()),
    }

    Ok(())
}

async fn validate_resolved_host(parsed: &url::Url) -> Result<(), String> {
    let Some(url::Host::Domain(host)) = parsed.host() else {
        return Ok(());
    };

    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| "URL has no port and no known default port".to_string())?;
    let addresses = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("Host resolution failed: {}", e))?;

    let mut saw_address = false;
    for address in addresses {
        saw_address = true;
        let ip = address.ip();
        if is_restricted_ip(ip) {
            return Err(format!(
                "Refusing to crawl host that resolves to restricted IP: {}",
                ip
            ));
        }
    }

    if !saw_address {
        return Err("Host resolution returned no addresses".into());
    }

    Ok(())
}

async fn validate_url(raw: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(raw).map_err(|e| format!("Invalid URL: {}", e))?;
    check_url_safety(&parsed)?;
    validate_resolved_host(&parsed).await?;
    Ok(parsed)
}

async fn validate_redirect(base_url: &url::Url, location: &str) -> Result<url::Url, String> {
    let next = base_url
        .join(location)
        .map_err(|e| format!("Invalid redirect URL: {}", e))?;
    check_url_safety(&next)?;
    validate_resolved_host(&next).await?;
    Ok(next)
}

#[tauri::command]
pub async fn fetch_url(url: String) -> Result<CrawlResponse, String> {
    let mut current_url = validate_url(&url).await?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("HTTP client build failed: {}", e))?;

    let mut redirect_count = 0usize;
    let response = loop {
        let response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_redirection() {
            break response;
        }
        if redirect_count >= MAX_REDIRECTS {
            return Err("Too many redirects".into());
        }

        let location = response
            .headers()
            .get(LOCATION)
            .ok_or_else(|| "Redirect response did not include a Location header".to_string())?
            .to_str()
            .map_err(|_| "Redirect Location header was not valid UTF-8".to_string())?
            .to_string();

        if location.is_empty() {
            return Err("Redirect Location header was empty".into());
        }

        let next_url = validate_redirect(&current_url, &location).await?;

        if next_url == current_url {
            return Err("Redirect loop detected".into());
        }

        current_url = next_url;
        redirect_count += 1;
    };

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let ct_lower = content_type.to_lowercase();
    if !ct_lower.is_empty()
        && !ct_lower.starts_with("text/")
        && !ct_lower.contains("xml")
        && !ct_lower.contains("html")
        && !ct_lower.contains("json")
    {
        return Err(format!("Unsupported content type: {}", content_type));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Response body read failed: {}", e))?;

    let truncated = bytes.len() > MAX_BODY_BYTES;
    let slice = if truncated {
        &bytes[..MAX_BODY_BYTES]
    } else {
        &bytes[..]
    };
    let body = String::from_utf8_lossy(slice).to_string();

    Ok(CrawlResponse {
        status,
        body,
        final_url,
        content_type,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_restricted_literal_hosts() {
        let cases = [
            "http://localhost/",
            "http://127.0.0.1/",
            "http://10.1.2.3/",
            "http://192.168.1.10/",
            "http://172.16.0.1/",
            "http://172.31.255.255/",
            "http://100.64.0.1/",
            "http://[::1]/",
            "http://[fe80::1]/",
            "http://[fc00::1]/",
            "http://[::ffff:127.0.0.1]/",
        ];

        for case in cases {
            assert!(
                validate_url(case).await.is_err(),
                "{case} should be blocked"
            );
        }
    }

    #[tokio::test]
    async fn allows_public_literal_hosts() {
        assert!(validate_url("https://93.184.216.34/").await.is_ok());
        assert!(
            validate_url("https://[2606:2800:220:1:248:1893:25c8:1946]/")
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn rejects_private_redirect_targets_before_following() {
        let base = url::Url::parse("https://example.com/path").unwrap();
        assert!(validate_redirect(&base, "http://192.168.1.1/admin")
            .await
            .is_err());
        assert!(validate_redirect(&base, "http://[::1]/").await.is_err());
    }
}
