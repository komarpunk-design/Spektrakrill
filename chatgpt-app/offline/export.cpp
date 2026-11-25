/* GPLv3. Reuses the app's PNG/TIFF writers and its pinned libjpeg-turbo. */
#include "png_writer.h"
#include "tiff_writer.h"
#include "profiles/json_min.h"
#include "../native/process_limit.h"
#include <cstdio>
#include <jpeglib.h>
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

std::vector<uint8_t> read_bytes(const std::string& path,size_t limit) {
    std::ifstream file(path,std::ios::binary|std::ios::ate);
    if(!file)throw std::runtime_error("Cannot read "+path);
    const auto size=file.tellg();
    if(size<0||static_cast<uint64_t>(size)>limit)throw std::runtime_error("File size exceeds export contract");
    std::vector<uint8_t> bytes(static_cast<size_t>(size));file.seekg(0);
    if(!file.read(reinterpret_cast<char*>(bytes.data()),bytes.size()))throw std::runtime_error("Incomplete export input");
    return bytes;
}
struct JpegError { jpeg_error_mgr manager; char message[JMSG_LENGTH_MAX]{}; };
void jpeg_failure(j_common_ptr info) {
    auto* error=reinterpret_cast<JpegError*>(info->err);
    (*info->err->format_message)(info,error->message);
    throw std::runtime_error(error->message);
}
void jpeg(const std::string& path,const std::vector<float>& pixels,int w,int h,const std::vector<uint8_t>& icc) {
    std::unique_ptr<FILE,decltype(&std::fclose)> file(std::fopen(path.c_str(),"wb"),&std::fclose);
    if(!file)throw std::runtime_error("Cannot open JPEG output");
    jpeg_compress_struct info{};JpegError error;
    info.err=jpeg_std_error(&error.manager);error.manager.error_exit=jpeg_failure;
    jpeg_create_compress(&info);
    try {
        jpeg_stdio_dest(&info,file.get());info.image_width=w;info.image_height=h;
        info.input_components=3;info.in_color_space=JCS_RGB;jpeg_set_defaults(&info);
        for(int c=0;c<3;++c)info.comp_info[c].h_samp_factor=info.comp_info[c].v_samp_factor=1;
        jpeg_set_quality(&info,95,TRUE);jpeg_start_compress(&info,TRUE);
        jpeg_write_icc_profile(&info,icc.data(),static_cast<unsigned int>(icc.size()));
        std::vector<uint8_t> row(size_t(w)*3);
        while(info.next_scanline<info.image_height) {
            const size_t start=size_t(info.next_scanline)*w*3;
            for(size_t i=0;i<row.size();++i)row[i]=static_cast<uint8_t>(std::lround(std::clamp(pixels[start+i],0.f,1.f)*255.f));
            JSAMPROW pointer=row.data();jpeg_write_scanlines(&info,&pointer,1);
        }
        jpeg_finish_compress(&info);jpeg_destroy_compress(&info);
    }catch(...){jpeg_destroy_compress(&info);throw;}
    if(std::fflush(file.get())!=0||std::ferror(file.get()))throw std::runtime_error("JPEG write did not complete");
}
int main(int argc,char**argv)try {
    if(argc!=3)throw std::runtime_error("Usage: spektrafilm-export OUTPUT_DIR ASSETS");
    if(!lower_address_space_limit(1536ULL<<20))throw std::runtime_error("Cannot establish export memory limit");
    const std::string dir=argv[1],assets=argv[2];auto metadata=read_bytes(dir+"/render.json",65536);
    const std::string text(metadata.begin(),metadata.end());auto value=spk::json::parse(text);
    if(!value->is_object()||value->at("format").as_string()!="f32le-srgb")throw std::runtime_error("Unexpected render format");
    auto dimension=[&](const char* key){const auto& n=value->at(key);if(!n.is_number()||!std::isfinite(n.number)||n.number<1||n.number>32768||std::floor(n.number)!=n.number)throw std::runtime_error("Invalid render dimensions");return int(n.number);};
    const int w=dimension("width"),h=dimension("height");const size_t count=size_t(w)*h*3;
    if(size_t(w)*h>32ULL*1024*1024)throw std::runtime_error("Export exceeds 32 MiPixels");
    std::vector<float> pixels(count);
    std::ifstream input(dir+"/result.f32",std::ios::binary|std::ios::ate);
    if(!input||input.tellg()!=std::streamoff(count*sizeof(float)))throw std::runtime_error("Incomplete rendered pixels");
    input.seekg(0);input.read(reinterpret_cast<char*>(pixels.data()),count*sizeof(float));
    if(!input)throw std::runtime_error("Cannot read rendered pixels");
    for(float v:pixels)if(!std::isfinite(v))throw std::runtime_error("Nonfinite rendered pixels");
    const auto icc=read_bytes(assets+"/icc/saucecontrol/sRGB-v4.icc",1<<20);
    spectrafilm::PngMetadata png;png.iccProfile=icc;
    auto p=spectrafilm::writePngFloatToFile(pixels.data(),w,h,png,dir+"/result.png");
    if(!p.ok)throw std::runtime_error(p.error);
    spectrafilm::TiffMetadata tiff;tiff.iccProfile=icc;tiff.exifColorSpace=1;
    auto t=spectrafilm::writeTiffFloatToFile(pixels.data(),w,h,tiff,spectrafilm::TiffCompression::None,dir+"/result.tiff");
    if(!t.ok)throw std::runtime_error(t.error);
    jpeg(dir+"/result.jpg",pixels,w,h,icc);return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
