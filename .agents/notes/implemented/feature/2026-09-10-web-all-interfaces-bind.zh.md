# Agent Note: Web CLI 的显式全网卡绑定

Status: implemented

[English](2026-09-10-web-all-interfaces-bind.md) | 中文

## 问题

`dsh web` 只服务 loopback：web-startup 提供方用用法错误拒绝 `--host 0.0.0.0`，因此希望从局域网内其他设备访问浏览器 UI 的操作者没有受支持的路径。载体层本来就支持全网卡绑定（`dsh-host-webserver` 接受 `host: '127.0.0.1' | '0.0.0.0'`），web 运行时也早已能从全网卡绑定推导 LAN IPv4 字面量并喂给 `/api` 信任栅栏，但产品 CLI 的闸门让该模式无法触达。

## 决策

`dsh web --host 0.0.0.0` 现在是显式加入的全网卡绑定。web-startup 提供方照常发布该 flag 值，不再拒绝 `0.0.0.0`；未指定该 flag 时仍默认 loopback（bundle patch 中的 `ctx.webStartup.host ?? '127.0.0.1'`）。webserver schema、LAN 信任推导（[浏览器信任](2026-07-28-api-browser-trust-boundary.zh.md)）与进程令牌认证（[浏览器令牌认证](2026-08-24-browser-token-authentication.zh.md)）均不变：全网卡绑定会把本机 LAN IPv4 字面量自动加入 Host/Origin 栅栏的可信名单，打印 `(LAN: http://<ip>:<port>/?token=...)` URL 行，每个请求仍必须完成浏览器令牌交换。除这些字面量之外的非 IP authority 继续需要显式 `--trusted-host`。

## 考虑过的替代方案

**把 Web CLI 默认改为 `0.0.0.0`。** 否决：普通的同机使用不需要全网可达，也不应隐式获得这种可达性；带工具能力的 `/api` 不应在操作者未声明的情况下超出 loopback 可达。已归档的 [web-bind-address 笔记](../../archived/feature/2026-07-22-web-bind-address.zh.md) 否决了同样的默认值。

**使用布尔型暴露标志。** 否决：`--host 0.0.0.0` 直接说明最终的 socket 行为，并与底层服务器选项一致，无需引入第二套术语。

## 影响

只有明确点名该模式的操作者才能获得 LAN 访问，且打印的 LAN URL 携带与 loopback URL 相同的进程令牌。经网络传输明文 HTTP 仍是操作者自己的选择：认证不代表支持网络部署、TLS、转发 header 解释或代理配置。上面两篇安全笔记现已把「整体拒绝」改写为「显式加入」，并继续作为栅栏与认证机制的权威。
