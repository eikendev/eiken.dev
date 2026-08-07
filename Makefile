ENGINE_COMMAND := ${shell . ./run; echo $$ENGINE_COMMAND}

HUGO := ./run hugo
NPM := ./run npm

# Chroma highlighting styles. `make syntax` regenerates the two theme files
# imported by assets/css/main.css. Override on the command line to try others,
# e.g. `make syntax CHROMA_DARK=catppuccin-mocha CHROMA_LIGHT=catppuccin-latte`.
CHROMA_DARK := github-dark
CHROMA_LIGHT := github

.PHONY: all
all: build

.PHONY: dependencies
dependencies:
	$(NPM) install

# Regenerate the syntax highlighting themes. chroma-light is wrapped in
# `.light { … }` so native CSS nesting scopes it to light mode. Both files are
# gitignored build artifacts.
.PHONY: syntax
syntax:
	$(HUGO) gen chromastyles --style=$(CHROMA_DARK) > assets/css/chroma-dark.css
	printf '.light {\n' > assets/css/chroma-light.css
	$(HUGO) gen chromastyles --style=$(CHROMA_LIGHT) >> assets/css/chroma-light.css
	printf '}\n' >> assets/css/chroma-light.css

.PHONY: build
build: dependencies syntax
	$(HUGO) --minify
	# If we run using Docker, we should reset file ownership afterwards.
ifneq (,$(findstring docker,${ENGINE_COMMAND}))
	sudo chown -R ${shell id -u ${USER}}:${shell id -g ${USER}} ./public/
endif

.PHONY: server
server: dependencies syntax
	$(HUGO) server --minify --buildDrafts

# Format templates (Go-template-aware), CSS and JS with Prettier.
.PHONY: format
format: dependencies syntax
	$(NPM) run format

.PHONY: format-check
format-check: dependencies syntax
	$(NPM) run format:check

.PHONY: validate-html
validate-html: build
	$(NPM) run test:html

.PHONY: audit
audit:
	$(NPM) audit --audit-level=high

.PHONY: test
test: format-check audit validate-html

.PHONY: clean
clean:
	rm -f .hugo_build.lock
	rm -f assets/css/chroma-dark.css assets/css/chroma-light.css
	rm -rf ./node_modules/
	rm -rf ./public/
	rm -rf ./resources/_gen/
