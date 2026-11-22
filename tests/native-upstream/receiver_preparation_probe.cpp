/* GPL-3.0. Exact, bounded preparation must follow profile bytes and live knees. */
#include "model/nikon_virtual_calibration.h"
#include "model/gamut_compression.h"
#include <iostream>
#include <stdexcept>
int main(int argc, char** argv) try {
    if (argc != 2) return 2;
    auto f = spk::load_profile_file(std::string(argv[1]) + "/profiles/kodak_portra_400.json");
    const double centers[] = {630, 545, 465}, widths[] = {8.5, 14, 9.5};
    auto first = spk::outputs::prepare_nikon_virtual_calibration(f, centers, widths);
    auto builds = spk::outputs::nikon_virtual_calibration_builds();
    if (spk::outputs::prepare_nikon_virtual_calibration(f, centers, widths) != first ||
        spk::outputs::nikon_virtual_calibration_builds() != builds) throw std::runtime_error("Nikon does not reuse immutable preparation");
    f.base_density[31] += .01;
    auto edited = spk::outputs::prepare_nikon_virtual_calibration(f, centers, widths);
    if (edited == first || spk::outputs::nikon_virtual_calibration_builds() <= builds) throw std::runtime_error("Nikon reused stale profile bytes");
    for (int model = 3; model <= 6; ++model) {
        spk::PreparedOutputGamut base(spk::OutputGamutCompress(model), 0, 0, 1, 6);
        const auto n = spk::prepared_output_gamut_table_builds();
        spk::PreparedOutputGamut knee(spk::OutputGamutCompress(model), 0, .2, .95, 3);
        if (spk::prepared_output_gamut_table_builds() != n) throw std::runtime_error("slider rebuilt immutable gamut geometry");
        double expected[] = {1.7, -.2, .3}, actual[] = {1.7, -.2, .3};
        switch (model) {
        case 3: spk::compress_rgb_oklch_chroma(expected, 1, 0, .2, .95, 3); break;
        case 4: spk::compress_rgb_oklrab_chroma(expected, 1, 0, .2, .95, 3); break;
        case 5: spk::compress_rgb_jzazbz_chroma(expected, 1, 0, .2, .95, 3); break;
        case 6: spk::compress_rgb_cam16ucs_chroma(expected, 1, 0, .2, .95, 3); break;
        }
        knee.apply(actual, 1);
        for (int c = 0; c < 3; ++c) if (actual[c] != expected[c]) throw std::runtime_error("cached gamut knee changed exact math");
        std::cout << "PASS live gamut knee, cached geometry model=" << model << '\n';
    }
    std::cout << "PASS Nikon profile identity, preparation reuse and gamut exactness\n";
} catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
