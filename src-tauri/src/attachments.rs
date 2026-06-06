/// Returns MIME type string for a filename based on its extension.
pub fn mime_type(filename: &str) -> &'static str {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        // Text
        "txt" | "log" | "md" | "csv" | "json" | "xml" | "yaml" | "yml"
        | "html" | "htm" | "js" | "ts" | "css" | "py" | "rs" | "toml"
        | "ini" | "cfg" | "conf" | "pem" | "crt" | "key" | "sh" | "bat"
        | "sql" | "diff" | "patch" | "gitignore" => "text/plain",
        // Images
        "png"  => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif"  => "image/gif",
        "bmp"  => "image/bmp",
        "svg"  => "image/svg+xml",
        "webp" => "image/webp",
        "ico"  => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        // Documents
        "pdf"  => "application/pdf",
        _      => "application/octet-stream",
    }
}
