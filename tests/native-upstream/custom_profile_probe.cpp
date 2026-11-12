#include "spektra.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
int main(int argc,char**argv){
 if(argc!=3)return 2;
 std::filesystem::path assets=argv[1],dir=argv[2];std::filesystem::create_directories(dir);
 std::filesystem::copy_file(assets/"profiles/kodak_portra_400.json",dir/"user_test.json",std::filesystem::copy_options::overwrite_existing);
 spk_set_lab_profile_directory(dir.c_str());spk_engine*engine=nullptr;if(spk_engine_create(argv[1],&engine)!=SPK_OK)return 3;
 spk_params p{};p.film_profile="user_test";p.print_profile="kodak_portra_endura";spk_default_params(&p);p.grain_active=0;
 std::vector<float>data(48*32*3,.18f);spk_image in{data.data(),48,32,SPK_CS_PROPHOTO},out{};
 auto status=spk_simulate(engine,&in,&p,&out);bool ok=status==SPK_OK&&out.data&&out.width==48&&out.height==32;
 std::cout<<"status="<<status<<" size="<<out.width<<"x"<<out.height<<" error="<<spk_last_error_message()<<"\n";
 spk_image_free(&out);spk_engine_destroy(engine);spk_set_lab_profile_directory(nullptr);
 std::cout<<(ok?"PASS":"FAIL")<<" custom profile through production C API\n";return ok?0:1;
}
