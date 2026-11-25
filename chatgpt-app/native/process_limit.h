/* GPLv3. Only lower resource limits; never raise a host sandbox's existing limit. */
#pragma once
#include <algorithm>
#include <sys/resource.h>
inline bool lower_address_space_limit(rlim_t desired) {
    rlimit existing{};
    if(getrlimit(RLIMIT_AS,&existing)!=0)return false;
    rlimit next{std::min(existing.rlim_cur,desired),std::min(existing.rlim_max,desired)};
    return setrlimit(RLIMIT_AS,&next)==0;
}
