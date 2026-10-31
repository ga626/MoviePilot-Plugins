"""只装配本地解析所需的空自定义词配置；仍运行宿主真实 SDK parser。"""
from types import SimpleNamespace

import pytest


@pytest.fixture(autouse=True)
def parser_runtime_config(monkeypatch):
    from app.application import configuration
    from app.domain.metainfo import clear_rust_parse_options_cache
    from tests.v3.mediagovernor.test_v5 import G
    monkeypatch.setattr(configuration, "_configured_system_config", SimpleNamespace(get=lambda _key: None))
    clear_rust_parse_options_cache()
    G.parsed_name.cache_clear()
    yield
    clear_rust_parse_options_cache()
    G.parsed_name.cache_clear()
