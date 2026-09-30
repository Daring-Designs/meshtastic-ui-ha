"""Frontend panel registration for Meshtastic UI."""

from __future__ import annotations

from pathlib import Path

from aiohttp import web
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import HomeAssistantView
from homeassistant.loader import async_get_integration

from .const import DOMAIN, FRONTEND_PATH, PANEL_ICON, PANEL_TITLE, PANEL_URL
from .ha_frontend import locate_dir

_VIEW_REGISTERED_KEY = f"{DOMAIN}_frontend_view_registered"


class MeshtasticFrontendView(HomeAssistantView):
    """Serve the panel's static files with revalidation on every load.

    HA's built-in static path helper either sends a 31-day max-age or no
    Cache-Control header at all. With no header, browsers fall back to
    heuristic caching keyed on the file's mtime, and HACS extracts release
    zips with old timestamps, so users kept running stale panel JS after an
    update until they hard-refreshed. ``no-cache`` makes the browser send a
    conditional request each load; unchanged files come back as a cheap 304.
    """

    url = f"/{PANEL_URL}/{FRONTEND_PATH}/{{filename:.+}}"
    name = f"{DOMAIN}:frontend"
    requires_auth = False

    def __init__(self, root: Path) -> None:
        """Initialize with the directory to serve from."""
        self._root = root.resolve()

    async def get(self, request: web.Request, filename: str) -> web.StreamResponse:
        """Return the requested file, refusing anything outside the root."""
        target = (self._root / filename).resolve()
        if not target.is_relative_to(self._root) or not target.is_file():
            raise web.HTTPNotFound
        return web.FileResponse(target, headers={"Cache-Control": "no-cache"})


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the Meshtastic UI panel."""
    frontend_dir = locate_dir()

    # Routes can't be removed from the router, so register the view once per
    # HA run and let reloads reuse it.
    if not hass.data.get(_VIEW_REGISTERED_KEY):
        hass.http.register_view(MeshtasticFrontendView(frontend_dir))
        hass.data[_VIEW_REGISTERED_KEY] = True

    # Remove stale panel from a previous (possibly failed) setup.
    try:
        async_remove_panel(hass, PANEL_URL)
    except KeyError:
        pass

    # Version-stamp the entry module so every release forces a fresh fetch
    # of panel.js, even through proxies that ignore Cache-Control.
    integration = await async_get_integration(hass, DOMAIN)
    module_url = f"/{PANEL_URL}/{FRONTEND_PATH}/panel.js?v={integration.version}"

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL,
        config={
            "_panel_custom": {
                "name": "meshtastic-ui-panel",
                "module_url": module_url,
            }
        },
        require_admin=False,
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the panel."""
    async_remove_panel(hass, PANEL_URL)
