/* GPLv3. Concurrent preparation, eviction and failure recovery. */
#include "runtime/prepared_cache.h"
#include <atomic>
#include <condition_variable>
#include <future>
#include <iostream>
#include <thread>
int main() try {
 spk::PreparedCache<int,int> cache(2);std::atomic<int> builds{0};
 auto get=[&](int key){return cache.get(key,[&]{++builds;return std::make_shared<int>(key);});};
 auto a=get(1),b=get(2);if(get(1)!=a)throw std::runtime_error("cache miss");
 get(3);if(get(1)!=a)throw std::runtime_error("evicted recent entry");
 if(get(2)==b)throw std::runtime_error("did not evict LRU entry");
 std::promise<void> started,release;auto gate=release.get_future().share();
 const int before=builds;
 auto build=[&]{++builds;started.set_value();gate.wait();return std::make_shared<int>(7);};
 auto first=std::async(std::launch::async,[&]{return cache.get(7,build);});started.get_future().wait();
 auto second=std::async(std::launch::async,[&]{return cache.get(7,[&]{++builds;return std::make_shared<int>(9);});});
 release.set_value();if(first.get()!=second.get()||builds!=before+1)throw std::runtime_error("duplicate concurrent build");
 try{cache.get(8,[]{throw std::runtime_error("expected");return std::shared_ptr<int>();});throw std::logic_error("accepted failure");}catch(const std::runtime_error&){}
 if(*get(8)!=8)throw std::runtime_error("poisoned failed entry");
 std::cout<<"PASS prepared LRU, concurrent single-flight and retry after failure\n";
} catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
