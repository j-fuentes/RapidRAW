use super::*;

fn register_export_folder(with_original: bool) -> PathBuf {
    let folder = std::env::temp_dir()
        .join("rapidraw-immich-test")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder).unwrap();
    EXPORT_TARGETS.lock().unwrap().insert(
        folder.clone(),
        ExportTarget {
            album: ExportAlbum::None,
            with_original,
        },
    );
    folder
}

fn write_jpeg(path: &Path, seed: u32) {
    let image = image::RgbImage::from_fn(96, 64, |x, y| {
        image::Rgb([
            (seed.wrapping_mul(31).wrapping_add(x * 3)) as u8,
            (seed.wrapping_mul(17).wrapping_add(y * 4)) as u8,
            (seed.wrapping_add(x * y)) as u8,
        ])
    });
    image.save(path).unwrap();
}

#[test]
fn export_paths_are_recognised() {
    let folder = register_export_folder(false);
    assert!(is_export_path(&folder.join("a.jpg")));
    assert!(is_export_path(&folder.join("sub").join("a.jpg")));
    assert!(!is_export_path(&folder));
    assert!(!is_export_path(Path::new("/tmp/not-an-export/a.jpg")));
    EXPORT_TARGETS.lock().unwrap().remove(&folder);
    assert!(!is_export_path(&folder.join("a.jpg")));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
#[ignore = "needs IMMICH_TEST_URL and IMMICH_API_KEY"]
fn live_upload_is_stacked_on_original() {
    let url = std::env::var("IMMICH_TEST_URL").expect("IMMICH_TEST_URL");
    let key = std::env::var("IMMICH_API_KEY").expect("IMMICH_API_KEY");
    let client = ImmichClient::new(&url, &key).unwrap();

    let folder = register_export_folder(true);
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let seed = chrono::Utc::now().timestamp_subsec_nanos();
    let original = folder.join(format!("rapidraw-export-test-{stamp}.jpg"));
    let export = folder.join(format!("rapidraw-export-test-{stamp}_edited.jpg"));
    write_jpeg(&original, seed);
    write_jpeg(&export, seed.wrapping_add(7));
    assert!(is_export_path(&export));

    let runtime = tokio::runtime::Runtime::new().unwrap();
    let ids = runtime.block_on(async {
        let modified = file_time(&original);
        let original_id = client
            .upload(&original, &modified, &modified)
            .await
            .unwrap()
            .id;
        let new_id = upload_stacked(&client, &export, Some(original_id.clone()), None)
            .await
            .unwrap()
            .expect("export was uploaded as a new asset");
        let stack = client
            .stack_of(&original_id)
            .await
            .unwrap()
            .expect("original is in a stack");
        let listed = client
            .all_stacks()
            .await
            .unwrap()
            .into_iter()
            .find(|stack| stack.assets.iter().any(|asset| asset.id == original_id))
            .expect("original is in the full stack list");
        let ids_of = |stack: &crate::immich::client::Stack| {
            let mut ids: Vec<String> = stack.assets.iter().map(|a| a.id.clone()).collect();
            ids.sort();
            ids
        };
        assert_eq!(listed.primary_asset_id, stack.primary_asset_id);
        assert_eq!(ids_of(&listed), ids_of(&stack));
        assert_eq!(stack.primary_asset_id, new_id);
        assert!(stack.assets.iter().any(|asset| asset.id == new_id));
        vec![original_id, new_id]
    });
    println!("uploaded and stacked: {}", ids.join(","));

    if std::env::var("IMMICH_TEST_KEEP").is_err() {
        runtime.block_on(async {
            let response = reqwest::Client::new()
                .delete(format!("{}/api/assets", url.trim_end_matches('/')))
                .header("x-api-key", key.trim())
                .json(&serde_json::json!({ "ids": ids, "force": true }))
                .send()
                .await
                .unwrap();
            assert!(
                response.status().is_success(),
                "cleanup: {}",
                response.status()
            );
        });
        println!("deleted test assets");
    }
    EXPORT_TARGETS.lock().unwrap().remove(&folder);
    let _ = std::fs::remove_dir_all(&folder);
}
