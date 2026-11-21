/* Render/storage regression checks for the virtual-negative workstation. GPLv3. */
#include "spektra.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <cmath>
#include <unistd.h>

static void check(bool ok, const char* message) {
    if(!ok) throw std::runtime_error(message);
    std::cout << "PASS " << message << '\n';
}
int main(int argc, char** argv) try {
    if(argc != 2) return 2;
    char temporary[] = "/tmp/spektra-negative-XXXXXX";
    auto directory = mkdtemp(temporary); if(!directory) return 3;
    std::filesystem::create_directory(std::string(directory) + "/negatives");
    struct Cleanup { const char* path; ~Cleanup() { std::filesystem::remove_all(path); } } cleanup{directory};
    spk_set_lab_profile_directory(directory);
    spk_engine* engine = nullptr;
    check(spk_engine_create(argv[1], &engine) == SPK_OK, "engine created");
    struct Owner { spk_engine*& engine; ~Owner() { spk_engine_destroy(engine); } } owner{engine};
    constexpr int w = 48, h = 32;
    std::vector<float> source(w*h*3);
    for(int i=0; i<w*h; ++i) for(int c=0; c<3; ++c)
        source[i*3+c] = .002f + std::pow(double(i)/(w*h-1), 2) * (c==0 ? .8 : c==1 ? .6 : .4);
    const auto original = source;
    spk_image input{source.data(), w, h, SPK_CS_PROPHOTO};
    spk_params p; spk_default_params(&p);
    p.film_profile="kodak_portra_400";
    p.auto_exposure=0; p.scan_film=1; p.grain_active=0; p.halation_active=0; p.glare_active=0;
    p.scanner_unsharp[0]=0; p.scanner_unsharp[1]=0; p.preview_max_size=64; p.disable_buffer_memos=1;
    const std::string identity(64, 'a');
    auto json = [&](const std::string& mode, bool frozen) {
        return std::string("{\"outputModel\":{\"mode\":\"") + mode + "\"}" +
            (frozen ? ",\"virtualNegative\":\"" + identity + "\"" : "") + "}";
    };
    auto render = [&](const std::string& settings, bool preview=false) {
        p.experimental_json = settings.c_str();
        spk_image output{};
        auto status = preview ? spk_simulate_preview(engine,&input,&p,&output) : spk_simulate(engine,&input,&p,&output);
        if(status != SPK_OK) throw std::runtime_error("render status " + std::to_string(status) + ": " + spk_last_error_message());
        std::vector<float> data(output.data, output.data + size_t(output.width)*output.height*3);
        spk_image_free(&output);
        for(auto v:data) if(!std::isfinite(v)) throw std::runtime_error("nonfinite output");
        return data;
    };
    auto countFiles = [&] { size_t count=0; for(const auto& f: std::filesystem::directory_iterator(std::string(directory)+"/negatives")) if(f.path().extension()==".spkneg") ++count; return count; };
    const auto plain = render(json("noritsu-ls600", false));
    const auto first = render(json("noritsu-ls600", true));
    check(first == plain, "freezing is pixel-identical to the existing film pipeline");
    check(countFiles() == 1, "one lossless density file is stored");
    std::filesystem::path stored;
    for(const auto& entry: std::filesystem::directory_iterator(std::string(directory)+"/negatives")) stored=entry.path();
    check(std::filesystem::file_size(stored) == 24 + w*h*3*sizeof(float), "file stores three float densities per pixel, no RGB quantization");
    spk_engine_destroy(engine); engine=nullptr;
    check(spk_engine_create(argv[1], &engine) == SPK_OK, "engine recreated for cold restore");
    const auto saved_time = std::filesystem::last_write_time(stored);
    check(render(json("noritsu-ls600", true)) == first, "cold restore actually reuses stored densities instead of exposing input again");
    check(std::filesystem::last_write_time(stored) == saved_time, "cold restore reads the existing file without replacing it");
    source = original;
    input.data = source.data();
    for(auto mode: {"digital", "auto-levels", "lab-scan", "negative"}) {
        auto reference = render(json(mode, false));
        check(render(json(mode, true)) == reference, "all receivers consume the same saved negative without regression");
        check(render(json(mode, true), true) == reference, "equal-resolution preview and export agree");
    }
    check(countFiles() == 1, "changing scanner and negative view does not duplicate film data");
    { std::ofstream corrupt(stored, std::ios::binary | std::ios::trunc); corrupt << "broken"; }
    check(render(json("noritsu-ls600", true)) == plain, "truncated density file is reconstructed from source");
    { std::fstream corrupt(stored, std::ios::binary | std::ios::in | std::ios::out); corrupt.seekp(30); char byte=0x7f; corrupt.write(&byte,1); }
    check(render(json("noritsu-ls600", true)) == plain, "checksum rejects corrupted densities and reconstructs them");
    std::fill(source.begin(), source.end(), .001f);
    check(render(json("noritsu-ls600", true)) != plain, "same-sized ROI or changed provider pixels cannot reuse another image's densities");
    check(countFiles() == 2, "different source pixels have separate identities even at the same URI");
    source = original; input.data = source.data();
    p.film_format_mm=24;
    render(json("noritsu-ls600", true));
    check(countFiles() == 3, "ROI physical scale has a distinct density identity");
    p.film_format_mm=35;
    auto real = std::string("{\"workflow\":\"negative-scan\",\"virtualNegative\":\"")+std::string(64,'b')+"\",\"outputModel\":{\"mode\":\"lab-scan\"}}";
    render(real);
    check(countFiles() == 3, "real-negative conversion cannot consume or replace virtual film data");
    p.grain_active=1;
    const auto grained = render(json("noritsu-ls600", true));
    check(render(json("noritsu-ls600", true)) == grained, "stored grain remains fixed across scanner edits and repeated renders");
    check(countFiles() == 4, "grain quality gates cannot reuse an ungrained draft");
    p.film_profile="kodak_portra_800";
    render(json("noritsu-ls600", true));
    check(countFiles() == 5, "candidate film overrides cannot borrow the active film's saved densities");
    auto invalid = std::string("{\"virtualNegative\":\"../../etc/passwd\",\"outputModel\":{\"mode\":\"lab-scan\"}}");
    p.experimental_json=invalid.c_str(); spk_image output{};
    check(spk_simulate(engine,&input,&p,&output) == SPK_ERR_BAD_ARGS && output.data == nullptr, "untrusted paths are rejected");
    std::cout << "PASS virtual-negative storage and rendering\n";
    return 0;
} catch(const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
