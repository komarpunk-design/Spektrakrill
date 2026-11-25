/* GPLv3. Bounded LRU of immutable prepared models, with per-key single flight. */
#pragma once
#include <algorithm>
#include <future>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
namespace spk {
template<class Key,class Value> class PreparedCache {
    using Pointer=std::shared_ptr<const Value>;
    struct Entry { std::shared_future<Pointer> future; };
    size_t capacity_;
    std::mutex mutex_;
    std::map<Key,Entry> entries_;
    std::list<Key> ready_; // newest first; building entries never get evicted
public:
    explicit PreparedCache(size_t capacity):capacity_(capacity) {if(!capacity)throw std::invalid_argument("empty prepared cache");}
    template<class Build> Pointer get(const Key& key,Build build) {
        std::shared_future<Pointer> future;
        std::shared_ptr<std::promise<Pointer>> promise;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            auto found=entries_.find(key);
            if(found!=entries_.end()) {future=found->second.future;auto at=std::find(ready_.begin(),ready_.end(),key);if(at!=ready_.end())ready_.splice(ready_.begin(),ready_,at);}
            else {promise=std::make_shared<std::promise<Pointer>>();future=promise->get_future().share();entries_.emplace(key,Entry{future});}
        }
        if(!promise)return future.get();
        try {
            Pointer value=build();
            if(!value)throw std::runtime_error("null prepared model");
            {
                std::lock_guard<std::mutex> lock(mutex_);
                ready_.push_front(key);
                while(ready_.size()>capacity_){entries_.erase(ready_.back());ready_.pop_back();}
                promise->set_value(value);
            }
            return value;
        } catch(...) {
            const auto failure=std::current_exception();
            {std::lock_guard<std::mutex> lock(mutex_);entries_.erase(key);ready_.remove(key);promise->set_exception(failure);}
            std::rethrow_exception(failure);
        }
    }
};
}
