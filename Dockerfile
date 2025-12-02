FROM caddy:builder AS builder

RUN xcaddy build \
    --with https://github.com/caddy-dns/cloudflare

FROM caddy:latest

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

RUN mkdir /opt/cuddlephish
RUN mkdir /opt/cuddlephish/certs
