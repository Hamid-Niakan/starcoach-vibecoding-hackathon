if redis.call('EXISTS', KEYS[1]) == 0 then return {'missing'} end
if redis.call('HGET', KEYS[1], 'state') == 'finalized' then return {'duplicate'} end
local reserved = tonumber(redis.call('HGET', KEYS[1], 'reserved'))
local actual = tonumber(ARGV[1])
local delta = actual - reserved
if delta > 0 then redis.call('SET', KEYS[2], 'reservation_underestimated') end
if delta ~= 0 then
  for _, field in ipairs({'ctpm', 'cquota', 'gtpm', 'gquota'}) do
    local key = redis.call('HGET', KEYS[1], field)
    if key and redis.call('EXISTS', key) == 1 then redis.call('INCRBY', key, delta) end
  end
end
local reservation_id = ARGV[2]
redis.call('ZREM', redis.call('HGET', KEYS[1], 'cconc'), reservation_id)
redis.call('ZREM', redis.call('HGET', KEYS[1], 'gconc'), reservation_id)
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'state', 'finalized')
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return {'actual'}
