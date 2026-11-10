/* GPLv3. Experimental profile preparation, ported from Andrea Volpato's
 * spektrafilm experimental @28bf883 (morph_curves.py / develop.py).
 * Source and validation details: docs/EXPERIMENTAL_PARITY.md. */
#pragma once
#include "profiles/profile.h"
#include "model/grain.h"
#include "model/couplers.h"
#include "io/npy_lut.h"
namespace spk {
struct FilmingParams;
void select_experimental_spectral_method(Profile&, const std::string& id);
void configure_experimental_projection(FilmingParams&, const Profile&);
NdArray build_experimental_tc_lut(const Profile&, const NdArray&, const double* illuminant, float blur, bool window, bool surface, const float* uv, const float* ir);
void configure_experimental_couplers(DirCouplersParams&, const char* json, const Profile* profile=nullptr);
void configure_experimental_grain(GrainParams&, const Profile&, const char* json);
void finish_experimental_grain(float*, int width, int height, const GrainParams&, double blur);
void prepare_experimental_profile(Profile&, const char* json, bool film, double gamma);
bool experimental_film_chemistry(const char* json);
bool experimental_print_chemistry(const char* json);
}
