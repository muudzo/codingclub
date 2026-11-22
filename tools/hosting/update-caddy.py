"""Update only this project's marked Caddy block in a candidate config."""
import argparse
from pathlib import Path
import re


def update_caddy(content, public_root, writer=False):
    if not re.fullmatch(r"/[A-Za-z0-9/_.-]+", public_root):
        raise ValueError("Invalid public root")
    serving = "    file_server"
    if writer:
        serving = """    @writer path /write /write/*
    handle @writer {
        reverse_proxy 127.0.0.1:3210
    }
    handle {
        file_server
    }"""
    block = f"""# BEGIN tatendanyemudzo.com
http://tatendanyemudzo.com, http://www.tatendanyemudzo.com {{
    root * {public_root}
    encode zstd gzip
    header {{
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }}
{serving}
    handle_errors {{
        @404 {{
            expression {{http.error.status_code}} == 404
        }}
        rewrite @404 /404.html
        file_server
    }}
}}
# END tatendanyemudzo.com
"""
    pattern = re.compile(r"# BEGIN tatendanyemudzo\.com.*?# END tatendanyemudzo\.com\n?", re.DOTALL)
    if len(pattern.findall(content)) > 1:
        raise ValueError("Multiple managed website blocks found; inspect Caddy manually")
    return pattern.sub(lambda _: block, content) if pattern.search(content) else content.rstrip() + "\n\n" + block


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--writer", action="store_true")
    args = parser.parse_args()
    config = Path(args.config)
    config.write_text(update_caddy(config.read_text(), args.root, args.writer))
