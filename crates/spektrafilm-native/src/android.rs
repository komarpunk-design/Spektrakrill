// Android uses the unchanged native client's request handlers and pipelines.
// Every call is serialized by Java on one engine executor.
#![allow(dead_code, unused_imports)]
include!("main.rs");
use std::ffi::{CStr, CString, c_char};
use std::cell::RefCell;
thread_local! { static ANDROID_SESSION: RefCell<Session> = RefCell::new(Session::default()); }
/// Strings are UTF-8, valid for this call only. Return value must be freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn negs_request(data: *const c_char, request: *const c_char) -> *mut c_char {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let data = unsafe { CStr::from_ptr(data) }.to_str().map_err(anyhow::Error::msg)?;
        let text = unsafe { CStr::from_ptr(request) }.to_str().map_err(anyhow::Error::msg)?;
        ANDROID_SESSION.with(|s| {
            let mut session=s.borrow_mut();
            let document:Value=serde_json::from_str(text)?;
            if document["command"]=="android_release" { *session=Session::default();return Ok(json!({})); }
            if document["command"].as_str().unwrap_or("").starts_with("android_sidecar_") {
                return android_sidecar(&document, Path::new(data));
            }
            let mut request=parse_request(text)?;
            if cfg!(feature="android-reference") {
                session.backend=Some(Box::new(spektrafilm_gpu::cpu_backend::CpuBackend));
                if let Command::Render { params, .. } = &mut request.command {
                    params.settings.use_enlarger_lut=false;
                    params.settings.use_scanner_lut=false;
                }
            }
            session.handle(request, Path::new(data))
        })
    }));
    let response = match result {
        Ok(Ok(value)) => json!({"result": value}),
        Ok(Err(error)) => json!({"error": format!("{error:#}")}),
        Err(_) => {
            ANDROID_SESSION.with(|s| *s.borrow_mut() = Session::default());
            json!({"error":"The image engine failed; its session was reset."})
        }
    };
    CString::new(response.to_string()).unwrap().into_raw()
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn negs_free(text: *mut c_char) { if !text.is_null() { drop(unsafe { CString::from_raw(text) }); } }

#[cfg(test)] mod android_contract {
 use super::*;
 fn request(text:&str)->Value {
  let data=CString::new(concat!(env!("CARGO_MANIFEST_DIR"),"/../../data")).unwrap();
  let text=CString::new(text).unwrap();
  unsafe { let p=negs_request(data.as_ptr(),text.as_ptr());let value=serde_json::from_str(CStr::from_ptr(p).to_str().unwrap()).unwrap();negs_free(p);value }
 }
 #[test] fn malformed_request_is_an_error_and_session_still_works(){assert!(request("{bad")["error"].is_string());let c=request(r#"{"id":1,"command":"catalog"}"#);assert!(c["result"]["profiles"].as_array().unwrap().len()>50);}
 #[test] fn unsupported_command_does_not_panic(){assert!(request(r#"{"id":1,"command":"unknown"}"#)["error"].as_str().unwrap().contains("unknown variant"));}
 #[test] fn original_without_input_fails_without_writing(){let r=request(r#"{"id":1,"command":"original","input":"/nonexistent/📷.NEF","params":{},"limit_preview":true,"preview_path":"/never-write.rgba"}"#);assert!(r["error"].is_string());}
}

// The shared library crate, not a reimplementation of the .negs format.
fn android_sidecar(document:&Value,data:&Path)->Result<Value> {
 use negs_library::{sidecar,edits,Json,EditState,Tables};
 let photo=Path::new(document["input"].as_str().context("Missing input")?);
 if document["command"]=="android_sidecar_import" {
  let text=document["text"].as_str().context("Missing .negs text")?;
  ensure!(text.len()<=sidecar::MAXIMUM_SIZE,"The .negs file is too large");
  let parsed=sidecar::Sidecar::from_bytes(text.as_bytes())?;
  sidecar::write_raw(photo,Some(&parsed.raw))?;
 }
 let raw=sidecar::read_raw(photo)?;
 let table=Tables::new(data).latest().map_err(anyhow::Error::msg)?;
 let to_json=|v:&Value| -> Result<Json> {Ok(Json::parse(v.to_string().as_bytes())?)};
 if document["command"]=="android_sidecar_save" {
  let mut patch=sidecar::Patch::new("primary",table.version,"Negs Android 0.18.0");
  patch.primary=true;
  if let Some(state)=document.get("state") {
   let mut edit=EditState::from_table(&table);
   edit.film=state["film"].as_str().context("Missing film")?.into();
   edit.paper=state["paper"].as_str().context("Missing paper")?.into();
   edit.params=to_json(&state["params"])?;
   if let Some(crop)=state.get("crop") {edit.crop=to_json(crop)?;}
   if let Some(border)=state.get("border") {edit.border=to_json(border)?;}
   let encoded=edits::encode_edits(&edit,false,&table);
   patch.edits=Some(Some(encoded));
   let engine=to_json(&serde_json::to_value(RuntimeParams::default())?)?;
   patch.known=table.known(Some(&engine));
  }
  if let Some(rating)=document.get("rating") {patch.rating=Some(rating.as_i64().context("Invalid rating")?);}
  if let Some(flag)=document.get("flag") {patch.flag=Some(flag.as_str().and_then(sidecar::Flag::parse));}
  let next=patch.applied(raw.as_ref())?; sidecar::write_raw(photo,next.as_ref())?;
 }
 let Some(sidecar)=sidecar::read(photo)? else {return Ok(json!({"rating":0}));};
 let Some(variant)=sidecar.variants.first() else {return Ok(json!({"rating":0}));};
 let mut result=json!({"rating":variant.rating,"flag":variant.flag.map(|f|f.as_str())});
 if let Some(edit)=&variant.edits {
  let saved_table=Tables::new(data).get(sidecar.defaults_version).map_err(anyhow::Error::msg)?;
  let saved=edits::decode_edits(edit,&saved_table)?;
  result["state"]=json!({"film":saved.state.film,"paper":saved.state.paper,
   "params":serde_json::from_str::<Value>(&saved.state.params.to_compact_sorted())?,
   "crop":serde_json::from_str::<Value>(&saved.state.crop.to_compact_sorted())?,
   "border":serde_json::from_str::<Value>(&saved.state.border.to_compact_sorted())?});
 }
 Ok(result)
}

#[cfg(test)] mod android_sidecar_contract {
 use super::*;
 #[test] fn original_library_roundtrips_edits_rating_and_refuses_newer_files() {
  let dir=std::env::temp_dir().join(format!("negs-android-sidecar-{}",std::process::id()));std::fs::create_dir_all(&dir).unwrap();
  let photo=dir.join("кадр-📷.NEF");std::fs::write(&photo,[]).unwrap();
  let data=Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data");
  let command=json!({"command":"android_sidecar_save","input":photo,"rating":4,"flag":"pick","state":{"film":"kodak_portra_400","paper":"kodak_portra_endura","params":RuntimeParams::default()}});
  let result=android_sidecar(&command,&data).unwrap();assert_eq!(result["rating"],4);assert_eq!(result["flag"],"pick");assert_eq!(result["state"]["film"],"kodak_portra_400");
  let path=negs_library::sidecar::sidecar_path(&photo);let before=std::fs::read(&path).unwrap();
  let mut invalid=json!({"command":"android_sidecar_import","input":photo,"text":"{\"negs\":999,\"variants\":[]}"});
  assert!(android_sidecar(&invalid,&data).is_err());assert_eq!(std::fs::read(&path).unwrap(),before);
  invalid["text"]=json!(String::from_utf8(before.clone()).unwrap());android_sidecar(&invalid,&data).unwrap();assert_eq!(std::fs::read(&path).unwrap(),before);
  std::fs::remove_dir_all(dir).unwrap();
 }
 #[test] fn ffi_render_and_export_use_the_same_original_pipeline(){
  let dir=std::env::temp_dir().join(format!("negs-android-render-{}",std::process::id()));std::fs::create_dir_all(&dir).unwrap();
  let input=dir.join("input.png");let rgba=dir.join("preview.rgba");let png=dir.join("result.png");let tiff=dir.join("result.tiff");
  let image=ImageBuf::from_data(16,12,[0.12,0.25,0.4].repeat(16*12));spektrafilm_io::save_image(&image,&input,None).unwrap();
  let data=CString::new(concat!(env!("CARGO_MANIFEST_DIR"),"/../../data")).unwrap();
  let send=|v:Value| {let request=CString::new(v.to_string()).unwrap();unsafe{let p=negs_request(data.as_ptr(),request.as_ptr());let result:Value=serde_json::from_str(CStr::from_ptr(p).to_str().unwrap()).unwrap();negs_free(p);assert!(result.get("error").is_none(),"{result}");result["result"].clone()}};
  let mut params=RuntimeParams::default();params.film_render.grain.active=false;
  send(json!({"id":42,"command":"render","input":input,"film":"kodak_portra_400","paper":"kodak_portra_endura","params":params,"limit_preview":true,"preview_path":rgba}));
  for (file,bits) in [(&png,8),(&tiff,16)] {send(json!({"id":43,"command":"save","render_id":42,"output":file,"crop_after_post":true,"save_options":{"bit_depth":bits,"color_space":"sRGB"}}));assert!(std::fs::metadata(file).unwrap().len()>200);}
  let a=image::open(&png).unwrap().to_rgb8();let b=image::open(&tiff).unwrap().to_rgb16();assert_eq!(a.dimensions(),b.dimensions());for (a,b) in a.as_raw().iter().zip(b.as_raw()){assert!((*a as f64-*b as f64/257.).abs()<=1.1);}
  std::fs::remove_dir_all(dir).unwrap();
 }
}
