use local_read_lib::paths::RuntimeDirs;

#[test]
fn book_paths_must_stay_inside_books_dir() {
    let root = tempfile::tempdir().expect("temp dir");
    let dirs = RuntimeDirs::for_data_root(root.path()).expect("runtime dirs");

    let nested = dirs.resolve_book_path("nested/demo.epub").expect("nested book path");
    assert!(nested.starts_with(&dirs.books));

    assert!(dirs.resolve_book_path("../escape.epub").is_err());
    assert!(dirs.resolve_book_path("nested/../../escape.epub").is_err());
}

#[test]
fn absolute_sibling_paths_are_rejected_even_with_shared_prefix() {
    let root = tempfile::tempdir().expect("temp dir");
    let dirs = RuntimeDirs::for_data_root(root.path()).expect("runtime dirs");
    let sibling = root.path().join("books2").join("escape.txt");

    assert!(dirs.resolve_book_path(&sibling.to_string_lossy()).is_err());
}

#[test]
fn config_paths_accept_only_json_filenames() {
    let root = tempfile::tempdir().expect("temp dir");
    let dirs = RuntimeDirs::for_data_root(root.path()).expect("runtime dirs");

    let config = dirs.resolve_config_path("user-config.json").expect("config path");
    assert!(config.starts_with(&dirs.config));

    assert!(dirs.resolve_config_path("../user-config.json").is_err());
    assert!(dirs.resolve_config_path("nested/user-config.json").is_err());
    assert!(dirs.resolve_config_path("user-config.txt").is_err());
}

#[test]
fn font_paths_accept_only_supported_font_filenames() {
    let root = tempfile::tempdir().expect("temp dir");
    let dirs = RuntimeDirs::for_data_root(root.path()).expect("runtime dirs");

    let font = dirs.resolve_font_path("SourceSans.woff2").expect("font path");
    assert!(font.starts_with(&dirs.fonts));

    assert!(dirs.resolve_font_path("../fonts2/escape.ttf").is_err());
    assert!(dirs.resolve_font_path("nested/font.ttf").is_err());
    assert!(dirs.resolve_font_path("font.txt").is_err());
}
