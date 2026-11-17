# Caddy with the Cloudflare DNS plugin, for DNS-01 certificates on a LAN-only host.
FROM caddy:2.11.6-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2.11.6
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
