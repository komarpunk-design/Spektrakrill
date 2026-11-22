/* GPL-3.0. C-API-only fixtures, usable against the previous release library. */
#include "spektra.h"
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
int main(int argc, char** argv) try {
    if (argc != 4) return 2;
    const bool bench = std::string(argv[2]) == "--bench";
    const int w = bench ? 384 : 96, h = bench ? 256 : 80;
    std::vector<float> pixels(w * h * 3);
    for (size_t i = 0; i < pixels.size(); ++i) pixels[i] = .001 + .9 * std::pow(double((i * 1879) % 65521) / 65521, 2);
    spk_image input{pixels.data(), w, h, SPK_CS_PROPHOTO};
    spk_engine* e = nullptr;
    if (spk_engine_create(argv[1], &e) != SPK_OK) throw std::runtime_error("engine");
    struct Owner { spk_engine* e; ~Owner() { spk_engine_destroy(e); } } owner{e};
    std::ofstream output(argv[3], std::ios::binary);
    if (!output) throw std::runtime_error("output file");
    spk_params p{}; spk_default_params(&p);
    p.film_profile = "kodak_portra_400"; p.print_profile = "kodak_portra_endura";
    p.scan_film = 1; p.auto_exposure = 0; p.scanner_unsharp[1] = 0;
    p.preview_max_size = 512; p.glare_active = p.print_glare_active = 0;
    p.halation_active = bench;
    if (bench) p.gpu_export = p.gpu_preview = 1;
    int renders = 0;
    for (const char* film : (bench ? std::vector<const char*>{"kodak_portra_400"} :
         std::vector<const char*>{"kodak_portra_400", "kodak_gold_200", "negs_ilford_hp5_plus_6p5min"}))
    for (const char* mode : (bench ? std::vector<const char*>{"nikon-scan"} :
         std::vector<const char*>{"nikon-scan", "noritsu-ls600", "lab-scan"}))
    for (bool grain : (bench ? std::vector<bool>{true} : std::vector<bool>{false, true}))
    for (bool automatic : {false, true}) {
        p.film_profile = film; p.grain_active = grain;
        for (int edit = 0; edit < (bench ? 4 : 1); ++edit) {
            const auto json = std::string(R"({"spectralMethod":"arctic2026beta04","grainRms":true,"dirLangmuir":true,"layeredTransport":{"model":"layered"},"outputModel":{"mode":")") + mode +
                R"(","autoSetup":)" + (automatic ? "true" : "false") + R"(,"exposure":)" + std::to_string(edit * .15) + "}}";
            p.experimental_json = json.c_str(); spk_image out{};
            const auto start = std::chrono::steady_clock::now();
            const auto status = bench ? spk_simulate_preview(e, &input, &p, &out) : spk_simulate(e, &input, &p, &out);
            if (status != SPK_OK)
                throw std::runtime_error(std::string("render: ") + spk_last_error_message());
            const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
            const size_t size = size_t(out.width) * out.height * 3;
            for (size_t i = 0; i < size; ++i) if (!std::isfinite(out.data[i])) throw std::runtime_error("nonfinite output");
            output.write(reinterpret_cast<const char*>(out.data), size * sizeof(float));
            spk_image_free(&out); ++renders;
            if (bench) std::cout << "auto=" << automatic << " edit=" << edit << " ms=" << ms << '\n';
        }
    }
    if (!output) throw std::runtime_error("incomplete output write");
    std::cout << "PASS " << renders << " finite CPU renders\n";
} catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
