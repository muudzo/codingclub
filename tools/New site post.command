#!/bin/zsh
cd -- "${0:A:h}/.." || exit 1
exec ./node_modules/.bin/node tools/composer/launch.mjs
