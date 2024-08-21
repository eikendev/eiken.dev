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
	mkdir -p ./public/font/mathjax
	cp node_modules/mathjax/es5/output/chtml/fonts/woff-v2/* ./public/font/mathjax/
	./scripts/extract > ./public/allthelinks.txt

.PHONY: server
server: dependencies
	mkdir -p static/font/mathjax
	cp node_modules/mathjax/es5/output/chtml/fonts/woff-v2/* static/font/mathjax/
	$(HUGO) server --minify --buildDrafts

.PHONY: clean
clean:
	rm -rf ./node_modules/
	rm -rf ./public/
	rm -rf ./resources/_gen/
