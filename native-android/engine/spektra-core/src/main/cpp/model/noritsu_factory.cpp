/* Built-in reference job transport; no Windows/OEM executable in the app. GPLv3. */
#include "model/noritsu_advanced.h"
#include "model/noritsu_factory_data.h"
#include <stdexcept>
namespace spk::noritsu::advanced {
std::shared_ptr<const Job> builtin_job(const std::string& id) {
    if(id != factory_data::id)throw std::invalid_argument("Noritsu: unknown builtin profile");
    static const auto job = read_job(*json::parse(factory_data::json));
    return job;
}
}
