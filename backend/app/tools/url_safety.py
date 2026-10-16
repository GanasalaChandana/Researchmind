"""SSRF protection: only allow outbound requests to public internet hosts.

Used by the page reader (URLs come from search results) and webhook delivery
(URLs come from users). Blocks loopback, private, link-local (incl. cloud
metadata 169.254.169.254), reserved and multicast addresses.

Note: resolution happens before the request, so a DNS-rebinding attacker could
still race the check. For stronger guarantees, pin the resolved IP in the
transport or run outbound fetches through an egress proxy.
"""
import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "metadata.google.internal"}


def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _parse(url: str):
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if parsed.username or parsed.password:
        return None
    return parsed


def is_public_url_literal(url: str) -> bool:
    """Cheap, DNS-free check: rejects bad schemes, credentials, localhost and
    private/loopback IP literals. Use for validating input at registration time."""
    parsed = _parse(url)
    if parsed is None:
        return False
    host = parsed.hostname.lower().rstrip(".")
    if host in _BLOCKED_HOSTNAMES or host.endswith(".localhost") or host.endswith(".internal"):
        return False
    try:
        return _ip_is_public(ipaddress.ip_address(host))
    except ValueError:
        return True  # a hostname; resolved and checked at request time


async def is_safe_public_url(url: str) -> bool:
    """Full check: literal rules plus every resolved address must be public."""
    if not is_public_url_literal(url):
        return False
    parsed = _parse(url)
    host = parsed.hostname
    try:
        ipaddress.ip_address(host)
        return True  # literal already validated above
    except ValueError:
        pass
    try:
        loop = asyncio.get_running_loop()
        infos = await loop.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80),
                                       type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError):
        return False
    if not infos:
        return False
    return all(_ip_is_public(ipaddress.ip_address(info[4][0])) for info in infos)
