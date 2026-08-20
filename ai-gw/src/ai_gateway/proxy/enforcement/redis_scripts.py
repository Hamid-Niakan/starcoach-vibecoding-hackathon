from __future__ import annotations

from dataclasses import dataclass
from importlib.resources import files
from typing import Any, cast

from redis.exceptions import NoScriptError


def _script(name: str) -> str:
    return files("ai_gateway.proxy.enforcement.scripts").joinpath(name).read_text(encoding="utf-8")


@dataclass(slots=True)
class RedisScripts:
    redis: Any
    admit_sha: str | None = None
    reconcile_sha: str | None = None

    async def load(self) -> None:
        self.admit_sha = await self.redis.script_load(_script("admit.lua"))
        self.reconcile_sha = await self.redis.script_load(_script("reconcile.lua"))

    async def eval_admit(self, keys: list[str], args: list[object]) -> list[Any]:
        if self.admit_sha is None:
            await self.load()
        try:
            return cast(list[Any], await self.redis.evalsha(self.admit_sha, len(keys), *keys, *args))
        except NoScriptError:
            self.admit_sha = await self.redis.script_load(_script("admit.lua"))
            return cast(list[Any], await self.redis.evalsha(self.admit_sha, len(keys), *keys, *args))

    async def eval_reconcile(self, keys: list[str], args: list[object]) -> list[Any]:
        if self.reconcile_sha is None:
            await self.load()
        try:
            return cast(list[Any], await self.redis.evalsha(self.reconcile_sha, len(keys), *keys, *args))
        except NoScriptError:
            self.reconcile_sha = await self.redis.script_load(_script("reconcile.lua"))
            return cast(list[Any], await self.redis.evalsha(self.reconcile_sha, len(keys), *keys, *args))
