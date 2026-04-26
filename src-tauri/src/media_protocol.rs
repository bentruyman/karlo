use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
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

    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_byte_range(value));

    file_response(&path, range)
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

fn file_response(path: &PathBuf, requested_range: Option<RequestedRange>) -> Response<Vec<u8>> {
    let Ok(mut file) = File::open(path) else {
        return text_response(StatusCode::NOT_FOUND, "media file could not be read");
    };

    let Ok(metadata) = file.metadata() else {
        return text_response(
            StatusCode::NOT_FOUND,
            "media file metadata could not be read",
        );
    };
    let file_len = metadata.len();

    if let Some(requested_range) = requested_range {
        let Some(range) = requested_range.resolve(file_len) else {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{file_len}"))
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(Vec::new())
                .unwrap_or_else(|_| range_error_response());
        };

        return match read_file_range(&mut file, range.start, range.len()) {
            Ok(data) => Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, content_type_for(path))
                .header(header::CONTENT_LENGTH, data.len().to_string())
                .header(header::ACCEPT_RANGES, "bytes")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", range.start, range.end, file_len),
                )
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(data)
                .unwrap_or_else(|_| range_error_response()),
            Err(error) => text_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("media range could not be read: {error}"),
            ),
        };
    }

    match fs::read(path) {
        Ok(data) => Response::builder()
            .header(header::CONTENT_TYPE, content_type_for(path))
            .header(header::CONTENT_LENGTH, data.len().to_string())
            .header(header::ACCEPT_RANGES, "bytes")
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

fn read_file_range(file: &mut File, start: u64, len: u64) -> Result<Vec<u8>, String> {
    file.seek(SeekFrom::Start(start))
        .map_err(|error| error.to_string())?;
    let mut reader = file.take(len);
    let mut data = Vec::with_capacity(len.min(usize::MAX as u64) as usize);
    reader
        .read_to_end(&mut data)
        .map_err(|error| error.to_string())?;
    Ok(data)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RequestedRange {
    start: Option<u64>,
    end: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ResolvedRange {
    start: u64,
    end: u64,
}

impl ResolvedRange {
    fn len(self) -> u64 {
        self.end - self.start + 1
    }
}

impl RequestedRange {
    fn resolve(self, file_len: u64) -> Option<ResolvedRange> {
        if file_len == 0 {
            return None;
        }

        match (self.start, self.end) {
            (Some(start), Some(end)) if start <= end && start < file_len => Some(ResolvedRange {
                start,
                end: end.min(file_len - 1),
            }),
            (Some(start), None) if start < file_len => Some(ResolvedRange {
                start,
                end: file_len - 1,
            }),
            (None, Some(suffix_len)) if suffix_len > 0 => {
                let len = suffix_len.min(file_len);
                Some(ResolvedRange {
                    start: file_len - len,
                    end: file_len - 1,
                })
            }
            _ => None,
        }
    }
}

fn parse_byte_range(value: &str) -> Option<RequestedRange> {
    let range = value.trim().strip_prefix("bytes=")?;
    let range = range.split(',').next()?.trim();
    let (start, end) = range.split_once('-')?;

    let start = if start.trim().is_empty() {
        None
    } else {
        Some(start.trim().parse::<u64>().ok()?)
    };
    let end = if end.trim().is_empty() {
        None
    } else {
        Some(end.trim().parse::<u64>().ok()?)
    };

    if start.is_none() && end.is_none() {
        return None;
    }

    Some(RequestedRange { start, end })
}

fn text_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn range_error_response() -> Response<Vec<u8>> {
    text_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        "media range response failed",
    )
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

    #[test]
    fn parse_byte_range_accepts_common_video_ranges() {
        assert_eq!(
            parse_byte_range("bytes=0-1023"),
            Some(RequestedRange {
                start: Some(0),
                end: Some(1023),
            })
        );
        assert_eq!(
            parse_byte_range("bytes=1024-"),
            Some(RequestedRange {
                start: Some(1024),
                end: None,
            })
        );
        assert_eq!(
            parse_byte_range("bytes=-512"),
            Some(RequestedRange {
                start: None,
                end: Some(512),
            })
        );
        assert_eq!(parse_byte_range("items=0-1023"), None);
    }

    #[test]
    fn requested_range_resolves_against_file_length() {
        assert_eq!(
            RequestedRange {
                start: Some(5),
                end: Some(20),
            }
            .resolve(10),
            Some(ResolvedRange { start: 5, end: 9 })
        );
        assert_eq!(
            RequestedRange {
                start: Some(5),
                end: None,
            }
            .resolve(10),
            Some(ResolvedRange { start: 5, end: 9 })
        );
        assert_eq!(
            RequestedRange {
                start: None,
                end: Some(4),
            }
            .resolve(10),
            Some(ResolvedRange { start: 6, end: 9 })
        );
        assert_eq!(
            RequestedRange {
                start: Some(10),
                end: None,
            }
            .resolve(10),
            None
        );
    }
}
