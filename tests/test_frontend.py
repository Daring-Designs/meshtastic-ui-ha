"""Tests for the Meshtastic UI frontend static file view."""

from __future__ import annotations

from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.meshtastic_ui.const import DOMAIN, FRONTEND_PATH, PANEL_URL
from custom_components.meshtastic_ui.frontend import (
    MeshtasticFrontendView,
    async_register_panel,
)


@pytest.fixture
async def frontend_client(hass: HomeAssistant, hass_client):
    """Register the panel and return an authenticated test client."""
    assert await async_setup_component(hass, "http", {})
    await async_register_panel(hass)
    return await hass_client()


async def test_files_are_served_with_no_cache(frontend_client):
    """Panel JS is served and told to revalidate on every load."""
    resp = await frontend_client.get(f"/{PANEL_URL}/{FRONTEND_PATH}/panel.js")
    assert resp.status == 200
    assert resp.headers["Cache-Control"] == "no-cache"
    assert "javascript" in resp.headers["Content-Type"]
    body = await resp.text()
    assert "meshtastic-ui-panel" in body


async def test_nested_vendor_files_are_served(frontend_client):
    """Files in subdirectories resolve too."""
    resp = await frontend_client.get(f"/{PANEL_URL}/{FRONTEND_PATH}/vendor/lit/lit-element.js")
    assert resp.status == 200
    assert resp.headers["Cache-Control"] == "no-cache"


async def test_unchanged_file_returns_304(frontend_client):
    """A conditional request for an unchanged file is answered with 304."""
    first = await frontend_client.get(f"/{PANEL_URL}/{FRONTEND_PATH}/views.js")
    assert first.status == 200
    etag = first.headers["ETag"]
    second = await frontend_client.get(
        f"/{PANEL_URL}/{FRONTEND_PATH}/views.js", headers={"If-None-Match": etag}
    )
    assert second.status == 304


async def test_missing_file_is_404(frontend_client):
    """Unknown paths return 404 rather than leaking a directory listing."""
    resp = await frontend_client.get(f"/{PANEL_URL}/{FRONTEND_PATH}/nope.js")
    assert resp.status == 404


async def test_path_traversal_is_blocked(hass: HomeAssistant, tmp_path: Path):
    """Requests that resolve outside the served directory are refused."""
    root = tmp_path / "frontend"
    root.mkdir()
    (root / "ok.js").write_text("export const ok = 1;\n")
    (tmp_path / "secret.txt").write_text("nope\n")
    view = MeshtasticFrontendView(root)

    with pytest.raises(Exception) as excinfo:
        await view.get(None, "../secret.txt")
    assert excinfo.value.status == 404

    resp = await view.get(None, "ok.js")
    assert resp.status == 200


async def test_module_url_is_version_stamped(hass: HomeAssistant):
    """The registered panel points at panel.js with the manifest version."""
    assert await async_setup_component(hass, "http", {})
    await async_register_panel(hass)
    panel = hass.data["frontend_panels"][PANEL_URL]
    module_url = panel.config["_panel_custom"]["module_url"]
    assert module_url.startswith(f"/{PANEL_URL}/{FRONTEND_PATH}/panel.js?v=")
    assert not module_url.endswith("?v=")
    assert module_url.split("?v=")[1] == hass.data["integrations"][DOMAIN].version


async def test_register_twice_does_not_raise(hass: HomeAssistant):
    """Reloading the integration must not try to add the route again."""
    assert await async_setup_component(hass, "http", {})
    await async_register_panel(hass)
    await async_register_panel(hass)
