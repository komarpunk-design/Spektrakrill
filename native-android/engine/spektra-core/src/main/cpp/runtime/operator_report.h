/* GPLv3. Bounded process diagnostics, keyed by the app's actual publication outcome. */
#pragma once
#include <deque>
#include <mutex>
#include <string>
#include <cstdint>
namespace spk {
class OperatorReports {
    struct Entry { uint64_t id; std::string text; };
    mutable std::mutex mutex_;
    std::deque<Entry> pending_;
    Entry consumed_{0,{}};
public:
    void capture(uint64_t id, const char* kind, const char* operators) noexcept {
        if(!id||!kind||!operators)return;
        try {
            std::string text="{\"schema\":\"spk.operator_report.v1\",\"render_id\":"+std::to_string(id)+
                ",\"kind\":\""+kind+"\",\"native\":"+operators+"}";
            if(text.size()>16384)return;
            std::lock_guard<std::mutex> guard(mutex_);
            for(auto& entry:pending_)if(entry.id==id){entry.text=std::move(text);return;}
            pending_.push_back({id,std::move(text)});
            while(pending_.size()>12)pending_.pop_front();
        } catch(...) {} // diagnostics cannot prevent a render from publishing
    }
    void outcome(uint64_t id, bool consumed) noexcept {
        try {
            std::lock_guard<std::mutex> guard(mutex_);
            for(auto it=pending_.begin();it!=pending_.end();++it)if(it->id==id){
                if(consumed)consumed_=*it;
                else if(consumed_.id==id)consumed_={0,{}};
                pending_.erase(it);return;
            }
        } catch(...) {}
    }
    std::string latest() const {
        std::lock_guard<std::mutex> guard(mutex_);return consumed_.text;
    }
};
inline OperatorReports& operator_reports(){static OperatorReports reports;return reports;}
}
