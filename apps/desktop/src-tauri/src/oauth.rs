//! The Desktop side of the Backend's loopback-redirect Wikimedia OAuth
//! flow. This does NOT implement OAuth itself -- Wikimedia's OAuth
//! exchange happens entirely on the Backend (see Backend's
//! src/routes/auth.ts); this module only:
//!
//!   1. opens a local TCP listener on an OS-assigned free port,
//!   2. opens the system browser at
//!      `{backend}/auth/wikimedia?desktopRedirect=http://127.0.0.1:<port>/callback`,
//!   3. waits for the Backend's redirect back to that loopback address,
//!   4. extracts the one-time authorization `code` from the query
//!      string and returns it to the frontend, which exchanges it via
//!      `POST /auth/desktop/token` (a plain `fetch` call -- no reason
//!      for that leg to be in Rust).
//!
//! No Wikimedia credentials, and no long-lived secret, ever pass
//! through this module -- only the short-lived, single-use code.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

const SUCCESS_HTML: &str = "<!doctype html><html><body style=\"font-family: sans-serif; text-align: center; padding-top: 4rem;\"><h2>Signed in to Wikimedia</h2><p>You can close this tab and return to the Perseus.</p></body></html>";
const ERROR_HTML: &str = "<!doctype html><html><body style=\"font-family: sans-serif; text-align: center; padding-top: 4rem;\"><h2>Sign-in failed</h2><p>No authorization code was received. Please return to Perseus and try again.</p></body></html>";

fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                    if let Ok(value) = u8::from_str_radix(hex, 16) {
                        out.push(value);
                        i += 3;
                        continue;
                    }
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn extract_code(raw_request: &str) -> Option<String> {
    // "GET /callback?code=XYZ HTTP/1.1" -- only the request line matters.
    let first_line = raw_request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let (_, query) = path.split_once('?')?;

    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            if key == "code" {
                return Some(percent_decode(value));
            }
        }
    }
    None
}

/// Blocks (on a background thread -- Tauri runs synchronous commands off
/// the main/UI thread) until the OAuth redirect arrives or
/// `LOGIN_TIMEOUT` elapses. Returns the one-time authorization code.
#[tauri::command]
pub fn login_with_wikimedia(app: AppHandle, backend_base_url: String) -> Result<String, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let authorize_url = format!(
        "{}/auth/wikimedia?desktopRedirect={}",
        backend_base_url.trim_end_matches('/'),
        percent_encode(&redirect_uri),
    );

    app.shell()
        .open(authorize_url, None)
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + LOGIN_TIMEOUT;

    loop {
        if Instant::now() > deadline {
            return Err("Login timed out. Please try again.".to_string());
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buf = [0_u8; 8192];
                let bytes_read = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..bytes_read]);
                let code = extract_code(&request);

                let (status_line, body) = match &code {
                    Some(_) => ("HTTP/1.1 200 OK", SUCCESS_HTML),
                    None => ("HTTP/1.1 400 Bad Request", ERROR_HTML),
                };
                let response = format!(
                    "{status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();

                return code.ok_or_else(|| "No authorization code was received.".to_string());
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}
