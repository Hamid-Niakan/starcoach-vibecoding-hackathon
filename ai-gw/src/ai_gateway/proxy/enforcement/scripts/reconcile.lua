if redis.call('EXISTS', KEYS[1]) == 0 then return {'missing'} end
if redis.call('HGET', KEYS[1], 'state') == 'finalized' then return {'duplicate'} end
local reserved = tonumber(redis.call('HGET', KEYS[1], 'reserved'))
local actual = tonumber(ARGV[1])
local delta = actual - reserved
local reserved_cost = tonumber(redis.call('HGET', KEYS[1], 'reserved_cost') or '0')
local actual_cost = tonumber(ARGV[4] or reserved_cost)
local cost_delta = actual_cost - reserved_cost
if delta > 0 then redis.call('SET', KEYS[2], 'reservation_underestimated') end
if delta ~= 0 then
  for _, field in ipairs({'ctpm', 'cquota', 'gtpm', 'gquota'}) do
    local key = redis.call('HGET', KEYS[1], field)
    if key and redis.call('EXISTS', key) == 1 then redis.call('INCRBY', key, delta) end
  end
end
if cost_delta ~= 0 then
  local cost_key = redis.call('HGET', KEYS[1], 'cost_key')
  if cost_key and redis.call('EXISTS', cost_key) == 1 then redis.call('INCRBY', cost_key, cost_delta) end
end
local reservation_id = ARGV[2]
redis.call('ZREM', redis.call('HGET', KEYS[1], 'cconc'), reservation_id)
redis.call('ZREM', redis.call('HGET', KEYS[1], 'gconc'), reservation_id)
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'state', 'finalized')
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return {'actual'}
