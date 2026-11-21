#!/bin/sh
set -eu
umask 077

project=${1:?SharedSpace directory is required}
lineage=${RENEWED_LINEAGE:?Certbot certificate directory is required}

case "$lineage" in
    /etc/letsencrypt/live/shared-space.ru) target="$project/nginx/certs" ;;
    /etc/letsencrypt/live/office.shared-space.ru) target="$project/nginx/certs/office" ;;
    *) exit 0 ;;
esac

cd "$project"
install -d -m 0755 "$target"
exec 9>/run/lock/sharedspace-tls.lock
flock 9

staging="$(mktemp -d "$target/.certbot.XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
install -m 0644 "$lineage/fullchain.pem" "$staging/fullchain.pem"
install -m 0600 "$lineage/privkey.pem" "$staging/privkey.pem"
for file in fullchain.pem privkey.pem; do
    if [ -f "$target/$file" ]; then
        cp -p "$target/$file" "$staging/$file.previous"
    fi
done

if mv -f "$staging/fullchain.pem" "$target/fullchain.pem" &&
   mv -f "$staging/privkey.pem" "$target/privkey.pem" &&
   docker compose -f docker-compose.yml exec -T nginx nginx -t &&
   docker compose -f docker-compose.yml exec -T nginx nginx -s reload; then
    exit 0
fi

for file in fullchain.pem privkey.pem; do
    if [ -f "$staging/$file.previous" ]; then
        mv -f "$staging/$file.previous" "$target/$file"
    else
        rm -f "$target/$file"
    fi
done
exit 1
