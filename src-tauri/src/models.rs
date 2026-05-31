use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub added_at: f64,
    pub modified_at: f64,
    pub cover_available: bool,
}

#[derive(Debug, Deserialize)]
pub struct UploadFile {
    pub name: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedFileInfo {
    pub original_name: String,
    pub saved_name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub success: bool,
    pub message: String,
    pub files: Vec<UploadedFileInfo>,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CoverResponse {
    pub success: bool,
    pub cover: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SaveConfigResponse {
    pub success: bool,
    pub message: String,
    pub filename: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct LoadConfigResponse {
    pub success: bool,
    pub config: Value,
    pub filename: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigInfo {
    pub filename: String,
    pub size: u64,
    pub created_at: String,
    pub modified_at: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct ConfigListResponse {
    pub success: bool,
    pub configs: Vec<ConfigInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub id: String,
    pub name: String,
    pub font_family: String,
    pub filename: String,
    pub size: u64,
    pub added_at: f64,
}

#[derive(Debug, Serialize)]
pub struct UploadFontResponse {
    pub success: bool,
    pub font: FontInfo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFileResponse {
    pub mime_type: String,
    pub data: Vec<u8>,
}
