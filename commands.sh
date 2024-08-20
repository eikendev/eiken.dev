HUGO_IMAGE='docker.io/hugomods/hugo:latest'

ENGINE_COMMAND="$(command -v podman 2>/dev/null || command -v docker 2>/dev/null)"

if [ -z "$ENGINE_COMMAND" ]; then
    printf "%s\n" 'Neither Docker nor Podman are available.' >&2
	exit 1
fi

BASE_COMMAND="\
	$ENGINE_COMMAND run \
	--tty \
	--interactive \
	--rm=true \
	--net=host \
	-v '$PWD':/src:Z \
"

YARN_COMMAND="\
	$BASE_COMMAND \
	--entrypoint='yarn' \
	$HUGO_IMAGE \
"

HUGO_COMMAND="\
	$BASE_COMMAND \
	--entrypoint='hugo' \
	$HUGO_IMAGE \
"
