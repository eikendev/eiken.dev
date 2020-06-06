CONTAINER_COMMAND := ${shell command -v podman 2>/dev/null || command -v docker 2>/dev/null}

HUGO_IMAGE := klakegg/hugo:ext
HUGO_PORT := 1313
HUGO_COMMAND := \
	${CONTAINER_COMMAND} run \
	--tty \
	--interactive \
	--rm=true \
	-p ${HUGO_PORT}:${HUGO_PORT} \
	-v "${PWD}":/src \
	--security-opt label=disable \
	${HUGO_IMAGE}

.PHONY: all
all: build

.PHONY: check
check:
ifndef CONTAINER_COMMAND
    $(error "Neither Docker nor Podman could be found.")
endif

.PHONY: build
build: check
	${HUGO_COMMAND} --minify
	mkdir -p public/font/mathjax
	cp node_modules/mathjax/es5/output/chtml/fonts/woff-v2/* public/font/mathjax/

.PHONY: server
server: check
	mkdir -p static/font/mathjax
	cp node_modules/mathjax/es5/output/chtml/fonts/woff-v2/* static/font/mathjax/
	${HUGO_COMMAND} server --minify --buildDrafts

.PHONY: clean
clean:
	rm -rf ./public/
	rm -rf ./resources/_gen/
