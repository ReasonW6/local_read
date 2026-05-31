use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use zip::ZipArchive;

use crate::{
    models::{
        BookInfo, ConfigInfo, ConfigListResponse, CoverResponse, FontFileResponse, FontInfo,
        LoadConfigResponse, SaveConfigResponse, SuccessResponse, UploadFile, UploadFontResponse,
        UploadResponse, UploadedFileInfo,
    },
    paths::RuntimeDirs,
};

#[derive(Debug, Clone)]
pub struct AppState {
    dirs: RuntimeDirs,
}

impl AppState {
    pub fn new(dirs: RuntimeDirs) -> Self {
        Self { dirs }
    }
}

#[tauri::command]
pub fn list_books(state: tauri::State<'_, AppState>) -> Result<Vec<BookInfo>, String> {
    state.dirs.ensure_exists()?;
    let mut books = Vec::new();
    collect_books(&state.dirs.books, &state.dirs.books, &mut books)?;
    Ok(books)
}

#[tauri::command]
pub fn get_book_cover(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<CoverResponse, String> {
    let book_path = state.dirs.resolve_book_path(path)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.books, &book_path)?;

    if extension_with_dot(&book_path).as_deref() != Some(".epub") {
        return Ok(CoverResponse {
            success: true,
            cover: None,
        });
    }

    Ok(CoverResponse {
        success: true,
        cover: extract_epub_cover(&book_path)?,
    })
}

#[tauri::command]
pub fn read_book(path: String, state: tauri::State<'_, AppState>) -> Result<Vec<u8>, String> {
    let book_path = state.dirs.resolve_book_path(path)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.books, &book_path)?;
    fs::read(&book_path).map_err(|error| format!("读取书籍失败: {error}"))
}

#[tauri::command]
pub fn import_books(
    files: Vec<UploadFile>,
    state: tauri::State<'_, AppState>,
) -> Result<UploadResponse, String> {
    state.dirs.ensure_exists()?;

    if files.is_empty() {
        return Err("没有选择文件".to_string());
    }

    let mut uploaded = Vec::new();
    for file in files {
        let saved_name = save_upload_file(&state.dirs.books, &file, |dirs, name| {
            dirs.resolve_book_path(name)
        }, &state.dirs)?;
        uploaded.push(UploadedFileInfo {
            original_name: file.name,
            saved_name,
            size: file.data.len() as u64,
        });
    }

    Ok(UploadResponse {
        success: true,
        message: format!("成功上传 {} 个文件", uploaded.len()),
        files: uploaded,
    })
}

#[tauri::command]
pub fn delete_book(path: String, state: tauri::State<'_, AppState>) -> Result<SuccessResponse, String> {
    let book_path = state.dirs.resolve_book_path(path)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.books, &book_path)?;
    fs::remove_file(&book_path).map_err(|error| format!("删除书籍失败: {error}"))?;
    cleanup_empty_book_folders(&state.dirs, &book_path);
    Ok(success("书籍删除成功"))
}

#[tauri::command]
pub fn save_config(
    config: Value,
    filename: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<SaveConfigResponse, String> {
    state.dirs.ensure_exists()?;
    let config_filename = filename
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(default_config_filename);
    let config_path = state.dirs.resolve_config_path(&config_filename)?;

    let mut config_with_meta = config;
    let metadata = config_with_meta
        .as_object_mut()
        .map(|object| object.entry("metadata").or_insert_with(|| json!({})));
    if let Some(Value::Object(meta)) = metadata {
        meta.insert("savedAt".to_string(), Value::String(now_rfc3339()));
        meta.insert("version".to_string(), Value::String("1.0.0".to_string()));
        meta.insert(
            "appName".to_string(),
            Value::String("Local E-Book Reader".to_string()),
        );
    }

    let content = serde_json::to_string_pretty(&config_with_meta)
        .map_err(|error| format!("序列化配置失败: {error}"))?;
    fs::write(&config_path, content).map_err(|error| format!("保存配置失败: {error}"))?;

    Ok(SaveConfigResponse {
        success: true,
        message: "配置保存成功".to_string(),
        filename: config_filename,
        path: config_path.display().to_string(),
    })
}

#[tauri::command]
pub fn load_config(
    filename: String,
    state: tauri::State<'_, AppState>,
) -> Result<LoadConfigResponse, String> {
    let config_path = state.dirs.resolve_config_path(&filename)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.config, &config_path)?;
    let content =
        fs::read_to_string(&config_path).map_err(|error| format!("加载配置失败: {error}"))?;
    let config = serde_json::from_str(&content).map_err(|error| format!("解析配置失败: {error}"))?;
    Ok(LoadConfigResponse {
        success: true,
        config,
        filename,
    })
}

#[tauri::command]
pub fn list_configs(state: tauri::State<'_, AppState>) -> Result<ConfigListResponse, String> {
    state.dirs.ensure_exists()?;
    let mut configs = Vec::new();

    for entry in fs::read_dir(&state.dirs.config).map_err(|error| format!("读取配置目录失败: {error}"))? {
        let entry = entry.map_err(|error| format!("读取配置文件失败: {error}"))?;
        if entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            continue;
        }
        let path = entry.path();
        if extension_with_dot(&path).as_deref() != Some(".json") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| format!("读取配置元数据失败: {error}"))?;
        let file_content = fs::read_to_string(&path).unwrap_or_default();
        let json: Option<Value> = serde_json::from_str(&file_content).ok();
        configs.push(ConfigInfo {
            filename: entry.file_name().to_string_lossy().to_string(),
            size: metadata.len(),
            created_at: format_system_time(metadata.created().unwrap_or(SystemTime::UNIX_EPOCH)),
            modified_at: format_system_time(metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH)),
            metadata: json.and_then(|value| value.get("metadata").cloned()),
        });
    }

    configs.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(ConfigListResponse {
        success: true,
        configs,
    })
}

#[tauri::command]
pub fn delete_config(
    filename: String,
    state: tauri::State<'_, AppState>,
) -> Result<SuccessResponse, String> {
    let config_path = state.dirs.resolve_config_path(filename)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.config, &config_path)?;
    fs::remove_file(&config_path).map_err(|error| format!("删除配置失败: {error}"))?;
    Ok(success("配置文件删除成功"))
}

#[tauri::command]
pub fn list_fonts(state: tauri::State<'_, AppState>) -> Result<Vec<FontInfo>, String> {
    state.dirs.ensure_exists()?;
    let mut fonts = Vec::new();

    for entry in fs::read_dir(&state.dirs.fonts).map_err(|error| format!("读取字体目录失败: {error}"))? {
        let entry = entry.map_err(|error| format!("读取字体文件失败: {error}"))?;
        if entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            continue;
        }
        let filename = entry.file_name().to_string_lossy().to_string();
        if state.dirs.resolve_font_path(&filename).is_err() {
            continue;
        }
        fonts.push(font_info_from_path(&entry.path(), &filename)?);
    }

    Ok(fonts)
}

#[tauri::command]
pub fn import_font(
    file: UploadFile,
    state: tauri::State<'_, AppState>,
) -> Result<UploadFontResponse, String> {
    state.dirs.ensure_exists()?;
    let saved_name = save_upload_file(&state.dirs.fonts, &file, |dirs, name| {
        dirs.resolve_font_path(name)
    }, &state.dirs)?;
    let font = font_info_from_path(&state.dirs.fonts.join(&saved_name), &saved_name)?;
    Ok(UploadFontResponse {
        success: true,
        font,
    })
}

#[tauri::command]
pub fn read_font(
    font_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<FontFileResponse, String> {
    let font_path = state.dirs.resolve_font_path(font_id)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.fonts, &font_path)?;
    let mime_type = font_mime_type(&font_path).to_string();
    let data = fs::read(&font_path).map_err(|error| format!("读取字体失败: {error}"))?;
    Ok(FontFileResponse { mime_type, data })
}

#[tauri::command]
pub fn delete_font(
    font_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<SuccessResponse, String> {
    let font_path = state.dirs.resolve_font_path(font_id)?;
    ensure_existing_file_inside(&state.dirs, &state.dirs.fonts, &font_path)?;
    fs::remove_file(&font_path).map_err(|error| format!("删除字体失败: {error}"))?;
    Ok(success("字体删除成功"))
}

#[tauri::command]
pub fn open_books_folder(state: tauri::State<'_, AppState>) -> Result<SuccessResponse, String> {
    state.dirs.ensure_exists()?;
    open_path(&state.dirs.books)?;
    Ok(success("已打开书籍目录"))
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_maximize_toggle(window: tauri::Window) -> Result<bool, String> {
    if window.is_maximized().map_err(|error| error.to_string())? {
        window.unmaximize().map_err(|error| error.to_string())?;
    } else {
        window.maximize().map_err(|error| error.to_string())?;
    }
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

fn collect_books(root: &Path, dir: &Path, books: &mut Vec<BookInfo>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|error| format!("读取书库失败: {error}"))? {
        let entry = entry.map_err(|error| format!("读取书库条目失败: {error}"))?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_books(root, &path, books)?;
            continue;
        }
        if !matches!(extension_with_dot(&path).as_deref(), Some(".epub" | ".txt" | ".pdf")) {
            continue;
        }
        let metadata = entry.metadata().map_err(|error| format!("读取书籍元数据失败: {error}"))?;
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("生成相对路径失败: {error}"))?;
        let rel = relative.to_string_lossy().replace('\\', "/");
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let extension = extension_with_dot(&path).unwrap_or_default();
        books.push(BookInfo {
            name,
            path: rel,
            extension: extension.clone(),
            size: metadata.len(),
            added_at: system_time_millis(metadata.created().or_else(|_| metadata.modified()).unwrap_or(SystemTime::UNIX_EPOCH)),
            modified_at: system_time_millis(metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH)),
            cover_available: extension == ".epub",
        });
    }
    Ok(())
}

fn ensure_existing_file_inside(dirs: &RuntimeDirs, root: &Path, target: &Path) -> Result<(), String> {
    dirs.assert_existing_child(root, target)?;
    let metadata = fs::metadata(target).map_err(|error| format!("文件不存在: {error}"))?;
    if metadata.is_file() {
        Ok(())
    } else {
        Err("目标不是文件".to_string())
    }
}

fn save_upload_file(
    root: &Path,
    file: &UploadFile,
    resolver: impl Fn(&RuntimeDirs, &str) -> Result<PathBuf, String>,
    dirs: &RuntimeDirs,
) -> Result<String, String> {
    let filename = Path::new(&file.name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?
        .to_string();

    resolver(dirs, &filename)?;
    let (saved_name, destination) = unique_destination(root, &filename)?;
    let mut output = File::create(&destination).map_err(|error| format!("创建文件失败: {error}"))?;
    output
        .write_all(&file.data)
        .map_err(|error| format!("写入文件失败: {error}"))?;
    Ok(saved_name)
}

fn unique_destination(root: &Path, filename: &str) -> Result<(String, PathBuf), String> {
    let ext = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?;

    let mut counter = 0;
    loop {
        let name = if counter == 0 {
            filename.to_string()
        } else {
            format!("{stem}({counter}){ext}")
        };
        let candidate = root.join(&name);
        if !candidate.exists() {
            return Ok((name, candidate));
        }
        counter += 1;
    }
}

fn cleanup_empty_book_folders(dirs: &RuntimeDirs, deleted_file: &Path) {
    let mut current = deleted_file.parent();
    while let Some(dir) = current {
        if dir == dirs.books || !dir.starts_with(&dirs.books) {
            break;
        }
        let is_empty = fs::read_dir(dir)
            .map(|entries| entries.count() == 0)
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        if fs::remove_dir(dir).is_err() {
            break;
        }
        current = dir.parent();
    }
}

fn default_config_filename() -> String {
    let stamp = now_rfc3339().replace(':', "-");
    format!("reader-config-{}.json", stamp.trim_end_matches('Z'))
}

fn font_info_from_path(path: &Path, filename: &str) -> Result<FontInfo, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("读取字体元数据失败: {error}"))?;
    let name = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(filename)
        .to_string();
    Ok(FontInfo {
        id: filename.to_string(),
        name: name.clone(),
        font_family: format!("CustomFont_{}", sanitize_font_family(&name)),
        filename: filename.to_string(),
        size: metadata.len(),
        added_at: system_time_millis(metadata.created().or_else(|_| metadata.modified()).unwrap_or(SystemTime::UNIX_EPOCH)),
    })
}

fn sanitize_font_family(name: &str) -> String {
    name.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

fn extract_epub_cover(path: &Path) -> Result<Option<String>, String> {
    let file = File::open(path).map_err(|error| format!("打开 EPUB 失败: {error}"))?;
    let mut zip = ZipArchive::new(file).map_err(|error| format!("读取 EPUB 失败: {error}"))?;
    let mut images = Vec::new();

    for index in 0..zip.len() {
        let entry = zip.by_index(index).map_err(|error| format!("读取 EPUB 条目失败: {error}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if image_mime_type(&name).is_some() {
            images.push((index, name));
        }
    }

    let Some((index, name)) = images
        .iter()
        .find(|(_, name)| {
            Path::new(name)
                .file_name()
                .and_then(|value| value.to_str())
                .map(|file_name| file_name.to_lowercase().contains("cover"))
                .unwrap_or(false)
        })
        .or_else(|| images.first())
        .cloned()
    else {
        return Ok(None);
    };

    let mut entry = zip.by_index(index).map_err(|error| format!("读取封面失败: {error}"))?;
    let mut data = Vec::new();
    entry
        .read_to_end(&mut data)
        .map_err(|error| format!("读取封面数据失败: {error}"))?;
    let mime = image_mime_type(&name).unwrap_or("image/jpeg");
    Ok(Some(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(data)
    )))
}

fn extension_with_dot(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
}

fn font_mime_type(path: &Path) -> &'static str {
    match extension_with_dot(path).as_deref() {
        Some(".ttf") => "font/ttf",
        Some(".otf") => "font/otf",
        Some(".woff") => "font/woff",
        Some(".woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn image_mime_type(name: &str) -> Option<&'static str> {
    match extension_with_dot(Path::new(name)).as_deref() {
        Some(".jpg" | ".jpeg") => Some("image/jpeg"),
        Some(".png") => Some("image/png"),
        Some(".gif") => Some("image/gif"),
        Some(".webp") => Some("image/webp"),
        _ => None,
    }
}

fn system_time_millis(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

fn format_system_time(time: SystemTime) -> String {
    let date_time: OffsetDateTime = time.into();
    date_time
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn now_rfc3339() -> String {
    format_system_time(SystemTime::now())
}

fn success(message: &str) -> SuccessResponse {
    SuccessResponse {
        success: true,
        message: Some(message.to_string()),
    }
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开目录失败: {error}"))
}
