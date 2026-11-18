/* GPLv3. Bounded Lab envelope; only an explicit job object permits large tables. */
#pragma once
#include "profiles/json_min.h"
#include <cstring>
namespace spk {
inline json::ValuePtr parse_lab_json(const char* text){
 const size_t size=std::strlen(text);
 if(size>512u*1024u)throw std::runtime_error("experimental parameters exceed 512 KiB");
 auto root=json::parse(text);
 if(size>16384&&(!root->is_object()||!root->has("noritsuJob")||!root->at("noritsuJob").is_object()))throw std::runtime_error("large experimental parameters require a Noritsu job bundle");
 return root;
}
}
