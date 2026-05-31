use std::{
    env,
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::Manager;

pub const DATA_DIR_ENV: &str = "LOCAL_READ_DATA_DIR";

const ALLOWED_BOOK_EXTENSIONS: &[&str] = &[".epub", ".txt", ".pdf"];
const ALLOWED_FONT_EXTENSIONS: &[&str] = &[".ttf", ".otf", ".woff", ".woff2"];

#[derive(Debug, Clone)]
pub struct RuntimeDirs {
    pub data_root: PathBuf,
    pub books: PathBuf,
    pub config: PathBuf,
    pub fonts: PathBuf,
}

impl RuntimeDirs {
    pub fn from_app_handle(app: &tauri::AppHandle) -> Result<Self, String> {
        if let Ok(custom_root) = env::var(DATA_DIR_ENV) {
            if !custom_root.trim().is_empty() {
                return Self::for_data_root(custom_root);
            }
        }

        if cfg!(debug_assertions) {
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let project_root = manifest_dir
                .parent()
                .ok_or_else(|| "无法解析项目根目录".to_string())?;
            return Self::for_data_root(project_root);
        }

        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法解析应用数据目录: {error}"))?;
        Self::for_data_root(app_data)
    }

    pub fn for_data_root(root: impl AsRef<Path>) -> Result<Self, String> {
        let data_root = root.as_ref().to_path_buf();
        let books = data_root.join("books");
        let config = data_root.join("user-data");
        let fonts = config.join("fonts");

        let dirs = Self {
            data_root,
            books,
            config,
            fonts,
        };
        dirs.ensure_exists()?;
        Ok(dirs)
    }

    pub fn ensure_exists(&self) -> Result<(), String> {
        for dir in [&self.books, &self.config, &self.fonts] {
            fs::create_dir_all(dir).map_err(|error| {
                format!("无法创建数据目录 {}: {error}", dir.display())
            })?;
        }
        Ok(())
    }

    pub fn resolve_book_path(&self, relative_path: impl AsRef<str>) -> Result<PathBuf, String> {
        let relative = normalize_relative_path(relative_path.as_ref(), true)?;
        ensure_allowed_extension(&relative, ALLOWED_BOOK_EXTENSIONS, "不支持的书籍格式")?;
        Ok(self.books.join(relative))
    }

    pub fn resolve_config_path(&self, filename: impl AsRef<str>) -> Result<PathBuf, String> {
        let relative = normalize_relative_path(filename.as_ref(), false)?;
        ensure_allowed_extension(&relative, &[".json"], "无效的配置文件类型")?;
        Ok(self.config.join(relative))
    }

    pub fn resolve_font_path(&self, font_id: impl AsRef<str>) -> Result<PathBuf, String> {
        let relative = normalize_relative_path(font_id.as_ref(), false)?;
        ensure_allowed_extension(&relative, ALLOWED_FONT_EXTENSIONS, "不支持的字体格式")?;
        Ok(self.fonts.join(relative))
    }

    pub fn assert_existing_child(&self, root: &Path, target: &Path) -> Result<(), String> {
        let root = root
            .canonicalize()
            .map_err(|error| format!("无法解析目录 {}: {error}", root.display()))?;
        let target = target
            .canonicalize()
            .map_err(|error| format!("无法解析路径 {}: {error}", target.display()))?;

        if target.starts_with(&root) {
            Ok(())
        } else {
            Err("路径超出允许的数据目录".to_string())
        }
    }
}

fn normalize_relative_path(input: &str, allow_nested: bool) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".to_string());
    }

    let raw = Path::new(trimmed);
    if raw.is_absolute() {
        return Err("不允许绝对路径".to_string());
    }

    let mut normalized = PathBuf::new();
    let mut component_count = 0;

    for component in raw.components() {
        match component {
            Component::Normal(part) => {
                normalized.push(part);
                component_count += 1;
            }
            Component::CurDir => {}
            _ => return Err("路径包含非法片段".to_string()),
        }
    }

    if component_count == 0 {
        return Err("路径不能为空".to_string());
    }

    if !allow_nested && component_count != 1 {
        return Err("文件名不能包含目录".to_string());
    }

    Ok(normalized)
}

fn ensure_allowed_extension(
    path: &Path,
    allowed_extensions: &[&str],
    message: &str,
) -> Result<(), String> {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return Err(message.to_string());
    };
    let extension = format!(".{}", extension).to_lowercase();

    if allowed_extensions
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(&extension))
    {
        Ok(())
    } else {
        Err(message.to_string())
    }
}
