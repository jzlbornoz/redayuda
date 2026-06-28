import httpx
from fastapi import HTTPException, status

from .config import Settings
from .models import UpstreamResponse


class HttpClient:
    """Cliente HTTP generico reutilizable por los conectores.

    Centraliza el manejo de errores upstream (timeout -> 504, conexion -> 502,
    status >= 400 -> el detalle del upstream, cuerpo no-texto -> 502).
    """

    def __init__(self, settings):
        self.settings = settings

    async def get_text(self, url, params=None, headers=None):
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.request_timeout_seconds
            ) as client:
                response = await client.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={
                    "ok": False,
                    "error_code": "upstream_timeout",
                    "error": "La API externa no respondio a tiempo.",
                },
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "ok": False,
                    "error_code": "upstream_unavailable",
                    "error": "No se pudo conectar con la API externa.",
                },
            ) from exc

        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code,
                detail=_response_detail(response),
            )

        return response.text

    async def get_json(self, url, params=None, headers=None):
        text = await self.get_text(url, params=params, headers=headers)
        try:
            import json

            return json.loads(text)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "ok": False,
                    "error_code": "upstream_invalid_json",
                    "error": "La API externa devolvio una respuesta invalida.",
                },
            ) from exc


class HospitalesClient:
    def __init__(self, settings):
        self.settings = settings
        self._http = HttpClient(settings)

    async def export_pacientes(self, limit=1000, offset=0, desde=None):
        if not self.settings.hospitales_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "ok": False,
                    "error_code": "api_key_missing",
                    "error": "Configura HOSPITALES_API_KEY para consultar la API externa.",
                },
            )

        params = {
            "limit": limit,
            "offset": offset,
        }
        if desde is not None:
            params["desde"] = desde.isoformat().replace("+00:00", "Z")

        headers = {"x-api-key": self.settings.hospitales_api_key}

        text = await self._http.get_text(
            self.settings.upstream_url, params=params, headers=headers
        )

        try:
            return UpstreamResponse.model_validate_json(text)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "ok": False,
                    "error_code": "upstream_invalid_json",
                    "error": "La API externa devolvio una respuesta invalida.",
                },
            ) from exc


def _response_detail(response):
    try:
        return response.json()
    except ValueError:
        return {
            "ok": False,
            "error_code": "upstream_error",
            "error": response.text or "Error de la API externa.",
        }
