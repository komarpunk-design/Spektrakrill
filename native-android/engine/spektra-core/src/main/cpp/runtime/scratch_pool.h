/* GPLv3. Exclusive scratch leases; bounded idle retention and budget-triggered reclamation. */
#pragma once
#include "runtime/memory_budget.h"
#include <algorithm>
#include <array>
#include <memory>
#include <mutex>
#include <limits>
#include <new>
#include <type_traits>

namespace spk {
template<class T> class ScratchPool {
    static_assert(std::is_trivial<T>::value, "scratch values must be trivial");
    struct Block {
        memory::MemoryReservation reservation;
        std::unique_ptr<T[]> values;
        size_t capacity = 0;
        Block() = default;
        Block(Block&&) = default;
        Block& operator=(Block&& other) noexcept {
            if (this != &other) {
                values.reset(); reservation.reset();
                reservation=std::move(other.reservation); values=std::move(other.values);
                capacity=other.capacity; other.capacity=0;
            }
            return *this;
        }
    };
    std::mutex mutex_;
    // Fixed storage keeps the destructor/return path allocation-free.
    std::array<Block, 8> idle_;
    size_t idle_bytes_ = 0;
    bool registered_ = false;
    ScratchPool() {
        registered_ = memory::process_memory_budget().add_scratch_reclaimer(&reclaim);
    }
    static ScratchPool& instance() { static ScratchPool pool; return pool; }
    static bool reclaim() noexcept { return instance().trim(); }
    static size_t idle_limit() noexcept {
        return size_t(std::min<std::uint64_t>(32ULL << 20,
            memory::process_memory_budget().limit_bytes() / 32));
    }
    void put(Block block) noexcept {
        if (!block.values) return;
        const size_t bytes = block.capacity * sizeof(T);
        const size_t limit = idle_limit();
        if (!registered_ || bytes > limit) return;
        std::lock_guard<std::mutex> guard(mutex_);
        // Release idle slots in a fixed order when the memory ceiling shrinks.
        for (auto& entry : idle_) {
            if (idle_bytes_ + bytes <= limit) break;
            idle_bytes_ -= entry.capacity * sizeof(T);
            entry = Block{};
        }
        for (auto& entry : idle_) {
            if (!entry.values) { entry = std::move(block); idle_bytes_ += bytes; return; }
        }
        idle_bytes_ -= idle_[0].capacity * sizeof(T);
        idle_[0] = std::move(block); idle_bytes_ += bytes;
    }
public:
    class Lease {
        ScratchPool* pool_ = nullptr;
        Block block_;
        size_t count_ = 0;
        friend class ScratchPool;
        Lease(ScratchPool* pool, Block block, size_t count)
            : pool_(pool), block_(std::move(block)), count_(count) {}
    public:
        Lease() = default;
        Lease(const Lease&) = delete;
        Lease& operator=(const Lease&) = delete;
        Lease(Lease&& other) noexcept : pool_(other.pool_), block_(std::move(other.block_)), count_(other.count_) {
            other.pool_ = nullptr; other.count_ = 0;
        }
        Lease& operator=(Lease&& other) noexcept {
            if (this != &other) { reset(); pool_=other.pool_; block_=std::move(other.block_);
                count_=other.count_; other.pool_=nullptr; other.count_=0; }
            return *this;
        }
        ~Lease() { reset(); }
        void reset() noexcept {
            if (pool_) pool_->put(std::move(block_));
            pool_=nullptr; count_=0;
        }
        T* data() noexcept { return block_.values.get(); }
        const T* data() const noexcept { return block_.values.get(); }
        T& operator[](size_t i) noexcept { return data()[i]; }
        const T& operator[](size_t i) const noexcept { return data()[i]; }
        size_t size() const noexcept { return count_; }
    };

    static Lease acquire(size_t count, bool zero = false) {
        if (!count) return {};
        if (count > std::numeric_limits<size_t>::max()/sizeof(T)) throw std::bad_alloc();
        auto& pool = instance(); Block block;
        {
            std::lock_guard<std::mutex> guard(pool.mutex_);
            Block* best = nullptr;
            for (auto& entry : pool.idle_) {
                if (entry.capacity >= count && entry.capacity - count <= count &&
                    (!best || entry.capacity < best->capacity)) best = &entry;
            }
            if (best) {
                pool.idle_bytes_ -= best->capacity * sizeof(T);
                block = std::move(*best); *best = Block{};
            }
        }
        if (!block.values) {
            block.reservation = memory::process_memory_budget().try_reserve(count*sizeof(T),
                memory::MemoryDomain::NativeScratch, memory::MemoryStage::Spatial);
            if (!block.reservation) throw std::bad_alloc();
            block.values.reset(new T[count]); block.capacity=count;
        }
        if (zero) std::fill_n(block.values.get(), count, T{});
        return Lease(&pool, std::move(block), count);
    }
    bool trim() noexcept {
        std::unique_lock<std::mutex> guard(mutex_, std::try_to_lock);
        if (!guard.owns_lock()) return false;
        const bool freed = idle_bytes_ != 0;
        for (auto& entry : idle_) entry = Block{};
        idle_bytes_=0;
        return freed;
    }
};
}
