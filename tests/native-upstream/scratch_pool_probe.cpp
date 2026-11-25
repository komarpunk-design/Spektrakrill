#include "runtime/scratch_pool.h"
#include <future>
#include <iostream>
#include <vector>
#include <stdexcept>
static void check(bool ok) { if(!ok) throw std::runtime_error("scratch pool invariant"); }
int main() try {
 using namespace spk; using namespace spk::memory;
 auto& budget=process_memory_budget(); const auto oldLimit=budget.limit_bytes();
 budget.set_limit_bytes(8ULL<<20);
 auto a=ScratchPool<float>::acquire(16*1024,true);auto* first=a.data();
 for(size_t i=0;i<a.size();++i)check(a[i]==0);
 a[0]=3.f;a.reset();
 auto b=ScratchPool<float>::acquire(16*1024);check(b.data()==first&&b[0]==3.f);
 auto c=ScratchPool<float>::acquire(16*1024);check(c.data()!=b.data());
 b.reset();c.reset();
 auto zero=ScratchPool<float>::acquire(16*1024,true);check(zero[0]==0);zero.reset();
 auto moved=ScratchPool<double>::acquire(1024);moved[0]=7;
 auto destination=std::move(moved);check(!moved.data()&&moved.size()==0&&destination[0]==7);destination.reset();
 check(budget.snapshot().total.current_bytes>0);
 // Budget denial must reclaim idle leases even when the GPU has its own callback.
 budget.set_reclaimer(+[]()noexcept->bool{return false;});
 auto demand=budget.try_reserve(8ULL<<20,MemoryDomain::NativeImage,MemoryStage::Decode);
 check(bool(demand));demand.reset();check(budget.snapshot().total.current_bytes==0);
 std::vector<std::future<void>> workers;
 for(int t=0;t<4;t++)workers.push_back(std::async(std::launch::async,[t]{
  for(int k=0;k<32;k++){auto x=ScratchPool<float>::acquire(4096);std::fill_n(x.data(),x.size(),float(t));
   for(size_t i=0;i<x.size();i++)check(x[i]==float(t));}
 }));
 for(auto& worker:workers)worker.get();
 budget.release_idle_scratch();check(budget.snapshot().total.current_bytes==0);
 auto live=ScratchPool<float>::acquire(8192);live[0]=9;
 budget.release_idle_scratch();check(live[0]==9&&budget.snapshot().total.current_bytes==8192*4);
 budget.set_limit_bytes(128);live.reset();check(budget.snapshot().total.current_bytes==0);
 try{auto impossible=ScratchPool<float>::acquire(4096);throw std::logic_error("budget admission ignored");}catch(const std::bad_alloc&){}
 check(budget.snapshot().total.current_bytes==0);budget.set_limit_bytes(oldLimit);
 std::cout<<"PASS scratch ownership, reuse, zeroing, concurrent leases, pressure and trim\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
