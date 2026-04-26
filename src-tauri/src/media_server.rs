use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use tauri::http::{header, Response, StatusCode};

use crate::{media_protocol, store};

const MAX_REQUEST_HEADER_LEN: usize = 16 * 1024;

pub struct MediaHttpServer {
    base_url: String,
}

impl MediaHttpServer {
    pub fn start(state: store::AppState) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Could not read media server address: {error}"))?;
        let base_url = format!("http://{address}");

        thread::Builder::new()
            .name("karlo-media-http".to_owned())
            .spawn(move || {
                for stream in listener.incoming() {
                    match stream {
                        Ok(stream) => {
                            let state = state.clone();
                            if let Err(error) = thread::Builder::new()
                                .name("karlo-media-http-client".to_owned())
                                .spawn(move || {
                                    if let Err(error) = handle_connection(stream, &state) {
                                        eprintln!("[karlo] media http request failed: {error}");
                                    }
                                })
                            {
                                eprintln!("[karlo] could not spawn media http client: {error}");
                            }
                        }
                        Err(error) => eprintln!("[karlo] media http connection failed: {error}"),
                    }
                }
            })
            .map_err(|error| format!("Could not start media http server: {error}"))?;

        Ok(Self { base_url })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

fn handle_connection(mut stream: TcpStream, state: &store::AppState) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;

    let request = read_http_request(&mut stream)?;
    let response = response_for_request(&request, state);
    write_http_response(&mut stream, response)
}

fn response_for_request(request: &HttpRequest, state: &store::AppState) -> Response<Vec<u8>> {
    if request.method != "GET" && request.method != "HEAD" {
        return text_response(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }

    let Some(path) = media_path_from_target(&request.target) else {
        return text_response(StatusCode::BAD_REQUEST, "invalid media request");
    };

    let configured_roots = state
        .load_cabinet_config()
        .map(|config| media_protocol::configured_media_roots(&config.paths))
        .unwrap_or_default();

    media_protocol::media_response_for_path(
        &path,
        request.method == "HEAD",
        request.range.as_deref(),
        &configured_roots,
    )
}

#[derive(Debug, PartialEq, Eq)]
struct HttpRequest {
    method: String,
    target: String,
    range: Option<String>,
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut data = Vec::new();
    let mut buffer = [0; 1024];

    while !data.windows(4).any(|window| window == b"\r\n\r\n") {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("connection closed before request headers".to_owned());
        }
        data.extend_from_slice(&buffer[..read]);
        if data.len() > MAX_REQUEST_HEADER_LEN {
            return Err("request headers are too large".to_owned());
        }
    }

    parse_http_request(&String::from_utf8_lossy(&data))
}

fn parse_http_request(raw: &str) -> Result<HttpRequest, String> {
    let mut lines = raw.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_owned())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "missing request method".to_owned())?
        .to_owned();
    let target = request_parts
        .next()
        .ok_or_else(|| "missing request target".to_owned())?
        .to_owned();
    let mut range = None;

    for line in lines {
        if line.is_empty() {
            break;
        }

        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("range") {
            range = Some(value.trim().to_owned());
        }
    }

    Ok(HttpRequest {
        method,
        target,
        range,
    })
}

fn media_path_from_target(target: &str) -> Option<PathBuf> {
    let (route, query) = target.split_once('?')?;
    if route != "/media" {
        return None;
    }

    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode_query(name) != "path" {
            continue;
        }

        let decoded = percent_decode_query(value);
        if !is_device_file_path(&decoded) {
            return None;
        }

        return Some(PathBuf::from(decoded));
    }

    None
}

fn is_device_file_path(path: &str) -> bool {
    path.starts_with('/')
        || path.starts_with("\\\\")
        || path
            .as_bytes()
            .get(1..3)
            .is_some_and(|bytes| bytes[0] == b':' && (bytes[1] == b'/' || bytes[1] == b'\\'))
}

fn percent_decode_query(value: &str) -> String {
    let mut output = Vec::new();
    let bytes = value.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                if let (Some(high), Some(low)) =
                    (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
                {
                    output.push(high << 4 | low);
                    index += 3;
                } else {
                    output.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&output).into_owned()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn write_http_response(stream: &mut TcpStream, response: Response<Vec<u8>>) -> Result<(), String> {
    let (parts, body) = response.into_parts();
    write!(
        stream,
        "HTTP/1.1 {} {}\r\n",
        parts.status.as_u16(),
        status_reason(parts.status)
    )
    .map_err(|error| error.to_string())?;

    for (name, value) in &parts.headers {
        let Ok(value) = value.to_str() else {
            continue;
        };
        write!(stream, "{}: {value}\r\n", name.as_str()).map_err(|error| error.to_string())?;
    }

    if !parts.headers.contains_key(header::CONTENT_LENGTH) {
        write!(stream, "content-length: {}\r\n", body.len()).map_err(|error| error.to_string())?;
    }
    write!(stream, "connection: close\r\n\r\n").map_err(|error| error.to_string())?;
    stream.write_all(&body).map_err(|error| error.to_string())
}

fn status_reason(status: StatusCode) -> &'static str {
    match status {
        StatusCode::OK => "OK",
        StatusCode::PARTIAL_CONTENT => "Partial Content",
        StatusCode::BAD_REQUEST => "Bad Request",
        StatusCode::FORBIDDEN => "Forbidden",
        StatusCode::NOT_FOUND => "Not Found",
        StatusCode::METHOD_NOT_ALLOWED => "Method Not Allowed",
        StatusCode::RANGE_NOT_SATISFIABLE => "Range Not Satisfiable",
        StatusCode::INTERNAL_SERVER_ERROR => "Internal Server Error",
        _ => "OK",
    }
}

fn text_response(status: StatusCode, body: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_LENGTH, body.len().to_string())
        .body(body.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_range_header_from_request() {
        let request = parse_http_request(
            "GET /media?path=%2Fsrv%2Fvideo.mp4 HTTP/1.1\r\nRange: bytes=0-1\r\n\r\n",
        )
        .unwrap();

        assert_eq!(
            request,
            HttpRequest {
                method: "GET".to_owned(),
                target: "/media?path=%2Fsrv%2Fvideo.mp4".to_owned(),
                range: Some("bytes=0-1".to_owned()),
            }
        );
    }

    #[test]
    fn parses_media_path_query_parameter() {
        assert_eq!(
            media_path_from_target("/media?path=%2Fsrv%2Fkarlo%2Flibrary%2Fvideo+one.mp4"),
            Some(PathBuf::from("/srv/karlo/library/video one.mp4"))
        );
        assert_eq!(media_path_from_target("/media?path=relative.mp4"), None);
        assert_eq!(
            media_path_from_target("/other?path=%2Ftmp%2Fvideo.mp4"),
            None
        );
    }
}
