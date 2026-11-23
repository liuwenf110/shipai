#!/bin/bash
# 只做一次：把 /shipai/ 的 location 装到 nginx，并允许用户级 systemd 服务开机自启
set -e

install -o root -g root -m 644 /home/tuoniao/shipai.locations.conf /etc/nginx/shipai.locations.conf

if ! grep -q "shipai.locations.conf" /etc/nginx/manban.conf; then
  cat >> /etc/nginx/manban.conf <<'EOF'

# 厂派（shipai）：/shipai/ 子路径反代到本机 3010
include /etc/nginx/shipai.locations.conf;
EOF
fi

nginx -t
systemctl reload nginx
loginctl enable-linger tuoniao
echo "nginx-ok"
