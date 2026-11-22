/* GPL-3.0. Stage reuse must preserve cold-render pixels and live controls. */
#include "spektra.h"
#include "runtime/lab_dependencies.h"
#include <cmath>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

uint64_t spk_test_film_cache_hits(spk_engine*);
uint64_t spk_test_film_cache_misses(spk_engine*);
uint64_t spk_test_scan_film_cache_hits(spk_engine*);
uint64_t spk_test_scan_film_cache_misses(spk_engine*);
uint64_t spk_test_pregrain_cache_hits(spk_engine*, int);
uint64_t spk_test_pregrain_cache_misses(spk_engine*, int);
uint64_t spk_test_print_density_cache_hits(spk_engine*);
uint64_t spk_test_print_density_cache_misses(spk_engine*);

static void check(bool ok, const std::string& message) {
    if (!ok) throw std::runtime_error(message);
    std::cout << "PASS " << message << '\n';
}
int main(int argc, char** argv) try {
    if (argc != 2) return 2;
    constexpr int w = 96, h = 80;
    std::vector<float> pixels(w * h * 3);
    for (size_t i = 0; i < pixels.size(); ++i) pixels[i] = .003 + .8 * std::pow(double((i * 1879) % 65521) / 65521, 2);
    spk_image input{pixels.data(), w, h, SPK_CS_PROPHOTO};
    const std::string base = R"("spectralMethod":"arctic2026beta04","grainRms":true,"dirLangmuir":true)";
    auto recipe = [&](const std::string& extra, bool scan) {
        return "{" + base + (extra.empty() ? "" : "," + extra) +
            (scan ? R"(,"outputModel":{"mode":"nikon-scan","autoSetup":false}})" : R"(,"outputModel":{"mode":"paper"}})");
    };
    int comparisons = 0;
    for (bool scan : {false, true}) for (bool grain : {false, true}) for (bool fast_quality : {false, true}) {
        spk_engine* engine = nullptr;
        check(spk_engine_create(argv[1], &engine) == SPK_OK, "engine created");
        struct Owner { spk_engine* p; ~Owner() { spk_engine_destroy(p); } } owner{engine};
        spk_params p{}; spk_default_params(&p);
        p.film_profile = "kodak_portra_400"; p.print_profile = "kodak_portra_endura";
        p.scan_film = scan; p.grain_active = grain; p.auto_exposure = 0;
        p.halation_active = p.glare_active = p.print_glare_active = 0;
        p.preview_max_size = 128; p.scanner_unsharp[1] = 0;
        p.gpu_export = fast_quality;
        std::string json = recipe("", scan);
        auto hits = [&] { return grain ? spk_test_pregrain_cache_hits(engine, scan) :
            scan ? spk_test_scan_film_cache_hits(engine) : spk_test_film_cache_hits(engine); };
        auto misses = [&] { return grain ? spk_test_pregrain_cache_misses(engine, scan) :
            scan ? spk_test_scan_film_cache_misses(engine) : spk_test_film_cache_misses(engine); };
        auto render = [&](bool cold) {
            p.experimental_json = json.c_str();
            auto params = p;
            // Disable every image memo for the independent reference.
            params.disable_buffer_memos = cold;
            spk_image out{};
            const auto status = cold ? spk_simulate(engine, &input, &params, &out) : spk_simulate_preview(engine, &input, &params, &out);
            if (status != SPK_OK)
                throw std::runtime_error(std::string("render: ") + spk_last_error_message());
            std::vector<float> result(out.data, out.data + out.width * out.height * 3);
            spk_image_free(&out); return result;
        };
        auto assert_cold = [&] {
            const auto warm = render(false), cold = render(true);
            check(warm == cold, "warm/cold exact, scan=" + std::to_string(scan) + " grain=" + std::to_string(grain));
            ++comparisons; return warm;
        };
        const auto original = assert_cold();
        const auto first_hits = hits(); assert_cold();
        check(hits() > first_hits, "unchanged frame reuses deterministic density");
        auto before = hits();
        json = recipe(R"("noritsuJobId":"ls600-g0t1-neutral-v1")", scan);
        assert_cold(); check(hits() > before, "receiver job does not invalidate filming");
        before = hits();
        // Actual output-only parameters: JSON scanner EV on scan, C-API scanner
        // optics on paper. Neither may change the cached pre-scanner density.
        if (scan) json = "{" + base + R"(,"outputModel":{"mode":"nikon-scan","autoSetup":false,"exposure":0.6}})";
        else p.scanner_lens_blur = .7f;
        const auto edited = assert_cold();
        check(hits() > before && edited != original, "live scanner edit reuses filming and changes output");
        if (!scan) {
            const auto pd = spk_test_print_density_cache_hits(engine);
            p.output_color_space = SPK_CS_ADOBE_RGB; assert_cold();
            check(spk_test_print_density_cache_hits(engine) > pd, "output edit reuses printing with grain on or off");
            before = hits();
            const auto printing_misses = spk_test_print_density_cache_misses(engine);
            json = recipe(R"("printChemistry":true,"printGamma":1.2)", scan);
            assert_cold();
            check(hits() > before && spk_test_print_density_cache_misses(engine) > printing_misses,
                  "paper chemistry reuses film and rebuilds printing");
        }
        if (grain) {
            const auto before_blur = render(false);
            before = hits(); p.grain_blur += .25f;
            const auto shifted = assert_cold();
            check(hits() > before && shifted != before_blur, "grain blur is applied after cached density");
            before = hits();
            json.insert(json.size() - 1, R"(,"grainRmsRed":14,"grainUsmAmount":0.7)");
            check(assert_cold() != shifted && hits() > before, "RMS controls remain live without rebuilding film");
        }
        auto check_miss = [&](const std::string& label) {
            const auto n = misses(); assert_cold();
            check(misses() > n, label + " invalidates deterministic density");
        };
        p.exposure_compensation_ev += .3f; check_miss("camera exposure");
        p.density_curve_gamma = 1.2f; check_miss("film gamma");
        json = recipe(R"("filmChemistry":true,"filmRed":1.1)", scan); check_miss("film chemistry");
        json = recipe(R"("negsPrep":{"exposure":0.2})", scan); check_miss("Negs Prep");
        json = recipe(R"("dirDonorRed":1.4)", scan); check_miss("Langmuir");
        json = recipe(R"("layeredTransport":{"model":"layered","antiHalation":0.6})", scan); check_miss("Layered Transport");
        pixels[27] += .01f; check_miss("source pixel");
        // The preview scope must not leak, even when cancelled: a subsequent
        // actual Fast export still bypasses all image memos.
        spk_image cancelled{};
        if (spk_simulate_preview_cancellable(engine, &input, &p, &cancelled, [](void*) { return 1; }, nullptr) != SPK_ERR_CANCELLED)
            throw std::runtime_error("preview cancellation");
        const auto old_hits = hits(), old_misses = misses();
        p.gpu_export = 1; p.experimental_json = json.c_str(); spk_image exported{};
        if (spk_simulate(engine, &input, &p, &exported) != SPK_OK) throw std::runtime_error("export after preview");
        spk_image_free(&exported);
        check(old_hits == hits() && old_misses == misses(), "Fast export remains one-shot after completed/cancelled preview");
    }
    using spk::lab_dependencies::key;
    check(key(R"({"scanExposure":0})", false) != key(R"({"scanExposure":1})", false), "real negative scan exposure remains a density dependency");
    check(key(R"({"scanCalibration":"1 0 0 0 1 0 0 0 1"})", false) != key(R"({"scanCalibration":"2 0 0 0 1 0 0 0 1"})", false), "real negative calibration remains a dependency");
    check(key(R"({"futureFeature":1})", false) != key(R"({"futureFeature":2})", false), "unknown fields conservatively invalidate");
    check(key(R"({"spectralMethod":"arctic2026beta04","dirLangmuir":true})", false) == key(R"({ "dirLangmuir":true, "spectralMethod":"arctic2026beta04" })", false), "JSON order/whitespace do not invalidate");
    std::cout << "PASS " << comparisons << " exact warm/cold comparisons\n";
} catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
