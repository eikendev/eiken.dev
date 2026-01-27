ENGINE_COMMAND := ${shell . ./run; echo $$ENGINE_COMMAND}

HUGO := ./run hugo
YARN := ./run yarn

.PHONY: all
all: build

.PHONY: dependencies
dependencies:
	$(YARN) install

.PHONY: build
build: dependencies
	$(HUGO) --minify
	# If we run using Docker, we should reset file ownership afterwards.
ifneq (,$(findstring docker,${ENGINE_COMMAND}))
	sudo chown -R ${shell id -u ${USER}}:${shell id -g ${USER}} ./public/
endif

.PHONY: server
server: dependencies
	$(HUGO) server --minify --buildDrafts

.PHONY: clean
clean:
	rm -f .hugo_build.lock
	rm -rf ./node_modules/
	rm -rf ./public/
	rm -rf ./resources/_gen/
