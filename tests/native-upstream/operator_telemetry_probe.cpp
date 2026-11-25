/* GPLv3. Per-render operator telemetry must not inherit previous frame counters. */
#include "runtime/stage_timer.h"
#include "profiles/json_min.h"
#include <iostream>
int main() try {
 {spk::ScopedRenderTiming timing(spk::RTK_PREVIEW);
  spk::stage_timing_note_operator(spk::STG_HALATION,true,"",1.25,2.5,.75,true);
  spk::stage_timing_note_operator(spk::STG_SCAN,false,"driver\"fallback\n");
  spk::stage_timing_note_cache(spk::STG_GRAIN,true);timing.finish(0);}
 char text[8192];if(!spk::operator_timings_json_format(text,sizeof(text)))return 1;
 auto root=spk::json::parse(text);const auto& ops=root->at("operators").array;
 if(ops.size()!=3)return 2;
 if(ops[0]->at("gpu_passes").as_number()!=1||ops[0]->at("table_hits").as_number()!=1)return 3;
 if(ops[1]->at("backend").as_string()!="cache")return 4;
 if(ops[2]->at("reason").as_string()!="driver\"fallback\n")return 5;
 {spk::ScopedRenderTiming timing(spk::RTK_PREVIEW);timing.finish(0);}
 spk::operator_timings_json_format(text,sizeof(text));if(!spk::json::parse(text)->at("operators").array.empty())return 6;
 std::cout<<"PASS operator telemetry counters, escaping and frame isolation\n";
} catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
