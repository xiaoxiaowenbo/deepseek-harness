# Agent Note: Explicit all-interfaces bind for the web CLI

Status: implemented

English | [中文](2026-09-10-web-all-interfaces-bind.zh.md)

## Problem

`dsh web` served only loopback: the web-startup provider rejected `--host 0.0.0.0` with a usage error, so an operator who wanted to reach the browser UI from another device on the LAN had no supported path. The carrier already supported the all-interfaces bind (`dsh-host-webserver` accepts `host: '127.0.0.1' | '0.0.0.0'`), and the web runtime already derives LAN IPv4 literals from an all-interfaces bind and feeds them to the `/api` trust fence, but the product CLI gate kept the mode unreachable.

## Decision

`dsh web --host 0.0.0.0` is now an explicit opt-in that binds all interfaces. The web-startup provider publishes the flag value as before and no longer rejects `0.0.0.0`; loopback remains the default when the flag is absent (`ctx.webStartup.host ?? '127.0.0.1'` in the bundle patch). The webserver schema, the LAN-trust derivation ([browser trust](2026-07-28-api-browser-trust-boundary.md)), and the process-token authentication ([browser token authentication](2026-08-24-browser-token-authentication.md)) are unchanged: an all-interfaces bind auto-trusts the machine's LAN IPv4 literals for the Host/Origin fence, prints the `(LAN: http://<ip>:<port>/?token=...)` URL line, and every request still requires the browser token exchange. Non-IP authorities beyond those literals continue to need an explicit `--trusted-host`.

## Alternatives considered

**Default the web CLI to `0.0.0.0`.** Rejected: ordinary same-machine use does not need network-wide reachability and should not acquire it implicitly, and a tool-capable `/api` should not be reachable beyond loopback unless the operator says so. The archived [web-bind-address note](../../archived/feature/2026-07-22-web-bind-address.md) rejected the same default.

**A boolean exposure flag.** Rejected: `--host 0.0.0.0` names the resulting socket behavior directly and matches the underlying server option without introducing a second term.

## Consequences

LAN access is available only to an operator who names it, and the printed LAN URL carries the same process token as the loopback URL. Plaintext HTTP over a network remains the operator's choice: authentication does not imply supported network deployment, TLS, forwarding-header interpretation, or proxy configuration. The two security notes above now state the opt-in instead of the blanket rejection, and remain the authority for the fence and authentication mechanics.
