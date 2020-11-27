ENGINE_COMMAND := ${shell . ./commands.sh; echo $$ENGINE_COMMAND}

.PHONY: all
all: build

.PHONY: dependencies
dependencies:
	./yarn install

.PHONY: build
build: dependencies
	./hugo --minify
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
	./hugo server --minify --buildDrafts

.PHONY: clean
clean:
	rm -rf ./node_modules/
	rm -rf ./public/
	rm -rf ./resources/_gen/
