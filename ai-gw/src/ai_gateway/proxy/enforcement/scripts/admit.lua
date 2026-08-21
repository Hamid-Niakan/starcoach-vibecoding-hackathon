local marker = redis.call('GET', KEYS[1])
if not marker then return {0, 'state_unavailable', 1} end
if marker ~= ARGV[1] then return {0, 'state_inconsistent', 1} end
if redis.call('EXISTS', KEYS[2]) == 1 then return {0, 'state_inconsistent', 1} end

local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1])
local prefix = ARGV[2]
local client = ARGV[3]
local reservation_id = ARGV[4]
local reserve = tonumber(ARGV[5])
local lease_seconds = tonumber(ARGV[6])
local client_quota_window = tonumber(ARGV[11])
local global_quota_window = tonumber(ARGV[16])
local minute = math.floor(now / 60)
local client_quota_id = math.floor(now / client_quota_window)
local global_quota_id = math.floor(now / global_quota_window)

local crpm = prefix .. ':client:' .. client .. ':rpm:' .. minute
local ctpm = prefix .. ':client:' .. client .. ':tpm:' .. minute
local cquota = prefix .. ':client:' .. client .. ':quota:' .. client_quota_id
local cconc = prefix .. ':client:' .. client .. ':concurrency'
local grpm = prefix .. ':global:rpm:' .. minute
local gtpm = prefix .. ':global:tpm:' .. minute
local gquota = prefix .. ':global:quota:' .. global_quota_id
local gconc = prefix .. ':global:concurrency'
local reservation = prefix .. ':reservation:' .. reservation_id
local reserve_cost = tonumber(ARGV[17])
local daily_cost_limit = tonumber(ARGV[18])
local day = math.floor(now / 86400)
local daily_cost = prefix .. ':global:cost:' .. day

redis.call('ZREMRANGEBYSCORE', cconc, '-inf', now)
redis.call('ZREMRANGEBYSCORE', gconc, '-inf', now)

local checks = {
  {crpm, 1, tonumber(ARGV[7]), 'client_rpm', 60 - (now % 60)},
  {ctpm, reserve, tonumber(ARGV[8]), 'client_tpm', 60 - (now % 60)},
  {cquota, reserve, tonumber(ARGV[10]), 'client_quota', client_quota_window - (now % client_quota_window)},
  {grpm, 1, tonumber(ARGV[12]), 'global_rpm', 60 - (now % 60)},
  {gtpm, reserve, tonumber(ARGV[13]), 'global_tpm', 60 - (now % 60)},
  {gquota, reserve, tonumber(ARGV[15]), 'global_quota', global_quota_window - (now % global_quota_window)}
}
for _, check in ipairs(checks) do
  if tonumber(redis.call('GET', check[1]) or '0') + check[2] > check[3] then
    return {0, check[4], check[5]}
  end
end
if redis.call('ZCARD', cconc) >= tonumber(ARGV[9]) then return {0, 'client_concurrency', 1} end
if redis.call('ZCARD', gconc) >= tonumber(ARGV[14]) then return {0, 'global_concurrency', 1} end
if tonumber(redis.call('GET', daily_cost) or '0') + reserve_cost > daily_cost_limit then
  return {0, 'global_cost', 86400 - (now % 86400)}
end

for _, check in ipairs(checks) do
  redis.call('INCRBY', check[1], check[2])
  redis.call('EXPIRE', check[1], check[5] + lease_seconds)
end
redis.call('ZADD', cconc, now + lease_seconds, reservation_id)
redis.call('ZADD', gconc, now + lease_seconds, reservation_id)
redis.call('EXPIRE', cconc, lease_seconds * 2)
redis.call('EXPIRE', gconc, lease_seconds * 2)
redis.call('INCRBY', daily_cost, reserve_cost)
redis.call('EXPIRE', daily_cost, 86400 - (now % 86400) + lease_seconds)
redis.call('HSET', reservation, 'state', 'open', 'reserved', reserve, 'reserved_cost', reserve_cost, 'cost_key', daily_cost, 'ctpm', ctpm, 'cquota', cquota, 'gtpm', gtpm, 'gquota', gquota, 'cconc', cconc, 'gconc', gconc)
redis.call('EXPIRE', reservation, math.max(client_quota_window, global_quota_window) + lease_seconds)
return {1, 'allowed', 0}
