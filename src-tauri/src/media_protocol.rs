use std::fs;
use std::path::PathBuf;

use tauri::http::{header, Request, Response, StatusCode};

pub fn handle_media_request(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(path) = request_path(request.uri().path()) else {
        return text_response(StatusCode::BAD_REQUEST, "invalid media path");
    };

    if !is_allowed_media_path(&path) {
        return text_response(
            StatusCode::FORBIDDEN,
            "media path is outside the allowed roots",
        );
    }

    match fs::read(&path) {
        Ok(data) => Response::builder()
            .header(header::CONTENT_TYPE, content_type_for(&path))
            .header(header::CONTENT_LENGTH, data.len().to_string())
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(data)
            .unwrap_or_else(|_| {
                text_response(StatusCode::INTERNAL_SERVER_ERROR, "media response failed")
            }),
        Err(error) => text_response(
            StatusCode::NOT_FOUND,
            &format!("media file could not be read: {error}"),
        ),
    }
}

fn request_path(uri_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode(uri_path.strip_prefix('/')?);
    if decoded.starts_with('/') {
        Some(PathBuf::from(decoded))
    } else {
        None
    }
}

fn is_allowed_media_path(path: &PathBuf) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };

    allowed_media_roots()
        .into_iter()
        .filter_map(|root| root.canonicalize().ok())
        .any(|root| path.starts_with(root))
}

fn allowed_media_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/srv/karlo/library")];

    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        roots.push(home.join("Development/src/github.com/bentruyman/karlo-library"));
        roots.push(home.join("Downloads"));
    }

    roots
}

fn content_type_for(path: &PathBuf) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        _ => "application/octet-stream",
    }
}

fn text_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_path_decodes_absolute_paths() {
        assert_eq!(
            request_path("/%2Fsrv%2Fkarlo%2Flibrary%2Fmedia%2Fmame%2Fvideos%2F1942.mp4").unwrap(),
            PathBuf::from("/srv/karlo/library/media/mame/videos/1942.mp4")
        );
        assert_eq!(
            request_path("/%2FUsers%2Fben%2FKarlo%20Library%2Fvideo.mp4").unwrap(),
            PathBuf::from("/Users/ben/Karlo Library/video.mp4")
        );
    }

    #[test]
    fn request_path_rejects_relative_or_missing_paths() {
        assert!(request_path("/relative%2Fvideo.mp4").is_none());
        assert!(request_path("relative/video.mp4").is_none());
    }

    #[test]
    fn content_type_tracks_common_video_extensions() {
        assert_eq!(content_type_for(&PathBuf::from("preview.mp4")), "video/mp4");
        assert_eq!(
            content_type_for(&PathBuf::from("preview.webm")),
            "video/webm"
        );
        assert_eq!(
            content_type_for(&PathBuf::from("preview.bin")),
            "application/octet-stream"
        );
    }
}
