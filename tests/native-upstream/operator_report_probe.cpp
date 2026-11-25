#include "runtime/operator_report.h"
#include <future>
#include <vector>
#include <iostream>
#include <stdexcept>
void check(bool ok){if(!ok)throw std::runtime_error("operator publication invariant");}
int main()try{
 spk::OperatorReports report;
 report.capture(1,"preview_final","{}");check(report.latest().empty());report.outcome(1,true);
 auto first=report.latest();check(first.find("preview_final")!=std::string::npos);
 report.capture(2,"draft","{}");report.outcome(2,false);check(first==report.latest());
 for(int i=3;i<40;i++)report.capture(i,"draft","{}");
 report.outcome(3,true);check(first==report.latest()); // bounded pending history
 report.outcome(39,true);check(report.latest().find("\"render_id\":39")!=std::string::npos);
 std::vector<std::future<void>> workers;
 for(int t=0;t<4;t++)workers.push_back(std::async(std::launch::async,[&,t]{for(int i=0;i<32;i++){
  report.capture(100+t*32+i,"export","{}");report.outcome(100+t*32+i,true);check(!report.latest().empty());
 }}));
 for(auto& worker:workers)worker.get();
 std::cout<<"PASS app-consumed operator diagnostics, cancelled isolation, bounded history and concurrency\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
